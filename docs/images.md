# Photography — how images work

Every activity, combo, category, collection, attraction hub and landing page renders **real photography from Pexels**. The illustrated SVG scenes are kept only as a last-resort fallback.

## Source of truth

`src/lib/images/manifest.ts` — one entry per entity (`activity:<slug>`, `combo:<slug>`, `category:<slug>`, `collection:<slug>`, `attraction:<slug>`, `landing:<slug>`) with:

- `photos` — hand-curated Pexels photo ids in display order (curated 19 Sep 2026 on pexels.com, every id verified against the CDN). Served straight from `images.pexels.com`; **no API key needed**.
- `queries` — Pexels search phrases used for any index the curated list does not cover, once `PEXELS_API_KEY` is set.
- `fallback` — illustrated scene key.
- `manual` — Pexels has no photography of the exact venue; the closest honest match is used (see the list below).

Catalogue data references images as `img:<kind>:<slug>:<index>` (e.g. `img:activity:museum-of-the-future:0`). Bare scene keys (`"dune-sunset"`) still work and map to a photo of the same subject via `SCENE_PHOTOS`.

## Delivery and performance

- `Scene` (`src/components/ui/scene.tsx`) keeps its API (`src`, `alt`, `scrim`, `priority`). Curated ids render a plain `<img>` with a 4-step `srcset` (480/800/1200/1600), `sizes`, `fit=crop` at the frame ratio (400×260), `loading="lazy"` by default and `fetchpriority="high"` for heroes. No captions, credits or overlays are ever drawn inside the frame.
- Uncurated indices go through `GET /api/images/:kind/:slug/:index?w=` which resolves one Pexels search per entity (all queries, de-duplicated), caches it in Postgres `image_assets` (24h TTL, negative results cached too) and in process memory, de-duplicates in-flight requests, then `302`s to the CDN with `Cache-Control: public, max-age=86400, s-maxage=604800`. With nothing resolvable it returns the fallback SVG. Pexels free tier (200 req/h) is never approached: at most one search per entity per day.

## Configuration

`PEXELS_API_KEY` in `.env.local` / Vercel env. Paste it and the search path is live; nothing else to configure. Without it every curated image still renders (the whole catalogue is curated).

## Entities using a closest-match photo (no exact venue photography on Pexels)

IMG Worlds of Adventure, Motiongate Dubai (one real Motiongate photo, others Dubai Parks), AYA Universe (immersive light art in Dubai), La Perle (aqua-theatre acrobatics), Ferrari World Abu Dhabi (one real aerial, then Yas Island), the Theme Parks category and the Theme-park combo. Replace with supplier/own photography by editing `photos` in the manifest — no code change.
