# Environment variables

Source of truth for names and defaults: `.env.example` (grouped, commented) and the zod schema in `src/server/lib/env.ts` (`env()` throws at boot when a required value is missing in production). Local development reads `.env.local`; scripts run with `node --env-file=.env.local`.

**Required now** = the app will not start (or a launch feature will not work) without it. **Later** = the adapter is a no-op/log until set; nothing breaks.

## Core

| Variable | Purpose | Used in | Required |
|---|---|---|---|
| `DATABASE_URL` | Neon pooled connection (`?pgbouncer=true`) | `src/server/lib/db.ts` (Prisma) | now |
| `DIRECT_URL` | Neon direct connection for migrations/seed | `prisma/schema.prisma`, `npm run db:*` | now (deploy) |
| `APP_ENV` | `development` / `preview` / `production` — partitions analytics rows and notification allowlists | `env.ts`, analytics repo, notifications | now |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin; same-origin checks, sitemap, emails | `http.ts` `assertSameOrigin`, sitemap, templates | now |
| `AUTH_JWT_SECRET`, `AUTH_COOKIE_SECRET`, `TOTP_ENCRYPTION_KEY` | Admin session JWT, cookie/IP hashing key, TOTP secret encryption (32+ bytes each) | `lib/session.ts`, `lib/crypto.ts` | now |
| `ADMIN_BOOTSTRAP_EMAIL` / `_NAME` / `_PASSWORD` | First admin created by `npm run db:seed` (password printed once if blank) | `prisma/seed.ts` | now (first seed) |
| `AUTH_ADMIN_SESSION_HOURS`, `AUTH_CUSTOMER_SESSION_DAYS` | Session lifetimes (defaults 8 h / 90 d) | auth services | optional |
| `CRON_SECRET` | Bearer for `/api/jobs/*` (inquiry sweep, offline conversions); jobs are 503 without it | `http.ts` `requireCron` | now (prod) |
| `INTERNAL_API_KEY` | Reserved for server-to-server calls | — | later |

## Storefront identity (public)

`NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_EMERGENCY_PHONE`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_GSTIN`, `NEXT_PUBLIC_DED_LICENCE` — rendered by `src/lib/site-config.ts`; an unset value renders nothing (never a placeholder). Required before launch; not required to run.

## Images

| Variable | Purpose | Used in | Required |
|---|---|---|---|
| `PEXELS_API_KEY` | Pexels search for uncurated image indexes and for listings created in the console | `src/server/images/pexels.ts`, `image.service.ts` | set (works without it: curated ids + illustrated fallback) |

## Customer sign-in (OTP)

| Variable | Purpose | Required |
|---|---|---|
| `SMS_PROVIDER` | `log` (dev, code printed to server log) or `msg91` | now (`log` is fine for dev) |
| `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_TEMPLATE_ID_OTP` | MSG91 OTP delivery | later (before customer login goes live) |
| `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_RATE_LIMIT_*` | OTP policy | optional |
| `FEATURE_CUSTOMER_AUTH` | Force-enable/disable the customer login surface | optional |

## Notifications

| Variable | Purpose | Required |
|---|---|---|
| `RESEND_API_KEY`, `EMAIL_FROM_TRANSACTIONAL`, `EMAIL_REPLY_TO`, `EMAIL_OPS_ALERT_TO` | Email adapter (log adapter until set) | later |
| `WHATSAPP_PROVIDER` (`log` / `meta`), `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_TEMPLATE_*`, `WHATSAPP_OPS_ALERT_NUMBER` | WhatsApp Cloud API adapter + templates | later |
| `NOTIFICATION_RECIPIENT_ALLOWLIST` | Non-production recipient allowlist (everything else is suppressed) | now outside production |

## Operations policy (seeded into `settings`, editable in `/admin/settings`)

`SLA_INQUIRY_RESPONSE_MINUTES`, `SLA_BUSINESS_HOURS_START/END`, `SLA_TIMEZONE`, `SLA_ESCALATION_MINUTES`, `ROUTING_PREMIUM_THRESHOLD_INR`, `ROUTING_GROUP_THRESHOLD_PAX`, `AGENT_MAX_CONCURRENT_INQUIRIES`, `FOLLOWUP_LADDER_HOURS`, `PRICE_TOLERANCE_PERCENT`, `INQUIRY_MIN_SUBMIT_SECONDS`, `INQUIRY_RATE_LIMIT_PER_PHONE_PER_HOUR`, `INQUIRY_RATE_LIMIT_PER_IP_PER_HOUR`, `LOOKUP_RATE_LIMIT_PER_IP`, `LOOKUP_RATE_LIMIT_WINDOW_SECONDS`, `EVENTS_RATE_LIMIT_PER_HOUR` — all have defaults.

## Deferred integrations (ports exist; adapters are no-ops until keys arrive)

| Group | Variables | Status |
|---|---|---|
| Rathin supplier API | `SUPPLIER_ADAPTER_RATHIN=mock\|live`, `RATHIN_BASE_URL`, `RATHIN_CLIENT_ID`, `RATHIN_CLIENT_SECRET`, `RATHIN_AGENCY_ID`, `RATHIN_TIMEOUT_MS` | later — architecture only; never required |
| Payments | `RAZORPAY_*`, `AED_GATEWAY_*` | later (booking mode) |
| Analytics forwarders | `NEXT_PUBLIC_POSTHOG_KEY/HOST`, `POSTHOG_API_KEY`, `NEXT_PUBLIC_META_PIXEL_ID`, `META_DATASET_ID`, `META_CAPI_ACCESS_TOKEN`, `META_*` | later — collector stores everything; forwarders no-op |
| Monitoring | `SENTRY_*` | later |
| Bot check | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | later |
| Redis / queues | `UPSTASH_*`, `QSTASH_*` | later — Postgres rate limiter + `after()` deferral in use |
| Media CDN | `NEXT_PUBLIC_MEDIA_BASE_URL` | later |

## Feature flags

`FEATURE_DESIGN_SYSTEM_PAGE`, `FEATURE_RESPONSE_PROMISE`, `FEATURE_MAINTENANCE_MODE`, `FEATURE_CUSTOMER_AUTH`, `FEATURE_FORCE_CHECKOUT_ROUTE` — read at boot into `feature_flags` by the seed.

## Nothing new this round

The catalogue management, imports, analytics and security work added **no new environment variables**. Google Sheet/Doc imports use public "anyone with the link" export URLs — no Google API key.
