import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  assertDisposableDb,
  cleanupPeople,
  createStaff,
  dbEnabled,
  params,
  runId,
  syntheticPhone,
  type StaffFixture,
} from "../helpers/fixtures";
import {
  auditCount,
  cleanupBusinessRows,
  db,
  forbidNetwork,
  inquirySnapshot,
  makeInquiry,
  publishedProduct,
  type InquiryFixture,
  type SeedProduct,
} from "./_mercury-fixtures";

/**
 * H07 / H10 / G03 — staff object permissions on the agent inquiry routes and
 * the admin users / settings / reports / audit routes, exercised through the
 * real route handlers against the disposable database.
 *
 * Policy under test (docs/backend/09-agent-console.md §4, permissions.ts):
 *   - reads: `inquiries.view_all` is intentional — every agent may read every
 *     inquiry; `inquiries.view_own` alone is limited to the assigned agent;
 *   - writes: `assertCanUpdate` / `assertCanModerate` — leads/ops (holding
 *     `inquiries.assign`) anywhere, agents only on inquiries assigned to them;
 *   - notes (user decision "Allow collaboration", 2026-10-25): anyone who can
 *     view the inquiry and holds `inquiries.update` may add an append-only,
 *     audited note, including on another agent's inquiry;
 *   - contact PII (full phone, email) only with `customers.view_pii`.
 * Every refusal is checked against a before/after snapshot of the inquiry
 * (row, items, timeline length, orders, suppression).
 */

const run = runId();
/** Context argument for routes without dynamic segments. */
const NO_CTX = params({});

type Role = "agent" | "agent_lead" | "ops" | "admin" | "finance" | "content" | "readonly";
const staff = {} as Record<"agentA" | "agentB" | "lead" | "ops" | "admin" | "finance" | "content" | "readonly" | "suspended" | "downgraded", StaffFixture>;
let product: SeedProduct;
let invA: InquiryFixture;
let invB: InquiryFixture;
let invLead: InquiryFixture;
const phones: string[] = [];

const inquiryRoute = () => import("@/app/api/agent/inquiries/[id]/route");
const notesRoute = () => import("@/app/api/agent/inquiries/[id]/notes/route");
const statusRoute = () => import("@/app/api/agent/inquiries/[id]/status/route");
const itemRoute = () => import("@/app/api/agent/inquiries/[id]/items/[itemId]/route");
const contactRoute = () => import("@/app/api/agent/inquiries/[id]/contact/route");
const spamRoute = () => import("@/app/api/agent/inquiries/[id]/spam/route");
const convertRoute = () => import("@/app/api/agent/inquiries/[id]/convert/route");
const unassignRoute = () => import("@/app/api/agent/inquiries/[id]/unassign/route");
const assignRoute = () => import("@/app/api/agent/inquiries/[id]/assign/route");
const claimRoute = () => import("@/app/api/agent/inquiries/[id]/claim/route");
const listRoute = () => import("@/app/api/agent/inquiries/route");

async function getDetail(who: StaffFixture, id: string) {
  const { GET } = await inquiryRoute();
  return GET(apiRequest(`/api/agent/inquiries/${id}`, { cookie: who.cookie }), params({ id }));
}

async function addNote(who: StaffFixture, id: string, note: string) {
  const { POST } = await notesRoute();
  return POST(apiRequest(`/api/agent/inquiries/${id}/notes`, { cookie: who.cookie, body: { note } }), params({ id }));
}

/** Every write an agent might attempt on an inquiry, as [label, call]. */
function writeAttempts(who: StaffFixture, inv: InquiryFixture, otherAgentId: string): [string, () => Promise<Response>][] {
  const id = inv.id;
  const c = who.cookie;
  return [
    ["status", async () => (await statusRoute()).POST(apiRequest(`/x`, { cookie: c, body: { to: "quoted" } }), params({ id }))],
    ["item", async () => (await itemRoute()).PATCH(apiRequest(`/x`, { method: "PATCH", cookie: c, body: { confirmedTotal: { inr: 1, aed: 1 } } }), params({ id, itemId: inv.itemIds[0] }))],
    ["contact", async () => (await contactRoute()).POST(apiRequest(`/x`, { cookie: c, body: { note: "touch" } }), params({ id }))],
    ["spam", async () => (await spamRoute()).POST(apiRequest(`/x`, { cookie: c, body: { reason: "junk", suppress: true } }), params({ id }))],
    ["convert", async () => (await convertRoute()).POST(apiRequest(`/x`, { cookie: c, body: { amountPaidInr: 1 } }), params({ id }))],
    ["unassign", async () => (await unassignRoute()).POST(apiRequest(`/x`, { cookie: c, body: {} }), params({ id }))],
    ["assign", async () => (await assignRoute()).POST(apiRequest(`/x`, { cookie: c, body: { agentId: otherAgentId } }), params({ id }))],
    ["claim", async () => (await claimRoute()).POST(apiRequest(`/x`, { cookie: c, body: {} }), params({ id }))],
  ];
}

describe.skipIf(!dbEnabled)("staff object permissions (H07, H10, G03)", () => {
  beforeAll(async () => {
    assertDisposableDb();
    forbidNetwork();
    const make = (label: string, roles: Role[], opts?: { status?: "active" | "suspended" }) => createStaff(run, label, roles, opts);
    staff.agentA = await make("agent-a", ["agent"]);
    staff.agentB = await make("agent-b", ["agent"]);
    staff.lead = await make("lead", ["agent_lead"]);
    staff.ops = await make("ops", ["ops"]);
    staff.admin = await make("admin", ["admin"]);
    staff.finance = await make("finance", ["finance"]);
    staff.content = await make("content", ["content"]);
    staff.readonly = await make("readonly", ["readonly"]);
    staff.suspended = await make("suspended", ["agent"], { status: "suspended" });
    staff.downgraded = await make("downgraded", ["agent"]);
    product = await publishedProduct();
    for (let i = 1; i <= 4; i++) phones.push(syntheticPhone(run, 40 + i));
    invA = await makeInquiry(run, { leadPhone: phones[0], assignedAgentId: staff.agentA.id, product, label: "inv-a", confirmed: true });
    invB = await makeInquiry(run, { leadPhone: phones[1], assignedAgentId: staff.agentB.id, product, label: "inv-b", confirmed: true });
    invLead = await makeInquiry(run, { leadPhone: phones[2], assignedAgentId: staff.agentB.id, product, label: "inv-lead", confirmed: true });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    const prisma = await db();
    await cleanupBusinessRows(run);
    await prisma.suppressedPhone.deleteMany({ where: { phoneE164: { in: phones } } });
    await cleanupPeople(run);
  });

  /* ------------------------------------------------------------------ H07 */

  describe("H07 notes — 'Allow collaboration' (2026-10-25)", () => {
    it("agent A adds a note to agent B's inquiry: allowed, appended, audited with A as actor", async () => {
      const prisma = await db();
      const eventsBefore = await prisma.inquiryEvent.count({ where: { inquiryId: invB.id } });
      const res = await addNote(staff.agentA, invB.id, "Collaboration note from A");
      expect(res.status).toBe(200);
      const events = await prisma.inquiryEvent.findMany({ where: { inquiryId: invB.id, kind: "note" }, orderBy: { id: "desc" }, take: 1 });
      expect(await prisma.inquiryEvent.count({ where: { inquiryId: invB.id } })).toBe(eventsBefore + 1);
      expect(events[0]).toMatchObject({ actorId: staff.agentA.id, note: "Collaboration note from A" });
      // Ownership is unchanged by a note.
      expect((await prisma.inquiry.findUnique({ where: { id: invB.id } }))?.assignedAgentId).toBe(staff.agentB.id);
      const auditRow = await prisma.auditLog.findFirst({ where: { entityId: invB.id, action: "inquiry.note_added" }, orderBy: { createdAt: "desc" } });
      expect(auditRow).toMatchObject({ actorId: staff.agentA.id });
      // The note text itself is not copied into the audit row (it may carry customer details).
      expect(JSON.stringify(auditRow?.after)).not.toContain("Collaboration note from A");
      expect(auditRow?.after).toMatchObject({ collaborator: true });
    });

    it("the owner's own note is audited as non-collaborator", async () => {
      const prisma = await db();
      expect((await addNote(staff.agentB, invB.id, "Owner note")).status).toBe(200);
      const auditRow = await prisma.auditLog.findFirst({ where: { entityId: invB.id, action: "inquiry.note_added", actorId: staff.agentB.id } });
      expect(auditRow?.after).toMatchObject({ collaborator: false });
    });

    it.each(["status", "item", "contact", "spam", "convert", "unassign", "assign", "claim"])(
      "agent A cannot %s on agent B's inquiry (403, nothing changed)",
      async (label) => {
        const before = await inquirySnapshot(invB.id);
        const audits = await auditCount(invB.id);
        const attempt = writeAttempts(staff.agentA, invB, staff.agentA.id).find(([l]) => l === label)!;
        const res = await attempt[1]();
        expect(res.status).toBe(403);
        expect(await inquirySnapshot(invB.id)).toBe(before);
        expect(await auditCount(invB.id)).toBe(audits);
      },
    );

    it.each([
      ["readonly", 403],
      ["finance", 403],
      ["content", 403],
    ] as const)("%s cannot add a note (%i, nothing changed)", async (who, status) => {
      const before = await inquirySnapshot(invB.id);
      const res = await addNote(staff[who], invB.id, `note by ${who}`);
      expect(res.status).toBe(status);
      expect(await inquirySnapshot(invB.id)).toBe(before);
    });

    it.each(["lead", "ops", "admin"] as const)("%s can note and move any inquiry", async (who) => {
      expect((await addNote(staff[who], invLead.id, `note by ${who}`)).status).toBe(200);
      const { POST } = await contactRoute();
      const res = await POST(apiRequest("/x", { cookie: staff[who].cookie, body: { note: `touch by ${who}` } }), params({ id: invLead.id }));
      expect(res.status).toBe(200);
    });

    it("an agent can still move their own inquiry", async () => {
      const { POST } = await statusRoute();
      const res = await POST(apiRequest("/x", { cookie: staff.agentA.cookie, body: { to: "quoted" } }), params({ id: invA.id }));
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("quoted");
    });

    it("an empty note is refused before anything is written", async () => {
      const before = await inquirySnapshot(invB.id);
      const res = await addNote(staff.agentA, invB.id, "   ");
      expect(res.status).toBe(422);
      expect(await inquirySnapshot(invB.id)).toBe(before);
    });
  });

  /* ------------------------------------------------------------------ H10 */

  describe("H10 reads and projections", () => {
    it("view_all is intentional: agent A reads agent B's inquiry with PII (view_pii)", async () => {
      const res = await getDetail(staff.agentA, invB.id);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.leadPhone).toBe(invB.leadPhone);
      expect(body.leadEmail).toContain("@outlyy.test");
    });

    // The agent routes pre-check `inquiries.view_own`, which readonly and
    // finance do not hold (they hold view_all only), so the route fails closed
    // for them. Reported to the Lead as a route/matrix inconsistency; the
    // masking rule itself is enforced in the service and tested there.
    it("readonly and finance are refused by the agent inquiry routes (route pre-check is view_own)", async () => {
      expect((await getDetail(staff.readonly, invB.id)).status).toBe(403);
      expect((await getDetail(staff.finance, invB.id)).status).toBe(403);
      const { GET } = await listRoute();
      expect((await GET(apiRequest("/api/agent/inquiries", { cookie: staff.readonly.cookie }), NO_CTX)).status).toBe(403);
    });

    it("service projection without customers.view_pii masks phone and email everywhere, and writes no PII-view audit row", async () => {
      const { authService } = await import("../../services/auth.service");
      const { inquiryService } = await import("../../services/inquiry.service");
      const { actor } = await authService.requireRequest(apiRequest("/x", { cookie: staff.readonly.cookie }));
      const detail = await inquiryService.get(actor, invB.id);
      expect(detail.leadPhone).toBe(detail.leadPhoneMasked);
      expect(detail.leadEmail).toBeUndefined();
      expect(JSON.stringify(detail)).not.toContain(invB.leadPhone);
      const list = await inquiryService.list(actor, { q: `zz-sec-${run}` });
      expect(list.items.length).toBeGreaterThan(0);
      for (const row of list.items) expect(row.leadPhone).toBe(row.leadPhoneMasked);
      expect(JSON.stringify(list)).not.toContain(invB.leadPhone);
      const prisma = await db();
      expect(await prisma.auditLog.count({ where: { entityId: invB.id, action: "inquiry.view_pii", actorId: staff.readonly.id } })).toBe(0);
    });

    it("finance (view_all + view_pii) reads full contact details through the service", async () => {
      const { authService } = await import("../../services/auth.service");
      const { inquiryService } = await import("../../services/inquiry.service");
      const { actor } = await authService.requireRequest(apiRequest("/x", { cookie: staff.finance.cookie }));
      expect((await inquiryService.get(actor, invB.id)).leadPhone).toBe(invB.leadPhone);
    });

    it("a PII read by an agent writes an inquiry.view_pii audit row", async () => {
      const prisma = await db();
      await getDetail(staff.agentA, invA.id);
      await vi.waitFor(async () => expect(await prisma.auditLog.count({ where: { entityId: invA.id, action: "inquiry.view_pii", actorId: staff.agentA.id } })).toBeGreaterThan(0));
    });

    it("content (no inquiry permissions) gets 403; anonymous gets 401; a garbage cookie gets 401", async () => {
      expect((await getDetail(staff.content, invB.id)).status).toBe(403);
      const { GET } = await inquiryRoute();
      expect((await GET(apiRequest(`/x`), params({ id: invB.id }))).status).toBe(401);
      expect((await GET(apiRequest(`/x`, { cookie: "outlyy_admin_session=not-a-token" }), params({ id: invB.id }))).status).toBe(401);
    });

    it("a suspended staff user with a live session gets 401 on reads and writes", async () => {
      expect((await getDetail(staff.suspended, invB.id)).status).toBe(401);
      const before = await inquirySnapshot(invB.id);
      expect((await addNote(staff.suspended, invB.id, "from suspended")).status).toBe(401);
      expect(await inquirySnapshot(invB.id)).toBe(before);
    });

    it("a revoked staff session gets 401", async () => {
      const prisma = await db();
      const revoked = await createStaff(run, "revoked", ["agent"]);
      await prisma.adminSession.update({ where: { id: revoked.sessionId }, data: { revokedAt: new Date() } });
      expect((await getDetail(revoked, invB.id)).status).toBe(401);
    });

    it("removing a role row takes effect on the very next request", async () => {
      const prisma = await db();
      expect((await getDetail(staff.downgraded, invB.id)).status).toBe(200);
      await prisma.adminUserRole.deleteMany({ where: { adminUserId: staff.downgraded.id } });
      expect((await getDetail(staff.downgraded, invB.id)).status).toBe(403);
      const before = await inquirySnapshot(invB.id);
      expect((await addNote(staff.downgraded, invB.id, "after downgrade")).status).toBe(403);
      expect(await inquirySnapshot(invB.id)).toBe(before);
    });

    it("an unknown inquiry id is 404 and a malformed id is 422", async () => {
      expect((await getDetail(staff.agentA, "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b")).status).toBe(404);
      expect((await getDetail(staff.agentA, "../../etc")).status).toBe(422);
    });
  });

  /* --------------------------------------------- nested item ownership (G03) */

  describe("nested items must belong to the inquiry in the path", () => {
    it("agent A patching their own inquiry with an item id from B's inquiry gets 404 and changes neither", async () => {
      const beforeA = await inquirySnapshot(invA.id);
      const beforeB = await inquirySnapshot(invB.id);
      const { PATCH } = await itemRoute();
      const res = await PATCH(
        apiRequest("/x", { method: "PATCH", cookie: staff.agentA.cookie, body: { confirmedTotal: { inr: 1, aed: 1 } } }),
        params({ id: invA.id, itemId: invB.itemIds[0] }),
      );
      expect(res.status).toBe(404);
      expect(await inquirySnapshot(invA.id)).toBe(beforeA);
      expect(await inquirySnapshot(invB.id)).toBe(beforeB);
    });

    it("a lead using B's item id under A's inquiry path also gets 404", async () => {
      const beforeB = await inquirySnapshot(invB.id);
      const { PATCH } = await itemRoute();
      const res = await PATCH(
        apiRequest("/x", { method: "PATCH", cookie: staff.lead.cookie, body: { availabilityNote: "x" } }),
        params({ id: invA.id, itemId: invB.itemIds[1] }),
      );
      expect(res.status).toBe(404);
      expect(await inquirySnapshot(invB.id)).toBe(beforeB);
    });

    it("the owner can confirm their own item price (legitimate path)", async () => {
      const { PATCH } = await itemRoute();
      const res = await PATCH(
        apiRequest("/x", { method: "PATCH", cookie: staff.agentA.cookie, body: { confirmedTotal: { inr: 5200, aed: 210 } } }),
        params({ id: invA.id, itemId: invA.itemIds[0] }),
      );
      expect(res.status).toBe(200);
      const prisma = await db();
      const item = await prisma.inquiryItem.findUnique({ where: { id: invA.itemIds[0] } });
      expect(item?.confirmedTotalInr).toBe(520_000n);
      expect(item?.confirmedTotalAed).toBe(21_000n);
    });

    it("a negative or non-numeric confirmed price is refused (422) and nothing changes", async () => {
      const before = await inquirySnapshot(invA.id);
      const { PATCH } = await itemRoute();
      for (const confirmedTotal of [{ inr: -1, aed: 0 }, { inr: "100", aed: 0 }, { inr: 1e12, aed: 0 }]) {
        const res = await PATCH(apiRequest("/x", { method: "PATCH", cookie: staff.agentA.cookie, body: { confirmedTotal } }), params({ id: invA.id, itemId: invA.itemIds[1] }));
        expect(res.status).toBe(422);
      }
      expect(await inquirySnapshot(invA.id)).toBe(before);
    });
  });

  /* --------------------------------------------------- notifications resend */

  describe("POST /api/agent/notifications/:id/resend", () => {
    let notificationId: string;
    beforeAll(async () => {
      const prisma = await db();
      const row = await prisma.notification.create({
        data: {
          id: (await import("../../lib/ids")).uuidv7(),
          event: "INQUIRY_ACK_CUSTOMER",
          channel: "email",
          recipient: `zz-sec-${run}-b@outlyy.test`,
          inquiryId: invB.id,
          status: "failed",
          payload: { reference: invB.reference },
        },
      });
      notificationId = row.id;
    });

    it("readonly and content are refused (403), nothing dispatched", async () => {
      const prisma = await db();
      const { POST } = await import("@/app/api/agent/notifications/[id]/resend/route");
      const before = await prisma.notification.count({ where: { inquiryId: invB.id } });
      for (const who of [staff.readonly, staff.content, staff.finance]) {
        expect((await POST(apiRequest("/x", { cookie: who.cookie, body: {} }), params({ id: notificationId }))).status).toBe(403);
      }
      expect(await prisma.notification.count({ where: { inquiryId: invB.id } })).toBe(before);
    });

    // KNOWN GAP (reported to the Lead; notification.service.ts is not Mercury's file):
    // `resend` restricts agents to their own inquiries only when they lack
    // `inquiries.view_all`, but every agent role holds view_all, so agent A
    // can re-send B's customer messages. `it.fails` flips to a failure once
    // the service applies the update-ownership rule instead.
    it.fails("KNOWN GAP: agent A cannot resend a notification on agent B's inquiry", async () => {
      const { POST } = await import("@/app/api/agent/notifications/[id]/resend/route");
      const res = await POST(apiRequest("/x", { cookie: staff.agentA.cookie, body: {} }), params({ id: notificationId }));
      expect(res.status).toBe(403);
    });
  });

  /* --------------------------------------------------------- admin routes */

  describe("admin users / settings / reports / audit", () => {
    const cases: [string, () => Promise<{ GET?: (req: never, ctx?: never) => Promise<Response> }>, string, Partial<Record<keyof typeof staff, number>>][] = [
      ["users", () => import("@/app/api/admin/users/route") as never, "/api/admin/users", { admin: 200, ops: 403, lead: 403, agentA: 403, finance: 403, readonly: 403, content: 403 }],
      ["settings", () => import("@/app/api/admin/settings/route") as never, "/api/admin/settings", { admin: 200, ops: 200, readonly: 200, finance: 200, agentA: 403, content: 403 }],
      ["audit", () => import("@/app/api/admin/audit/route") as never, "/api/admin/audit", { admin: 200, ops: 200, finance: 200, readonly: 403, agentA: 403, lead: 403, content: 403 }],
      ["reports/inquiries", () => import("@/app/api/admin/reports/inquiries/route") as never, "/api/admin/reports/inquiries", { admin: 200, readonly: 200, finance: 200, lead: 200, agentA: 403, content: 403 }],
      ["reports/agents", () => import("@/app/api/admin/reports/agents/route") as never, "/api/admin/reports/agents", { readonly: 200, agentA: 403, content: 403 }],
    ];

    it.each(cases)("GET %s follows the permission matrix", async (_label, load, path, expected) => {
      const mod = await load();
      for (const [who, status] of Object.entries(expected)) {
        const res = await mod.GET!(apiRequest(path, { cookie: staff[who as keyof typeof staff].cookie }) as never, NO_CTX as never);
        expect({ who, status: res.status }).toEqual({ who, status });
      }
    });

    it("ops cannot change another user's roles; nothing changes", async () => {
      const prisma = await db();
      const before = await prisma.adminUserRole.findMany({ where: { adminUserId: staff.agentB.id }, select: { roleId: true } });
      const { PATCH } = await import("@/app/api/admin/users/[id]/route");
      const res = await PATCH(apiRequest("/x", { method: "PATCH", cookie: staff.ops.cookie, body: { roles: ["admin"] } }), params({ id: staff.agentB.id }));
      expect(res.status).toBe(403);
      expect(await prisma.adminUserRole.findMany({ where: { adminUserId: staff.agentB.id }, select: { roleId: true } })).toEqual(before);
    });

    it("ops / readonly cannot change settings; nothing changes", async () => {
      const prisma = await db();
      const before = JSON.stringify(await prisma.setting.findMany({ orderBy: { key: "asc" } }));
      const { PUT } = await import("@/app/api/admin/settings/route");
      for (const who of [staff.ops, staff.readonly, staff.lead]) {
        const res = await PUT(apiRequest("/x", { method: "PUT", cookie: who.cookie, body: { key: "pricing", value: { tolerancePercent: 99 } } }), NO_CTX);
        expect(res.status).toBe(403);
      }
      expect(JSON.stringify(await prisma.setting.findMany({ orderBy: { key: "asc" } }))).toBe(before);
    });

    it("user list never exposes credential material", async () => {
      const { GET } = await import("@/app/api/admin/users/route");
      const body = JSON.stringify(await (await GET(apiRequest("/api/admin/users", { cookie: staff.admin.cookie }), NO_CTX)).json());
      expect(body).not.toMatch(/passwordHash|totpSecret|tokenHash/);
    });
  });
});
