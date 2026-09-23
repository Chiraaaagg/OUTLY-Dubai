# Agent Console — implementation note

**Agent:** Agent Console. **Scope:** the inquiry queue and detail pages agents live in (§17 §7, §09 §3.2/§3.5), their Server Actions and client components. Verified with `npm run typecheck` (clean for these files).

## Pages

| Route | File | What it does |
|---|---|---|
| `/admin/inquiries` | `src/app/admin/(console)/inquiries/page.tsx` | Queue. Server Component; every filter is a URL param so filters are links and back/forward works. Tabs: **Open** (default, all six open statuses) · New · Assigned · Contacted · Quoted · Negotiating · Payment pending · Won · Lost · Spam · All, with counts from `queueCounts`. Owner rail (Mine / Unassigned / All agents) only for `inquiries.view_all`; "SLA breached" toggle; search (reference / name / phone / item via `filters.q`); sort SLA / value / newest / oldest; 25 per page with the shared `Pagination`. Rows: reference, lead + masked phone, first item + "+n more", dates/guests/dietary, indicative total in the customer's currency, agent initials, status pill, live SLA countdown, created-ago. Breached rows get a faint danger tint. |
| `/admin/inquiries/[id]` | `src/app/admin/(console)/inquiries/[id]/page.tsx` | Detail / customer-360-lite. Header (reference, status, source, SLA or first-response, assigned agent, Claim when unassigned, escalation and spam-hold alerts). Left: items with indicative vs confirmed + availability + inline editor; trip details; contact block with `wa.me` click-to-chat (pre-filled with reference + agent first name), `tel:`, `mailto:`; attribution line; merged activity timeline. Right (sticky on desktop): status actions, convert-to-order, assignment picker, notes composer, notifications with resend, other inquiries from the same phone. |

**Triage rule.** Inside business hours the Open/New/Assigned tabs default to `sort=sla`; outside (`isWithinBusinessHours(settingsService.sla())` false) they default to `sort=value` with an "Out of hours" banner — §17 §7.5 "queue by value; next shift works highest-value first". Explicit `?sort=` always wins.

**Auth.** Both pages call `requirePage()` (Admin agent's `_lib/guard.ts`) with no permission and let `inquiryService` apply `view_own` / `view_all`. A `FORBIDDEN` on the detail renders "assigned to someone else"; `NOT_FOUND` → `notFound()`.

## Server Actions — `src/app/admin/_actions/inquiries.ts`

All `"use server"`, zod v4 `strictObject` validation, `authService.requireCookies(permission)`, one service call, `revalidatePath` on `/admin/inquiries`, `/admin/inquiries/<id>` and `/admin`, and the Admin agent's shared `ActionResult` via `runAction` (`_actions/result.ts`) — `AppError` becomes `{ ok:false, code, message, recovery, fields }`; nothing is thrown to the client.

| Action | Permission | Service |
|---|---|---|
| `claimInquiry(id)` | `inquiries.claim` | `claim` |
| `assignInquiry({id, agentId, reason?})` | `inquiries.assign` | `assign` |
| `transitionInquiry({id, to, reason?, note?})` | `inquiries.update` | `transition` (lost requires a `LOST_REASONS` value, checked before the call) |
| `addInquiryNote({id, note})` | `inquiries.update` | `addNote` |
| `logInquiryContact({id, note?})` | `inquiries.update` | `logContact` |
| `updateInquiryItem({id, itemId, confirmedInr?, confirmedAed?, clearConfirmed?, availabilityNote?, availabilityChecked?})` | `inquiries.update` | `updateItem` → returns `{ toleranceExceeded, tolerancePercent }` |
| `markInquirySpam({id, reason, suppress})` | `inquiries.mark_spam` | `markSpam` |
| `convertInquiry({id, paymentLinkUrl?, paymentLinkId?, gatewayPaymentId?, amountPaidInr?, method?, paidAt?, note?})` | `inquiries.convert` | `convertToOrder` → returns `{ orderReference, orderId }` |
| `resendInquiryNotification({id, notificationId})` | `notifications.resend` | `notificationService.resend` |

## Components — `src/app/admin/_components/inquiry/`

| File | Kind | Notes |
|---|---|---|
| `status-pill.tsx` | server-safe | `StatusPill` maps `InquiryStatus` → tone on top of the Admin agent's generic `StatusPill` (`_components/ui.tsx`); `AgentAvatar` initials disc. |
| `sla-countdown.tsx` | client | `SlaCountdown` (time to `slaDueAt`, red when breached, amber under 10 min; "Replied in Xm" once `firstResponseAt` is set) and `RelativeTime`. Both take `serverNow` so the first client render matches the HTML, then tick with the server clock offset applied. |
| `status-actions.tsx` | client | `ClaimButton`, `LogContactButton`, `StatusActions` (buttons only for `TRANSITIONS[status]`; "Mark lost" reason select from `LOST_REASONS` + note; "Mark spam" with "also suppress this number"), `ConvertForm` (payment link URL/ID, Razorpay payment id, amount paid defaulting to the sum of confirmed INR, method, paid-at, note; disabled with listed blockers until every item has a date and a confirmed price and the status can reach `won`; shows the created order reference). |
| `item-editor.tsx` | client | Per-item card: customer-saw vs confirmed (with % delta), availability checked-at, inline form (confirmed INR + AED, availability note, "checked now" checkbox, clear confirmed). The `toleranceExceeded` result becomes a persistent warning Alert: "Confirmed price is more than X% above what the customer saw — tell them the old price, the new price and why before quoting." |
| `assign-picker.tsx` | client | Select of routable agents (name · shift · open count · availability), optional reason. Rendered only with `inquiries.assign`. |
| `notes.tsx` | client | Notes composer, Ctrl/⌘+Enter submits. |
| `timeline.tsx` | server-safe | Merged events newest first with per-kind icons, actor name, relative time, note text (React-escaped), item-update summaries, assignment target names. |
| `notifications.tsx` | client | Notification rows (event, channel, status, masked recipient, time, suppression reason, provider error) with a Resend button for email/WhatsApp when `notifications.resend`. |
| `format.ts` | pure | IST date/time, money, relative time, WhatsApp link, source/budget/dietary labels. |

Permission gating in the UI mirrors the service: `canUpdate = inquiries.update && (inquiries.assign || assigned to me)`; reopen from lost/spam needs `inquiries.assign`; full phone/email and the WhatsApp/tel links need `customers.view_pii` (the service audits the PII view). Agents without `inquiries.view_all` never see the owner rail.

## Deviations from the brief

- Added an **Open** tab (all open statuses) as the default landing tab; the listed tabs are all present after it.
- The queue keeps its own `<table>` instead of the shared `DataTable` because rows need a breach tint and multi-line cells; it still scrolls inside its own container on mobile.
- Server Actions return the Admin agent's `ActionResult` (`message` instead of `error`) so every admin form reads the same envelope.
- `paidAt` from `datetime-local` is parsed on the server in the server's timezone; agents should enter IST. Noted as a follow-up below.
- Layout patterns are the standard support-inbox table + two-pane record view, adapted to OUTLYY tokens; no specific 21st.dev component was copied (MCP search not used — no new dependencies either way).

## Requests

- **Inquiry Engine / Backend Architect:** `inquiryService.convertToOrder` accepts `paidAt` as an ISO string; a small `timeZone` hint (or accepting `"YYYY-MM-DDTHH:mm"` as IST) would remove the server-timezone ambiguity for `datetime-local` input.
- **Inquiry Engine:** `InquiryEventDetail.meta.agentId` on assignment events is an id; the console resolves names from `listRoutable()` + the current/previous assignee. A `meta.agentName` snapshot at write time would let non-lead agents (who cannot call `listRoutable`) see names in the timeline.
- **Admin agent:** the queue tab counts use `QueueCounts`, which counts across all agents even for `view_own` actors (repo `queueCounts` is not scoped) — the "Mine" figure is right, the per-status figures are global. Fine for a small team; flag if it confuses agents.
- **Database:** nothing needed; no repository helpers were added.

## Cross-cutting edits

None. No files outside `src/app/admin/(console)/inquiries/**`, `src/app/admin/_actions/inquiries.ts` and `src/app/admin/_components/inquiry/**` were touched.

## Verification

`npx tsc --noEmit` exits 0 for the whole repo at hand-off. `next build` / `next dev` were not run per the brief; no migrations or seed changes.
