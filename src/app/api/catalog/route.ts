import { NextResponse } from "next/server";
import { getCatalogSnapshot } from "@/lib/catalog/server";
import { handle } from "@/server/lib/http";
import { RATE, publicRateLimit } from "@/server/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/catalog — public snapshot of published activities + categories.
 * Content only (supplier contacts and margins never live in the document).
 * CDN-cacheable for a minute; admin writes revalidate the tag behind it.
 */
export const GET = handle(async (req) => {
  await publicRateLimit(req, "catalog", RATE.publicRead);
  const snapshot = await getCatalogSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
  });
});
