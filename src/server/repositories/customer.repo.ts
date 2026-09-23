import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../lib/db";
import { uuidv7 } from "../lib/ids";
import { minorToMoney } from "../lib/money";
import type { Currency, Dietary, Money, PaxCount } from "@/lib/types";

/**
 * Customer persistence (impl/customer-auth-contract.md §2): customers, their
 * sessions, OTP challenges, the phone→customer link on inquiries/orders, and
 * the customer-facing order projection. Maps Prisma rows → DTOs; money → major
 * units here and nowhere else. Soft-deleted (anonymised) customers are
 * filtered out of every read.
 */

export interface CustomerRecord {
  id: string;
  phoneE164: string;
  email?: string;
  fullName?: string;
  dietary?: Dietary;
  hotel?: string;
  locale: string;
  preferredCurrency: Currency;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  deletedAt?: Date;
}

export interface CustomerSessionRecord {
  id: string;
  customerId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface OtpChallengeRecord {
  id: string;
  phoneE164: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface OrderItemCustomerView {
  id: string;
  title: string;
  image?: string;
  date?: string;
  time?: string;
  pax?: PaxCount;
  total: Money;
  status: string;
}

/** Customer projection of an order — no net cost, no payment rows, no attribution. */
export interface OrderCustomerView {
  id: string;
  reference: string;
  status: string;
  placedAt: string;
  paidAt?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  currency: Currency;
  totals: { subtotal: Money; discount: Money; tax: Money; total: Money };
  /** Same as `totals.total`; the account UI accepts either shape. */
  total: Money;
  items: OrderItemCustomerView[];
  sourceInquiryReference?: string;
}

export interface ConsentView {
  channel: string;
  purpose: string;
  granted: boolean;
  source: string;
  createdAt: string;
}

type Db = Tx | typeof prisma;

type CustomerRow = Prisma.CustomerGetPayload<Record<string, never>>;

function toRecord(c: CustomerRow): CustomerRecord {
  return {
    id: c.id,
    phoneE164: c.phoneE164,
    email: c.email ?? undefined,
    fullName: c.fullName ?? undefined,
    dietary: (c.dietary as Dietary | null) ?? undefined,
    hotel: c.hotel ?? undefined,
    locale: c.locale,
    preferredCurrency: c.preferredCurrency,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    lastLoginAt: c.lastLoginAt ?? undefined,
    deletedAt: c.deletedAt ?? undefined,
  };
}

const orderInclude = {
  items: { orderBy: { serviceDate: "asc" as const } },
  sourceInquiry: { select: { reference: true } },
} as const;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const dateKey = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : undefined);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

function toOrderView(o: OrderRow): OrderCustomerView {
  const total = minorToMoney(o.totalInr, o.totalAed);
  return {
    id: o.id,
    reference: o.reference,
    status: o.status,
    placedAt: o.placedAt.toISOString(),
    paidAt: iso(o.paidAt),
    confirmedAt: iso(o.confirmedAt),
    cancelledAt: iso(o.cancelledAt),
    currency: o.currency,
    totals: {
      subtotal: minorToMoney(o.subtotalInr, o.subtotalAed),
      discount: minorToMoney(o.discountInr, o.discountAed),
      tax: minorToMoney(o.taxInr, o.taxAed),
      total,
    },
    total,
    items: o.items.map((i) => ({
      id: i.id,
      title: i.titleSnapshot,
      image: i.imageSnapshot ?? undefined,
      date: dateKey(i.serviceDate),
      time: i.timeslot ?? undefined,
      pax: (i.pax as unknown as PaxCount | null) ?? undefined,
      total: minorToMoney(i.totalInr, i.totalAed),
      status: i.status,
    })),
    sourceInquiryReference: o.sourceInquiry?.reference,
  };
}

export const customerRepo = {
  /* ------------------------------------------------------------ customers */

  async findById(id: string, db: Db = prisma): Promise<CustomerRecord | null> {
    const c = await db.customer.findUnique({ where: { id } });
    return c && !c.deletedAt ? toRecord(c) : null;
  },

  async findByPhone(phoneE164: string, db: Db = prisma): Promise<CustomerRecord | null> {
    const c = await db.customer.findUnique({ where: { phoneE164 } });
    return c && !c.deletedAt ? toRecord(c) : null;
  },

  /** Implicit account creation on first verified OTP (contract §1). */
  async findOrCreateByPhone(
    phoneE164: string,
    db: Db = prisma,
  ): Promise<{ customer: CustomerRecord; created: boolean }> {
    const existing = await db.customer.findUnique({ where: { phoneE164 } });
    if (existing) return { customer: toRecord(existing), created: false };
    const created = await db.customer.create({ data: { id: uuidv7(), phoneE164 } });
    return { customer: toRecord(created), created: true };
  },

  async updateProfile(
    id: string,
    patch: {
      fullName?: string | null;
      email?: string | null;
      dietary?: Dietary | null;
      hotel?: string | null;
      preferredCurrency?: Currency;
    },
    db: Db = prisma,
  ): Promise<CustomerRecord> {
    const c = await db.customer.update({ where: { id }, data: patch });
    return toRecord(c);
  },

  async touchLogin(id: string, at: Date, db: Db = prisma): Promise<void> {
    await db.customer.update({ where: { id }, data: { lastLoginAt: at } });
  },

  /* --------------------------------------------------------- otp challenges */

  async createChallenge(
    input: { id: string; phoneE164: string; codeHash: string; expiresAt: Date; ipHash?: string },
    db: Db = prisma,
  ): Promise<OtpChallengeRecord> {
    return db.otpChallenge.create({ data: input });
  },

  async findChallenge(id: string, db: Db = prisma): Promise<OtpChallengeRecord | null> {
    return db.otpChallenge.findUnique({ where: { id } });
  },

  /** Atomic attempt bump — returns the new count so the cap is enforced against a value nobody else can race. */
  async bumpAttempts(id: string, db: Db = prisma): Promise<number> {
    const r = await db.otpChallenge.update({ where: { id }, data: { attempts: { increment: 1 } }, select: { attempts: true } });
    return r.attempts;
  },

  /** Single-use: the first caller to consume wins; a second call returns false. */
  async consumeChallenge(id: string, at: Date, db: Db = prisma): Promise<boolean> {
    const r = await db.otpChallenge.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: at } });
    return r.count === 1;
  },

  /** Requesting a new code retires older open codes for the same phone — one live code at a time. */
  async retireOpenChallenges(phoneE164: string, at: Date, db: Db = prisma): Promise<number> {
    const r = await db.otpChallenge.updateMany({ where: { phoneE164, consumedAt: null }, data: { consumedAt: at } });
    return r.count;
  },

  /* --------------------------------------------------------------- sessions */

  async createSession(
    input: { id: string; customerId: string; tokenHash: string; userAgent?: string; ipHash?: string; expiresAt: Date },
    db: Db = prisma,
  ): Promise<CustomerSessionRecord> {
    return db.customerSession.create({ data: input });
  },

  async findSessionByTokenHash(
    tokenHash: string,
    db: Db = prisma,
  ): Promise<{ session: CustomerSessionRecord; customer: CustomerRecord } | null> {
    const s = await db.customerSession.findUnique({ where: { tokenHash }, include: { customer: true } });
    if (!s || s.customer.deletedAt) return null;
    return {
      session: { id: s.id, customerId: s.customerId, expiresAt: s.expiresAt, revokedAt: s.revokedAt, createdAt: s.createdAt },
      customer: toRecord(s.customer),
    };
  },

  async extendSession(id: string, expiresAt: Date, db: Db = prisma): Promise<void> {
    await db.customerSession.updateMany({ where: { id, revokedAt: null }, data: { expiresAt } });
  },

  async revokeSessionByTokenHash(tokenHash: string, at: Date, db: Db = prisma): Promise<CustomerSessionRecord | null> {
    const s = await db.customerSession.findUnique({ where: { tokenHash } });
    if (!s || s.revokedAt) return null;
    await db.customerSession.update({ where: { id: s.id }, data: { revokedAt: at } });
    return { id: s.id, customerId: s.customerId, expiresAt: s.expiresAt, revokedAt: at, createdAt: s.createdAt };
  },

  async revokeAllSessions(customerId: string, at: Date, db: Db = prisma): Promise<number> {
    const r = await db.customerSession.updateMany({ where: { customerId, revokedAt: null }, data: { revokedAt: at } });
    return r.count;
  },

  /* ---------------------------------------------------------------- linking */

  /**
   * Verified identity only (contract §1, §13.2.1): every inquiry and order whose
   * `lead_phone` equals the verified phone and is not yet linked gets this
   * customer. Rows already linked to another customer are left alone — a
   * phone can be re-issued, and the earlier owner's history must not move.
   */
  async linkByPhone(customerId: string, phoneE164: string, db: Db = prisma): Promise<{ inquiries: number; orders: number }> {
    const [inq, ord] = await Promise.all([
      db.inquiry.updateMany({ where: { leadPhone: phoneE164, customerId: null }, data: { customerId } }),
      db.order.updateMany({ where: { leadPhone: phoneE164, customerId: null }, data: { customerId } }),
    ]);
    return { inquiries: inq.count, orders: ord.count };
  },

  /* ----------------------------------------------------------------- orders */

  /** Orders by verified identity (`customer_id`) or by the verified phone — newest first. */
  async listOrders(customerId: string, phoneE164: string, db: Db = prisma): Promise<OrderCustomerView[]> {
    const rows = await db.order.findMany({
      where: { OR: [{ customerId }, { leadPhone: phoneE164 }] },
      include: orderInclude,
      orderBy: { placedAt: "desc" },
      take: 200,
    });
    return rows.map(toOrderView);
  },

  /* --------------------------------------------------------------- consents */

  async listConsents(phoneE164: string, db: Db = prisma): Promise<ConsentView[]> {
    const rows = await db.consent.findMany({
      where: { phoneE164 },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { channel: true, purpose: true, granted: true, source: true, createdAt: true },
    });
    return rows.map((r) => ({ channel: r.channel, purpose: r.purpose, granted: r.granted, source: r.source, createdAt: r.createdAt.toISOString() }));
  },

  /** Latest grant per (channel, purpose) for a phone — `null` when no row exists. */
  async latestConsentByPhone(
    phoneE164: string,
    channel: "whatsapp" | "email" | "sms" | "push",
    purpose: "transactional" | "marketing" | "recovery",
    db: Db = prisma,
  ): Promise<boolean | null> {
    const r = await db.consent.findFirst({
      where: { phoneE164, channel, purpose },
      orderBy: { createdAt: "desc" },
      select: { granted: true },
    });
    return r ? r.granted : null;
  },
};
