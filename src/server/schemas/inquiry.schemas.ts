import "server-only";
import { z } from "zod";
import { LOST_REASONS } from "../domain/inquiry-state";

/**
 * Request schemas for the inquiry routes (`/api/inquiries/*`, `/api/agent/*`).
 * Every object schema is `.strict()` so unknown keys are rejected at the edge
 * (§19 §0 Validation). Messages are written for the customer or the agent —
 * never echo the raw input back.
 *
 * Length caps mirror the service's `cleanText` limits so a payload that passes
 * here is never silently truncated later.
 */

/* ------------------------------------------------------------ primitives */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const uuidSchema = z.string().regex(UUID_RE, "Invalid id");
export const dateKeySchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD");

export const INQUIRY_STATUSES = [
  "new",
  "assigned",
  "contacted",
  "quoted",
  "negotiating",
  "payment_pending",
  "won",
  "lost",
  "spam",
] as const;

/** Sources a browser may claim. `agent_created` and `whatsapp` are set by staff or webhooks, never by the public form. */
export const PUBLIC_INQUIRY_SOURCES = ["inquiry_form", "quote_request", "contact_form", "concierge", "abandoned_cart"] as const;
export const ALL_INQUIRY_SOURCES = [...PUBLIC_INQUIRY_SOURCES, "whatsapp", "agent_created"] as const;

const moneySchema = z
  .object({
    inr: z.number().finite().min(0).max(1_000_000_000),
    aed: z.number().finite().min(0).max(1_000_000_000),
  })
  .strict();

export const paxSchema = z
  .object({
    adult: z.number().int().min(0).max(99),
    child: z.number().int().min(0).max(99),
    infant: z.number().int().min(0).max(99),
    senior: z.number().int().min(0).max(99),
  })
  .strict();

/** Mirrors `CartItem` (src/lib/types.ts). Prices are accepted only to record a mismatch — the server re-prices. */
export const cartItemSchema = z
  .object({
    id: z.string().min(1).max(120),
    kind: z.enum(["activity", "combo"]),
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "Invalid item"),
    title: z.string().min(1).max(200),
    image: z.string().max(500),
    date: z.union([dateKeySchema, z.literal("")]),
    time: z.string().max(40),
    variantId: z.string().max(80).optional(),
    variantName: z.string().max(120).optional(),
    pax: paxSchema,
    addOnIds: z.array(z.string().max(80)).max(20),
    unit: moneySchema,
    total: moneySchema,
    confirmation: z.enum(["instant", "manual"]),
    fulfilmentMode: z.enum(["inquiry", "instant"]),
    freeCancellationHours: z.number().int().min(0).max(24 * 365),
    durationMinutes: z.number().int().min(0).max(60 * 24 * 30),
  })
  .strict();

/** First-party attribution captured by the client (utm, click ids, referrer, landing). Bounded so it cannot be abused as free storage. */
const attributionSchema = z
  .record(z.string().max(64), z.union([z.string().max(512), z.number(), z.boolean(), z.null()]))
  .refine((r) => Object.keys(r).length <= 30, "Too many attribution keys");

/* --------------------------------------------------------------- public */

export const createInquirySchema = z
  .object({
    items: z.array(cartItemSchema).max(12, "Too many items for one inquiry — message us on WhatsApp instead"),
    leadName: z.string().trim().min(1, "So we know who to reply to.").max(120),
    leadPhone: z.string().trim().min(5, "Check the WhatsApp number").max(24),
    countryCode: z.string().trim().regex(/^\+?\d{1,4}$/, "Check the country code"),
    leadEmail: z.string().trim().max(200).optional(),
    travelDateFrom: dateKeySchema.optional(),
    travelDateTo: dateKeySchema.optional(),
    datesFlexible: z.boolean(),
    pax: paxSchema.optional(),
    hotel: z.string().max(200).optional(),
    dietary: z.enum(["veg", "jain", "halal", "non-veg"]).optional(),
    specialRequests: z.string().max(1000).optional(),
    budgetBand: z.enum(["under_25k", "25k_60k", "60k_150k", "150k_plus", "unsure"]).optional(),
    currency: z.enum(["INR", "AED"]),
    source: z.enum(PUBLIC_INQUIRY_SOURCES),
    whatsappConsent: z.boolean(),
    honeypot: z.string().max(500).optional(),
    startedAt: z.number().finite().optional(),
    attribution: attributionSchema.optional(),
    sessionId: z.string().max(80).optional(),
    anonId: z.string().max(80).optional(),
  })
  .strict();

export type CreateInquiryBody = z.infer<typeof createInquirySchema>;

export const lookupInquirySchema = z
  .object({
    reference: z.string().trim().min(5).max(20),
    phone: z.string().trim().min(5).max(24),
    countryCode: z.string().trim().regex(/^\+?\d{1,4}$/).optional(),
  })
  .strict();

/* ---------------------------------------------------------------- agent */

const boolFromQuery = z
  .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
  .transform((v) => v === "true" || v === "1");

const intFromQuery = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(min).max(max));

/** `?status=new&status=assigned` or `?status=new,assigned` both work. */
const statusListFromQuery = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.enum(INQUIRY_STATUSES)).max(INQUIRY_STATUSES.length));

export const listInquiriesQuerySchema = z
  .object({
    status: statusListFromQuery.optional(),
    assignedAgentId: z.union([z.literal("unassigned"), z.literal("me"), uuidSchema]).optional(),
    q: z.string().trim().max(100).optional(),
    source: z.enum(ALL_INQUIRY_SOURCES).optional(),
    from: dateKeySchema.optional(),
    to: dateKeySchema.optional(),
    slaBreached: boolFromQuery.optional(),
    sort: z.enum(["newest", "oldest", "sla", "value"]).optional(),
    page: intFromQuery(1, 100_000).optional(),
    pageSize: intFromQuery(1, 100).optional(),
  })
  .strict();

export const assignInquirySchema = z
  .object({
    agentId: uuidSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const transitionInquirySchema = z
  .object({
    to: z.enum(INQUIRY_STATUSES),
    reason: z.union([z.enum(LOST_REASONS), z.string().trim().max(200)]).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

export const addNoteSchema = z
  .object({
    note: z.string().trim().min(1, "Write something first").max(2000),
  })
  .strict();

export const logContactSchema = z
  .object({
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

export const updateItemSchema = z
  .object({
    confirmedTotal: moneySchema.nullable().optional(),
    availabilityNote: z.string().max(500).optional(),
    availabilityChecked: z.boolean().optional(),
  })
  .strict()
  .refine((p) => p.confirmedTotal !== undefined || p.availabilityNote !== undefined || p.availabilityChecked !== undefined, {
    message: "Nothing to update",
  });

export const markSpamSchema = z
  .object({
    reason: z.string().trim().min(1, "Give a reason").max(200),
    suppress: z.boolean().default(false),
  })
  .strict();

export const convertInquirySchema = z
  .object({
    paymentLinkUrl: z.string().trim().url().max(500).optional(),
    paymentLinkId: z.string().trim().max(100).optional(),
    gatewayPaymentId: z.string().trim().max(100).optional(),
    amountPaidInr: z.number().finite().min(0).max(100_000_000).optional(),
    method: z.string().trim().max(50).optional(),
    paidAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: uuidSchema }).strict();
export const itemParamSchema = z.object({ id: uuidSchema, itemId: uuidSchema }).strict();
