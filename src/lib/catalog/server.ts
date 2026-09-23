import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/lib/db";
import { log } from "@/server/lib/logger";
import { CATALOG_TAG } from "@/server/lib/catalog-cache";
import { activitySchema, toCategory } from "@/server/schemas/activity.schema";
import { activities as fixtureActivities } from "@/lib/data/activities";
import { categories as fixtureCategories } from "@/lib/data/categories";
import type { Activity, Category } from "@/lib/types";

/**
 * Storefront read model for activities and categories.
 *
 * The database is the source of truth (admin console + imports write it);
 * the fixtures in `src/lib/data` are the seed and the fallback. One cached
 * snapshot (tag "catalog", 60s) feeds every server page, so a full render
 * costs one query, and `revalidateCatalog()` after any admin write makes the
 * storefront reflect it immediately.
 *
 * Fallback policy: if the database is unreachable, or has never been seeded
 * (zero product rows), the fixtures are served and a warning is logged. A
 * seeded catalogue with nothing published renders empty on purpose — an
 * operator retiring every listing must see that reflected.
 */

export interface CatalogSnapshot {
  activities: Activity[];
  categories: Category[];
  generatedAt: string;
  source: "db" | "fixtures";
}

const TIER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

function fixtureSnapshot(): CatalogSnapshot {
  return { activities: fixtureActivities, categories: fixtureCategories, generatedAt: new Date().toISOString(), source: "fixtures" };
}

async function loadSnapshot(): Promise<CatalogSnapshot> {
  try {
    const [products, cats] = await Promise.all([
      prisma.product.findMany({ where: { status: "published", deletedAt: null }, select: { content: true, fulfilmentMode: true, slug: true } }),
      prisma.category.findMany({ where: { status: "published", deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    ]);
    const activities: Activity[] = [];
    for (const p of products) {
      const parsed = activitySchema.safeParse(p.content);
      if (!parsed.success) {
        log.warn("catalog.invalid_content", { slug: p.slug });
        continue;
      }
      activities.push({ ...(parsed.data as Activity), fulfilmentMode: p.fulfilmentMode });
    }
    // An empty catalogue is a real state (everything unpublished/retired), not a
    // failure: never resurrect the bundled fixtures here. Fixtures only serve
    // when the database cannot be reached (catch below) or the seed never ran.
    if (activities.length === 0) {
      const anyProduct = await prisma.product.count();
      if (anyProduct === 0) {
        log.warn("catalog.unseeded_db — serving fixtures");
        return fixtureSnapshot();
      }
    }
    // Fixture order: tier, then the original hand-curated order, then title.
    const fixtureIndex = new Map(fixtureActivities.map((a, i) => [a.slug, i]));
    activities.sort((a, b) => {
      const t = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
      if (t !== 0) return t;
      const ia = fixtureIndex.get(a.slug) ?? 1e6;
      const ib = fixtureIndex.get(b.slug) ?? 1e6;
      if (ia !== ib) return ia - ib;
      return a.title.localeCompare(b.title);
    });
    const categories = cats.length ? cats.map(toCategory) : fixtureCategories;
    return { activities, categories, generatedAt: new Date().toISOString(), source: "db" };
  } catch (error) {
    log.error("catalog.load_failed — serving fixtures", { error });
    return fixtureSnapshot();
  }
}

const cachedSnapshot = unstable_cache(loadSnapshot, ["catalog-snapshot-v1"], { tags: [CATALOG_TAG], revalidate: 60 });

export async function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  return cachedSnapshot();
}

export async function getActivities(): Promise<Activity[]> {
  return (await getCatalogSnapshot()).activities;
}

export async function getActivityBySlug(slug: string): Promise<Activity | null> {
  return (await getActivities()).find((a) => a.slug === slug) ?? null;
}

export async function getActivitiesBySlugs(slugs: string[]): Promise<Activity[]> {
  const list = await getActivities();
  return slugs.map((s) => list.find((a) => a.slug === s)).filter((a): a is Activity => Boolean(a));
}

export async function getCategories(): Promise<Category[]> {
  return (await getCatalogSnapshot()).categories;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return (await getCategories()).find((c) => c.slug === slug) ?? null;
}
