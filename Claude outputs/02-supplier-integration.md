# Phases 2 & 6 — Supplier Integration and Inventory Architecture

---

## 1. What Rathin actually is

### 1.1 The identity correction

The feasibility report (§7.2) stated: *"'Rathin Tourism API' is almost certainly Rayna Tours / Rayna Tourism LLC."* **The evidence says otherwise.**

Rathin Tourism is a distinct Dubai company — a travel agency and tour operator at Al Suq St / Naser Ahmed Building, Kuwait Street, Dubai. Its B2B system, the "Rathin Portal," was built by Ruzinn Technology and launched **1 December 2022**. Ruzinn describes it as *"a comprehensive B2B platform that revolutionizes the ticketing experience for attractions in the UAE,"* which *"connects to the APIs of various parks and attractions"* — theme parks and water parks — providing real-time inventory, pricing and availability.

That is consistent with your flow document, which is entirely park-shaped:

```
access token → list of available parks → ticket types for a park
→ timeslots for (park, ticket type) → price → create booking → booking + ticket info
```

There is no vocabulary here for a tour: no pickup point, no transfer, no meal plan, no itinerary, no guide language, no shared-vs-private, no pax-type meal selection. Those are the fields your product needs and your differentiation lives in.

**Action:** confirm with Rathin in writing (a) the legal contracting entity, (b) whether they also expose non-park inventory (their retail site sells desert safaris — do those reach the API?), and (c) whether the portal is Rathin's own inventory or a resale of other aggregators. The last matters: **a reseller-of-a-reseller adds a margin layer and a reliability layer, and you would be third in line when something goes wrong.**

### 1.2 Why this is a commercial finding, not a technical one

Your business model's take-rate ladder:

| Tier | Type | Target take | Rathin supplies it? |
|---|---|---|---|
| A — Magnet | Park/attraction tickets | 5–8% | **Yes — this is all Rathin is** |
| B — Engine | Desert safari, dhow cruise, city tour, Abu Dhabi | 22–30% | No |
| C — Opaque | Multi-SKU combos | 25–32% | No (you assemble these) |
| D — Premium | Yacht, helicopter, private camp | 30–40% | No |
| E — Ancillary | Transfers, eSIM, Nol, photos | 40–60% | No |

The business model is unambiguous: *"Tier A is a cost centre, and you must behave like it is one."* and *"Every point of blended take rate above ~15% comes from R2, R3 and R4 — never from marking up tickets."*

**So: Rathin is your shelf-filler, exactly as the model says the API layer should be (25–30% of GMV, ~10% of gross margin). It is not, and must never become, the base of the product.** Blocker **B6** — signing 6–8 direct Tier B/D operators — is not a parallel workstream to the Rathin integration. It is *more important* than it. If only Rathin ships, the catalogue is credible and the business is not viable.

### 1.3 Reliability posture

Rathin's portal was built in roughly one month by a small agency and launched in 2022. That is not a criticism — it is a sizing signal. Plan for:

- No published SLA, no status page, no sandbox (assume all three until proven otherwise)
- Modest rate limits, possibly undocumented and enforced by failure rather than by a 429
- No idempotency support
- Support over WhatsApp/email in Gulf business hours, not a ticketing system
- Breaking changes shipped without notice or versioning

Every one of those is survivable **if the adapter assumes them**. §5 (Resilience) is written to that assumption.

---

## 2. The spike — 22 questions that must be answered in writing before any code

This is Blocker **B1**. Send it to Rathin as a document. Do not accept verbal answers, and do not infer answers from a Postman collection someone forwards you.

### Authentication & environment
1. Base URL for production. Is there a **sandbox/UAT** environment? If not, how do we test a booking without paying for a ticket?
2. Auth scheme — API key, OAuth2 client credentials, or username/password → token? Exact request shape.
3. Token TTL, refresh mechanism, and behaviour on expiry (401 vs 403 vs silent empty response).
4. Are credentials per-environment? Per-user? Can we have a separate read-only credential?
5. IP allowlisting required? *(This determines whether serverless egress works at all — serverless functions have rotating IPs. If Rathin allowlists, we need a static-IP proxy. **This is a stack-shaping question.**)*

### Catalogue
6. `GetParks` — full request/response schema. Does it paginate? How many parks?
7. Is there a "last updated" or delta mechanism, or must we poll the whole catalogue?
8. `GetTicketTypes(parkId)` — schema. Do ticket types carry age bands (adult/child/infant/senior), and what are the age boundaries?
9. Does any endpoint return **content** — descriptions, images, inclusions, terms? Or is it identifiers and prices only?
10. Are park/ticket-type IDs **stable over time**, or can they be reissued?

### Availability & pricing
11. `GetTimeslots(parkId, ticketTypeId, date)` — schema, and what "no timeslots" means (open ticket vs sold out — the flow doc conflates these).
12. `GetTicketPriceDetails` — is this availability *and* price, or price only? Does it return remaining capacity?
13. Are prices **net** (we mark up) or **gross/retail**? Currency — AED only?
14. Do prices vary by date, pax count, or lead time? Are there blackout dates?
15. Rate limits: requests per second/minute/day, per credential. What is returned on breach?
16. What is the p50 and p95 response time for the availability and price calls?

### Booking — the critical section
17. `CreateBooking` — full request/response schema, including exactly which fields are echoed back.
18. **Does `CreateBooking` accept an idempotency key or client reference?** If we send the same request twice, do we get one booking or two?
19. **Is there a `GetBooking` / `GetBookingStatus` endpoint?** If our `CreateBooking` call times out, how do we determine whether a booking was created? *(If the answer to both 18 and 19 is no, we cannot safely sell Rathin inventory — see §5.4.)*
20. What does the ticket come back as — a QR string, a barcode number, a PDF URL, an image? Is the URL permanent or signed/expiring?
21. **Cancellation:** is there an API? What are the windows and fees? If there is no API, what is the manual process and its SLA?
22. **Amendment:** can a date or timeslot be changed? Refunds — API-initiated or manual, and what is the settlement timeline?

### Commercials (ask alongside)
- Payment model: prepaid wallet, credit line, or per-booking? Top-up mechanics and currency.
- Net rate card, by park and ticket type, with validity dates.
- Named support contact and expected response time.
- Notice period for breaking API changes.

**If question 19 comes back "no": stop and escalate.** An API that can create a booking but not tell you whether it did is not safe to put a payment gateway in front of. The mitigation (§5.4) is expensive and imperfect.

---

## 3. The supplier abstraction layer

### 3.1 Principle

The storefront must never know where a SKU comes from. `src/lib/types.ts` already establishes this (`supplier.source` exists "for ops/analytics only"). Formalise it as a **port-and-adapter** boundary:

```
                  ┌─────────────────────────────────────────┐
                  │        SupplierPort (interface)         │
                  │  the only vocabulary the app knows      │
                  └─────────────────────────────────────────┘
                       ▲            ▲             ▲
          ┌────────────┘            │             └──────────────┐
   ┌──────┴───────┐        ┌────────┴────────┐        ┌──────────┴─────────┐
   │ RathinAdapter│        │ ManualAdapter   │        │ PortalAdapter      │
   │ (API, Tier A)│        │ (direct         │        │ (Farah/Miral,      │
   │              │        │  contracted —   │        │  Emaar — semi-     │
   │              │        │  Tier B/C/D/E)  │        │  manual, V1+)      │
   └──────────────┘        └─────────────────┘        └────────────────────┘
```

### 3.2 The port

Deliberately small. Every method must be implementable by a human with a WhatsApp thread (that is the `ManualAdapter`), or the abstraction is leaking Rathin's shape.

```
SupplierPort:
  checkAvailability(mapping, date, pax)      -> AvailabilityResult
  getNetRate(mapping, date, pax, variant)    -> NetRateResult
  createBooking(mapping, order, idemKey)     -> SupplierBookingResult | Pending
  getBooking(supplierRef)                    -> SupplierBookingStatus     // REQUIRED for safety
  cancelBooking(supplierRef, reason)         -> CancelResult | NotSupported
  amendBooking(supplierRef, changes)         -> AmendResult | NotSupported
  fetchTicket(supplierRef)                   -> TicketArtifact            // QR / barcode / PDF
  capabilities()                             -> SupplierCapabilities
```

`capabilities()` is the load-bearing method. It is what lets product rules be data rather than `if (supplier === 'rathin')` scattered through the codebase:

```
SupplierCapabilities {
  instantConfirmation: boolean
  supportsCancellation: boolean
  supportsAmendment: boolean
  supportsIdempotency: boolean
  supportsBookingLookup: boolean     // if false → booking is HIGH RISK, see §5.4
  hasTimeslots: boolean
  hasRealtimeCapacity: boolean
  availabilityTtlSeconds: number
  maxRps: number
  currency: 'AED'
}
```

**Rule:** the storefront derives `freeCancellationHours = 0` and hides self-serve cancellation automatically when `supportsCancellation === false`. Product behaviour follows capability. No manual configuration to forget.

### 3.3 The ManualAdapter is a first-class adapter, not a stub

This is the one design choice I would defend hardest. Your six-to-eight direct suppliers are your margin, and none of them will have an API — the feasibility report says they are on *"WhatsApp/paper."* So the `ManualAdapter` is where most of your gross margin flows, and it must be as well-built as the Rathin one.

It works like this:
- `checkAvailability` reads your **own** `capacity_ledger` (freesale with caps, blackout dates) — no network call, fast and reliable
- `getNetRate` reads your **own** contracted `net_rates` table
- `createBooking` writes a `supplier_bookings` row in state `pending_manual`, and enqueues a task that (a) posts to the supplier's WhatsApp/email via template, and (b) opens an ops queue item with a 2-hour SLA timer (`AC-INV-03`)
- Ops confirms in the admin panel → state `confirmed` → voucher pipeline runs
- Unresolved at 2h → auto-escalation alert; unresolved at the policy limit → the rejection saga (§06)

**The manual adapter is more reliable than the API adapter,** because your own database does not have an outage. That is worth internalising: the low-tech path is the high-margin *and* high-reliability path.

---

## 4. Data ownership — what comes from where

| Data | Rathin | Direct supplier | **We own** | Cache? | Notes |
|---|---|---|---|---|---|
| Park / operator identity | ✓ | Contract | Mapping | Static | `product_supplier_mappings` |
| Ticket type / variant IDs | ✓ | Contract | Mapping | Static | Re-verify stability (spike Q10) |
| **Product title, description, images** | ✗ | ✗ | **✓** | — | Ours entirely. This is the product |
| **Dietary flags (veg/Jain/halal)** | ✗ | Contract clause | **✓** | — | **The wedge. Never supplier-derived** |
| **Suitability / accessibility** | ✗ | ✗ | **✓** | — | Ours |
| **Inclusions / exclusions** | ✗ | Contract | **✓** | — | The anti-agent weapon (PRD §5.2) |
| **Pickup zones** | n/a | Contract | **✓** | — | Ours; validated at checkout |
| Timeslots | ✓ | Contract | Normalised | 15 min | Timezone: **Asia/Dubai**, always |
| Availability / capacity | ✓ | Our ledger | Ledger for manual | 60s–15min (§6.2) | **Zero cache at payment** |
| Net rate (cost) | ✓ | Rate card | Stored copy | 6–24h | Stored with validity dates for margin maths |
| **Retail price** | ✗ | ✗ | **✓** | — | Rule engine. Never FX-derived (`AC-PRC-03`) |
| Booking creation | ✓ | Manual | Order record | never | |
| Supplier booking ref | ✓ | Manual entry | Stored | forever | Reconciliation key |
| Ticket / QR artifact | ✓ | Manual upload | **Stored copy in R2** | forever | **Never hotlink a supplier URL on a voucher** |
| **Voucher document** | ✗ | ✗ | **✓** | — | Our PDF, our branding, our emergency number |
| Cancellation terms | ? | Contract | Stored policy | — | Ours is the *customer-facing* policy; supplier's is the *cost* |
| Reviews | ✗ | ✗ | **✓** | — | Verified-booking only |
| Reliability score | ✗ | ✗ | **✓ computed** | — | §6.5 |

**The rule that follows:** Rathin supplies *availability, price, and a booking*. Everything a customer reads, and everything that makes you different, is yours. If Rathin disappears tomorrow you lose inventory, not the product. Design accordingly.

### 4.1 Never hotlink a supplier ticket

When `createBooking` returns a ticket artifact, **immediately download it and store it in R2** before the voucher is generated. Reasons: supplier URLs expire, supplier CDNs go down at gate-scan time, and PRD `AC-MOB-02` requires offline voucher access. The voucher must be self-contained.

---

## 5. Resilience and failure handling

### 5.1 Error taxonomy — reuse the frontend's

The frontend already defines `MockScenario` in `src/lib/api/client.ts`, with designed UI and recovery copy for each. **Adopt it as the backend's canonical error taxonomy.** Every supplier failure must map to exactly one:

| Supplier condition | Maps to | Customer sees |
|---|---|---|
| 5xx, malformed body, unknown | `error` | "That's on us, not you. Try again — or message us on WhatsApp" |
| No response within budget | `timeout` | "The operator's system is slow. Try again, or message us" |
| Zero availability | `sold_out` | Next 3 available dates (`AC-ADP-02`) |
| Rate at booking ≠ rate at quote | `price_changed` | Explicit re-consent (`AC-CO-04`) |
| Manual SKU awaiting operator | `supplier_pending` | "Confirming with the operator — voucher within 2 hours" |
| Hotel outside coverage | `pickup_unavailable` | Offer private transfer or alternative |

If the backend can produce a state not in this list, add it to both sides simultaneously.

### 5.2 Timeout budgets

Every supplier call gets an explicit budget. Never inherit a default.

| Operation | Budget | On breach |
|---|---|---|
| Catalogue sync (background) | 30s | Retry with backoff; alert after 3 failures |
| `checkAvailability` (browse) | **2.5s** | Serve stale cache with a visible "as of HH:MM" timestamp (PRD §15 explicitly permits this) |
| `getNetRate` (quote) | 3s | Fall back to last known rate; flag the quote `rate_stale` |
| `checkAvailability` (pre-payment) | 6s | **Fail the transaction.** Never authorise on an unverified slot (`AC-INV-01`) |
| `createBooking` | **45s, once** | → §5.4 |
| `getBooking` (reconciliation) | 10s | Retry ×5 with backoff |
| `cancelBooking` | 20s | Queue for retry; refund the customer regardless (§07) |

### 5.3 Circuit breaker and retry

Per-supplier circuit breaker (`closed → open → half-open`):
- **Open** after 5 consecutive failures or a 50% error rate over 20 calls in 60s
- **While open:** availability serves stale cache with a timestamp; **booking is disabled for that supplier's SKUs and the affected SKUs are marked `unavailable` in search** — do not let customers into a checkout that will fail
- **Half-open** after 60s: one probe

Retry policy by operation:

| Operation | Retries | Rationale |
|---|---|---|
| Reads (parks, ticket types, timeslots, price) | 3, exponential backoff + jitter | Safe, idempotent |
| `createBooking` | **0 automatic retries** | Not idempotent unless the spike proves otherwise. Retrying a booking is how you double-book |
| `getBooking` | 5 | Safe, and it is the reconciliation path |
| `cancelBooking` | 3, then ops queue | |

### 5.4 The unsafe-booking problem — and what to do if Rathin fails spike Q18/Q19

If `createBooking` has **neither** an idempotency key **nor** a `getBooking` lookup, then a timeout is genuinely ambiguous: the booking may or may not exist, and you have no way to find out programmatically. This is not a theoretical concern; it is the most likely bad day you will have.

Mitigation, in order of preference:

1. **Get idempotency support.** Ask Rathin to accept and honour a client reference. Small suppliers often can — it is a unique index on their side.
2. **Get a lookup endpoint,** even a slow or paginated "list my bookings for date X" — enough to search for our reference.
3. **If neither:** treat every Rathin booking as `supplier_pending` on timeout, and:
   - do **not** retry
   - open a **P1 ops task** with the full request payload
   - notify the customer within 5 minutes: *"We're confirming with the operator — you'll have your voucher within 2 hours"* (this is already a designed state, `AC-VOU-02`)
   - ops resolves by contacting Rathin manually
   - if a duplicate is discovered, the duplicate-detection job (§06) catches it and initiates a refund

   **And accept that this caps how much Rathin volume you should carry.** A supplier you cannot reconcile programmatically is a supplier whose share of GMV should stay small — which, conveniently, is exactly what the take-rate ladder wants anyway.

### 5.5 Supplier outage playbook

| Scenario | Automatic response | Human response |
|---|---|---|
| Rathin down < 5 min | Stale availability + timestamp; bookings queue | None |
| Rathin down > 5 min | Circuit open; Rathin SKUs hidden from search; ADPs switch to "Check on WhatsApp" | Slack/email alert to ops |
| Rathin down > 30 min | As above + banner on affected ADPs | Ops messages pending customers proactively |
| Direct supplier unreachable at confirmation | Escalate at 2h (`AC-INV-03`) | Ops calls; failover to secondary supplier for that SKU |
| Supplier rejects after payment | Refund pre-authorised; 3 options offered within 2h (`AC-VOU-03`) | Agent contacts customer |

**Supplier failover** (PRD §11): the business model mandates *two suppliers minimum per Tier B SKU.* Model this as `product_supplier_mappings` with a `priority` column. On primary rejection, the system surfaces the secondary's equivalent to the agent as a one-click alternative. **Do not automate the swap silently** — price and inclusions differ, and the customer consented to a specific product. Automated failover is a V2 feature and should stay behind an ops confirmation until you have evidence the equivalences are truly equivalent.

---

## 6. Inventory, availability and pricing lifecycles

### 6.1 Inventory lifecycle

```
  DRAFT ──► MAPPED ──► PRICED ──► REVIEW ──► PUBLISHED ──► (PAUSED) ──► ARCHIVED
    │          │          │          │            │
    │          │          │          │            └─ live in search, bookable
    │          │          │          └─ margin floor check (AC-PRC-01), content QA
    │          │          └─ net rate + retail rule + tier assigned
    │          └─ linked to ≥1 supplier mapping; capabilities resolved
    └─ content authored in admin (ours: title, images, inclusions, dietary, suitability)
```

Gates:
- **MAPPED → PRICED** requires a net rate with a validity window covering today.
- **PRICED → REVIEW** blocks if margin < tier floor unless overridden with a logged reason (`AC-PRC-01`).
- **REVIEW → PUBLISHED** requires: ≥3 images, inclusions and exclusions non-empty, cancellation policy set, dietary flags explicitly set (including "not applicable"), and `AC-CAT-01`-grade SEO fields.
- **PUBLISHED → PAUSED** is automatic when the supplier's circuit breaker opens, or when the supplier reliability score drops below threshold.

Nothing is ever hard-deleted. `ARCHIVED` + soft delete, because orders reference products forever.

### 6.2 Availability lifecycle and cache strategy

I am **rejecting the PRD's global 5-minute TTL** in favour of TTL by inventory characteristic. Reasoning in §00 ¶4.3.

| Inventory type | TTL | Why |
|---|---|---|
| Tier A open-dated park ticket (no timeslot, large capacity) | **30 min** | Effectively freesale. Polling every 5 min is 6× the load on a small supplier's portal for zero benefit |
| Tier A timed slot, ample capacity | 15 min | |
| Any slot reporting `spotsLeft <= 10` | **60s** | This is where overselling happens |
| Direct/manual (our ledger) | **0 — read live** | It is our own database. There is nothing to cache |
| Date within 48 hours | 60s | Last-minute is the highest-churn window and Persona D's whole journey |
| **Pre-payment verification** | **0. Always.** | `AC-INV-01`. Non-negotiable, no exceptions, including the agent console |

Two-layer cache:
- **L1 Redis** (Upstash) — `avail:{supplier}:{mappingId}:{date}` → JSON + `checkedAt`. TTL as above.
- **L2 Postgres** `availability_cache` — same data, longer retention, survives a Redis flush, and gives you an audit trail for "what did we believe when we sold this?" That question will be asked after your first oversell.

**Stale-while-revalidate**: on a browse-path cache miss or breaker-open, serve L2 with a visible `checkedAt` timestamp and trigger an async refresh. PRD §15 explicitly permits *"cached availability with a timestamp rather than blocking the page."*

**Negative caching**: cache `sold_out` for only 60s. A slot that reopens and stays hidden for 30 minutes is lost revenue on your highest-intent traffic.

#### Synchronisation schedule

| Job | Frequency | Scope |
|---|---|---|
| Catalogue sync (parks, ticket types) | Nightly 03:00 IST + manual trigger | Full. Diff → flag new/removed/renamed IDs to ops, never auto-publish |
| Net rate sync | Every 6h | Rathin-priced SKUs; direct rates are manual with validity dates |
| Availability warm (next 14 days) | Every 15 min | Top 30 SKUs by traffic only — do not warm the long tail |
| Availability warm (15–90 days) | Every 6h | All published SKUs |
| Reconciliation sweep | Every 15 min | Any `supplier_booking` in a non-terminal state older than 10 min |
| Capacity ledger rollover | Daily 00:05 Asia/Dubai | Reset freesale caps, apply blackout dates |

All scheduled via QStash / cron → an authenticated route handler. Every job is idempotent and safe to run twice.

### 6.3 Pricing lifecycle

```
net_rate (cost, per supplier, per validity window, in AED)
   │
   ├─ tier markup rule  (A +6% · B +28% · C +30% · D +35% · E +50%)
   ├─ seasonal rule     (peak / shoulder / trough by date range)
   ├─ lead-time rule    (last-minute uplift or discount)
   ├─ pax rule          (group thresholds)
   │
   ▼
retail_price  ── set INDEPENDENTLY per currency (INR, AED) ── AC-PRC-03
   │            (never FX-converted; AED is not INR ÷ 23.2)
   ├─ margin floor check per tier ── AC-PRC-01 ── override requires reason + actor
   ▼
published price  ──► quote (server-signed, 20-min expiry) ──► order line ──► invoice
```

**Rules that are non-negotiable:**

1. **All-in.** Taxes, service charges, transfers and meals are inside the price. `pricing.ts` is already built this way and there is no place in the breakdown to add a fee. Keep it that way. The only permitted exception is a statutory pass-through (TCS) that must be **shown on the first price** if it applies at all — which is why B2 blocks checkout.
2. **INR and AED are independent columns.** Changing one never changes the other. The current `applyCoupon` does `aed = Math.round(inr / 23.2)` — a hardcoded FX rate. **That is a bug to fix during F1**, not a pattern to carry over.
3. **Money is stored in minor units as integers.** Paise and fils. `BIGINT`. Never a float, never a decimal string. All arithmetic in integers; rounding happens once, at display.
4. **A price change propagates within 5 minutes** (`AC-PRC-02`) across storefront, search and agent console. Implementation: write-through cache invalidation on the product key, plus a 5-minute max TTL on any price-bearing cache.
5. **Every price change is audited** (`AC-PRC-04`) — actor, timestamp, old, new, reason.
6. **The take-rate ladder is data, not code.** Tier markups live in `price_rules`, editable in admin. So do the search ranking weights (`AC-SRCH-05`), which currently sit in a const in `src/lib/search.ts`.

### 6.4 Combos (Tier C) — the margin engine, and the hardest inventory case

A combo is not a product with a price; it is **an assembly of components each of which can independently be unavailable.** This is where the booking engine gets genuinely difficult, and it is also where 25–32% take lives, so it deserves the care.

Rules:
- `combos` + `combo_items` (product, quantity, day offset, ordering)
- **Availability of a combo = AND across components** for the customer's selected dates
- **Price of a combo is set independently**, not summed. That is the whole point — an assembled combo has no comparable price on the internet. `separatePrice` (already in `types.ts`) is the savings proof and must be a *genuine* sum of current retail, recomputed, never a static marketing number
- **Booking a combo is all-or-nothing.** If component 2 of 3 fails at the supplier, components 1 and 3 must be compensated — cancelled or refunded. This is the saga in §06
- Combo margin floor is checked on the **assembled** price, not per component

### 6.5 Supplier reliability score

Currently a static number in `types.ts` feeding 15% of the search ranking weight. Compute it nightly instead:

```
reliability = 100
  − (rejection_rate_30d      × 40)
  − (late_confirmation_rate  × 20)     // manual SKUs missing the 2h SLA
  − (complaint_rate_30d      × 20)
  − (avg_rating_deficit      × 20)     // (5 − avg_rating) / 5
```

Floor at 0, use a 30-day window, require a minimum of 10 bookings before the score moves off its contracted default. Feeds: search ranking, the admin supplier scorecard (PRD §9.6), auto-pause thresholds, and contract renegotiation. A review of ≤2 stars must attach to the score within 1 hour (`AC-REV-03`).

---

## 7. Sequence diagrams

### 7.1 Browse — ADP availability and price

```
Customer      Next.js RH        Redis         Postgres       SupplierPort      Rathin
   │              │               │              │                │              │
   │ select date  │               │              │                │              │
   ├─────────────►│               │              │                │              │
   │              │ GET avail:... │              │                │              │
   │              ├──────────────►│              │                │              │
   │              │◄──── MISS ────┤              │                │              │
   │              │               │              │ checkAvailability             │
   │              ├──────────────────────────────┼───────────────►│              │
   │              │               │              │                │ GetTimeslots │
   │              │               │              │                ├─────────────►│
   │              │               │              │                │◄──── 200 ────┤
   │              │◄─────────────────────────────┼────────────────┤              │
   │              │ SETEX (ttl by characteristic)│                │              │
   │              ├──────────────►│              │                │              │
   │              │ INSERT availability_cache (L2, audit)         │              │
   │              ├─────────────────────────────►│                │              │
   │              │                                                              │
   │              │ computeQuote(product, pax, variant, addons)  [net rate+rules]│
   │              │ INSERT quotes (signed, expires_at = now+20m)                 │
   │              ├─────────────────────────────►│                │              │
   │◄─────────────┤ { status, slots, nextDates, quote{id,total,expiresAt} }      │
```

Budget 2.5s. On breach: return L2 stale + `checkedAt`, never block the page (`AC-ADP-01`, `AC-PERF-02`).

### 7.2 Booking — instant-confirmation SKU (happy path)

```
Customer   Checkout RH   Postgres   Payment(RZP)   Queue    Fulfil RH   Rathin   Notify
    │           │            │           │           │          │          │        │
    │ POST /orders (Idempotency-Key, quoteIds[])     │          │          │        │
    ├──────────►│            │           │           │          │          │        │
    │           │ revalidate quotes (not expired, price unchanged)         │        │
    │           ├───────────►│           │           │          │          │        │
    │           │ HARD availability re-check, TTL=0  │          │          │        │
    │           ├────────────┼───────────┼───────────┼──────────┼─────────►│        │
    │           │◄───────────┼───────────┼───────────┼──────────┼── OK ────┤        │
    │           │ INSERT order (pending_payment) + items + price snapshot  │        │
    │           ├───────────►│           │           │          │          │        │
    │           │ create payment order  │           │          │          │        │
    │           ├────────────┼──────────►│           │          │          │        │
    │◄──────────┤ {orderRef, gatewayOrderId}        │          │          │        │
    │                                                                              │
    │ ══ customer pays in the gateway's hosted flow (no card data touches us) ══   │
    │                                                                              │
    │           │◄─── POST /webhooks/razorpay (signature-verified) ───────┤        │
    │           │ verify sig → INSERT payment_event (raw, immutable)      │        │
    │           │ transition order → paid  (idempotent on event id)       │        │
    │           ├───────────►│           │           │          │          │        │
    │           │ enqueue FULFIL_ORDER   │           │          │          │        │
    │           ├────────────┼───────────┼──────────►│          │          │        │
    │           │                                    │ deliver  │          │        │
    │           │                                    ├─────────►│          │        │
    │           │                                    │          │ createBooking     │
    │           │                                    │          │ (idemKey)│        │
    │           │                                    │          ├─────────►│        │
    │           │                                    │          │◄─ ref+ticket ─────┤
    │           │                                    │          │ download ticket → R2
    │           │                                    │          │ order → confirmed │
    │           │                                    │          │ enqueue VOUCHER   │
    │           │                                    │          ├──────────┼───────►│
    │◄══════════════════ WhatsApp: confirmation + PDF voucher ═════════════════════┤
    │◄══════════════════ Email: same + GST invoice ════════════════════════════════┤
```

Target: voucher on WhatsApp within 60s of payment success at p95 (`AC-VOU-01`).

### 7.3 Booking — manual-confirmation SKU

```
… identical through payment …
    │           │ enqueue FULFIL_ORDER │
    │           ├─────────────────────►│
    │           │        ManualAdapter: supplier_booking → pending_manual
    │           │        ├─► WhatsApp/email template to supplier
    │           │        ├─► ops queue item, SLA timer T+2h
    │           │        └─► order status → supplier_pending
    │◄══ WhatsApp within 5 min: "Confirming with the operator — voucher within 2 hours" (AC-VOU-02)
    │
    │  ┌── ops confirms in admin ──► supplier_booking = confirmed
    │  │                             order = confirmed → voucher pipeline
    │  │
    │  ├── T+2h unresolved ────────► escalation alert to ops lead (AC-INV-03)
    │  │
    │  └── supplier rejects ───────► REJECTION SAGA (§06.6)
    │                                 within 2h, offer 3 options (AC-VOU-03):
    │                                   1. alternative SKU (secondary supplier)
    │                                   2. alternative date
    │                                   3. full refund, initiated within 24h
```

### 7.4 Cancellation

```
Customer   Booking RH   Postgres   SupplierPort   Payment     Notify
   │           │            │            │            │           │
   │ GET /bookings/:ref/cancellation-quote            │           │
   ├──────────►│            │            │            │           │
   │           │ policy engine: hours_to_start vs cancellation_policy
   │           │ + supplier cost recovery (what THEY refund us)   │
   │◄──────────┤ { refundINR, feeINR, refundPercent, creditedInDays, explanation }
   │           │                                                  │  AC-BM-01
   │ POST /bookings/:ref/cancel  (customer has seen the number)   │
   ├──────────►│            │            │            │           │
   │           │ IF capabilities.supportsCancellation:            │
   │           ├────────────┼───────────►│            │           │
   │           │            │  cancelBooking          │           │
   │           │ ELSE: ops task, manual supplier cancellation     │
   │           │                                                  │
   │           │ ── refund the customer REGARDLESS of supplier outcome ──
   │           │ INSERT refund (pending) ──► gateway refund API   │
   │           ├────────────┼────────────┼───────────►│           │
   │           │ order → cancelled; capacity released (manual SKUs)
   │◄══════════════ written confirmation, WhatsApp + email ══════════════┤  AC-BM-02
```

**The important line is "refund regardless."** Supplier recovery is *your* commercial problem and belongs in a reconciliation queue. Making the customer wait for a supplier who does not answer WhatsApp is how you get a chargeback, and a chargeback costs more than the refund.

---

## 8. What must remain real-time, cached, or stored — summary

| Must be **real-time** (TTL 0) | Should be **cached** | Must be **stored permanently** |
|---|---|---|
| Availability at payment authorisation | Browse availability (30s–30min by type) | Order + line snapshot (price, terms, pax) at time of sale |
| Capacity decrement for manual SKUs | Net rates (6–24h) | Supplier booking reference |
| Coupon usage cap check | Catalogue content (ISR, 60s) | Ticket artifact (copied to R2) |
| Payment status (webhook-driven) | Search results (60s, per filter-set) | Every payment webhook, raw and immutable |
| Margin floor validation | Reviews / aggregates (5 min) | Audit log of every state change |
| | Ranking weights + settings (5 min) | Consent records, with timestamp and source |

---

## 9. Cost of getting this wrong — ranked

1. **Selling an unavailable slot.** PRD calls it *"the worst failure mode in this product,"* and it is. Mitigated by TTL-0 verification at authorisation, and by a capacity ledger with row-level locks for our own inventory.
2. **Double-booking on a timeout** (Rathin spike Q18/Q19). Mitigated by idempotency, or capped by volume if unavailable.
3. **Charging a price different from the displayed one.** Mitigated by server-signed quotes; a mismatch is a P1 that blocks the transaction (`AC-CO-02`).
4. **Letting Rathin's model become the domain model.** Mitigated by the port, and by writing the `ManualAdapter` *first* — build against the abstraction, not against Rathin.
5. **Building for supplier breadth before supplier margin.** Not a technical failure. It is the one that quietly ends the business, and it is a scheduling decision, not an architectural one.
