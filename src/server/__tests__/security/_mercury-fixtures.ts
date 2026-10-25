import { vi } from "vitest";
import { uuidv7, formatReference } from "../../lib/ids";

/**
 * Inquiry / order fixtures for the ownership, pricing and privacy suites.
 *
 * Rows are synthetic and tagged with the run id: every inquiry and order this
 * file creates has `lead_name = "zz-sec-<run> …"`. Cleanup removes orders,
 * payments, guests, notifications and inquiry items it can; inquiries that
 * carry `inquiry_events` rows cannot be deleted (append-only by trigger, see
 * the init migration) and are left in the disposable database, tagged.
 *
 * Callers must run `assertDisposableDb()` before using anything here.
 */

type Prisma = typeof import("../../lib/db").prisma;

export async function db(): Promise<Prisma> {
  return (await import("../../lib/db")).prisma;
}

/** No test in these suites may reach the network: providers stay in log mode, and any fetch is a failure. */
export function forbidNetwork(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      throw new Error(`network access attempted in a security test: ${String(input).slice(0, 80)}`);
    }),
  );
}

export function leadTag(run: string): string {
  return `zz-sec-${run}`;
}

export interface SeedProduct {
  id: string;
  slug: string;
  title: string;
  tier: string;
}

/** A published, non-deleted seeded product whose stored document prices. */
export async function publishedProduct(skip = 0): Promise<SeedProduct> {
  const prisma = await db();
  const rows = await prisma.product.findMany({
    where: { status: "published", deletedAt: null, quoteOnly: false },
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, title: true, tier: true },
    take: skip + 1,
  });
  const row = rows[skip];
  if (!row) throw new Error("seed has no published products — run `npm run db:seed` against this database");
  return row;
}

export interface InquiryFixture {
  id: string;
  reference: string;
  itemIds: string[];
  leadPhone: string;
}

/**
 * An inquiry written straight to the database (no routing, no notifications),
 * so ownership is exactly what the test says. Two items by default, both with
 * a service date; `confirmed` sets an agent-confirmed price on each so the
 * inquiry is ready to convert.
 */
export async function makeInquiry(
  run: string,
  opts: {
    leadPhone: string;
    assignedAgentId?: string | null;
    customerId?: string | null;
    status?: "new" | "assigned" | "contacted" | "quoted" | "negotiating" | "payment_pending" | "won" | "lost" | "spam";
    confirmed?: boolean;
    product: SeedProduct;
    label?: string;
    leadEmail?: string;
    hotel?: string;
  },
): Promise<InquiryFixture> {
  const prisma = await db();
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('inquiry_ref_seq') AS n`;
  const id = uuidv7();
  const reference = formatReference("INQ", n);
  const itemIds = [uuidv7(), uuidv7()];
  await prisma.inquiry.create({
    data: {
      id,
      reference,
      status: opts.status ?? (opts.assignedAgentId ? "contacted" : "new"),
      source: "inquiry_form",
      leadName: `${leadTag(run)} ${opts.label ?? "lead"}`,
      leadPhone: opts.leadPhone,
      leadEmail: opts.leadEmail ?? `${leadTag(run)}-${opts.label ?? "lead"}@outlyy.test`,
      countryCode: "IN",
      hotel: opts.hotel ?? `Hotel ${opts.label ?? "lead"}`,
      specialRequests: `requests ${opts.label ?? "lead"}`,
      currency: "INR",
      indicativeTotalInr: 1_000_000n,
      indicativeTotalAed: 40_000n,
      assignedAgentId: opts.assignedAgentId ?? null,
      assignedAt: opts.assignedAgentId ? new Date() : null,
      customerId: opts.customerId ?? null,
      attribution: { utm_source: "zz-test", fbclid: `fb-${run}` },
      items: {
        create: itemIds.map((itemId, i) => ({
          id: itemId,
          productId: opts.product.id,
          serviceDate: new Date("2027-01-15T00:00:00Z"),
          pax: { adult: 2, child: 0, infant: 0, senior: 0 },
          addons: [],
          titleSnapshot: `${opts.product.title} #${i + 1}`,
          tierSnapshot: opts.product.tier,
          slugSnapshot: opts.product.slug,
          kindSnapshot: "activity",
          confirmationSnapshot: "manual",
          fulfilmentModeSnapshot: "inquiry",
          freeCancellationHoursSnapshot: 24,
          durationMinutesSnapshot: 120,
          indicativeUnitInr: 250_000n,
          indicativeUnitAed: 10_000n,
          indicativeTotalInr: 500_000n,
          indicativeTotalAed: 20_000n,
          confirmedTotalInr: opts.confirmed ? 510_000n : null,
          confirmedTotalAed: opts.confirmed ? 20_400n : null,
          sortOrder: i,
        })),
      },
    },
  });
  return { id, reference, itemIds, leadPhone: opts.leadPhone };
}

/** A paid order written straight to the database, for customer projection tests. */
export async function makeOrder(run: string, opts: { leadPhone: string; customerId?: string | null; label?: string; sourceInquiryId?: string }) {
  const prisma = await db();
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_ref_seq') AS n`;
  const id = uuidv7();
  const reference = formatReference("OUT", n);
  const guestId = uuidv7();
  await prisma.guest.create({ data: { id: guestId, phoneE164: opts.leadPhone, fullName: `${leadTag(run)} ${opts.label ?? "order"}` } });
  await prisma.order.create({
    data: {
      id,
      reference,
      status: "paid",
      rail: "assisted",
      paymentCollection: "manual_link",
      currency: "INR",
      subtotalInr: 777_700n,
      subtotalAed: 31_100n,
      totalInr: 777_700n,
      totalAed: 31_100n,
      netCostAed: 12_345n,
      leadName: `${leadTag(run)} ${opts.label ?? "order"}`,
      leadPhone: opts.leadPhone,
      leadEmail: `${leadTag(run)}-${opts.label ?? "order"}@outlyy.test`,
      customerId: opts.customerId ?? null,
      sourceInquiryId: opts.sourceInquiryId,
      guestId,
      paidAt: new Date(),
    },
  });
  await prisma.payment.create({
    data: { id: uuidv7(), orderId: id, gateway: "razorpay", gatewayPaymentId: `pay_${run}_${opts.label ?? "x"}`, amountMinor: 777_700n, currency: "INR", status: "captured", capturedAt: new Date() },
  });
  return { id, reference };
}

/** Everything about one inquiry that a refused request must leave untouched. */
export async function inquirySnapshot(id: string) {
  const prisma = await db();
  const row = await prisma.inquiry.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      events: { orderBy: { id: "asc" }, select: { id: true } },
      sourcedOrders: { select: { id: true } },
    },
  });
  const suppressed = row ? await prisma.suppressedPhone.findUnique({ where: { phoneE164: row.leadPhone } }) : null;
  return JSON.stringify({ row, suppressed }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

export async function auditCount(entityId: string): Promise<number> {
  const prisma = await db();
  return prisma.auditLog.count({ where: { entityId } });
}

/** Remove what can be removed for this run; inquiries with timeline events stay (append-only). */
export async function cleanupBusinessRows(run: string): Promise<void> {
  const prisma = await db();
  const tag = leadTag(run);
  const orders = await prisma.order.findMany({ where: { leadName: { startsWith: tag } }, select: { id: true, guestId: true } });
  const orderIds = orders.map((o) => o.id);
  const inquiries = await prisma.inquiry.findMany({ where: { leadName: { startsWith: tag } }, select: { id: true } });
  const inquiryIds = inquiries.map((i) => i.id);
  await prisma.notification.deleteMany({ where: { OR: [{ inquiryId: { in: inquiryIds } }, { orderId: { in: orderIds } }] } });
  // `won` requires a converted order (check inquiry_won_has_order); a cleaned-up inquiry is left `lost`.
  if (inquiryIds.length) await prisma.inquiry.updateMany({ where: { id: { in: inquiryIds }, convertedOrderId: { not: null } }, data: { convertedOrderId: null, status: "lost", lostReason: "other", lostAt: new Date() } });
  if (orderIds.length) {
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderAttribution.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.analyticsEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    const guestIds = orders.map((o) => o.guestId).filter((g): g is string => Boolean(g));
    if (guestIds.length) await prisma.guest.deleteMany({ where: { id: { in: guestIds } } });
  }
  if (inquiryIds.length) {
    await prisma.analyticsEvent.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
    await prisma.inquiryItem.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
    const withEvents = await prisma.inquiryEvent.findMany({ where: { inquiryId: { in: inquiryIds } }, distinct: ["inquiryId"], select: { inquiryId: true } });
    const keep = new Set(withEvents.map((e) => e.inquiryId));
    await prisma.inquiry.deleteMany({ where: { id: { in: inquiryIds.filter((i) => !keep.has(i)) } } });
  }
}
