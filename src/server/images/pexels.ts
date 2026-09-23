import "server-only";
import { env } from "../lib/env";
import { log } from "../lib/logger";

/**
 * Pexels API client — search only, via fetch. Used exclusively by
 * image.service.ts for refs without a curated photo id; every result is
 * cached in Postgres so a query is sent at most once per 24h even on a
 * cold fleet. Free tier: 200 requests/hour, 20,000/month — the cache keeps
 * usage at "one per entity, ever" in practice.
 */

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  alt: string;
  /** Original file extension on the CDN (jpeg for almost all, png for a few). */
  ext: "jpeg" | "png";
}

const API = "https://api.pexels.com/v1/search";

export function pexelsConfigured(): boolean {
  return Boolean(env().PEXELS_API_KEY);
}

export async function searchPexels(query: string, perPage = 6): Promise<PexelsPhoto[]> {
  const key = env().PEXELS_API_KEY;
  if (!key) return [];
  const url = `${API}?query=${encodeURIComponent(query)}&orientation=landscape&size=medium&per_page=${perPage}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, { headers: { Authorization: key }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      log.warn("pexels.search_failed", { status: res.status, query });
      return [];
    }
    const data = (await res.json()) as { photos?: { id: number; width: number; height: number; alt?: string; src?: { original?: string } }[] };
    return (data.photos ?? []).map((p) => ({
      id: p.id,
      width: p.width,
      height: p.height,
      alt: p.alt ?? "",
      ext: /[.]png([?]|$)/i.test(p.src?.original ?? "") ? ("png" as const) : ("jpeg" as const),
    }));
  } catch (error) {
    log.warn("pexels.search_error", { query, error });
    return [];
  } finally {
    clearTimeout(timer);
  }
}
