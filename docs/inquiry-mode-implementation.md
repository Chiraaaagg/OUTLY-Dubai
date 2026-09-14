# Inquiry Mode — frontend implementation

Implements `docs/backend/17-inquiry-mode-pivot.md` §2 (frontend change plan),
§3 (conversion), §4 (CTA strategy) and §8.1 (API readiness). Backend sections
(§5–§7, §9) are out of frontend scope and unchanged.

Status: **implemented, built, typechecked, funnel verified in-browser.**

---

## 1. The hinge

One field drives everything: `Activity.fulfilmentMode: "inquiry" | "instant"`
(`src/lib/types.ts`). Every SKU and combo launches as `"inquiry"`. There is no
site-wide flag — a mixed catalogue renders coherently because the secondary CTA
("Ask on WhatsApp") is identical in both modes (§4.4).

| Component | `inquiry` | `instant` |
|---|---|---|
| `BookingWidget` | No availability call. Price labelled indicative. "Check availability & price" → cart → `/inquiry` | Live availability, "Book now" → `/checkout` — original behaviour, untouched |
| `StickyBookingBar` | "Check availability" | "Book now" |
| `ActivityCard` | "View details" + secondary "Add to inquiry"; no instant badge | "View & book" + instant badge |
| `ComboBooking` | "Check availability & price" → `/inquiry` | "Book this package" → `/checkout` |
| `/cart` | "Send inquiry"; no price-lock timer; indicative totals | "Continue to checkout"; 20-min lock shown |
| `/checkout` | **Gated** — redirects to `/inquiry` (mixed-cart rule §8.2.6) | Serves the full 4-step flow |
| Search filter "Instant confirmation" | Hidden while no SKU is instant (`hasInstantProducts()`) | Returns automatically |

Rollback for any SKU is setting the field back. No migration, no rebuild.

## 2. New surfaces

| Route / component | Purpose | 21st.dev source |
|---|---|---|
| `/inquiry` | The lead form — replaces checkout as the cart's terminal step | `@shadcnspace/contact-01` layout (form beside trust, split inverted to 7/5) |
| `components/commerce/inquiry-form.tsx` | 2 required fields, 7 optional collapsed; chips, textarea count, loading submit, sticky mobile submit | `@cnippet-dev/v-textarea-10`, `@cnippet-dev/v-field-17`, `@ln-dev7/contact-16` |
| `/inquiry/confirmation` | Reference, named agent, **concrete deadline**, what-happens-next timeline, WhatsApp primary | `@ln-dev7/how-it-works-02` (vertical timeline), `@waleedkibhen/profile-card` (agent card) |
| `components/commerce/inquiry-ui.tsx` | `ConfirmFirstNote`, `ResponsePromise`, `AgentCard`, `HowItWorks`, `NextSteps`, `IndicativePriceNote` | `@ln-dev7/how-it-works-09` (3-step strip) |
| `/account/inquiries` | Open + completed inquiries with a 4-stage progress track | `@kavikatiyar/order-history` |
| `lib/inquiry.ts` | SLA deadline (business-hours adjusted), agent routing mirror, reference, cart→inquiry-item copy | — |
| `lib/cta.ts` | `ctaFor(mode)` — the one conditional | — |
| `lib/data/inquiries.ts` | Mock inquiries for the account area | — |

## 3. The inquiry form — field justification (§3.3, §3.6)

| Field | Required | Why it exists |
|---|---|---|
| Name | **yes** | The agent opens with it; a nameless lead reads as spam |
| WhatsApp number | **yes** | The channel. Nothing works without it |
| Dates | no | Pre-filled from cart; "flexible" allowed — a date-unsure buyer is still a lead |
| Guests | no | Pre-filled from cart; decides price and vehicle |
| Dietary | no | The wedge. One tap; changes which supplier the agent quotes |
| Email | no (collapsed) | Fallback only |
| Hotel | no (collapsed) | Pickup coverage; usually unknown this early |
| Budget band | no (collapsed) | Lets the agent quote the right tier first time |
| Notes | no (collapsed) | Parents, occasions, mobility |

**Removed versus checkout:** payment method, deposit/EMI selectors, coupon,
terms checkbox, billing, per-traveller details. None start a conversation.

Anti-spam without conversion cost (§9): honeypot field + submission timing
captured; **no CAPTCHA, no OTP at submission** — by design.

Mobile: both required fields sit in the first screen at 360×640; the submit is
a sticky bar so the CTA is always one thumb away.

## 4. CTA matrix as shipped (§4.2)

| Page | Primary | Secondary | Sticky / mobile |
|---|---|---|---|
| Homepage | "Plan my Dubai trip" (How-it-works strip) | Browse | Floating WhatsApp |
| Search / category / collection cards | "View details" | "Add to inquiry" | — |
| Attraction hub (Tier A) | **"Get this priced with a combo"** | "View ticket details" | — |
| ADP | **"Check availability & price"** | "Ask on WhatsApp" (equal weight) | Price + "Check availability" + WhatsApp |
| ADP, Tier D | "Request a quote" | "Speak to a trip designer" | — |
| Combo | "Check availability & price" | "Ask about this package" | — |
| Cart | **"Send inquiry"** | "Price this trip on WhatsApp" (whole cart passed) | Count + total + primary |
| Inquiry form | **"Send inquiry — we reply in ~30 min"** | "Send on WhatsApp instead" | Sticky submit |
| Confirmation | **"Message [agent] on WhatsApp"** (reference pre-filled) | "Add another activity" | — |
| SEO landing | "Check availability & price · from ₹X" | Read FAQs | "Check availability" |

"Book now" appears nowhere while a SKU is inquiry-mode.

## 5. Response promise placements (§3.9)

| Surface | Form |
|---|---|
| Header trust bar | "Human reply in 30 minutes" |
| Trust marquee, footer stat, WhyOutly, TrustSummary | 30-minute promise (was 8-min WhatsApp SLA) |
| ADP beside CTA | `ResponsePromise` — "Free to ask · reply in ~30 min", switches to "team offline now, first reply after 9 am IST" out of hours |
| Inquiry form submit | "Send inquiry — we reply in ~30 min" |
| **Confirmation** | Named agent + **concrete timestamp** ("Will message you by 5:09 pm IST"), computed by `computeSlaDueAt()` with 9am–11pm IST business hours |
| Cart | Not repeated (per plan) |

`SLA.responseMinutes` and business hours live in one object, mirroring the
admin-editable `settings.sla.*` the backend will own.

## 6. Objection handling shipped (§3.4)

| Objection | Where | Element |
|---|---|---|
| "Why can't I just book?" | ADP, combo, cart, form, landing hero | `ConfirmFirstNote` — the §3.1 sentence |
| "Will the price change?" | ADP price block, cart, inquiry sidebar | `IndicativePriceNote` |
| "How long?" | Every CTA, confirmation | `ResponsePromise`, `AgentCard` deadline |
| "Will you spam me?" | Form, beside phone | "We message once about this trip. No marketing unless you ask." |

Four new FAQ entries under `/faq#inquiry` answer the same four in long form.

## 7. Removed vs gated (§2.2)

**Removed (copy/UI, truthfulness):**
- "Instant confirmation" badge and filter while no SKU is instant
- Price-lock timer in inquiry carts
- "X spots left" and live-availability states on inquiry-mode ADPs
- "Selling fast" reworded to "In demand" (a demand signal, not an inventory claim)
- "Available today & tomorrow" rail → "Good at short notice" (confirmation-type based)
- Voucher-ETA claims on the homepage hero card and FAQ
- Referral/credits from account nav and dashboard

**Gated, retained in code:**
- `/checkout` steps 1–4 — redirects when the cart has inquiry items
- `BookingWidget` availability call and sold-out/limited/next-dates states
- `instant` search filter
- `/voucher/[ref]`, `/booking/[ref]`, cancel/modify flows, `/account/referrals`, `/account/bookings`
- `submitOrder`, `reverifyPrice`, `checkAvailability` in the API seam

## 8. Analytics (§5.3)

New events wired: `inquiry_started`, `inquiry_item_added`, `inquiry_submitted`
(primary site conversion, carries indicative `value` for Meta `Lead`),
`inquiry_field_error`. `booking_confirmed` unchanged — fires only on the gated
instant path and, in production, from the agent console as an offline
conversion. New props: `inquiry_reference`, `inquiry_source`, `fulfilment_mode`,
`item_count`.

## 9. Verified

- ADP (inquiry mode): no availability call, no spots-left, "Confirmed before you pay" badge, both CTAs, indicative label ✅
- "Check availability & price" → cart item with `fulfilmentMode: "inquiry"` → `/inquiry` ✅
- Form pre-filled from cart; Jain chip; submit → `/inquiry/confirmation?ref=INQ-…` with agent + deadline; cart cleared ✅
- 360×640: no horizontal scroll; required fields on first screen; sticky submit ✅
- `/checkout` with an inquiry cart redirects to `/inquiry` ✅ (by construction; instant path untested since no SKU is instant)
- Build: 111 pages, typecheck clean, still 3 runtime dependencies ✅

## 10. Technical debt noticed

1. `bookedThisMonth` copy on cards/ADP is a booking claim; in inquiry mode it
   remains true (agents create orders) but should be sourced from won inquiries.
2. `Activity.confirmation` (supplier confirmation type) and `fulfilmentMode`
   are separate concepts and both exist; a future reader could conflate them.
   Documented in `types.ts`; do not merge.
3. `/account/referrals` and `/account/profile` payment section are hidden from
   nav but reachable by URL. Intentional (retained), but they still render
   credits — harmless, mock data.
4. The demo agent assignment mirrors §7.3 client-side; it must be replaced by
   the server's assignment in the `POST /inquiries` response.

## 11. Blockers

None for the frontend. The **WhatsApp BSP auto-ack** (§7.2 step 6) is the
launch line per the plan's Phase B and is backend work — until it exists the
confirmation page's "Acknowledgement on WhatsApp — sent now" step is a promise
the frontend cannot keep on its own.
