# Phase 12 — Analytics Architecture

*The business model hinges on blended CAC. If CAC is unmeasurable, every strategic decision in it is guesswork.*

---

## 1. The governing principle

PRD §8: **server-side event tracking is the source of truth.** Client-only tracking under-reports by 20–40% because of ad blockers and iOS restrictions, and that under-reporting is not random — it biases exactly the segments and channels you most need to measure.

Architecture consequence: **`/api/events` is the collector and the system of record.** GA4, Meta and PostHog are downstream consumers, not sources. Nothing reports a number that did not pass through your database first.

```
Client (lib/analytics.ts)  ─┐
                            ├─► POST /api/events ─► analytics_events (Postgres)
Services (state changes)   ─┘         │                    │
                                      │                    ├─► PostHog
                                      │                    ├─► GA4 Measurement Protocol
                                      │                    ├─► Meta CAPI (event_id dedup)
                                      │                    └─► Meta Offline Conversions (Rail B)
                                      └─► enrich: server time, session, user,
                                                 geo, attribution, order context
```

**Money events are emitted by services on state transition, never trusted from the client.** `booking_confirmed` fires when the order row transitions, not when a browser says so. The client may fire its own copy for the pixel; dedup on `event_id` handles the overlap.

---

## 2. Event taxonomy

`src/lib/analytics.ts` already defines 40 event names and a rich `EventProps` shape. **Adopt it verbatim** — it is well-designed and it means client and server agree by construction. Below, the events that carry business meaning, with the properties the backend must guarantee.

### 2.1 Discovery
| Event | Key properties | Source |
|---|---|---|
| `page_view` | page_type, page_path, tier, product_id | client |
| `landing_page_view` | landing_page, traffic_source | client |
| `search_submitted` | filters, result_count, **has_dietary_filter** | client |
| `filter_applied` / `sort_applied` | filters, sort | client |
| `empty_state_shown` | filters, relaxed_constraint | client |
| `activity_viewed` | product_id, tier, price, position, source | client |
| `activity_compared` | product_ids[] | client |
| `activity_saved` | product_id | server |

### 2.2 Intent
| Event | Key properties | Source |
|---|---|---|
| `date_selected` / `time_selected` / `guest_count_changed` / `variant_selected` | product_id, selected_date, guest_count, pax_breakdown | client |
| `add_to_cart` | product_id, tier, value, quote_id | **server** |
| `checkout_started` | cart_value, item_count, has_combo, rail | **server** |
| `coupon_applied` / `coupon_rejected` | coupon, discount, reason | server |
| **`whatsapp_initiated`** | page_type, product_id, pax, dates, intent, **rail=assisted** | client + server mirror |

**`whatsapp_initiated` is a conversion event, not an engagement event.** PRD §8 flags this explicitly and it is the most commonly mis-modelled event in this kind of business. It maps to Meta's `Lead` and it is the top of Rail B's funnel, which is 45% of target GMV.

### 2.3 Transaction — all server-emitted
| Event | Key properties |
|---|---|
| `payment_initiated` | order_ref, value, currency, method |
| `payment_completed` | order_ref, value, currency, method, gateway_payment_id |
| `payment_failed` | order_ref, failure_reason, method |
| `supplier_confirmation_pending` | order_ref, supplier_id, sla_due_at |
| **`booking_confirmed`** | order_ref, **gmv, net_cost, take_rate, tier_mix, rail**, item_count, has_combo |
| `voucher_delivered` | order_ref, **latency_seconds**, channel |
| `booking_cancelled` | order_ref, refund_amount, reason, hours_before_travel |
| `booking_modified` | order_ref, kind, fee |

`booking_confirmed` carrying `take_rate` and `tier_mix` is what makes dashboard 3 (GMV by tier, `AC-AN-04`) queryable without a join-heavy report.

### 2.4 Post-trip and loops
| Event | Key properties |
|---|---|
| `review_submitted` | product_id, rating, **dietary_met** |
| `referral_clicked` / `referral_converted` | code, referrer_id |
| **`in_trip_upsell_sent`** | order_ref, day_of_trip, recommended_product_ids |
| **`in_trip_booking`** | order_ref, parent_order_ref, value |

`in_trip_upsell_sent` → `in_trip_booking` is the attach loop the business model calls *"the highest-ROI activity in the entire company"* with a 35% target. It must be measurable from day one, otherwise you will not know whether it works.

### 2.5 Resilience
`error_shown`, `retry_clicked`, `supplier_timeout`, `price_changed_shown`, `sold_out_shown`. These are product-quality telemetry — a spike in `price_changed_shown` means a pricing bug, and a spike in `sold_out_shown` at checkout means the availability TTL is too long.

---

## 3. The collector

```
POST /api/events
  body: { event, event_id, ...props }  — or a batch (sendBeacon)
  1. validate (Zod, per-event schema); reject unknown events loudly in dev, silently in prod
  2. rate limit by anon_id (1000/hour) — analytics must never be an amplification vector
  3. enrich:
       received_at (server clock — never trust client time for ordering)
       session_id, anon_id (httpOnly cookie)
       user_id (session)
       geo_country (edge header)
       ip_hash (hashed, never raw — DPDP minimisation)
       attribution (first + last touch from the attribution cookie)
  4. INSERT analytics_events  (unique on event_id + source)
  5. return 204 immediately
  6. enqueue FORWARD_EVENT
```

Never block a user action on analytics. `lib/analytics.ts` already wraps `deliver()` in try/catch with the comment *"analytics must never break a booking"* — preserve that property on the server side too.

---

## 4. Attribution

### 4.1 Capture

On first visit, persist to an `attribution` cookie (1 year) and mirror server-side:
`utm_source/medium/campaign/term/content`, `gclid`, `fbclid`, `fbp`, `fbc`, referrer, landing page, timestamp.

`fbc` is derived from `fbclid` in Meta's required format; store both. **This is the field that makes offline conversion upload work** and it is easy to forget until you need it and it is not there.

### 4.2 Storage

On order creation, write `order_attribution` with **both first-touch and last-touch** (`AC-AN-01`), plus `wa_conversation_id` where the order came through Rail B.

For Rail B, the chain is: ad click → `ctwa_clid`/`fbclid` captured → carried into `wa_conversations.attribution` (§08.5.1) → carried to `order_attribution` at order creation. **Break any link in that chain and Rail B is invisible to Meta.**

### 4.3 Cross-device

Deterministic only. Match on verified phone or email at login, then backfill the anonymous session's events to the user. **No probabilistic fingerprinting** — the accuracy gain is small and the DPDP exposure is not.

Practical consequence: an expat who browses on a laptop and books on a phone is matched at OTP login. A guest who never logs in is matched at checkout by phone.

---

## 5. Destinations

### 5.1 Meta — the one that costs money if wrong

| Requirement | AC | Implementation |
|---|---|---|
| Pixel (client) + **Conversions API (server)** with `event_id` dedup | `AC-META-01` | Same `event_id` on both; Meta dedups |
| Purchase server-side with correct value and currency | `AC-META-01` | From `orders`, on state transition |
| Advanced matching with hashed PII where consent permits | — | SHA-256 email, phone, name, city |
| **Offline conversion upload for Rail B** | `AC-META-02` | Daily job; `order_attribution.fbc`/`fbclid` |
| Reconcile within 10% | `AC-META-03` | Weekly comparison report |

Event mapping: `ViewContent` ← `activity_viewed` · `Search` ← `search_submitted` · `AddToCart` ← `add_to_cart` · `InitiateCheckout` ← `checkout_started` · **`Purchase` ← `booking_confirmed` (server)** · **`Lead` ← `whatsapp_initiated`**.

**On offline conversions, from the business model:** *"otherwise Rail B bookings are invisible to Meta optimisation and we will systematically under-bid on our highest-value traffic. This is a common and expensive mistake."* At a 45% assisted GMV target, getting this wrong means optimising your ad spend against 55% of your revenue. Build it in Phase 5, not "later."

Also: a **catalogue feed** for dynamic product ads — a scheduled job generating a product feed from `products` + `prices`.

### 5.2 GA4
Measurement Protocol server-side for purchases; gtag client-side for behaviour. GA4 is for the marketing surface and Google Ads; it is not your source of truth and should not be treated as one when the numbers disagree.

### 5.3 PostHog
Product analytics: funnels, cohorts, retention, session replay (**with input masking on all PII and payment fields — verify this before enabling replay at all**), feature flags. This is where you will actually answer "why did checkout drop 8% last week."

---

## 6. Dashboards (PRD §8)

| # | Dashboard | Key metrics | Where |
|---|---|---|---|
| 1 | **Funnel by rail** | session → search → ADP → cart → checkout → payment → booking, self-serve vs assisted | PostHog |
| 2 | **Unit economics live** | GMV, take rate, blended CAC, contribution margin, by day and channel | Admin (own SQL) |
| 3 | **GMV by tier A–E** (`AC-AN-04`) | The take-rate lever; reviewed weekly | Admin |
| 4 | **FIT vs expat share** | Board-level KPI | Admin |
| 5 | **Attach** | Combo attach rate, in-trip second booking rate | Admin |
| 6 | **Ops** | Voucher latency p95, WhatsApp median first response, refund rate, supplier reliability | Admin |
| 7 | **Cohorts** | Repeat rate by segment and acquisition channel | PostHog |

Dashboards 2–6 are **owned SQL in the admin panel**, not PostHog. They join orders, margin, supplier and cost data that only your database has, and they must be exactly right because they drive commercial decisions.

---

## 7. The three acceptance criteria that need dedicated work

### `AC-AN-01` — every booking attributable to first-touch and last-touch
Satisfied by `order_attribution`, populated at order creation from the attribution cookie and, for Rail B, from the conversation. Test it: place an order through each of the five acquisition engines (E1–E5) and assert the row is correct.

### `AC-AN-02` — server and client booking counts reconcile within 2%
A daily job comparing `count(booking_confirmed WHERE source='server')` against `source='client'`. A gap wider than 2% means either the client is being blocked more than expected (informative, and expected to be higher than 2% on mobile India — **so the real target is that the *server* count is complete**, and the client gap is a measure of ad-blocker prevalence rather than a defect) or an event is not firing.

Be honest about this one in review: `AC-AN-02` as literally written may not be achievable given Indian mobile ad-blocker rates. The useful version is: **server count is authoritative and complete; client/server delta is monitored and explained.**

### `AC-AN-03` — blended CAC computed daily, automated alert at ₹700
```
blended_CAC = total_marketing_spend_day / attributed_orders_day
```
Marketing spend needs an input. Options: Meta Marketing API pull (recommended — automatable), plus manual entry for non-Meta spend. Alert at ₹700 to WhatsApp and email.

The business model calls this *"the single most important guardrail in the business"* — above ₹760, a FIT customer never pays back. Build the alert in Phase 5 and wire it to a human, not a dashboard nobody opens.

---

## 8. Data quality

- **Never invent a number.** `docs/known-limitations.md` claims no invented scarcity, but `availability.ts` `recentBookings()` returns `3 + seeded(...)`. Replace it with a real count from `order_items` or remove the display. A fabricated social-proof number in a product whose entire positioning is honesty is a bad trade.
- **`bookedThisMonth` must be real** — nightly aggregation from confirmed orders.
- **Rating aggregates** recomputed on review publish, not on read.
- **Test events** are tagged `environment` and excluded from every report. Staging must never write to production analytics.
- **Event schema versioning:** adding a property is safe; renaming or removing one requires a migration plan, because dashboards break silently.

---

## 9. Privacy

- Hash all PII before sending to any third party (Meta advanced matching, GA4 user IDs).
- Store `ip_hash`, never raw IP.
- Consent gating: analytics cookies and third-party forwarding respect the consent banner. Transactional/first-party server events are legitimate interest; marketing forwarding is not.
- `analytics_events` retention: 24 months raw, then aggregate and drop (§05.8).
- On a deletion request, scrub `user_id` from events and drop the raw rows for that subject, keeping only aggregates.
