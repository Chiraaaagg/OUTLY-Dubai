# HTTP API reference

All routes live under `src/app/api/**`, run on Node.js, and are wrapped in `handle()` (`src/server/lib/http.ts`). Conventions:

- **Envelope.** Success returns the resource as JSON. Errors return `{ "error": { code, message, recovery, retryable, details? } }` with the matching HTTP status: `VALIDATION_FAILED` 422 (`details.fields` = path → message), `UNAUTHORIZED` 401, `FORBIDDEN` 403 (`details.permission`), `NOT_FOUND` 404, `CONFLICT` / `INVALID_TRANSITION` 409, `RATE_LIMITED` 429 (+ `Retry-After`), `SPAM_REJECTED` 400, `NOT_CONFIGURED` 503, `error` 500. Internal messages never leak; every response carries `x-request-id`.
- **Auth.** Admin/agent routes: the `outlyy_admin_session` cookie (or the same JWT as a Bearer token) — session must be unrevoked and the user MFA-enrolled and active. Customer routes: `outlyy_customer_session` cookie. Cron routes: `Authorization: Bearer $CRON_SECRET`.
- **Mutations** (`POST/PATCH/PUT/DELETE`) require a same-origin `Origin` header when one is present (browser CSRF) and a strict JSON body — unknown keys are rejected.
- **Rate limits** (fixed windows, Postgres-backed, fail open): admin/agent 300 req/min per user; import endpoints 20/hour per user; public catalogue reads 600/min per IP; customer routes 120/min per IP; login/OTP/inquiry/lookup have per-email/phone/IP limits in the services.
- **Money** is integer minor units in the database and whole rupees/dirhams in catalogue documents. BigInts serialise as strings.

## Catalogue admin

| Method | Path | Permission | Body / query → result |
|---|---|---|---|
| GET | `/api/admin/activities` | `products.edit` | `?q&status(draft\|published\|archived\|deleted)&tier&category&page&pageSize` → `{ rows, total, page, pageSize }` |
| POST | `/api/admin/activities` | `products.edit` (+`products.publish` to publish) | `{ activity: ActivityInput, status?: "draft"\|"published", reason? }` → 201 row |
| GET | `/api/admin/activities/:id` | `products.edit` | → row + `content` (full document) + `versions[]` summary |
| PATCH | `/api/admin/activities/:id` | `products.edit` | `{ activity, expectedVersion?, reason? }` → row; stale `expectedVersion` → 409 |
| DELETE | `/api/admin/activities/:id` | `products.delete` | `{ reason }` → soft-deleted row |
| POST | `/api/admin/activities/:id/duplicate` | `products.edit` | → 201 draft copy |
| POST | `/api/admin/activities/:id/status` | `products.publish` | `{ status: "draft"\|"published"\|"archived", reason? }` |
| POST | `/api/admin/activities/:id/restore` | `products.delete` | undo soft delete → draft |
| POST | `/api/admin/activities/:id/restore-version` | `products.edit` | `{ version, reason? }` → new version equal to the old one |
| GET | `/api/admin/activities/:id/versions` | `products.edit` | `{ versions: [{ version, status, actorId, reason, createdAt, content }] }` |
| GET | `/api/admin/categories` | `products.edit` | `{ categories: [{ …row, category, activityCount }] }` |
| POST | `/api/admin/categories` | `categories.edit` | `{ category: CategoryInput, reason? }` → 201 (upsert by slug) |
| PATCH | `/api/admin/categories/:id` | `categories.edit` | `{ status, reason? }` |
| DELETE | `/api/admin/categories/:id` | `categories.edit` | `{ reason }`; 409 while activities use it |
| GET | `/api/admin/products` | `products.edit` | products + combos with fulfilment mode |
| POST | `/api/admin/products/:id/fulfilment-mode` | `products.publish` | `{ kind, mode, reason }` — THE HINGE |

`ActivityInput` = `src/server/schemas/activity.schema.ts` (`Activity` minus `id`, `rating`, `reviewCount`, `bookedThisMonth`, `fulfilmentMode` ignored). `CategoryInput` = slug, name, shortName, emoji?, tagline?, intro?, heroImage?, faqs?, relatedSlugs?, featuredSlugs?, sortOrder?.

## Imports

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/api/admin/imports/preview` | `imports.run` (20/h) | JSON `{ source: "csv", text, fileName?, mapping? }` \| `{ source: "sheet", url, mapping? }` \| `{ source: "doc", url?, text?, mapping? }` \| `{ source: "bulk", items: ActivityInput[] }`, or multipart `file` (+ `mapping` JSON string). → 201 `ImportPreview { batchId, headers, mapping, rowsTotal, rowsOk, rowsFailed, rows[], warnings[] }` |
| POST | `/api/admin/imports/fetch` | `imports.run` (20/h) | `{ url }` (docs.google.com only) → sheet `{ kind, headers, sample, rows, mapping }` or doc `{ kind, draft, warnings, sections }` |
| POST | `/api/admin/imports/:id/apply` | `imports.run` (20/h) | `{ partial?, publish?, reason? }` → `{ applied, created, updated, items[] }`; all-or-nothing unless `partial` |
| POST | `/api/admin/imports/:id/revert` | `imports.run` (20/h) | `{ reason? }` → `{ reverted }` |
| GET | `/api/admin/imports` | `imports.run` | `?page` → batches |
| GET | `/api/admin/imports/:id` | `imports.run` | batch + preview rows + errors + applied items |
| GET | `/api/admin/imports/export` | `products.edit` (20/h) | CSV of every activity (import template) |

## Reports and analytics

| Method | Path | Permission | Result |
|---|---|---|---|
| GET | `/api/admin/reports/inquiries?from&to` | `reports.view` | pipeline metrics + funnel + tier rates + sources + reconciliation |
| GET | `/api/admin/reports/dashboard?from&to` | `analytics.view` or `reports.view` | `{ daily[], topActivities[], whatsapp{ total, byContext[] }, statusChanges[], agents[], funnel, sources }` |
| GET | `/api/admin/reports/agents?from&to` | `analytics.view` or `reports.view` | `{ agents: [{ agentId, name, assigned, responded, medianFirstResponseSeconds, slaHitRate, won, lost, winRate, openNow, notes, contacts }] }` |
| GET | `/api/admin/audit` | `audit.view` | filterable audit log |

## Users and settings

`GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/reset` (`users.manage`); `GET/PUT /api/admin/settings` (`reports.view` / `settings.edit`).

## Admin auth

`POST /api/admin/auth/login` `{ email, password }` → `{ next: "totp"\|"enrol" }` (pending cookie); `POST /api/admin/auth/totp/enrol` → `{ secret, otpauthUri }`; `POST /api/admin/auth/totp/verify` `{ code }` → session (codes are single-use); `POST /api/admin/auth/logout`; `GET /api/admin/auth/me`.

## Agent console

| Method | Path | Permission |
|---|---|---|
| GET | `/api/agent/inquiries` (`?status&q&assignedAgentId&source&from&to&sort&page`) | `inquiries.view_own` (all with `view_all`) |
| GET | `/api/agent/inquiries/counts` | `inquiries.view_own` |
| GET | `/api/agent/inquiries/:id` (detail incl. timeline `events[]`, items, notifications; PII masked without `customers.view_pii`) | `inquiries.view_own` |
| POST | `/api/agent/inquiries/:id/claim` | `inquiries.claim` |
| POST | `/api/agent/inquiries/:id/assign` `{ agentId, reason? }` | `inquiries.assign` |
| POST | `/api/agent/inquiries/:id/unassign` `{ reason? }` | owner, else `inquiries.assign` |
| POST | `/api/agent/inquiries/:id/status` `{ to, reason?, note? }` | `inquiries.update` (ownership enforced) |
| POST | `/api/agent/inquiries/:id/notes` `{ note }` | `inquiries.update` |
| POST | `/api/agent/inquiries/:id/contact` `{ note? }` | `inquiries.update` |
| PATCH | `/api/agent/inquiries/:id/items/:itemId` | `inquiries.update` |
| POST | `/api/agent/inquiries/:id/spam` `{ reason, suppress }` | `inquiries.mark_spam` |
| POST | `/api/agent/inquiries/:id/convert` | `inquiries.convert` |
| POST | `/api/agent/notifications/:id/resend` | `notifications.resend` |
| GET | `/api/agent/agents` | `inquiries.view_own` |

## Public and customer

| Method | Path | Notes |
|---|---|---|
| GET | `/api/catalog` | published activities + categories snapshot; `s-maxage=60` |
| GET | `/api/catalog/fulfilment-modes` | `{ modes: { [slug]: "inquiry"\|"instant" } }` |
| GET | `/api/images/:kind/:slug/:index?w=` | 302 to a Pexels CDN photo, or an SVG fallback |
| POST | `/api/inquiries` | create inquiry (per-phone/IP limits, spam evaluation, server re-pricing) |
| POST | `/api/inquiries/lookup` `{ reference, phone }` | customer tracker |
| POST | `/api/events` | analytics collector (batch) |
| POST | `/api/auth/otp/request`, `/api/auth/otp/verify`, `/api/auth/logout`; GET `/api/auth/me` | customer OTP login |
| GET | `/api/me/inquiries`, `/api/me/orders`, `/api/me/export`; PATCH `/api/me`; GET/PUT `/api/me/preferences`; POST `/api/me/delete-request` | signed-in customer |
| GET/POST | `/api/jobs/inquiry-sweep`, `/api/jobs/offline-conversions` | cron |
| GET/POST | `/api/webhooks/whatsapp` | BSP webhook (signature-verified, stored first) |
| GET | `/api/health` | liveness |

## Permissions → roles

See `src/server/lib/permissions.ts`. Catalogue: `products.edit` (admin, ops, content), `products.publish` (admin, ops), `products.delete` (admin, ops), `categories.edit` (admin, ops, content), `imports.run` (admin, ops, content), `analytics.view` (admin, ops, agent_lead, finance, readonly).
