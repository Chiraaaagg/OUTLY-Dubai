import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { formatReference, isValidReference, uuidv7 } from "../lib/ids";

/**
 * Data-integrity tests against the REAL dev database (Neon dev branch).
 *
 * What they prove: the hand-written SQL in prisma/migrations (checks, partial
 * unique indexes, immutability triggers, reference sequences) is actually in
 * force — not merely present in a file. Skipped when DATABASE_URL is unset so
 * `npm test` stays green on a machine without .env.local.
 *
 * Isolation: every row is created inside `prisma.$transaction` and the
 * transaction is rolled back by throwing ROLLBACK after the assertions, so
 * nothing persists — including the append-only tables whose rows could not be
 * deleted afterwards. The only side effects are consumed sequence numbers
 * (gaps in INQ-/OUT- references are harmless by design) and one
 * rate_limit_buckets row that is deleted in afterAll.
 *
 * This file and src/server/repositories/** are the only places outside
 * src/server/lib/db.ts that may import @prisma/client at runtime (§19 §0).
 * lib/db.ts is not used because it imports "server-only".
 */

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const enabled = Boolean(process.env.DATABASE_URL);

const ROLLBACK = new Error("ROLLBACK");

/** Run `fn` in a transaction that is always rolled back; returns what `fn` returned. */
async function rolledBack<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out!: T;
  try {
    await prisma.$transaction(async (tx) => {
      out = await fn(tx);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return out;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const RATE_KEY = `test-db-integrity:${uuidv7()}`;

function inquiryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv7(),
    reference: `INQ-TEST${Math.floor(Math.random() * 1e9)}`,
    source: "inquiry_form" as const,
    leadName: "test-integrity",
    leadPhone: "+910000000000",
    countryCode: "IN",
    ...overrides,
  };
}

function itemRow(inquiryId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv7(),
    inquiryId,
    pax: { adult: 1, child: 0, infant: 0, senior: 0 },
    titleSnapshot: "test-item",
    tierSnapshot: "B",
    slugSnapshot: "test-item",
    kindSnapshot: "activity",
    confirmationSnapshot: "manual" as const,
    fulfilmentModeSnapshot: "inquiry" as const,
    freeCancellationHoursSnapshot: 24,
    durationMinutesSnapshot: 60,
    indicativeUnitInr: 100n,
    indicativeUnitAed: 5n,
    indicativeTotalInr: 100n,
    indicativeTotalAed: 5n,
    ...overrides,
  };
}

function orderRow(guestId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv7(),
    reference: `OUT-TEST${Math.floor(Math.random() * 1e9)}`,
    rail: "assisted" as const,
    guestId,
    currency: "INR" as const,
    subtotalInr: 1000n,
    subtotalAed: 45n,
    totalInr: 1000n,
    totalAed: 45n,
    leadName: "test-integrity",
    leadPhone: "+910000000000",
    ...overrides,
  };
}

describe.skipIf(!enabled)("database integrity (dev branch)", () => {
  let prisma: PrismaClient;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const product = await prisma.product.findFirst({ select: { id: true } });
    if (!product) throw new Error("dev database is not seeded — run `npm run db:seed` first");
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: RATE_KEY } }).catch(() => {});
    await prisma.$disconnect();
  });

  /* ------------------------------------------------------------ immutability */

  it("audit_logs rejects UPDATE (trigger)", async () => {
    await rolledBack(prisma, async (tx) => {
      const row = await tx.auditLog.create({ data: { actorType: "system", action: "test.immutable", entityType: "test", entityId: "1" } });
      await expect(tx.$executeRaw`UPDATE audit_logs SET action = 'tampered' WHERE id = ${row.id}`).rejects.toThrow(/append-only/);
    });
  });

  it("audit_logs rejects DELETE (trigger)", async () => {
    await rolledBack(prisma, async (tx) => {
      const row = await tx.auditLog.create({ data: { actorType: "system", action: "test.immutable", entityType: "test", entityId: "1" } });
      await expect(tx.$executeRaw`DELETE FROM audit_logs WHERE id = ${row.id}`).rejects.toThrow(/append-only/);
    });
  });

  it("inquiry_events is immutable (trigger)", async () => {
    await rolledBack(prisma, async (tx) => {
      const inq = await tx.inquiry.create({ data: inquiryRow() });
      const ev = await tx.inquiryEvent.create({ data: { inquiryId: inq.id, kind: "note", actorType: "system", note: "test" } });
      await expect(tx.$executeRaw`UPDATE inquiry_events SET note = 'tampered' WHERE id = ${ev.id}`).rejects.toThrow(/append-only/);
    });
    await rolledBack(prisma, async (tx) => {
      const inq = await tx.inquiry.create({ data: inquiryRow() });
      const ev = await tx.inquiryEvent.create({ data: { inquiryId: inq.id, kind: "note", actorType: "system", note: "test" } });
      await expect(tx.$executeRaw`DELETE FROM inquiry_events WHERE id = ${ev.id}`).rejects.toThrow(/append-only/);
    });
  });

  it("consents is immutable (trigger)", async () => {
    await rolledBack(prisma, async (tx) => {
      const c = await tx.consent.create({ data: { id: uuidv7(), phoneE164: "+910000000000", channel: "whatsapp", purpose: "transactional", granted: true, source: "test" } });
      await expect(tx.$executeRaw`UPDATE consents SET granted = false WHERE id = ${c.id}::uuid`).rejects.toThrow(/append-only/);
    });
  });

  /* ---------------------------------------------------------- inquiry checks */

  it("inquiry_lost_has_reason rejects status=lost without a reason", async () => {
    await rolledBack(prisma, async (tx) => {
      await expect(tx.inquiry.create({ data: inquiryRow({ status: "lost" }) })).rejects.toThrow(/inquiry_lost_has_reason/);
    });
    await rolledBack(prisma, async (tx) => {
      const ok = await tx.inquiry.create({ data: inquiryRow({ status: "lost", lostReason: "no_response", lostAt: new Date() }) });
      expect(ok.status).toBe("lost");
    });
  });

  it("inquiry_won_has_order rejects status=won without converted_order_id", async () => {
    await rolledBack(prisma, async (tx) => {
      await expect(tx.inquiry.create({ data: inquiryRow({ status: "won" }) })).rejects.toThrow(/inquiry_won_has_order/);
    });
  });

  it("inquiry_dates_ordered rejects travel_date_to before travel_date_from", async () => {
    await rolledBack(prisma, async (tx) => {
      await expect(
        tx.inquiry.create({ data: inquiryRow({ travelDateFrom: new Date("2026-12-10T00:00:00Z"), travelDateTo: new Date("2026-12-01T00:00:00Z") }) }),
      ).rejects.toThrow(/inquiry_dates_ordered/);
    });
  });

  it("inquiry_totals_non_negative rejects a negative indicative total", async () => {
    await rolledBack(prisma, async (tx) => {
      await expect(tx.inquiry.create({ data: inquiryRow({ indicativeTotalInr: -1n }) })).rejects.toThrow(/inquiry_totals_non_negative/);
    });
  });

  /* ------------------------------------------------------ inquiry item checks */

  it("inquiry_item_has_product rejects an item with neither product nor combo", async () => {
    await rolledBack(prisma, async (tx) => {
      const inq = await tx.inquiry.create({ data: inquiryRow() });
      await expect(tx.inquiryItem.create({ data: itemRow(inq.id) })).rejects.toThrow(/inquiry_item_has_product/);
    });
  });

  it("inquiry_item_money_non_negative rejects negative aed / confirmed figures", async () => {
    await rolledBack(prisma, async (tx) => {
      const inq = await tx.inquiry.create({ data: inquiryRow() });
      await expect(tx.inquiryItem.create({ data: itemRow(inq.id, { productId, indicativeUnitAed: -1n }) })).rejects.toThrow(/inquiry_item_money_non_negative/);
    });
    await rolledBack(prisma, async (tx) => {
      const inq = await tx.inquiry.create({ data: inquiryRow() });
      await expect(tx.inquiryItem.create({ data: itemRow(inq.id, { productId, confirmedTotalInr: -100n }) })).rejects.toThrow(/inquiry_item_money_non_negative/);
    });
    await rolledBack(prisma, async (tx) => {
      const inq = await tx.inquiry.create({ data: inquiryRow() });
      const ok = await tx.inquiryItem.create({ data: itemRow(inq.id, { productId, confirmedTotalInr: 120n, confirmedTotalAed: 6n }) });
      expect(ok.inclusionsSnapshot).toEqual([]);
      expect(ok.cancellationPolicySnapshot).toEqual({});
    });
  });

  /* ------------------------------------------------------------ order checks */

  it("order_totals_consistent rejects arithmetic drift", async () => {
    await rolledBack(prisma, async (tx) => {
      const guest = await tx.guest.create({ data: { id: uuidv7(), phoneE164: "+910000000000", fullName: "test-integrity" } });
      await expect(tx.order.create({ data: orderRow(guest.id, { totalInr: 999n }) })).rejects.toThrow(/order_totals_consistent/);
    });
    await rolledBack(prisma, async (tx) => {
      const guest = await tx.guest.create({ data: { id: uuidv7(), phoneE164: "+910000000000", fullName: "test-integrity" } });
      const ok = await tx.order.create({ data: orderRow(guest.id, { discountInr: 100n, taxInr: 50n, totalInr: 950n }) });
      expect(ok.totalInr).toBe(950n);
    });
  });

  it("order_money_non_negative rejects a negative discount even when totals balance", async () => {
    await rolledBack(prisma, async (tx) => {
      const guest = await tx.guest.create({ data: { id: uuidv7(), phoneE164: "+910000000000", fullName: "test-integrity" } });
      await expect(tx.order.create({ data: orderRow(guest.id, { discountInr: -100n, totalInr: 1100n }) })).rejects.toThrow(/order_money_non_negative/);
    });
  });

  it("order_has_buyer rejects an order without a guest", async () => {
    await rolledBack(prisma, async (tx) => {
      await expect(tx.order.create({ data: orderRow(undefined as unknown as string) })).rejects.toThrow(/order_has_buyer/);
    });
  });

  it("orders_idem partial unique rejects a duplicate idempotency key", async () => {
    await rolledBack(prisma, async (tx) => {
      const guest = await tx.guest.create({ data: { id: uuidv7(), phoneE164: "+910000000000", fullName: "test-integrity" } });
      const key = `test-idem-${uuidv7()}`;
      await tx.order.create({ data: orderRow(guest.id, { idempotencyKey: key }) });
      await expect(tx.order.create({ data: orderRow(guest.id, { idempotencyKey: key }) })).rejects.toThrow(/orders_idem|Unique constraint/);
    });
  });

  it("orders.source_inquiry_id must reference an existing inquiry", async () => {
    await rolledBack(prisma, async (tx) => {
      const guest = await tx.guest.create({ data: { id: uuidv7(), phoneE164: "+910000000000", fullName: "test-integrity" } });
      await expect(tx.order.create({ data: orderRow(guest.id, { sourceInquiryId: uuidv7() }) })).rejects.toThrow(/orders_source_inquiry_id_fkey|Foreign key/);
    });
  });

  it("payments_gateway_payment_idx rejects recording the same gateway payment twice", async () => {
    await rolledBack(prisma, async (tx) => {
      const guest = await tx.guest.create({ data: { id: uuidv7(), phoneE164: "+910000000000", fullName: "test-integrity" } });
      const order = await tx.order.create({ data: orderRow(guest.id) });
      const base = { orderId: order.id, gateway: "razorpay", amountMinor: 1000n, currency: "INR" as const, status: "captured" as const };
      // Manual links without a gateway id are not constrained.
      await tx.payment.create({ data: { id: uuidv7(), ...base } });
      await tx.payment.create({ data: { id: uuidv7(), ...base } });
      await tx.payment.create({ data: { id: uuidv7(), ...base, gatewayPaymentId: "pay_test_dup" } });
      await expect(tx.payment.create({ data: { id: uuidv7(), ...base, gatewayPaymentId: "pay_test_dup" } })).rejects.toThrow(/payments_gateway_payment_idx|Unique constraint/);
    });
  });

  it("payment_amount_non_negative rejects a negative amount", async () => {
    await rolledBack(prisma, async (tx) => {
      const guest = await tx.guest.create({ data: { id: uuidv7(), phoneE164: "+910000000000", fullName: "test-integrity" } });
      const order = await tx.order.create({ data: orderRow(guest.id) });
      await expect(
        tx.payment.create({ data: { id: uuidv7(), orderId: order.id, gateway: "razorpay", amountMinor: -1n, currency: "INR", status: "captured" } }),
      ).rejects.toThrow(/payment_amount_non_negative/);
    });
  });

  /* -------------------------------------------------------------- references */

  it("inquiry_ref_seq and order_ref_seq produce valid Luhn references", async () => {
    const [inq] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('inquiry_ref_seq') AS n`;
    const [ord] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_ref_seq') AS n`;
    const inqRef = formatReference("INQ", inq.n);
    const ordRef = formatReference("OUT", ord.n);
    expect(inqRef).toMatch(/^INQ-\d{6,}$/);
    expect(ordRef).toMatch(/^OUT-\d{6,}$/);
    expect(isValidReference(inqRef, "INQ")).toBe(true);
    expect(isValidReference(ordRef, "OUT")).toBe(true);
    // A single-digit typo in the body must fail the check digit.
    const body = inqRef.slice(4, -1);
    const last = Number(body.at(-1));
    const typo = `INQ-${body.slice(0, -1)}${(last + 1) % 10}${inqRef.at(-1)}`;
    expect(isValidReference(typo, "INQ")).toBe(false);
    // Sequences are monotonic.
    const [inq2] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('inquiry_ref_seq') AS n`;
    expect(inq2.n).toBeGreaterThan(inq.n);
  });

  /* --------------------------------------------------------------- rate limit */

  it("rate_limit_buckets upsert increments within a window", async () => {
    const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    const expiresAt = new Date(windowStart.getTime() + 60_000);
    const bump = () =>
      prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO rate_limit_buckets (bucket_key, window_start, count, expires_at)
        VALUES (${RATE_KEY}, ${windowStart}, 1, ${expiresAt})
        ON CONFLICT (bucket_key, window_start)
        DO UPDATE SET count = rate_limit_buckets.count + 1
        RETURNING count`;
    const a = await bump();
    const b = await bump();
    const c = await bump();
    expect(Number(a[0].count)).toBe(1);
    expect(Number(b[0].count)).toBe(2);
    expect(Number(c[0].count)).toBe(3);
    const row = await prisma.rateLimitBucket.findUnique({ where: { key_windowStart: { key: RATE_KEY, windowStart } } });
    expect(row?.count).toBe(3);
  });

  /* ---------------------------------------------------------------- analytics */

  it("analytics_events is unique on (event_id, source)", async () => {
    await rolledBack(prisma, async (tx) => {
      const eventId = `test-evt-${uuidv7()}`;
      const base = { name: "test_event", occurredAt: new Date(), environment: "test" };
      await tx.analyticsEvent.create({ data: { id: uuidv7(), eventId, source: "client", ...base } });
      // Same id from the other source is a different row (server-side echo of a client event).
      await tx.analyticsEvent.create({ data: { id: uuidv7(), eventId, source: "server", ...base } });
      await expect(tx.analyticsEvent.create({ data: { id: uuidv7(), eventId, source: "client", ...base } })).rejects.toThrow(/Unique constraint|analytics_events_event_id_source_key/);
    });
  });
});
