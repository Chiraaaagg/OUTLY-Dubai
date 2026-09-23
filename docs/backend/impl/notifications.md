# Notification agent — implementation note

**Owner:** Notification agent. **Scope:** `src/server/notifications/**`, `src/server/services/notification.service.ts`, `src/server/repositories/notifications.repo.ts`, `src/app/api/webhooks/whatsapp/route.ts`, this note and `whatsapp-templates.md`.

**Verification:** `npm run typecheck` (no errors in owned files; other agents' in-flight files — `suppliers/**`, `schemas/events.schemas.ts`, `admin/(console)/**` — currently fail independently of this work) and `npm test` (`src/server/notifications/__tests__/*`, 44 tests).

---

## 1. Architecture

```
inquiry.service ──▶ notificationService.onInquirySubmitted / onInquiryAssigned /
                    onSlaBreach / onFollowupDue / onInquiryWon
                              │  decides recipients + channels
                              ▼
                    notificationService.dispatch(input)
                              │  attempt(): render → allowlist → consent → adapter
                              ▼
        ┌─────────────────────┴─────────────────────┐
        │                                            │
  email.adapter (Resend REST | log)      whatsapp.adapter (cloud_api | log)
        │                                            │
        └───────────── notifications row (one per intended message) ──────────┘
                                                     ▲
  Meta / BSP ──▶ POST /api/webhooks/whatsapp ──▶ whatsapp-webhook.ts ──┘ (status → delivered_at)
                                                     └──▶ consents (STOP keyword)
```

Files:

| File | Role |
|---|---|
| `notifications/templates.ts` | Pure. `renderTemplate(event, channel, ctx)`; `EVENT_CHANNELS` / `supportsChannel`; `escapeHtml`, `clampSubject`, `cleanVariable`. WhatsApp `text` is rendered from the registry body so the stored payload equals what the customer reads. |
| `notifications/whatsapp-templates.ts` | Pure. Version-controlled registry (`WHATSAPP_TEMPLATES`), fixed variable phrases, `renderWhatsAppBody`, `positionalParameters`, `validateTemplate`. See `whatsapp-templates.md`. |
| `notifications/email.adapter.ts` | Resend via `fetch`; log adapter without a key. `text` is now required. Refuses an email with no subject/html. |
| `notifications/whatsapp.adapter.ts` | Cloud API shape; parameters come from `positionalParameters` (numeric order, never lexical). Log adapter by default. |
| `notifications/allowlist.ts` | Non-production recipient guard. |
| `notifications/whatsapp-webhook.parse.ts` | Pure. Signature verify (HMAC-SHA256 over raw body, constant-time), envelope flattening, STOP regex, dedup key. |
| `notifications/whatsapp-webhook.ts` | Server. `ingestWhatsAppWebhook({ rawBody, signatureHeader })` — persist, dedup, apply receipts, STOP consent. |
| `repositories/notifications.repo.ts` | `listForInquiry`, `recentFailures(limit)`, `dailyStats(from, to)`, `applyProviderStatus`, `insertWebhookEvent` (dedup on `(provider, providerEventId)`), `markWebhookProcessed`. Recipients are masked in read DTOs. |
| `services/notification.service.ts` | Public API unchanged: `dispatch`, `onInquirySubmitted`, `onInquiryAssigned`, `onSlaBreach`, `onFollowupDue`, `onInquiryWon`, `resend`, `retryFailed`, `buildContext`. |
| `app/api/webhooks/whatsapp/route.ts` | GET verification, POST ingest. Always 200 on POST. |

## 2. Event → channel → template → recipient matrix

| Event | Trigger | Channel | Template / subject | Recipient | Gate |
|---|---|---|---|---|---|
| `INQUIRY_ACK` | `onInquirySubmitted` | whatsapp | `inquiry_ack_v1` | `inquiry.leadPhone` | `inquiry.whatsappConsent` |
| `INQUIRY_ACK` | same | email | `Got it — {ref}. {agent} replies by {deadline}` | `inquiry.leadEmail` | email present |
| `INQUIRY_OPS_ALERT` | same | email | `[OUTLYY] New inquiry {ref} — ₹… — {agent}` | each of `EMAIL_OPS_ALERT_TO` | env |
| `INQUIRY_OPS_ALERT` | same | whatsapp | `inquiry_ops_alert_v1` | `WHATSAPP_OPS_ALERT_NUMBER` | env |
| `INQUIRY_ASSIGNED` | same + `onInquiryAssigned` | email | `[OUTLYY] Assigned|Reassigned: {ref} — reply by {deadline}` | `agent.email` | agent has email; not self-assign |
| `INQUIRY_SLA_BREACH` | `onSlaBreach` (sweep) | email | `[OUTLYY] SLA breach {ref} — was due {deadline}` | `EMAIL_OPS_ALERT_TO` | env |
| `INQUIRY_STILL_CHECKING` | `onSlaBreach` | whatsapp | `inquiry_followup_v1` (still-checking sentence) | `leadPhone` | `whatsappConsent` |
| `INQUIRY_STILL_CHECKING` | `onSlaBreach` | email | `{ref} — still checking with the operator` | `leadEmail` | no WhatsApp consent, email present *(new: previously silent)* |
| `INQUIRY_FOLLOWUP` | `onFollowupDue(stage)` (sweep) | whatsapp | `inquiry_followup_v1` (stage sentence 1/2/3) | `leadPhone` | `whatsappConsent` |
| `INQUIRY_FOLLOWUP` | same | email | `{ref} — did the options work? / checking in / last note from us` | `leadEmail` | fallback when no WhatsApp consent |
| `INQUIRY_WON` | `onInquiryWon` | email | `Confirmed — booking {orderRef}` | `leadEmail` | email present |

`ack_sent_at` on the inquiry is now set only when a **customer** ack (`INQUIRY_ACK`) was actually `sent` — ops/agent emails no longer count.

Every `dispatch` writes exactly one `notifications` row with `status ∈ {sent, failed, suppressed}`, `template`, `payload` (the full `TemplateContext`), `providerId`, `costMinor`, timestamps.

## 3. Guard order inside `dispatch` (and `retryFailed`)

1. **Channel support** — `supportsChannel(event, channel)`; otherwise `suppressed / unsupported_channel` and an error log (a programming error, not a customer condition).
2. **Render** — a template error records `failed` with `render: …`.
3. **Non-production allowlist** (§14.1 #3) — `APP_ENV !== production` and recipient not matched by `NOTIFICATION_RECIPIENT_ALLOWLIST` (alias `NOTIFY_ALLOWLIST`) ⇒ `suppressed / non_production_allowlist`. **Empty list ⇒ everything suppressed.** Entries: full address/number, `@domain` (email suffix), `+prefix` (phone prefix, never applied to emails). This is why every send in the current dev setup is `suppressed` — correct.
4. **Consent** (§08.7, re-checked at send time) — latest `consents` row for `(recipient, channel, purpose)`:
   - `granted=false` ⇒ `suppressed / opted_out` for **any** purpose (transactional included — a STOP means stop).
   - purpose `marketing` without a positive grant ⇒ `suppressed / no_consent`. No marketing purpose is dispatched by any current trigger.
   - Transactional with no consent row ⇒ allowed (the customer asked us for a reply).
5. **Send** — adapter; exceptions become `failed` with `providerError` (≤ 500 chars).

## 4. Retry semantics (`retryFailed`, called by `inquiryService.sweep()`)

- Selects `status=failed AND attempt < 4 AND createdAt > now − 24h`, oldest first, up to `limit` (50).
- **Claims each row atomically**: `updateMany({ where: { id, status: "failed", attempt: <seen> }, data: { attempt: +1 } })`. `count === 0` ⇒ another sweep already took it ⇒ skip. Two overlapping crons cannot double-send.
- Re-runs the same `attempt()` pipeline (allowlist + consent are re-evaluated — an opt-out since the failure suppresses the retry) and **updates the row in place**. No second row per retry (the previous implementation created one new row per retry and flipped the original — the table double-counted).
- Returns `{ scanned, retried, stillFailing }`. After 4 attempts the row stays `failed` and appears in `notificationsRepo.recentFailures()`.
- `resend(actor, id)` (console button) deliberately creates a **new** row and an audit entry — a human decision.

## 5. Copy rules applied (§17 §3.7, §3.9)

- Deadline is always the concrete `deadlineLabel` computed by `formatDeadline` (`4:18 pm IST today`, `9:30 am IST tomorrow`). Never a duration.
- Out-of-hours: WhatsApp ack `{{5}}` = "is offline right now"; email says "Our team is offline right now." The test suite asserts both.
- No countdowns, scarcity or "act now" — asserted by a regex test over every event/channel.
- Every customer string (`leadName`, item titles, hotel, dietary, `specialRequests`, support email) passes through `escapeHtml` before HTML; hrefs pass `safeHref` (http(s) only). Plain-text parts are not escaped (they are not markup). Tests inject `<script>` into name/title/hotel/notes and assert it never appears raw in HTML.
- Subjects ≤ 78 chars via `clampSubject`, single line.
- WhatsApp variables are whitespace-collapsed and capped at 200 chars (`cleanVariable`) — Meta rejects newlines/tabs in parameters.

## 6. WhatsApp webhook — `/api/webhooks/whatsapp`

**GET** — Meta subscription handshake. Echoes `hub.challenge` (text/plain, 200) only when `hub.mode=subscribe` and `hub.verify_token` equals `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (constant-time). 403 otherwise, including when the token is not configured.

**POST** — reads the **raw** body (`req.text()`), calls `ingestWhatsAppWebhook`, logs the summary, returns `200 { received: true }` no matter what (§13.4: non-2xx causes provider retry storms). Processing errors are logged, never thrown to the provider.

Inside `ingestWhatsAppWebhook`:

| Condition | Stored as | Processed? |
|---|---|---|
| `WHATSAPP_WEBHOOK_SECRET` unset | `webhook_events` row, `provider_event_id = unverified:<sha256(body)[0:32]>`, `signature_valid=false`, `processing_error=secret_not_configured` | **No** |
| Signature missing / wrong | same key scheme, `processing_error=invalid_signature` | **No** (logged `warn`) |
| Body > 1 MB | not stored (logged) | No |
| Invalid JSON | `unverified:` row, `processing_error=invalid_json` | No |
| Valid, no recognisable items | one row `payload:<hash>` | marked processed |
| Valid | one row per message (`msg:<wamid>`) and per status (`status:<wamid>:<status>`), `payload` = the provider's own object | Yes |

Duplicate `(provider, provider_event_id)` ⇒ P2002 ⇒ counted as `duplicates`, never reprocessed. Unverified rows are keyed by body hash on purpose: a later correctly-signed redelivery of the same message is not deduplicated against the rejected one.

Applied today:

- **Status callbacks** (`sent | delivered | read | failed`) → `notificationsRepo.applyProviderStatus(messageId, status, ts, error)`: matches on `notifications.provider_id`, status only moves forward (`queued → sent → delivered → read`; `failed` only from `queued/sent`), `delivered_at` set on delivered/read (a read arriving before delivered still fills `delivered_at`). `deleted`/`warning` are stored, not applied.
- **STOP keyword** (`/^(stop|unsubscribe)$/i`, whole message, text type only) → two `consents` rows via `recordConsent` — `whatsapp/transactional` and `whatsapp/marketing`, `granted=false`, `source=stop_keyword`, evidence `{ messageId, receivedAt, keyword }`. Synchronous, before the 200. The next `dispatch`/`retryFailed` to that number is `suppressed / opted_out`.
- **Other inbound messages**: persisted only. `TODO(whatsapp-bsp)` — conversation find-or-create, `csw_expires_at`, entry-context from `Ref:`, routing, out-of-hours auto-ack, START/re-opt-in keyword. Nothing fakes a reply.

## 7. BSP go-live checklist

1. **Business verification + display name** with Meta (weeks; start first — §08.3).
2. **Templates**: submit the three bodies in `whatsapp-templates.md` verbatim, category utility, language en. Record approved names in `WHATSAPP_TEMPLATE_INQUIRY_ACK`, `WHATSAPP_TEMPLATE_INQUIRY_FOLLOWUP`, `WHATSAPP_TEMPLATE_INQUIRY_OPS_ALERT` — or clear the overrides so the registry defaults apply. **`.env.example` currently sets `outlyy_inquiry_ack_v1` / `outlyy_inquiry_followup_v1`, which do not match the registry** (see Requests).
3. **Webhook**: in Meta App Dashboard → WhatsApp → Configuration set callback URL `https://<site>/api/webhooks/whatsapp`, verify token = `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; subscribe to the `messages` field. `WHATSAPP_WEBHOOK_SECRET` = the Meta **App Secret** (that is what signs `X-Hub-Signature-256`). If the BSP proxies webhooks, confirm it forwards `statuses` and signs with a secret you hold.
4. **Send credentials**: `WHATSAPP_API_BASE_URL` (e.g. `https://graph.facebook.com/v21.0`), `WHATSAPP_API_TOKEN` (system-user token), `WHATSAPP_PHONE_NUMBER_ID`. Production only (§14.1 #2).
5. **Staging rehearsal**: `WHATSAPP_PROVIDER=cloud_api` on staging with the sandbox number, `NOTIFICATION_RECIPIENT_ALLOWLIST` = tester numbers only. Submit a test inquiry, confirm: `notifications` row `sent` with a `wamid` `provider_id`; webhook rows `status:…:delivered` / `read`; `delivered_at` populated. Reply `STOP` from the tester number, confirm two `consents` rows and that the T+2h follow-up lands as `suppressed / opted_out`.
6. **Production flip**: set `WHATSAPP_PROVIDER=cloud_api`, `WHATSAPP_OPS_ALERT_NUMBER`, confirm `GET /api/health` shows no notification warnings.
7. Watch `notificationsRepo.recentFailures()` / `dailyStats()` for the first week; a template-name mismatch shows up as 100 % `failed` with `WhatsApp API 400` in `provider_error`.

## 8. Still TODO (marked `TODO(whatsapp-bsp)` in code)

- Conversation model: `wa_conversations` upsert, CSW / free-entry-window tracking, template-vs-session decision in `dispatch` (§08.2 cost logic). Every send is a template today.
- `billable` / `cost_minor` from the status callback `pricing` object → notifications row (WA-15). Parsed, not persisted.
- START / re-opt-in keyword; `/account/profile` toggles (no customer accounts in Inquiry Mode).
- Undelivered ack at T+10 min ⇒ resend then SMS fallback (WA-12); auto-flag `spam` on undelivered ack + no engagement (§17 §9 #2). The data (`status=failed` from the webhook) is now there to build on.
- Resend inbound webhooks (bounces/complaints) — `RESEND_WEBHOOK_SECRET` exists in env but no route.
- Email opt-out link (transactional-only today; needed before any marketing purpose is dispatched).

## 9. Contract deviations / cross-cutting notes

- `email.adapter.EmailSend.text` is now required (was optional). Only `notification.service` constructs it.
- `retryFailed` return gained `stillFailing`; `inquiry.service.sweep()` reads `retried` only — unchanged.
- `onSlaBreach` now emails a "still checking" note when the customer has no WhatsApp consent but has an email (previously the customer heard nothing — §7.5 says never silence).
- `templates.ts` reads `process.env.WHATSAPP_TEMPLATE_INQUIRY_OPS_ALERT` directly (not declared in `env.ts`, which I do not own). Harmless when unset.
- No edits to `prisma/**`, `src/server/lib/**`, `inquiry.service.ts`, `src/app/admin/**`.

## Requests

- **Backend Architect / env owner**: declare `WHATSAPP_TEMPLATE_INQUIRY_OPS_ALERT` (optional string, default `inquiry_ops_alert_v1`) in `src/server/lib/env.ts`, and align `.env.example` template names with the registry (`inquiry_ack_v1`, `inquiry_followup_v1`) or document the `outlyy_` prefix as the name to register with the BSP.
- **Agent Console / Admin**: `notificationsRepo.listForInquiry`, `recentFailures`, `dailyStats` are ready for the inquiry detail "Notifications" panel and a health/ops tile. `recipientMasked` is what to show; the full recipient stays server-side.
- **Security**: please include `POST /api/webhooks/whatsapp` with a forged `X-Hub-Signature-256` in the §13.11 #6 check — expected 200, `webhook_events.signature_valid=false`, no consent/notification change.
