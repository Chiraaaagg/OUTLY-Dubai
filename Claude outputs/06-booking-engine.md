# Phase 7 — Booking Engine

*The only genuinely hard part of this system. Everything else is CRUD.*

---

## 1. The four invariants

Every design decision here serves one of four statements. If a change would violate one, the change is wrong.

| # | Invariant | Enforced by |
|---|---|---|
| **I1** | The price charged equals the price displayed for the same date and pax | Server-signed quotes (§2) |
| **I2** | We never sell a slot that is not available | Hard TTL-0 verification + capacity ledger row locks (§4) |
| **I3** | One customer intent produces exactly one order and one supplier booking | Idempotency at three layers (§3) |
| **I4** | Money and inventory never diverge silently; every divergence is detected and resolved | Reconciliation sweeps + the rejection saga (§6, §7) |

PRD `AC-ADP-05` says a price discrepancy is a P1 defect. `AC-CO-02` says a mismatch blocks the transaction and alerts engineering. Those are the correct severities.

---

## 2. Quotes — how I1 is enforced

### 2.1 The problem with the current design

`src/lib/pricing.ts` computes the total in the browser and the checkout submits it. That means the price is whatever the client says it is. This is not a hypothetical: it is a five-minute exploit with browser devtools.

### 2.2 The quote object

A **quote** is a server-computed, server-signed, time-limited price for a specific configuration.

```
POST /api/quotes
{ productId | comboId, variantId?, serviceDate, timeslot?,
  pax: {adult,child,infant,senior}, addonIds[], currency }

→ 200
{ quoteId: "qt_01J…",
  breakdown: [ {label:"Adults × 2", detail:"₹3,290 each, all-in", amountInr: 658000} , … ],
  subtotalInr, totalInr, totalAed,
  perPersonFromInr,
  expiresAt: "2026-09-09T18:20:00Z",          // +20 minutes
  signature: "…" }
```

Server-side, computing a quote:

1. Load product, variant, add-ons, current `prices` row.
2. Load the applicable `net_rates` row (validity window covering `serviceDate`).
3. Apply `price_rules` in priority order — tier markup, season, lead time, pax group.
4. Check the margin floor for the tier. Below floor and not overridden → refuse to quote and alert. **Never quietly sell below floor.**
5. Compute `tax_lines` (once B2 is answered) and include them **in the displayed total**, not appended later.
6. Persist to `quotes` with `net_cost_aed` (so margin at time of sale is frozen), sign with HMAC over a canonical serialisation, set `expires_at = now + 20 min`.

### 2.3 Rules

- **The client never sends an amount.** Not on `POST /orders`, not to the payment gateway, not anywhere. It sends `quoteId`s.
- **A quote is single-use.** `consumed_by_order` is set inside the order transaction; a consumed quote cannot be reused.
- **Revalidation on every step forward**: cart → checkout review → order creation. `POST /api/quotes/revalidate` returns `{ changed: false }` or `{ changed: true, oldTotal, newTotal, reason }`, which is exactly the shape `reverifyPrice` already has in `src/lib/api/index.ts` and exactly what the `price_changed` UI expects (`AC-CO-04`).
- **Expiry is honoured, not extended.** An expired quote is re-quoted at the current price and shown for re-consent. Silently extending is how you end up honouring a stale rate for an hour.
- **The signature is checked on consumption**, so a tampered quote body fails even if the row is somehow reachable.

### 2.4 The price lock, and what it costs

The 20-minute lock (PRD §12) is a customer promise: if the supplier's net rate rises inside the window, you absorb it.

Guardrails:
- **Cap concurrent live quotes per session** (suggest 20) and per IP (suggest 100/hour) in Redis. Without this, "open 500 carts, lock 500 prices" is free optionality against you.
- **Log every honoured-below-current-rate quote.** Add a `price_lock_cost` report so you can measure what the promise costs. **[ASSUMPTION]** — at your volumes I expect this to be negligible, but "I expect" is not "we measured."
- A quote for a date more than 90 days out gets a shorter lock (suggest 5 minutes) — long-dated rates move more.

---

## 3. Idempotency — how I3 is enforced

Three independent layers, because each protects a different failure.

### Layer 1 — HTTP idempotency key (protects against double-submit)

Every money-mutating `POST` requires an `Idempotency-Key` header. The client generates one per checkout attempt (not per request — a retry reuses it).

```
withIdempotency(handler):
  key = header['Idempotency-Key']            → 400 if absent
  hash = sha256(canonical(body))
  INSERT INTO idempotency_keys (key, scope, request_hash, locked_at)
    ON CONFLICT (key) DO NOTHING
  if not inserted:
     row = SELECT … FOR UPDATE
     if row.request_hash != hash        → 422 IDEMPOTENCY_KEY_REUSED
     if row.completed_at is not null    → replay stored response (same status, same body)
     else                               → 409 REQUEST_IN_PROGRESS  (client retries later)
  result = handler()
  UPDATE idempotency_keys SET response_status, response_body, completed_at
  return result
```

`orders.idempotency_key` carries a partial unique index as a second guard, so even a bug in the wrapper cannot produce two orders.

### Layer 2 — Payment webhook dedup (protects against gateway retries)

`payment_events (gateway, gateway_event_id)` is unique. A duplicate webhook hits the constraint and is acknowledged with `200` without reprocessing. Gateways retry aggressively; this is routine, not exceptional.

### Layer 3 — Supplier idempotency (protects against double-booking a supplier)

`supplier_bookings.idempotency_key = sha256(orderId + orderItemId)` — unique. Deterministic, so a job retried by QStash produces the same key.

If the supplier supports an idempotency key (spike Q18), pass it. If not, §7.3 is the fallback and it is materially worse.

---

## 4. Concurrency and overselling — how I2 is enforced

Two mechanisms, for two kinds of inventory.

### 4.1 Our own inventory (direct/manual SKUs) — pessimistic locking

```sql
BEGIN;
  SELECT * FROM capacity_ledger
   WHERE product_id = $1 AND supplier_id = $2
     AND service_date = $3 AND COALESCE(timeslot,'') = $4
   FOR UPDATE;                                  -- serialises concurrent checkouts

  UPDATE capacity_ledger
     SET held = held + $paxCount
   WHERE id = $ledgerId;                        -- CHECK constraint aborts on oversell

  INSERT INTO orders …;  INSERT INTO order_items …;
  UPDATE coupons SET usage_count = usage_count + 1 WHERE id = $c;   -- CHECK aborts past cap
COMMIT;
```

The `capacity_not_oversold` check constraint means an oversell is a **transaction abort**, not a bad row. The customer sees `SOLD_OUT` with next available dates (`AC-ADP-02`) instead of a booking that cannot be honoured.

`held` converts to `committed` when the supplier booking confirms, and is released when: payment fails, the order expires (30 min), or the booking is rejected. A cron sweep releases holds older than 45 minutes as a safety net.

### 4.2 Supplier API inventory — hard verification, no lock

You cannot lock inventory you do not own. So:

- Browse-path availability may be cached (TTL per §02.6.2)
- **Immediately before creating the order and the payment intent, re-check with TTL 0** (`AC-INV-01`)
- Between that check and the supplier's `createBooking`, there is an irreducible race window. It is small (seconds) and its consequence is a supplier rejection, which is a handled path (§6)

**There is no way to eliminate this race without a supplier hold API.** Ask for one in the spike; expect no. This is why the rejection saga must be well-built rather than an afterthought.

### 4.3 Combos — all-or-nothing

A combo locks **all** component capacity rows in a single transaction, in a deterministic order (sorted by ledger id) to avoid deadlock. If any component is unavailable, nothing is held and the whole combo is unavailable.

---

## 5. The booking flow, in full

### 5.1 `POST /api/orders`

```
1  withIdempotency
2  load cart + quotes
3  FOR EACH quote:
     ├ expired?           → 409 QUOTE_EXPIRED  { newQuote }        → re-consent UI
     ├ signature invalid? → 400 QUOTE_TAMPERED + Sentry P1
     └ already consumed?  → 409 QUOTE_CONSUMED
4  revalidate price against current rules
     └ changed → 409 PRICE_CHANGED { old, new, reason }            → AC-CO-04
5  HARD availability verification, TTL = 0, per item
     └ unavailable → 409 SOLD_OUT { nextDates[] }                  → AC-ADP-02
6  validate pickup zone against supplier coverage
     └ outside → 409 PICKUP_UNAVAILABLE                            → designed state exists
7  validate traveller payload (Zod) + fraud pre-check (§13)
8  BEGIN TX
     ├ lock capacity rows FOR UPDATE (manual SKUs), increment held
     ├ INSERT orders (status = pending_payment, reference from sequence)
     ├ INSERT order_items with FULL SNAPSHOT (title, inclusions, policy, terms)
     ├ INSERT tax_lines
     ├ mark quotes consumed
     ├ INSERT coupon_redemptions; increment coupons.usage_count
     └ INSERT order_attribution (first + last touch, fbclid/fbc/fbp)
   COMMIT
9  payment.createGatewayOrder(order)   → gateway order id
10 emit checkout_started / payment_initiated (server-side)
11 → { orderReference, gatewayOrderId, amountMinor, currency }
```

**Order reference format.** Replace the current `hash(phone + items)` with a Postgres sequence plus a check digit: `OUT-` + 6 digits from `nextval('order_ref_seq')` offset to start at 400000, + a Damm check digit. Sequential is fine — the reference is not a secret, and lookup requires reference **plus** phone or email, rate-limited (§13).

### 5.2 Payment (§07 has the detail)

The customer pays in the gateway's hosted flow. **No card field exists anywhere in our codebase** (`AC-CO-07`) — this is already true of the frontend and must stay true.

### 5.3 Fulfilment — `FULFIL_ORDER`

```
FULFIL_ORDER(orderId)                                    [idempotent, QStash, 3 retries]
  guard: order.status == 'paid'                          else no-op

  FOR EACH order_item:
    mapping = primary active mapping
    idemKey = sha256(orderId + itemId)
    INSERT supplier_bookings (idemKey, status='submitting')  -- unique index = the guard

    result = SupplierPort.createBooking(mapping, item, idemKey)   [45s budget, NO retry]

    ├ CONFIRMED
    │   store supplier_ref, response payload
    │   download ticket artifact → R2                     ← never hotlink (§02.4.1)
    │   capacity: held → committed
    │   item.status = 'confirmed'
    │
    ├ PENDING (manual adapter)
    │   status = 'pending_manual', sla_due_at = now + 2h
    │   notify supplier (WhatsApp/email template)
    │   open ops queue item
    │   item stays 'pending'
    │
    ├ REJECTED
    │   status = 'rejected' → REJECTION SAGA (§6)
    │
    └ TIMEOUT / UNKNOWN
        status = 'unknown' → RECONCILIATION (§7.3)

  IF all items confirmed  → order.confirmed  → GENERATE_VOUCHER
  IF some pending         → order.supplier_pending → notify customer within 5 min (AC-VOU-02)
  IF all rejected         → order.cancelled → full refund
  IF mixed (combo)        → order.partially_confirmed → agent handles, never terminal
```

### 5.4 Voucher — `GENERATE_VOUCHER`

```
render PDF (React-PDF or Puppeteer → R2)
  must contain: reference, QR/barcode, activity, date, time, pax,
                supplier name + contact, pickup details, inclusions,
                EMERGENCY SUPPORT NUMBER, cancellation terms          (PRD §5.7)
store vouchers row (versioned — a reissue supersedes, never overwrites)
enqueue SEND_NOTIFICATION × { whatsapp, email }
schedule PRE_TRIP_SEQUENCE at T-2d, T-1d evening, T-0
schedule REVIEW_REQUEST at T+2d
emit booking_confirmed + voucher_delivered (server-side)
```

Target: **WhatsApp voucher within 60s of payment success at p95** (`AC-VOU-01`). Achievable because everything after the webhook is a queue hop; the only variable is PDF render time (budget 3s) and BSP delivery.

**Auto-resend**: if the WhatsApp message is not `delivered` at T+10 min, resend once and fall back to SMS with a link (PRD §5.7).

---

## 6. The rejection saga — supplier says no after we took the money

This is the failure the business will actually experience, and `AC-VOU-03` already specifies the customer experience. The engine's job is to make it automatic.

```
supplier_booking.status = 'rejected'
        │
        ├─ 1. item.status = 'rejected'; release held capacity
        │
        ├─ 2. compute alternatives (immediately, so the agent has them in hand)
        │      a) secondary supplier mapping for the SAME product (priority = 2)
        │      b) same product, next 3 available dates
        │      c) nearest equivalent product (same category, tier, ±20% price)
        │
        ├─ 3. open a P1 support ticket, assigned, SLA = 2 hours
        │
        ├─ 4. notify the customer within 2h with THREE options (AC-VOU-03):
        │        "alternative SKU" · "alternative date" · "full refund"
        │      via WhatsApp (primary) + email
        │
        ├─ 5. PRE-AUTHORISE the refund now, do not wait for a reply
        │      refunds row created in 'pending'; auto-executes at T+24h
        │      if the customer has not chosen                        ← AC-VOU-03: within 24h
        │
        └─ 6. attach to supplier scorecard (rejection_rate feeds reliability, §02.6.5)
```

**Do not auto-swap to the secondary supplier.** Price, inclusions and pickup differ, and the customer consented to a specific product. The system prepares the swap; a human offers it. Automating this is a V2 decision that needs evidence the equivalences hold.

**Partial combo rejection** is the nastiest case: legs 1 and 3 confirmed, leg 2 rejected. Options, in order:
1. Substitute leg 2 (secondary supplier or alternative date) — preserves the combo price and margin
2. Reprice the combo as its remaining components at *combo* rates, refund the difference — **not** at standalone rates, which would be a worse deal than the customer agreed to
3. Cancel and refund the whole combo, cancelling the confirmed legs

Default to 1, then 2. Never silently deliver a partial combo.

---

## 7. Failure matrix

### 7.1 Payment succeeded, booking failed

**The classic.** Handled structurally rather than by a special case: because payment and fulfilment are separate services communicating through order state, this is simply `order.status = 'paid'` with an unfulfilled item — a normal, visible, recoverable state.

| Sub-case | Handling |
|---|---|
| Supplier rejected | Rejection saga (§6) |
| Supplier timeout, lookup available | Reconciliation resolves within 15 min |
| Supplier timeout, no lookup | §7.3 |
| Our bug (exception in fulfilment) | QStash retries ×3 → DLQ → P1 alert. Order sits in `paid`, money safe, nothing lost |
| Supplier down entirely | Circuit open; order → `supplier_pending`; customer told; ops fulfils manually |

**Monitor: any order in `paid` for > 15 minutes is a P1 alert.** That single alert catches almost every version of this failure.

### 7.2 Booking succeeded, notification failed

Never block on notification. `order.status = 'confirmed'` is set before any message is sent; delivery is a separate job with its own retries. Failures escalate: WhatsApp → retry ×5 → email → SMS with a link → ops ticket. The customer can always self-serve the voucher from `/booking/[reference]` with reference + phone.

### 7.3 The unknown-booking problem (Rathin spike Q19 = "no")

If `createBooking` times out and there is no lookup endpoint:

```
supplier_booking.status = 'unknown'          ← NOT an error; a state needing a human
  ├ do NOT retry (a retry may create a second booking)
  ├ P1 ops task with the full request payload
  ├ customer notified within 5 min: "confirming with the operator, voucher within 2 hours"
  ├ ops contacts the supplier manually → resolve to confirmed or rejected
  └ RECONCILE_SUPPLIER_BOOKINGS sweep keeps it visible until resolved
```

And a standing **duplicate-detection job**: nightly, look for two `supplier_bookings` with the same product, date, timeslot and lead phone. Flag for ops. This is how you catch the double-booking after the fact when you could not prevent it.

If Rathin fails both Q18 and Q19, **cap Rathin's share of GMV** and prefer direct/manual inventory for anything high-value. A supplier you cannot reconcile is a supplier you should carry less of — which the take-rate ladder wants anyway.

### 7.4 Full matrix

| Failure | Detection | Automatic | Human | Customer sees |
|---|---|---|---|---|
| Quote expired | On order create | Re-quote | — | Old vs new price, re-consent |
| Price changed | Revalidation | Block | — | Explicit re-consent (`AC-CO-04`) |
| Sold out at verification | TTL-0 check | Block, offer dates | — | Next 3 dates |
| Payment failed | Webhook | Preserve cart | — | Reason + alternative method (`AC-CO-03`) |
| Payment timeout (no webhook) | 30-min sweep | Query gateway | Finance if unresolved | "Do not pay again — we'll confirm within 10 min" |
| Supplier timeout | 45s budget | → `unknown` | Ops P1 | "Confirming, voucher within 2 hours" |
| Supplier rejected | Response | Rejection saga | Agent offers 3 options | 3 options within 2h |
| Manual SLA breach (2h) | Cron | Escalate | Ops lead | Proactive update |
| Voucher render fails | Job failure | Retry ×5 | Ops issues manually | Delay + explanation |
| Duplicate order | Idempotency | Replay response | — | Nothing — it just works |
| Duplicate supplier booking | Nightly job | Flag | Ops cancels one, refunds | Refund + apology |
| Combo partial | Fulfilment | Compute substitutes | Agent | Options, never silent partial |

---

## 8. Reconciliation

Four sweeps. Together they are the answer to invariant I4 — nothing diverges silently.

| Sweep | Frequency | Finds | Action |
|---|---|---|---|
| **Supplier bookings** | 15 min | Non-terminal `supplier_bookings` older than 10 min | Call `getBooking`; resolve or escalate |
| **Payments** | Hourly | Orders in `pending_payment` > 30 min; payments captured with no order transition | Query the gateway; reconcile; P1 on money-without-order (`AC-PAY-02`) |
| **Capacity** | Nightly | `held` older than 45 min; `committed` not matching confirmed items | Release; report drift |
| **Duplicates** | Nightly | Same product + date + slot + phone across two bookings | Ops review |

Plus a **daily settlement reconciliation** against the gateway's settlement report: our `payments` sum vs their settled amount vs fees charged. Discrepancies to finance. This is how you discover you are being charged 2.36% when you negotiated 1.9%.

---

## 9. Agent-created orders (Rail B) — the same engine

PRD §0: *"both rails write to the same order object... We do not build two systems."*

Implementation: `order.createOrder(input, actor)`. The storefront passes `actor = { type: 'customer' }`; the agent console passes `actor = { type: 'agent', adminUserId }` and sets `rail = 'assisted'`.

**Everything else is identical** — same quote requirement, same availability verification, same capacity locks, same idempotency, same fulfilment, same voucher.

Agents get three additional operations. Each is an explicit, permission-gated, audited **operation**, not a bypass:

| Operation | Permission | Guardrail |
|---|---|---|
| `quote.overridePrice(quoteId, newPrice, reason)` | `pricing.override` | Margin floor still checked; below floor needs `pricing.override_floor` and a reason; both logged to `price_change_log` |
| `availability.forceAllow(item, reason)` | `inventory.force` | Only for manual-adapter SKUs where the agent has phoned the supplier. **Never available for API suppliers** — `AC-INV-02` says a zero-availability SKU is never bookable through any rail, including the console |
| `order.createWithoutPayment(reason)` | `orders.create_unpaid` | For invoiced Tier D / B2B. Creates `payment_schedules`; order cannot reach `confirmed` until paid unless `orders.confirm_unpaid` is also held |

**The rule to hold the line on:** if an agent needs a capability, it becomes a named permission with an audit trail. It never becomes an `if (isAgent) skip(...)`. The moment one bypass exists, reconciliation is unreliable and every number in §11 becomes untrustworthy.

---

## 10. Testing requirements

The booking engine is where automated tests earn their cost. Minimum before Phase 1 sign-off:

**Unit (`server/domain/**` — pure, fast, exhaustive)**
- Price computation across every pax/variant/add-on/rule combination, including zero-priced infants
- Margin floor at, just above, and just below the boundary
- Refund computation at every cancellation-policy boundary, including exactly-at-the-hour
- Search relaxation ordering — port the existing cases from `src/lib/search.ts`
- Money arithmetic: rounding, negative deltas, currency independence (assert INR change never moves AED)

**Integration (real Postgres, mock supplier)**
- Two concurrent checkouts for the last seat → exactly one succeeds, one gets `SOLD_OUT`
- Same idempotency key twice → one order, identical response
- Same key, different body → 422
- Webhook delivered three times → one state transition
- Quote expiry, tampering, reuse → correct rejections
- Coupon at cap, redeemed concurrently → cap respected
- Combo where leg 2 rejects → correct saga
- Supplier timeout → `unknown`, no retry, ops task created

**End-to-end (`RathinMockAdapter` reproducing each `MockScenario`)**
- All twelve frontend scenarios produce the state the UI expects
- Guest checkout completes without an account (`AC-CO-01`)
- Displayed total equals charged total across 50 randomised carts (`AC-CO-02`) — property-based, not example-based

**Load (before launch, modest)**
- 50 concurrent checkouts on one SKU with capacity 20 → exactly 20 confirmed, 30 cleanly rejected, zero oversell

That last test is the one that proves I2. Run it in CI.
