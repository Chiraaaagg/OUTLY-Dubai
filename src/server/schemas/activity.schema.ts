import { z } from "zod";
import type { Activity, Category } from "@/lib/types";

/**
 * Catalogue content contract — the zod mirror of `Activity` and `Category`
 * (src/lib/types.ts). Every object level is `.strict()` so an import row or
 * admin payload cannot smuggle unknown keys into `products.content` (mass
 * assignment, §12.13). Arrays and strings are capped so a hostile CSV cannot
 * balloon a row. Money is validated as non-negative integers in major units,
 * matching the fixtures and `computeBreakdown`.
 *
 * Domain-level (no "server-only") so the admin form can reuse the field lists
 * for client-side hints; nothing here touches the database.
 */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugSchema = z.string().trim().toLowerCase().min(3).max(80).regex(SLUG_RE, "Use lowercase letters, numbers and single hyphens");

const short = (max: number) => z.string().trim().min(1).max(max);
const text = (max: number) => z.string().trim().max(max);
const strList = (itemMax: number, max: number) => z.array(z.string().trim().min(1).max(itemMax)).max(max);

export const TIERS = ["A", "B", "C", "D", "E"] as const;
export const DIETARY = ["veg", "jain", "halal", "non-veg"] as const;
export const SUITABILITY = ["kids", "seniors", "wheelchair", "infant", "couples", "groups"] as const;
export const ADDON_CATEGORIES = ["transfer", "meal", "photo", "occasion", "access", "comfort"] as const;
export const SUPPLY_SOURCES = ["direct", "rayna", "portal"] as const;

export const moneySchema = z.object({ inr: z.number().int().min(0).max(10_000_000), aed: z.number().int().min(0).max(1_000_000) }).strict();
/** Deltas may be negative (variant discounts). */
const deltaSchema = z.object({ inr: z.number().int().min(-10_000_000).max(10_000_000), aed: z.number().int().min(-1_000_000).max(1_000_000) }).strict();

export const priceBandSchema = z
  .object({
    adult: moneySchema,
    child: moneySchema.optional(),
    infant: moneySchema.optional(),
    senior: moneySchema.optional(),
    compareAt: moneySchema.optional(),
  })
  .strict();

export const variantSchema = z
  .object({
    id: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/),
    name: short(80),
    blurb: text(240),
    delta: deltaSchema,
    highlights: strList(120, 8),
    isPrivate: z.boolean(),
    soldOut: z.boolean().optional(),
    recommended: z.boolean().optional(),
    accessibilityNote: text(200).optional(),
  })
  .strict();

export const addOnSchema = z
  .object({
    id: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/),
    name: short(80),
    description: text(240),
    price: moneySchema,
    perPerson: z.boolean(),
    category: z.enum(ADDON_CATEGORIES),
  })
  .strict();

export const itineraryStopSchema = z
  .object({ time: short(20), title: short(100), detail: text(400), durationMin: z.number().int().min(0).max(1440).optional() })
  .strict();

export const faqSchema = z.object({ q: short(200), a: short(1500) }).strict();

export const supplierSchema = z
  .object({
    id: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/),
    name: short(120),
    source: z.enum(SUPPLY_SOURCES),
    reliability: z.number().int().min(0).max(100),
    verifiedSince: z.string().trim().regex(/^\d{4}(-\d{2}){0,2}$/, "YYYY, YYYY-MM or YYYY-MM-DD"),
  })
  .strict();

/** Image = `img:<kind>:<slug>:<index>` ref or an https URL. */
export const imageSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((v) => /^img:(activity|combo|category|collection|attraction|landing|scene):[a-z0-9-]+(:\d{1,2})?$/.test(v) || /^https:\/\/[^\s]+$/i.test(v), "Use an img: ref or an https:// URL");

export const badgesSchema = z
  .object({ bestseller: z.boolean().optional(), newlyAdded: z.boolean().optional(), editorPick: z.boolean().optional(), sellingFast: z.boolean().optional() })
  .strict();

export const seoSchema = z.object({ title: short(120), description: short(320), keywords: strList(80, 20) }).strict();

/**
 * Editable payload — everything the admin/import controls. Derived fields
 * (`id`, `rating`, `reviewCount`, `bookedThisMonth`) are excluded: reviews
 * own rating, analytics own the booked counter.
 */
const activityShape = {
    slug: slugSchema,
    title: short(120),
    subtitle: short(200),
    tier: z.enum(TIERS),
    categorySlug: slugSchema,
    secondaryCategorySlugs: z.array(slugSchema).max(6).default([]),
    attractionSlug: slugSchema.optional(),
    collectionSlugs: z.array(slugSchema).max(10).default([]),
    images: z.array(imageSchema).min(1).max(12),
    imageAlt: short(200),
    video: z.string().trim().url().max(500).optional(),
    /** Minutes; 0 = not stated (supplier feeds often omit it). Short rides (zipline 3 min, iFly 2 min) are real. */
    durationMinutes: z.number().int().min(0).max(7 * 1440),
    isPrivate: z.boolean().default(false),
    pickupIncluded: z.boolean().default(false),
    pickupZones: strList(80, 20).default([]),
    confirmation: z.enum(["instant", "manual"]).default("manual"),
    fulfilmentMode: z.enum(["inquiry", "instant"]).default("inquiry"),
    freeCancellationHours: z.number().int().min(0).max(24 * 30).default(24),
    mobileVoucher: z.boolean().default(true),
    dietary: z.array(z.enum(DIETARY)).max(4).default([]),
    suitability: z.array(z.enum(SUITABILITY)).max(6).default([]),
    location: short(120),
    meetingPoint: short(240),
    timeSlots: strList(80, 24).default([]),
    price: priceBandSchema,
    quoteOnly: z.boolean().optional(),
    inclusions: strList(300, 30).default([]),
    exclusions: strList(300, 30).default([]),
    itinerary: z.array(itineraryStopSchema).max(30).default([]),
    importantInfo: strList(600, 30).default([]),
    cancellationPolicy: short(600),
    mealNote: text(300).optional(),
    variants: z.array(variantSchema).max(12).default([]),
    addOns: z.array(addOnSchema).max(20).default([]),
    faqs: z.array(faqSchema).max(30).default([]),
    relatedSlugs: z.array(slugSchema).max(12).default([]),
    comboSlugs: z.array(slugSchema).max(12).default([]),
    supplier: supplierSchema,
    badges: badgesSchema.default({}),
    seo: seoSchema,
};

function refineActivity(v: { fulfilmentMode: string; confirmation: string; variants: { id: string }[]; addOns: { id: string }[]; relatedSlugs: string[]; slug: string }, ctx: z.RefinementCtx) {
    if (v.fulfilmentMode === "instant" && v.confirmation !== "instant") {
      ctx.addIssue({ code: "custom", path: ["fulfilmentMode"], message: "Instant fulfilment requires instant supplier confirmation" });
    }
    const ids = new Set<string>();
    for (const [i, x] of v.variants.entries()) {
      if (ids.has(x.id)) ctx.addIssue({ code: "custom", path: ["variants", i, "id"], message: "Duplicate variant id" });
      ids.add(x.id);
    }
    const addIds = new Set<string>();
    for (const [i, x] of v.addOns.entries()) {
      if (addIds.has(x.id)) ctx.addIssue({ code: "custom", path: ["addOns", i, "id"], message: "Duplicate add-on id" });
      addIds.add(x.id);
    }
    if (v.relatedSlugs.includes(v.slug)) ctx.addIssue({ code: "custom", path: ["relatedSlugs"], message: "An activity cannot relate to itself" });
}

export const activityInputSchema = z.object(activityShape).strict().superRefine(refineActivity);
export type ActivityInput = z.infer<typeof activityInputSchema>;

/** Full stored document = input + derived fields. */
export const activitySchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    rating: z.number().min(0).max(5),
    reviewCount: z.number().int().min(0),
    bookedThisMonth: z.number().int().min(0),
    ...activityShape,
  })
  .strict()
  .superRefine(refineActivity);

/** Fields the import wizard can map a column onto (order = wizard order). */
export const IMPORT_FIELDS = [
  "slug", "title", "subtitle", "tier", "categorySlug", "secondaryCategorySlugs", "attractionSlug", "collectionSlugs",
  "images", "imageAlt", "video", "durationMinutes", "isPrivate", "pickupIncluded", "pickupZones", "confirmation",
  "freeCancellationHours", "mobileVoucher", "dietary", "suitability", "location", "meetingPoint", "timeSlots",
  "price.adult.inr", "price.adult.aed", "price.child.inr", "price.child.aed", "price.infant.inr", "price.infant.aed",
  "price.senior.inr", "price.senior.aed", "price.compareAt.inr", "price.compareAt.aed", "quoteOnly",
  "inclusions", "exclusions", "itinerary", "importantInfo", "cancellationPolicy", "mealNote",
  "variants", "addOns", "faqs", "relatedSlugs", "comboSlugs",
  "supplier.id", "supplier.name", "supplier.source", "supplier.reliability", "supplier.verifiedSince",
  "badges", "seo.title", "seo.description", "seo.keywords",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Columns that must be present for a row to be importable as a new activity. */
export const IMPORT_REQUIRED: ImportField[] = ["slug", "title", "subtitle", "tier", "categorySlug", "durationMinutes", "location", "meetingPoint", "price.adult.inr", "price.adult.aed", "cancellationPolicy", "seo.title", "seo.description"];

/* --------------------------------------------------------------- category */

export const categoryInputSchema = z
  .object({
    slug: slugSchema,
    name: short(80),
    shortName: short(30),
    emoji: text(8).default(""),
    tagline: text(120).default(""),
    intro: text(2000).default(""),
    heroImage: imageSchema.optional(),
    faqs: z.array(faqSchema).max(20).default([]),
    relatedSlugs: z.array(slugSchema).max(12).default([]),
    featuredSlugs: z.array(slugSchema).max(12).default([]),
    sortOrder: z.number().int().min(0).max(10_000).default(100),
  })
  .strict();
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/* ------------------------------------------------------------ converters */

/** Stored content (already validated) → the storefront `Activity` shape. */
export function toActivity(content: unknown): Activity {
  return activitySchema.parse(content) as Activity;
}

export function toCategory(row: { slug: string; name: string; shortName: string; emoji: string; tagline: string; intro: string; heroImage: string; faqs: unknown; relatedSlugs: string[]; featuredSlugs: string[] }): Category {
  return {
    slug: row.slug,
    name: row.name,
    shortName: row.shortName,
    emoji: row.emoji,
    tagline: row.tagline,
    intro: row.intro,
    heroImage: row.heroImage || `img:category:${row.slug}:0`,
    faqs: z.array(faqSchema).catch([]).parse(row.faqs),
    relatedSlugs: row.relatedSlugs,
    featuredSlugs: row.featuredSlugs,
  };
}

/** Input + derived fields → stored document. */
export function buildActivityContent(input: ActivityInput, derived: { id: string; rating: number; reviewCount: number; bookedThisMonth: number }): Activity {
  return activitySchema.parse({ ...derived, ...input }) as Activity;
}

/** Projection of the document onto the indexed scalar columns of `products`. */
export function projectActivity(a: Activity) {
  return {
    title: a.title,
    subtitle: a.subtitle,
    tier: a.tier,
    categorySlug: a.categorySlug,
    confirmation: a.confirmation,
    quoteOnly: Boolean(a.quoteOnly),
    location: a.location,
    durationMinutes: a.durationMinutes,
    priceFromInr: BigInt(Math.round(a.price.adult.inr * 100)),
    priceFromAed: BigInt(Math.round(a.price.adult.aed * 100)),
    rating: a.rating,
    reviewCount: a.reviewCount,
    isPrivate: a.isPrivate,
    pickupIncluded: a.pickupIncluded,
    dietary: a.dietary,
    suitability: a.suitability,
    seoTitle: a.seo.title,
    seoDescription: a.seo.description,
  };
}
