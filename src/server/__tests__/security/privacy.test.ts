import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  assertDisposableDb,
  cleanupPeople,
  createCustomer,
  createStaff,
  dbEnabled,
  params,
  runId,
  syntheticPhone,
  type CustomerFixture,
  type StaffFixture,
} from "../helpers/fixtures";
import { uuidv7 } from "../../lib/ids";
import { cleanupBusinessRows, db, forbidNetwork, leadTag, makeInquiry, makeOrder, publishedProduct, type InquiryFixture } from "./_mercury-fixtures";

/**
 * G06 — DPDP access and deletion, against the documented contract:
 *   - impl/customer-auth-contract.md §2–3 and impl/customer-auth.md: export is
 *     `{ exportedAt, customer, preferences, inquiries, orders, consents }`, the
 *     customer projection only, audited `customer.data_exported`, sent as an
 *     attachment; deletion request = audit row + ops email, nothing deleted.
 *   - impl/database.md §5: `privacy.repo.anonymiseByPhone` anonymises PII in
 *     inquiries / orders / guests, keeps money, payments, consents and audit
 *     rows, suppresses the number, and never writes the phone to the audit row.
 * Disposable customers only.
 */

const run = runId();
const NO_CTX = params({});
let A: CustomerFixture;
let B: CustomerFixture;
let agent: StaffFixture;
let invA: InquiryFixture;
let invB: InquiryFixture;
let orderA: { id: string; reference: string };
const STAFF_NOTE = `STAFF-NOTE-${run}`;
const phones: string[] = [];

describe.skipIf(!dbEnabled)("privacy: export and deletion (G06)", () => {
  beforeAll(async () => {
    assertDisposableDb();
    forbidNetwork();
    phones.push(syntheticPhone(run, 71), syntheticPhone(run, 72), syntheticPhone(run, 73));
    A = await createCustomer(run, phones[0]);
    B = await createCustomer(run, phones[1]);
    agent = await createStaff(run, "priv-agent", ["agent"]);
    const product = await publishedProduct();
    invA = await makeInquiry(run, { leadPhone: A.phoneE164, customerId: A.id, assignedAgentId: agent.id, product, label: "priv-a" });
    invB = await makeInquiry(run, { leadPhone: B.phoneE164, customerId: B.id, product, label: "priv-b" });
    orderA = await makeOrder(run, { leadPhone: A.phoneE164, customerId: A.id, label: "priv-order-a", sourceInquiryId: invA.id });
    const prisma = await db();
    await prisma.inquiryEvent.create({ data: { inquiryId: invA.id, kind: "note", actorType: "agent", actorId: agent.id, note: STAFF_NOTE } });
    await prisma.consent.create({ data: { id: uuidv7(), phoneE164: A.phoneE164, channel: "whatsapp", purpose: "marketing", granted: true, source: "inquiry_form", evidence: { test: run } } });
    await prisma.consent.create({ data: { id: uuidv7(), phoneE164: B.phoneE164, channel: "whatsapp", purpose: "marketing", granted: true, source: "inquiry_form", evidence: { test: run } } });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    const prisma = await db();
    await cleanupBusinessRows(run);
    // anonymiseByPhone rewrites lead_name to a marker; those rows are no longer tagged.
    await prisma.suppressedPhone.deleteMany({ where: { phoneE164: { in: phones } } });
    await prisma.notification.deleteMany({ where: { event: "ACCOUNT_DELETION_REQUEST", payload: { path: ["customerId"], equals: A.id } } });
    await cleanupPeople(run);
  });

  describe("GET /api/me/export", () => {
    it("returns the caller's data only, as a no-store attachment, and audits the export", async () => {
      const { GET } = await import("@/app/api/me/export/route");
      const res = await GET(apiRequest("/api/me/export", { cookie: A.cookie }), NO_CTX);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="outlyy-account-\d{4}-\d{2}-\d{2}\.json"$/);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["consents", "customer", "exportedAt", "inquiries", "orders", "preferences"]);
      expect(body.customer.id).toBe(A.id);
      expect(body.inquiries.map((i: { reference: string }) => i.reference)).toEqual([invA.reference]);
      expect(body.orders.map((o: { reference: string }) => o.reference)).toEqual([orderA.reference]);
      expect(body.consents.length).toBe(1);

      const text = JSON.stringify(body);
      expect(text).not.toContain(B.phoneE164);
      expect(text).not.toContain(B.id);
      expect(text).not.toContain(invB.reference);
      // Internal data is not part of the customer's export (contract §3: no agent notes,
      // ops timers' internals, net cost or payment instruments).
      expect(text).not.toContain(STAFF_NOTE);
      expect(text).not.toMatch(/spamSignals|attribution|ipHash|userAgent|netCost|gatewayPaymentId|pay_|tokenHash|sessionId/);
      expect(text).not.toContain(agent.email);

      const prisma = await db();
      expect(await prisma.auditLog.count({ where: { entityId: A.id, action: "customer.data_exported", actorType: "customer", actorId: A.id } })).toBe(1);
    });

    it("anonymous export is 401 and writes no audit row", async () => {
      const prisma = await db();
      const before = await prisma.auditLog.count({ where: { action: "customer.data_exported" } });
      const { GET } = await import("@/app/api/me/export/route");
      const res = await GET(apiRequest("/api/me/export"), NO_CTX);
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.text()).not.toContain("+91");
      expect(await prisma.auditLog.count({ where: { action: "customer.data_exported" } })).toBe(before);
    });
  });

  describe("POST /api/me/delete-request", () => {
    it("records the request for the caller, deletes nothing, and keeps the session", async () => {
      const prisma = await db();
      const before = {
        customer: await prisma.customer.findUnique({ where: { id: A.id } }),
        inquiry: await prisma.inquiry.findUnique({ where: { id: invA.id } }),
        order: await prisma.order.findUnique({ where: { id: orderA.id } }),
      };
      const { POST } = await import("@/app/api/me/delete-request/route");
      const res = await POST(apiRequest("/api/me/delete-request", { cookie: A.cookie, body: { reason: "please remove me" } }), NO_CTX);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      const row = await prisma.auditLog.findFirst({ where: { entityId: A.id, action: "customer.deletion_requested" } });
      expect(row).toMatchObject({ actorType: "customer", actorId: A.id, reason: "please remove me" });
      // No PII in the audit row's after-image.
      expect(JSON.stringify(row?.after)).not.toMatch(/\+91|@|zz-sec/);
      expect(await prisma.auditLog.count({ where: { entityId: B.id, action: "customer.deletion_requested" } })).toBe(0);

      // Nothing is deleted or anonymised by the request itself.
      expect(await prisma.customer.findUnique({ where: { id: A.id } })).toEqual(before.customer);
      expect(await prisma.inquiry.findUnique({ where: { id: invA.id } })).toEqual(before.inquiry);
      expect(await prisma.order.findUnique({ where: { id: orderA.id } })).toEqual(before.order);
      const { GET } = await import("@/app/api/me/inquiries/route");
      expect((await GET(apiRequest("/api/me/inquiries", { cookie: A.cookie }), NO_CTX)).status).toBe(200);
    });

    it("a malformed or oversized body is refused (422) and nothing is recorded", async () => {
      const prisma = await db();
      const before = await prisma.auditLog.count({ where: { entityId: B.id, action: "customer.deletion_requested" } });
      const { POST } = await import("@/app/api/me/delete-request/route");
      expect((await POST(apiRequest("/x", { cookie: B.cookie, rawBody: "{not json", contentType: "application/json" }), NO_CTX)).status).toBe(422);
      expect((await POST(apiRequest("/x", { cookie: B.cookie, body: { reason: "x".repeat(501) } }), NO_CTX)).status).toBe(422);
      expect((await POST(apiRequest("/x", { cookie: B.cookie, body: { reason: "ok", customerId: A.id } }), NO_CTX)).status).toBe(422);
      expect(await prisma.auditLog.count({ where: { entityId: B.id, action: "customer.deletion_requested" } })).toBe(before);
    });

    it("anonymous and cross-site requests are refused", async () => {
      const { POST } = await import("@/app/api/me/delete-request/route");
      expect((await POST(apiRequest("/x", { body: {} }), NO_CTX)).status).toBe(401);
      expect((await POST(apiRequest("/x", { cookie: B.cookie, origin: "https://evil.example", body: {} }), NO_CTX)).status).toBe(403);
    });
  });

  describe("anonymiseByPhone (the ops step behind a deletion request)", () => {
    it("scrubs PII, keeps money, payments, consents and audit history, suppresses the number, and never stores the phone in the audit row", async () => {
      const prisma = await db();
      const { anonymiseByPhone } = await import("../../repositories/privacy.repo");
      const C = await createCustomer(run, phones[2]);
      const product = await publishedProduct();
      const invC = await makeInquiry(run, { leadPhone: C.phoneE164, customerId: C.id, product, label: "priv-c" });
      const orderC = await makeOrder(run, { leadPhone: C.phoneE164, customerId: C.id, label: "priv-order-c", sourceInquiryId: invC.id });
      await prisma.consent.create({ data: { id: uuidv7(), phoneE164: C.phoneE164, channel: "whatsapp", purpose: "transactional", granted: true, source: "inquiry_form", evidence: { test: run } } });
      const paymentsBefore = await prisma.payment.findMany({ where: { orderId: orderC.id } });

      const result = await anonymiseByPhone(C.phoneE164, agent.id);
      expect(result).toMatchObject({ inquiries: 1, orders: 1, guests: 1, suppressed: true });

      const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: invC.id } });
      expect(inq.leadPhone).toMatch(/^\[deleted-[0-9a-f]{12}\]$/);
      expect(inq.leadName).toBe(inq.leadPhone);
      expect(inq).toMatchObject({ leadEmail: null, hotel: null, specialRequests: null, attribution: null, ipHash: null, userAgent: null });
      expect(inq.indicativeTotalInr).toBe(1_000_000n);
      const ord = await prisma.order.findUniqueOrThrow({ where: { id: orderC.id } });
      expect(ord).toMatchObject({ leadEmail: null, hotel: null, totalInr: 777_700n });
      expect(ord.leadPhone).toBe(inq.leadPhone);
      expect(await prisma.payment.findMany({ where: { orderId: orderC.id } })).toEqual(paymentsBefore);
      expect(await prisma.consent.count({ where: { phoneE164: C.phoneE164 } })).toBe(1);
      expect(await prisma.suppressedPhone.findUnique({ where: { phoneE164: C.phoneE164 } })).not.toBeNull();
      const auditRow = await prisma.auditLog.findFirstOrThrow({ where: { action: "privacy.anonymise", entityId: inq.leadPhone } });
      expect(JSON.stringify(auditRow, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(C.phoneE164);

      // Re-tag the anonymised rows so afterAll can clean them up.
      await prisma.inquiry.update({ where: { id: invC.id }, data: { leadName: `${leadTag(run)} anonymised` } });
      await prisma.order.update({ where: { id: orderC.id }, data: { leadName: `${leadTag(run)} anonymised` } });

      // DOCUMENTED GAP (reported, not invented here): impl/database.md §5 predates
      // customer accounts. The `customers` row (phone, name, email, hotel) and its
      // live sessions are not touched, and the rows stay linked by customer_id, so
      // the person can still sign in and read the anonymised history.
      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: C.id } });
      expect(customer.phoneE164).toBe(C.phoneE164);
      expect(customer.deletedAt).toBeNull();
      const { GET } = await import("@/app/api/me/inquiries/route");
      expect((await GET(apiRequest("/api/me/inquiries", { cookie: C.cookie }), NO_CTX)).status).toBe(200);
    });
  });
});
