# Backend Pre-Flight Audit

**Version:** 1.0 · **Date:** 14 September 2026 · **Status:** Dependency audit. Awaiting your response before any implementation.
**Scoped against:** Inquiry Mode (§17), not the full booking architecture. That distinction removes roughly half the dependency list.

---

## 0. Read this first — three things that shape the whole list

**1. Inquiry Mode deletes most of the dependency burden.** The booking architecture needed payments, vouchers, object storage, a queue, SMS OTP and a supplier API on day one. Inquiry Mode needs **a database, an email provider, and a WhatsApp number.** Everything else is either later or never. I have marked eight services **SKIP** — do not create accounts for them.

**2. Your current env surface is effectively zero.** The only `process.env` reference in the codebase is an optional `NEXT_PUBLIC_ANALYTICS_ENDPOINT` in `src/lib/analytics.ts`. There is nothing to migrate. One live bug to fix in the same pass: `src/lib/whatsapp.ts` hard-codes `WHATSAPP_NUMBER = "919000000000"` — a placeholder that would ship a dead CTA.

**3. The critical path is paperwork, not keys.** Most credentials here take ten minutes to create. Three take **weeks**, and two of them gate your launch:

| Dependency | Typical lead time | Gates |
|---|---|---|
| **Meta Business verification** | Days to several weeks **[verify — varies by documentation quality]** | WhatsApp Business API, Pixel, CAPI |
| **WhatsApp Business Account + number + template approval** | 1–3 weeks end to end **[verify with your chosen BSP]** | **Phase B — the launch line** |
| **Razorpay KYC** | 2–7 working days **[verify]** | First payment collected |

**Start those three today.** They are not blocked by any engineering work, and engineering is not blocked by them until Phase B. If you start them when you need them, you lose two to three weeks.

**Priority key used throughout:**

| | Meaning |
|---|---|
| 🔴 **P0** | Blocking. Needed before the first line of backend code |
| 🟠 **P1** | Needed for launch (Phase B). Start the slow ones now |
| 🟡 **P2** | Needed shortly after launch |
| ⚪ **SKIP** | Not needed. Do not create an account |

---

## 1. Required API Keys, Credentials and Environment Variables

### 1.1 Database

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| Neon pooled connection string | Application runtime queries. Pooled because serverless functions exhaust direct connections | Now | `DATABASE_URL` | 🔴 **P0** |
| Neon direct connection string | Prisma migrations only — migrations cannot run through a pooler | Now | `DIRECT_URL` | 🔴 **P0** |
| Neon API key *(optional)* | Automated DB branch per preview deploy in CI | Later | `NEON_API_KEY` | 🟡 P2 |

**Notes.** Neon supplies both strings from one project. You need **three separate databases or branches**: development, staging, production. Staging must be seeded from an *anonymised* dump — never production PII (§14.1).

### 1.2 Authentication

Customer accounts are **not** in Inquiry Mode scope — there is no login, no OTP, no session for visitors. These credentials are for **admin and agent** access only.

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| JWT signing secret | Signs admin/agent access tokens. Generate with `openssl rand -base64 48` — not a purchased key | Now | `AUTH_JWT_SECRET` | 🔴 **P0** |
| Session/cookie secret | Signs the httpOnly refresh cookie | Now | `AUTH_COOKIE_SECRET` | 🔴 **P0** |
| TOTP encryption key | Encrypts agent MFA secrets at rest (`admin_users.totp_secret_encrypted`) | Now | `TOTP_ENCRYPTION_KEY` | 🟠 P1 |
| Bootstrap admin email | Seeds the first admin account so you can log in at all | Now | `ADMIN_BOOTSTRAP_EMAIL` | 🔴 **P0** |
| ~~SMS provider (MSG91 / Twilio)~~ | Customer phone OTP | — | — | ⚪ **SKIP** |

**On the SMS skip.** §03 recommended MSG91 for customer OTP. Inquiry Mode has no customer login, so this is not needed — **and that is worth money**: Indian SMS requires DLT template registration, which is a multi-day bureaucratic process. You have avoided it entirely for now.

### 1.3 Email

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| Resend API key | Inquiry acknowledgement to customer; inquiry alert to ops | Now | `RESEND_API_KEY` | 🔴 **P0** |
| Transactional from-address | Sender identity, e.g. `hello@outly.in` | Now | `EMAIL_FROM_TRANSACTIONAL` | 🔴 **P0** |
| Ops alert recipients | Comma-separated list of ops inboxes for new-inquiry alerts | Now | `EMAIL_OPS_ALERT_TO` | 🔴 **P0** |
| Reply-to address | Where customer replies land | Now | `EMAIL_REPLY_TO` | 🟠 P1 |
| **DNS records** — SPF, DKIM, DMARC | Deliverability. Without these, acknowledgement emails go to spam, and the acknowledgement is the backbone of the 30-minute promise | Now | *(DNS, not env)* | 🔴 **P0** |

**Notes.** Use a **subdomain** for transactional mail (`mail.outly.in`) so that any future marketing sending cannot damage transactional deliverability. Resend's free tier is generally sufficient at launch volumes **[verify current limits]**.

### 1.4 WhatsApp

Split deliberately: click-to-chat needs **no credentials at all**, and it is what Phase A runs on.

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| **Business WhatsApp number (E.164)** | Powers all 25+ existing click-to-chat CTAs. **Replaces the hard-coded placeholder** | Now | `NEXT_PUBLIC_WHATSAPP_NUMBER` | 🔴 **P0** |
| BSP API key / access token | Sends the automatic acknowledgement — the core of the 30-minute promise | Launch | `WHATSAPP_API_TOKEN` | 🟠 **P1** |
| WhatsApp phone number ID | Identifies the sending number in API calls | Launch | `WHATSAPP_PHONE_NUMBER_ID` | 🟠 **P1** |
| WhatsApp Business Account ID | Template management | Launch | `WHATSAPP_BUSINESS_ACCOUNT_ID` | 🟠 **P1** |
| Webhook verify token | Self-generated string Meta echoes during webhook setup | Launch | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | 🟠 **P1** |
| Webhook signing secret | Verifies inbound webhooks are genuine | Launch | `WHATSAPP_WEBHOOK_SECRET` | 🟠 **P1** |
| BSP base URL | Differs per provider | Launch | `WHATSAPP_API_BASE_URL` | 🟠 **P1** |
| Approved template names | Config, not secrets — version-controlled per `AC-WA-04` | Launch | `WHATSAPP_TEMPLATE_INQUIRY_ACK`, `..._FOLLOWUP` | 🟠 **P1** |

**Two templates only at launch.** Inquiry acknowledgement (utility) and follow-up nudge (utility). Submit both for approval during Phase A, not Phase B — approval is the delay, not the integration.

**The number gotcha that catches everyone:** a phone number registered on the consumer WhatsApp app **cannot** be used for the Business API until it is deleted from WhatsApp there, and that deletion is irreversible for that number's chat history. Decide now whether you are using a fresh number.

### 1.5 Analytics

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| Meta Pixel ID | Client-side events. You are already running Meta ads, so this matters from the first ad rupee | Launch | `NEXT_PUBLIC_META_PIXEL_ID` | 🟠 **P1** |
| Meta CAPI access token | Server-side `Lead` events. In Inquiry Mode, **`inquiry_submitted` is the optimisation signal** | Launch | `META_CAPI_ACCESS_TOKEN` | 🟠 **P1** |
| Meta dataset ID | CAPI destination | Launch | `META_DATASET_ID` | 🟠 **P1** |
| Meta test event code | Dev/staging validation only | Launch | `META_CAPI_TEST_EVENT_CODE` | 🟡 P2 |
| PostHog project key | Funnels, cohorts, drop-off analysis | Post-launch | `NEXT_PUBLIC_POSTHOG_KEY` | 🟡 P2 |
| PostHog host | Region endpoint | Post-launch | `NEXT_PUBLIC_POSTHOG_HOST` | 🟡 P2 |
| GA4 measurement ID | Marketing reporting | Post-launch | `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | 🟡 P2 |
| GA4 API secret | Server-side Measurement Protocol | Post-launch | `GA4_API_SECRET` | 🟡 P2 |
| Meta Marketing API token | Pulls ad spend to compute blended CAC (`AC-AN-03`) | Post-launch | `META_MARKETING_API_TOKEN` | 🟡 P2 |
| Meta ad account ID | Same | Post-launch | `META_AD_ACCOUNT_ID` | 🟡 P2 |

**Meta is P1, not P2, and here is why.** In Inquiry Mode *every* purchase happens offline — an agent closes it on WhatsApp. If the Pixel and CAPI are not live from the first ad, Meta optimises against no conversion signal at all. §11 already flags offline conversion upload as the expensive mistake; Inquiry Mode raises it from important to structural.

### 1.6 Cache, rate limiting and scheduled work

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| Upstash Redis REST URL | Rate limiting on the public inquiry form (spam control, §9) | Launch | `UPSTASH_REDIS_REST_URL` | 🟠 P1 |
| Upstash Redis REST token | Same | Launch | `UPSTASH_REDIS_REST_TOKEN` | 🟠 P1 |
| Cron secret | Authenticates scheduled endpoints (SLA sweep, follow-up ladder) so they are not publicly callable | Launch | `CRON_SECRET` | 🟠 **P1** |
| ~~QStash token + signing keys~~ | Delayed job queue | — | — | ⚪ **SKIP** |

**On skipping QStash.** §03 recommended it for the booking architecture's fan-out of retried jobs. Inquiry Mode has one scheduled need: poll `inquiries.next_followup_at` and `sla_due_at`, act on what is due. **A Netlify Scheduled Function running every few minutes does this with no new service and no new vendor.** Revisit QStash only if you later need per-job retries and a dead-letter queue — which the booking path will, and the inquiry path will not.

Redis is genuinely optional too: rate limiting can be a Postgres table at your volumes. I have kept it P1 because Upstash's free tier is trivial and the library is well-worn, but **it is a defensible cut if you want one fewer account.**

### 1.7 Storage

| Name | Purpose | When | Priority |
|---|---|---|---|
| ~~Cloudflare R2 (account ID, access key, secret, bucket)~~ | Vouchers, supplier tickets, review photos | — | ⚪ **SKIP** |

**Skip entirely.** No vouchers are issued in Inquiry Mode. Product imagery is generated SVG scenes in-repo (`components/ui/scene.tsx`). Review photo upload is deferred. There is nothing to store. Revisit when either real photography or vouchers arrive.

### 1.8 Monitoring

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| Sentry DSN | Error tracking. The only way you will learn a submission silently failed | Now | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | 🔴 **P0** |
| Sentry auth token | Source-map upload in CI | Later | `SENTRY_AUTH_TOKEN` | 🟡 P2 |
| Sentry org + project slugs | CI config | Later | `SENTRY_ORG`, `SENTRY_PROJECT` | 🟡 P2 |
| Uptime monitor | Alerts if the site or `/api/health` is down | Launch | *(external)* | 🟠 P1 |

**Sentry is P0 despite being "just monitoring".** A failed inquiry submission is a lost lead you will never know about. At launch volumes you will not notice a 2% error rate by eye.

### 1.9 Payments

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| **Razorpay dashboard access** | Agents generate Payment Links by hand. **This is a login, not an API key** | Phase C | *(none)* | 🟠 **P1** |
| Razorpay Key ID | Only when links are generated from the admin panel or payments recorded automatically | Later | `RAZORPAY_KEY_ID` | 🟡 P2 |
| Razorpay Key Secret | Same | Later | `RAZORPAY_KEY_SECRET` | 🟡 P2 |
| Razorpay webhook secret | Verifies payment webhooks | Later | `RAZORPAY_WEBHOOK_SECRET` | 🟡 P2 |
| ~~UAE gateway (Telr / Network / Stripe UAE)~~ | AED collection | — | — | ⚪ **SKIP** |

**The useful nuance:** manually-sent Payment Links need **no integration and no API credentials** — an agent creates them in the Razorpay dashboard. But **KYC still takes days**, so open the account now even though no code touches it for weeks.

**Published Razorpay standard pricing is 2% + GST across modes**, with custom pricing available above ₹5,00,000/month. Your business model assumed 2.2%; the standard rate is ~2.36% effective. Negotiate before volume, not after.

### 1.10 Future — Rathin integration

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| ~~Rathin base URL~~ | API host | Blocked | `RATHIN_BASE_URL` | ⚪ **SKIP** |
| ~~Rathin ClientId~~ | Auth header | Blocked | `RATHIN_CLIENT_ID` | ⚪ **SKIP** |
| ~~Rathin ClientSecret~~ | Auth header | Blocked | `RATHIN_CLIENT_SECRET` | ⚪ **SKIP** |
| ~~Rathin agencyId~~ | Required on at least one endpoint | Blocked | `RATHIN_AGENCY_ID` | ⚪ **SKIP** |

**Do not request these yet.** §16 classified the Rathin adapter **NOT READY** with eight blocking questions unanswered, no sandbox, and an unverified v2 booking response. Inquiry Mode removes all urgency. Holding these credentials without the answers creates a temptation to start building against guesses.

### 1.11 Infrastructure and application config

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| Site URL | Absolute links in emails and WhatsApp messages | Now | `NEXT_PUBLIC_SITE_URL` | 🔴 **P0** |
| App environment | Gates the non-production recipient allowlist — **the guard that stops staging messaging real customers** | Now | `APP_ENV` | 🔴 **P0** |
| Netlify account access | Deploys, env var management, scheduled functions | Now | *(existing)* | 🔴 **P0** |
| Domain + DNS control | Site, email auth, verification records | Now | *(DNS)* | 🔴 **P0** |
| GitHub repo + CI secrets | Migrations and deploys from CI | Now | *(repo settings)* | 🟠 P1 |
| Non-prod recipient allowlist | Comma-separated safe addresses/numbers for staging | Now | `NOTIFY_ALLOWLIST` | 🟠 **P1** |

### 1.12 Spam and abuse *(conditional)*

| Name | Purpose | When | Env var | Priority |
|---|---|---|---|---|
| Cloudflare Turnstile site key | Bot challenge on the inquiry form | **Only if spam appears** | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | ⚪ Conditional |
| Cloudflare Turnstile secret | Server verification | **Only if spam appears** | `TURNSTILE_SECRET_KEY` | ⚪ Conditional |

Per §17.9: launch with a honeypot field, a submission-timing check and rate limits. Add a visible challenge only when spam volume justifies the conversion cost, and measure the delta when you do.

---

## 2. Required Third-Party Services

### 2.1 Create now — blocking

| Service | Why | Mandatory? | Lead time |
|---|---|---|---|
| **Neon** (PostgreSQL) | Source of truth. Inquiries, catalogue, admin users, audit log | **Mandatory** | Minutes |
| **Resend** (email) | Customer acknowledgement + ops alerting. Without it an inquiry vanishes into a database nobody is watching | **Mandatory** | Minutes + DNS propagation |
| **Domain + DNS** | Site, SPF/DKIM/DMARC, verification records | **Mandatory** | You may already have this |
| **Sentry** | Error tracking | Strongly recommended | Minutes |
| **Netlify** | Hosting — already in use. 60s sync / 30s scheduled / 15min background limits are adequate | **Mandatory** | Existing |

### 2.2 Start now, needed at launch — long lead time

| Service | Why | Mandatory? | Lead time |
|---|---|---|---|
| **Meta Business Manager + business verification** | Prerequisite for WhatsApp Business API, Pixel and CAPI | **Mandatory** | **Days to weeks** |
| **WhatsApp BSP** (Wati / Interakt / AiSensy / Gupshup) | Sends the automatic acknowledgement. **Without it there is no 30-minute promise** | **Mandatory for launch** | **1–3 weeks** incl. template approval |
| **Razorpay** | Payment Links. KYC is slow; the integration is not | **Mandatory before first revenue** | **2–7 days** KYC |

**Selection criterion for the BSP, restated from §08.3:** choose on **webhook reliability and API completeness**, not on inbox features. You are building the console. Verify before signing that you can receive every inbound message by webhook, send templates and media by API, and get delivery receipts. If any answer is no, pick another.

### 2.3 Add after launch

| Service | Why | Mandatory? | When |
|---|---|---|---|
| **Upstash Redis** | Rate limiting | Optional — Postgres is a valid substitute | Phase B |
| **PostHog** | Funnels, drop-off, cohorts | Optional but high value | Phase D |
| **GA4** | Marketing reporting, Google Ads | Optional | Phase D |
| **Uptime monitor** (e.g. Better Stack, UptimeRobot) | Alerts on downtime | Recommended | Phase B |

### 2.4 Do not create — explicitly skipped

| Service | Why skipped |
|---|---|
| **Cloudflare R2 / S3** | Nothing to store. No vouchers, no uploads, SVG imagery in-repo |
| **Upstash QStash** | One scheduled need; a Netlify Scheduled Function covers it |
| **MSG91 / Twilio** | No customer OTP. Also avoids Indian DLT template registration |
| **UAE payment gateway** | AED collection deferred; blocked on the entity decision |
| **Rathin API** | §16 — NOT READY, eight blocking questions |
| **Typesense / Algolia** | 26 SKUs. Postgres full-text is ample below ~5,000 |
| **Clerk / Auth.js** | No customer auth. Admin auth is ~200 lines |
| **Vercel** | Netlify's limits are adequate (§00 D3). Migrating mid-build buys nothing |

**Eight services you do not need to think about.** That is the real output of this audit.

---

## 3. Missing Information

These are genuinely blocking or near-blocking. I have not assumed answers.

### 🔴 Q1 — Which legal entity is contracting, and does it have an Indian bank account?

**This is the most blocking item on the page**, because it determines whether your chosen payment gateway can onboard you at all.

**Razorpay is an Indian payment gateway and requires an Indian registered entity with an Indian current account.** If the contracting entity for OUTLY is a **Dubai** company, Razorpay India will not onboard it, and the payment plan in §17 needs rethinking before Phase C.

Options as I understand them:
- **Holiday Chacha Private Limited** (India) — existing entity, existing GST, probably existing banking. Fastest path. May already have a Razorpay account you can reuse
- **A new Indian entity for OUTLY** — cleanest separation, slowest
- **OUTLY (Dubai)** — cannot use Razorpay India; would need a UAE gateway, which changes currency, settlement and the whole payment section

The same answer drives **WhatsApp Business verification**, which requires legal documents matching the business name you register.

**I cannot proceed on payments or WhatsApp verification without this.**

### 🔴 Q2 — Domain and DNS

- Which domain is launching — `outly.in`, `outly.ae`, something else?
- Is it registered, and do you control DNS?
- Is the site already live on it via Netlify?

Blocks SPF/DKIM/DMARC, which blocks reliable acknowledgement email, which is the backbone of the response promise.

### 🔴 Q3 — The WhatsApp number

- New number, or an existing business number?
- **Is it currently active on the consumer WhatsApp app or WhatsApp Business app?** If so it must be removed from there before Business API registration, and that is irreversible for its chat history
- Is it an Indian (+91) or UAE (+971) number? This affects per-message pricing and how customers perceive it — a +971 number reads as genuinely Dubai-based, which is a trust asset for this audience

### 🟠 Q4 — Meta Business Manager

- Is there an existing Business Manager for OUTLY, or would this use TripNavigate's / Holiday Chacha's?
- **Recommendation: a separate Pixel/dataset for OUTLY even if the Business Manager is shared**, so OUTLY's CAC is measurable independently of TripNavigate's. Mixing them makes the §11 CAC guardrail meaningless

### 🟠 Q5 — Ops team specifics

Needed to configure SLA, routing and alerting — all of which are data, not code:

- How many agents at launch, and their names, emails and WhatsApp numbers?
- **Actual shift hours and timezone(s)** — the UAE/India split in practice
- What is the out-of-hours window, and what should the auto-reply promise?
- Where should new-inquiry alerts land — a WhatsApp group, email, or both?

### 🟡 Q6 — GST and invoicing

- GST number for the contracting entity?
- Registered business name and address as they must appear on invoices?

Not blocking for inquiries; blocking before the first invoice, and needed for Razorpay KYC anyway.

### 🟡 Q7 — Existing accounts worth reusing

Do Holiday Chacha or TripNavigate already have: a Razorpay account · a WhatsApp Business API number · a Sentry or PostHog org · a Google Workspace for transactional email?

Reusing an existing verified Razorpay or Meta Business account could remove **weeks** from the critical path. Worth ten minutes to check.

---

## 4. Everything Chirag Must Provide Before Backend Development Starts

### Tier 1 — Blocks the first line of code

- [ ] **Q1 answered** — contracting legal entity, and whether it has an Indian bank account
- [ ] **Q2 answered** — domain confirmed, DNS access available
- [ ] **Neon account** created; dev + staging + production databases or branches provisioned
- [ ] `DATABASE_URL` and `DIRECT_URL` for each environment
- [ ] **Resend account** created and sending domain verified
- [ ] **SPF, DKIM, DMARC** records published and verified
- [ ] `RESEND_API_KEY`, `EMAIL_FROM_TRANSACTIONAL`, `EMAIL_OPS_ALERT_TO`
- [ ] **Sentry account** + project; `SENTRY_DSN`
- [ ] **Netlify** env var access confirmed for all three environments
- [ ] **Business WhatsApp number decided** (Q3) → `NEXT_PUBLIC_WHATSAPP_NUMBER`
- [ ] `AUTH_JWT_SECRET`, `AUTH_COOKIE_SECRET`, `TOTP_ENCRYPTION_KEY` generated *(`openssl rand -base64 48`)*
- [ ] `ADMIN_BOOTSTRAP_EMAIL` — the first admin login
- [ ] `NEXT_PUBLIC_SITE_URL`, `APP_ENV` per environment

### Tier 2 — Start today, needed at launch *(long lead time — this is the critical path)*

- [ ] **Meta Business Manager** created and **business verification submitted** ← start first
- [ ] **WhatsApp BSP selected** and account opened
- [ ] **WhatsApp Business Account** created, number registered
- [ ] **Two message templates submitted for approval**: inquiry acknowledgement, follow-up nudge
- [ ] BSP credentials once live: `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_API_BASE_URL`
- [ ] Self-generated `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_WEBHOOK_SECRET`
- [ ] **Razorpay account opened, KYC submitted** *(no API keys needed yet — dashboard access only)*
- [ ] **Meta Pixel + CAPI dataset** created (Q4) → `NEXT_PUBLIC_META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, `META_DATASET_ID`
- [ ] **Q5 answered** — agent list, shift hours, timezone, alert destinations
- [ ] `CRON_SECRET`, `NOTIFY_ALLOWLIST` generated
- [ ] Upstash Redis *(optional)* → `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- [ ] Uptime monitor configured

### Tier 3 — After launch

- [ ] PostHog project → `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
- [ ] GA4 property → `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `GA4_API_SECRET`
- [ ] Meta Marketing API token + ad account ID *(for CAC)*
- [ ] Razorpay API keys + webhook secret *(when automating payment links)*
- [ ] Sentry auth token + org/project *(CI source maps)*
- [ ] **Q6 answered** — GST number, registered name and address
- [ ] Written CA opinion on TCS and GST *(blocking before the first invoice, not before the first inquiry)*

### Explicitly not needed — do not create

- [ ] ~~Cloudflare R2 / S3~~
- [ ] ~~Upstash QStash~~
- [ ] ~~MSG91 / Twilio / any SMS provider~~
- [ ] ~~UAE payment gateway~~
- [ ] ~~Rathin API credentials~~
- [ ] ~~Typesense / Algolia~~
- [ ] ~~Clerk / Auth.js~~
- [ ] ~~Vercel~~

### Code fixes to bundle into the first backend pass

- [ ] Replace the hard-coded `WHATSAPP_NUMBER = "919000000000"` in `src/lib/whatsapp.ts` with the env var, plus a startup assertion so a missing value fails loudly rather than shipping a dead CTA
- [ ] Block `/design-system` in production *(§01 R3 — still outstanding)*
- [ ] Remove the credits/loyalty UI *(§01.10 — showing a balance you cannot honour is a trust cost)*

---

## 5. Suggested order of operations

Because the slow items do not block engineering, and engineering does not block them:

**Today:** Meta Business verification · WhatsApp BSP selection and account · Razorpay KYC · answer Q1–Q3
**This week:** Neon · Resend + DNS · Sentry · secrets generated · Netlify env vars → **backend development can begin**
**While building:** WhatsApp templates submitted · Meta Pixel/CAPI created · Q5 answered
**Before launch:** BSP live and templates approved · uptime monitor · allowlist verified on staging

The only genuinely serial dependency is **Meta verification → WhatsApp Business Account → template approval → Phase B launch.** Everything else runs in parallel. Start that chain today and it will not be what holds you up.

---

**Awaiting your response on Q1–Q7 before any implementation begins.**
