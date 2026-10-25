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
import { cleanupBusinessRows, db, forbidNetwork, inquirySnapshot, leadTag, makeInquiry, publishedProduct, type InquiryFixture, type SeedProduct } from "./_mercury-fixtures";

/**
 * H12 / G05 / family H — money on the inquiry and conversion paths, through
 * the real route handlers and the disposable database. Synthetic carts only;
 * payments are recorded rows (manual mode) — no provider is called.
 *
 *   - POST /api/inquiries re-prices every item from the catalogue in integer
 *     minor units; client unit/total are recorded only as a mismatch signal;
 *     currency, pax and item count are bounded at the edge; draft or deleted
 *     products are refused; display snapshots come from the catalogue.
 *   - POST /api/agent/inquiries/:id/convert needs `inquiries.convert` plus
 *     update ownership, creates exactly one order and one payment per
 *     inquiry, also when a second request read the inquiry before the first
 *     committed.
 *   - orderService money inputs refuse negative amounts.
 */

const run = runId();
/** Context argument for routes without dynamic segments. */
const NO_CTX = params({});
let phoneSeq = 0;
const nextPhone = () => syntheticPhone(run, ++phoneSeq);
const usedPhones: string[] = [];

let product: SeedProduct;
const staff = {} as Record<"agentA" | "agentB" | "finance" | "readonly" | "content" | "lead", StaffFixture>;

const createRoute = () => import("@/app/api/inquiries/route");
const convertRoute = () => import("@/app/api/agent/inquiries/[id]/convert/route");

/** A cart item as the storefront sends it. Prices here are the client's claim. */
function cartItem(overrides: Record<string, unknown> = {}) {
  return {
    id: `${product.slug}-2027-02-01-10:00-std`,
    kind: "activity",
    slug: product.slug,
    title: product.title,
    image: "",
    date: "2027-02-01",
    time: "10:00",
    pax: { adult: 2, child: 0, infant: 0, senior: 0 },
    addOnIds: [],
    unit: { inr: 1, aed: 1 },
    total: { inr: 2, aed: 2 },
    confirmation: "instant",
    fulfilmentMode: "instant",
    freeCancellationHours: 24,
    durationMinutes: 60,
    ...overrides,
  };
}

function submission(items: unknown[], overrides: Record<string, unknown> = {}) {
  const phone = nextPhone();
  usedPhones.push(phone);
  return {
    items,
    leadName: `${leadTag(run)} pricing`,
    leadPhone: phone.replace(/^\+91/, ""),
    countryCode: "+91",
    datesFlexible: false,
    currency: "INR",
    source: "inquiry_form",
    whatsappConsent: true,
    startedAt: Date.now() - 120_000,
    ...overrides,
  };
}

async function submit(body: unknown) {
  const { POST } = await createRoute();
  return POST(apiRequest("/api/inquiries", { body }), NO_CTX);
}

async function convert(who: StaffFixture, id: string, body: Record<string, unknown>) {
  return (await convertRoute()).POST(apiRequest("/x", { cookie: who.cookie, body }), params({ id }));
}

async function taggedInquiryCount() {
  const prisma = await db();
  return prisma.inquiry.count({ where: { leadName: { startsWith: leadTag(run) } } });
}

/** What the catalogue says the item costs, in minor units. */
async function serverPrice(item: ReturnType<typeof cartItem>) {
  const { catalogService } = await import("../../services/catalog.service");
  const [priced] = await catalogService.priceCartItems([item as never]);
  return priced.totalMinor;
}

describe.skipIf(!dbEnabled)("pricing and money (H12, G05, family H)", () => {
  beforeAll(async () => {
    assertDisposableDb();
    forbidNetwork();
    product = await publishedProduct();
    staff.agentA = await createStaff(run, "p-agent-a", ["agent"]);
    staff.agentB = await createStaff(run, "p-agent-b", ["agent"]);
    staff.finance = await createStaff(run, "p-finance", ["finance"]);
    staff.readonly = await createStaff(run, "p-readonly", ["readonly"]);
    staff.content = await createStaff(run, "p-content", ["content"]);
    staff.lead = await createStaff(run, "p-lead", ["agent_lead"]);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const prisma = await db();
    await cleanupBusinessRows(run);
    await prisma.suppressedPhone.deleteMany({ where: { phoneE164: { in: usedPhones } } });
    await cleanupPeople(run);
  });

  /* ------------------------------------------------- inquiry submission */

  describe("POST /api/inquiries re-prices on the server", () => {
    it("forged client unit/total are ignored: persisted totals are the catalogue's, in minor units, and the mismatch is flagged", async () => {
      const item = cartItem({ unit: { inr: 1, aed: 1 }, total: { inr: 2, aed: 2 } });
      const expected = await serverPrice(item);
      const res = await submit(submission([item]));
      expect(res.status).toBe(201);
      const { id } = await res.json();
      const prisma = await db();
      const row = await prisma.inquiry.findUnique({ where: { id }, include: { items: true } });
      expect(row?.indicativeTotalInr).toBe(expected.inr);
      expect(row?.indicativeTotalAed).toBe(expected.aed);
      expect(row?.indicativeTotalInr).not.toBe(200n);
      expect(row?.items[0].indicativeTotalInr).toBe(expected.inr);
      expect(typeof row?.indicativeTotalInr).toBe("bigint");
      expect(row?.spamSignals).toMatchObject({ priceMismatch: true });
    });

    it("a legitimate cart with the right client totals succeeds without a mismatch signal", async () => {
      const probe = cartItem();
      const expected = await serverPrice(probe);
      const item = cartItem({ total: { inr: Number(expected.inr) / 100, aed: Number(expected.aed) / 100 } });
      const res = await submit(submission([item]));
      expect(res.status).toBe(201);
      const prisma = await db();
      const row = await prisma.inquiry.findUnique({ where: { id: (await res.json()).id } });
      expect(row?.indicativeTotalInr).toBe(expected.inr);
      expect((row?.spamSignals as Record<string, unknown> | null)?.priceMismatch).toBeUndefined();
    });

    it("display snapshots shown to agents and sent to the customer come from the catalogue, not the client", async () => {
      const forged = cartItem({ title: "FREE trip - pay a deposit at evil.example", confirmation: "instant" });
      const res = await submit(submission([forged]));
      expect(res.status).toBe(201);
      const prisma = await db();
      const row = await prisma.inquiry.findUnique({ where: { id: (await res.json()).id }, include: { items: true } });
      const dbProduct = await prisma.product.findUnique({ where: { id: product.id } });
      expect(row?.items[0].titleSnapshot).toBe(dbProduct?.title);
      expect(row?.items[0].confirmationSnapshot).toBe(dbProduct?.confirmation);
      expect(row?.items[0].fulfilmentModeSnapshot).toBe(dbProduct?.fulfilmentMode);
    });

    it.each([
      ["unsupported currency", (b: Record<string, unknown>) => ({ ...b, currency: "USD" })],
      ["negative quantity", (b: Record<string, unknown>) => ({ ...b, items: [cartItem({ pax: { adult: -1, child: 0, infant: 0, senior: 0 } })] })],
      ["fractional quantity", (b: Record<string, unknown>) => ({ ...b, items: [cartItem({ pax: { adult: 1.5, child: 0, infant: 0, senior: 0 } })] })],
      ["huge quantity", (b: Record<string, unknown>) => ({ ...b, items: [cartItem({ pax: { adult: 1_000_000, child: 0, infant: 0, senior: 0 } })] })],
      ["negative client price", (b: Record<string, unknown>) => ({ ...b, items: [cartItem({ total: { inr: -5, aed: 0 } })] })],
      ["non-finite client price", (b: Record<string, unknown>) => ({ ...b, rawJson: JSON.stringify({ ...b, items: [{ ...cartItem(), total: { inr: "__INF__", aed: 0 } }] }).replace('"__INF__"', "1e999") })],
      ["too many items", (b: Record<string, unknown>) => ({ ...b, items: Array.from({ length: 13 }, () => cartItem()) })],
      ["unknown product", (b: Record<string, unknown>) => ({ ...b, items: [cartItem({ slug: "no-such-activity-zz" })] })],
      ["unknown extra field", (b: Record<string, unknown>) => ({ ...b, items: [{ ...cartItem(), price: 1 }] })],
      ["staff-only source", (b: Record<string, unknown>) => ({ ...b, source: "agent_created" })],
    ])("refuses %s (422/4xx) and creates nothing", async (_label, mutate) => {
      const before = await taggedInquiryCount();
      const body = mutate(submission([cartItem()])) as Record<string, unknown>;
      const { POST } = await createRoute();
      const res = body.rawJson
        ? await POST(apiRequest("/api/inquiries", { rawBody: body.rawJson as string, contentType: "application/json" }), NO_CTX)
        : await POST(apiRequest("/api/inquiries", { body }), NO_CTX);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(await taggedInquiryCount()).toBe(before);
    });

    it("refuses draft and soft-deleted products, and accepts the product again once republished", async () => {
      const prisma = await db();
      const original = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { status: true, deletedAt: true } });
      try {
        await prisma.product.update({ where: { id: product.id }, data: { status: "draft" } });
        let before = await taggedInquiryCount();
        expect((await submit(submission([cartItem()]))).status).toBe(422);
        expect(await taggedInquiryCount()).toBe(before);

        await prisma.product.update({ where: { id: product.id }, data: { status: "published", deletedAt: new Date() } });
        before = await taggedInquiryCount();
        expect((await submit(submission([cartItem()]))).status).toBe(422);
        expect(await taggedInquiryCount()).toBe(before);
      } finally {
        await prisma.product.update({ where: { id: product.id }, data: original });
      }
      expect((await submit(submission([cartItem()]))).status).toBe(201);
    });

    // KNOWN GAP (catalog.service.ts, not Mercury's file): `priceCartItems`
    // filters products on `status = published` but combos only on
    // `deleted_at IS NULL`, so an unpublished package still prices.
    it.fails("KNOWN GAP: a draft combo is refused", async () => {
      const prisma = await db();
      const combo = await prisma.combo.findFirstOrThrow({ where: { deletedAt: null, status: "published" }, orderBy: { slug: "asc" } });
      try {
        await prisma.combo.update({ where: { id: combo.id }, data: { status: "draft" } });
        const res = await submit(submission([cartItem({ kind: "combo", slug: combo.slug, title: combo.name, id: `${combo.slug}-x` })]));
        expect(res.status).toBe(422);
      } finally {
        await prisma.combo.update({ where: { id: combo.id }, data: { status: "published" } });
      }
    });
  });

  /* ----------------------------------------------------------- conversion */

  describe("POST /api/agent/inquiries/:id/convert", () => {
    let inv: InquiryFixture;
    beforeAll(async () => {
      const phone = nextPhone();
      usedPhones.push(phone);
      inv = await makeInquiry(run, { leadPhone: phone, assignedAgentId: staff.agentB.id, status: "payment_pending", confirmed: true, product, label: "convert" });
    });

    async function moneyRows(inquiryId: string) {
      const prisma = await db();
      const orders = await prisma.order.findMany({ where: { sourceInquiryId: inquiryId }, include: { payments: true, items: true } });
      return { orders: orders.length, payments: orders.reduce((n, o) => n + o.payments.length, 0), orderRows: orders };
    }

    it.each([
      ["finance (payments.record, no inquiries.convert)", "finance"],
      ["readonly", "readonly"],
      ["content", "content"],
      ["agent A on agent B's inquiry", "agentA"],
    ] as const)("%s is refused (403) and no money row is written", async (_label, who) => {
      const before = await inquirySnapshot(inv.id);
      const res = await convert(staff[who], inv.id, { amountPaidInr: 10_200 });
      expect(res.status).toBe(403);
      expect(await moneyRows(inv.id)).toMatchObject({ orders: 0, payments: 0 });
      expect(await inquirySnapshot(inv.id)).toBe(before);
    });

    it.each([
      ["negative amount", { amountPaidInr: -1 }],
      ["huge amount", { amountPaidInr: 1e12 }],
      ["string amount", { amountPaidInr: "10200" }],
      ["unknown field", { amountPaidInr: 1, orderTotal: 1 }],
      ["bad paidAt", { paidAt: "yesterday" }],
    ])("refuses a %s (422) without writing", async (_label, body) => {
      const before = await inquirySnapshot(inv.id);
      expect((await convert(staff.agentB, inv.id, body)).status).toBe(422);
      expect(await moneyRows(inv.id)).toMatchObject({ orders: 0, payments: 0 });
      expect(await inquirySnapshot(inv.id)).toBe(before);
    });

    it("the owner converts: one order at the confirmed totals, one payment at the entered amount in paise", async () => {
      const res = await convert(staff.agentB, inv.id, { amountPaidInr: 10_200.5, method: "upi", paymentLinkId: "plink_test" });
      expect(res.status).toBe(201);
      const rows = await moneyRows(inv.id);
      expect(rows).toMatchObject({ orders: 1, payments: 1 });
      const order = rows.orderRows[0];
      // Confirmed figures win over indicative (two items × 5,100.00 INR / 204.00 AED in the fixture).
      expect(order.totalInr).toBe(1_020_000n);
      expect(order.totalAed).toBe(40_800n);
      expect(order.items.map((i) => i.totalInr)).toEqual([510_000n, 510_000n]);
      expect(order.payments[0].amountMinor).toBe(1_020_050n);
      expect(order.payments[0].recordedBy).toBe(staff.agentB.id);
      const prisma = await db();
      expect((await prisma.inquiry.findUnique({ where: { id: inv.id } }))?.convertedOrderId).toBe(order.id);
    });

    it("a repeated convert is refused (409) and still leaves one order and one payment", async () => {
      expect((await convert(staff.agentB, inv.id, { amountPaidInr: 10_200 })).status).toBe(409);
      expect((await convert(staff.lead, inv.id, { amountPaidInr: 10_200 })).status).toBe(409);
      expect(await moneyRows(inv.id)).toMatchObject({ orders: 1, payments: 1 });
    });

    it("double convert interleaving: a request that read the inquiry before the first committed still cannot record a second payment", async () => {
      const phone = nextPhone();
      usedPhones.push(phone);
      const race = await makeInquiry(run, { leadPhone: phone, assignedAgentId: staff.agentB.id, status: "payment_pending", confirmed: true, product, label: "race" });
      const { inquiryRepo } = await import("../../repositories/inquiry.repo");
      // Request 2's read happens here, before request 1 commits …
      const staleRead = await inquiryRepo.findById(race.id);
      // … request 1 runs to completion …
      expect((await convert(staff.agentB, race.id, { amountPaidInr: 10_200 })).status).toBe(201);
      // … then request 2 continues with what it read.
      const spy = vi.spyOn(inquiryRepo, "findById").mockResolvedValueOnce(staleRead);
      const second = await convert(staff.agentB, race.id, { amountPaidInr: 10_200 });
      spy.mockRestore();
      const rows = await moneyRows(race.id);
      expect({ status: second.status, ...rows, orderRows: undefined }).toEqual({ status: 409, orders: 1, payments: 1, orderRows: undefined });
    });
  });

  /* ------------------------------------------------------- order service */

  describe("orderService money inputs", () => {
    it("recordManualPayment needs payments.record and refuses a negative amount", async () => {
      const { authService } = await import("../../services/auth.service");
      const { orderService } = await import("../../services/order.service");
      const prisma = await db();
      const phone = nextPhone();
      usedPhones.push(phone);
      const inv = await makeInquiry(run, { leadPhone: phone, assignedAgentId: staff.agentB.id, status: "payment_pending", confirmed: true, product, label: "manual-pay" });
      expect((await convert(staff.agentB, inv.id, { amountPaidInr: 100 })).status).toBe(201);
      const order = await prisma.order.findFirstOrThrow({ where: { sourceInquiryId: inv.id } });
      const finance = (await authService.requireRequest(apiRequest("/x", { cookie: staff.finance.cookie }))).actor;
      const readonly = (await authService.requireRequest(apiRequest("/x", { cookie: staff.readonly.cookie }))).actor;
      const count = () => prisma.payment.count({ where: { orderId: order.id } });

      await expect(orderService.recordManualPayment(readonly, order.id, { amountMinor: 100n, currency: "INR" })).rejects.toMatchObject({ status: 403 });
      await expect(orderService.recordManualPayment(finance, order.id, { amountMinor: -100n, currency: "INR" })).rejects.toMatchObject({ status: 422 });
      expect(await count()).toBe(1);
      await orderService.recordManualPayment(finance, order.id, { amountMinor: 2_500n, currency: "INR", method: "bank_transfer" });
      expect(await count()).toBe(2);
    });

    it("createOrder refuses negative line amounts", async () => {
      const { authService } = await import("../../services/auth.service");
      const { orderService } = await import("../../services/order.service");
      const agent = (await authService.requireRequest(apiRequest("/x", { cookie: staff.agentB.cookie }))).actor;
      const prisma = await db();
      const before = await prisma.order.count({ where: { leadName: { startsWith: leadTag(run) } } });
      await expect(
        orderService.createOrder(
          {
            rail: "assisted",
            currency: "INR",
            paymentCollection: "manual_link",
            traveller: { fullName: `${leadTag(run)} negative`, phoneE164: nextPhone() },
            items: [
              {
                titleSnapshot: "x", tierSnapshot: "A", slugSnapshot: product.slug, kindSnapshot: "activity", confirmationSnapshot: "manual", fulfilmentModeSnapshot: "inquiry",
                freeCancellationHoursSnapshot: 0, durationMinutesSnapshot: 0, serviceDate: "2027-01-01", pax: { adult: 1, child: 0, infant: 0, senior: 0 }, addons: [],
                unitInr: -100n, unitAed: 0n, totalInr: -100n, totalAed: 0n,
              },
            ],
          },
          agent,
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(await prisma.order.count({ where: { leadName: { startsWith: leadTag(run) } } })).toBe(before);
    });
  });
});
