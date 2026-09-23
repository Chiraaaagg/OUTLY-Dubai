# 20 — Inquiry Mode backend: implementation record

**Date:** 14 September 2026 · **Status:** implemented, migrated, seeded, built, smoke-tested.
**Scope:** §17 Phases A–D on the minimal launch stack (Neon Postgres + Prisma, Resend, Vercel). Rathin, live availability, booking automation, vouchers, Razorpay API, WhatsApp BSP send, Meta CAPI/Pixel, Redis, PostHog and Sentry are deferred by decision; each has a port/adapter and `TODO(<name>)` markers, none is faked.
**Working notes per area:** `docs/backend/impl/*.md` (architect conventions in `19-implementation-conventions.md`).

---

## 1. What was implemented

| Area | Delivered |
|---|---|
| Database | 30 tables (Prisma 6, two migrations applied to Neon), hand-written checks/partial indexes/immutability triggers, sequences for `INQ-`/`OUT-` references, idempotent seed (roles, bootstrap admin, 28 products, 6 combos, 6 suppliers, settings, flags) |
| Inquiry engine | `inquiryService`: create (validation, E.164, spam verdict, rate limits, server re-pricing from fixtures, SLA deadline, lead routing, one transaction), customer lookup, list/search/counts, claim/assign, status machine, notes, contact log, per-item confirmed figures with tolerance warning, mark spam + suppression, `convertToOrder` → `orderService.createOrder` (column copy) + manual payment record, scheduled sweep (SLA breach, follow-up ladder, auto-lost, notification retry), metrics |
| Auth / RBAC | email + password (scrypt) → mandatory TOTP → 8h revocable session; 7 roles × 39 permissions checked inside services; audit log on every mutation; login lockout + rate limits |
| Admin | shell, login/verify/enrol, dashboard, users (create/edit/reset), settings (SLA, routing, follow-up, price tolerance), audit viewer, products (audited `fulfilment_mode` flip) |
| Agent console | queue (tabs, mine/unassigned, search, sort, SLA countdown, value triage out of hours), detail/customer-360-lite (items, figures, timeline, notes, assign, notifications, history), all actions as Server Actions |
| Notifications | channel-agnostic dispatch, Resend email (fetch) + log fallback, WhatsApp log adapter + Cloud-API-shaped live adapter, version-controlled template registry (3 WA utility templates), non-prod recipient allowlist, consent re-check at send, STOP handling, atomic retry, WhatsApp webhook (verify, HMAC, dedup, receipts) |
| Analytics | `/api/events` collector (server = source of truth), first-party session/anon/attribution cookies, server-emitted pipeline events, forwarder port (Meta/PostHog/GA4 no-op until keys), offline-conversion queue + cron, funnel/tier/source reports |
| Supplier layer | `SupplierPort`, manual adapter, Rathin mock + gated live skeleton with §16 blockers inline, registry, public `fulfilment-modes` read model |
| Security | proxy with CSP (nonce on /admin, no eval anywhere), HSTS, frame/robots/cache headers; 25-finding audit with 18 fixes (`impl/security.md`) |
| Ops | `/api/health`, `vercel.json` crons (sweep every 5 min, offline conversions daily), `.env.example` rewritten, `docs/backend/impl/*` runbooks |

Verification: `npm run typecheck` clean · `npm test` 16 files / 202 tests · `npm run build` 111 pages · `npm run db:status` up to date · browser smoke: login → MFA enrol → console; storefront form → `INQ-105072` (real agent, real deadline) → contacted → figures confirmed (+7% tolerance flag) → quoted → converted to `OUT-483081` (paid) → audit trail visible.

## 2. Files

- `prisma/schema.prisma`, `prisma/migrations/{20260914000000_init,20260914102118_inquiry_item_snapshots_and_money_guards}`, `prisma/seed.ts`
- `src/server/lib/*` (env, db, errors, http, crypto, ids, money, session, actor, permissions, audit, rate-limit, logger, defer)
- `src/server/domain/*` (sla, phone, inquiry-state, routing, spam) + tests
- `src/server/repositories/*` (admin, settings, inquiry, consent, audit, notifications, analytics, privacy)
- `src/server/services/*` (auth, settings, catalog, order, inquiry, inquiry.types, notification, analytics)
- `src/server/notifications/*`, `src/server/analytics/*`, `src/server/suppliers/*`, `src/server/schemas/*`
- `src/app/api/**` (34 routes), `src/app/admin/**` (10 pages, 4 action modules, shared components), `src/proxy.ts`
- Frontend wiring: `src/lib/api/index.ts`, `src/lib/analytics.ts`, `src/lib/whatsapp.ts`, `src/lib/types.ts` (`Agent.photoUrl`), `src/components/providers/app-provider.tsx`, `src/components/layout/{header,footer,storefront-only}.tsx`
- Config: `package.json` (scripts, deps: `@prisma/client`, `jose`, `zod`, `server-only`; dev: `prisma`, `tsx`, `vitest`), `next.config.mjs`, `vercel.json`, `vitest.config.mts`, `vitest.setup.ts`, `.env.example`, `.claude/launch.json`

## 3. Routes

Public: `POST /api/inquiries`, `POST /api/inquiries/lookup`, `POST /api/events`, `GET /api/catalog/fulfilment-modes`, `GET /api/health`, `GET|POST /api/webhooks/whatsapp`.
Admin auth: `POST /api/admin/auth/{login,totp/enrol,totp/verify,logout}`, `GET /api/admin/auth/me`.
Agent: `GET /api/agent/inquiries[/counts|/:id]`, `POST /api/agent/inquiries/:id/{claim,assign,status,notes,contact,spam,convert}`, `PATCH /api/agent/inquiries/:id/items/:itemId`, `POST /api/agent/notifications/:id/resend`, `GET /api/agent/agents`.
Admin: `GET|POST /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/reset`, `GET|PUT /api/admin/settings`, `GET /api/admin/audit`, `GET /api/admin/products`, `POST /api/admin/products/:id/fulfilment-mode`, `GET /api/admin/reports/inquiries`.
Jobs (CRON_SECRET): `/api/jobs/inquiry-sweep` (*/5 min), `/api/jobs/offline-conversions` (daily 03:30 UTC).
Pages: `/admin/{login,verify,enrol}`, `/admin`, `/admin/inquiries`, `/admin/inquiries/:id`, `/admin/users`, `/admin/settings`, `/admin/audit`, `/admin/products`.

## 4. Tables

admin_users, roles, role_permissions, admin_user_roles, admin_sessions, agent_availability, audit_logs, settings, feature_flags, suppliers, products, combos, product_supplier_mappings, inquiries, inquiry_items, inquiry_events, suppressed_phones, consents, guests, orders, order_items, order_attribution, payments, wa_conversations, notifications, webhook_events, analytics_events, rate_limit_buckets, idempotency_keys, job_executions (+ sequences `inquiry_ref_seq`, `order_ref_seq`).

## 5. Environment variables added or now read

Required: `DATABASE_URL` (pooled, `pgbouncer=true`), `DIRECT_URL`, `AUTH_JWT_SECRET`, `AUTH_COOKIE_SECRET`, `APP_ENV`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `ADMIN_BOOTSTRAP_EMAIL` (seed), `CRON_SECRET` (jobs).
Recommended: `TOTP_ENCRYPTION_KEY`, `RESEND_API_KEY`, `EMAIL_FROM_TRANSACTIONAL`, `EMAIL_REPLY_TO`, `EMAIL_OPS_ALERT_TO` / `OPS_ALERT_EMAIL`, `NOTIFICATION_RECIPIENT_ALLOWLIST` (non-prod), `EMAIL_CATCH_ALL`.
Optional/deferred: `ADMIN_BOOTSTRAP_NAME/PASSWORD`, `AUTH_ADMIN_SESSION_HOURS`, `ADMIN_LOGIN_RATE_LIMIT_PER_15MIN`, `INQUIRY_*`, `LOOKUP_*`, `EVENTS_RATE_LIMIT_PER_HOUR`, `SLA_*`, `ROUTING_*`, `AGENT_MAX_CONCURRENT_INQUIRIES`, `FOLLOWUP_LADDER_HOURS`, `PRICE_TOLERANCE_PERCENT`, `WHATSAPP_*` (incl. `WHATSAPP_TEMPLATE_INQUIRY_OPS_ALERT`), `META_*` (incl. `META_OFFLINE_EVENT_SET_ID`), `NEXT_PUBLIC_POSTHOG_*`, `GA4_*`, `SUPPLIER_ADAPTER_RATHIN`, `RATHIN_*`, `TURNSTILE_SECRET_KEY`, `FEATURE_*`, `SENTRY_DSN`.

## 6. Deviations from the blueprint (all recorded in the impl notes)

scrypt instead of Argon2id (no native dep) · `citext` avoided (lowercase on write) · `products.category_slug` text · `analytics_events` unpartitioned until volume · nonce CSP only on `/admin` (storefront is prerendered) · id/attribution cookies readable by JS (needed by the form) · Postgres rate limiting instead of Redis · `after()`-deferred side effects instead of QStash.

## 7. Remaining TODOs

See §10 of the chat completion report and `docs/backend/impl/security.md` §5 for the pre-launch checklist.

## 8. Addendum — 19 September 2026

Customer authentication (phone OTP) and the account area were added after the UI/UX audit (decision Q3). Tables: `customers`, `customer_sessions`, `otp_challenges`, plus `customer_id` on `inquiries`/`orders` (migration `20260918175017_customer_auth`). Routes: `/api/auth/{otp/request,otp/verify,logout,me}`, `/api/me/{,preferences,inquiries,orders,export,delete-request}`. SMS port with `log` and `msg91` adapters. Details: `impl/customer-auth.md`; UI-side changes: `docs/ui-audit-fixes.md`.
