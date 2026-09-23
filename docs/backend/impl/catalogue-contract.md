# Catalogue management — implementation contract (backend completion round)

Binding for the three agents working in parallel: **CAT** (catalogue core + storefront read model), **ADM** (admin activity/category UI + imports), **SEC** (security hardening, tests, docs, analytics gaps). Conventions from `19-implementation-conventions.md` apply. Nothing here changes layouts, components or the design system.

## 1. Decisions

- The database becomes the source of truth for **activities** and **categories**. Combos, collections, attraction hubs and landing pages stay fixture-based this round (recorded as future phase).
- The `Activity` shape in `src/lib/types.ts` is the content contract; it is stored whole as validated JSON (`products.content`) plus indexed scalar columns synced on every write. No storefront component changes shape.
- Fixtures in `src/lib/data/*.ts` become the seed and the client-side fallback; storefront **server** pages read from the DB via one cached read model.
- Every write is versioned (`product_versions`) and every import is a batch with per-row before/after versions, so both are reversible.

## 2. Schema (CAT owns; one additive migration `catalogue_content`)

```
products               + content JSONB NOT NULL DEFAULT '{}'   (full Activity, validated by activitySchema)
                       + subtitle TEXT, location TEXT, duration_minutes INT, price_from_inr BIGINT, price_from_aed BIGINT,
                         rating NUMERIC(2,1), review_count INT, is_private BOOL, pickup_included BOOL,
                         dietary TEXT[], suitability TEXT[], version INT NOT NULL DEFAULT 1, published_at TIMESTAMPTZ,
                         seo_title TEXT, seo_description TEXT, search_vector TSVECTOR (generated from title/subtitle/location/seo_keywords)
                       status enum text: draft | published | archived   (existing "published" default kept)
product_versions       id, product_id fk, version int, content jsonb, status, actor_id?, reason?, created_at   (unique product_id+version)
categories             id, slug unique, name, short_name, emoji, tagline, intro, hero_image, faqs jsonb, related_slugs text[], featured_slugs text[], sort_order int, status draft|published|archived, created_at, updated_at, deleted_at
import_batches         id, source manual|csv|sheet|doc|bulk, status previewed|applied|reverted|failed, file_name?, source_ref?, mapping jsonb, rows_total, rows_ok, rows_failed, errors jsonb, preview jsonb, created_by fk admin_users, created_at, applied_at?, reverted_at?
import_batch_items     id, batch_id fk, product_id fk, action create|update, before_version int?, after_version int, slug
```
Indexes: `products (status, tier)`, `products (category_slug, status)`, GIN on `search_vector`, GIN on `dietary`, `product_versions (product_id, version desc)`, `import_batches (created_at desc)`.

## 3. Services (CAT owns)

`src/server/schemas/activity.schema.ts` — `activitySchema` (zod, `.strict()` at every object level, mirrors `Activity`; money as non-negative integers in major units as today; slugs `^[a-z0-9-]{3,80}$`; arrays capped; strings length-capped; URLs https-only in `images` unless `img:` ref), `activityInputSchema` (create/update payload = `Activity` minus derived fields `id`, `rating`, `reviewCount`, `bookedThisMonth`), `categorySchema`.

`src/server/services/catalog.service.ts` — keep existing exports (`priceCartItems`, `fulfilmentModes`, `setFulfilmentMode`, `listProducts`, `listCombos`) and add:
```ts
listActivitiesAdmin(actor, filters: { q?, status?, tier?, category?, page?, pageSize? })
getActivityAdmin(actor, id)                       // content + versions summary
createActivity(actor, input, opts?: { status?: "draft"|"published"; reason?: string })
updateActivity(actor, id, input, opts?: { reason?: string; expectedVersion?: number })   // optimistic concurrency → CONFLICT
duplicateActivity(actor, id)                      // new slug `<slug>-copy-N`, status draft
setActivityStatus(actor, id, "draft"|"published"|"archived", reason?)   // publish/unpublish/archive
deleteActivity(actor, id, reason)                 // soft delete (deleted_at), status archived
restoreActivity(actor, id)                        // undelete
restoreVersion(actor, id, version, reason)        // writes a new version equal to the old content
listVersions(actor, id)
listCategoriesAdmin(actor) · upsertCategory(actor, input) · setCategoryStatus · deleteCategory (soft)
```
Every mutation: `requirePermission(actor, "products.edit" | "products.publish" | "products.delete")`, one transaction, `product_versions` row, `audit()` with before/after, `revalidateCatalog()`.

`src/server/services/import.service.ts` (ADM owns, uses catalogService only):
```ts
parseCsv(text): { headers: string[]; rows: string[][] }                 // own parser: quotes, escaped quotes, CRLF, BOM
fetchGoogleSheetCsv(url): Promise<string>                              // https://docs.google.com/spreadsheets/d/{id}/export?format=csv&gid={gid}; share = anyone-with-link; SSRF: host allowlist docs.google.com only
fetchGoogleDocText(url): Promise<string>                               // .../document/d/{id}/export?format=txt
parseDocToDraft(text): Partial<ActivityInput> + warnings                // headings → fields: Title, Subtitle, Category, Tier, Price, Duration, Location, Highlights, Description, Inclusions, Exclusions, Policy, FAQ (Q:/A:), SEO
suggestMapping(headers): Record<targetField, sourceHeader|null>        // fuzzy header → field
preview(actor, { source, rows|text, mapping }): ImportPreview          // per-row validation result, create vs update by slug, errors with row+field
apply(actor, batchId): ImportResult                                     // one transaction; all-or-nothing by default, `partial: true` to skip failed rows; writes import_batch_items
revert(actor, batchId)                                                  // restores before_version / soft-deletes created rows; audited
listBatches(actor) · getBatch(actor, id)
```
Bulk = CSV/sheet/JSON with many rows; JSON array of `ActivityInput` accepted at `POST /api/admin/imports/preview` with `source: "bulk"`.

## 4. Read model (CAT owns) — `src/lib/catalog/server.ts` (`"server-only"`)
```ts
getActivities(): Promise<Activity[]>            // published, not deleted, ordered as fixtures (tier, title); unstable_cache tag "catalog", revalidate 60
getActivityBySlug(slug): Promise<Activity|null>
getCategories(): Promise<Category[]>
getCatalogSnapshot(): Promise<{ activities; categories; generatedAt }>
```
`revalidateCatalog()` = `revalidateTag("catalog")` + `revalidatePath("/", "layout")`.
Fallback: if the DB is unreachable at build/runtime, log and serve fixtures (never a blank storefront).

Storefront switch (CAT): every server page/component in the fixture-importer list reads through `src/lib/catalog/server.ts`; `src/lib/search.ts` functions gain an explicit `list` parameter (`searchActivities(filters, list)`, `suggest(q, limit, list)`) with the fixture default so client callers keep working. Client components keep fixture fallback and, where they resolve by slug from localStorage (compare tray, cart, saved), use `useCatalog()` from `src/lib/catalog/client.ts` which fetches `GET /api/catalog` once (public, `s-maxage=60`) and merges over fixtures.

Images: new slugs have no manifest entry → `imageService`/`Scene` must handle `img:activity:<slug>` by (a) `content.images` http(s) URLs set by the admin (rendered directly), else (b) Pexels search using the product title (server route; cached) — CAT adds this to `image.service.ts` and the route; ADM exposes image URL fields + a "find photos" helper is NOT required.

## 5. Routes

CAT: `GET /api/catalog` (public, snapshot), `GET /api/admin/activities`, `POST /api/admin/activities`, `GET|PATCH|DELETE /api/admin/activities/:id`, `POST /api/admin/activities/:id/{duplicate,status,restore,restore-version}`, `GET /api/admin/activities/:id/versions`, `GET|POST /api/admin/categories`, `PATCH|DELETE /api/admin/categories/:id`.
ADM: `POST /api/admin/imports/preview` (multipart CSV or JSON body `{ source, text|rows|url|items, mapping }`), `POST /api/admin/imports/:id/apply`, `POST /api/admin/imports/:id/revert`, `GET /api/admin/imports`, `GET /api/admin/imports/:id`, `POST /api/admin/imports/fetch` (`{ url }` → headers + first rows from a Google Sheet/Doc).
All admin routes: `runtime nodejs`, `handle()`, `authService.requireRequest(req, permission)`, `assertSameOrigin` on mutations, strict zod, `enforceRateLimit` per actor (`admin:<userId>` 300/min; imports 20/hour).

Permissions (SEC adds to `permissions.ts` + seed): `products.delete` (admin, ops), `imports.run` (admin, ops, content), `categories.edit` (admin, ops, content). Re-run `npm run db:seed` after.

## 6. Admin UI (ADM owns) — `src/app/admin/(console)/activities/**`, `/categories/**`, `/imports/**`
Reuse `_components/ui.tsx` (`PageHeader`, `DataTable`, `StatusPill`, `FormField`, `Panel`, `Pagination`) and `_actions/result.ts`. Server Actions in `_actions/activities.ts`, `_actions/categories.ts`, `_actions/imports.ts` each re-resolve the session with `requireCookies(permission)`. The activity form covers every field in the contract list (name, category, sub-categories, pricing bands, duration, location, meeting point, highlights, description/subtitle, inclusions, exclusions, important info, cancellation policy, FAQ, images (URL list or `img:` ref), SEO title/description/keywords, related activities, upsells = add-ons, cross-sells = combo slugs, variants, dietary, suitability, badges, fulfilment mode read-only link). Import wizard: choose source → upload/paste/URL → mapping (auto-suggested, editable) → preview table with per-row status and errors → apply (all-or-nothing default) → batch page with revert.

## 7. Done criteria
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` green; storefront renders from DB (change a title in admin → homepage/ADP reflect within 60s or immediately after revalidate); imports round-trip (CSV of the 28 fixtures re-imports as updates with 0 errors; revert restores); notes in `docs/backend/impl/{catalogue,admin-activities,security-round2}.md`.
