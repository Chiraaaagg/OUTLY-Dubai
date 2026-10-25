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
import { cleanupBusinessRows, db, forbidNetwork, makeInquiry, makeOrder, publishedProduct, type InquiryFixture } from "./_mercury-fixtures";

/**
 * H10 / G01 — customer A vs customer B on every `/api/me/*` route, through
 * the real handlers and the disposable database.
 *
 * Identity comes only from the httpOnly session cookie (customer-auth-contract
 * §3), so the attack surface is (a) reads that select by phone as well as by
 * customer id, (b) projections that might carry staff-only fields, and (c)
 * bodies that try to name another customer. Each refusal is followed by a
 * check that B's rows did not change.
 */

const run = runId();
/** Context argument for routes without dynamic segments. */
const NO_CTX = params({});
let A: CustomerFixture;
let B: CustomerFixture;
let agent: StaffFixture;
let invA: InquiryFixture;
let invB: InquiryFixture;
let invBUnlinked: InquiryFixture;
let invOldOwner: InquiryFixture;
let orderA: { id: string; reference: string };
let orderB: { id: string; reference: string };
let orderOldOwner: { id: string; reference: string };
const STAFF_NOTE = `STAFF-ONLY-${run}`;

const me = () => import("@/app/api/me/route");
const meInquiries = () => import("@/app/api/me/inquiries/route");
const meOrders = () => import("@/app/api/me/orders/route");
const meExport = () => import("@/app/api/me/export/route");
const mePrefs = () => import("@/app/api/me/preferences/route");
const meDelete = () => import("@/app/api/me/delete-request/route");

async function bRowsSnapshot() {
  const prisma = await db();
  const [customer, consents, audits] = await Promise.all([
    prisma.customer.findUnique({ where: { id: B.id } }),
    prisma.consent.count({ where: { phoneE164: B.phoneE164 } }),
    prisma.auditLog.count({ where: { entityId: B.id } }),
  ]);
  return JSON.stringify({ customer, consents, audits });
}

describe.skipIf(!dbEnabled)("customer /api/me/* ownership (H10, G01)", () => {
  beforeAll(async () => {
    assertDisposableDb();
    forbidNetwork();
    A = await createCustomer(run, syntheticPhone(run, 61));
    B = await createCustomer(run, syntheticPhone(run, 62));
    agent = await createStaff(run, "cust-agent", ["agent"]);
    const product = await publishedProduct();
    invA = await makeInquiry(run, { leadPhone: A.phoneE164, customerId: A.id, assignedAgentId: agent.id, product, label: "cust-a" });
    invB = await makeInquiry(run, { leadPhone: B.phoneE164, customerId: B.id, product, label: "cust-b" });
    // Made with B's phone before B signed in: B's by the verified phone.
    invBUnlinked = await makeInquiry(run, { leadPhone: B.phoneE164, product, label: "cust-b-unlinked" });
    // History of a previous holder of A's number, already linked to that other
    // account (B stands in for it). linkByPhone deliberately never moves such
    // rows; the read paths must not surface them to A either.
    invOldOwner = await makeInquiry(run, { leadPhone: A.phoneE164, customerId: B.id, product, label: "old-owner" });
    orderA = await makeOrder(run, { leadPhone: A.phoneE164, customerId: A.id, label: "order-a", sourceInquiryId: invA.id });
    orderB = await makeOrder(run, { leadPhone: B.phoneE164, customerId: B.id, label: "order-b" });
    orderOldOwner = await makeOrder(run, { leadPhone: A.phoneE164, customerId: B.id, label: "order-old-owner" });
    const prisma = await db();
    await prisma.inquiryEvent.create({ data: { inquiryId: invA.id, kind: "note", actorType: "agent", actorId: agent.id, note: STAFF_NOTE } });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await cleanupBusinessRows(run);
    await cleanupPeople(run);
  });

  it("anonymous callers get 401 on every /api/me route and nothing is written", async () => {
    const before = await bRowsSnapshot();
    const calls: Promise<Response>[] = [
      (async () => (await me()).PATCH(apiRequest("/api/me", { method: "PATCH", body: { fullName: "x" } }), NO_CTX))(),
      (async () => (await meInquiries()).GET(apiRequest("/api/me/inquiries"), NO_CTX))(),
      (async () => (await meOrders()).GET(apiRequest("/api/me/orders"), NO_CTX))(),
      (async () => (await meExport()).GET(apiRequest("/api/me/export"), NO_CTX))(),
      (async () => (await mePrefs()).GET(apiRequest("/api/me/preferences"), NO_CTX))(),
      (async () => (await mePrefs()).PUT(apiRequest("/api/me/preferences", { method: "PUT", body: { whatsappTransactional: false, whatsappMarketing: true, email: false } }), NO_CTX))(),
      (async () => (await meDelete()).POST(apiRequest("/api/me/delete-request", { body: {} }), NO_CTX))(),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
    expect(await bRowsSnapshot()).toBe(before);
  });

  it("a revoked session and an expired session both get 401", async () => {
    const prisma = await db();
    const revoked = await createCustomer(run, syntheticPhone(run, 63));
    const expired = await createCustomer(run, syntheticPhone(run, 64));
    await prisma.customerSession.update({ where: { id: revoked.sessionId }, data: { revokedAt: new Date() } });
    await prisma.customerSession.update({ where: { id: expired.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const { GET } = await meInquiries();
    expect((await GET(apiRequest("/api/me/inquiries", { cookie: revoked.cookie }), NO_CTX)).status).toBe(401);
    expect((await GET(apiRequest("/api/me/inquiries", { cookie: expired.cookie }), NO_CTX)).status).toBe(401);
    // A soft-deleted (anonymised) customer's still-live session is refused too.
    const gone = await createCustomer(run, syntheticPhone(run, 65));
    await prisma.customer.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    expect((await GET(apiRequest("/api/me/inquiries", { cookie: gone.cookie }), NO_CTX)).status).toBe(401);
  });

  it("GET /api/me/inquiries: A sees A's inquiries only, in the customer projection", async () => {
    const { GET } = await meInquiries();
    const res = await GET(apiRequest("/api/me/inquiries", { cookie: A.cookie }), NO_CTX);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    const refs = body.items.map((i: { reference: string }) => i.reference);
    expect(refs).toContain(invA.reference);
    expect(refs).not.toContain(invB.reference);
    expect(refs).not.toContain(invBUnlinked.reference);
    expect(refs, "a row already linked to another account must not follow the phone").not.toContain(invOldOwner.reference);
    const text = JSON.stringify(body);
    expect(text).not.toContain(B.phoneE164);
    expect(text).not.toContain(STAFF_NOTE);
    expect(text).not.toMatch(/spamSignals|attribution|ipHash|userAgent|"email":"zz-sec-[^"]*agent/);
    const mine = body.items.find((i: { reference: string }) => i.reference === invA.reference);
    expect(mine.agent?.email).toBeUndefined();
    expect(mine).not.toHaveProperty("events");
    expect(mine).not.toHaveProperty("notifications");
    expect(mine).not.toHaveProperty("history");
  });

  it("GET /api/me/inquiries: B sees B's linked and phone-matched rows, never A's", async () => {
    const { GET } = await meInquiries();
    const body = await (await GET(apiRequest("/api/me/inquiries", { cookie: B.cookie }), NO_CTX)).json();
    const refs = body.items.map((i: { reference: string }) => i.reference);
    expect(refs).toEqual(expect.arrayContaining([invB.reference, invBUnlinked.reference, invOldOwner.reference]));
    expect(refs).not.toContain(invA.reference);
  });

  it("GET /api/me/orders: A sees A's orders only, without net cost or payment rows", async () => {
    const { GET } = await meOrders();
    const res = await GET(apiRequest("/api/me/orders", { cookie: A.cookie }), NO_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    const refs = body.items.map((o: { reference: string }) => o.reference);
    expect(refs).toContain(orderA.reference);
    expect(refs).not.toContain(orderB.reference);
    expect(refs, "an order already linked to another account must not follow the phone").not.toContain(orderOldOwner.reference);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/netCost|payments|gatewayPaymentId|pay_|attribution|leadPhone|leadEmail/);
    expect(body.items.find((o: { reference: string }) => o.reference === orderA.reference).sourceInquiryReference).toBe(invA.reference);
  });

  it("PATCH /api/me cannot name another customer: unknown keys are refused and B is unchanged", async () => {
    const before = await bRowsSnapshot();
    const { PATCH } = await me();
    for (const body of [{ id: B.id, fullName: "Hijack" }, { customerId: B.id, fullName: "Hijack" }, { phoneE164: B.phoneE164 }]) {
      const res = await PATCH(apiRequest("/api/me", { method: "PATCH", cookie: A.cookie, body }), NO_CTX);
      expect(res.status).toBe(422);
    }
    expect(await bRowsSnapshot()).toBe(before);
  });

  it("PATCH /api/me changes the caller only, and is audited as the caller", async () => {
    const before = await bRowsSnapshot();
    const { PATCH } = await me();
    const res = await PATCH(apiRequest("/api/me", { method: "PATCH", cookie: A.cookie, body: { hotel: "Hotel A2" } }), NO_CTX);
    expect(res.status).toBe(200);
    expect((await res.json()).customer).toMatchObject({ id: A.id, hotel: "Hotel A2" });
    const prisma = await db();
    expect((await prisma.customer.findUnique({ where: { id: A.id } }))?.hotel).toBe("Hotel A2");
    expect(await prisma.auditLog.count({ where: { entityId: A.id, action: "customer.profile_updated", actorType: "customer" } })).toBe(1);
    expect(await bRowsSnapshot()).toBe(before);
  });

  it("PUT /api/me/preferences writes consent rows for the caller's phone only", async () => {
    const before = await bRowsSnapshot();
    const prisma = await db();
    const aBefore = await prisma.consent.count({ where: { phoneE164: A.phoneE164 } });
    const { PUT, GET } = await mePrefs();
    const res = await PUT(apiRequest("/api/me/preferences", { method: "PUT", cookie: A.cookie, body: { whatsappTransactional: true, whatsappMarketing: true, email: true } }), NO_CTX);
    expect(res.status).toBe(200);
    expect(await prisma.consent.count({ where: { phoneE164: A.phoneE164 } })).toBe(aBefore + 1);
    expect(await bRowsSnapshot()).toBe(before);
    const bPrefs = await (await GET(apiRequest("/api/me/preferences", { cookie: B.cookie }), NO_CTX)).json();
    expect(bPrefs.whatsappMarketing).toBe(false);
    // Body naming B is refused outright.
    const forged = await PUT(apiRequest("/api/me/preferences", { method: "PUT", cookie: A.cookie, body: { whatsappTransactional: true, whatsappMarketing: false, email: true, phoneE164: B.phoneE164 } }), NO_CTX);
    expect(forged.status).toBe(422);
    expect(await bRowsSnapshot()).toBe(before);
  });

  it("writes without a same-site Origin are refused before the session is used", async () => {
    const before = await bRowsSnapshot();
    const { PATCH } = await me();
    const res = await PATCH(apiRequest("/api/me", { method: "PATCH", cookie: B.cookie, origin: "https://evil.example", body: { fullName: "csrf" } }), NO_CTX);
    expect(res.status).toBe(403);
    expect(await bRowsSnapshot()).toBe(before);
  });
});
