"use client";

import { useEffect, useState } from "react";
import { activities as fixtureActivities } from "@/lib/data/activities";
import { categories as fixtureCategories } from "@/lib/data/categories";
import type { Activity, Category } from "@/lib/types";
import { toSlim, type SlimCatalog } from "./slim";

/**
 * Client-side catalogue for components that resolve slugs from localStorage
 * (cart, compare tray, saved list). Starts from the bundled fixtures so the
 * first paint is never empty, then swaps in the live snapshot from
 * `GET /api/catalog` once per page load (module-level cache).
 */

export interface ClientCatalog {
  activities: Activity[];
  categories: Category[];
  live: boolean;
}

const FALLBACK: ClientCatalog = { activities: fixtureActivities, categories: fixtureCategories, live: false };

let cache: ClientCatalog | null = null;
let inflight: Promise<ClientCatalog> | null = null;

async function fetchCatalog(): Promise<ClientCatalog> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/api/catalog", { credentials: "omit" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`catalog ${r.status}`);
      const data = (await r.json()) as { activities?: Activity[]; categories?: Category[] };
      const live: ClientCatalog = {
        // A successful response is authoritative even when empty (everything retired).
        activities: Array.isArray(data.activities) ? data.activities : fixtureActivities,
        categories: data.categories?.length ? data.categories : fixtureCategories,
        live: true,
      };
      cache = live;
      return live;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useCatalog(): ClientCatalog {
  const [state, setState] = useState<ClientCatalog>(() => cache ?? FALLBACK);
  useEffect(() => {
    let alive = true;
    void fetchCatalog().then((c) => {
      if (alive) setState(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/* ------------------------------------------------------------ slim */

const SLIM_FALLBACK: SlimCatalog = { categories: fixtureCategories, activities: fixtureActivities.map(toSlim), generatedAt: "" };
let slimCache: SlimCatalog | null = null;
let slimInflight: Promise<SlimCatalog> | null = null;

async function fetchSlim(): Promise<SlimCatalog> {
  if (slimCache) return slimCache;
  if (slimInflight) return slimInflight;
  slimInflight = fetch("/api/catalog/slim", { credentials: "omit" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`catalog ${r.status}`);
      const data = (await r.json()) as Partial<SlimCatalog>;
      const live: SlimCatalog = {
        categories: data.categories?.length ? data.categories : fixtureCategories,
        activities: Array.isArray(data.activities) ? data.activities : SLIM_FALLBACK.activities,
        generatedAt: data.generatedAt ?? "",
      };
      slimCache = live;
      return live;
    })
    .catch(() => SLIM_FALLBACK)
    .finally(() => {
      slimInflight = null;
    });
  return slimInflight;
}

/**
 * Chrome-level catalogue (header menu, search suggestions, filter chips):
 * ~6 KB, browser-cached for a minute, fetched once per page load. Use
 * `useCatalog()` only where full documents are needed (cart, compare, saved).
 */
export function useSlimCatalog(): SlimCatalog {
  const [state, setState] = useState<SlimCatalog>(() => slimCache ?? SLIM_FALLBACK);
  useEffect(() => {
    let alive = true;
    void fetchSlim().then((c) => {
      if (alive) setState(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function useActivityBySlug(slug: string | undefined): Activity | undefined {
  const { activities } = useCatalog();
  return slug ? activities.find((a) => a.slug === slug) : undefined;
}
