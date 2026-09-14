# Phase 9 — WhatsApp Assisted Bookings (Rail B)

*45% of target GMV. The frontend half is complete; none of the backend exists.*

---

## 1. Where this starts

`src/lib/whatsapp.ts` and `docs/whatsapp-strategy.md` are done and correct. Fifteen intents, 25+ placements, full context composition, `whatsapp_initiated` fired as a **conversion** event. What exists is the outbound deep link (`wa.me/...?text=...`). What does not exist is everything after the customer taps it.

`WHATSAPP_NUMBER` is currently `"919000000000"` — a placeholder. Move it to an env var with a startup assertion before anything ships.

---

## 2. The pricing model changes the architecture

**Meta moved WhatsApp Business Platform to per-message pricing on 1 July 2025**, replacing the old per-conversation model. This is not a billing detail — it determines how the notification scheduler should be built, and WhatsApp is projected to be your largest variable infrastructure cost at scale (§03.7).

What is free and what is not:

| Message | Charged? |
|---|---|
| Any non-template message (text, image, document) sent **inside an open customer service window** | **Free** |
| **Utility** templates sent inside an open CSW | **Free** |
| Any message inside a **72-hour free entry-point window** (opened by a click-to-WhatsApp ad or an FB-page CTA) | **Free** |
| Utility / authentication templates **outside** a CSW | Charged, with volume-tier discounts |
| **Marketing** templates | **Always charged** |

Three architectural consequences:

**1. The CSW is state you must track.** `wa_conversations.csw_expires_at` and `free_entry_window_expires_at` exist in the schema for this reason. Every inbound customer message reopens the 24-hour service window; the notification scheduler must know whether the window is open before choosing how to send.

**2. Utility notifications should prefer the open window.** Booking confirmations, voucher delivery, driver details, balance reminders — all *utility* category. If the customer messaged recently (which, on Rail B, they did — they booked through a conversation), these are free. A scheduler that sends blindly pays for messages it did not have to.

**3. Click-to-WhatsApp ads open a 72-hour free window.** That is a genuine economic advantage for Rail B, and it argues for routing Meta spend to CTWA ads rather than website-form ads — which is also what the business model already recommends for conversion reasons. The backend must **capture and persist the ad attribution** (`fbclid` / `ctwa_clid`) at the moment the conversation starts, both for the free window and for offline conversion upload (§11).

**Implementation:** `notification.dispatch` consults conversation state before choosing a send strategy:

```
if free_entry_window open      → send freely (any type), cost 0
elif CSW open and category=utility → send as utility template, cost 0
elif CSW open                  → send as plain session message, cost 0
else                           → send template; record billable=true, cost_minor
```

Record `billable` and `cost_minor` on every `wa_messages` row so cost per order is measurable rather than modelled. **[VERIFY current rate card with your chosen BSP — Meta's per-message rates vary by country, category and volume tier, and BSPs add their own markup.]**

---

## 3. BSP selection (Blocker B4)

You need a Business Solution Provider for the transport. Candidates in the Indian market: **Wati, Interakt, AiSensy, Gupshup, Zoko, DoubleTick**. **[VERIFY current pricing and template-approval turnaround with each — these change frequently and the published tiers are often out of date.]**

Selection criteria, weighted for this build:

| Criterion | Why it matters here |
|---|---|
| **Webhook quality and reliability** | You are building your own console; the BSP is a pipe. Bad webhooks are fatal |
| **API for send + template management** | Templates must be version-controlled in your repo and deployed, not clicked into a dashboard |
| **Media handling (PDF up to ~100MB)** | Voucher delivery is the core use case (`AC-WA-02`) |
| **Per-message pricing transparency** | So `cost_minor` is real |
| **Multi-agent support** | If you use their inbox at all during MVP |
| Their built-in inbox / CRM | **Low weight** — you are building the console (Decision D4) |

**Recommendation: choose on webhook reliability and API completeness, not on inbox features.** You are buying a pipe. Verify before signing: can you receive every inbound message via webhook, send arbitrary templates via API, upload and send media via API, and receive delivery/read receipts? If any answer is no, pick another.

Also verify: business verification timeline (can take days to weeks), display name approval, and the messaging tier limits on a new number (Meta ramps sending limits — you may start capped at a low daily unique-recipient count, which affects launch-day campaign plans).

---

## 4. Architecture

```
┌───────────────┐  wa.me deep link with context (already built)
│   Storefront  │───────────────────────────────┐
└───────────────┘                               │
┌───────────────┐  click-to-WhatsApp ad         │      ┌──────────────┐
│   Meta ads    │───────────────────────────────┼─────►│   WhatsApp   │
└───────────────┘  (72h free window + ctwa_clid)│      │   (Meta)     │
                                                │      └──────┬───────┘
                                                │             │
                                         ┌──────▼─────────────▼──────┐
                                         │        BSP (pipe)         │
                                         └──────┬──────────────┬─────┘
                                   inbound      │              │  outbound
                                   webhook      │              │  send API
                        ┌───────────────────────▼──┐      ┌────▼──────────────┐
                        │ POST /api/webhooks/       │      │ whatsapp.service  │
                        │      whatsapp             │      │  send / template  │
                        │ verify → persist → 200    │      │  media / CSW calc │
                        └───────────┬───────────────┘      └────▲──────────────┘
                                    │                           │
                        ┌───────────▼───────────────────────────┴──────────────┐
                        │              conversation.service                     │
                        │  match to user/order · update CSW · route to agent    │
                        │  first-response timer (AC-SUP-01) · intent detection  │
                        └───────────┬───────────────────────────┬──────────────┘
                                    │                           │
                       ┌────────────▼──────────┐   ┌────────────▼──────────────┐
                       │   Agent console (§09) │   │  notification.service     │
                       │   inbox · customer360 │   │  outbound sequences,      │
                       │   quote builder       │   │  consent-gated            │
                       └───────────────────────┘   └───────────────────────────┘
```

---

## 5. Inbound flow

### 5.1 Lead capture and context

The deep link carries a pre-filled message containing activity, date, pax, price shown and URL (already composed by `buildWhatsAppMessage`). But **a pre-filled message is not reliable attribution** — the customer can edit it, and it carries no session identity.

Fix: embed a short reference in the message and mirror it server-side.

```
On WhatsApp CTA click (before opening wa.me):
  POST /api/wa/intents  { intent, productId, date, pax, priceShown,
                          sessionId, anonId, fbclid, fbp, fbc, utm… }
  → { ref: "K7QM2" }                          // 5-char, 30-min TTL, Redis + DB

Message becomes: "…  Ref: K7QM2"
```

On the first inbound message, extract the ref and hydrate `wa_conversations.entry_context` and `.attribution` from it. If the customer edited the message and the ref is gone, fall back to phone matching against recent sessions. **This is what makes `AC-META-02` (offline conversion upload with the originating click ID) possible at all** — without it, Rail B bookings are invisible to Meta optimisation and you systematically under-bid on your best traffic.

### 5.2 Inbound handling

```
POST /api/webhooks/whatsapp
  verify signature → INSERT wa_messages (dedup on bsp_message_id) → 200 fast
  → enqueue PROCESS_WA_INBOUND

PROCESS_WA_INBOUND:
  find or create wa_conversations by phone_e164
  hydrate entry_context from ref (first message only)
  set csw_expires_at = now + 24h                      ← the cost-relevant line
  link to users / recent orders by phone
  classify intent (keyword rules first; LLM assist at V2)
  route:
    ├ business hours → assign by round-robin or skill; alert agent
    └ out of hours   → auto-acknowledge within 60s with expected reply time  (AC-SUP-04)
  if this is the first agent reply → set first_response_at   (AC-SUP-01 measurement)
```

**`AC-SUP-01`** — median first response under 8 minutes in business hours, measured and reported weekly. `first_response_at` minus conversation creation is the measurement. Make it a dashboard tile from day one; it is the metric that drives Rail B conversion, and the business model is explicit that *"your conversion rate is a function of response time, which you control."*

### 5.3 Intent classification

Start with keyword rules mapped to the fifteen intents already defined in `lib/whatsapp.ts`. Rules are transparent, debuggable and free. Add LLM-assisted classification and reply drafting at V2 — the business model identifies AI-assisted agent responses as the mechanism that breaks the ~250–300 bookings/agent/month throughput wall, and it recommends attacking that wall at Tier 2 (~500 bookings/month), not Tier 3.

**Draft, human approves.** Never auto-send a generated reply on a conversation that is a booking rail.

---

## 6. Outbound — the eight flows

All consent-gated. All logged to `notifications`. All templates version-controlled in the repo and deployed to the BSP by a script, never edited in a dashboard (`AC-WA-04`).

| # | Flow | Trigger | Category | Consent | Notes |
|---|---|---|---|---|---|
| 1 | Pre-purchase enquiry response | Inbound | service/session | Implied | Free inside CSW |
| 2 | **Abandoned checkout recovery** | Cart idle 30 min | **marketing** | **Explicit checkbox** (`AC-CO-06`) | Billable. Re-verify price and availability first (§07.6.5). Once only |
| 3 | **Booking confirmation + PDF voucher** | Order confirmed | utility | Transactional | Free if CSW open. Target < 60s (`AC-VOU-01`) |
| 4 | Balance payment reminder | T-8, T-5, T-3 | utility | Transactional | Deposit bookings |
| 5 | Pre-trip sequence | T-2, T-1 evening, T-0 | utility | Transactional | T-1 carries driver name, number, vehicle, pickup window |
| 6 | **In-trip upsell** | Day 1 and day 3 of trip | **marketing** | Marketing consent | **The highest-ROI mechanic in the product.** Target 35% attach |
| 7 | Post-trip review + referral | T+2 days | marketing | Marketing consent | Feeds `AC-REV-*` |
| 8 | Expat seasonal campaigns | Calendar | marketing | Marketing consent | Global Village Oct, DSF Dec–Jan, summer indoor, Eid |

### 6.1 The in-trip attach loop deserves its own note

Flows 5 and 6 are where the business model puts the primary FIT retention loop — *"35% attach = 35% more GMV at zero CAC."* Backend requirements:

- A **trip** concept: group a customer's confirmed `order_items` by traveller and overlapping date range. The frontend already groups "by trip not by order" in `/account/trips`; the backend needs the same grouping to know that someone is *currently in Dubai*.
- Scheduled jobs anchored on trip day 1 and day 3, **in Asia/Dubai time**, not IST.
- Recommendation selection: `product_relations` weighted by what customers with the same segment and completed activity booked next.
- Availability pre-checked before sending. Never upsell something that is sold out tomorrow.
- **A hard suppression rule:** never send an upsell to a customer with an open P1 support ticket or a ≤2-star review in the last 48 hours. Upselling someone whose pickup failed is worse than silence.

---

## 7. Consent

`AC-WA-03`: opt-out honoured within 60 seconds across every flow.

- `consents` is append-only with `evidence` (exact copy shown, page, timestamp). Current state is the latest row per `(subject, channel, purpose)`.
- The checkout checkbox covers **voucher delivery and recovery messaging** and states the consequence of unticking (already built in the frontend).
- Marketing consent is separate from transactional. Transactional messages for a booking a customer made do not need marketing consent; flows 6, 7, 8 do.
- **STOP handling:** any inbound message matching stop keywords writes a `granted = false` consent row immediately and synchronously — before any queued outbound job runs. Every `notification.dispatch` re-checks consent at send time, not at schedule time. A message queued three days ago must not go out to someone who opted out yesterday.
- `/account/profile` per-channel toggles write the same table.

---

## 8. Agent handoff and escalation

Escalation rules from `docs/whatsapp-strategy.md` §5, as backend logic:

| Condition | System behaviour |
|---|---|
| Order > ₹25,000 | Surface the phone number alongside WhatsApp in all templates and on the booking page |
| Tier D / private charter | Assign a **named** coordinator (`admin_users.whatsapp_display_name`, `photo_url`); direct WhatsApp and phone |
| Within 48h of travel | Booking page shows supplier/driver contact + emergency number (`AC-BM-03`); conversation priority raised |
| In-destination emergency | 24/7 number printed on the voucher itself |
| Out of hours | Auto-acknowledge within 60s stating expected reply time (`AC-SUP-04`) |
| Dietary failure reported | Same-day ops alert, meal refund authorised, supplier scorecard hit |
| Supplier rejection | Proactive contact within 2h with three options (`AC-VOU-03`) |

Handoff between agents carries full history — the conversation is a persistent object with an `assigned_agent_id`, not an inbox item. `AC-SUP-02` requires an agent to see full booking history and browsing context **within one click** of opening a conversation; that is a customer-360 query, specified in §09.

---

## 9. Backend requirements — the checklist

| # | Requirement | AC |
|---|---|---|
| WA-1 | BSP integration: send, receive, templates, media, receipts | — |
| WA-2 | `/api/wa/intents` — context ref creation with attribution capture | `AC-WA-01` |
| WA-3 | Inbound webhook: verify, dedup, persist, 200 fast | — |
| WA-4 | Conversation state machine + CSW / free-window tracking | cost control |
| WA-5 | Identity resolution: phone → user → orders → browsing session | `AC-SUP-02` |
| WA-6 | Agent assignment, round-robin, availability, handoff | — |
| WA-7 | First-response timer and weekly SLA reporting | `AC-SUP-01` |
| WA-8 | Out-of-hours auto-acknowledgement within 60s | `AC-SUP-04` |
| WA-9 | Template registry, version-controlled, deployed by script | `AC-WA-04` |
| WA-10 | Consent engine with 60s opt-out and send-time re-check | `AC-WA-03` |
| WA-11 | PDF voucher delivery over WhatsApp, Android + iOS | `AC-WA-02` |
| WA-12 | Undelivered at T+10min → auto-resend, then SMS fallback | PRD §5.7 |
| WA-13 | All eight outbound flows with schedulers in Asia/Dubai time | PRD §14.2 |
| WA-14 | Trip grouping for the in-trip attach loop | business model §1.5 |
| WA-15 | Per-message cost recording (`billable`, `cost_minor`) | unit economics |
| WA-16 | Conversation → order attribution for offline conversion upload | `AC-META-02` |
| WA-17 | Suppression rules (open P1, recent bad review, quiet hours) | trust |

---

## 10. What not to build

From `docs/whatsapp-strategy.md` §8, and worth restating because these are the tempting mistakes:

- **No WhatsApp-only inventory.** Everything an agent can book, a customer can book. The moment there is agent-exclusive inventory, you have two catalogues and a reconciliation problem.
- **No hiding price behind an enquiry** — except genuine Tier D quote-only SKUs, where no public price exists.
- **No auto-opening chat on page load.**
- **No auto-sent AI replies** on a booking rail. Draft-and-approve only.
- **No marketing message without explicit marketing consent**, regardless of how well it would perform.
