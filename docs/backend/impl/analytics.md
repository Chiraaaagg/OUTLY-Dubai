# Analytics agent — implementation note

Scope: §19 §3 `/api/events`, §19 §5 client wiring, §11 collector/attribution/destinations, §17 §5.3 inquiry-mode events and funnel.

## Files

| File | What |
|---|---|
| `src/lib/analytics.ts` | Client facade: `ANALYTICS_EVENT_NAMES` + derived `AnalyticsEvent`, `track()`, batched delivery, first-party cookies, `getClientContext()` / `ensureClientContext()`, pure helpers `deriveFbc`, `parseAttributionFromUrl`, `mergeAttribution`. |
| `src/components/providers/app-provider.tsx` | One effect: `ensureClientContext()` on mount (cross-cutting, minimal). |
| `src/server/schemas/events.schemas.ts` | Per-event zod schema, `parseEventsBody()` (item-by-item, lenient). |
| `src/app/api/events/route.ts` | POST collector. |
| `src/server/services/analytics.service.ts` | `emit`, `collect` (now forwards), `report`, `funnel`, `inquiryRateByTier`, `sourceBreakdown`; PII scrub extended. |
| `src/server/repositories/analytics.repo.ts` | Owned SQL: `funnel`, `inquiryRateByTier`, `sourceBreakdown`, `reconciliation`, `pendingOfflineConversions`, `countPendingOfflineConversions`, `markOfflineUploaded`. |
| `src/server/analytics/forwarders.ts` | Port + three honest no-op adapters with the implementation plan in the header; `metaEventName()` mapping. |
| `src/server/analytics/offline-conversions.ts` | `pendingOfflineConversions(limit)`, `markUploaded(orderIds)`, `runOfflineConversions()`; PII hashed here; upload is `TODO(meta-offline)`. |
| `src/app/api/jobs/offline-conversions/route.ts` | `requireCron`; logs + returns the pending count. GET and POST. |
| `src/app/api/admin/reports/inquiries/route.ts` | GET, `reports.view`: `inquiryService.metrics` + analytics report. |
| `src/lib/__tests__/analytics.test.ts`, `src/server/schemas/__tests__/events.schemas.test.ts` | 33 tests. |

Verified with `npm run typecheck` and `npm test`. `next build` was not run (per brief).

## Event taxonomy as implemented

`ANALYTICS_EVENT_NAMES` in `src/lib/analytics.ts` is the single list; the server enum is `z.enum(ANALYTICS_EVENT_NAMES)`. The previous 46 names are unchanged. Added for parity with server emits: `inquiry_acknowledged`, `inquiry_first_response`, `inquiry_quoted`, `inquiry_won`, `inquiry_lost`, `inquiry_sla_breached`.

Who emits what:

| Event | Source | Notes |
|---|---|---|
| `page_view`, `landing_page_view`, `activity_viewed`, `search_*`, `filter_applied`, `add_to_cart`, `activity_saved`, `activity_compared`, `inquiry_started`, `inquiry_item_added`, `inquiry_field_error`, `inquiry_whatsapp_alternative`, `whatsapp_initiated`, `error_shown`, ... | client | `track()`. Every payload carries `event`, `event_id`, `ts`, `device_type`, `page_path`, `session_id`, `anon_id`. Page views also carry `traffic_source` / `traffic_medium` / `traffic_campaign` / `landing_page` from the last touch (feeds the source report). |
| `inquiry_submitted` | server (`inquiryService.create`) | Primary site conversion. `valueMinor` = indicative INR total. Maps to Meta `Lead`. The client may fire its own copy for the Pixel; `(event_id, source)` is unique so the two never collide. |
| `inquiry_first_response`, `inquiry_quoted`, `inquiry_negotiating`, `inquiry_payment_pending`, `inquiry_lost` | server (`transition`) | `first_response_seconds` on the first contact. |
| `inquiry_won`, `booking_confirmed` | server (`convertToOrder`) | `booking_confirmed` is the business conversion; `offline_conversion_pending: true`. |
| `inquiry_sla_breached` | server (`sweep`) | |
| `inquiry_acknowledged` | reserved | Not emitted yet — the Notification agent can emit it from `onInquirySubmitted` when the WhatsApp ack is delivered. |

Every row is tagged `environment = APP_ENV`. Reports filter on it; forwarders refuse anything that is not `production`.

## Collector contract — `POST /api/events`

- Body: one event object or an array (max 50). Read via `req.text()` and `JSON.parse`, so `text/plain` and `application/json` both work (sendBeacon sends `application/json` with the Blob the client uses).
- Per event: `event` in taxonomy, `event_id` 1–80 chars, `ts` optional non-negative int, up to 40 further props, each a string (≤ 500), number, boolean or null; keys `^[a-z][a-z0-9_]{0,63}$`.
- Same-origin (`assertSameOrigin`).
- Rate limit: `EVENTS_RATE_LIMIT_PER_HOUR` (default 1000) per **request**, keyed `events:aid:<sha256(anon)[:16]>` → `events:ip:<hashIp>` → `events:anon`.
- Enrichment: `sessionId`/`anonId` from cookies `outlyy_sid`/`outlyy_aid` (payload `session_id`/`anon_id` accepted as fallback, same `^[A-Za-z0-9_-]{8,64}$` shape), `ipHash` (`hashIp`), user agent, `geoCountry(req)`. Client `ts` more than 7 days from server time is discarded (server clock wins for ordering).
- Validation policy: development/staging → 422 envelope with `details.fields` keyed `index.path`. Production → drop bad items, persist the rest, always 204. Unknown names are logged as `analytics.unknown_event` in both modes.
- Response: 204, headers `x-events-accepted`, `x-events-rejected`, `x-events-duplicates`.
- Persist is awaited (the row is the system of record); forwarding is `void`-ed after the write and never awaited.

## Cookies

| Cookie | Lifetime | Content |
|---|---|---|
| `outlyy_sid` | 30 min sliding (refreshed on every `track`/`ensureClientContext`) | session id, `crypto.randomUUID()` |
| `outlyy_aid` | 1 year (refreshed) | anonymous id |
| `outlyy_attr` | 1 year | JSON `Attribution` (below) |
| `_fbp` | read only | Meta Pixel browser id, copied into `Attribution.fbp` when present |

All: `Path=/; SameSite=Lax; Secure` on https; **not** httpOnly (the client must read them for `submitInquiry`). §11.3 said httpOnly; that is incompatible with the client-side context the Inquiry Engine reads, and these ids are not secrets. Deviation recorded.

### Attribution object (flat, ≤ 20 keys)

```
first_source first_medium first_campaign first_term first_content first_referrer first_landing first_touch_at
last_source  last_medium  last_campaign  last_term  last_content  last_referrer  last_landing  last_touch_at
gclid fbclid fbc fbp
```

Rules (`parseAttributionFromUrl` + `mergeAttribution`, unit-tested):
- A "signal" is any `utm_source`, `gclid`, `fbclid`, or an external referrer. No signal on the first visit ⇒ `direct` / `none`.
- First touch is written once. Last touch is replaced on every load that carries a signal. Internal navigation changes nothing.
- Bare `fbclid` ⇒ `facebook` / `paid_social`; bare `gclid` ⇒ `google` / `cpc`; external referrer ⇒ host with `organic` (search engines), `social`, or `referral`.
- `fbc = fb.1.<ms>.<fbclid>` is derived the moment an `fbclid` is seen (§11.4.1). Click ids accumulate across touches.
- Values clipped to 200 chars; referrer stored as origin+path (query stripped); landing is the pathname only.

Deliberately **no** `utm_*` keys in the object: `inquiryService.convertToOrder` reads `utm_source ?? first_source` for first touch and `last_source ?? utm_source` for last touch, so a `utm_*` key would contaminate first-touch with last-touch. With `first_*`/`last_*` only, both sides come out right.

### `getClientContext()`

```ts
getClientContext(): { sessionId?: string; anonId?: string; attribution?: Record<string, unknown> }
```
Reads the cookies (mints them if `outlyy_aid` is missing). Already consumed by `src/lib/api/index.ts` → `submitInquiry` → `POST /api/inquiries` `{ attribution, sessionId, anonId }`.

## Attribution chain inquiry → order

```
ad click (fbclid/gclid/utm on landing URL)
  → AppProvider mount: ensureClientContext() → outlyy_attr (fbc derived, fbp read)
  → submitInquiry(): getClientContext() → POST /api/inquiries { attribution, sessionId, anonId }
  → inquiries.attribution / session_id / anon_id                      (Inquiry Engine)
  → inquiryService.convertToOrder(): order_attribution { first_*, last_*, fbclid, fbc, fbp, gclid }
  → analyticsRepo.pendingOfflineConversions() (uploaded_to_meta_at IS NULL, status paid/confirmed)
  → offline-conversions.ts: hash email/phone → TODO(meta-offline) upload → markUploaded()
```

## Delivery (client)

`track()` → in-memory queue → flush after 2 s, when 20 are queued, on `visibilitychange: hidden`, or on `pagehide`. Batch is posted as a JSON array with `navigator.sendBeacon(NEXT_PUBLIC_ANALYTICS_ENDPOINT, Blob application/json)`; if the beacon is refused (queue full/unsupported) it falls back to `fetch(..., { keepalive: true, credentials: "same-origin" })`. Every step is try/catch. `NEXT_PUBLIC_ANALYTICS_ENDPOINT` unset ⇒ nothing is sent (dataLayer + ring buffer still work).

## What forwards where

Nothing, yet. `forwarders.forward()` runs after every server and client write in production only; each adapter's `enabled()` is credential-gated and `forward()` logs `analytics.<adapter>.not_implemented` once per process. `forwarders.list()` is included in the admin report so the dashboard can show adapter status honestly.

`forwarded_meta` / `forwarded_posthog` / `forwarded_ga4` columns exist and stay `false` until an adapter sets them.

### Meta plan (TODO(meta-capi) in `forwarders.ts`, TODO(meta-offline) in `offline-conversions.ts`)

| Ours | Meta | Rail |
|---|---|---|
| `activity_viewed` | `ViewContent` | CAPI |
| `search_submitted` | `Search` | CAPI |
| `inquiry_item_added`, `add_to_cart` | `AddToCart` | CAPI |
| `inquiry_started`, `checkout_started` | `InitiateCheckout` | CAPI |
| `inquiry_submitted` (server, `value = valueMinor/100`, `currency = INR`) | `Lead` | CAPI |
| `whatsapp_initiated` | `Lead` | CAPI |
| `booking_confirmed` | `Purchase` | **Offline conversions only** — never through CAPI in inquiry mode, or it double counts |

Offline upload: daily job, `upload_tag` per day, `match_keys` = SHA-256 email (lowercased) + SHA-256 phone (digits) + `fbc` + `fbp`, `order_id` = order reference, `event_time` = `paid_at`. Needs a new env var `META_OFFLINE_EVENT_SET_ID` (request below). Mark uploaded only on Meta's 2xx and only the accepted ids.

## Privacy

- `scrubProps()` in the service strips, by normalised key: dietary, accessibility, special requests, notes/message/comments, hotel/pickup/address, any key containing `phone`/`email`/`passport`/`allerg`/`medical`/`password`/`secret`/`token`, name variants, ip/user_agent. Applied to server and client events before the row is written, so nothing downstream can leak them.
- Raw IP never stored (`hashIp`). Rate-limit keys use hashed ids.
- Offline-conversion rows hash email/phone inside `offline-conversions.ts`; the repo DTO is the only place raw contact fields appear and it never leaves the process.
- Referrer query strings are dropped client-side before they reach a cookie.

## Report queries — `analyticsRepo` (for the Admin agent)

All take `{ from: Date; to: Date }` and filter `environment = APP_ENV`. Import from `@/server/repositories/analytics.repo` (Server Components) or go through `analyticsService.*(actor, range)` which adds the `reports.view` check and a ≤ 366-day range guard.

```ts
analyticsRepo.funnel(range): Promise<FunnelReport>
// stages (in order): session, activity_viewed, inquiry_item_added, inquiry_started  — DISTINCT client sessions
//                    inquiry_submitted, contacted, quoted, won                      — inquiries created in range (spam excluded), from inquiries/inquiry_events
// stepRates[key] = stage / previous stage; sessionToInquiry; inquiryToWon

analyticsRepo.inquiryRateByTier(range): Promise<TierRateRow[]>
// { tier, views (distinct sessions with activity_viewed of that tier), inquiries (inquiries with ≥1 item of that tier), won, inquiryRate, winRate }

analyticsRepo.sourceBreakdown(range): Promise<SourceRow[]>
// { source, medium, sessions (distinct sessions by page_view props.traffic_source/medium), inquiries (inquiries.attribution->>'last_source'/'last_medium'), won, inquiryRate, winRate }

analyticsRepo.reconciliation(range, names?): Promise<ReconciliationRow[]>
// AC-AN-02: { event, client, server, delta } for inquiry_submitted + booking_confirmed

analyticsRepo.pendingOfflineConversions(limit), countPendingOfflineConversions(), markOfflineUploaded(orderIds, at?)
```

`GET /api/admin/reports/inquiries?from&to` returns `{ metrics, range, funnel, byTier, sources, reconciliation, forwarders }`.

## Cross-cutting edits

- `src/components/providers/app-provider.tsx`: import + one `useEffect` calling `ensureClientContext()`.

## Requests

- **Inquiry Engine** (`vercel.json`): add `{ "path": "/api/jobs/offline-conversions", "schedule": "30 2 * * *" }` (daily). The route is live and safe to schedule now — it only counts.
- **Inquiry Engine / Backend Architect** (`inquiry.service.ts` `convertToOrder`): pass `firstTouchAt: new Date(attribution.first_touch_at)` and `lastTouchAt: new Date(attribution.last_touch_at)` into `orderService.createOrder(..., attribution)`. The keys are in the cookie already; `order_attribution.first_touch_at/last_touch_at` are currently left null.
- **Backend Architect** (`src/server/lib/env.ts`): `META_OFFLINE_EVENT_SET_ID` (optional) for the offline upload adapter when it is built.
- **Notification agent**: emit `inquiry_acknowledged` via `analyticsService.emit` when the WhatsApp ack is confirmed delivered, so "ack sent" appears in the funnel.

## Open questions

- Rate limit is per request, not per event (a batch of 50 counts once). At 1000/h that is a generous ceiling; if abuse appears, weight by batch size in the route.
- `void forwarders.forward()` after the response can be cut short by the serverless runtime. When any adapter is real, wrap it in Next's `after()` or move forwarding to a job that drains `forwarded_* = false` rows — the columns exist for exactly that.
