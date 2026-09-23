import { unstable_cache } from "next/cache";
import { handle, json } from "@/server/lib/http";
import { CATALOG_TAG } from "@/server/lib/catalog-cache";
import { RATE, publicRateLimit } from "@/server/lib/guards";
import { catalogService } from "@/server/services/catalog.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/catalog/fulfilment-modes — public, cached 60s at the edge.
 *
 * The storefront's future read model for THE HINGE (§17 §6.4 / §8.2):
 * `{ modes: { [slug]: "inquiry" | "instant" }, generatedAt }`. Today the
 * storefront reads `fulfilmentMode` from the fixtures in `src/lib/data`;
 * when a SKU is flipped in the admin Products page this endpoint is what the
 * ADP/CTA component switches to, so a flip needs no deploy. Rollback is the
 * same flip back — a stale edge cache lasts at most 60s (+300s stale-while-
 * revalidate), which is inside the "monitor for a week" window of §8.2.
 */
const cachedModes = unstable_cache(() => catalogService.fulfilmentModes(), ["fulfilment-modes-v1"], { tags: [CATALOG_TAG], revalidate: 60 });

export const GET = handle(async (req) => {
  await publicRateLimit(req, "catalog", RATE.publicRead);
  const modes = await cachedModes();
  return json(
    { modes, generatedAt: new Date().toISOString() },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
});
