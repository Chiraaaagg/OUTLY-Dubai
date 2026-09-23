import { NextResponse } from "next/server";
import { getCatalogSnapshot } from "@/lib/catalog/server";
import { toSlim, type SlimCatalog } from "@/lib/catalog/slim";
import { handle } from "@/server/lib/http";
import { RATE, publicRateLimit } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/catalog/slim — categories + a ~6 KB activity index for header search and menus. Browser-cacheable for a minute. */
export const GET = handle(async (req) => {
  await publicRateLimit(req, "catalog", RATE.publicRead);
  const snapshot = await getCatalogSnapshot();
  const body: SlimCatalog = { categories: snapshot.categories, activities: snapshot.activities.map(toSlim), generatedAt: snapshot.generatedAt };
  return NextResponse.json(body, { headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
});
