import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { imageService } from "@/server/services/image.service";
import { sceneSvgString } from "@/components/ui/scene";
import { SRCSET_WIDTHS, type ImageKind } from "@/lib/images/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/images/:kind/:slug/:index?w=800
 *
 * Only reached for refs without a curated photo id (curated ids are served
 * straight from the Pexels CDN by the Scene component). Resolves a cached
 * Pexels search and redirects to the CDN; when nothing can be resolved it
 * returns the illustrated scene as SVG so the frame never breaks.
 *
 * Redirects and SVGs are cacheable for a day at the browser and a week at
 * the edge — a page full of cards costs one function hit per image per week.
 */

const KINDS: ImageKind[] = ["activity", "combo", "category", "collection", "attraction", "landing", "scene"];
const params = z.object({
  kind: z.enum(KINDS as [ImageKind, ...ImageKind[]]),
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  index: z.coerce.number().int().min(0).max(9),
});
const WIDTHS = new Set<number>(SRCSET_WIDTHS);

const CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  const parsed = params.safeParse(await ctx.params);
  if (!parsed.success) return new NextResponse("Not found", { status: 404 });
  const { kind, slug, index } = parsed.data;
  const wRaw = Number.parseInt(req.nextUrl.searchParams.get("w") ?? "800", 10);
  const w = WIDTHS.has(wRaw) ? wRaw : 800;

  const url = await imageService.resolveUrl(kind, slug, index, w);
  if (url) {
    return NextResponse.redirect(url, { status: 302, headers: { "cache-control": CACHE } });
  }

  const svg = sceneSvgString(await imageService.fallbackFor(kind, slug));
  return new NextResponse(svg, {
    status: 200,
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": CACHE },
  });
}
