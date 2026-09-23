import type { Activity, Category } from "@/lib/types";

/**
 * The slice of the catalogue that chrome-level client code needs on every
 * page (header search suggestions, category menus, filter chips): ~6 KB
 * instead of the ~110 KB full snapshot. Pure module — safe in both bundles.
 */
export type SlimActivity = Pick<Activity, "slug" | "title" | "subtitle" | "location" | "tier" | "categorySlug" | "collectionSlugs" | "price"> & {
  seo: Pick<Activity["seo"], "keywords">;
};

export interface SlimCatalog {
  categories: Category[];
  activities: SlimActivity[];
  generatedAt: string;
}

export function toSlim(a: Activity): SlimActivity {
  return {
    slug: a.slug,
    title: a.title,
    subtitle: a.subtitle,
    location: a.location,
    tier: a.tier,
    categorySlug: a.categorySlug,
    collectionSlugs: a.collectionSlugs,
    price: { adult: a.price.adult },
    seo: { keywords: a.seo.keywords },
  };
}
