# Phase 3 — Technology Stack

---

## 1. The decision criteria, in priority order

Ordinary stack evaluations rank on performance, scalability and ecosystem. Yours should not, because your constraints are unusual and specific:

1. **The team is Claude + Claude Code.** Correctness of generated code dominates every other consideration. Technologies with large, current, *consistent* representation in training data get written correctly; clever or fast-moving ones get written plausibly and wrongly.
2. **Volume is low; correctness stakes are high.** 1,700 bookings/month at month 12 is ~2 orders/hour. Nothing here is a throughput problem. Everything here is a money problem.
3. **There is no ops person.** Anything requiring 2am intervention is a liability. Managed > self-hosted, always.
4. **Working capital is the binding constraint** (business model §3.2), not engineering cost — but infrastructure spend still competes directly with supplier float. Target < ₹20,000/month at launch.
5. **The frontend already exists** in Next.js 15 with a clean seam. Anything that requires rewriting it loses by default.

A sixth, implicit: **the architecture must be legible to you.** You will be reviewing AI-generated code you did not write. A design you can hold in your head is a design where you will notice a bug.

---

## 2. Recommended stack

| Layer | Choice | One-line reason |
|---|---|---|
| Backend framework | **Next.js 15 Route Handlers**, business logic in `src/server/**` | One repo, one deploy, one language; logic kept framework-agnostic for later extraction |
| Language | TypeScript (strict) | Shares `src/lib/types.ts` with the frontend — one domain model, compiler-enforced |
| Database | **PostgreSQL** (Neon) | Transactions, row locks, `NUMERIC`, JSONB, full-text search, partial indexes. Everything the money paths need |
| ORM | **Prisma** | Best-in-class migrations and generated types; the ORM an LLM writes correctly most often |
| Cache | **Upstash Redis** | HTTP/REST — works from serverless with no connection pool to exhaust |
| Async / queue | **Upstash QStash** | HTTP push-based; retries, DLQ, delays, schedules — no worker process to host or babysit |
| Storage | **Cloudflare R2** | Zero egress fees; vouchers and tickets are read repeatedly |
| Search | **Postgres full-text** (`tsvector` + GIN) | 26–300 SKUs. Typesense/Algolia would be a service to run for a dataset that fits in RAM |
| Auth | **Custom phone OTP** + `jose` JWT | Phone-OTP-primary for India is not what Clerk/Auth.js optimise for; the flow is ~200 lines |
| Notifications | WhatsApp BSP + Resend (email) + MSG91 (SMS OTP) | |
| Payments | **Razorpay** (INR); UAE gateway at V1 | |
| Analytics | **PostHog Cloud** + GA4 + Meta CAPI, all fed by our own `/api/events` | |
| Errors | **Sentry** | |
| Hosting | **Vercel** (Netlify also fine) | Marginally better Next.js fit; Netlify's 60s/30s/15min limits are adequate — see §00 D3 |
| Cron | Vercel Cron + QStash schedules | |

---

## 3. Framework — the central decision

### 3.1 Options evaluated

| | NestJS (separate service) | **Next.js Route Handlers** | Express | Fastify |
|---|---|---|---|---|
| Structure imposed | Very high (DI, modules, guards) | **None — must impose your own** | None | Low |
| Repos / deploys | 2 | **1** | 2 | 2 |
| Long-running workers | Native | **No — needs QStash or a separate service** | Native | Native |
| Type sharing with frontend | Package or duplication | **Direct import** | Duplication | Duplication |
| LLM code quality | Good (but verbose, and DI patterns drift) | **Excellent — enormous current corpus** | Excellent | Good |
| Cold start | n/a (always on) | ~200–400ms | n/a | n/a |
| Boilerplate per endpoint | ~40 lines (module, controller, service, DTO) | **~10 lines** | ~15 | ~15 |
| Right at 2 orders/hour | Overkill | **Yes** | Yes | Yes |
| Right at 500 orders/hour | Yes | Yes, with care | Yes | Yes |

### 3.2 Recommendation: Next.js Route Handlers, with a hard structural rule

**Choose Next.js.** Not because it is the best backend framework — NestJS is a better backend framework — but because with your team, the cost that dominates is **the number of separate things that must be kept consistent**, and NestJS doubles it: two repos, two deploys, two dependency trees, a shared-types package or duplicated interfaces, CORS, cross-service auth, and two places to look when something breaks.

The honest case **against** this choice, stated plainly:

- Serverless functions are not a natural home for long-running or scheduled work. QStash solves it, but it is an HTTP round-trip where NestJS would have an in-process worker.
- Next.js gives you no structure. NestJS's opinionatedness is genuinely valuable when the author is an LLM that will otherwise put business logic in a route handler.
- Prisma in serverless needs connection pooling discipline (Neon's pooled connection string, or Prisma Accelerate).

The first is acceptable at your volumes. The third is a one-line config. **The second is real, and the mitigation is the structural rule below — which is not optional.**

### 3.3 The structural rule: thin transport, fat services

```
src/
  app/api/**/route.ts        ← TRANSPORT ONLY. ~10 lines. Parse, authorise, call, respond.
                                No business logic. No Prisma queries. No supplier calls.
  server/
    domain/                  ← pure functions, no I/O. Fully unit-testable.
      pricing.ts             computeQuote, applyRules, marginFloor
      cancellation.ts        refund computation
      availability.ts        normalisation, next-dates
      ranking.ts             search scoring (ported from lib/search.ts)
    services/                ← orchestration. I/O allowed. One export per use case.
      order.service.ts       createOrder, confirmOrder, cancelOrder
      quote.service.ts
      payment.service.ts
      fulfilment.service.ts
      notification.service.ts
      whatsapp.service.ts
    suppliers/               ← the port and its adapters (§02)
      port.ts
      rathin/
      manual/
    repositories/            ← the only place Prisma is imported
    jobs/                    ← QStash handlers, one per job type
    lib/                     ← db client, redis, logger, idempotency, money
```

**Enforcement, because a convention nobody enforces is a convention nobody follows:**
- ESLint `no-restricted-imports`: `@prisma/client` may only be imported from `server/repositories/**` and `server/lib/db.ts`.
- ESLint: `app/api/**` may not import `server/repositories/**` directly — only `server/services/**`.
- `server/domain/**` may import nothing outside `server/domain` and `lib/types.ts`.

Those three rules are what makes AI-generated code stay architecturally coherent over six months. They also make the whole `server/` tree liftable into a standalone Fastify or NestJS service later by writing new transport — which is the escape hatch that makes this choice safe.

### 3.4 The migration trigger, stated in advance

Move `server/` to a dedicated always-on service (Railway/Render, Fastify) when **any two** of these become true:

- Sustained > 200 orders/day
- A job legitimately needs > 5 minutes of wall clock
- QStash costs exceed ~$50/month
- You hire a second developer

Not before. Premature extraction costs you the thing you have least of: attention.

---

## 4. Database

### 4.1 PostgreSQL vs MySQL

**PostgreSQL, decisively.** Not close, for this domain:

| Need | Postgres | MySQL |
|---|---|---|
| `SELECT ... FOR UPDATE` on capacity ledger | ✓ | ✓ |
| Partial unique indexes (e.g. one active booking per idem key) | ✓ | ✗ |
| `EXCLUDE` constraints (time-overlap detection for the trip builder) | ✓ | ✗ |
| JSONB with GIN indexes (supplier payloads, webhook bodies) | ✓ | Weaker |
| Full-text search good enough to skip a search service | ✓ | Weaker |
| `NUMERIC` exactness for money | ✓ | ✓ |
| Serverless-native managed options (Neon) | ✓ | Fewer |

### 4.2 Provider: Neon

Neon over Supabase/RDS: branching (a database branch per preview deploy is genuinely useful when an LLM writes migrations), scale-to-zero on non-prod, a real pooled connection string for serverless, and point-in-time restore.

Supabase is a reasonable alternative if you later want its auth and storage — but you do not, because phone-OTP is custom and storage is R2.

### 4.3 ORM: Prisma over Drizzle

Drizzle is lighter, faster, and closer to SQL. **Prisma still wins here** for two reasons specific to your team:

1. **Migrations.** `prisma migrate` produces reviewable SQL files with a deterministic workflow. Drizzle's migration story is less prescriptive, and "less prescriptive" is exactly what you do not want from a code generator touching a schema that holds money.
2. **Training representation.** Prisma has years of consistent, stable API surface in training data. Drizzle's API has moved more. An LLM writes correct Prisma more reliably than correct Drizzle, and you will not always catch the difference in review.

Cost: Prisma's query engine adds cold-start weight in serverless. Mitigate with Neon's pooled connection and, if it ever matters, Prisma Accelerate. **[ASSUMPTION]** — measure it rather than pre-optimise.

**Non-negotiable money rule:** all monetary columns are `BigInt` **minor units** (paise, fils). No `Float`, no `Decimal`-as-string round-tripping through JS. `Money` in the API layer stays `{ inr: number, aed: number }` in *major* units for display only, converted at the boundary in one helper.

---

## 5. Cache, queue and the serverless constraint

### 5.1 Redis: Upstash

Standard Redis holds TCP connections. Serverless functions create and destroy processes constantly, which exhausts connection limits. **Upstash's REST API sidesteps this entirely** — every call is an HTTP request with no pool to manage. That property alone decides it.

Uses: availability L1 cache, rate limiting (`@upstash/ratelimit` is a well-worn primitive), OTP challenge storage with native TTL, idempotency-key locks, price-lock counters, session denylist.

### 5.2 Queue: QStash, not BullMQ

**This is the decision people get wrong, so the reasoning matters.**

BullMQ is excellent and is the default recommendation in most Node architecture documents. It also **requires a long-running worker process**, which you do not have and should not add. Running BullMQ workers means a second always-on service, its own deploy, its own monitoring, and its own failure mode where the worker is dead and the queue silently fills.

QStash inverts it: you publish a message, QStash makes an **HTTP POST to your own route handler** at the right time, with retries, exponential backoff, a dead-letter queue, delays, and cron schedules. Your "workers" are ordinary API routes. Nothing to host, nothing to keep alive, and every job is independently testable with a `curl`.

| | BullMQ | **QStash** | RabbitMQ |
|---|---|---|---|
| Needs a worker process | **Yes** | **No** | Yes |
| Retries + backoff + DLQ | ✓ | ✓ | ✓ |
| Delayed + scheduled jobs | ✓ | ✓ | Plugin |
| Ops burden | Medium | **~Zero** | High |
| Throughput ceiling | Very high | ~500/s **[VERIFY current limits]** | Very high |
| Right for 2 orders/hour | Overkill | **Yes** | Absurd |

Jobs: `FULFIL_ORDER`, `GENERATE_VOUCHER`, `SEND_NOTIFICATION`, `SYNC_CATALOGUE`, `WARM_AVAILABILITY`, `RECONCILE_SUPPLIER_BOOKINGS`, `RECONCILE_PAYMENTS`, `SEND_META_CAPI`, `UPLOAD_OFFLINE_CONVERSIONS`, `ABANDONED_CART`, `PRE_TRIP_SEQUENCE`, `REVIEW_REQUEST`, `COMPUTE_SUPPLIER_SCORES`.

**Every job handler must be idempotent** and authenticate the QStash signature. Both are enforceable in a shared wrapper — write it once.

---

## 6. Remaining choices, briefly

### Search — Postgres, not Typesense or Algolia
26 SKUs now, maybe 300 later. `tsvector` + GIN with weighted lexemes plus the existing business-weighted ranking (`RANKING_WEIGHTS`, ported to `server/domain/ranking.ts`) is comfortably enough. Typesense means a service to run; Algolia means per-search pricing and a sync pipeline. **Revisit only above ~5,000 SKUs or when typo-tolerance measurably costs conversions.** Postgres `pg_trgm` handles fuzzy matching in the meantime.

### Auth — custom OTP, not Clerk or Auth.js
- **Clerk**: excellent, but priced per MAU and built around email/social-first. Phone-OTP-primary for +91 with automatic guest-booking linking (`AC-ACC-02`) is not its happy path, and you would still write the linking logic.
- **Auth.js**: session management is solid; the OTP flow is still yours to build. You would take a dependency and write the hard part anyway.
- **Custom**: ~200 lines. Request OTP (rate-limited by phone *and* IP), store a hashed challenge in Redis with a 5-minute TTL and an attempt counter, verify, issue a short-lived access JWT plus a rotating refresh token in an httpOnly cookie. On verify, link any `orders` matching the phone or email.

Use `jose` for JWTs and MSG91/Twilio for SMS delivery **[VERIFY current Indian SMS DLT compliance requirements — template registration is mandatory and takes time]**.

**Admin and agent auth is separate and stricter:** email + password + mandatory TOTP MFA (`AC-SEC-02`), short sessions, no shared accounts.

### Storage — Cloudflare R2
Zero egress. Vouchers are fetched repeatedly (customer, agent, gate scan, resend), so egress is the cost that matters. S3-compatible, so the SDK is familiar. Signed URLs for private objects; public bucket + CDN for product media.

### Payments — Razorpay first
Razorpay for India: UPI, cards, netbanking, wallets, EMI, payment links (needed for the agent console), and a mature refunds API. **Published standard pricing is 2% + GST across modes, with custom pricing available above ₹5,00,000/month** — your business model assumes 2.2%, so the standard rate (~2.36% effective) is worse than modelled. Negotiate before launch (Blocker B3).

Cashfree is a genuine alternative and often quotes lower; get both quotes. Stripe is not the India answer (UPI and EMI support are weaker) but is a candidate for the **UAE/AED** leg at V1 alongside Telr and Network International — that choice depends on the OUTLY entity (Blocker B5).

**Design so this is swappable:** a `PaymentGateway` port mirroring the supplier port, with `createOrder`, `createPaymentLink`, `verifyWebhook`, `refund`, `fetchPayment`. You *will* add a second gateway for AED.

### Analytics — PostHog + GA4 + Meta CAPI, all downstream of your own collector
The critical architectural point (PRD §8): **your own `/api/events` endpoint is the source of truth**, and everything else is a downstream forwarder. Client-only tracking under-reports 20–40% and makes CAC — the number the whole business model hinges on — unmeasurable.

PostHog Cloud for product analytics, funnels and cohorts (generous free tier, EU/US regions). GA4 for the marketing team's expectations and Google Ads. Meta CAPI for the ad optimisation that actually matters. Details in §11.

### Errors — Sentry
Free tier is sufficient at launch. Wire it to route handlers, job handlers, and the client. Alert on: any `payment.*` error, any supplier circuit-breaker open, any DLQ arrival.

---

## 7. Cost estimate

**[ASSUMPTION]** — list prices as of research date, September 2026. Verify each before committing; SaaS pricing moves.

### At launch (~100 bookings/month, ~20k sessions/month)

| Service | Plan | Monthly (USD) | Monthly (INR ≈ ₹88/$) |
|---|---|---|---|
| Vercel | Pro (1 seat) | $20 | ₹1,760 |
| Neon | Launch | $19 | ₹1,672 |
| Upstash Redis | Pay-as-you-go | ~$3 | ₹264 |
| Upstash QStash | Free tier likely sufficient | $0 | ₹0 |
| Cloudflare R2 | < 10 GB | ~$1 | ₹88 |
| Sentry | Developer | $0 | ₹0 |
| PostHog | Free tier (1M events) | $0 | ₹0 |
| Resend (email) | Free → Pro | $0–20 | ₹0–1,760 |
| **Infrastructure subtotal** | | **~$45** | **~₹4,000** |
| WhatsApp BSP platform fee | Wati/Interakt/AiSensy entry tier | ~$25–50 | ₹2,200–4,400 **[VERIFY]** |
| WhatsApp messages | per-message, see §08 | variable | ₹1,500–4,000 **[ASSUMPTION]** |
| SMS OTP (MSG91) | ~₹0.15–0.25/SMS | | ₹500–1,500 |
| Domain, SSL | | | ₹200 |
| **Total** | | | **≈ ₹8,000–14,000/month** |

Against your Tier-1 model's "Tools & fixed: −₹5,000" this runs over — mostly on WhatsApp, which is a revenue channel, not a tool. Worth restating in the model as a variable cost per order.

### At ₹1cr/month GMV (~1,700 bookings/month, ~200k sessions)

| Service | Monthly (INR) |
|---|---|
| Vercel Pro (+ overage) | ₹4,000–9,000 |
| Neon Scale | ₹6,000 |
| Upstash Redis + QStash | ₹2,500 |
| R2 | ₹500 |
| Sentry Team | ₹2,500 |
| PostHog (paid tier) | ₹4,000–9,000 |
| Resend Pro | ₹1,800 |
| WhatsApp (BSP + messages) | ₹25,000–60,000 **[ASSUMPTION — the dominant line]** |
| SMS | ₹4,000 |
| **Total** | **≈ ₹50,000–95,000/month** |

At ₹1cr GMV that is **0.5–0.95% of GMV** — comfortably inside the model. **WhatsApp messaging is the only line that matters at scale**, which is why §08 treats free-window optimisation as an architectural concern rather than a nicety.

---

## 8. Scalability

| Dimension | Launch design | Ceiling before change | How you change it |
|---|---|---|---|
| Concurrent users | ~200 | ~5,000 | Vercel autoscales; add Redis-cached catalogue responses |
| Requests/sec | 50 | ~500 | ISR + edge caching on catalogue routes |
| Orders/hour | 5 | ~200 | Postgres row locks are fine; beyond this, partition `analytics_events` |
| DB connections | Neon pooled | ~1,000 | Increase pool / Prisma Accelerate |
| Background jobs | ~500/day | ~50k/day | QStash scales; beyond it, extract a worker service |
| Catalogue size | 300 SKUs | ~5,000 | Postgres FTS → Typesense |
| Analytics events | 500k/month | ~10M/month | Partition by month; ship to a warehouse |

**PRD §15 asks for 5,000 concurrent at MVP.** As argued in §00, that is not a real requirement at 100 bookings/month, and designing for it would cost correctness attention you cannot spare. This stack reaches it by changing plan tiers, not architecture — which is the right way to defer it.

---

## 9. Operational complexity

| Task | Burden | Notes |
|---|---|---|
| Deploy | **Very low** | `git push` |
| Migrations | Low | `prisma migrate deploy` in CI, gated on a review of the generated SQL |
| Secrets | Low | Vercel env vars per environment; never in the repo |
| Monitoring | Low | Sentry + Vercel Analytics + a `/api/health` check |
| Backups | Low | Neon PITR; **quarterly restore drill is mandatory and is the part people skip** |
| Scaling | Very low | Automatic |
| On-call | Low | Alerts route to WhatsApp/Slack; the runbook in §14 covers the six realistic incidents |
| **Total** | **Low enough for one person** | Which is the whole point |

---

## 10. What I explicitly rejected, and why

| Rejected | Why |
|---|---|
| NestJS as a separate service | Doubles the number of things to keep consistent, for structure you can get from lint rules |
| Microservices | You have ~2 orders/hour and no ops team. This would be self-harm |
| BullMQ / RabbitMQ | Both need a worker process you should not be hosting |
| Drizzle | Better library; worse migration discipline and thinner training corpus for an AI-authored codebase |
| Typesense / Algolia | A service to run for a dataset that fits in memory |
| Clerk / Auth.js | You would write the phone-OTP and guest-linking logic anyway, plus take a dependency |
| MongoDB | Money and inventory want transactions and constraints |
| Self-hosted anything | No ops person |
| GraphQL | Single known consumer; REST is less to get wrong |
| ~~Netlify~~ — **not rejected** | I initially claimed its timeout ceiling was too tight. It is 60s synchronous, which is adequate. Staying is legitimate (§00 D3) |
| A separate admin SPA | Same Next.js app under `/admin` with server-side RBAC. One deploy, one session model, one place bugs hide |
