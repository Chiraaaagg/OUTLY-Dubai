# Checkout optimisation plan

Target: **completable in under 90 seconds by a returning customer** (AC-CO-05),
on a mid-range Android, one-handed.

## 1. Structure

Four steps, **one page**, progressive sections. Not four page loads — each
navigation is a chance to lose someone, and on a poor connection it is an
expensive one.

| Step | Collected | Why here |
|---|---|---|
| 1 · Your details | Name, email, WhatsApp number, hotel, dietary flag, notes, WhatsApp consent | The minimum the supplier needs. Passport details are collected later and only where an operator requires them |
| 2 · Review | Itemised order, per-item cancellation terms, coupon | The coupon field lives here, not at payment — hunting for a code at the payment step is a documented abandonment trigger |
| 3 · Payment | Method, deposit option, terms | Nothing new is asked for; only the choice of how to pay |
| 4 · Confirmation | — | Separate route so it survives a refresh and is linkable |

Completed steps collapse to a summary with an Edit link, so the page shortens as
you progress rather than growing.

## 2. Friction removed

| Friction | Decision |
|---|---|
| Forced account creation | **Guest checkout is mandatory** (AC-CO-01). Account offered after payment, one tap, using details already given |
| Passport/ID collected speculatively | Only where the supplier requires it, and after booking |
| Separate billing address | Not collected — it isn't needed for these transactions |
| Card fields on our page | None exist in the codebase. Gateway-hosted only (AC-CO-07) |
| Payment method hunting | UPI first with the largest tap target; EMI appears only above ₹15,000; deposit only above ₹25,000 |
| Surprise totals | Order summary restates the total next to the pay button, with "This is the exact amount your card or UPI will be charged" |
| Coupon anxiety | Coupon at review; rejection names the reason and the shortfall |
| Losing the cart on failure | Cart preserved on every failure path |
| Being stuck | Every step carries a WhatsApp handoff that passes the step and the total |

## 3. Payment methods, in the order this audience uses them

1. **UPI** — GPay, PhonePe, Paytm, any app. Marked "Most used", largest target.
2. Credit / debit card — Visa, Mastercard, RuPay, Amex.
3. Netbanking.
4. Wallets.
5. **EMI** — above ₹15,000, with the monthly figure calculated and shown.
6. **AED cards** — for UAE residents, via the currency context.

Plus **30/70 deposit** above ₹25,000: 30% now, balance at T-7, with a WhatsApp
reminder. Presented as a genuine option with both figures shown, not an upsell.

## 4. States implemented

| State | Behaviour |
|---|---|
| Initial | Step 1 open, others collapsed |
| Field validation | On submit, not keystroke. `aria-invalid` + adjacent plain-language message. Each error fires `checkout_field_error` |
| Missing required info | Advancing is blocked and the page returns to step 1 with errors visible |
| Coupon applied | Success message + discount line in the summary |
| Coupon rejected | Names the reason and the exact shortfall |
| **Price updated** | Old and new price, the reason, explicit re-consent. Nothing charged (AC-CO-04) |
| Payment processing | Button `aria-busy`; "Re-checking availability with the operator before charging you" |
| Payment success | Redirect to `/booking/confirmation` with reference and status |
| **Payment failure** | Cart preserved, plain-language reason, retry + alternative method + WhatsApp payment link (AC-CO-03) |
| **Payment timeout** | "Do not pay again" — we confirm within 10 minutes and message either way |
| Supplier confirmation pending | Explained inline before payment, and again on confirmation |
| Booking failed | Route error boundary with retry and a human |
| WhatsApp-assisted checkout | Header and body handoffs passing step, total and trip contents |
| Abandoned checkout recovery | Consent captured at step 1; T+30min message (AC-CO-06) |

## 5. Price integrity

Three guarantees, enforced in code:

1. `computeBreakdown` has no branch that can add a fee. Taxes are inside the SKU
   price.
2. Availability **and** price are re-verified at the moment of authorisation,
   before anything is charged (AC-INV-01). A change stops the payment and asks.
3. The review total and the charged total are the same value from the same
   function (AC-CO-02) — not two computations that happen to agree.

## 6. Ordered optimisation backlog

| # | Change | Expected effect |
|---|---|---|
| 1 | Saved traveller + payment details for logged-in repeat customers | The clearest path to sub-90-second checkout |
| 2 | Phone-number-first identification with OTP autofill | Removes email typing on mobile |
| 3 | Hotel autocomplete against known pickup zones | Removes the free-text field most likely to be wrong |
| 4 | Inline pickup-coverage validation as the hotel is entered | Catches `pickup_unavailable` before payment, not after |
| 5 | UPI intent deep-link on Android | Removes an app-switch step |
| 6 | Server-side abandoned-cart recovery with a resumable link | Recovers the largest single leak |
| 7 | Express path for single-ticket instant SKUs (one screen) | Serves the last-minute segment |
| 8 | Apple Pay / Google Pay for UAE cards | Expat friction |
| 9 | Real-time TCS calculation with a plain-language explainer | Blocked on the CA opinion (PRD §19.4) |
| 10 | Multi-traveller detail collection only where the supplier demands it | Avoids a long form for group bookings |

## 7. Measurement

Funnel: `checkout_started` → `payment_method_selected` → `payment_initiated` →
`payment_completed`, split by rail and by device.

Watch: `checkout_field_error` by field (which field is costing bookings),
`coupon_rejected` rate (are we advertising codes that don't apply), payment
failure rate by method, and time-to-complete p50/p90.
