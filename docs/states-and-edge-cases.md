# States & edge cases

Every state below is implemented and reviewable. Append `?mock=<scenario>` to
any URL to force one; `/design-system` lists them as links.

## 1. The rule

A screen that only handles the happy path is not finished. Every list implements
**loading, empty, error and success**. Every failure names what happened in
plain language, says whether money moved, and offers both a retry and a human.

## 2. Loading

| Surface | Treatment |
|---|---|
| Search / category results | `loading.tsx` route skeleton whose grid matches the real grid exactly |
| Activity cards | `ActivityCardSkeleton` — same aspect ratio, same line count |
| Booking widget availability | Inline skeleton for the price and slot row, `aria-busy` |
| Buttons in transaction | Spinner + retained label + `aria-busy` |
| Payment | "Re-checking availability with the operator before charging you. Don't close this page" |
| Cancellation quote | Skeleton inside the sheet — never a spinner over a number |
| Cart / wishlist pre-hydration | Skeleton block, so counts never flash from 0 |

## 3. Empty

| Surface | Copy strategy | Actions |
|---|---|---|
| Search — over-constrained | **Never empty.** Near-matches with the relaxed constraint named | Adjust filters, WhatsApp |
| Search — genuinely nothing | Explains the catalogue is deliberately small | Browse everything, popular category |
| Cart | "Your trip is empty" + what the timeline does | Browse, first-timer plan |
| Wishlist | Explains the share mechanic | Browse, first-timer collection |
| Compare | Explains how to add | Browse, compare safaris |
| Account trips | Explains what will appear | Browse |
| Reviews by traveller type | Suggests switching back to all | — |

## 4. Error

| State | Trigger | Behaviour |
|---|---|---|
| API error | `?mock=error` | `ErrorState` with retry + WhatsApp; nothing charged |
| Timeout | `?mock=timeout` | Warning alert naming the operator's system as the cause |
| Offline | `?mock=offline` | Offline icon, "nothing has been charged", retry |
| Route error | Thrown render error | `error.tsx` — retry, WhatsApp, homepage, booking lookup, digest reference |
| Root error | Layout failure | `global-error.tsx` — zero imports, inline styles, emergency number |
| 404 | Bad URL | Recovery grid: search, bestsellers, all categories, WhatsApp |
| Maintenance | Planned | `/maintenance` — booking paused; vouchers, WhatsApp and emergency line explicitly unaffected |
| Booking not found | Bad reference | Explains likely causes, offers WhatsApp with phone/email lookup |
| Voucher not ready | Pending or unknown ref | Explains instant vs 2-hour confirmation, offers lookup and WhatsApp |

## 5. Commerce edge cases

| State | Where | Behaviour |
|---|---|---|
| **Sold out on date** | ADP, `?mock=sold_out` | Next three available dates inline — never an error (AC-ADP-02) |
| **Limited availability** | ADP | Real count, explicitly labelled as the operator's live number, not a countdown |
| Slot sold out | Time slots | Struck through and disabled — colour is not the only signal |
| Date unavailable | Date strip / calendar | Disabled with "Sold out"; calendar dots mark limited dates |
| **Price changed** | Checkout, `?mock=price_changed` | Old and new price both shown, reason given, explicit re-consent required, nothing charged (AC-CO-04) |
| **Payment failed** | Checkout, `?mock=payment_failed` | Cart preserved, plain-language reason, retry + alternative method + WhatsApp payment link (AC-CO-03) |
| **Payment timeout** | `?mock=payment_timeout` | "Do not pay again" — we confirm within 10 minutes and message either way |
| **Supplier pending** | Confirmation, `?mock=supplier_pending` | First-class state: 2-hour deadline, three options if rejected, automatic escalation |
| Pickup unavailable | `?mock=pickup_unavailable` | Explains coverage, offers private transfer or an alternative |
| Quote-only SKU | Tier D ADP | "Request a quote" — no price fabricated (AC-ADP-06) |
| Coupon rejected | Checkout | Names the reason and the shortfall: "You're ₹4,200 short" |
| Cart time conflict | Cart | Names both activities and the date before checkout is allowed (AC-CART-01) |
| Price lock expiring | Cart | Visible timer; on expiry, explains prices are re-checked and nothing auto-charges |
| Non-refundable SKU | ADP, cart, checkout, voucher | Stated in all four places, before payment |
| Guest with no account | Everywhere | Full booking, lookup, cancellation and voucher access without one |

## 6. Success

Confirmed booking · supplier-pending accepted · coupon applied · voucher sent to
WhatsApp · preferences saved · review submitted (with a dietary-failure branch
that promises a meal refund and a supplier flag) · cancellation completed with
the refund amount and date · account created with guest bookings auto-linked.

## 7. Failure modes designed against (PRD §3.3)

| Failure | Mitigation implemented |
|---|---|
| Price changes between search and checkout | 20-minute visible price lock; re-verification before authorisation; explicit re-consent |
| Supplier rejects after payment | Pending state promises three options within two hours, surfaced proactively |
| Voucher not received | Triple delivery + resend actions on confirmation, voucher and booking pages |
| Ticket rejected at the gate | Emergency number on the voucher itself, not in an email |
| Filters over-constrain to zero | Near-matches naming the relaxed constraint |
| Driver doesn't arrive | Remedy published on the ADP *before* booking; driver panel and call button inside 48 hours |
| Dietary request unmet | Same-day WhatsApp route, meal refund, supplier scorecard, and the review form asks explicitly |
