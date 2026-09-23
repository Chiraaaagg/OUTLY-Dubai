# Inquiry Engine — implementation note

**Agent:** Inquiry Engine · **Scope:** §19 §3 rows for `/api/inquiries/*`, `/api/agent/*`, `/api/jobs/inquiry-sweep`; domain unit tests; storefront wiring of `submitInquiry`; review of `inquiry.service.ts`.
**Verification:** `npm run typecheck` was clean against the tree as of my last edit. On the final re-run, errors exist only in other agents' concurrently-landed files — `src/app/admin/**`, `src/server/schemas/events.schemas.ts`, `src/server/suppliers/__tests__/*` — none in files owned or edited here. `npm test`: my 5 new files / 70 tests pass (suite total at final run: 10 files / 105 tests, all passing). `next build` deliberately not run (shared `.next`).

---

## 1. What was built

### Routes

Every route: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, wrapped in `handle()`, zod `.strict()` body/query/params, `authService.requireRequest(req, permission)` on agent routes, `assertSameOrigin(req)` on every mutation, exactly one service call.

| Method | Path | Auth | Service call | File |
|---|---|---|---|---|
| POST | `/api/inquiries` | public + same-origin | `inquiryService.create(body, {ip, userAgent})` → 201 `CreateInquiryResult` | `src/app/api/inquiries/route.ts` |
| POST | `/api/inquiries/lookup` | public + same-origin, **5/IP/15 min** (`LOOKUP_RATE_LIMIT_PER_IP`, `LOOKUP_RATE_LIMIT_WINDOW_SECONDS`) | `inquiryService.lookupForCustomer(reference, phone, countryCode)` → customer view; 404 on any mismatch | `src/app/api/inquiries/lookup/route.ts` |
| GET | `/api/agent/inquiries` | `inquiries.view_own` | `list(actor, filters)` | `src/app/api/agent/inquiries/route.ts` |
| GET | `/api/agent/inquiries/counts` | `inquiries.view_own` | `queueCounts(actor)` | `.../inquiries/counts/route.ts` |
| GET | `/api/agent/inquiries/:id` | `inquiries.view_own` (own-vs-all inside service) | `get(actor, id)` | `.../inquiries/[id]/route.ts` |
| POST | `/api/agent/inquiries/:id/claim` | `inquiries.claim` | `claim(actor, id)` | `.../[id]/claim/route.ts` |
| POST | `/api/agent/inquiries/:id/assign` | `inquiries.assign` | `assign(actor, id, agentId, reason)` | `.../[id]/assign/route.ts` |
| POST | `/api/agent/inquiries/:id/status` | `inquiries.update` | `transition(actor, id, to, {reason, note})` | `.../[id]/status/route.ts` |
| POST | `/api/agent/inquiries/:id/notes` | `inquiries.update` | `addNote(actor, id, note)` | `.../[id]/notes/route.ts` |
| POST | `/api/agent/inquiries/:id/contact` | `inquiries.update` | `logContact(actor, id, note)` | `.../[id]/contact/route.ts` |
| PATCH | `/api/agent/inquiries/:id/items/:itemId` | `inquiries.update` | `updateItem(...)` → `{ inquiry, toleranceExceeded, tolerancePercent }` | `.../[id]/items/[itemId]/route.ts` |
| POST | `/api/agent/inquiries/:id/spam` | `inquiries.mark_spam` | `markSpam(actor, id, {reason, suppress})` | `.../[id]/spam/route.ts` |
| POST | `/api/agent/inquiries/:id/convert` | `inquiries.convert` | `convertToOrder(actor, id, body)` → 201 `{ inquiry, order }` | `.../[id]/convert/route.ts` |
| POST | `/api/agent/notifications/:id/resend` | `notifications.resend` | `notificationService.resend(actor, id)` | `src/app/api/agent/notifications/[id]/resend/route.ts` |
| GET | `/api/agent/agents` | `inquiries.view_own` | `inquiryService.listAgents(actor)` → `{ agents: [...] }` | `src/app/api/agent/agents/route.ts` |
| GET / POST | `/api/jobs/inquiry-sweep` | `requireCron(req)` | `inquiryService.sweep()` → `{ ok, breached, followups, autoLost, notificationRetries, ranAt }` | `src/app/api/jobs/inquiry-sweep/route.ts` |

`vercel.json` — `{"crons":[{"path":"/api/jobs/inquiry-sweep","schedule":"*/5 * * * *"}]}`. Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`; POST accepts the same secret (or `x-cron-secret`) for manual runs. `maxDuration = 60`.

### Schemas — `src/server/schemas/inquiry.schemas.ts` (new, owned here)

`createInquirySchema` (mirrors `SubmitInquiryInput` + `travelDateTo`, `attribution`, `sessionId`, `anonId`), `lookupInquirySchema`, `listInquiriesQuerySchema` (`?status=a,b` and `?status=a&status=b` both accepted; `page`/`pageSize` coerced, pageSize ≤ 100), `assignInquirySchema`, `transitionInquirySchema`, `addNoteSchema`, `logContactSchema`, `updateItemSchema` (refuses an empty patch), `markSpamSchema`, `convertInquirySchema`, `idParamSchema`, `itemParamSchema`, `cartItemSchema`, `paxSchema`.

Notable choices:
- **Public `source` is restricted** to `inquiry_form | quote_request | contact_form | concierge | abandoned_cart`. `whatsapp` and `agent_created` cannot be claimed by a browser.
- `attribution` is a flat record: ≤ 30 keys, keys ≤ 64 chars, scalar values (string ≤ 512). The Analytics agent's `Attribution` type (flat `first_*`/`last_*`/`gclid`/`fbclid`/`fbc`/`fbp`, ≤ 20 keys, strings ≤ 200) fits inside this with margin.
- `items` allows 0..12 — `quote_request` (Tier D) may arrive without cart items.
- Length caps equal the service's `cleanText` caps (name 120, hotel 200, notes 1000, note 2000, availability note 500) so nothing is silently truncated after passing validation.
- UUID params are checked with a regex (versions 1–8, RFC variant) before the database is touched.

### Frontend wiring — `src/lib/api/index.ts`

- `submitInquiry` POSTs to `/api/inquiries` when `currentScenario() === "ok"`; every `?mock=` scenario still runs the in-browser mirror, so `/design-system` states are unchanged.
- Adds `attribution`, `sessionId`, `anonId` from `getClientContext()` (`src/lib/analytics.ts`). Imported defensively (`import * as analytics`, `typeof fn === "function"` guard) so this file compiles and runs whether or not the export is present. **The export has landed** — no stub was needed and none was added.
- Envelope → `ApiError` mapping (`apiErrorFromEnvelope`): unknown code ⇒ `"error"`; `RATE_LIMITED` ⇒ message from `recovery`, retryable; `VALIDATION_FAILED` ⇒ recovery is the field messages joined; `NOT_FOUND` ⇒ the lookup-oriented recovery text; network failure ⇒ `"offline"`; 15 s abort ⇒ `"timeout"`.
- New `lookupInquiry(reference, phone, countryCode = "+91")` → `InquiryLookupResult` (typed mirror of the server's `toCustomerView`).
- `SubmitInquiryInput` gains optional `travelDateTo`; `InquiryResult` gains optional `id`.
- `src/lib/types.ts`: `Agent` gains optional `photoUrl?: string` (one line).

### Tests

| File | Covers |
|---|---|
| `src/server/domain/__tests__/inquiry-state.test.ts` | happy path, `won` terminal, lost from every open status, spam only pre-quote via status, no stage skipping, reopen rules, `TERMINAL`/`OPEN_STATUSES` partition, `CONTACTED_OR_LATER`, labels complete, `customerStage` |
| `src/server/domain/__tests__/routing.test.ts` | capacity (`no_capacity`, default cap, empty pool), all six rules in order, premium fall-through, UAE by AED / +971 / `uae-shift` skill, `skill:groups+jain`, on-shift round-robin, off-shift fallback, deterministic tie-break, no mutation |
| `src/server/domain/__tests__/spam.test.ts` | honeypot, whitespace honeypot, too-fast, exact threshold, clock skew, missing/NaN timing, URL in name, URLs in notes as signal only, suppression → quarantine, reject beats quarantine, `cleanText` |
| `src/server/domain/__tests__/phone.test.ts` | +91 (trunk 0, spaces/dashes, repeated cc, `0091`, default cc, invalid lengths/prefix, `91xxxxxxxx` edge), +971 (trunk 0, cc override, invalid), unknown cc plausibility, `formatPhone`, `maskPhone` |
| `src/server/lib/__tests__/ids.test.ts` | Luhn textbook value (`7992739871` → 3), single digits, generated digit always validates, `formatReference`/`isValidReference` round-trip, every single-digit typo rejected, wrong prefix/shape/length, case+whitespace normalisation, 1-in-10 enumeration property, `uuidv7` shape + time ordering |

Domain files still import nothing but `domain/*` and `src/lib/types.ts`; no `server-only` was added to them.

---

## 2. Cross-cutting edits (files I do not own)

All in `src/server/services/inquiry.service.ts` — surgical, reviewed against §17 §7:

1. **`toCustomerView` leaked the agent's email.** `assignedAgent` (which carries `email`) was still inside the `...rest` spread while a sanitised `agent` copy was added beside it. `assignedAgent` is now destructured out; only `agent` (email stripped) is returned. Security-relevant for the public lookup.
2. **Follow-up ladder drifted.** The sweep computed the next rung from the sweep time, so the ladder ran T+2h, ≈T+26h, ≈T+98h, ≈T+266h instead of the documented T+2h / T+24h / T+72h / T+7d. Rungs are now anchored on `lastContactAt` (falling back to `createdAt`). A rung already in the past fires on the next pass (documented one-rung-per-pass behaviour); a floor of `now + 1h` prevents a burst of nudges after a cron outage.
3. **`logContact` on terminal inquiries restarted the ladder.** A contact logged on a `won`/`lost`/`spam` inquiry set `nextFollowupAt`; on `payment_pending` it re-armed the ladder that `transition` deliberately disables. Both now record the touch without scheduling a follow-up.
4. **Reopening spam left no SLA.** `markSpam` nulls `slaDueAt`; `spam → new` now recomputes it (and clears `slaBreachedAt`) so the sweep sees the reopened lead.
5. **Added `inquiryService.listAgents(actor)`** for `/api/agent/agents`. §19 §3 names `adminRepo.listRoutable()` as the "service call", but §19 §1 forbids `app/api` from importing repositories; the service method wraps the repo and returns public fields only (`id, name, initials, role, languages, shift, photoUrl, availability, openCount, maxConcurrent, isLead`) — no email, roles or permissions.

No other owned file was touched. `src/lib/analytics.ts` was not edited.

---

## 3. Contract deviations

- **`/api/agent/agents`** returns `{ agents: [...] }` via `inquiryService.listAgents` rather than calling `adminRepo.listRoutable()` from the route (see cross-cutting #5). Shape is a superset of `AgentPublic` minus `email`.
- **Lookup rate limit lives in the route**, not the service, because `lookupForCustomer(reference, phone, countryCode)` has no request context. Key is `lookup:ip:<hashIp>`; when no client IP is available (local dev without a proxy) the bucket is `lookup:ip:unknown` — shared, but still fails open per `rate-limit.ts`.
- **`POST /api/inquiries` returns 201** (created), `/convert` returns 201. Everything else 200. The frontend client only checks `res.ok`.
- **`/status` with `to: "spam"`** is delegated by the service to `markSpam(... suppress: false)` and is only legal from `new`/`assigned`/`contacted` (transition table). Later stages use the dedicated `/spam` route, which refuses only `won`. The unit test documents this split.
- **Public `source` enum is narrower** than `InquirySource` (see Schemas).

---

## 4. Open questions

1. **`convertToOrder` requires `confirmedTotal` on every item.** §17 §6.5 says "`confirmed_total_inr` wins where present" (implying indicative fallback); the service refuses conversion until every item has a confirmed price, making the `?? i.indicativeTotal` fallback dead code. Strict is safer for money, so I left it — but the console must surface this before the agent reaches the convert button.
2. **`amountPaidInr` is not reconciled** against the item totals in `convertToOrder`. A typo records a payment that does not match the order. Suggest a warning (not a block) in the console, or a tolerance check in the service.
3. **Follow-up floor constant.** The 1-hour minimum gap after a late sweep (`MIN_GAP_MS`) is a judgement call, not a documented number. Move to `settings.followup` if ops want to tune it.
4. **`get()` writes an `inquiry.view_pii` audit row on every detail view** for anyone with `customers.view_pii` (all agent roles). That is per §13.7.2 but will be the noisiest audit action by far; consider de-duplicating per session per inquiry.
5. **`activeShift` heuristic** (IST 09:00–17:00 ⇒ IST desk, otherwise GST) is hard-coded in the service; the real shift pattern (§17 open Q2) should replace it.
6. **Zod v4 `.datetime()` / `.url()` on `convertInquirySchema`** — `paidAt` requires an offset-bearing ISO string. If the console sends `Date.toISOString()` (always `Z`) this is fine; a bare local datetime will be rejected with a field message.

## 5. Requests

- **Agent Console:** `PATCH /items/:itemId` returns `toleranceExceeded`; render the "explain and re-consent" state when true (§17 §7.5). `GET /api/agent/agents` is ready for the assign picker.
- **Security:** please re-check `toCustomerView` output (cross-cutting #1) and the `lookup:ip:unknown` bucket behaviour behind Vercel's proxy.
- **Analytics:** no change needed — `getClientContext()` shape and the flat `Attribution` keys line up with `createInquirySchema` and `convertToOrder`.
