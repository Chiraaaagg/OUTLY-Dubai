# 19 — Backend implementation conventions (READ FIRST)

**Status:** binding for every agent working on the Inquiry Mode backend.
**Scope:** docs/backend/17-inquiry-mode-pivot.md Phases A–D, on the minimal launch stack.
Anything not covered here is answered by §03 (stack), §04 (architecture), §05 (DB), §09 (console), §10 (admin), §11 (analytics), §12 (API), §13 (security), §17 (pivot), §18 (preflight).

---

## 0. Decisions in force (do not relitigate)

| Topic | Decision |
|---|---|
| Runtime | Next.js 16 App Router (`src/app/**`), Node runtime for every route (`export const runtime = "nodejs"`). No edge runtime. `src/proxy.ts` is the middleware. |
| Database | Neon Postgres via **Prisma 6** (`prisma/schema.prisma`, migrations in `prisma/migrations`). `DATABASE_URL` pooled, `DIRECT_URL` for migrations. **Only `src/server/lib/db.ts` and `src/server/repositories/**` import `@prisma/client` runtime.** Types (`import type { Prisma }`) are allowed in services. |
| Money | `BigInt` minor units in the DB (paise/fils). `Money` in major units only in DTOs/UI. Convert with `src/server/lib/money.ts`. |
| IDs | `uuidv7()` from `src/server/lib/ids.ts` for every PK. Human references `INQ-…`/`OUT-…` from DB sequences + Luhn digit (`formatReference`). |
| Validation | zod v4 in the route, `parseJson(req, schema)` / `parseQuery`. Schemas are `.strict()` (unknown keys rejected). Never echo raw input into an error message. |
| Errors | Throw `Errors.*` from `src/server/lib/errors.ts`. Routes are wrapped in `handle()` which renders the §12 envelope `{ error: { code, message, recovery, retryable, details } }`. |
| Auth | Admin/agent only. `authService.requireRequest(req, permission)` in routes; `authService.requireCookies(permission)` in Server Components/Actions. No customer login exists. |
| Permissions | Named permissions (`src/server/lib/permissions.ts`), checked **inside services** with `requirePermission(actor, …)`. The UI hides; the service refuses. Never `if (role === …)` in a service. |
| Audit | `audit(actor, action, { type, id }, { before, after, reason }, tx?)` for every admin/agent mutation. Rows are immutable (DB trigger). |
| Rate limits | `enforceRateLimit({ key, limit, windowSeconds })` — Postgres-backed, fails open with a log. Keys never contain raw PII (hash phones/IPs; `hashIp`, `sha256Hex`). |
| Logging | `log.*` from `src/server/lib/logger.ts` only. It redacts PII by key name. Never `console.log` PII. |
| Deferred integrations | Rathin, live availability, booking automation, vouchers, Razorpay API, WhatsApp BSP send, Meta CAPI/Pixel, Redis, PostHog, Sentry. **Ports and adapters exist; credentials absent ⇒ log/mock adapter.** Mark every stub with `TODO(<integration>):` and never fake a response that looks real. |
| Site-wide inquiry flag | **Forbidden.** `products.fulfilment_mode` per SKU is the only switch (§17 §8.4). |

## 1. Layering (enforced by review)

```
src/app/api/**/route.ts       transport: parse → auth → ONE service call → respond   (~10–30 lines)
src/app/admin/**              Server Components read via services; mutations via Server Actions → services
src/server/services/**        orchestration, transactions, permissions, audit
src/server/domain/**          PURE. No I/O, no env, no clock (time injected). Unit-tested.
src/server/repositories/**    Prisma. Returns DTOs, applies ownership/soft-delete filters.
src/server/notifications/**   templates + channel adapters (email: Resend; whatsapp: log|cloud_api)
src/server/analytics/**       forwarders port (all no-op until credentials)
src/server/suppliers/**       SupplierPort + adapters (Rathin NOT READY → mock; manual)
src/server/lib/**             env, db, errors, http, crypto, ids, money, session, audit, rate-limit, actor, permissions, logger
```

Rules: `app/api` never imports repositories. `domain` imports nothing but `domain/*` and `src/lib/types.ts`. Services may import other services. `"server-only"` at the top of every non-domain server file (domain files are also imported by unit tests, so they must not import it).

## 2. What already exists (do not rewrite — extend)

| File | Owns |
|---|---|
| `prisma/schema.prisma` + `prisma/migrations/20260914000000_init` | Full schema incl. hand-written checks/partial indexes/immutability triggers. **Schema changes go through the Database agent only.** Applied to the dev branch. |
| `prisma/seed.ts` (`npm run db:seed`) | roles/permissions, bootstrap admin, suppliers/products/combos from fixtures, settings, flags. |
| `src/server/lib/*` | as listed above — complete. |
| `src/server/domain/{sla,phone,inquiry-state,routing,spam}.ts` | SLA deadline + business hours, E.164, status machine + lost reasons, lead routing, spam verdict. |
| `src/server/repositories/{admin,settings,inquiry,consent}.repo.ts` | |
| `src/server/services/auth.service.ts` | login → TOTP → session; user CRUD; `requireRequest/requireCookies`. |
| `src/server/services/settings.service.ts` | typed `sla/routing/followup/pricing` settings with env defaults + audited `update`. |
| `src/server/services/catalog.service.ts` | server re-pricing from fixtures; `fulfilmentModes()`; audited `setFulfilmentMode` (the Rathin flip). |
| `src/server/services/order.service.ts` | `createOrder(input, actor, tx?)` — THE single order path; `recordManualPayment`. |
| `src/server/services/inquiry.service.ts` | `create`, `lookupForCustomer`, `get`, `list`, `queueCounts`, `claim`, `assign`, `transition`, `addNote`, `logContact`, `updateItem`, `markSpam`, `unsuppress`, `convertToOrder`, `sweep`, `metrics`. |
| `src/server/services/inquiry.types.ts` | DTOs: `InquiryDetail`, `InquirySummary`, `InquiryItemDetail`, `InquiryEventDetail`, `AgentPublic`, `CreateInquiryInput/Result`, `InquiryListFilters`, `QueueCounts`. |
| `src/server/services/notification.service.ts` + `src/server/notifications/*` | `dispatch`, `onInquirySubmitted/Assigned/SlaBreach/FollowupDue/Won`, `resend`, `retryFailed`; templates; Resend + log email adapter; WhatsApp log/cloud_api adapter; non-prod allowlist. |
| `src/server/services/analytics.service.ts` + `src/server/analytics/forwarders.ts` | `emit` (server), `collect` (client batch); forwarders port. |
| `src/app/api/admin/auth/{login,totp/enrol,totp/verify,logout,me}` | done. |
| `src/app/api/health` | done. |
| `src/proxy.ts` | security headers (nonce CSP in prod), admin gate, design-system block, maintenance. |

## 3. Route contract (to build) — `src/app/api/**`

All responses JSON via `json()`. Errors via envelope. Every route: `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`

| Method | Path | Auth | Service call | Notes |
|---|---|---|---|---|
| POST | `/api/inquiries` | public | `inquiryService.create(body, {ip, userAgent})` | body = `SubmitInquiryInput` from `src/lib/api/index.ts` + optional `attribution`, `sessionId`, `anonId`. Returns `CreateInquiryResult`. `assertSameOrigin`. |
| POST | `/api/inquiries/lookup` | public | `inquiryService.lookupForCustomer(reference, phone, countryCode)` | rate limit **5/IP/15min** (`LOOKUP_RATE_LIMIT_*`). 404 on any mismatch. |
| POST | `/api/events` | public | `analyticsService.collect(events)` | accepts one object or array (sendBeacon). Rate limit `EVENTS_RATE_LIMIT_PER_HOUR` per anon id/IP. 204. Validate `event` against `AnalyticsEvent` names in `src/lib/analytics.ts`. |
| GET | `/api/agent/inquiries` | `inquiries.view_own` | `inquiryService.list(actor, filters)` | query = `InquiryListFilters` |
| GET | `/api/agent/inquiries/counts` | `inquiries.view_own` | `queueCounts` | |
| GET | `/api/agent/inquiries/:id` | view | `get` | |
| POST | `/api/agent/inquiries/:id/claim` | `inquiries.claim` | `claim` | |
| POST | `/api/agent/inquiries/:id/assign` | `inquiries.assign` | `assign(actor,id,agentId,reason)` | |
| POST | `/api/agent/inquiries/:id/status` | `inquiries.update` | `transition(actor,id,to,{reason,note})` | |
| POST | `/api/agent/inquiries/:id/notes` | `inquiries.update` | `addNote` | |
| POST | `/api/agent/inquiries/:id/contact` | `inquiries.update` | `logContact` | |
| PATCH | `/api/agent/inquiries/:id/items/:itemId` | `inquiries.update` | `updateItem` | returns `{ inquiry, toleranceExceeded, tolerancePercent }` |
| POST | `/api/agent/inquiries/:id/spam` | `inquiries.mark_spam` | `markSpam(actor,id,{reason,suppress})` | |
| POST | `/api/agent/inquiries/:id/convert` | `inquiries.convert` | `convertToOrder` | |
| POST | `/api/agent/notifications/:id/resend` | `notifications.resend` | `notificationService.resend` | |
| GET | `/api/agent/agents` | `inquiries.view_own` | `adminRepo.listRoutable()` (public fields only) | for the assign picker |
| GET | `/api/admin/users` · POST · PATCH `/:id` · POST `/:id/reset` | `users.manage` | `authService.*` | |
| GET/PUT | `/api/admin/settings` | `settings.edit` (GET: `reports.view`) | `settingsService` | |
| GET | `/api/admin/audit?actor&entity&from&to&page` | `audit.view` | prisma via a new `audit.repo.ts` | |
| GET | `/api/admin/products` · POST `/api/admin/products/:id/fulfilment-mode` | `products.edit` / `products.publish` | `catalogService` | |
| GET | `/api/admin/reports/inquiries?from&to` | `reports.view` | `inquiryService.metrics` | |
| GET | `/api/catalog/fulfilment-modes` | public, cache 60s | `catalogService.fulfilmentModes()` | storefront read model for the hinge |
| POST | `/api/jobs/inquiry-sweep` | `requireCron(req)` | `inquiryService.sweep()` | Vercel Cron every 5 min (`vercel.json`) |
| GET/POST | `/api/webhooks/whatsapp` | verify token / HMAC | persist raw to `webhook_events`, 200 fast | TODO(whatsapp-bsp) processing |

## 4. Admin UI contract — `src/app/admin/**`

- Server Components; mutations via **Server Actions** in `src/app/admin/_actions/*.ts` that call services and `revalidatePath`. Never call `/api/*` from server components — call the service.
- `src/app/admin/layout.tsx` resolves the session (`authService.resolveCookies()`); redirects to `/admin/login` when absent; renders a minimal shell (nav: Inquiries · Dashboard · Users · Settings · Audit · Products). Passes `permissions` to the client only as a string array — never secrets.
- Auth pages: `/admin/login` (email+password → POST login), `/admin/verify` (6-digit TOTP), `/admin/enrol` (secret + otpauth URI; render the URI as a link and the key as text — no QR library).
- Design: reuse `src/components/ui/*` (Button, Card, Badge, Alert, Tabs, Sheet) and OUTLYY tokens. No new runtime dependencies. Admin is light-mode, dense, keyboard-friendly; 44px targets. If you take a layout pattern from 21st.dev, note which one and why in the page header comment.
- Customer text (`leadName`, `specialRequests`, notes) is untrusted: React escapes by default — never `dangerouslySetInnerHTML`.

## 5. Frontend wiring (Analytics + Inquiry agents)

- `src/lib/api/index.ts`: `submitInquiry` → `POST /api/inquiries` when `currentScenario() === "ok"` (keep `?mock=` scenarios working for the design-system page); map envelope → `ApiError` (`code` unknown ⇒ `"error"`). `fetchInquiry` is customer lookup → needs phone; keep the mock for the account page (customer accounts are out of scope) and add `lookupInquiry(reference, phone)` for a `/inquiry/track` page if time permits (optional).
- `src/lib/analytics.ts`: `deliver()` posts to `/api/events` (the env var is already `/api/events`); batch with `sendBeacon`, fall back to `fetch(keepalive)`. Include `session_id`/`anon_id` from a first-party cookie set by the app provider (`outlyy_sid`, `outlyy_aid`, non-httpOnly, 1y) and attribution (utm/fbclid/fbp/fbc/gclid/referrer/landing) captured on first visit into `outlyy_attr` cookie (JSON, 1y). Pass `attribution`, `sessionId`, `anonId` in `submitInquiry`.
- `src/lib/whatsapp.ts`: `WHATSAPP_NUMBER` from `process.env.NEXT_PUBLIC_WHATSAPP_NUMBER` with the placeholder as fallback + a dev-time console warning (§18 code fix). The frontend `Agent` type gains optional `photoUrl`.

## 6. Verification before you report done

```bash
npm run typecheck && npm test && npm run build
```
Plus: `npm run db:status` (no pending migrations), `GET /api/health` returns 200.

## 7. Communication between agents

- Write a short note to `docs/backend/impl/<agent>.md`: what you built, files touched, contract deviations, open questions. Read the other notes before starting; if you need something from another owner, write it under **"Requests"** in your note and use the existing contract in the meantime.
- Never edit another agent's owned files. If you must (bug in a contract), make the smallest fix and record it in your note under **"Cross-cutting edits"**.
- Schema changes: only the Database agent edits `prisma/schema.prisma` and creates migrations (`npm run db:migrate:dev -- --name <slug>` against the dev branch). Others request via notes.

## 8. Ownership

| Agent | Owns |
|---|---|
| Backend Architect (main thread) | this doc, `src/server/lib/**`, service contracts, final integration + report |
| Database | `prisma/**`, indexes/constraints review, `audit.repo.ts`, data-integrity tests |
| Inquiry Engine | `src/app/api/inquiries/**`, `src/app/api/agent/**`, `src/app/api/jobs/**`, `vercel.json` crons, `src/server/domain/__tests__/**`, `src/lib/api/index.ts` wiring, review of `inquiry.service.ts` |
| Admin | `src/app/admin/{layout,login,verify,enrol,users,settings,audit,products,page}.tsx`, `src/app/admin/_actions/**`, `src/app/api/admin/{users,settings,audit,products,reports}/**` |
| Agent Console | `src/app/admin/inquiries/**` (queue, detail, actions), `src/app/admin/_components/**` |
| Notification | `src/server/notifications/**`, `notification.service.ts` refinements, `src/app/api/webhooks/whatsapp`, docs on templates |
| Analytics | `src/server/analytics/**`, `analytics.service.ts`, `src/app/api/events`, `src/lib/analytics.ts`, attribution cookies in `app-provider.tsx`, `src/app/api/admin/reports/**` |
| Security | full review of everything; fixes recorded in `docs/backend/impl/security.md`; `src/app/api/catalog/**` if unowned |
| Future Rathin | `src/server/suppliers/**`, `src/app/api/catalog/fulfilment-modes`, `docs/backend/impl/rathin.md` integration guide |
