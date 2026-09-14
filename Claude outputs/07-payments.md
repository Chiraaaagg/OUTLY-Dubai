# Phase 8 — Payment Architecture

---

## 1. Principles

1. **No card data ever touches our infrastructure** (`AC-CO-07`, `AC-SEC-01`). Gateway-hosted checkout or gateway-tokenised fields only. This keeps you at **PCI-DSS SAQ-A**, the lightest possible scope. The frontend already contains no card fields — that is a property to preserve deliberately, not an accident to be undone by a "nicer" in-page card form later.
2. **Order state is webhook-driven** (`AC-PAY-01`). The client redirect is a UX hint, not evidence. A customer who closes the tab after paying must still get a confirmed booking.
3. **The server owns the amount.** It comes from the quote (§06), never from the request body.
4. **Every gateway interaction is recorded**, including failures, including duplicate webhooks. `payment_events` is append-only.
5. **The gateway is swappable.** You will add a second one for AED, so the port exists from day one.

---

## 2. Gateway selection

### 2.1 India (INR) — Razorpay, with Cashfree as the negotiating alternative

| | Razorpay | Cashfree |
|---|---|---|
| UPI, cards, netbanking, wallets, EMI | ✓ | ✓ |
| Payment Links (needed for the agent console) | ✓ | ✓ |
| Refunds API + partial refunds | ✓ | ✓ |
| Subscriptions / mandates (deposit balance auto-debit, later) | ✓ | ✓ |
| Documentation and SDK quality | Excellent | Good |
| Published standard rate | **2% + GST** across modes | Often quoted lower **[VERIFY]** |
| Custom pricing | Above ₹5,00,000/month | Negotiable |

**Recommendation: Razorpay**, primarily on integration quality and documentation depth — which, for an AI-authored codebase, is a correctness argument, not a comfort argument.

**But get both quotes (Blocker B3).** Your business model assumes 2.2%; Razorpay's published standard is 2% + GST, i.e. **~2.36% effective**. On ₹1cr monthly GMV that 0.16pp gap is ~₹16,000/month, and at that volume you qualify for custom pricing. Ask before you launch, not after.

### 2.2 UAE (AED) — V1, blocked on the entity decision

The expat segment is the LTV thesis (33:1 vs 2.5:1 for FIT), and PRD §2.4 calls AED collection *"a hard requirement, not an enhancement."* It is still correctly deferred to V1, because it depends on Blocker B5 — which legal entity collects AED.

Candidates: **Telr**, **Network International**, **Checkout.com**, **Stripe UAE**, **PayTabs**. Selection criteria, in order: (1) will they onboard your entity, (2) local UAE card acceptance rates, (3) AED settlement to a UAE account, (4) API quality. **[VERIFY all — UAE acquiring is entity-dependent and I cannot determine eligibility for you.]**

Design consequence now: `orders.currency` and dual-currency columns already exist in the schema (§05), and the `PaymentGatewayPort` abstracts the provider. Adding AED at V1 should be an adapter plus configuration, not a migration.

### 2.3 The port

```
PaymentGatewayPort:
  createOrder(order)                  -> { gatewayOrderId, amountMinor, currency }
  createPaymentLink(order, opts)      -> { url, linkId, expiresAt }     // agent console
  verifyWebhook(rawBody, headers)     -> VerifiedEvent | InvalidSignature
  fetchPayment(gatewayPaymentId)      -> PaymentStatus                  // reconciliation
  refund(paymentId, amountMinor, ref) -> RefundResult
  fetchSettlements(dateRange)         -> Settlement[]                   // daily reconciliation
  capabilities()                      -> { methods[], supportsPartialRefund, supportsLinks, ... }
```

---

## 3. Supported methods

| Method | Priority | Notes |
|---|---|---|
| **UPI** | **Primary — largest tap target** | Default expectation for Indian collection. Intent flow on mobile, QR on desktop |
| Cards (debit/credit) | High | Domestic + international |
| Netbanking | Medium | Still meaningful for older/family buyers (Persona A) |
| Wallets | Low | Include; low volume |
| **EMI** | Medium | Orders > ₹15,000 (`EMI_THRESHOLD_INR` already in the frontend). Card EMI + cardless. Persona A's `→ REQ` |
| **AED cards** | **V1, non-negotiable** | UAE gateway. Persona D2 |
| Payment links | High | Agent console (Rail B) — same order object |
| International cards | Medium | Non-resident Indians, agents abroad |

**Deposit (30/70)** on orders > ₹25,000 (PRD §5.6): implemented as two `payment_schedules` rows. The deposit is a normal payment; the balance is due at T-7 with a reminder at T-8, escalating at T-5 and T-3. **The booking is confirmed on the deposit** — which means you carry the supplier cost on 70% of the value until the balance lands. Cap it to Tier C/D above ₹25,000, exactly as the business model says, and treat the unpaid balance as a receivable in the finance report.

---

## 4. Payment lifecycle

```
                            ┌──────────┐
                            │ created  │  order pending_payment; gateway order made
                            └────┬─────┘
                    ┌────────────┼────────────┐
                    │            │            │
              ┌─────▼─────┐ ┌────▼─────┐ ┌────▼──────────┐
              │ authorized│ │ captured │ │    failed     │
              │ (cards)   │ │          │ │               │
              └─────┬─────┘ └────┬─────┘ └────┬──────────┘
                    │ capture    │            │ cart preserved, reason shown,
                    └───────────►│            │ alternative offered (AC-CO-03)
                                 │            └──► customer retries (new attempt,
                                 │                  SAME idempotency key)
                    ┌────────────┼────────────┐
                    │                         │
          ┌─────────▼─────────┐    ┌──────────▼──────────┐
          │partially_refunded │    │      refunded       │
          └───────────────────┘    └─────────────────────┘
```

**Auto-capture** for UPI, netbanking and wallets (they are inherently immediate). For cards, capture immediately too — the auth-and-capture pattern would only help if you were reserving inventory pending supplier confirmation, and per Decision D1 you are not.

---

## 5. Webhook handling

### 5.1 The pattern

```
POST /api/webhooks/razorpay
  1. read the RAW body (before any JSON parsing — signature is over raw bytes)
  2. verify HMAC-SHA256 against the webhook secret, constant-time compare
       invalid → log, alert, return 200          ← 200, not 401: never let a
                                                    forged request trigger a provider retry storm
  3. INSERT payment_events (gateway, gateway_event_id, payload, signature_valid)
       ON CONFLICT DO NOTHING                    ← the dedup guard
  4. return 200 immediately                      ← under 1 second, always
  5. enqueue PROCESS_PAYMENT_EVENT(eventId)
```

Rule: **the webhook endpoint does no business logic.** It verifies, persists, acknowledges. Everything else is a job. A slow webhook handler gets retried by the provider, and then you are processing the same event concurrently with itself.

### 5.2 Events to subscribe to

| Razorpay event | Action |
|---|---|
| `payment.captured` | order → `paid`; enqueue `FULFIL_ORDER` |
| `payment.failed` | payment → `failed`; order → `payment_failed`; release capacity holds; preserve cart |
| `payment.authorized` | Record only (auto-capture makes this informational) |
| `order.paid` | Cross-check against `payment.captured`; belt and braces |
| `refund.created` / `refund.processed` / `refund.failed` | Update `refunds`; notify customer on `processed` |
| `payment_link.paid` | Agent-console link paid → same `paid` path |
| `payment.dispute.created` | §9 chargebacks |

### 5.3 Processing

```
PROCESS_PAYMENT_EVENT(eventId)                            [idempotent]
  event = SELECT … FOR UPDATE; if processed_at → return
  order = resolve from gateway order id / notes
    └ not found → P1 ALERT: money received, no order.        AC-PAY-02
                  Do NOT auto-refund; a human reconciles within 1 hour
  order.transition(target)      -- state machine is idempotent; illegal transition = no-op + warn
  UPDATE payment_events SET processed_at = now()
  enqueue downstream (FULFIL_ORDER / notifications / analytics)
```

**"Money received, no order" is the alert that matters most.** `AC-PAY-02` requires reconciliation within 1 hour. It happens when an order-creation transaction rolled back after the gateway order was made — rare, but real.

### 5.4 The redirect path

The customer returns to `/booking/confirmation?ref=…`. That page reads order state from our database. If the webhook has not landed yet (usually < 2s, occasionally longer), show the **processing** state that already exists in the frontend, poll `GET /orders/:ref` every 2s for up to 30s, then fall back to *"we'll confirm on WhatsApp within 10 minutes — do not pay again."*

**Never confirm from the redirect.** The redirect is unauthenticated and forgeable.

---

## 6. Refunds

### 6.1 Policy engine

```
computeRefund(orderItem, now, policy):
  hoursToStart = (serviceDateTime_Dubai − now) / 3600
  tier = first policy.tiers row where hoursToStart >= tier.hoursBefore
  refund = round(item.total × tier.refundPct / 100)
  fee    = item.total − refund
  return { refund, fee, refundPct, creditedInDays: "5–7 working days",
           explanation: plain-language reason }
```

This replaces the `// MOCK: all demo bookings are within their free window` in `src/lib/api/index.ts`, which currently always returns a full refund.

**`AC-BM-01`:** the customer sees the exact amount and expected credit date **before** confirming. Non-negotiable — a refund number that changes after the customer clicks is a support ticket and a trust loss.

### 6.2 Execution

```
POST /bookings/:ref/cancel
  1. recompute the refund server-side (never trust the quoted number from the client)
  2. INSERT refunds (status = 'pending', reason)
  3. IF supplier supports cancellation → cancelBooking (async, retried)
     ELSE → ops task for manual supplier cancellation
  4. gateway.refund(paymentId, amount, ourRefundRef)      ← IMMEDIATELY.
                                                            Do not wait for the supplier.
  5. order/item → cancelled; release capacity
  6. notify customer in writing (WhatsApp + email)          AC-BM-02
  7. track supplier_recovery_aed separately — the gap is a real cost line
```

**Refund the customer before recovering from the supplier.** Supplier recovery is your commercial problem; making the customer wait on it produces chargebacks, which cost more than the refund plus a fee plus the dispute-rate damage.

`AC-BM-02` requires initiation within 24 hours of an eligible cancellation. Gateway settlement to the customer's account is typically 5–7 working days **[VERIFY with Razorpay]** — say the real number, do not promise faster.

### 6.3 Partial refunds

Needed for: one item cancelled from a multi-item order; a combo leg substituted at lower value; a service-failure goodwill refund (dietary failure, pickup no-show).

`refunds.order_item_id` scopes it. Multiple partial refunds against one payment must sum to no more than the captured amount — enforce with a check on insert.

### 6.4 Failed payment recovery

`AC-CO-03`: cart preserved, plain-language reason, alternative offered.

Failure reasons are mapped to human copy, not surfaced as gateway codes:

| Gateway signal | Customer sees |
|---|---|
| Insufficient funds | "Your bank declined this — there may not be enough balance. Try another method or card." |
| UPI timeout | "Your UPI app didn't respond in time. Nothing has been charged — try again or use a card." |
| Card declined / issuer | "Your bank declined the payment. Nothing has been charged. Try another method, or we can send you a link on WhatsApp." |
| 3DS failed | "The verification step didn't complete. Try again — you'll get a fresh OTP." |
| Risk-blocked | Generic message; internal flag; do not reveal fraud logic |

Recovery ladder: retry same method → alternative method → **WhatsApp payment link from an agent** (Rail B's most valuable rescue, and one no OTA offers) → abandoned-checkout sequence at T+30 min, consent-gated (`AC-CO-06`).

### 6.5 Abandoned checkout

```
cart untouched 30 min AND has phone AND consent granted AND not converted
  → ABANDONED_CART job
  → re-verify availability and price BEFORE messaging       ← never recover into a dead cart
  → WhatsApp template with a resume link (marketing category — billable, see §08)
  → mark carts.recovery_sent_at (once only; never nag twice)
```

Re-verifying first matters: recovering someone into a sold-out slot is worse than not messaging at all.

---

## 7. Reconciliation

| Job | Frequency | Checks |
|---|---|---|
| **Pending payment sweep** | 30 min | Orders in `pending_payment` > 30 min → `fetchPayment` → reconcile or expire and release capacity |
| **Orphan payment sweep** | Hourly | Captured payments with no order transition → P1 (`AC-PAY-02`) |
| **Settlement reconciliation** | Daily | Our `payments` sum vs gateway settlement vs fees. Variance > ₹100 → finance |
| **Refund completion** | 6 hourly | `refunds` in `processing` > 7 days → chase |
| **Supplier recovery** | Weekly | Refunds where `supplier_recovery_aed` is null → ops chases the supplier |

The daily settlement reconciliation is the one that pays for itself. It is how you find out you are being charged a rate you did not agree to, and how you catch the fee-plus-GST arithmetic being wrong.

---

## 8. Fee and margin accounting

Record on every payment: `fee_minor`, `tax_on_fee_minor`. Then true contribution per order is computable rather than modelled:

```
gross_margin_inr   = total_inr − (net_cost_aed × settlement_fx_rate)
transaction_cost   = gateway_fee + gateway_fee_gst + fx_spread + refund_provision
contribution       = gross_margin_inr − transaction_cost − attributed_cac
```

`orders.net_cost_aed` is frozen at time of sale, so margin does not drift when a rate card changes. `settlement_fx_rate` should be the **actual** rate on the remittance, recorded per settlement batch — not a constant. The business model assumes ~2.5% FX spread on COGS; measuring the real number is Blocker B5's payoff.

---

## 9. Chargebacks

| Stage | System behaviour |
|---|---|
| `payment.dispute.created` webhook | Flag order, freeze refunds on it, P1 ticket, notify finance |
| Evidence assembly | Auto-compile: order, quote with timestamp, voucher, delivery receipts (WhatsApp/email `delivered_at`), supplier confirmation, cancellation policy shown at purchase, WhatsApp transcript |
| Response | Manual submission within the gateway's window |
| Outcome | Record win/loss; if lost, book as a loss, not a refund — different line |
| Prevention | Recognisable descriptor on the statement; instant voucher delivery; visible support number; delivery receipts stored |

The single best chargeback defence you have is **proof of delivery with a timestamp**. That is why `notifications.delivered_at` and `read_at` are columns rather than log lines.

---

## 10. Tax — designed, not implemented (Blocker B2)

`tax_lines` exists in the schema and the quote engine has a hook for it. **It stays empty until the CA opinion arrives**, because both the amount and whether it applies at all are unknown:

- **TCS** — the business model notes a flat 2% on overseas *tour packages* collected from the customer and refundable to them via ITR, but flags that **a standalone single activity may not be a "tour package"** (which requires ≥2 components). If that distinction holds, TCS applies to combos and not to single SKUs — which changes the checkout UI *per cart composition*. **[VERIFY — this rule changes yearly; written CA opinion required.]**
- **GST** — margin scheme versus gross determines invoice generation logic entirely.

Design so both answers are implementable without a migration:
- `tax_lines` is a per-order collection, computed by a rule set in `settings`
- The rule takes the whole cart, so a "package vs single activity" test is expressible
- Any tax line is **included in the displayed total from the first price shown** (PRD §20). If TCS applies, it is in the ADP price, not added at step 3
- The line carries `refundable_note` and `legal_basis` so the customer sees *"₹X TCS — refundable via your ITR"* with a help link, exactly as PRD §5.6 specifies

**Do not build checkout's final step until B2 is answered.** Retrofitting a tax line into a price-honesty product is more work than waiting.
