# Phase 13 — API Design

---

## 1. Conventions

**Base:** `/api` (same origin as the app — no CORS needed for first-party).
**Format:** JSON. `camelCase`. Money as integer **minor units** with an explicit currency; the presentation layer converts once.
**Versioning:** none at launch — single known consumer, same repo, deployed together. If a public/partner API appears (B2B, PRD R4), it gets `/api/v1/partner/**` with its own contract.

### Error shape

Every error returns the same envelope, and `code` is drawn from the frontend's existing `MockScenario` taxonomy plus domain codes, so each error already has designed UI and recovery copy:

```json
{
  "error": {
    "code": "SOLD_OUT",
    "message": "No availability for the selected date",
    "recovery": "That date has just sold out. Here are the next available dates.",
    "retryable": false,
    "details": { "nextDates": ["2026-09-15", "2026-09-16", "2026-09-18"] }
  }
}
```

| HTTP | Used for |
|---|---|
| 400 | Malformed request |
| 401 / 403 | Unauthenticated / unauthorised |
| 404 | Not found |
| 409 | Conflict — `SOLD_OUT`, `PRICE_CHANGED`, `QUOTE_EXPIRED`, `REQUEST_IN_PROGRESS` |
| 422 | Validation failed (field-level `details`), or `IDEMPOTENCY_KEY_REUSED` |
| 429 | Rate limited (`Retry-After` header) |
| 502 / 504 | Supplier error / timeout |

### Headers

| Header | When |
|---|---|
| `Idempotency-Key` | **Required** on every money-mutating POST |
| `X-Session-Id` | All client requests (analytics correlation) |
| `X-Currency` | `INR` \| `AED` — overrides geo default |
| `Authorization: Bearer` | Authenticated customer endpoints (or httpOnly cookie) |

---

## 2. Auth

| Method | Endpoint | Auth | Rate limit | Notes |
|---|---|---|---|---|
| POST | `/auth/otp/request` | — | 3/phone/15min, 10/IP/hour | `{ phone }` → `{ challengeId, expiresIn }`. Never reveals whether the account exists |
| POST | `/auth/otp/verify` | — | 5/challenge | `{ challengeId, code }` → sets httpOnly cookies. **Links guest orders by phone/email** (`AC-ACC-02`) |
| POST | `/auth/refresh` | refresh cookie | 60/hour | Rotates the refresh token |
| POST | `/auth/logout` | session | — | Revokes session |
| GET | `/auth/me` | session | — | Current user + permissions |
| POST | `/admin/auth/login` | — | 5/email/15min | Email + password → TOTP challenge |
| POST | `/admin/auth/totp` | partial | 5/challenge | Completes login (`AC-SEC-02`) |

OTP: 6 digits, 5-minute TTL, hashed in Redis, max 5 attempts, single-use, and a constant-time compare. Never log the code.

---

## 3. Catalogue

All GET, all cacheable, all public.

| Method | Endpoint | Cache | Returns |
|---|---|---|---|
| GET | `/catalog/home?currency&geo` | ISR 60s | Rails, quick-intent chips, seasonal module. Enforces `AC-HP-05` (no Tier A in hero positions 1–8) |
| GET | `/catalog/search` | 60s per filter-set | See below |
| GET | `/catalog/suggest?q&limit` | 300s | Autocomplete |
| GET | `/catalog/activities/:slug` | ISR 60s | Full product incl. variants, add-ons, media, itinerary, FAQs, published reviews, related, combos |
| GET | `/catalog/categories/:slug` | ISR 300s | Category + curated SKUs + FAQs |
| GET | `/catalog/collections/:slug` | ISR 300s | Editorial collection |
| GET | `/catalog/attractions/:slug` | ISR 300s | Attraction hub |
| GET | `/catalog/combos/:slug` | ISR 60s | Combo + components + verified `separatePrice` |
| GET | `/catalog/activities/:slug/reviews` | 300s | Paginated, filterable by traveller type and rating |
| GET | `/config/ranking` | 300s | Admin-editable weights (`AC-SRCH-05`) |
| GET | `/config/flags` | 60s | Feature flags |

### `GET /catalog/search`

Query params mirror `SearchFilters` in `src/lib/types.ts` exactly: `q, category, date, when, minPrice, maxPrice, dietary[], suitability[], privateOnly, pickup, instant, freeCancellation, duration, rating, sort, page`.

```json
{
  "activities": [ /* card projections, not full products */ ],
  "total": 12,
  "page": 1,
  "pageSize": 12,
  "appliedFilters": { },
  "relaxed": {
    "message": "No Jain options for 12 Nov — showing 4 pure-veg options",
    "activities": [ ]
  }
}
```

`relaxed` is populated **only** when the exact filter set returns zero (`AC-SRCH-01`). The relaxation ordering and the human-readable messages are ported verbatim from `src/lib/search.ts` — do not rewrite them, they are good.

Target: p75 under 800ms (`AC-SRCH-03`).

---

## 4. Availability and pricing

| Method | Endpoint | Auth | Rate limit | Notes |
|---|---|---|---|---|
| POST | `/availability/check` | — | 60/min/session | `{ productId, comboId?, dates[], pax }` → status, `spotsLeft`, `slots[]`, `nextDates[]`, `checkedAt`. p75 < 1.5s (`AC-ADP-01`) |
| POST | `/availability/calendar` | — | 20/min | 60-day availability strip for the date picker |
| POST | `/quotes` | — | 60/min | **Creates a server-signed quote.** See §06.2 |
| POST | `/quotes/revalidate` | — | 60/min | `{ quoteIds[] }` → `{ changed, oldTotal, newTotal, reason, newQuoteIds }` (`AC-CO-04`) |
| POST | `/pickup/validate` | — | 30/min | `{ productId, hotelOrArea }` → covered / not covered + alternatives |

`checkedAt` is returned on every availability response so the UI can show *"as of 18:42"* when serving stale cache (PRD §15 permits this explicitly).

---

## 5. Cart

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| GET | `/carts/current` | session or anon cookie | Creates on first call |
| POST | `/carts/current/items` | | `{ quoteId }` — a cart item **is** a quote reference |
| PATCH | `/carts/current/items/:id` | | Re-quotes on any change |
| DELETE | `/carts/current/items/:id` | | |
| POST | `/carts/current/coupon` | | Atomic validation incl. margin floor (`AC-CPN-01`) |
| DELETE | `/carts/current/coupon` | | |
| PUT | `/carts/current/traveller` | | Partial checkout state, enables recovery |
| GET | `/carts/current/conflicts` | | Time-overlap detection (`AC-CART-01`) |
| GET | `/carts/current/upsells` | | Combo and ancillary attach (`AC-CART-02`) |
| POST | `/carts/merge` | session | Merges the guest cart on login |

Persistence: 30 days logged-in across devices (`AC-CART-03`), 7 days for guests.

---

## 6. Orders and payments

| Method | Endpoint | Auth | Idem | Notes |
|---|---|---|---|---|
| POST | `/orders` | optional (guest OK, `AC-CO-01`) | **required** | Full flow in §06.5.1 |
| GET | `/orders/:reference` | owner or lookup token | | Polled by the confirmation page |
| POST | `/payments/intent` | order owner | required | Creates the gateway order |
| POST | `/payments/retry` | order owner | required | New attempt, same order (`AC-CO-03`) |
| POST | `/webhooks/razorpay` | HMAC | — | §07.5. Persist, 200, enqueue |
| POST | `/webhooks/<uae-gateway>` | provider | — | V1 |
| GET | `/payments/:orderRef/status` | owner | | Redirect-page polling |

**`POST /orders` never accepts an amount.** Request body: `{ cartId, quoteIds[], traveller, paymentMode, consents, attribution }`. The server derives the total from the quotes.

---

## 7. Bookings

| Method | Endpoint | Auth | Rate limit | Notes |
|---|---|---|---|---|
| POST | `/bookings/lookup` | — | **5/IP/15min** | `{ reference, phoneOrEmail }`. Rate limit is a security control (§13) |
| GET | `/bookings/:reference` | owner or lookup token | | Full detail; driver contact inside 48h (`AC-BM-03`) |
| GET | `/bookings/:reference/cancellation-quote` | owner | | Exact refund and credit date **before** confirming (`AC-BM-01`) |
| POST | `/bookings/:reference/cancel` | owner | required | Recomputes server-side; refunds immediately (§07.6.2) |
| GET | `/bookings/:reference/amend-options` | owner | | Available dates + fee |
| POST | `/bookings/:reference/amend` | owner | required | |
| GET | `/vouchers/:reference` | owner or token | | JSON for the web voucher |
| GET | `/vouchers/:reference.pdf` | signed URL | | R2, offline-cacheable (`AC-MOB-02`) |
| POST | `/vouchers/:reference/resend` | owner | | 3/hour. `{ channel }` |
| POST | `/bookings/:reference/calendar.ics` | owner | | Currently a dead button in the UI |

---

## 8. Customer account

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/me` | Profile, segment, credits, preferences |
| PATCH | `/me` | |
| GET | `/me/trips?status=upcoming\|past` | **Grouped by trip, not by order** — matches the UI |
| GET | `/me/saved` · POST · DELETE `/me/saved/:productId` | Wishlist |
| POST | `/me/saved/share` | Shareable link (`AC-WL-02`) |
| GET | `/me/travellers` · POST · PATCH · DELETE | Saved traveller profiles |
| GET | `/me/referrals` | Invited, booked, earned, pending |
| GET | `/me/credits` | Ledger sum, unexpired |
| GET | `/me/reviews` | |
| PUT | `/me/preferences` | Per-channel consent; effective within 60s (`AC-WA-03`) |
| POST | `/me/export` | Data export (`AC-ACC-03`) |
| POST | `/me/delete` | Deletion request → anonymisation flow (§05.8) |

---

## 9. Reviews, support, leads

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/reviews` | booking reference | Verified bookings only (`AC-REV-01`); enters moderation |
| POST | `/reviews/:id/photos` | | Presigned R2 upload |
| POST | `/reviews/:id/helpful` | — | Rate-limited |
| POST | `/leads` | — | Concierge, quote request, contact. 5/IP/hour |
| POST | `/support/tickets` | optional | |
| POST | `/wa/intents` | — | Context ref for the WhatsApp deep link (§08.5.1) |
| POST | `/events` | — | Analytics collector, 1000/hour/anon |

---

## 10. Admin and agent

All under `/api/admin/**` and `/api/agent/**`. Every endpoint: `withAuth(permission)` + `withAudit(action)`, and `withIdempotency` where money moves. Permission names in §09.4; agent endpoints listed in §09.6.

Admin groups: `orders`, `products`, `pricing`, `inventory`, `suppliers`, `customers`, `reviews`, `coupons`, `content`, `reports`, `settings`, `users`, `audit`.

Representative, to show the shape:

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/admin/orders?q&status&supplier&rail&from&to` | `orders.view_all` |
| POST | `/admin/orders/:ref/refund` | `refunds.initiate` |
| POST | `/admin/orders/:ref/force-confirm` | `inventory.force` |
| PATCH | `/admin/products/:id` | `products.edit` |
| POST | `/admin/products/:id/publish` | `products.publish` |
| PUT | `/admin/pricing/products/:id` | `pricing.edit` |
| POST | `/admin/pricing/bulk` | `pricing.edit` |
| PUT | `/admin/settings/ranking` | `settings.edit` |
| GET | `/admin/inventory/pending-confirmations` | `orders.view_all` |
| POST | `/admin/reviews/:id/moderate` | `reviews.moderate` |
| GET | `/admin/reports/unit-economics?from&to` | `reports.financial` |
| GET | `/admin/audit?actor&entity&from&to` | `audit.view` |

---

## 11. Jobs

Not public. `withQStashSignature()` only.

`POST /api/jobs/{fulfil-order, generate-voucher, send-notification, process-payment-event, process-wa-inbound, sync-catalogue, warm-availability, reconcile-supplier-bookings, reconcile-payments, abandoned-cart, pre-trip-sequence, review-request, in-trip-upsell, send-meta-capi, upload-offline-conversions, compute-supplier-scores, compute-ltv, aggregate-metrics}`

---

## 12. Rate limits

| Group | Limit | Key |
|---|---|---|
| `/auth/otp/request` | 3 / 15 min | phone |
| `/auth/otp/request` | 10 / hour | IP |
| `/auth/otp/verify` | 5 | challenge |
| `/admin/auth/login` | 5 / 15 min | email |
| **`/bookings/lookup`** | **5 / 15 min** | IP |
| `/orders` | 10 / hour | session |
| `/quotes` | 60 / min | session |
| `/availability/*` | 60 / min | session |
| `/catalog/*` | 300 / min | IP |
| `/leads`, `/reviews` | 5 / hour | IP |
| `/events` | 1000 / hour | anon id |
| Global fallback | 600 / min | IP |

Implemented with `@upstash/ratelimit` (sliding window) in `middleware.ts` plus per-route overrides. `429` always carries `Retry-After`.

**`/bookings/lookup` deserves its tight limit**: reference + phone is a small keyspace and the endpoint returns PII. This is the most likely target in the whole API.

---

## 13. Validation

Zod schemas per endpoint, colocated in `server/schemas/`, **derived from `src/lib/types.ts` where possible** so the contract has one definition.

Universal rules: reject unknown properties; normalise phones to E.164 before validation; dates as `YYYY-MM-DD` interpreted in **Asia/Dubai**; pax counts 0–20 per type with a total cap; free text length-capped and stripped of control characters; never echo raw user input into an error message.

---

## 14. Performance targets (PRD §15)

| Endpoint | Target p75 | AC |
|---|---|---|
| `/catalog/*` (cached) | < 200ms | |
| `/catalog/search` | < 800ms | `AC-SRCH-03` |
| `/availability/check` | < 1.5s | `AC-ADP-01` |
| `/quotes` | < 500ms | |
| `/orders` | < 3s | includes hard availability re-check |
| `/webhooks/*` | **< 1s** | provider timeout safety |
| Voucher generation | < 10s | |
| Voucher to WhatsApp | **< 60s p95** | `AC-VOU-01` |
