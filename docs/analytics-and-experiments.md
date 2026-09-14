# Analytics plan & experimentation roadmap

## 1. Principle

**Server-side events are the source of truth.** Client-only tracking
under-reports by 20–40% because of ad blockers and iOS restrictions, and that
error lands directly on CAC — the metric the whole business model hinges on
(PRD §8).

This build implements the client half: `src/lib/analytics.ts` normalises the
event, stamps a unique `event_id`, pushes to `window.dataLayer`, keeps a
200-event ring buffer for debugging and testing, and posts best-effort to a
collector. The `event_id` is what lets the server deduplicate against Meta CAPI
(AC-META-01).

Swap `deliver()` for the real transport. Nothing else in the app knows how
events travel.

## 2. Event taxonomy

### Acquisition & discovery
| Event | Fires when | Key properties |
|---|---|---|
| `page_view` | Every route | `page_type`, ids |
| `landing_page_view` | SEO landing pages | `landing_page` |
| `search_started` | Search input focused | `page_type` |
| `search_submitted` | Search executed | `filters`, `result_count` |
| `search_suggestion_selected` | Autocomplete chosen | `filters`, `position` |
| `filter_applied` | Any facet, chip or currency change | `filters`, `result_count`, `has_dietary_filter` |
| `sort_applied` | Sort changed | `sort` |
| `activity_card_viewed` | Card clicked | `activity_slug`, `tier`, `price`, `position`, `traffic_source` |
| `activity_viewed` | ADP loaded | `activity_slug`, `activity_category`, `tier`, `price` |
| `activity_compared` | Added to compare | `activity_slug`, `result_count` |
| `activity_saved` | Wishlisted | `activity_slug` |

### Booking intent
| Event | Key properties |
|---|---|
| `date_selected` / `time_selected` | `selected_date`, `selected_time` |
| `guest_count_changed` | `guest_count`, `pax_breakdown` |
| `variant_selected` | `activity_slug`, variant name |
| `add_to_cart` | `activity_slug`, `value`, `currency`, `selected_date`, `guest_count` |
| `checkout_started` | `value`, `currency`, item count, `rail` |
| `checkout_field_error` | `field`, `failure_reason` |
| `coupon_applied` / `coupon_rejected` | `coupon`, `value` |
| `payment_method_selected` | `payment_method` |
| `payment_initiated` / `payment_completed` / `payment_failed` | `payment_method`, `value`, `currency`, `failure_reason` |
| `supplier_confirmation_pending` | `booking_reference` |
| `booking_confirmed` | `booking_reference`, `booking_status`, `value`, `rail` |

### Post-booking
`voucher_downloaded` · `voucher_sent_whatsapp` · `booking_modified` ·
`booking_cancelled` · `review_submitted` · `referral_clicked` — all keyed to
`booking_reference`.

### Assisted rail — treated as conversion, not engagement
| Event | Properties |
|---|---|
| `whatsapp_initiated` | `whatsapp_context` (intent), `activity_slug`, `selected_date`, `guest_count`, `booking_reference`, `page_type` (placement), `rail: assisted` |
| `support_contacted` | `page_type`, `booking_reference` |
| `quote_requested` | `activity_slug`, `guest_count`, `rail: assisted` |

### Resilience
`error_shown` (`failure_reason`, `page_type`) · `empty_state_shown` ·
`retry_clicked`. These are product-quality metrics, not diagnostics: a rising
`error_shown` on the ADP is a conversion problem before it is an engineering
one.

## 3. Standard properties

Attached automatically: `event_id`, `page_path`, `device_type`, `ts`.
Attached per event where known: `activity_id`, `activity_slug`,
`activity_category`, `tier`, `combo_slug`, `landing_page`, `page_type`,
`user_segment` (fit / expat / unknown), `traffic_source`, `selected_date`,
`selected_time`, `guest_count`, `pax_breakdown`, `price`, `value`, `currency`,
`payment_method`, `booking_status`, `booking_reference`, `rail`,
`whatsapp_context`, `filters`, `result_count`, `has_dietary_filter`, `sort`,
`position`, `failure_reason`, `field`, `coupon`.

## 4. Dashboards required at launch

1. **Funnel, split by rail** — session → search → ADP → cart → checkout →
   payment → booking. Rail B must be visible or half the business is invisible.
2. **Unit economics, live** — GMV, take rate, blended CAC, contribution margin,
   by day and channel. Alert at ₹700 CAC.
3. **Tier mix** — GMV by tier A–E, reviewed weekly. This is the take-rate lever.
4. **Segment** — FIT vs expat share. Board-level KPI.
5. **Attach** — combo attach rate, in-trip second-booking rate.
6. **Ops** — voucher latency, WhatsApp response time, refund rate, supplier
   reliability.
7. **Cohorts** — repeat rate by segment and acquisition channel.

## 5. Instrumentation gaps to close server-side

| Gap | Why it matters |
|---|---|
| Meta CAPI + pixel dedup on `event_id` | Client-only Purchase events under-report and corrupt CAC |
| **Offline conversion upload for WhatsApp bookings** | Without it, Rail B is invisible to Meta and we systematically under-bid on our highest-value traffic. Common and expensive mistake |
| First-touch and last-touch channel on every order | AC-AN-01 |
| Server/client reconciliation within 2% | AC-AN-02 |
| GMV-by-tier for arbitrary date ranges | AC-AN-04 |

## 6. A/B testing roadmap

Ordered by expected value per unit of effort. Each needs ~2–4 weeks at the V1
volume target; do not run more than two concurrently on the same funnel stage.

### Tier 1 — run first

| # | Test | Hypothesis | Primary metric | Guardrail |
|---|---|---|---|---|
| 1 | **Hero message**: "Dubai, booked properly. In rupees, with a human on WhatsApp" vs a price-led "All-in ₹ pricing. No hidden fees." | Trust framing beats price framing for a first-time, unknown brand | Session → ADP | Bounce rate |
| 2 | **WhatsApp CTA weight on ADP**: equal weight vs secondary vs primary-above-Book | Equal weight maximises total conversion; primary may cannibalise cheap self-serve | Total bookings (both rails) | Support cost per order |
| 3 | **Price presentation**: per-person from-price vs group total once pax is set | A group total kills the "×7" surprise that abandons carts | ADP → add to cart | AOV |
| 4 | **Savings messaging on combos**: absolute (₹1,280) vs percentage (14%) vs both | Absolute rupees is more legible for this audience | Combo attach rate | Take rate |
| 5 | **Checkout length**: three progressive sections vs a single flat form | Fewer perceived steps beats fewer literal fields | Checkout → payment | Field error rate |

### Tier 2

| # | Test | Hypothesis | Primary metric |
|---|---|---|---|
| 6 | Payment method ordering: UPI-first vs card-first vs geo-adaptive | UPI-first for +91, card-first for +971 | Payment success rate |
| 7 | Sticky booking bar trigger: 520px vs viewport-exit of the widget | Later trigger reduces competition with the hero CTA | ADP → add to cart |
| 8 | Trust module placement: above vs below the fold on landing pages | Trust before product for an unknown brand | Landing → ADP |
| 9 | Review presentation: traveller-type filter default "families" vs "all" | Matching the visitor's segment raises perceived relevance | ADP → add to cart |
| 10 | Search placement on the homepage: hero search vs chips-only | Chips may beat a form when the destination is fixed | Search → ADP |

### Tier 3 — segment-specific

| # | Test | Hypothesis | Primary metric |
|---|---|---|---|
| 11 | Family messaging: "child and senior rates shown before checkout" as a homepage claim | Directly addresses the ×7 anxiety | Family-segment conversion |
| 12 | Expat detection: AED + today/tomorrow default vs INR default with a switch | Geo defaults remove friction for the highest-LTV segment | Expat conversion |
| 13 | Cross-sell placement: confirmation page vs T+1 WhatsApp message | Post-trip attach may beat post-purchase attach | Second-booking rate |
| 14 | Dietary filter prominence: primary facet vs a chip in the toolbar | The wedge is only a wedge if it's visible | Filter usage → conversion |
| 15 | Deposit option visibility: shown at ₹25,000 vs ₹15,000 | Lower threshold may lift family AOV | Bookings above ₹25,000 |

### Testing rules

- One primary metric per test, declared before launch.
- Minimum two weeks to cover a full weekly cycle; Dubai demand is strongly
  weekend-skewed.
- Never A/B-test a price-honesty claim. The all-in promise is positioning, not
  a variable.
- Never test manufactured urgency, even if it wins. It borrows from repeat rate
  and referral, which the test window will not measure.
