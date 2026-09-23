# Catalogue management — implementation note

Delivered against `catalogue-contract.md` (backend completion round, 20 Sep 2026).

## What changed

| Area | Before | After |
|---|---|---|
| Source of truth for activities/categories | `src/lib/data/*.ts` fixtures compiled into the bundle | `products.content` (JSONB `Activity` document) + `categories` table; fixtures are the seed and the fallback |
| Storefront reads | direct fixture imports in ~37 files | one cached read model `src/lib/catalog/server.ts` (server pages) and `src/lib/catalog/client.ts` (`useCatalog()` for cart/compare/saved/header/filters) |
| Cart re-pricing | fixtures | `products.content` (fixtures only if a row has no document) |
| Admin | fulfilment-mode flip only | full lifecycle: create / edit / duplicate / publish / unpublish / archive / soft-delete / restore / version rollback; category CRUD; imports (CSV, Google Sheet, Google Doc, bulk JSON) with preview → apply → revert |

## Data model (migrations `20260920060000_catalogue_content`, `20260920070000_catalogue_history_cascade`)

- `products` gains `content JSONB`, synced projections (`subtitle, location, duration_minutes, price_from_inr/aed (minor units), rating, review_count, is_private, pickup_included, dietary[], suitability[], seo_title, seo_description`), `version`, `published_at`, a generated `search_vector` (GIN) and a `status` check (`draft|published|archived`).
- `product_versions` — append-only history (UPDATE blocked by trigger; rows cascade only when the product row itself is physically deleted).
- `categories` — the eight functional categories, editable; slug unique.
- `import_batches` + `import_batch_items` — every import run with the validated preview, errors, and per-row before/after versions.

`products.fulfilment_mode` remains THE HINGE and is owned by `catalogService.setFulfilmentMode` only; the editor and imports cannot set it (the document's `fulfilmentMode` is overwritten with the column on every read and write).

## Code

- `src/server/schemas/activity.schema.ts` — `activityInputSchema` / `activitySchema` / `categoryInputSchema` (strict at every level, capped lengths, https-only image URLs or `img:` refs, integer money). `IMPORT_FIELDS` lists every mappable column.
- `src/server/services/activity.service.ts` — `activityService`: list/get/getBySlug/listVersions/create/update/duplicate/setStatus/remove/restore/restoreVersion + categories. Every write = one transaction (product row + version row + audit row) + `revalidateCatalog()`.
- `src/server/services/import.service.ts` + `src/server/imports/parsers.ts` — see `docs/admin/imports.md`.
- `src/server/lib/catalog-cache.ts` — `revalidateCatalog()` (tag `catalog` + root layout path).
- `src/lib/catalog/server.ts` — `getActivities / getActivityBySlug / getActivitiesBySlugs / getCategories / getCategoryBySlug / getCatalogSnapshot` (`unstable_cache`, tag `catalog`, 60s). Falls back to fixtures on DB failure or an empty table — the storefront is never blank.
- `GET /api/catalog` — public snapshot for client components (`s-maxage=60`).
- Seed (`prisma/seed.ts`) writes the full document only for products with no version history, so a re-seed never overwrites admin edits.

## Images for new listings

A listing created in the console has no entry in `src/lib/images/manifest.ts`. `Scene` now routes any `img:activity:<slug>:<n>` through `/api/images/…`, and `imageService` builds a Pexels search spec from the product title + category (cached in `image_assets`). Admins can also paste `https://` image URLs directly. Curated ids for the 28 launch activities are unchanged.

## Storefront rendering

Catalogue pages (`/`, `/activities`, `/activities/[slug]`, `/categories/[slug]`, collections, combos, attractions, landing pages, sitemap, not-found, footer) read the cached snapshot; `revalidate = 60` on the static ones. An admin write calls `revalidateTag("catalog", "max")` so the next request re-renders; worst case a page is 60s stale.

## Performance notes (22 Sep 2026 audit)

Measured on a production build against Neon from a distant client (one query ≈ 1.4 s round trip; co-located on Vercel it is 5–20 ms — the *count* of round trips per request is what to keep low):

| Finding | Before | After | Change |
|---|---|---|---|
| `GET /api/catalog` (fetched by the header on every page) | 1.4 s TTFB, 109 KB | 6 ms | Postgres rate-limit write → in-memory limiter; header/search/filters now use `GET /api/catalog/slim` (27 KB, `max-age=60`) and only cart/compare/saved fetch the full snapshot |
| `GET /api/catalog/fulfilment-modes` | 1.5 s | cached 60 s under the `catalog` tag | `unstable_cache` |
| Admin request session resolution | 2 queries (session, then user+roles) × up to 3 resolutions per render (root layout, console layout, page guard) | 1 query, memoised per request with React `cache()` | `adminRepo.findSessionWithUser` |
| Homepage RSC payload | 27 full `Activity` documents serialised into client cards | `toCard()` projection (`src/lib/catalog/card.ts`) | 754 KB → 723 KB raw HTML (80 → 70 KB gzip); the remainder is the element tree of six rails + 376 inline lucide icons (178 KB raw) |
| Dev server "Timed out fetching a new connection from the pool (limit 13)" | seen in `.next/dev/logs` | fewer queries per request; snapshot cached | if it recurs, append `&connection_limit=20` to the pooled `DATABASE_URL` |

Not changed, recommended: an icon sprite (or fewer icons per card) would take ~100 KB raw off the homepage; Neon project region should match the Vercel function region (check both are e.g. `ap-southeast-1`).

## Still fixture-based (future phase)

Combos, collections, attraction hubs, landing pages, reviews and the `platformStats` block. They render alongside DB activities (they reference activities by slug through the read model), so nothing breaks when an activity is renamed — a missing slug simply drops out of the list.
