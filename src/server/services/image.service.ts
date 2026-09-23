import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { log } from "../lib/logger";
import { pexelsConfigured, searchPexels } from "../images/pexels";
import { IMAGE_MANIFEST, PNG_PHOTOS, SCENE_PHOTOS, pexelsCdnUrl, type ImageKind, type ImageSpec } from "@/lib/images/manifest";

/**
 * Image resolution for refs the curated manifest does not fully cover.
 *
 * Order: curated id → memory cache → `image_assets` row (< 24h) → one Pexels
 * search (all queries for the entity, de-duplicated, stored as a list) →
 * illustrated fallback. Concurrent requests for the same entity share one
 * in-flight promise, so a burst of card renders never fans out into many
 * API calls.
 */

const TTL_MS = 24 * 3600_000;
const NEGATIVE_TTL_MS = 24 * 3600_000;

interface StoredPhoto {
  id: number;
  ext: "jpeg" | "png";
}

interface Resolved {
  photos: StoredPhoto[];
  fetchedAt: number;
}

const memory = new Map<string, Resolved>();
const inflight = new Map<string, Promise<Resolved>>();

export function specFor(kind: ImageKind, slug: string): ImageSpec | null {
  if (kind === "scene") return SCENE_PHOTOS[slug] ?? null;
  return IMAGE_MANIFEST[`${kind}:${slug}`] ?? null;
}

const CATEGORY_FALLBACK: Record<string, string> = {
  "desert-safari": "dune-sunset",
  "cruises-yachts": "marina-dusk",
  "dubai-attractions": "skyline-gold",
  "theme-parks": "park-neon",
  "family-activities": "family-day",
  "dubai-city-tours": "city-tour",
  "luxury-experiences": "luxury-night",
  "water-activities": "water-splash",
};

/**
 * Listings created in the console have no manifest entry. Build a search
 * spec from the product's own title + category so Pexels returns the right
 * subject; cached like any other entity.
 */
async function specFromCatalogue(kind: ImageKind, slug: string): Promise<ImageSpec | null> {
  if (kind !== "activity") return null;
  try {
    const p = await prisma.product.findUnique({ where: { slug }, select: { title: true, categorySlug: true, location: true, deletedAt: true } });
    if (!p || p.deletedAt) return null;
    const title = p.title.replace(/\(.*?\)/g, "").replace(/[-–—:|].*$/, "").trim();
    return {
      photos: [],
      queries: [`${title} dubai`, `${title}`, `${p.location ?? ""} dubai`.trim(), `${p.categorySlug.replace(/-/g, " ")} dubai`],
      fallback: CATEGORY_FALLBACK[p.categorySlug] ?? "skyline-gold",
    };
  } catch (error) {
    log.warn("image.spec_lookup_failed", { kind, slug, error });
    return null;
  }
}

async function loadFromDb(key: string): Promise<Resolved | null> {
  try {
    const row = await prisma.imageAsset.findUnique({ where: { key } });
    if (!row) return null;
    const raw = Array.isArray(row.photos) ? (row.photos as unknown[]) : [];
    const photos: StoredPhoto[] = raw
      .map((x) => (typeof x === "number" ? { id: x, ext: "jpeg" as const } : (x as StoredPhoto)))
      .filter((x) => x && typeof x.id === "number");
    return { photos, fetchedAt: row.fetchedAt.getTime() };
  } catch (error) {
    log.warn("image.cache_read_failed", { key, error });
    return null;
  }
}

async function saveToDb(key: string, query: string, photos: StoredPhoto[]) {
  try {
    await prisma.imageAsset.upsert({
      where: { key },
      create: { key, query, photos: photos as unknown as Prisma.InputJsonValue },
      update: { query, photos: photos as unknown as Prisma.InputJsonValue, fetchedAt: new Date() },
    });
  } catch (error) {
    log.warn("image.cache_write_failed", { key, error });
  }
}

async function searchAll(spec: ImageSpec): Promise<StoredPhoto[]> {
  const out: StoredPhoto[] = spec.photos.map((id) => ({ id, ext: PNG_PHOTOS.has(id) ? "png" : "jpeg" }));
  for (const q of spec.queries) {
    const photos = await searchPexels(q, 6);
    for (const p of photos) if (!out.some((x) => x.id === p.id)) out.push({ id: p.id, ext: p.ext });
    if (out.length >= 6) break;
  }
  return out;
}

async function resolveEntity(kind: ImageKind, slug: string, spec: ImageSpec): Promise<Resolved> {
  const key = `${kind}:${slug}`;
  const now = Date.now();

  const cached = memory.get(key);
  if (cached && now - cached.fetchedAt < (cached.photos.length ? TTL_MS : NEGATIVE_TTL_MS)) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const work = (async () => {
    const fromDb = await loadFromDb(key);
    if (fromDb && now - fromDb.fetchedAt < (fromDb.photos.length ? TTL_MS : NEGATIVE_TTL_MS)) {
      memory.set(key, fromDb);
      return fromDb;
    }
    if (!pexelsConfigured()) {
      const curatedOnly = { photos: spec.photos.map((id) => ({ id, ext: PNG_PHOTOS.has(id) ? ("png" as const) : ("jpeg" as const) })), fetchedAt: now };
      memory.set(key, curatedOnly);
      return curatedOnly;
    }
    const photos = await searchAll(spec);
    const resolved = { photos, fetchedAt: now };
    memory.set(key, resolved);
    await saveToDb(key, spec.queries.join(" | "), photos);
    return resolved;
  })();

  inflight.set(key, work);
  try {
    return await work;
  } finally {
    inflight.delete(key);
  }
}

export const imageService = {
  /**
   * Returns the CDN URL for (kind, slug, index) at `width`, or null when no
   * photo can be resolved (caller serves the illustrated fallback).
   */
  async resolveUrl(kind: ImageKind, slug: string, index: number, width: number): Promise<string | null> {
    const spec = specFor(kind, slug) ?? (await specFromCatalogue(kind, slug));
    if (!spec) return null;
    const curated = spec.photos[index];
    if (curated) return pexelsCdnUrl(curated, width);
    const resolved = await resolveEntity(kind, slug, spec);
    const photo = resolved.photos[index] ?? resolved.photos[resolved.photos.length - 1];
    return photo ? pexelsCdnUrl(photo.id, width, photo.ext) : null;
  },

  /** Fallback scene key for a ref. */
  async fallbackFor(kind: ImageKind, slug: string): Promise<string> {
    return specFor(kind, slug)?.fallback ?? (await specFromCatalogue(kind, slug))?.fallback ?? "skyline-gold";
  },

  /** Warm every entity that has an uncurated index — used by the admin/ops check. */
  async status() {
    const entries = Object.entries(IMAGE_MANIFEST);
    return {
      configured: pexelsConfigured(),
      entities: entries.length,
      curated: entries.filter(([, s]) => s.photos.length > 0).length,
      manual: entries.filter(([, s]) => s.manual).map(([k]) => k),
      cachedRows: await prisma.imageAsset.count().catch(() => 0),
    };
  },
};
