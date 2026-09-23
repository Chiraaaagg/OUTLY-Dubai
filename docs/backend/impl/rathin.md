# Future Rathin agent — implementation note and go-live guide

**Status:** Rathin is NOT READY (§16 §7). Nothing in this note performs a live call. The supplier layer exists so that going live is a sequence of small, reversible steps rather than a build.

---

## 1. What was built

| File | Purpose |
|---|---|
| `src/server/suppliers/port.ts` | `SupplierPort` (`capabilities`, `checkAvailability`, `createBooking`, `lookupBooking`, `cancelBooking`), canonical request/result types, `SupplierBookingIntent` (the future `supplier_bookings` row), `SupplierError` (codes = frontend `MockScenario` subset, `toAppError()` renders the §12 envelope), `TIMEOUT_BUDGET_MS` + `withTimeout()`, `idempotencyKeyFor()` / `parseIdempotencyKey()` (`order:<orderId>:item:<itemId>`). |
| `src/server/suppliers/manual/manual.adapter.ts` | `ManualAdapter` for direct/portal suppliers. `checkAvailability` → `unknown`; `createBooking` → `pending_manual` intent (no DB write); lookup/cancel → `not_supported`. Does nothing automatic, on purpose. |
| `src/server/suppliers/rathin/rathin.adapter.ts` | `RathinLiveAdapter` skeleton. Every method throws `NOT_CONFIGURED` without config, `NOT_IMPLEMENTED` with config; each carries a `TODO(rathin):` block quoting the §16 questions it is blocked on. Also exports `RATHIN_CAPABILITIES` (§16 C2 seed values), `RATHIN_ENDPOINTS` (the 8 collection paths), `RathinExternalRef` + `isRathinExternalRef` (§16 D5), `rathinConfigFrom(env)`. |
| `src/server/suppliers/rathin/rathin.codec.ts` | The parts §16 Phase 1 says can be written now with no credentials: `parseRathinEnvelope` (C4 success rule: `2xx && data != null && errors == null`, never `status`), `toRathinDate`/`fromRathinDate` (C8, `DD-MM-YYYY`), `rathinFareToMinor` (C8, integer arithmetic, BigInt fils), `decodePricingKey` (§1.2, logging only). |
| `src/server/suppliers/rathin/rathin.mock.ts` | `RathinMockAdapter`. Availability = `getAvailability()` from `src/lib/availability.ts` on the product slug — identical hash to the ADP. Scenarios `sold_out | timeout | error | price_changed` mirror `?mock=`. Booking reference derived from the idempotency key (same key → same ref). Capabilities are the REAL Rathin flags so engine tests hit the ops-escalation branches. |
| `src/server/suppliers/registry.ts` | `supplierFor(adapterOrRow, env)` → `manual`/`portal` → `ManualAdapter`; `rathin` → mock unless `SUPPLIER_ADAPTER_RATHIN=live` **and** all `RATHIN_*` set → live. `rathinMode(env)` → `mock | live | live_unconfigured` for diagnostics. Unknown adapter → `NOT_CONFIGURED` (value in `details`, not in the message). |
| `src/app/api/catalog/fulfilment-modes/route.ts` | `GET`, public, `{ modes: { [slug]: "inquiry" \| "instant" }, generatedAt }`, `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. |
| `src/server/suppliers/__tests__/{port,registry,rathin.mock,rathin.codec}.test.ts` | 35 tests: budgets, key convention, error envelope, registry selection and gating, manual adapter honesty, mock determinism/parity with the storefront, codec against every literal in the §16 collection (including the `status: false` regression). |

### Contract deviations (recorded per §19 §7)

1. **No file under `src/server/suppliers/**` imports `"server-only"`.** §19 §1 asks for it on every non-domain server file. These modules do no I/O and read no env; the registry takes the env slice as a **parameter** (`supplierFor(selector, env())`) precisely so unit tests can import the adapters and the mock. If a reviewer prefers the directive, add it to `registry.ts` and `rathin.adapter.ts` only, and change the tests to `vi.mock("server-only", () => ({}))`.
2. `SupplierPort` is smaller than §02 §3.2: `getNetRate`, `amendBooking`, `fetchTicket` are omitted. Rathin has no rate card (§16 A3 — price is a per-request `pricingKey`), no amendment (A6), no artifact (A5). They are added when a supplier can implement them; adding a method to an interface with two implementations is cheap.
3. `lookupBooking`/`cancelBooking` return `{ outcome: "not_supported" }` rather than throwing, so the fulfilment service branches on data (§02 §3.2 "product rules are data").
4. `AvailabilityResult.status` adds `"unknown"` to the frontend's four values (§16 C5). The storefront never receives it today; the future `/api/availability` route maps `unknown` to the inquiry CTA, never to a scarcity state.

### Cross-cutting edits

- `src/server/services/catalog.service.ts` `setFulfilmentMode`: the "instant needs an API mapping" check now also requires `supplier.status === "active"` and `supplier.deletedAt` null (one expression, three lines). A paused or terminated Rathin row cannot be the basis for promising instant confirmation. No other service was touched.

---

## 2. Review of the flip and the order path (deliverable 5)

**`catalogService.setFulfilmentMode`** — compatible. Selects `mappings.find(isActive && supplier.source === "api" && adapter !== "manual" && status active)`. Proposed (not made — > 10 lines or judgement calls):

- Prefer the lowest `priority` API mapping when several exist, and record `mappingId` in the audit `after` payload so the flip says *which* supplier it trusted.
- Flipping to `instant` should also require `isRathinExternalRef(mapping.externalRef)` when `adapter === "rathin"` — an empty `{}` ref (which is what `prisma/seed.ts` writes today) cannot be booked. Cheap to add once §16 Q6 fixes the final ref shape.
- `combo → instant` is refused unconditionally; the intended rule is "every component product is instant" — implement when combos can be instant at all.

**`orderService.createOrder`** — compatible. `mappingId` is accepted per item and written to `order_items.mapping_id`; `netCostAed`, `timeslot`, `serviceDate`, `fulfilmentModeSnapshot`, `confirmationSnapshot` are all present, which is everything `BookingRequest` needs. Observations:

- `inquiry.convertToOrder` does not set `mappingId`. That is fine for inquiry-mode items (ops fulfils by hand) and means **mapping selection is the fulfilment service's job**: at fulfilment time, for each item with `fulfilmentModeSnapshot === "instant"`, resolve the active API mapping by `(productId, variantCode)` ordered by `priority`, write it back to `order_items.mapping_id`, then book. Self-serve checkout (future) should resolve it at order creation instead, so the pre-payment availability check and the booking use the same mapping.
- `external_ref` stays opaque: the order path never reads it; only the adapter named by `supplier.adapter` does. Keep it that way.
- The idempotency-key lookup runs outside the transaction; two concurrent identical requests can both miss and both insert. Harmless if `orders.idempotency_key` has a unique index (it should — Database agent to confirm); the second insert then fails and should be caught and re-read.
- `status: idx >= 0 ? "pending" : "pending"` is a leftover tautology; cosmetic.

---

## 3. Where the storefront reads `fulfilment_mode` today vs tomorrow

| Today | Tomorrow |
|---|---|
| `Activity.fulfilmentMode` in `src/lib/data/activities.ts` fixtures (all `inquiry` except where the fixture says otherwise). The CTA conditional (§17 §4.4) reads the fixture. | `GET /api/catalog/fulfilment-modes` (this note §1). The CTA component (or the app provider) fetches once per page view, 60s edge cache, and overrides the fixture value by slug. Fallback on fetch failure: the fixture value — which is the safe (inquiry) value. |

Admin flips through the Admin agent's Products page → `catalogService.setFulfilmentMode` (audited, reason required). The endpoint reflects it within 60s.

**Mixed-cart rule (§17 §8.2 item 6):** a cart containing *any* `inquiry` SKU routes to the inquiry flow. Only a cart that is 100% `instant` un-gates checkout. Instant SKUs keep "Ask on WhatsApp" at equal weight. Combos stay `inquiry` until every component product is `instant`.

---

## 4. Go-live sequence

Every step is reversible and none requires a schema change to what exists today, except the one new table in step 6.

1. **Answer §16 Q1–Q8 in writing** (Q1 sandbox + credentials, Q2 token TTL, Q3 currency, Q4 `totalTickets`, Q5 park entry with a bare `ticketNo`, Q6 booking variant/`paxTypeId`, Q7 `pricingKey` reuse, Q8 `pricingKey` integrity). Q7 and Q5 are decisive: if a key can be consumed twice AND a number alone does not admit a guest, do not launch self-serve — sell Rathin through the agent console only (§16 Phase 2c).
2. **Capture real v2 fixtures** for all eight requests (§16 C11) into `src/server/suppliers/rathin/__fixtures__/` and write parser tests against them before any parsing code. The `/book` v2 response is unverified today.
3. **Set env** (Vercel, production and preview separately): `SUPPLIER_ADAPTER_RATHIN=live`, `RATHIN_BASE_URL`, `RATHIN_CLIENT_ID`, `RATHIN_CLIENT_SECRET`, `RATHIN_AGENCY_ID`, `RATHIN_TIMEOUT_MS` (default 8000; the port's per-operation budgets still apply). `rathinMode(env())` must report `live`; `live_unconfigured` means a variable is missing and every call fails `NOT_CONFIGURED` — it never silently falls back to the mock.
4. **Seed the Rathin supplier row** (Database agent, via seed or migration data): `code=rathin`, `source=api`, `adapter=rathin`, `capabilities=RATHIN_CAPABILITIES` from `rathin.adapter.ts` (update `supportsIdempotency`/`hasRealtimeCapacity` per Q7/Q4 answers), `status=active`. Seed a `non_refundable` cancellation policy and attach it to every Rathin product (§16 D9). Note `prisma/seed.ts` today maps the fixture supplier `rayna` (source `api`) to `adapter: "manual"` on purpose; leave that until the real row exists.
5. **Add `product_supplier_mappings`** for the Tier A SKUs to launch, `external_ref = { parkId, ticketTypeId, ticketMode: "timed" | "open" }` (+ `paxTypeId`, `bookingVariant` once Q6 is answered), `priority=1`, `is_active=true`. Launch with lead-name bookings only (§16 C7).
6. **Implement the four adapter methods** in `rathin.adapter.ts`, replacing the `NOT_IMPLEMENTED` throws, using only `rathin.codec.ts` for envelope/date/money. Rules that are not optional: success from `parseRathinEnvelope`; token cached and re-fetched once on 401 (C9); `createBooking` = `/price` re-fetch → compare `grandTotal` via `rathinFareToMinor` to `expectedNetCostAedMinor` → `SupplierError("price_changed")` on mismatch → `/book` with the fresh key, `withTimeout(…, TIMEOUT_BUDGET_MS.createBooking)`, **once, no retry**; timeout → return `status: "unknown"` with the full request payload. `lookupBooking`/`cancelBooking` stay `not_supported` unless Rathin ships endpoints.
7. **Wire the FUTURE `fulfilment.service`** (`src/server/services/fulfilment.service.ts`, Backend Architect / next agent). Shape:
   - Trigger: order transitions to `paid` (manual payment today, gateway webhook later).
   - For each `order_item`: resolve mapping (§2 above); `port = supplierFor(mapping.supplier, env())`; `key = idempotencyKeyFor(orderId, itemId)`.
   - Insert `supplier_bookings` row (**new table** — Database agent; columns per §16 D2: `id, order_id, order_item_id, supplier_id, mapping_id, idempotency_key UNIQUE, status, supplier_ref, supplier_internal_id, supplier_status, tickets JSONB, request_payload JSONB, raw_response JSONB, created_at, resolved_at`) in state `pending` **before** calling the adapter, keyed on `idempotency_key`; a unique violation means the item was already attempted — read, do not re-book.
   - `res = await port.createBooking(req)` → `confirmed`: item → `confirmed`, persist tickets, order → `confirmed` when all items are; `pending_manual`: item stays `pending`, order → `supplier_pending`, notify customer (AC-VOU-02), open ops task with 2h SLA; `rejected`: rejection saga (§02 §7.3). `SupplierError("timeout")` with `supportsBookingLookup=false`: row → `unknown`, P1 ops task with `request_payload`, customer message per §16 B1/B6 — **no retry**.
   - Reconciliation sweep (`/api/jobs/…`): fork on `capabilities().supportsBookingLookup`; for `false`, produce an ageing report of `unknown` rows and escalate — never call the adapter. Duplicate-detection every 15 min on `(product, service_date, timeslot, lead_phone)` (§16 B3).
   - Combos are all-or-nothing across components (§02 §6.4).
8. **Flip ONE Tier A SKU** via the admin Products page (`setFulfilmentMode` → `instant`, with a reason). Rathin volume capped by a low daily limit for two weeks (§16 Phase 2c).
9. **Monitor for a week:** price-mismatch rate, `unknown` bookings, voucher latency, `SupplierError` counts by code. Then widen one SKU at a time.
10. **Rollback** = flip the SKU back to `inquiry`. The edge cache on `/api/catalog/fulfilment-modes` clears within 60s (+300s SWR). No deploy, no migration, no data loss — orders already created keep their snapshots.

### Files that change at go-live

- `src/server/suppliers/rathin/rathin.adapter.ts` (method bodies), `rathin.codec.ts` (only if v2 fixtures disagree with v1 samples), new `__fixtures__/`.
- `src/server/services/fulfilment.service.ts` (new), a `/api/jobs/fulfilment-*` route + `vercel.json` cron, admin reconciliation queue screen (§16 §2 "Admin").
- `prisma/schema.prisma` + migration: `supplier_bookings` (and `booking_tickets` if per-pax storage is wanted, §16 D1) — Database agent only.
- `prisma/seed.ts`: the Rathin supplier row and mappings.
- Storefront CTA/app provider: read `/api/catalog/fulfilment-modes`.
- `.env` in Vercel.

### Files that must NOT change

- `src/server/suppliers/port.ts` (other than *adding* optional methods), `manual/manual.adapter.ts`, `registry.ts` selection rules.
- `src/server/services/order.service.ts` — the single order path (§17 §6.5 item 3). Fulfilment is a *consumer* of orders, never a second creator.
- `src/server/services/inquiry.service.ts` `convertToOrder` — inquiries convert exactly as today.
- `src/lib/types.ts` `FulfilmentMode` and the per-SKU rule. No site-wide flag, ever (§19 §0).
- `src/lib/availability.ts` — the mock stays the storefront's SSR/CSR availability until the live `/api/availability` route exists; then the ADP calls the route and the mock adapter keeps using this file for tests.

---

## 5. Requests to other agents

- **Database:** (a) confirm a unique index on `orders.idempotency_key`; (b) when fulfilment is scheduled, add `supplier_bookings` per §4 step 7 (and optionally `booking_tickets`); (c) `suppliers.capabilities` seed for Rathin = `RATHIN_CAPABILITIES`.
- **Admin:** the Products page flip already calls `setFulfilmentMode`; consider surfacing `rathinMode(env())` and the selected mapping on the product row so ops can see *why* a flip is refused.
- **Backend Architect:** `/api/health` could include `supplier: { rathin: rathinMode(env()) }` — it is secret-free.
- **Frontend (Inquiry agent, later):** when wiring the CTA to `/api/catalog/fulfilment-modes`, treat a fetch failure as `inquiry`.

## 6. Open questions

- Should `portal` suppliers get their own adapter before V1+ (Farah/Emaar semi-manual)? Today they resolve to `ManualAdapter`, which is correct but loses nothing.
- `RATHIN_TIMEOUT_MS` (env, 8s) vs the port budgets (2.5s browse / 45s booking): proposal is that the env value is the *HTTP* timeout for reads and the port budget wraps the whole operation; the booking call gets its own 45s regardless of env. Decide when the live adapter is written.
