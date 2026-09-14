# Phase 1 — Frontend Architecture Report

*What exists, what is real, what is theatre, and exactly what the backend owes it.*

---

## 1. What was reviewed

`D:\Programs\OUTLY` — Next.js 15.5.4 (App Router), React 19, Tailwind v4, TypeScript 5.7. Three runtime dependencies total (`clsx`, `lucide-react`, `tailwind-merge`). **No `app/api` directory exists. There is no backend of any kind.**

| Area | Files |
|---|---|
| Routes | 60+ under `src/app/**` |
| Domain model | `src/lib/types.ts` |
| Integration seam | `src/lib/api/client.ts`, `src/lib/api/index.ts` |
| Business logic | `src/lib/pricing.ts`, `availability.ts`, `search.ts`, `whatsapp.ts`, `analytics.ts` |
| Mock content | `src/lib/data/*.ts` (~240KB — activities, categories, collections, combos, landing pages, reviews, bookings, legal) |
| Client state | `src/components/providers/app-provider.tsx` |
| Docs | 13 files under `docs/` |

## 2. Overall assessment

**This is a genuinely good handoff.** Three things in particular reduce backend risk:

1. **A real integration boundary.** Every asynchronous operation goes through `src/lib/api/index.ts`. No component imports `src/lib/data/*` for anything dynamic. Replacing mocks with HTTP is a change to one file, not a refactor.
2. **A domain model that already anticipates the problem.** `types.ts` has `SupplySource = "direct" | "rayna" | "portal"`, `ConfirmationType = "instant" | "manual"`, `Tier = A–E`, and `Money { inr, aed }` carrying both currencies independently rather than FX-converting. Someone thought about the actual business before typing.
3. **Honest documentation.** `docs/known-limitations.md` states what is mocked and what decisions were taken, rather than hiding them. `docs/coverage-checklist.md` marks 20 flows as ◐ (UI built, backend mocked) rather than claiming ✅.

The scenario-injection system (`?mock=sold_out`, `?mock=price_changed`, `?mock=payment_timeout`, …) is unusually valuable: **every error path the backend must produce already has a designed UI waiting for it.** Use the `MockScenario` union in `src/lib/api/client.ts` as the *required error taxonomy* for the backend. If the backend can produce a state the frontend has no scenario for, one of the two is wrong.

---

## 3. Route inventory and backend dependency

| Route | Renders | Backend dependency | Priority |
|---|---|---|---|
| `/` | Homepage, rails, geo currency | `GET /catalog/home`, geo header | P1 |
| `/search` | Filters, ranking, near-match recovery | `GET /catalog/search` | P1 |
| `/activities/[slug]` | ADP — the most important page | `GET /catalog/activities/:slug`, `POST /availability`, `POST /quote` | **P0** |
| `/categories/[slug]`, `/collections/[slug]`, `/attractions/[slug]` | SEO surfaces | `GET /catalog/*` (cacheable, ISR) | P1 |
| `/combos/[slug]` | Tier C packages | `GET /catalog/combos/:slug`, multi-component availability | P1 |
| `/lp/[slug]` + 6 top-level LPs | Programmatic SEO | CMS or static; no runtime backend | P2 |
| `/compare` | Compare tray | Client-only over catalog data | P2 |
| `/cart` | Trip builder, conflict detection, price lock | `POST /cart` (server-side cart), `POST /quote` | **P0** |
| `/checkout` | 4-step, 37KB — largest page in the app | `POST /orders`, `POST /payments/intent`, `POST /quote/revalidate` | **P0** |
| `/booking/confirmation` | Post-payment | `GET /orders/:ref` | **P0** |
| `/booking/[reference]`, `/manage-booking` | Public lookup by ref + phone/email | `POST /bookings/lookup` | P1 |
| `/voucher/[reference]` | Print-ready voucher | `GET /vouchers/:ref` (PDF + web) | **P0** |
| `/account/*` (5 routes) | Dashboard, bookings, saved, profile, referrals | Auth + `GET /me/*` | P1 |
| `/login`, `/signup` | OTP flow UI, **no session** | `POST /auth/otp/request`, `/auth/otp/verify` | P1 |
| `/reviews/[booking]` | Post-activity review | `POST /reviews` | P2 |
| `/concierge`, `/contact` | Tier D lead capture | `POST /leads` | P1 |
| `/support`, `/faq`, legal pages | Static content | None (or CMS) | P3 |
| `/design-system` | Token + state gallery, live event tail | None — **must be blocked in production** | P0 (security) |
| `/maintenance` | Kill switch page | Feature flag | P2 |

---

## 4. Production-ready as-is

These need no backend and should not be touched:

- **Design system** (`components/ui/*`) — tokens, primitives, sheet, tabs, toaster, accordion. Domain-free.
- **Layout** — header, footer, mobile nav, floating WhatsApp.
- **Rendering strategy** — SSR for all indexable pages, `sitemap.ts`, `robots.ts`, structured data. PRD §7 satisfied at the framework level.
- **Error boundaries** — `error.tsx`, `global-error.tsx`, `not-found.tsx`.
- **Illustrated SVG scenes** (`components/ui/scene.tsx`) — swapping to real photography is passing an `http` URL. No component change.
- **Voucher print stylesheet** — `AC-VOU-04` satisfied.
- **WhatsApp context composition** (`lib/whatsapp.ts`) — message building and 25+ placements are correct and complete. Only the *number* and the outbound side are missing.
- **Search relaxation logic** (`lib/search.ts` `RELAXATION_ORDER`) — `AC-SRCH-01` is genuinely implemented, one constraint relaxed at a time with a named reason. This is better than most production OTAs. **Port it to the server verbatim.**

## 5. Mocked — and what each mock is hiding

| # | Mock | File | What it actually hides | Severity |
|---|---|---|---|---|
| M1 | **All prices computed client-side** | `lib/pricing.ts` | A client-computed price is a client-controlled price. Nothing stops a user editing the total before submit | **Critical** |
| M2 | **Availability from a hash** | `lib/availability.ts` | Deterministic `hash(slug:date)`. No supplier, no capacity, no overselling protection | **Critical** |
| M3 | **`submitOrder` returns success** | `lib/api/index.ts` | No order is persisted. No payment. No idempotency. The reference is `hash(phone + item ids)` — **two identical carts from the same phone produce the same reference** | **Critical** |
| M4 | **No auth or session** | `lib/data/bookings.ts` `demoUser` | `/account/*` renders a hardcoded user. Any visitor sees "Rajesh Patel" | **Critical** |
| M5 | **Coupons validated client-side** | `lib/pricing.ts` `applyCoupon` | Three hardcoded coupons, no usage caps, no margin floor, no atomicity | High |
| M6 | **Catalogue is a TypeScript file** | `lib/data/activities.ts` (79KB) | 26 SKUs. No CMS, no admin, no supplier mapping, no publish workflow | High |
| M7 | **Cart in `localStorage`** | `app-provider.tsx` | Not cross-device (`AC-CART-03` fails), not recoverable for abandoned-checkout messaging, not visible to an agent | High |
| M8 | **Analytics `deliver()` is a no-op** | `lib/analytics.ts` | No collector endpoint. Client-only means 20–40% under-report and **CAC becomes unmeasurable** — the metric the business model hinges on | High |
| M9 | **Geo detection via timezone** | `app-provider.tsx` | `Intl...timeZone === "Asia/Dubai"`. A UAE expat travelling, or any VPN, breaks it. Currency is a pricing decision made by a browser setting | Medium |
| M10 | **Vouchers simulated, QR is decorative** | `components/commerce/voucher.tsx` | No PDF generation, no real barcode, no delivery | High |
| M11 | **Cancellation quote hardcodes `free = true`** | `lib/api/index.ts` | Comment says `// MOCK: all demo bookings are within their free window`. Real refund maths does not exist | High |
| M12 | **Reviews, referrals, quote requests** | various | UI complete, submission simulated | Medium |
| M13 | **Deposit split, EMI, TCS** | `lib/pricing.ts` | Constants only (`DEPOSIT_THRESHOLD_INR`, `EMI_THRESHOLD_INR`). No tax lines anywhere. **TCS does not exist in the codebase at all** | High (blocked on B2) |
| M14 | **Ranking weights are a const** | `lib/search.ts` `RANKING_WEIGHTS` | `AC-SRCH-05` requires admin-editable without deploy | Medium |
| M15 | **Supplier reliability is static data** | `lib/types.ts` `Supplier.reliability` | Hardcoded per SKU. No scorecard, no computation from real outcomes | Medium |

### The one that matters most

**M3 + M1 together are the whole risk.** The order reference is derived from `bookingReference(phone + item ids)` — deterministic. A customer who books the same cart twice gets the same reference. There is no idempotency key, no persistence, and the client asserts the price. Everything in §06 (Booking Engine) exists to replace these three lines.

---

## 6. Feature → backend requirement map

Read as: *frontend capability → APIs it needs → entities it needs → events it emits.*

### 6.1 Discovery & catalogue

| Frontend | API | Entities | Events |
|---|---|---|---|
| Homepage rails, geo currency | `GET /catalog/home?currency&geo` | `products`, `collections`, `merchandising_slots` | `page_view` |
| Search + 12 facets + sort | `GET /catalog/search` | `products`, `product_attributes`, `availability_cache` | `search_submitted`, `filter_applied`, `sort_applied` |
| Near-match recovery | Same endpoint, `relaxed` in response | — | `empty_state_shown` |
| Autocomplete | `GET /catalog/suggest?q` | `products` (tsvector) | `search_suggestion_selected` |
| Ranking weights editable | `GET /config/ranking` (cached 5 min) | `settings` | — |
| ADP | `GET /catalog/activities/:slug` | `products`, `variants`, `addons`, `media`, `faqs`, `reviews`, `suppliers` | `activity_viewed` |
| Category / collection / attraction / combo | `GET /catalog/{type}/:slug` | as above + `combos`, `combo_items` | `page_view` |
| Compare | Client-side over catalog | — | `activity_compared` |
| Wishlist | `GET/POST/DELETE /me/saved` | `saved_activities` | `activity_saved` |

### 6.2 Availability & pricing

| Frontend | API | Entities | Events |
|---|---|---|---|
| Date + pax → live availability | `POST /availability/check` | `availability_cache`, `capacity_ledger`, `blackout_dates` | `date_selected` |
| Next 3 available dates | Same response `nextDates[]` | — | — |
| Timeslot picker | Same response `slots[]` | `product_timeslots` | `time_selected` |
| Live price for pax + variant + add-ons | `POST /quotes` → **signed quote** | `price_rules`, `net_rates`, `quotes` | `variant_selected` |
| 20-min price lock | Quote `expiresAt`; `POST /quotes/:id/revalidate` | `quotes` | — |
| Tier D "Request a quote" | `POST /leads` | `leads` | `quote_requested` |

### 6.3 Cart, checkout, payment

| Frontend | API | Entities | Events |
|---|---|---|---|
| Cart persistence cross-device | `GET/PUT /carts/:id` (cookie-bound) | `carts`, `cart_items` | `add_to_cart` |
| Time-conflict detection | Server-side validation on `PUT /carts` | — | — |
| Combo attach suggestion | `GET /carts/:id/upsells` | `combos`, `product_relations` | — |
| Coupon | `POST /carts/:id/coupon` (atomic, margin-checked) | `coupons`, `coupon_redemptions` | `coupon_applied` / `coupon_rejected` |
| Checkout step 1 traveller | `PUT /carts/:id/traveller` | `guests`, `traveller_profiles` | `checkout_started` |
| Checkout step 2 review | `POST /quotes/revalidate` | `quotes`, `tax_lines` | — |
| Step 3 payment | `POST /orders` → `POST /payments/intent` | `orders`, `order_items`, `payments` | `payment_initiated` |
| Deposit 30/70 | `payment_schedules` | `payment_schedules` | — |
| Payment result | **Webhook only** — `POST /webhooks/razorpay` | `payments`, `payment_events` | `payment_completed` / `payment_failed` |
| Confirmation | `GET /orders/:ref` | `orders`, `bookings` | `booking_confirmed` |
| Abandoned checkout | Server timer on `carts.last_activity_at` | `carts`, `consents` | — |

### 6.4 Post-booking

| Frontend | API | Entities | Events |
|---|---|---|---|
| Voucher (web + PDF + offline) | `GET /vouchers/:ref`, `GET /vouchers/:ref.pdf` | `vouchers`, `booking_items` | `voucher_downloaded` |
| Resend voucher | `POST /vouchers/:ref/resend` | `notifications` | `voucher_sent_whatsapp` |
| Public lookup by ref + phone/email | `POST /bookings/lookup` (rate-limited) | `bookings` | — |
| Cancellation quote | `GET /bookings/:ref/cancellation-quote` | `bookings`, `cancellation_policies` | — |
| Cancel | `POST /bookings/:ref/cancel` | `refunds`, `supplier_bookings` | `booking_cancelled` |
| Date change | `POST /bookings/:ref/amend` | `booking_amendments` | `booking_modified` |
| Driver details at T-1 | `GET /bookings/:ref` | `booking_fulfilment` | — |
| Review | `POST /reviews` | `reviews`, `review_moderation` | `review_submitted` |
| Referral | `GET /me/referrals` | `referrals`, `credits` | `referral_clicked` |

### 6.5 Cross-cutting

| Frontend | API | Entities |
|---|---|---|
| Phone OTP login | `POST /auth/otp/request`, `/auth/otp/verify` | `users`, `otp_challenges`, `sessions` |
| Guest→account linking (`AC-ACC-02`) | On verify, match `orders.phone` / `.email` | `orders`, `users` |
| Every WhatsApp CTA | `POST /events` + deep link | `analytics_events`, `wa_conversations` |
| Every analytics call | `POST /events` (batched via `sendBeacon`) | `analytics_events` |
| Currency + geo | Edge geo header → `?currency=` | — |
| Maintenance mode | `GET /config/flags` | `feature_flags` |

---

## 7. Missing backend dependencies the frontend assumes exist

Things the UI presents as real that have no data source anywhere:

| Assumed | Where | Needs |
|---|---|---|
| `bookedThisMonth` counts | Every activity card | Real booking aggregation job |
| `supplier.reliability` (0–100) | Ranking weight input | Supplier scorecard computed from on-time %, rejection rate, review average |
| "X booked in last 24h" | `availability.ts` `recentBookings()` — currently `seeded()` | Real counts, or remove. `docs/known-limitations.md` claims "no invented scarcity" — this line contradicts it |
| Review counts and aggregate ratings | ADP, cards, schema.org | `reviews` with moderation state |
| `compareAt` prices (struck-through) | `PriceBand.compareAt` | A *verifiable* gate price per SKU, with a source and a date. Otherwise it is a legal risk under Indian consumer law, not just a dark pattern |
| Pickup zone coverage | `pickupZones[]`, checkout autocomplete | A real zone table per supplier, and a validation endpoint |
| Driver details | `Booking.driver` | Supplier fulfilment feed or manual ops entry at T-1 |
| Credits balance | `demoUser.credits` | Loyalty ledger (PRD defers to V2 — so **remove from UI** until then) |

---

## 8. Required event tracking (backend obligations)

`lib/analytics.ts` defines 40 event names and a rich `EventProps` shape. The client half is done. The backend owes:

1. **`POST /events`** — accepts the client payload including `event_id`; validates, enriches (server timestamp, IP-derived geo, session, user, attribution), persists to `analytics_events`.
2. **Server-side truth for money events.** `payment_completed`, `booking_confirmed`, `voucher_delivered` must be emitted **by the server on state transition**, never trusted from the client. The client may emit its own for the pixel; dedupe on `event_id`.
3. **Meta CAPI forwarding** with `event_id` dedup (`AC-META-01`).
4. **Offline conversion upload** for Rail B bookings (`AC-META-02`) — without this you systematically under-bid on your best traffic. Requires storing `fbclid`/`fbc`/`fbp` at first touch and carrying it through a WhatsApp conversation to an order.
5. **Attribution model** — first-touch and last-touch stored on the order (`AC-AN-01`).

Full taxonomy in §11.

---

## 9. Risks in the current frontend

| # | Risk | Impact | Fix |
|---|---|---|---|
| R1 | **Client-side price authority** | Fraud; `AC-CO-02` unenforceable | Server quotes (§06). Frontend never sends an amount |
| R2 | **Deterministic order reference from phone + items** | Reference collisions; two real bookings could share one | Server-generated reference from a sequence + checksum |
| R3 | **`/design-system` exposes a live event tail and every internal state** | Information disclosure | Block by env in `middleware.ts` |
| R4 | **`window.__outlyEvents` ring buffer in production** | Minor leakage of user journey to any script on the page | Dev-only guard |
| R5 | **`localStorage` cart, no server copy** | No abandoned-cart recovery — a PRD V1 revenue mechanic (`AC-CO-06`) is impossible | Server cart, cookie-keyed |
| R6 | **Currency chosen by browser timezone** | Wrong-currency pricing; a real revenue/compliance issue | Edge geo header + explicit user override, stored server-side |
| R7 | **No rate limiting anywhere** | Booking-lookup endpoint (`ref` + phone) is a brute-force enumeration target | §13 |
| R8 | **`WHATSAPP_NUMBER` hardcoded to `919000000000`** | Ships a dead CTA if missed | Env var + a startup assertion |
| R9 | **26 SKUs hardcoded in a 79KB `.ts` file** | Every content change is a deploy; ops cannot operate the product (`AC-ADM-*`) | Move to DB, admin-managed |
| R10 | **No timeout budget on any outbound call** | A slow supplier stalls the request until the platform ceiling (60s on Netlify) kills it mid-flight, with money in play | Explicit per-call budgets, §02.5.2 |
| R11 | **Cancellation maths hardcoded `free = true`** | If shipped, refunds are wrong in the customer's favour, silently | Server-side policy engine (§06) |
| R12 | **No idempotency on any mutation** | Double-submit = double booking = double charge | Idempotency keys (§06) |

## 10. Technical debt to accept, not fix now

| Item | Verdict |
|---|---|
| 26 SKUs, not 300 | **Correct.** "Certainty over selection" is a PRD principle and it matches the thin-catalogue/deep-curation strategy. Do not inflate the catalogue with Tier A |
| Light mode only | Correct. Doubling the QA surface for every state is not worth it now |
| Illustrated SVG scenes over photography | Correct for launch; swap the top 10 SKUs by traffic later |
| Canonical `/activities/[slug]` rather than PRD's `/d/[slug]` | Correct and better for SEO. Keep the 301s |
| No component library | Correct — it is why first-load JS is ~102KB against an LCP < 2.5s budget |
| Loyalty UI present but V2 | **Fix now:** remove the credits display. Showing a balance you cannot honour is a trust cost, and trust is the product |

---

## 11. Frontend changes the backend forces

Budget these explicitly — they are not "integration", they are work.

| # | Change | Size |
|---|---|---|
| F1 | `lib/pricing.ts` → display-only; all totals come from a server quote | Medium — touches ADP, cart, checkout |
| F2 | `lib/availability.ts` → thin client over `POST /availability/check` | Small (already the shape) |
| F3 | `lib/search.ts` → move `matches`/`sortActivities`/`relax` to the server; keep the file as the shared contract | Medium |
| F4 | `app-provider.tsx` cart → server-backed with optimistic local mirror | Medium |
| F5 | Auth — real session, guard on `app/account/layout.tsx`, remove `demoUser` | Medium |
| F6 | `lib/data/*` → API responses; keep files as fixtures for tests | Large but mechanical |
| F7 | `analytics.ts` `deliver()` → real collector | Small |
| F8 | Idempotency key generated per checkout attempt and sent on `POST /orders` | Small |
| F9 | Remove credits UI; gate `/design-system`; env-var the WhatsApp number | Small |

**F1 and F6 are the two that need care.** Everything else is a day.
