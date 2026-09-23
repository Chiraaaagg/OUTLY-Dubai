# Security — round 2 (backend completion, 20 Sep 2026)

Builds on `security.md`. Everything here is applied in code; nothing is advisory unless marked **needs-human**.

## 1. Changes

| # | Area | Change | Where |
|---|---|---|---|
| 1 | Rate limiting | Every admin/agent JSON route now goes through `requireAdmin(req, permission, budget)`: session + permission + **per-user** fixed-window limit (300/min default; `RATE.adminHeavy` 20/hour for import preview/apply/revert/fetch/export). Public reads (`/api/catalog*`) 600/min per hashed IP; customer routes (`/api/me/*`) 120/min per hashed IP on top of the session. Login, OTP, inquiry submission and lookup keep their existing service-level limits (per phone/email/IP). **Where the counter lives:** security-critical limits (login, OTP, inquiry, lookup, the 20/hour import budget) are in Postgres so they hold across instances; the per-minute admin click budget and public read budgets are in-memory per instance (`memoryRateLimit`) — a Postgres write per read cost one database round trip on every request (measured 1.4 s from a distant client). | `src/server/lib/guards.ts`, `rate-limit.ts`, 21 admin/agent routes, `/api/catalog*`, `/api/me/*` |
| 2 | Error handling | `handle()` now maps `ZodError` → 422 with field paths, Prisma `P2002/P2025/P2003` → 409/404/409 (never the raw Prisma message), `SyntaxError` → 400, everything else → generic 500. Every response carries `x-request-id` (honours an inbound one, else a UUID) and 5xx logs include it. | `src/server/lib/http.ts` |
| 3 | TOTP replay | A code that already minted a session cannot be reused inside its window: `idempotency_keys` row `totp:<user>:<hash(code)>` (2-minute TTL, unique). Replays are audited as `auth.totp_replayed` and refused. | `auth.service.ts` `completeTotp` |
| 4 | Mass assignment | All catalogue/import payloads are `.strict()` at every nesting level (`activityInputSchema`, `categoryInputSchema`, transport schemas). The editor posts one JSON document; the server schema — not a FormData mapper — decides what is accepted. `rowToInput` only ever copies **mapped** columns, and a `__proto__` header cannot poison the object (plain-object `setPath`, verified by test). | `activity.schema.ts`, `catalog.schemas.ts`, `parsers.ts` |
| 5 | SSRF | Google imports accept only `https://docs.google.com/(spreadsheets\|document)/d/<id>` and rebuild the export URL themselves (the user's query string is never forwarded). Redirect target host must end in `google.com`/`googleusercontent.com`; 15 s timeout; 5 MB cap; HTML responses (login pages) rejected. | `import.service.ts` |
| 6 | Upload safety | CSV uploads: 5 MB, `.csv/.txt` or `text/csv|plain` only, ≤ 500 rows, parsed by our own RFC-4180 parser (no eval, no formula execution — cells are strings). | `imports/preview/route.ts`, `parsers.ts` |
| 7 | XSS | Image fields accept only `https://` URLs or `img:` refs (no `javascript:`/`data:`); `video` must be a URL. Admin-authored text is rendered through React escaping; nothing uses `dangerouslySetInnerHTML`. Storefront JSON-LD comes from the same validated document. | `activity.schema.ts` |
| 8 | Authorisation | New permissions `products.delete`, `categories.edit`, `imports.run`, `analytics.view` added to the matrix and seeded. Every `activityService`/`importService` method calls `requirePermission` itself; publishing on create requires `products.publish` in addition to `products.edit`; `content` role can edit/import but not publish or delete. Inquiry `unassign`: the owner may release their own, anyone else needs `inquiries.assign`. | `permissions.ts`, services |
| 9 | DB integrity | `products.status`, `categories.status`, `import_batches.status/source`, `import_batch_items.action` have CHECK constraints; `product_versions` is UPDATE-immutable (trigger); unique `(product_id, version)`; indexes on `(category_slug, status)`, `(status, deleted_at)`, GIN on `search_vector`, `dietary`, `suitability`. | migrations `20260920060000`, `20260920070000` |
| 10 | Concurrency | Optimistic concurrency on activity updates (`expectedVersion` → 409); every write is one transaction with the version and audit rows; imports run in one transaction (180 s budget) and mark the batch `failed` on rollback. | `activity.service.ts`, `import.service.ts` |
| 11 | Audit | New audited actions: `activity.create/update/publish/unpublish/archive/delete/restore/duplicate/restore_version`, `category.create/update/status/delete`, `import.preview/apply/revert`, `inquiry.unassign`, `auth.totp_replayed`. Before/after payloads scrubbed as before. | services |
| 12 | Cache safety | `revalidateCatalog()` swallows the "no request scope" error so a service call from a script/test can never crash on cache invalidation; the storefront read model falls back to fixtures on DB failure, never to a blank page. | `catalog-cache.ts`, `lib/catalog/server.ts` |

## 2. Route review (every route, every method)

Legend: S = session required, P = permission, O = same-origin on mutations, R = rate limit, V = strict zod.

| Route | S | P | O | R | V |
|---|---|---|---|---|---|
| `/api/admin/activities` GET/POST, `/[id]` GET/PATCH/DELETE, `/[id]/{duplicate,status,restore,restore-version}` POST, `/[id]/versions` GET | ✓ | `products.edit` / `products.publish` / `products.delete` | ✓ | per-user | ✓ |
| `/api/admin/categories` GET/POST, `/[id]` PATCH/DELETE | ✓ | `products.edit` / `categories.edit` | ✓ | per-user | ✓ |
| `/api/admin/imports` GET, `/[id]` GET, `/preview` POST, `/fetch` POST, `/[id]/apply` POST, `/[id]/revert` POST, `/export` GET | ✓ | `imports.run` (`products.edit` for export) | ✓ | per-user heavy (20/h) | ✓ (+ multipart checks) |
| `/api/admin/reports/{inquiries,dashboard,agents}` GET | ✓ | `reports.view` / `analytics.view` | — | per-user | ✓ |
| `/api/admin/{users,settings,audit,products}` (existing) | ✓ | as before | ✓ | per-user (new) | ✓ |
| `/api/agent/**` (existing) + `/inquiries/[id]/unassign` POST | ✓ | as before / `inquiries.claim` (+ ownership) | ✓ | per-user (new) | ✓ |
| `/api/admin/auth/*`, `/api/auth/*` | — | — | ✓ | service-level (email/phone/IP) | ✓ |
| `/api/inquiries` POST, `/api/inquiries/lookup` POST | — | — | ✓ | phone + IP (+ reference) | ✓ |
| `/api/catalog`, `/api/catalog/fulfilment-modes` GET | — | — | — | 600/min per IP | — |
| `/api/me/*` | customer S | — | ✓ | 120/min per IP | ✓ |
| `/api/events` POST | — | — | ✓ | existing | ✓ |
| `/api/images/**` GET | — | — | — | CDN-cached; **not** DB-limited (one bucket write per image request would cost more than it protects; abuse surface is a Pexels search per uncached entity, itself cached 24 h) | path validated |
| `/api/jobs/*` | cron secret | — | — | — | — |
| `/api/webhooks/whatsapp` | signature | — | — | — | — |
| `/api/health` | — | — | — | — | — |

## 3. Tests added (33 new, 265 total)

- `schemas/__tests__/activity.schema.test.ts` — fixtures round-trip, unknown keys rejected, bad slug/negative money/non-https/`javascript:` image rejected, instant-without-instant-confirmation rejected, projection in minor units, categories.
- `imports/__tests__/parsers.test.ts` — CSV edge cases (quotes, escaped quotes, embedded newlines, CRLF, BOM, ragged rows), mapping aliases, type coercion, prototype-pollution guard, durations, FAQ notations, Google Doc parsing, full 28-fixture CSV round-trip with zero errors.
- `services/__tests__/activity.service.test.ts` (real DB) — create/version/mapping, duplicate slug, unknown category, **permission matrix** (agent cannot edit; content cannot publish/delete), optimistic concurrency, hinge column authoritative, publish/unpublish/archive audit trail, duplicate slug generation, soft delete + slug reservation + restore, version rollback, strict content at the service boundary, category upsert/delete-in-use guard.
- `services/__tests__/import.service.test.ts` (real DB) — CSV preview classification and per-row errors, apply refused with errors, partial apply, revert restores versions and soft-deletes creates, all-or-nothing rollback marks batch failed, Google Doc paste, non-Google URL and agent refusal, export → preview round-trip with zero errors.

## 4. Needs-human

- `npm audit --omit=dev` status unchanged from round 1 (build-time advisory).
- First deploy: run `npm run db:migrate && npm run db:seed` (new permissions + content documents), then open `/admin/activities` and confirm the 28 listings show `published` and the storefront home renders — the read model logs `catalog.load_failed — serving fixtures` if the DB is unreachable.
