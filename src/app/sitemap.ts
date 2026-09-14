import type { MetadataRoute } from "next";
import { activities } from "@/lib/data/activities";
import { categories } from "@/lib/data/categories";
import { attractions, collections } from "@/lib/data/collections";
import { combos } from "@/lib/data/combos";
import { landingPages } from "@/lib/data/landing-pages";

const BASE = "https://outly.in";

/**
 * XML sitemap (PRD §7).
 *
 * Only indexable pages appear. Search, compare, cart, checkout, account,
 * vouchers and booking lookups are excluded — faceted and personal URLs waste
 * crawl budget and, in the case of vouchers, must never be indexed at all
 * (they also carry `robots: noindex` on the page itself).
 *
 * Priorities express the take-rate ladder rather than a guess: attraction hubs
 * and landing pages rank, category and combo pages convert.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const statics: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/activities`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/concierge`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/support`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/cancellation-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/price-guarantee`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  return [
    ...statics,
    ...landingPages.map((p) => ({
      url: p.topLevel ? `${BASE}/${p.slug}` : `${BASE}/lp/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: p.topLevel ? 0.9 : 0.8,
    })),
    ...categories.map((c) => ({
      url: `${BASE}/categories/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    ...attractions.map((a) => ({
      url: `${BASE}/attractions/${a.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
    ...collections.map((c) => ({
      url: `${BASE}/collections/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    })),
    ...combos.map((c) => ({
      url: `${BASE}/combos/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
    ...activities.map((a) => ({
      url: `${BASE}/activities/${a.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: a.tier === "A" ? 0.7 : 0.9,
    })),
  ];
}
