# Phase 4 — System Architecture

---

## 1. Architectural style

**A modular monolith with an asynchronous edge.**

One deployable Next.js application containing the storefront, the API, the admin panel and the agent console, backed by one Postgres database, with all slow or unreliable work pushed onto a queue that calls back into the same application over HTTP.

The word doing the work is **modular**. The system is decomposed into modules with enforced import boundaries (§03.3); it is simply not *distributed*. You get the design benefits of separation — clear ownership, testability, a migration path — without the operational cost of a network between every two functions.

---

## 2. System diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                  CLIENTS                                     │
│   Mobile web (PWA, 80%+)  ·  Desktop web  ·  Admin  ·  Agent console         │
│   WhatsApp (customer)     ·  Ops on phone ·  Supplier (WhatsApp/email)       │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼──────────────────────────────────────────────────────────────┐
│                          EDGE  (Vercel)                                      │
│   CDN · geo header (INR/AED) · middleware: auth, rate limit, bot, flags      │
│   ISR for catalogue pages · /design-system blocked in prod                   │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────────┐
│              NEXT.JS APPLICATION  (single deployable)                        │
│                                                                              │
│  ┌── RSC / pages ──────────────┐   ┌── app/api/**  (transport only) ──────┐ │
│  │ storefront · admin · agent  │   │ catalog · availability · quotes ·    │ │
│  │ console (server components) │   │ carts · orders · payments · bookings │ │
│  └─────────────┬───────────────┘   │ vouchers · reviews · auth · events   │ │
│                │                   │ admin · agent · webhooks · jobs      │ │
│                │                   └──────────────┬───────────────────────┘ │
│                └────────────┬─────────────────────┘                          │
│  ┌──────────────────────────▼────────────────────────────────────────────┐  │
│  │                    server/services  (orchestration)                    │  │
│  │  quote · order · payment · fulfilment · voucher · notification ·      │  │
│  │  whatsapp · review · refund · lead · analytics · admin                │  │
│  └────┬──────────────┬───────────────┬─────────────────┬─────────────────┘  │
│       │              │               │                 │                    │
│  ┌────▼────────┐ ┌───▼──────────┐ ┌──▼──────────┐ ┌───▼──────────────────┐ │
│  │server/domain│ │server/       │ │server/      │ │ server/repositories  │ │
│  │ pure funcs  │ │ suppliers    │ │ payments    │ │ (only Prisma import) │ │
│  │ pricing     │ │ SupplierPort │ │ GatewayPort │ │                      │ │
│  │ cancellation│ │ ├ Rathin     │ │ ├ Razorpay  │ │                      │ │
│  │ ranking     │ │ ├ Manual     │ │ └ UAE (V1)  │ │                      │ │
│  │ availability│ │ └ Portal(V1) │ │             │ │                      │ │
│  └─────────────┘ └───┬──────────┘ └──┬──────────┘ └───┬──────────────────┘ │
└──────────────────────┼───────────────┼────────────────┼────────────────────┘
                       │               │                │
        ┌──────────────┼───────────────┼────────────────┼──────────────┐
        │              │               │                │              │
┌───────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐ ┌───────▼──────┐ ┌────▼──────┐
│ PostgreSQL   │ │  Upstash   │ │  Upstash    │ │ Cloudflare   │ │ External  │
│ (Neon)       │ │  Redis     │ │  QStash     │ │ R2           │ │ APIs      │
│              │ │            │ │             │ │              │ │           │
│ source of    │ │ availability│ │ jobs, cron, │ │ vouchers,    │ │ Rathin    │
│ truth        │ │ rate limits │ │ retries,DLQ │ │ tickets,     │ │ Razorpay  │
│ 40+ tables   │ │ OTP, locks  │ │             │ │ media        │ │ WA BSP    │
└──────────────┘ └─────────────┘ └──────┬──────┘ └──────────────┘ │ Resend    │
                                        │                          │ Meta CAPI │
                                        │ HTTP POST (signed)       │ PostHog   │
                                        └──────────► app/api/jobs/*│ Sentry    │
                                                                   └───────────┘
```

**The one loop worth noticing:** QStash does not run your code — it calls it. A background job is an authenticated HTTP request from QStash to `app/api/jobs/<name>`. There is no worker fleet, and every job is reproducible with a `curl`.

---

## 3. The modules

### 3.1 API layer (`app/api/**`)

Transport only. A handler does four things and nothing else:

```
1. parse + validate input           (Zod schema)
2. authenticate + authorise         (shared middleware helper)
3. call exactly one service method
4. map the result to an HTTP response  (shared error mapper)
```

Cross-cutting concerns live in wrappers applied to every handler, so they cannot be forgotten:

| Wrapper | Does |
|---|---|
| `withValidation(schema)` | Zod parse; 422 with field errors on failure |
| `withAuth(role)` | Session/JWT resolution; 401/403 |
| `withRateLimit(key, limit)` | Upstash rate limit by IP, phone, or user |
| `withIdempotency()` | Required on all money-mutating POSTs (§06) |
| `withAudit(action)` | Writes `audit_logs` for state-changing admin/agent actions (`AC-ADM-01`) |
| `withErrorMapping()` | Maps domain errors to the frontend's `MockScenario` taxonomy (§02.5.1) |
| `withQStashSignature()` | Job routes only — rejects anything not from QStash |

### 3.2 Service layer (`server/services/**`)

One module per bounded capability. Services orchestrate; they own transactions.

| Service | Responsibility | Never does |
|---|---|---|
| `catalog` | Product read models, search, ranking, ISR revalidation | Write orders |
| `availability` | Cache read-through, TTL policy, capacity ledger reads | Compute price |
| `quote` | Server-signed quotes, price rules, margin floor, expiry | Reserve inventory |
| `cart` | Server cart, conflict detection, upsells, coupon application | Charge anything |
| `order` | Order creation, state machine, idempotency, snapshots | Talk to suppliers |
| `payment` | Gateway orders, links, webhook ingestion, refunds, reconciliation | Confirm bookings |
| `fulfilment` | Supplier booking, retries, rejection saga, capacity commit | Take payment |
| `voucher` | PDF generation, ticket storage in R2, resend | Send messages |
| `notification` | Channel-agnostic dispatch, consent checks, templating | Decide *what* happened |
| `whatsapp` | BSP transport, conversation state, CSW window tracking, agent inbox | Own the order |
| `review`, `refund`, `lead`, `referral`, `analytics`, `admin` | as named | |

**The vertical rule that keeps money correct:** `payment` never confirms a booking, and `fulfilment` never touches money. They communicate only through order state transitions and queued jobs. This is what makes "payment succeeded but booking failed" a *recoverable* state rather than a corrupted one.

### 3.3 Domain layer (`server/domain/**`)

Pure functions. No database, no network, no clock (time is injected). Every rule that could be wrong in a way that costs money lives here, because pure functions are the only code you can exhaustively test:

- `pricing.computeQuote(product, pax, variant, addons, rules, date)` → breakdown
- `pricing.checkMarginFloor(retail, netRate, tier, floors)` → ok | violation
- `cancellation.computeRefund(booking, now, policy)` → refund, fee, reason
- `availability.normalise(supplierResponse)` → canonical shape
- `ranking.score(product, filters, weights)` → number
- `search.relax(filters)` → relaxed set + human explanation (ported verbatim from `src/lib/search.ts`)
- `money.*` — integer minor-unit arithmetic, one rounding point

### 3.4 Supplier layer

Port + adapters, fully specified in §02. Only `fulfilment` and `availability` may call it.

### 3.5 Data layer

`server/repositories/**` is the only place `@prisma/client` is imported, enforced by lint. Repositories return domain shapes, never Prisma models, so a schema change does not leak upward.

---

## 4. How services communicate

Three mechanisms. Choosing correctly between them is most of the architecture.

### 4.1 Direct function call — synchronous, in-process

Used when the caller needs the result to answer the request, and the work is fast and reliable.
`quote` → `availability` → `catalog`; `order` → `quote`.

### 4.2 Queue (QStash) — asynchronous, at-least-once

Used when the work is slow, unreliable, or must survive a crash. **Everything after payment success is a queued job.**

| Job | Trigger | Retries | On exhaustion |
|---|---|---|---|
| `FULFIL_ORDER` | payment webhook → paid | 3 (backoff) | Rejection saga; ops P1 |
| `GENERATE_VOUCHER` | order confirmed | 5 | Ops alert; manual issue |
| `SEND_NOTIFICATION` | many | 5 | DLQ; fall back to another channel |
| `RECONCILE_SUPPLIER_BOOKINGS` | cron 15 min | — | Ops report |
| `RECONCILE_PAYMENTS` | cron hourly | — | Finance report |
| `SYNC_CATALOGUE` | cron nightly | 3 | Ops alert |
| `WARM_AVAILABILITY` | cron 15 min / 6h | 1 | Silent; cache just stays cold |
| `SEND_META_CAPI` | booking confirmed | 5 | DLQ, replayable |
| `UPLOAD_OFFLINE_CONVERSIONS` | cron daily | 3 | Ops alert |
| `ABANDONED_CART` | cart idle 30 min | 2 | Drop |
| `PRE_TRIP_SEQUENCE` | scheduled at T-2, T-1, T-0 | 3 | Ops alert if within 24h of travel |
| `REVIEW_REQUEST` | T+2 days after activity | 2 | Drop |
| `COMPUTE_SUPPLIER_SCORES` | cron nightly | 1 | Silent |

**At-least-once means every handler must be idempotent.** The shared job wrapper enforces this with a `job_executions` table keyed on `(job_type, dedupe_key)`.

### 4.3 Webhooks — inbound, untrusted until verified

| Source | Endpoint | Verification | Then |
|---|---|---|---|
| Razorpay | `/api/webhooks/razorpay` | HMAC signature | Persist raw event → transition order → enqueue fulfilment |
| UAE gateway (V1) | `/api/webhooks/<gw>` | provider-specific | same |
| WhatsApp BSP | `/api/webhooks/whatsapp` | signature / shared secret | Persist message → update conversation + CSW window → notify agent |
| QStash | `/api/jobs/*` | QStash signature | Execute job |

**Universal rule:** persist the raw payload to an immutable table **first**, respond `200` **fast**, and do the real work in a job. A webhook endpoint that does slow work will time out and the provider will retry, and you will process the same event three times. Every webhook is deduplicated on the provider's event ID with a unique index.

---

## 5. Request paths, end to end

### 5.1 Catalogue page (the SEO path — must be fast and cacheable)

```
Request → Edge CDN
  ├─ HIT  → served from cache                                    ~50ms
  └─ MISS → RSC render → catalogRepo (Postgres) → ISR cache (60s)
            → HTML with structured data, no client JS for content
```
Availability and price are *not* rendered server-side into the page — they are fetched client-side after paint, so the cached HTML stays valid and LCP is unaffected. This is why `AC-ADP-01` allows a skeleton.

### 5.2 Checkout (the money path — must be correct)

```
POST /api/orders  { cartId, quoteIds[], traveller, Idempotency-Key }
  1. withIdempotency  → replay the stored response if this key was seen
  2. quote.revalidate → not expired? price unchanged? else 409 PRICE_CHANGED
  3. availability.verifyHard(TTL=0) → else 409 SOLD_OUT + next dates
  4. BEGIN TX
       lock capacity rows (manual SKUs) FOR UPDATE
       insert order + order_items + full price/terms snapshot
       insert tax_lines (once B2 is answered)
       reserve coupon redemption atomically
     COMMIT
  5. payment.createGatewayOrder(order)
  6. → { orderRef, gatewayOrderId, amount }   ← amount comes from the SERVER
```

The client never sends a price. It sends quote IDs. This is the single most important sentence in the architecture.

### 5.3 Post-payment (the asynchronous path — must be recoverable)

```
Razorpay → POST /api/webhooks/razorpay
  verify HMAC → INSERT payment_events (raw, unique on event id) → 200 immediately
  → enqueue PROCESS_PAYMENT_EVENT

PROCESS_PAYMENT_EVENT
  → order.transition(paid)  [idempotent, guarded by state machine]
  → enqueue FULFIL_ORDER

FULFIL_ORDER
  → for each item: SupplierPort.createBooking(idemKey = order+item)
  → success → store supplier ref, download ticket → R2
  → all items ok → order.transition(confirmed) → enqueue GENERATE_VOUCHER
  → any failure → order.transition(supplier_pending) or rejection saga (§06.6)

GENERATE_VOUCHER
  → render PDF → R2 → enqueue SEND_NOTIFICATION × {whatsapp, email}
  → schedule PRE_TRIP_SEQUENCE at T-2, T-1, T-0
  → schedule REVIEW_REQUEST at T+2d
```

---

## 6. Cross-cutting layers

### 6.1 Admin layer
Same app, `/admin/**`, RBAC enforced **server-side in every service call**, not in the UI (`AC-ADM-02`). Server Components read directly through repositories; every mutation goes through the same services the storefront uses, with an actor identity attached. Every state change writes `audit_logs` with before/after (`AC-ADM-01`). Full spec §10.

### 6.2 Agent console layer
Same app, `/admin/console`. The critical constraint from PRD §0: **an agent-created order calls `order.createOrder()` — the same function the storefront calls** — with `rail = 'assisted'` and an `actor`. No parallel code path. Overrides (manual price, forced availability) are explicit, permission-gated, audited operations, not bypasses. Full spec §09.

### 6.3 Notification layer
Channel-agnostic. A service says *what happened*; the notification layer decides *how to tell whom*.

```
notification.dispatch({
  event: 'BOOKING_CONFIRMED',
  recipient: { userId | phone | email },
  channels: ['whatsapp', 'email'],
  payload: { orderRef, voucherUrl, ... }
})
  → consent check per channel (opt-out honoured within 60s, AC-WA-03)
  → template resolution + variable substitution
  → per-channel adapter (WhatsApp BSP / Resend / MSG91)
  → persist notifications row: status, provider id, cost, delivered_at, read_at
  → on WhatsApp undelivered at T+10min → auto-resend (PRD §5.7)
```
Costs are recorded per message because WhatsApp is per-message priced and will be your largest variable infrastructure cost (§08).

### 6.4 CRM layer
MVP is not a CRM product; it is three things on the customer record: **segment** (`fit` / `expat` / `agent`, auto-set by geo and booking pattern, manually overridable — `AC-CRM-01`), **LTV** (computed nightly), and **consent state**. Expat share is a board-level KPI per the business model, so segment must be a first-class column, not a tag in a text field. Defer any external CRM to V1+ and evaluate then.

### 6.5 Analytics layer
`/api/events` is the collector and the source of truth. It enriches (server time, session, user, geo, attribution), persists to `analytics_events`, and fans out asynchronously to PostHog, GA4 Measurement Protocol and Meta CAPI. Money events are emitted **by services on state transition**, never trusted from the client. Full spec §11.

---

## 7. Environments and data flow boundaries

| | Development | Staging | Production |
|---|---|---|---|
| Next.js | local | Vercel preview | Vercel prod |
| Postgres | Neon branch | Neon branch (anonymised prod copy) | Neon prod |
| Redis | Upstash dev db | Upstash staging db | Upstash prod db |
| Rathin | **mock adapter** | sandbox if it exists, else mock | live |
| Razorpay | test keys | test keys | live keys |
| WhatsApp | log-only adapter | BSP sandbox number | production number |
| Emails | Resend test / catch-all | catch-all inbox | live |

**Hard rule:** no non-production environment may hold real customer PII, real payment credentials, or send a real message to a real customer. The staging database is seeded from an anonymised dump. This is not merely hygiene — an accidental WhatsApp blast from staging is both a trust incident and a DPDP problem.

**The mock adapters are not throwaway.** `RathinMockAdapter` and `WhatsAppLogAdapter` implement the same ports and should reproduce the existing `MockScenario` behaviours. That gives you deterministic end-to-end tests of the booking engine without touching a supplier — which, given Rathin has no confirmed sandbox, may be the only way you can test at all.

---

## 8. Why this shape, in one paragraph

The system has exactly one hard problem: **taking money for inventory you do not control, and making every failure recoverable.** Every architectural choice here serves that. One database so state is transactional and consistent. One deployment so there is one place to look. Services that own transactions and domain functions that own rules, so the rules are testable. Everything after payment on a queue, so a supplier's bad day is a delayed voucher and not a lost order. Payment and fulfilment strictly separated, so the two never corrupt each other. And enforced import boundaries, so that when this eventually needs to become two services, it is a transport change rather than a rewrite.
