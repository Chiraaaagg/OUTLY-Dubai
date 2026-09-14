import { activities } from "./data/activities";
import { getAvailability, today, tomorrow } from "./availability";
import type { Activity, SearchFilters, SearchResult, SortKey } from "./types";

/**
 * Search, filtering and ranking.
 *
 * "Recommended" is business-weighted, not pure relevance (PRD §5.3). Pure
 * relevance surfaces Tier A attraction tickets and destroys the take rate.
 * These weights are the thing an admin edits without a deploy (AC-SRCH-05);
 * they live in one object so that swap is a config read, not a refactor.
 */
export const RANKING_WEIGHTS = {
  relevance: 0.4,
  conversion: 0.2,
  margin: 0.25,
  supplierReliability: 0.15,
  /** Margin score by tier — the take-rate ladder expressed as ranking bias. */
  tierScore: { A: 0.15, B: 0.85, C: 1, D: 0.9, E: 0.7 } as Record<string, number>,
};

const DURATION_BUCKETS: Record<string, (m: number) => boolean> = {
  short: (m) => m <= 120,
  half: (m) => m > 120 && m <= 300,
  full: (m) => m > 300,
  any: () => true,
};

function textScore(a: Activity, q?: string): number {
  if (!q) return 0.5;
  const needle = q.trim().toLowerCase();
  if (!needle) return 0.5;
  const haystacks: [string, number][] = [
    [a.title.toLowerCase(), 1],
    [a.subtitle.toLowerCase(), 0.6],
    [a.categorySlug, 0.5],
    [a.location.toLowerCase(), 0.4],
    [a.seo.keywords.join(" "), 0.5],
    [a.collectionSlugs.join(" "), 0.3],
  ];
  let best = 0;
  for (const [hay, weight] of haystacks) {
    if (hay.includes(needle)) best = Math.max(best, weight);
    else {
      const words = needle.split(/\s+/).filter(Boolean);
      const hits = words.filter((w) => w.length > 2 && hay.includes(w)).length;
      if (hits) best = Math.max(best, (hits / words.length) * weight * 0.8);
    }
  }
  return best;
}

export function matches(a: Activity, f: SearchFilters): boolean {
  if (f.q && textScore(a, f.q) === 0) return false;
  if (f.category && a.categorySlug !== f.category && !a.secondaryCategorySlugs.includes(f.category))
    return false;
  if (f.minPrice != null && a.price.adult.inr < f.minPrice) return false;
  if (f.maxPrice != null && a.price.adult.inr > f.maxPrice) return false;
  if (f.dietary?.length && !f.dietary.every((d) => a.dietary.includes(d))) return false;
  if (f.suitability?.length && !f.suitability.every((s) => a.suitability.includes(s))) return false;
  if (f.privateOnly && !a.isPrivate && !a.variants.some((v) => v.isPrivate)) return false;
  if (f.pickup && !a.pickupIncluded) return false;
  // "Instant" means instant *fulfilment*, not the supplier's confirmation type.
  if (f.instant && a.fulfilmentMode !== "instant") return false;
  if (f.freeCancellation && a.freeCancellationHours <= 0) return false;
  if (f.rating && a.rating < f.rating) return false;
  if (f.duration && f.duration !== "any" && !DURATION_BUCKETS[f.duration](a.durationMinutes))
    return false;

  // Availability is only asserted for instant-mode SKUs. In inquiry mode
  // "unknown" is not "unavailable" — a short-notice traveller is still a lead,
  // and the agent checks the real answer (pivot §3.7: no invented scarcity).
  const date = f.when === "today" ? today() : f.when === "tomorrow" ? tomorrow() : f.date;
  if (date && a.fulfilmentMode === "instant" && getAvailability(a, date).status === "sold_out")
    return false;

  return true;
}

function recommendedScore(a: Activity, f: SearchFilters): number {
  const w = RANKING_WEIGHTS;
  const relevance = textScore(a, f.q);
  // Proxy for conversion rate until we have real data; review volume + rating.
  const conversion = Math.min(1, (a.rating / 5) * 0.6 + Math.min(a.bookedThisMonth / 1200, 1) * 0.4);
  const margin = w.tierScore[a.tier] ?? 0.5;
  const reliability = a.supplier.reliability / 100;
  return (
    relevance * w.relevance +
    conversion * w.conversion +
    margin * w.margin +
    reliability * w.supplierReliability
  );
}

export function sortActivities(list: Activity[], sort: SortKey, f: SearchFilters): Activity[] {
  const copy = [...list];
  switch (sort) {
    case "price_asc":
      return copy.sort((a, b) => a.price.adult.inr - b.price.adult.inr);
    case "price_desc":
      return copy.sort((a, b) => b.price.adult.inr - a.price.adult.inr);
    case "rating":
      return copy.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    case "popularity":
      return copy.sort((a, b) => b.bookedThisMonth - a.bookedThisMonth);
    case "duration":
      return copy.sort((a, b) => a.durationMinutes - b.durationMinutes);
    default:
      return copy.sort((a, b) => recommendedScore(b, f) - recommendedScore(a, f));
  }
}

/**
 * AC-SRCH-01: never render an empty state from over-constrained filters.
 * We relax one constraint at a time, most-restrictive first, and name the one
 * we dropped so the customer understands what changed.
 */
const RELAXATION_ORDER: {
  key: keyof SearchFilters;
  /** One complete sentence naming the constraint we dropped and what is shown. */
  describe: (f: SearchFilters) => string;
}[] = [
  {
    key: "dietary",
    describe: (f) =>
      `No ${f.dietary?.join(" and ")} options match your other filters. Showing everything else that fits — check the food notes on each card, and ask us if you need it confirmed with the kitchen.`,
  },
  {
    key: "when",
    describe: (f) => `Nothing is available ${f.when}. Showing the same experiences on other dates.`,
  },
  { key: "date", describe: () => "Nothing is available on that date. Showing other dates." },
  {
    key: "suitability",
    describe: () =>
      "Nothing matches every suitability filter. Showing the closest options — the attributes are listed on each card.",
  },
  {
    key: "privateOnly",
    describe: () => "No private-only options here. Showing shared experiences, several of which have a private upgrade.",
  },
  { key: "pickup", describe: () => "Nothing here includes hotel pickup. Showing options you meet at the venue — most can add a transfer." },
  { key: "duration", describe: () => "Nothing in that duration. Showing everything else that matches." },
  {
    key: "maxPrice",
    describe: (f) =>
      `Nothing under ₹${f.maxPrice?.toLocaleString("en-IN")} matches. Showing the next cheapest options.`,
  },
  { key: "rating", describe: () => "Nothing at that rating. Showing the highest-rated alternatives." },
  { key: "instant", describe: () => "No instant-confirmation options. Showing experiences the operator confirms within two hours." },
  { key: "freeCancellation", describe: () => "No free-cancellation options here. Showing the rest — each card states its policy." },
];

function relax(f: SearchFilters): { message: string; activities: Activity[] } | undefined {
  for (const step of RELAXATION_ORDER) {
    if (f[step.key] == null) continue;
    const next: SearchFilters = { ...f, [step.key]: undefined };
    const hits = activities.filter((a) => matches(a, next));
    if (hits.length) {
      return {
        message: step.describe(f),
        activities: sortActivities(hits, next.sort ?? "recommended", next).slice(0, 8),
      };
    }
  }
  return undefined;
}

export const PAGE_SIZE = 12;

export function searchActivities(filters: SearchFilters): SearchResult {
  const hits = activities.filter((a) => matches(a, filters));
  const sorted = sortActivities(hits, filters.sort ?? "recommended", filters);
  return {
    activities: sorted,
    total: sorted.length,
    relaxed: sorted.length === 0 ? relax(filters) : undefined,
    appliedFilters: filters,
  };
}

/** Search suggestions — the homepage/header autocomplete. */
export interface Suggestion {
  label: string;
  sub: string;
  href: string;
  kind: "activity" | "category" | "collection" | "attraction" | "intent";
}

export const POPULAR_SEARCHES: Suggestion[] = [
  { label: "Desert safari with Jain food", sub: "Most searched", href: "/activities/evening-desert-safari-veg-jain", kind: "intent" },
  { label: "Burj Khalifa tickets", sub: "From ₹3,690", href: "/lp/burj-khalifa-tickets", kind: "intent" },
  { label: "Short notice — this week", sub: "We check same-day", href: "/search?when=tomorrow", kind: "intent" },
  { label: "Dhow cruise dinner", sub: "From ₹1,990", href: "/lp/marina-cruise-dubai", kind: "intent" },
  { label: "Abu Dhabi day trip", sub: "Grand Mosque included", href: "/abu-dhabi-day-tours-from-dubai", kind: "intent" },
  { label: "Things to do with kids", sub: "Curated for families", href: "/collections/dubai-with-kids", kind: "intent" },
];

export function suggest(query: string, limit = 7): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return POPULAR_SEARCHES.slice(0, limit);
  return activities
    .map((a) => ({ a, score: textScore(a, q) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(({ a }) => ({
      label: a.title,
      sub: `${a.location.split("·")[0].trim()} · from ₹${a.price.adult.inr.toLocaleString("en-IN")}`,
      href: `/activities/${a.slug}`,
      kind: "activity" as const,
    }));
}

/** Filters that matter to Indian travellers, in the order they matter. */
export const FILTER_GROUPS = [
  { id: "when", label: "When" },
  { id: "price", label: "Price" },
  { id: "category", label: "Category" },
  { id: "dietary", label: "Food" },
  { id: "suitability", label: "Who's coming" },
  { id: "convenience", label: "Booking convenience" },
  { id: "duration", label: "Duration" },
  { id: "rating", label: "Rating" },
] as const;
