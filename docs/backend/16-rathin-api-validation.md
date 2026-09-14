# Rathin API — Architecture Validation

**Version:** 1.0 · **Date:** 10 September 2026 · **Status:** Validation of the existing backend blueprint (§00–§15) against the actual Rathin API specification
**Source of truth for this document:** Postman collection **"Rathin API -V2"** (`476c36aa-6061-46e6-8762-45698040d0ca`), read in full on 10 September 2026. Nothing in this document is inferred from any other source.

> **Method note.** Every statement below is either (a) directly observable in the collection, (b) an arithmetic decode of a value in the collection, or (c) explicitly marked **UNKNOWN**. Where a capability is absent from the collection I say "not present in the collection" rather than "does not exist" — absence from a Postman collection is strong evidence but not proof that the supplier lacks the capability. Every such absence is raised as a question in §9.

---

## 0. What was actually reviewed

The workspace contains two collections: **"My Collection"** (the Postman default template — `Get data` / `Post data`, irrelevant) and **"Rathin API -V2"**. There are **no environments defined**, so `{{domain}}`, `{{ClientId}}` and `{{ClientSecret}}` have no values.

**The complete API surface is eight requests.**

| # | Request | Method | Path | Auth mechanism | Example response saved? |
|---|---|---|---|---|---|
| 1 | GetToken | `GET` | `/api/auth/v2/token` | `ClientId` + `ClientSecret` headers | **No** |
| 2 | GetParkAvailablity | `POST` | `/api/park/v2/availability/park` | `Authorization` | **No** |
| 3 | GetTicketTypes | `POST` | `/api/park/v2/common/search/custTicketType` | `Authorization` | Yes — **but from a v1 call** |
| 4 | GetParkTimeSlots | `POST` | `/api/park/v2/timeslot` | `Authorization` + `agencyId` | Yes — **but from a v1 call** |
| 5 | GetTicketPriceDetails (Time & Dated) | `POST` | `/api/park/v2/price` | `Authorization` | Yes — **v2, the only verified v2 response** |
| 6 | GetTicketPriceDetails (Open) | `POST` | `/api/park/v2/price` | `Authorization` | Yes — **but from a v1 call** |
| 7 | CreateBooking (Lead Name) | `POST` | `/api/park/v2/book` | `Authorization` | **No** |
| 8 | CreateBooking (For Each Name) | `POST` | `/api/park/v2/book` | `Authorization` | Yes — **but from a v1 call** |

**Four of eight requests have no saved response at all, and three of the four saved responses were captured against `/v1/` endpoints.** Exactly one response in the collection (#5) is verified against v2.

That includes both `CreateBooking` variants: **the v2 booking response shape is unverified.** It is the single most important response in the integration.

---

## 1. Rathin Capability Report

Classification per the requested scheme. "Not Supported" below means **not present in the collection**.

| Capability | Status | Evidence |
|---|---|---|
| **Authentication** | **Supported** | `GET /api/auth/v2/token`, headers `ClientId` / `ClientSecret`. Test script reads `data.token`, so the response is `{ data: { token } }`. **Token TTL, expiry field and refresh mechanism: UNKNOWN** — no example response saved, no refresh endpoint present. |
| **Inventory retrieval (park list)** | **Partially Supported** | `POST /api/park/v2/availability/park` with body `{"filter":{"logic":"and","filters":[{"field":"status","operator":"eq","value":"Y"}]}}`. **No response example.** The request carries **no date parameter**, so it cannot return date-scoped availability despite its name. Response shape UNKNOWN. |
| **Product retrieval (ticket types)** | **Supported** | `POST /api/park/v2/common/search/custTicketType`, body filters on `parkId`. Returns `id`, `parkId`, `customerType`, `ticketType`, `paxResidenceId`, `ticketTypeId`, `adultTerms`, `childTerms`, `infantTerms`, `adultBookingEnabled`, `childBookingEnabled`, `infantBookingEnabled`. **No descriptions, images, inclusions, or terms beyond the age strings.** |
| **Pricing** | **Supported** | `POST /api/park/v2/price`. Two request shapes: timed (`adultCount`, `childCount`, `infantCount`, `timeSlotId`) and open (`parkId`, `ticketTypeId`, `adultCount`, `childCount`, `infantCount`, `travelDate`). Returns `parkId`, `ticketTypeId`, `travelDate`, `adultFare`, `childFare`, `grandTotal`, `pricingKey`. **No currency field. No `infantFare`. No validity/expiry on `pricingKey`.** |
| **Availability (timed tickets)** | **Partially Supported** | `POST /api/park/v2/timeslot` returns `timeSlots[]` of `{ timeslotId, timeSlot, totalTickets }`. **`totalTickets` semantics UNKNOWN** — every slot in the sample returns exactly `100`, consistent with a configured cap rather than live remaining inventory. |
| **Availability (open tickets)** | **Not Supported** | No endpoint in the collection returns availability for a non-timeslot ticket. `/price` accepts a `travelDate`; whether it fails for an unavailable date is **UNKNOWN**. |
| **Booking creation** | **Supported** | `POST /api/park/v2/book`. Two variants. Lead-name: `{ pricingKey, fullName, email, contactNo }`. Per-pax: adds `bookingPaxDtls[]` of `{ firstName, lastName, dateOfBirth, weight, height, paxTypeId }`. |
| **Booking confirmation timing** | **Supported (synchronous)** | The v1 sample returns `status: "TICKETED"` and per-pax `ticketNo` values in the same response. |
| **Voucher / ticket artifact retrieval** | **Not Supported** | The booking response returns `paxDetails[].ticketNo` as a plain numeric string (e.g. `"68150421"`). **No QR payload, no barcode image, no PDF, no URL, no retrieval endpoint.** |
| **Booking status / retrieval** | **Not Supported** | No endpoint present. There is no way to ask "does booking X exist?" after the fact. |
| **Booking modification** | **Not Supported** | No endpoint present. |
| **Cancellation** | **Not Supported** | No endpoint present. |
| **Refunds** | **Not Supported** | No endpoint present. |
| **Webhooks** | **Not Supported** | Nothing in the collection. |
| **Idempotency** | **Not Supported** | No idempotency header, no client-reference field on `CreateBooking`. **Whether a `pricingKey` can be consumed twice is UNKNOWN and is the highest-value single test to run** (see §9 Q7). |
| **Rate limits** | **Unknown** | Not documented. No `429` example, no rate-limit headers in any saved response. |
| **Error handling** | **Unknown** | Every saved example is HTTP 200 with `errors: null`. **No error response exists anywhere in the collection.** Error codes, error body shape, and HTTP status usage are entirely unknown. |
| **Pagination** | **Unknown** | `GetTicketTypes` returns `total` and `aggregates`, and the filter grammar (`logic`/`filters`/`field`/`operator`/`value`) resembles a Kendo-style DataSource that commonly supports `skip`/`take` — but **no example uses pagination parameters**, so this is unverified. |
| **Timeout behaviour** | **Unknown** | No `responseTime` recorded on any saved example (all `null`). No published SLA. |
| **Environments / sandbox** | **Unknown** | No environment defined; no base URL, no sandbox-vs-production distinction. |

### 1.1 Required vs optional fields (as observable)

**`CreateBooking` — required (present in every example):** `pricingKey`, `fullName`, `email`, `contactNo`.
**`CreateBooking` — conditionally present:** `bookingPaxDtls[]` with `firstName`, `lastName`, `dateOfBirth`, `weight`, `height`, `paxTypeId`.
**Which variant applies to which ticket type: UNKNOWN** — no field in `GetTicketTypes` indicates it.
**`paxTypeId` source: UNKNOWN** — the value `213` appears in the booking request but is returned by no endpoint in the collection. `GetTicketTypes` returns `paxResidenceId` (453) and `ticketTypeId` (734), neither of which is `paxTypeId`.

### 1.2 Known constraints, decoded

Two opaque tokens are plain, unencrypted base64. Decoded:

```
timeslotId  MTE6MDBAUEBGNzhE…  →  11:00@P@F78D4873-B5F9-7441-3449-018570EE86B0@6@646@27-12-2023
                                   timeSlot @ P @ GUID @ parkId @ ticketTypeId @ travelDate

pricingKey  ODJAODQ1QDE3MC4wMEAx…  →  82@845@170.00@1@0@12-07-2024@09:30@T@591953
                                       parkId @ ticketTypeId @ AMOUNT @ adultCount @ childCount
                                       @ travelDate @ timeSlot @ T @ ref

pricingKey (open ticket)  OEA3MzRANzUuMDBAMUAwQDI3LTEyLTIwMjNA  →  8@734@75.00@1@0@27-12-2023@
```

Three constraints follow directly:

1. **`pricingKey` carries the fare in cleartext base64.** Whether Rathin re-validates it server-side against its own record is **UNKNOWN**. This must be tested before go-live (§9 Q8). Our architecture is not exposed — the client never sees a `pricingKey` because §06 issues our own server-signed quote — but the supplier-side risk is real and worth knowing.
2. **`infantCount` is accepted in requests but does not appear in the `pricingKey`** (only `adultCount@childCount`), and **no `infantFare` is returned**. Infant handling is UNKNOWN.
3. **All dates are `DD-MM-YYYY`**, not ISO 8601. `bookingDate` is `DD-MM-YYYY HH:mm:ss`. Timezone is not stated.

### 1.3 Two response-envelope defects that change adapter code

**The `status` boolean is not a reliable success indicator.** `GetTicketTypes` returned HTTP 200, `message: "succcessfylly retrieved the record"`, a fully-populated `data` array — and **`"status": false`**. Other endpoints return `status: true` on success.

**`responseCode` is inconsistent:** `null` (ticket types), `null` (price), `"ST001"` (timeslots), `"S0001"` (booking).

Consequence: the adapter must determine success from **HTTP status + presence of `data` + `errors === null`**, and must never branch on `status` or `responseCode`. This is a concrete, non-negotiable implementation rule.

---

## 2. Compatibility Matrix

| Subsystem | Verdict | Why |
|---|---|---|
| **Supplier abstraction (§02.3)** | **Compatible** | The port-and-adapter design absorbs every finding here without redesign. `capabilities()` already exists to express `supportsCancellation: false`, `supportsBookingLookup: false`. This is the design decision that saves the project — see §7. |
| **Database (§05)** | **Requires Changes** | Schema is structurally sound. Needs: per-pax ticket storage, `pricingKey` on quotes, supplier internal id, and `spots_left` made nullable-by-capability. Detail in §5. |
| **Booking engine — quotes / price integrity (§06.2)** | **Compatible** | Strengthened, in fact. Wrapping Rathin's cleartext `pricingKey` inside our own signed quote is exactly the right containment. |
| **Booking engine — availability (§06.4.2)** | **Requires Changes** | "Hard TTL-0 verification before payment" (`AC-INV-01`) has no clean endpoint. Best available proxy is a `/price` re-fetch. For open tickets there may be no availability signal at all. |
| **Booking engine — idempotency (§06.3 layer 3)** | **Requires Changes** | Layers 1 and 2 (our HTTP idempotency, webhook dedup) are unaffected. Layer 3 (supplier idempotency) cannot be guaranteed. Mitigation depends on §9 Q7. |
| **Booking engine — reconciliation (§06.8)** | **BLOCKED** | The 15-minute sweep calls `SupplierPort.getBooking()`. **That endpoint does not exist.** The sweep as designed is not implementable for Rathin. Must be redesigned — see §6. |
| **Booking engine — rejection saga (§06.6)** | **Requires Changes** | Works for an explicit rejection. Does not work for an ambiguous timeout, because the outcome can never be resolved programmatically. |
| **Cancellation & refund (§06, §07.6)** | **BLOCKED for Rathin SKUs** | No supplier endpoint. Decision **D2 in §00 is now forced, not optional.** |
| **Payments (§07)** | **Compatible** | No direct dependency on supplier capability. But Decision **D1** ("charge, then fulfil") now carries materially more risk, because a failed fulfilment cannot be disambiguated from a successful one. `refunds.supplier_recovery_aed` becomes a manually-entered field. |
| **Voucher pipeline (§02.4.1, §06.5.4)** | **Requires Changes** | "Download the ticket artifact → R2" has nothing to download. `ticket_artifact_key` will be null for every Rathin booking. **How a guest actually enters the park with a bare `ticketNo` is UNKNOWN** (§9 Q5) — this is a customer-facing blocker, not just a schema one. |
| **Agent console (§09)** | **Compatible** | Quote builder works. One caveat: our 20-minute price lock may exceed the `pricingKey`'s unknown validity (§9 Q9). |
| **Admin (§10)** | **Requires Changes** | Needs one new screen: a manual reconciliation queue for Rathin bookings in `unknown` state, since nothing can resolve them automatically. |
| **Analytics (§11)** | **Compatible** | No dependency on supplier capability. |
| **WhatsApp (§08)** | **Compatible** | Except that voucher *content* depends on the artifact question above. |
| **API layer (§12)** | **Requires Changes** | `POST /availability/check` returns `spotsLeft` and a `limited` status. Neither can be populated truthfully for Rathin. Must return `null` / `unknown` rather than fabricate. |
| **Tech stack (§03), architecture (§04), security (§13), deployment (§14)** | **Compatible** | Unaffected. |

---

## 3. Assumption Audit

| # | Architecture assumption | Verdict | Evidence |
|---|---|---|---|
| A1 | Supplier provides real-time availability | **Contradicted (partial)** | `availability/park` has no date parameter. `totalTickets` semantics unknown. Open tickets have no availability endpoint. |
| A2 | Availability re-verified at TTL 0 before payment auth (`AC-INV-01`) | **Not Verifiable** | No dedicated availability check exists. A `/price` re-fetch is the only proxy, and whether it fails on sold-out is unknown. |
| A3 | Net rates syncable on a 6–24h schedule (§02.6.2) | **Contradicted in shape** | There is no rate-card endpoint. Price is a per-`(park, ticketType, date, pax)` query returning a single-use `pricingKey`. It must be fetched per request, not synced. |
| A4 | Instant-confirmation bookings confirm synchronously | **Confirmed** | Booking sample returns `status: "TICKETED"` with ticket numbers in-band. |
| A5 | Supplier returns a scannable ticket artifact we copy to R2 | **Contradicted** | Only `ticketNo` strings. No QR, barcode, PDF or URL. |
| A6 | Self-serve cancellation where terms allow (`AC-BM-01`) | **Contradicted for Rathin** | No cancellation endpoint. |
| A7 | Refunds initiated via supplier API with status tracking | **Contradicted for Rathin** | No refund endpoint. |
| A8 | 20-minute price lock is honourable | **Not Verifiable** | `pricingKey` validity period is not documented and carries no expiry field. |
| A9 | Nightly catalogue sync is possible | **Confirmed** | `availability/park` (list) + `custTicketType` (per park) supports it. |
| A10 | Circuit breaker / outage handling | **Confirmed** | Entirely client-side; unaffected by supplier capability. |
| A11 | `createBooking` accepts an idempotency key (§02 spike Q18) | **Contradicted** | No such field. |
| A12 | `getBooking` exists for reconciliation (§02 spike Q19) | **Contradicted** | No such endpoint. **This is the finding with the largest blast radius.** |
| A13 | All customer-facing content is ours, not the supplier's (§02.4) | **Confirmed** | `custTicketType` returns identifiers and age-terms strings only. |
| A14 | Supplier reliability score computable | **Confirmed (partial)** | We can measure our own call outcomes; we cannot measure post-booking supplier behaviour we can't query. |
| A15 | Two suppliers per Tier B SKU / failover | **Unaffected** | Rathin is Tier A only. |
| A16 | Rathin is a park/attraction-ticket API, not a tours API (§00 Finding 1) | **Confirmed** | Every entity is `park` / `ticketType` / `timeslot`. Nothing supports pickup zones, meal plans, itineraries, or private-vs-shared. |
| A17 | Success detectable from the response envelope | **Contradicted** | `status: false` returned on a successful call. |
| A18 | Prices are in AED | **Not Verifiable** | No currency field anywhere. |

---

## 4. Required Architecture Changes

Only what the API forces. Unaffected systems are untouched.

### C1 — `getBooking` must become an optional capability, and reconciliation must fork on it · **CRITICAL**

- **Current design:** §02.3.2 lists `getBooking(supplierRef)` in the port with the comment "REQUIRED for safety". §06.8 runs a 15-minute sweep that calls it to resolve non-terminal bookings.
- **Problem:** the endpoint does not exist. The sweep cannot run for Rathin, so a booking in `unknown` state has no automated resolution path.
- **API constraint:** no booking retrieval endpoint in the collection.
- **Fix:** move `getBooking` behind `capabilities.supportsBookingLookup`. Where it is `false`, the sweep does not attempt resolution — it **ages the record and escalates it to a human ops queue with the full request payload**, and the duplicate-detection job (§06.7.3) is promoted from a nightly nice-to-have to a **mandatory, and the only, backstop**.
- **Impact:** §02.3.2, §06.8, §10 (new admin screen).
- **Priority: CRITICAL.**

### C2 — Rathin capability flags must drive product behaviour · **CRITICAL**

- **Current design:** `capabilities()` exists and the storefront is supposed to derive behaviour from it.
- **Problem:** the flags were never populated with real values, and three of them are now known to be `false`.
- **Fix:** seed `suppliers.capabilities` for Rathin as: `supportsCancellation: false`, `supportsAmendment: false`, `supportsBookingLookup: false`, `supportsIdempotency: false` (pending §9 Q7), `hasRealtimeCapacity: false` (pending §9 Q4), `instantConfirmation: true`. The storefront must then set `free_cancellation_hours = 0`, hide self-serve cancellation, and state non-refundability **in bold at the point of sale** — which is what the business model requires anyway (*"never offer the customer a softer cancellation policy than your supplier gives you"*).
- **Impact:** §02.3.2, §05 seed data, ADP and checkout copy.
- **Priority: CRITICAL.** This is Decision **D2** from §00, now forced.

### C3 — The voucher pipeline has no supplier artifact · **CRITICAL**

- **Current design:** §02.4.1 — "immediately download the ticket artifact and store it in R2 before the voucher is generated"; `vouchers.ticket_artifact_key`.
- **Problem:** the booking response contains only `ticketNo` strings. There is nothing to download.
- **API constraint:** no artifact, no URL, no retrieval endpoint.
- **Fix:** store `ticketNo` per pax (see §5 D1) and render it on our own voucher. **Whether that is sufficient for park entry is UNKNOWN and is a customer-facing blocker** — see §9 Q5. Do not generate a barcode from `ticketNo` until Rathin confirms the symbology; an unscannable barcode at a park gate is worse than a printed number.
- **Impact:** §02.4.1, §05 `vouchers`, §06.5.4.
- **Priority: CRITICAL.**

### C4 — Response success detection must not use `status` or `responseCode` · **CRITICAL**

- **Problem:** `GetTicketTypes` returns `status: false` on a successful call.
- **Fix:** adapter success rule is `HTTP 2xx && data != null && errors == null`. Encode it once in a shared response-envelope parser. Add a regression test using the exact `status: false` sample from the collection.
- **Priority: CRITICAL** — this would silently break every catalogue sync.

### C5 — Availability model for Rathin must be honest about what it does not know · **HIGH**

- **Current design:** §02.6.2 TTL table with `spotsLeft`, `limited` status, 60-second TTL when `spotsLeft <= 10`.
- **Problem:** `totalTickets` may be a configured cap rather than remaining inventory, and open tickets have no availability call at all.
- **Fix:** until §9 Q4 is answered, Rathin SKUs report `status: available | unavailable` only, with `spotsLeft: null`. No "limited", no "X spots left", no scarcity messaging. `AC-INV-01`'s pre-payment verification is implemented as a **`/price` re-fetch with a fare comparison** — which validates price and, if the call fails on sold-out dates, availability too.
- **Impact:** §02.6.2, §06.4.2, §12 `/availability/check` contract, ADP scarcity UI.
- **Priority: HIGH.** Note this also removes a dark-pattern risk the frontend docs already committed against.

### C6 — Quotes must carry the supplier `pricingKey` and re-fetch before booking · **HIGH**

- **Problem:** `pricingKey` validity is unknown and may be shorter than our 20-minute lock; it is also single-use in a way we cannot verify.
- **Fix:** store `pricingKey` on the quote. At order creation, **re-fetch `/price` and compare `grandTotal`** to the quoted supplier cost. Match → proceed with the fresh key. Mismatch → `PRICE_CHANGED` (already a designed state, `AC-CO-04`). Never book with a key older than the re-fetch.
- **Impact:** §05 `quotes`, §06.5.1 step 5, §06.5.3.
- **Priority: HIGH.**

### C7 — Per-pax booking variant is blocked · **HIGH**

- **Problem:** `paxTypeId` is required but returned by no endpoint; nothing indicates which booking variant a ticket type needs; `weight`/`height` requirements are unknown.
- **Fix:** **launch with lead-name bookings only.** Restrict the published Rathin catalogue to ticket types confirmed to accept the lead-name variant. Add `bookingVariant` and `paxTypeId` to `external_ref` once §9 Q6 is answered.
- **Impact:** catalogue publishing gate, §05 `external_ref`, checkout traveller capture.
- **Priority: HIGH.**

### C8 — Money and date conversion at the adapter boundary · **HIGH**

- **Problem:** Rathin returns decimal fares (`170`, `75`, `1998.0`, `45.00`) with **no currency field**; our schema stores `BIGINT` minor units. Dates are `DD-MM-YYYY` with no timezone.
- **Fix:** one conversion helper in the adapter, unit-tested against every literal fare in the collection. Currency is configured per supplier (`suppliers.capabilities.currency`) pending §9 Q3, **not inferred**. Dates formatted to `DD-MM-YYYY` on the way out and parsed as **Asia/Dubai local** on the way in, pending §9 Q10.
- **Priority: HIGH** — silent 100× money errors live here.

### C9 — Token lifecycle with unknown TTL · **MEDIUM**

- **Fix:** cache the token in Redis; on any `401`, re-authenticate once and retry the original call exactly once. Do not re-authenticate per call (unknown rate limits). Do not guess a TTL.
- **Priority: MEDIUM.**

### C10 — `agencyId` header · **MEDIUM**

- **Problem:** `agencyId: 1` appears only on `GetParkTimeSlots`. Whether it is required elsewhere, and what value is ours, is unknown.
- **Fix:** make it a configured per-supplier header applied to all Rathin calls; confirm the value (§9 Q11).
- **Priority: MEDIUM.**

### C11 — v2 response schemas are unverified · **MEDIUM**

- **Fix:** capture and commit real v2 responses for all eight requests as adapter test fixtures before writing parsing code. **Especially `CreateBooking` v2.**
- **Priority: MEDIUM**, but it gates C1–C8 in practice.

---

## 5. Database Adjustments

Changes only. Everything else in §05 stands.

**D1 — NEW table `booking_tickets`.** Rathin issues one `ticketNo` **per pax**, but `vouchers` is per `order_item`. There is currently nowhere to store them.
```
booking_tickets(
  id, order_item_id → order_items, supplier_booking_id → supplier_bookings,
  pax_index INT, pax_name TEXT, pax_type TEXT,
  ticket_no TEXT NOT NULL, ticket_status TEXT,
  UNIQUE (supplier_booking_id, ticket_no)
)
```

**D2 — `supplier_bookings`, add:** `supplier_internal_id BIGINT` (Rathin's `data.id`, e.g. 595 — distinct from `bookingRefId`), `supplier_status TEXT` (`TICKETED`), `pax_details JSONB` (raw `paxDetails[]`). `supplier_ref` maps to `bookingRefId`.

**D3 — `quotes`, add:** `supplier_pricing_key TEXT`, `supplier_price_fetched_at TIMESTAMPTZ`, `supplier_price_raw JSONB`. Required by C6.

**D4 — `availability_cache`:** `spots_left` becomes explicitly nullable-by-capability. Add `capacity_is_reliable BOOLEAN NOT NULL DEFAULT false`. Rathin rows set it `false` until §9 Q4 is answered.

**D5 — `product_supplier_mappings.external_ref`** — no schema change (it is already JSONB, which is why this is cheap). Document the required Rathin shape: `{ parkId, ticketTypeId }`, plus `{ paxTypeId, bookingVariant, ticketMode: "timed"|"open" }` once known. **The `ticketMode` flag is needed to choose between the two `/price` request shapes.**

**D6 — `suppliers.capabilities`** — no schema change; seed the real values per C2.

**D7 — `vouchers.ticket_artifact_key`** — remains, but will be `NULL` for every Rathin booking. Do not make it `NOT NULL`.

**D8 — traveller capture** — hold `weight` / `height` columns until §9 Q6 confirms they are needed. **Do not add speculatively**; §13 requires collecting only what a supplier genuinely requires.

**D9 — `cancellation_policies`** — seed a `non_refundable` policy with `supplier_terms: {refundPct: 0}` and attach it to every Rathin product.

No relationships are wrong. No tables are removed.

---

## 6. Booking Engine Adjustments

**What stays — and this is most of it.** The four invariants (I1–I4), server-signed quotes, HTTP idempotency, webhook dedup, the capacity ledger with row locks, the order state machine, payment/fulfilment separation, and the rejection saga are all unaffected. The engine's shape was correct.

**B1 — `FULFIL_ORDER` timeout branch (§06.5.3).** For `supportsBookingLookup: false`, a timeout must **not** fall through to "reconciliation will resolve it." It goes directly to `status = 'unknown'` + a P1 ops task carrying the full request payload + the customer message *"confirming with the operator — voucher within 2 hours"* (`AC-VOU-02`, already a designed state). **No automatic retry, ever** — retrying a non-idempotent booking is how you sell the same ticket twice.

**B2 — Reconciliation sweep (§06.8).** Fork on capability. Rathin branch does not call the supplier; it produces an **ageing report** of `unknown` records for human resolution and escalates at a threshold.

**B3 — Duplicate detection is promoted to mandatory.** It moves from "nightly nice-to-have" to the **only** backstop against double-booking. Run it every 15 minutes, not nightly, on `(product, service_date, timeslot, lead_phone)`.

**B4 — Pre-payment verification (§06.5.1 step 5)** becomes a `/price` re-fetch comparing `grandTotal` against the quoted supplier cost (per C6), not a dedicated availability call.

**B5 — Cancellation flow.** `computeRefund` consults `capabilities.supportsCancellation`. For Rathin it returns 0% with the plain-language explanation, and the UI must have stated non-refundability **before** purchase, not at cancellation time.

**B6 — Rejection saga.** Unchanged for explicit rejections. For ambiguous timeouts, the "three options within 2h" (`AC-VOU-03`) can only be offered **after** a human has established with Rathin whether the booking exists — so the 2-hour SLA starts from ops resolution, not from the timeout. Say this in the customer message.

**Verdict: the booking engine will work.** It needs the five changes above, none of which touch its core.

---

## 7. Implementation Readiness

### Platform architecture: **READY WITH CHANGES**

Every finding in this document is absorbed by the supplier port-and-adapter boundary specified in §02.3. Not one finding requires a change to the database's core shape, the payment architecture, the order state machine, the agent console, admin, analytics, or WhatsApp. The changes in §4 are localised and total roughly a week of work.

**The decision that paid off is §02.3.3 — building the `ManualAdapter` first and forcing the port to be genuinely supplier-agnostic rather than Rathin-shaped.** Had the domain model been built around parks, ticket types and timeslots, the discovery that Rathin has no cancellation, no lookup and no ticket artifact would have been a rewrite. Instead it is a capability flag.

### Rathin adapter specifically: **NOT READY**

It cannot be implemented safely today, for reasons that are not fixable by design:

1. **No booking retrieval + no idempotency** means an ambiguous `CreateBooking` timeout is permanently unresolvable by software. This is survivable only with a manual process and a capped exposure.
2. **The v2 booking response shape is unverified** — the only sample is from `/v1/book`.
3. **No base URL, no credentials, no environment.** Nothing can be tested.
4. **No error response exists anywhere in the collection**, so failure handling would be written blind.
5. **Eleven open questions in §9**, of which Q1–Q8 are blocking.

### What this means for sequencing — no re-architecture required

The existing roadmap (§15) already builds the `ManualAdapter` in Phase 1 and defers the real Rathin adapter to Phase 2. **That sequencing is unchanged and now strongly vindicated.** Nothing in Phase 1 is blocked by anything in this document.

The one adjustment: Rathin's Phase 2 work splits into a **read-only stage** (catalogue and price, which are well enough understood to build) and a **transactional stage** (booking), gated behind sandbox validation.

---

## 8. Final Implementation Plan

Only the deltas to §15 are shown. Phases 1, 3, 4, 5, 6 and 7 are unchanged.

### Phase 0 — Unblock *(revised)*
Replace "send Rathin the 22-question spike" with **"get answers to §9 Q1–Q11"**, which are now specific rather than exploratory. Add: obtain base URL, credentials, and a sandbox — **without which the Rathin adapter cannot be built at all**.

### Phase 1 — Core booking engine · **UNCHANGED**
`ManualAdapter` first, `RathinMockAdapter` for the `MockScenario` suite. Nothing here depends on Rathin.
**Add to deliverables:** the shared response-envelope parser (C4) and the money/date conversion helpers (C8), both unit-tested against the literal values in the collection. These can be written now, from the samples, with no credentials.

### Phase 2 — Payments and fulfilment · **UNCHANGED in scope**
Rathin booking is **excluded** from this phase. Capability flags (C2), the reconciliation fork (C1/B2), and the 15-minute duplicate sweep (B3) are built here because they are supplier-agnostic.

### Phase 2a — Rathin read-only integration *(NEW, ≈1 week, parallel to Phase 2)*
| | |
|---|---|
| **Objective** | Rathin catalogue and pricing flowing, with **booking disabled by feature flag** |
| **Dependencies** | Base URL + credentials (Phase 0) |
| **Modules** | `server/suppliers/rathin/{auth,catalogue,pricing}.ts`, response-envelope parser, conversion helpers |
| **Risks** | v2 response shapes differ from the v1 samples → mitigate by capturing real fixtures first (C11) |
| **Acceptance** | Full catalogue sync (parks → ticket types) succeeds · quotes generated for both timed and open tickets · `status: false` regression test passes · every fare in the collection converts to correct minor units |
| **Manual testing** | Compare 10 synced ticket types and 10 live prices against the Rathin portal by hand |
| **Approval gate** | Zero price discrepancies across 20 manual comparisons |

### Phase 2b — Rathin booking validation *(NEW, ≈1 week, gated)*
| | |
|---|---|
| **Objective** | Establish empirically whether Rathin bookings are safe to sell |
| **Dependencies** | Phase 2a; **a sandbox or an agreed budget for disposable live test bookings** |
| **Risks** | If Q7 (pricingKey reuse) fails, there is no idempotency backstop at all |
| **Manual testing — this is the whole phase** | 1. Book once, confirm response shape v2 · 2. **Submit the same `pricingKey` twice — one booking or two?** · 3. Submit a `pricingKey` with a tampered amount — accepted or rejected? · 4. Book a sold-out slot — what error? · 5. Book a past date — what error? · 6. Call with an expired token — status code? · 7. Call `/price` for a fully-booked date — does it fail? · 8. Let a `pricingKey` age 5/20/60 min, then book — when does it stop working? · 9. Fire 20 rapid calls — any rate limiting? · 10. Take a real ticket to a park gate — **does a bare `ticketNo` admit the guest?** |
| **Approval gate** | Q5, Q7 and Q8 answered with evidence · duplicate-detection sweep proven against a deliberately double-booked pair |

### Phase 2c — Rathin go-live *(NEW, gated on 2b)*
Enable booking behind a flag, **capped**: a low daily Rathin booking limit for the first two weeks, monitored daily. Because Tier A is a low-margin cost centre anyway (§00 Finding 1), a cap costs almost nothing and bounds the blast radius of an unresolvable timeout.

**If Q7 shows a `pricingKey` can be consumed twice AND Q5 shows `ticketNo` alone does not admit a guest:** do not launch Rathin self-serve. Sell Rathin inventory through the agent console only, where a human confirms each booking — the volume is low enough that this is viable, and it protects the trust position that is the whole strategy.

### Phases 3–7 · **UNCHANGED**

---

## 9. Questions That Must Be Answered Before Development

**Blocking — Q1–Q8.**

**Q1 — Base URL and credentials.** No environment is defined; `{{domain}}`, `{{ClientId}}`, `{{ClientSecret}}` have no values. **Is there a sandbox/UAT environment?** If not, how do we test a booking without paying for a ticket?

**Q2 — Token lifetime.** What is the TTL of the token from `/api/auth/v2/token`? Does the response carry an expiry field? What is returned when it expires — 401, 403, or a 200 with an error body? Is there a refresh endpoint?

**Q3 — Currency.** `adultFare`, `childFare` and `grandTotal` carry no currency field. **Confirm the currency in writing.** Are fares ever returned in anything other than that currency?

**Q4 — `totalTickets` semantics.** In `GetParkTimeSlots`, is `totalTickets` the **remaining** inventory for that slot, or a configured capacity? Every slot in the sample returns exactly 100. If it is not remaining inventory, **is there any way to know remaining availability?**

**Q5 — Park entry.** The booking response returns `ticketNo` as a plain string (e.g. `"68150421"`). **How does the guest actually enter the park?** Is a QR or barcode issued separately? Does Rathin email a voucher? If we print the number, is it accepted at the gate? If a barcode is expected, what symbology encodes `ticketNo`?

**Q6 — Booking variant and `paxTypeId`.** (a) How do we know whether a ticket type requires the lead-name or the per-pax variant? No field in `GetTicketTypes` indicates it. (b) **Where does `paxTypeId` come from?** The value `213` appears in the request but is returned by no endpoint. (c) Are `weight` and `height` mandatory for all per-pax bookings or only adventure activities?

**Q7 — `pricingKey` reuse.** **If we submit the same `pricingKey` to `/book` twice, do we get one booking or two?** This is the highest-value question in the document. If a key is single-use, it gives us de facto idempotency and materially reduces the double-booking risk. If not, there is no supplier-side protection at all.

**Q8 — `pricingKey` integrity.** The key is plain base64 containing the fare (`82@845@170.00@…`). **Does Rathin validate it server-side against its own record, or is the embedded amount trusted?** We will not expose it to clients either way, but the answer determines how much we trust the booking response.

**Non-blocking but needed before go-live — Q9–Q11.**

**Q9 — `pricingKey` validity window.** How long does a `pricingKey` remain valid? Our price lock is 20 minutes; if the key expires sooner, we must re-fetch before booking (which C6 does regardless, but the window affects agent-console quoting).

**Q10 — Timezone.** All dates are `DD-MM-YYYY`; `bookingDate` is `DD-MM-YYYY HH:mm:ss`. **Which timezone?** Asia/Dubai is the obvious assumption but is not stated, and a one-day error sends customers to a park on the wrong date.

**Q11 — `agencyId` header.** It appears only on `GetParkTimeSlots` with value `1`. Is it required on other endpoints? What value should we send? Is it our account identifier?

**Also required, lower urgency:** rate limits and the response on breach · the error response body shape and code list (no error example exists anywhere in the collection) · whether `GetTicketTypes` supports pagination (`total`/`aggregates` suggest it might) · whether `parkId`/`ticketTypeId` are stable over time · infant pricing (`infantCount` is accepted, no `infantFare` is returned, infants do not appear in the `pricingKey`) · whether Rathin will notify us of breaking API changes · **and, separately from the API: does Rathin's contract permit cancellation or amendment out-of-band, by email or phone?** If it does, cancellation becomes a manual ops process rather than an impossibility — which changes C2 and the customer-facing copy.

**There are blocking questions. Development on the Rathin adapter must not begin until Q1–Q8 are answered.** Phase 1 of the roadmap is unaffected and can start immediately.
