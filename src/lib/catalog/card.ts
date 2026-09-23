import type { Activity } from "@/lib/types";

/**
 * What a listing card needs. Server pages pass `toCard(activity)` to the
 * client `ActivityCard` so the RSC payload carries ~1 KB per card instead of
 * the full document (FAQ, itinerary, policies, SEO…): measured 295 KB → ~40 KB
 * of serialised props on the homepage. Pricing (`computeBreakdown`) and
 * availability helpers are typed against this shape too.
 */
export type CardActivity = Omit<
  Activity,
  "faqs" | "itinerary" | "importantInfo" | "inclusions" | "exclusions" | "seo" | "cancellationPolicy" | "meetingPoint" | "pickupZones" | "supplier" | "mealNote" | "relatedSlugs" | "comboSlugs" | "secondaryCategorySlugs" | "collectionSlugs" | "video" | "attractionSlug"
>;

export function toCard(a: Activity): CardActivity {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    subtitle: a.subtitle,
    tier: a.tier,
    categorySlug: a.categorySlug,
    images: a.images,
    imageAlt: a.imageAlt,
    rating: a.rating,
    reviewCount: a.reviewCount,
    bookedThisMonth: a.bookedThisMonth,
    durationMinutes: a.durationMinutes,
    isPrivate: a.isPrivate,
    pickupIncluded: a.pickupIncluded,
    confirmation: a.confirmation,
    fulfilmentMode: a.fulfilmentMode,
    freeCancellationHours: a.freeCancellationHours,
    mobileVoucher: a.mobileVoucher,
    dietary: a.dietary,
    suitability: a.suitability,
    location: a.location,
    timeSlots: a.timeSlots,
    price: a.price,
    quoteOnly: a.quoteOnly,
    variants: a.variants,
    addOns: a.addOns,
    badges: a.badges,
  };
}
