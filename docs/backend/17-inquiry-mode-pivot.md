# Inquiry Mode — Pivot Plan

**Version:** 1.0 · **Date:** 12 September 2026 · **Status:** Plan for approval. No implementation.
**Supersedes for launch:** §15 roadmap Phases 1–2 sequencing. Everything else in §00–§16 stands.

**Decisions taken (recorded 12 Sep 2026):**
- **Ops:** Holiday Chacha team, UAE + India, real shift coverage → the 30-minute promise is publishable
- **Prices:** exact all-in prices stay visible, framed as confirmed-on-inquiry
- **Payment:** Razorpay Payment Links generated manually by an agent
- **Timeline:** no fixed deadline — sequenced by value, with an explicit launchable line

---

## 0. The framing that makes this cheap

**This is not a new architecture. It is Rail B promoted to primary.**

PRD §0 already specifies a dual-rail product where *"both rails write to the same order object, the same customer record, and the same voucher pipeline."* §05 already has a `leads` table. §09 already specifies an agent console with a quote builder, customer 360, and manual payment links. §08 already builds 25+ context-passing WhatsApp entry points.

Inquiry Mode changes exactly one thing at the product level: **Rail A's terminal step stops being `POST /orders` and becomes `POST /inquiries`.** Everything downstream — agent picks it up, confirms, quotes, collects payment, creates the order — is the Rail B flow that was always going to be 45% of GMV.

Three consequences follow, and they are the whole plan:

1. **Very little is thrown away.** Catalogue, search, ranking, pricing engine, cart, WhatsApp, analytics, admin and the agent console all keep working. The booking engine, payments, vouchers, availability and supplier adapters go dormant with their schemas intact.
2. **The hardest problems in the booking architecture disappear.** Confirming availability *before* taking money eliminates the payment-success-booking-failure saga (§06.6), the unknown-booking problem (§06.7.3), and overselling. Given what §16 found about Rathin — no booking lookup, no idempotency, no cancellation — **inquiry mode is arguably the correct engineering response to that API, not merely a commercial convenience.**
3. **Inquiry mode is not temporary for most of the catalogue.** Your business model puts 70%+ of gross margin in Tier B/C/D — desert safari, combos, yacht, private experiences. Those suppliers are on WhatsApp and paper and will *never* be instant-confirmation. Only Tier A park tickets (Rathin) will ever flip. So the end state is **both modes coexisting permanently**, which is exactly what makes this cheap: you are not building a bridge, you are building the mode that most of the business will always run in.

That last point is the design principle for everything below. **Per-product fulfilment mode, not a site-wide switch.**

---

## 1. Inquiry Journey Map

### 1.1 Current (booking) journey

```
Landing → Search → ADP → Cart → Checkout(4 steps) → Payment → Confirmation → Voucher
                    │                                    │
                    └── WhatsApp (Rail B) ───────────────┘
```
Terminal event: `booking_confirmed`. Money moves before the supplier is asked.

### 1.2 Inquiry journey

```
Landing → Search → ADP → Inquiry Cart → Inquiry Form → Inquiry Confirmation
   │                │         │              │                 │
   │                │         │              │                 ├─► WhatsApp auto-ack (instant, with deadline)
   │                │         │              │                 └─► Email ack
   │                │         │              │
   │                │         │              └─► Ops notified · SLA timer starts
   │                │         │
   └────────────────┴─────────┴─► WhatsApp direct (skips the form entirely)
                                          │
                          ┌───────────────▼────────────────┐
                          │  AGENT: availability + price   │
                          │  → 3 options → payment link    │
                          └───────────────┬────────────────┘
                                          │ paid
                                 ┌────────▼─────────┐
                                 │ ORDER CREATED    │ ← existing engine, unchanged
                                 │ voucher pipeline │
                                 └──────────────────┘
```
Terminal *site* event: `inquiry_submitted`. Terminal *business* event: `booking_confirmed`, unchanged, created by an agent.

### 1.3 Two entry paths, deliberately

**Path A — structured inquiry** (form): captures date, pax, items, dietary, budget. Better data, better agent prep, works out of hours, measurable funnel.
**Path B — WhatsApp direct** (already built): lower friction, higher intent, no form. Loses structured data unless the context ref is preserved (§08.5.1 — keep it).

**Do not force Path A.** The business model is explicit that Indian travel-intent traffic converts better through chat. The form exists for people who prefer it and for out-of-hours capture, not as a toll gate.

### 1.4 Advantages

| | Why it matters here |
|---|---|
| **No money moves before the supplier confirms** | Removes the entire class of failure in §06.6/§06.7. Given Rathin has no booking lookup, this is a genuine engineering win |
| **Every lead gets a human** | This *is* the differentiator versus Klook/Headout. The pre-purchase Q&A is the trust-building (business model §1.4) |
| **Combo attach becomes natural, not a widget** | An agent quoting three options hits the 25–35% Tier C target far more reliably than a cart upsell tile |
| **No refund exposure at launch** | Nothing is charged until availability is confirmed |
| **Launches without payments, vouchers, availability or supplier adapters** | Enormous scope reduction |
| **Objection-handling at the moment of doubt** | Persona A (45% of GMV) *will not* self-serve a ₹52,000 booking. He was always going to WhatsApp |

### 1.5 Disadvantages, stated honestly

| | Severity |
|---|---|
| **Tier A conversion collapses** | **High.** Someone wanting a Burj ticket for tomorrow will not wait 30 minutes. They go to Klook. See §3.2 — this needs an explicit strategy, not a hope |
| **Throughput is human-bound from day one** | **High.** ~250–300 bookings/agent/month (business model §3.2). The support wall arrives at launch instead of at Tier 2 |
| **Response time becomes the conversion rate** | **High.** You now control conversion through staffing discipline, not page design |
| **Instant-confirmation claim must come off the site** | Medium. Any "instant confirmation" badge is now false and must be removed or re-scoped |
| **In-trip / last-minute segment is poorly served** | Medium. Persona D wants tomorrow, confirmed now. A 30-minute wait at 10pm is survivable; a 12-hour one is not |
| **Lead quality is unverified** | Medium. Fake numbers, tyre-kickers, competitors. §9 |
| **Meta optimisation degrades** | Medium. You optimise for `Lead`, not `Purchase`. Offline conversion upload (§11 `AC-META-02`) moves from important to **essential** |

### 1.6 Drop-off risks, ranked

| # | Where | Risk | Mitigation |
|---|---|---|---|
| 1 | ADP CTA | User expects "Book now", sees "Check availability", assumes the site is broken or a lead-farm | Copy must *explain* in the same breath: "We confirm with the operator first — you'll never get a voucher that fails at the gate." §3.4 |
| 2 | Inquiry form | Too many fields | Phone + name only required. Everything else pre-filled from context or optional. §3.6 |
| 3 | Post-submit | Silence feels like a void | Instant WhatsApp ack with a **concrete deadline timestamp**, not a duration. §3.9 |
| 4 | Tier A pages | Low-consideration buyer bounces to Klook | Reframe hub pages as routing surfaces. §3.2 |
| 5 | Out of hours | 10pm inquiry, reply at 9am, trip decided elsewhere | Out-of-hours auto-reply states the real time, and UAE-shift coverage narrows the window |
| 6 | Agent response | Generic reply, no options | Three-option rule enforced in the console (§09.3.3) |
| 7 | Payment link | Friction after a warm conversation | Link sent in-thread on WhatsApp, not by email |

---

## 2. Frontend Change Plan

**Design rule throughout:** adapt, do not rebuild. Per `docs/21st-dev-implementation.md`, 21st.dev is the **design source, not an install path** — patterns adopted, reimplemented on OUTLY tokens, **zero new runtime dependencies** (current: `lucide-react`, `clsx`, `tailwind-merge`; ~102KB shared JS against an LCP < 2.5s budget).

**21st.dev sources for the new surfaces:**

| Surface | 21st.dev source | Pattern taken |
|---|---|---|
| Inquiry form | `@cnippet-dev/v-textarea-10` (Support Ticket Form) | Category chips + textarea with character count + loading submit + **submitted confirmation state** |
| Inquiry page layout | `@shadcnspace/contact-01` (Project Inquiry Form) | Form beside contact details beside a trust-badge marquee — lead capture with credibility in one view |
| Field validation | `@cnippet-dev/v-field-17` (Multi-Field Form) | Inline validation, role select, loading submit button |
| Post-submit state | `@ln-dev7/contact-16` (Centered Contact Form) | Form swaps in place to a confirmation message |
| Date / pax | `@cnippet-dev/v-calendar-15`, `@lavikatiyar/form` | Already adapted as `DatePickerSheet` / `HeroSearch` — reused unchanged |

Deliberate changes to each, consistent with the existing build: CSS-only motion (no `motion/react`), no hover-gating, 44px targets, `@media (prefers-reduced-motion)` honoured globally.

### 2.1 Page-by-page

| Page | Current | Proposed | Reason | Future API impact |
|---|---|---|---|---|
| **Homepage** | Hero search → date+pax; trust bar "All-in INR · No hidden fees · Instant WhatsApp tickets"; rails | Trust bar → **"All-in INR · No hidden fees · Human reply in 30 min"**. Hero CTA → "Plan my Dubai trip". Rails unchanged. Add a one-line "how it works" strip (3 steps) | "Instant tickets" is now false. The 30-min promise is the new differentiator and belongs at first impression | None. Copy only |
| **Search** | Cards with "Book" affordance; filters incl. `instant` | Cards → "View details". **Remove the `instant` filter** and the "Instant confirmation" badge while all SKUs are inquiry-mode. Add **"Add to inquiry"** as a secondary action on the card | The filter would return everything or nothing, and the badge is false | **Filter and badge return automatically** when any product has `fulfilment_mode='instant'`. Render them conditionally on catalogue content, not on a constant |
| **Category / Collection / Attraction hubs** | SEO surfaces routing to ADPs | Unchanged structurally. **Attraction hubs get a stronger combo-routing block** (§3.2) | Tier A hubs are where inquiry mode hurts most; their job becomes routing, harder | None |
| **SEO landing pages** | Price-led, "Book now" CTA | Keep prices. CTA → "Check availability & price". Add the confirm-first explainer above the fold | Programmatic pages target "price in india" queries — prices must stay or the SEO thesis dies | None |
| **Activity Detail Page (ADP)** | Date+pax → live availability → "Book now" primary, "Ask on WhatsApp" secondary (equal weight) | Date+pax → **no availability call**; price shown as indicative. Primary → **"Check availability & price"**. Secondary → "Ask on WhatsApp" (unchanged). Add a confirm-first line beside the CTA. **Remove** live-availability states, "X spots left", instant-confirmation badge. Sticky bottom bar: price + primary + WhatsApp | The most-changed page. Availability cannot be asserted; the CTA must set the right expectation | **Largest beneficiary.** When a SKU flips to `instant`, the availability call and "Book now" return for that SKU only |
| **Cart** | Trip builder, conflict detection, 20-min price-lock timer, combo upsell | → **Inquiry Cart**. Keep trip timeline, conflict detection, combo upsell. **Remove the price-lock timer.** Prices labelled "indicative". CTA → "Send inquiry" | The timer promises something no longer being promised; the timeline is genuinely useful for multi-activity trips | Cart shape is unchanged, so it feeds either path later |
| **Checkout** | 4 steps: details → review → payment → confirmation | → **Inquiry Form**, one page. Keep step 1 (details) and step 2 (review). **Steps 3 and 4 removed from the route.** Fields reduced per §3.6 | Payment does not happen here any more | **Steps 3–4 are not deleted from the codebase** — the route is flag-gated. Restoring them is un-gating, not rebuilding |
| **Confirmation** | Booking reference, voucher ETA, add-to-calendar, account prompt, upsell | → **Inquiry Confirmation**. Inquiry reference, **concrete response deadline ("by 4:18 pm")**, what happens next in 3 steps, WhatsApp button pre-filled with the reference, "add another activity" | Post-submit silence is drop-off risk #3 | None |
| **Account area** | Trips, saved, profile, referrals, bookings | **My Inquiries** added; My Trips retained for post-payment orders. Referrals hidden. **Credits UI removed** (already recommended in §01.10 — loyalty is V2) | Nothing to show a user who has only inquired | None |
| **Support / FAQ** | Help centre | Add 4 FAQs: why inquiry not instant · how fast · does the price change · how do I pay. §3.5 | These are the new objections; answering them on-page deflects support load | Remove when instant ships |
| **Mobile** | Sticky booking bar, bottom sheets, one-handed | Unchanged patterns. Sticky bar content changes only | Mobile is 80%+ of traffic; the interaction model is already right | None |
| **WhatsApp** | 25+ contextual entry points, 15 intents, context passing | **Unchanged and now primary.** Add one intent: `inquiry_followup` | Already built and correct | None |
| `/design-system` | State gallery + event tail | Add inquiry states. **Block in production** (§01 R3 — still outstanding) | | |

### 2.2 What is removed vs. gated

**Genuinely removed (copy/UI):** "Instant confirmation" badges · price-lock timer · "X spots left" scarcity · payment method selector · deposit/EMI selectors · coupon field at checkout (moves to agent-applied) · voucher ETA copy.

**Gated, not deleted (code retained behind `fulfilment_mode`):** checkout steps 3–4 · availability call on ADP · `instant` search filter · voucher route · booking management (cancel/amend).

That distinction is the whole API-readiness story. **Nothing that will come back is deleted.**

---

## 3. Conversion Optimization Plan

Objective: maximise *qualified* inquiries. Volume of junk leads is a cost, not a win — it consumes the human throughput that is now your binding constraint.

### 3.1 The core reframe

The instinct is to apologise for not having instant booking. **Do the opposite.** Your own research (feasibility §9, pain clusters E and H) found that voucher rejection at the gate, wrong tickets issued, and non-refundable terms hidden until after purchase are top complaint clusters across Klook, Cobone and Headout.

So the honest, accurate line is:

> **"We confirm with the operator before you pay — so you never get a voucher that fails at the gate."**

This is true, it is the actual reason, and it converts a perceived weakness into the trust proposition the whole business is built on. **Every CTA and every objection-handling surface should trace back to this sentence.**

### 3.2 The Tier A problem — the one that needs a real strategy

Inquiry mode converts *worse* on low-consideration purchases and *better* on high-consideration ones. Your traffic and your margin sit on opposite sides of that line:

| | Traffic source | Consideration | Inquiry mode effect |
|---|---|---|---|
| **Tier A** (Burj, Frame, Global Village) | The SEO magnet — most of your organic traffic | Low. Price-checkable in 10 seconds | **Badly negative.** They leave for Klook |
| **Tier B/C/D** (safari, combos, yacht) | Ads, collections, agent referral | High. Needs reassurance | **Positive.** The conversation *is* the conversion |

PRD §4.2 and §5.4 already say the attraction hub's job is to *"rank, then route traffic to Tier B/C."* In inquiry mode that stops being a merchandising preference and becomes the survival strategy for your organic traffic.

**Recommendations:**
1. On Tier A pages the primary CTA is **not** "enquire about this ticket". It is a combo route: *"Most families pair this with the desert safari — get both priced together."* A lone Burj inquiry is a low-margin, high-effort lead.
2. Keep the Tier A price visible and accurate. It is the SEO intent and the credibility anchor. Do not gate it.
3. Accept a lower conversion rate on Tier A pages and **measure inquiry rate by tier separately**. Judging one blended rate will hide the fact that your margin pages are performing well.
4. When Rathin goes live, Tier A is the **first** flip to instant — it is exactly the inventory that benefits, and it is Rathin's only inventory.

### 3.3 Lead capture strategy

**Progressive, not gated.** Capture in this order:

| Stage | Captured | Required? |
|---|---|---|
| Browse | Session, attribution, items viewed | Automatic |
| Add to inquiry cart | Product, date, pax | Automatic |
| Inquiry form | **Name, phone** | **Required — 2 fields** |
| Inquiry form | Email, hotel, dietary, notes, budget | Optional |
| Agent conversation | Everything else | Conversational |

**Phone is the only field that truly matters**, because WhatsApp is the channel. Email is a fallback. Anything asked beyond name and phone must earn its place by making the agent's first reply materially better.

**Micro-conversions worth capturing** (all already in the event taxonomy): wishlist save, compare, WhatsApp click, PDF-less "send me this itinerary" — each is a warm lead even without a form submit.

### 3.4 Objection handling

Four new objections exist that did not exist in booking mode. Each needs an on-page answer at the point it arises.

| Objection | Where it fires | Answer |
|---|---|---|
| **"Why can't I just book?"** | ADP, at the CTA | *"We confirm with the operator before you pay — so you never get a voucher that fails at the gate."* One line, beside the button |
| **"Will the price change?"** | ADP price block, inquiry review | *"This is the all-in price we expect to confirm. If anything changes, we tell you before you pay anything."* |
| **"How long will this take?"** | Every CTA, submit button, confirmation | A concrete time, not a duration. §3.9 |
| **"Will you spam me?"** | Inquiry form, beside phone | *"We message once about this trip. No marketing unless you ask."* And honour it |

### 3.5 Trust strategy

Everything already built stays and matters more: verified reviews from Indian travellers, all-in INR pricing, itemised inclusions/exclusions, plain-language cancellation terms, licence and GST details in the footer, real support number.

**Additions specific to inquiry mode:**
- **Named agent with a real photo** on the confirmation page and in the WhatsApp reply. PRD §1 already calls for this. In inquiry mode it is the single highest-value trust element you have — it is what an OTA structurally cannot do.
- **A visible response-time record** once you have data: *"Median reply this week: 11 minutes."* Live proof beats a promise. Only publish once measured.
- **The `@shadcnspace/contact-01` pattern** — form beside contact details beside trust badges — puts credibility in the same viewport as the ask.

### 3.6 Friction reduction

| Friction | Decision |
|---|---|
| Field count | **Two required.** Name, phone |
| Account creation | Never required |
| Email | Optional. Phone is the channel |
| Date certainty | Allow **"flexible"** / "not sure yet" — a date-unsure buyer is still a lead, and forcing a date loses them |
| Pax certainty | Default from cart, editable, allow approximate |
| Hotel | Optional, autocomplete, not required |
| Form length | One screen on a 360×640 viewport. If it scrolls twice, cut a field |
| Re-entry | Everything pre-filled from browsing context; agent sees it regardless (§09.3.5) |
| Out of hours | Never block. Submit always works; the ack states the real reply time |

### 3.7 Urgency strategy

**Be careful here.** `docs/known-limitations.md` commits to "no fake countdowns, no invented scarcity." Inquiry mode removes your *legitimate* urgency signals (real availability, real spots-left), and the temptation is to replace them with fabricated ones. Don't.

**Legitimate urgency that remains:**
- Genuine date proximity: *"For travel in the next 48 hours, message us on WhatsApp — it's faster."* True and useful
- Real seasonal constraint: DSF, NYE, Eid peak dates where inventory genuinely tightens
- Supplier lead time where it actually exists: *"This operator needs 24 hours' notice"*

**Not legitimate:** countdown timers on an inquiry form · "3 people are looking at this" · invented spots-left. These would contradict a stated product principle and, for an audience whose top complaint cluster is deceptive pricing, they are strategically self-harming.

### 3.8 Social proof strategy

Unchanged mechanics, one addition: **surface reviews that mention the *service*, not just the activity.** In booking mode the review's job is to validate the SKU. In inquiry mode it must also validate *the decision to hand over your phone number*. Boost reviews mentioning responsiveness, the agent, and the Jain/veg guarantee being honoured (`dietary_met`, already a field in §05).

### 3.9 Response-time strategy — where the 30-minute promise appears

With Holiday Chacha's UAE + India coverage, the promise is credible. Publish it — with two rules.

**Rule 1: state a concrete time, not a duration.** *"We'll reply by 4:18 pm"* outperforms *"within 30 minutes"*. A deadline is checkable and creates a specific expectation; a duration is a vague claim. Compute it server-side from submission time + SLA, adjusted for business hours.

**Rule 2: the promise must visibly adapt out of hours.** *"Our team is offline now — you'll hear from us by 9:10 am."* A promise that changes with reality is more trustworthy than one that is always the same.

| Surface | Show it? | Form |
|---|---|---|
| **Homepage trust bar** | **Yes** | *"Human reply in 30 minutes"* — it is the differentiator vs both Klook (no human) and the local agent (slow quotes) |
| **ADP, beside the CTA** | **Yes** | *"Free to ask · reply in ~30 min"* — objection-handling at the decision moment |
| **Inquiry cart** | No | Redundant; do not repeat it into meaninglessness |
| **Inquiry form, submit button microcopy** | **Yes** | *"We reply in about 30 minutes"* — reduces submit anxiety at the exact moment of hesitation |
| **Inquiry confirmation** | **Yes — strongest placement** | The concrete timestamp. *"Jyoti will message you by 4:18 pm."* Named human + deadline |
| **WhatsApp auto-ack** | **Yes** | Same timestamp, plus the inquiry reference |
| **Ads / meta description** | **Yes** | It is a click-through differentiator |

**Do not publish the promise until the SLA timer and the weekly measurement exist** (§7). A promise you cannot measure is a promise you will silently break, and breaking it costs more than never making it.

---

## 4. CTA Strategy

### 4.1 Principles

1. **Name the next step, not the transaction.** "Check availability & price" describes what actually happens. "Enquire" is vague and sounds like a brochure request.
2. **Never use "Book now"** while a SKU is in inquiry mode. Setting an expectation you break at the next screen is the most expensive copy error available here.
3. **Free-to-ask framing reduces commitment anxiety.** "Free to ask" as microcopy measurably lowers the perceived cost of clicking.
4. **WhatsApp keeps equal weight, never more.** PRD §0 and `whatsapp-strategy.md` §8: offered, never forced.

### 4.2 Per-page CTA matrix

| Page | Primary | Secondary | Mobile / sticky | WhatsApp |
|---|---|---|---|---|
| **Homepage** | "Plan my Dubai trip" → search | "Browse experiences" | Sticky header search | "Chat with a Dubai expert · ~8 min" (float) |
| **Search card** | "View details" | "Add to inquiry" | Full-width tap target | Card-level none; page-level WhatsApp card below results |
| **Category / Collection** | "View details" per card | "See all" | — | "Can't find the right thing? Ask us" |
| **Attraction hub (Tier A)** | **"Get this priced with a combo"** → combo route | "View ticket details" | Sticky: combo CTA | "Ask about Burj tickets" |
| **ADP** | **"Check availability & price"** | "Ask on WhatsApp" (equal weight) | Sticky bar: price + primary + WhatsApp icon | Pre-filled with SKU, date, pax, price shown |
| **ADP — Tier D / quote-only** | "Request a quote" | "Speak to a trip designer" | Sticky: primary | Named coordinator |
| **Inquiry cart** | **"Send inquiry"** | "Add another activity" | Sticky: item count + total + primary | "Price this trip on WhatsApp" (passes whole cart) |
| **Inquiry form** | **"Send inquiry — we reply in ~30 min"** | "Send on WhatsApp instead" | Sticky submit | Equal-weight alternative path |
| **Inquiry confirmation** | **"Message us on WhatsApp"** (pre-filled with reference) | "Add another activity" | Sticky: WhatsApp | Primary CTA here |
| **SEO landing** | "Check availability & price" | "See all [category]" | Sticky landing CTA | Contextual |
| **404 / empty / error** | Recovery grid (existing) | — | — | "Looking for something specific?" |

### 4.3 Why this converts better than the alternatives

| Rejected | Why |
|---|---|
| "Enquire now" | Reads as a brochure request. No indication of speed or outcome |
| "Get a quote" | Implies a slow B2B process; also implies the shown price is not real, which undermines §3.1 |
| "Request booking" | Ambiguous — did I just book or not? Ambiguity at the CTA is drop-off |
| "Contact us" | Support language, not purchase language |
| **"Check availability & price"** ✓ | States the action, implies speed, and is *literally accurate* — which matters because the confirm-first story only works if the CTA tells the truth |

### 4.4 When Rathin goes live

CTA is driven by `products.fulfilment_mode`:

```
fulfilment_mode = 'instant' → "Book now"                    + "Ask on WhatsApp"
fulfilment_mode = 'inquiry' → "Check availability & price"  + "Ask on WhatsApp"
```

One conditional in one component. Both render side by side in the same search results without the page looking inconsistent, because the secondary CTA is identical in both.

---

## 5. Backend Pivot Plan

### 5.1 System status

| System | Status | Notes |
|---|---|---|
| **Catalogue** (products, variants, add-ons, media, categories, collections, combos, attractions) | **ACTIVE** | Unchanged |
| **Search & ranking** | **ACTIVE** | Business-weighted ranking still matters — it decides which SKUs get inquired about. `AC-SRCH-05` admin-editable weights still required |
| **Pricing engine** | **ACTIVE, role changed** | Computes the *indicative* display price and the *net cost + margin* for agent triage. No longer produces a binding quote |
| **Cart** | **ACTIVE** | Becomes the inquiry cart. Same shape |
| **Inquiry pipeline** | **NEW — the core system** | §6, §7 |
| **Agent console** | **ACTIVE — promoted to primary** | §09 built as specified; it is now the main application, not an internal tool |
| **WhatsApp (click-to-chat)** | **ACTIVE** | Already built |
| **WhatsApp (BSP outbound)** | **ACTIVE — narrow scope** | Needed for the auto-ack. Only 2 templates at launch: inquiry acknowledgement, follow-up |
| **Notifications** (email + WhatsApp) | **ACTIVE — narrow scope** | Ack, agent alert, follow-ups |
| **Analytics** | **ACTIVE — conversion event changed** | §5.3 |
| **Admin** (products, pricing, customers, inquiries) | **ACTIVE** | Inquiry queue is the new primary screen |
| **Orders** | **DORMANT → ACTIVE on win** | Created by an agent after payment. Same `order.createOrder(input, actor)` |
| **Payments** | **DORMANT (manual)** | Razorpay Payment Links from the dashboard. `payments` rows created manually by the agent for reconciliation |
| **Vouchers** | **DORMANT → ACTIVE on order** | Existing pipeline runs once an order exists |
| **Quote engine (signed, expiring, price-locked)** | **FUTURE** | Schema retained. No binding quote at launch |
| **Availability service + capacity ledger** | **FUTURE** | Schema retained, unused. Ops checks availability manually |
| **Supplier adapters** (Rathin, Manual) | **FUTURE** | §16 says Rathin is NOT READY regardless. Nothing lost |
| **Booking engine invariants I1–I4** | **FUTURE** | Idempotency, locks, reconciliation sweeps — all deferred with the money path |
| **Refunds, cancellation policy engine** | **FUTURE** | No money at risk pre-payment |
| **Coupons** | **FUTURE** | Agent applies a discount manually within the margin floor |
| **Referrals, loyalty, credits** | **FUTURE** | Already V2; remove the UI now |

### 5.2 Inquiry-first backend architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    STOREFRONT (unchanged)                     │
│  catalogue · search · ADP · inquiry cart · inquiry form       │
└───────────────┬──────────────────────────────┬───────────────┘
                │ POST /api/inquiries          │ wa.me deep link
                ▼                              ▼
┌───────────────────────────────┐   ┌──────────────────────────┐
│     inquiry.service           │   │  whatsapp.service        │
│  validate · rate limit        │   │  context ref · attribution│
│  price snapshot (indicative)  │   └──────────┬───────────────┘
│  create inquiry + items       │              │
│  assign agent · start SLA     │◄─────────────┘
└───────┬───────────────────────┘
        ├──► notification.service ──► WhatsApp ack (deadline) + email
        ├──► notification.service ──► ops alert (WhatsApp group + admin)
        └──► analytics ──► inquiry_submitted (server) → Meta CAPI `Lead`
                │
        ┌───────▼─────────────────────────────────────────────┐
        │            AGENT CONSOLE  (§09, promoted)            │
        │  queue · customer 360 · availability (manual)        │
        │  3-option quote w/ margin · Razorpay link (manual)   │
        └───────┬─────────────────────────────────────────────┘
                │ payment confirmed
        ┌───────▼─────────────────────────────────────────────┐
        │  order.createOrder(input, actor)   ← EXISTING, UNCHANGED
        │  → voucher pipeline → notifications → analytics      │
        └─────────────────────────────────────────────────────┘
```

**The single most important line:** the win path calls the *existing* order service. Vouchers, notifications, invoices, analytics and the customer record all work unchanged, because the order created from an inquiry is indistinguishable from any other order except for `source_inquiry_id`.

### 5.3 Analytics changes (§11 amendments)

| Change | Detail |
|---|---|
| **New events** | `inquiry_started`, `inquiry_item_added`, `inquiry_submitted`, `inquiry_acknowledged`, `inquiry_first_response`, `inquiry_quoted`, `inquiry_won`, `inquiry_lost` |
| **Primary site conversion** | `inquiry_submitted` (not `booking_confirmed`) |
| **Meta mapping** | `inquiry_submitted` → **`Lead`** (server-side, with value = indicative cart total). `booking_confirmed` → `Purchase`, uploaded as an **offline conversion** |
| **`AC-META-02` severity** | Escalates from important to **essential**. In inquiry mode *every* purchase is offline. Without upload, Meta optimises against zero purchase signal |
| **New funnel** | session → ADP → inquiry cart → inquiry submitted → contacted → quoted → **won** |
| **New core metrics** | inquiry rate by tier · median first response · inquiry→won rate · time-to-win · agent conversion · loss reasons |
| **`AC-AN-03` (CAC)** | Unchanged in importance. CAC now = spend / **won** inquiries, not spend / inquiries. Track both; the gap is lead quality |

---

## 6. Database Adjustments

**Changes only.** §05 stands otherwise. Nothing is dropped.

### 6.1 New: `inquiries` — supersedes `leads`

§05 has a `leads` table for concierge and Tier D quote requests. **Merge it into `inquiries`.** One queue, one SLA, one pipeline is materially better operationally than two, and `leads` has no production data.

```sql
CREATE TABLE inquiries (
  id              UUID PRIMARY KEY,
  reference       TEXT UNIQUE NOT NULL,          -- INQ-104821 (sequence + checksum)
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN
                    ('new','assigned','contacted','quoted','negotiating',
                     'payment_pending','won','lost','spam')),
  source          TEXT NOT NULL CHECK (source IN
                    ('inquiry_form','whatsapp','concierge','contact_form',
                     'quote_request','agent_created','abandoned_cart')),
  channel_preference TEXT CHECK (channel_preference IN ('whatsapp','call','email')),

  -- identity (guest-first; account optional, exactly as orders)
  user_id         UUID REFERENCES users(id),
  guest_id        UUID REFERENCES guests(id),
  lead_name       TEXT NOT NULL,
  lead_phone      TEXT NOT NULL,                 -- the only channel that matters
  lead_email      CITEXT,

  -- trip shape
  travel_date_from DATE, travel_date_to DATE,
  dates_flexible  BOOLEAN NOT NULL DEFAULT FALSE,
  pax             JSONB,                         -- {adult,child,infant,senior}
  hotel           TEXT, pickup_zone TEXT,
  dietary         TEXT, special_requests TEXT,
  budget_band     TEXT,

  -- indicative economics, snapshotted at submission (agent triage + analytics)
  currency        TEXT NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR','AED')),
  indicative_total_inr BIGINT NOT NULL DEFAULT 0,
  indicative_total_aed BIGINT NOT NULL DEFAULT 0,
  indicative_net_cost_aed BIGINT NOT NULL DEFAULT 0,

  -- SLA and ownership
  assigned_agent_id UUID REFERENCES admin_users(id),
  assigned_at     TIMESTAMPTZ,
  sla_due_at      TIMESTAMPTZ,                   -- business-hours adjusted
  first_response_at TIMESTAMPTZ,                 -- the 30-min measurement
  last_contact_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,

  -- outcome — THE HINGE
  converted_order_id UUID REFERENCES orders(id),
  lost_reason     TEXT,
  lost_at         TIMESTAMPTZ,

  wa_conversation_id UUID REFERENCES wa_conversations(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inquiry_has_identity CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL
                                          OR lead_phone IS NOT NULL)
);
CREATE INDEX ON inquiries (status, sla_due_at) WHERE status IN ('new','assigned');
CREATE INDEX ON inquiries (assigned_agent_id, status);
CREATE INDEX ON inquiries (lead_phone);
CREATE INDEX ON inquiries (created_at DESC);
CREATE INDEX ON inquiries (indicative_total_inr DESC) WHERE status = 'new';  -- value triage
```

### 6.2 New: `inquiry_items` — **deliberately mirrors `order_items`**

This mirroring is the entire plug-and-play guarantee. Converting an inquiry to an order must be a **field copy, not a translation.**

```sql
CREATE TABLE inquiry_items (
  id            UUID PRIMARY KEY,
  inquiry_id    UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,

  -- identical columns to order_items
  product_id    UUID REFERENCES products(id),
  combo_id      UUID REFERENCES combos(id),
  variant_id    UUID REFERENCES product_variants(id),
  service_date  DATE,
  timeslot      TEXT,
  pax           JSONB NOT NULL,
  addons        JSONB NOT NULL DEFAULT '[]',

  -- snapshots, same fields as order_items
  title_snapshot TEXT NOT NULL,
  tier_snapshot  CHAR(1) NOT NULL,

  -- INDICATIVE, not binding — the one semantic difference
  indicative_unit_inr  BIGINT NOT NULL,
  indicative_total_inr BIGINT NOT NULL,
  indicative_total_aed BIGINT NOT NULL,
  indicative_net_cost_aed BIGINT NOT NULL,

  -- agent's confirmed figures, filled during the conversation
  confirmed_total_inr BIGINT,
  confirmed_net_cost_aed BIGINT,
  availability_checked_at TIMESTAMPTZ,
  availability_note TEXT,

  sort_order INT NOT NULL DEFAULT 0,
  CHECK (product_id IS NOT NULL OR combo_id IS NOT NULL)
);
CREATE INDEX ON inquiry_items (inquiry_id);
CREATE INDEX ON inquiry_items (product_id);   -- demand signal per SKU
```

### 6.3 New: `inquiry_events` — pipeline history

```sql
CREATE TABLE inquiry_events (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id UUID NOT NULL REFERENCES inquiries(id),
  from_status TEXT, to_status TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer','agent','system')),
  actor_id UUID, note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON inquiry_events (inquiry_id, created_at);
```

### 6.4 Changes to existing tables

| Table | Change | Why |
|---|---|---|
| **`products`** | **ADD `fulfilment_mode TEXT NOT NULL DEFAULT 'inquiry' CHECK (fulfilment_mode IN ('inquiry','instant'))`** | **The single most important column in this pivot.** Drives CTA, availability call, checkout route — per product, not per site |
| `orders` | ADD `source_inquiry_id UUID REFERENCES inquiries(id)` | Closes the loop; enables inquiry→won attribution |
| `orders` | ADD `payment_collection TEXT DEFAULT 'gateway' CHECK (... IN ('gateway','manual_link','bank_transfer'))` | Records that a payment link was sent manually |
| `order_attribution` | No change | Already carries `fbclid`/`fbc`/`fbp` — copy from the inquiry at conversion |
| `leads` | **Deprecate.** Migrate to `inquiries` | One queue |
| `agent_quotes` (§09) | Keep. ADD `inquiry_id UUID REFERENCES inquiries(id)` | Quotes now hang off inquiries |
| `admin_users` | No change | `whatsapp_display_name`, `photo_url` already exist — now essential (§3.5) |
| `settings` | Seed `sla.inquiry_response_minutes`, `sla.business_hours`, `sla.timezone` | Admin-editable SLA, no deploy |
| `wa_conversations` | ADD `inquiry_id UUID REFERENCES inquiries(id)` | Link conversation to structured inquiry |
| `quotes`, `availability_cache`, `capacity_ledger`, `supplier_bookings`, `vouchers`, `payments`, `refunds` | **No change. Retained, unused** | They come back untouched |

### 6.5 How Rathin integration connects later — no schema rewrite

Three mechanisms, all present from day one:

1. **`products.fulfilment_mode`.** Flip a product to `'instant'` and the ADP renders the availability call and "Book now"; the checkout route un-gates. No migration, no data change, no frontend rebuild.
2. **`inquiry_items` ≡ `order_items`.** Conversion is a column-for-column copy. The `indicative_*` columns become the `*` columns; `confirmed_total_inr` wins where present. Writing that converter now, against the manual flow, means it is already tested when the API arrives.
3. **The order path never changes.** Whether an order originates from an agent (today) or from self-serve checkout (later), it is `order.createOrder(input, actor)`. Vouchers, notifications and analytics are already correct for both.

**The conversion function is the load-bearing artefact.** Build `inquiry.convertToOrder(inquiryId, actor)` in the first phase, use it from the admin panel for every won inquiry, and by the time Rathin is live it will have been exercised hundreds of times.

---

## 7. Operations Workflow

### 7.1 Status pipeline

```
   new ──► assigned ──► contacted ──► quoted ──► negotiating ──► payment_pending ──► won
    │          │            │            │            │                │
    │          │            │            │            │                └──► (payment fails/expires) ──┐
    └──► spam  └────────────┴────────────┴────────────┴────────────────────────────────► lost ◄───────┘
```

| Status | Meaning | Owner | Exit |
|---|---|---|---|
| `new` | Submitted, unassigned | System | Auto-assign within 60s |
| `assigned` | Agent owns it, SLA running | Agent | First outbound contact |
| `contacted` | Agent has replied; `first_response_at` set | Agent | Options sent |
| `quoted` | 3 options sent with confirmed price + availability | Agent | Customer responds |
| `negotiating` | Active back-and-forth | Agent | Accept or decline |
| `payment_pending` | Razorpay link sent | Agent | Paid / expired |
| `won` | Paid → **order created** | System | Terminal |
| `lost` | Declined, unreachable, or expired | Agent | Terminal, with reason |
| `spam` | Junk | Agent / auto | Terminal |

### 7.2 SOP

**T+0 — submission (automatic, < 60 seconds)**
1. Validate, rate-limit, spam-check (§9)
2. Snapshot indicative prices and net cost
3. Create `inquiry` + `inquiry_items`
4. Compute `sla_due_at` = now + 30 min, **adjusted for business hours**
5. Auto-assign (§7.3)
6. **WhatsApp ack to customer**: reference + named agent + *concrete deadline timestamp*
7. Email ack (fallback)
8. **Ops alert**: WhatsApp group + admin queue badge
9. Emit `inquiry_submitted` server-side → Meta CAPI `Lead`

**T+0 to T+30 — agent response**
10. Agent opens inquiry → **customer 360 in one click** (§09, `AC-SUP-02`): browsing context, items, dates, pax, dietary, past inquiries
11. **Check availability manually** — Rathin portal, supplier WhatsApp, or the direct operator
12. **Confirm net rate**, verify margin against the tier floor
13. **Send three options** (§09.3.3 rule survives intact): the SKU asked for, a better variant, a combo
14. Set `first_response_at` — this is the 30-minute measurement

**T+30 onward — conversion**
15. Customer responds → `negotiating`
16. On acceptance: agent generates a **Razorpay Payment Link** (dashboard), sends in-thread on WhatsApp → `payment_pending`
17. Payment confirmed → agent records it → **`inquiry.convertToOrder()`** → `won`
18. Order enters the **existing** fulfilment and voucher pipeline unchanged

**Follow-up ladder (automatic, consent-gated)**
- T+2h no customer reply → agent nudge
- T+24h → second nudge with a softer option
- T+72h → final message
- T+7d → `lost`, reason `no_response`

### 7.3 Lead routing

Assignment rules, in order:

1. **Returning customer** → previously assigned agent, if available (relationship continuity beats load balance)
2. **Tier D / value > ₹1,00,000** → senior agent or named coordinator
3. **UAE-resident (AED currency or UAE geo)** → UAE-shift agent
4. **Language/skill match** (`agent_availability.skills` — already in §09)
5. **Round-robin** among available agents under `max_concurrent`
6. **Out of hours** → queue to the next shift, ack states the real time

### 7.4 Ownership

| Role | Owns |
|---|---|
| **Agent** | The inquiry end to end — response, availability, quote, payment link, conversion |
| **Agent Lead** | SLA breaches, escalations, margin-floor overrides, reassignment |
| **Ops** | Supplier relationships, availability escalation, product and price accuracy |
| **Finance** | Payment reconciliation against Razorpay |
| **Chirag** | Weekly: response-time distribution, inquiry→won by tier, loss reasons, CAC |

### 7.5 Failure handling

| Failure | Response |
|---|---|
| **SLA breach (30 min)** | Auto-escalate to agent lead + reassign. Customer gets a proactive *"still checking, back to you by X"* — never silence |
| **Supplier unavailable** | Agent offers alternatives **before any money moves** — the §06.6 rejection saga, but pre-payment and therefore harmless |
| **Price moved above indicative** | Agent states old and new with the reason. Customer decides. **Never quietly quote higher** |
| **Margin below floor** | Blocked; `pricing.override_floor` required (Admin / Agent Lead only), reason logged |
| **Customer unreachable** | Follow-up ladder, then `lost` |
| **Payment link expires** | One re-send, then `lost` with reason |
| **Wrong number / fake lead** | `spam`; number added to a suppression list |
| **Agent unavailable mid-inquiry** | Lead reassigns; full history travels with the inquiry |
| **Out-of-hours surge** | Ack always fires; queue by value; next shift works highest-value first |

### 7.6 Measurement (weekly, non-negotiable)

Median and p90 first response · inquiry→won by tier · inquiry→won by source · loss reasons · agent conversion · **SLA hit rate**. The SLA hit rate is the one that governs whether the 30-minute promise stays on the homepage.

---

## 8. Future API Readiness

### 8.1 Checklist

| # | Requirement | How it is met | Status |
|---|---|---|---|
| 1 | Per-product mode switch, no site-wide flag | `products.fulfilment_mode` | ✅ by design |
| 2 | Inquiry items structurally identical to order items | `inquiry_items` mirrors `order_items` column-for-column | ✅ by design |
| 3 | Conversion is a copy, not a translation | `inquiry.convertToOrder()`, built and exercised from day one | ✅ by design |
| 4 | Order creation path never changes | Agent and self-serve both call `order.createOrder(input, actor)` | ✅ already true |
| 5 | Booking-mode UI gated, not deleted | Checkout steps 3–4, availability call, voucher route retained behind the flag | ✅ by design |
| 6 | Supplier abstraction preserved | §02 port untouched; §16 changes stand | ✅ unaffected |
| 7 | Pricing engine keeps net-rate and margin logic | Active, in a display + triage role | ✅ unaffected |
| 8 | Quote/availability/capacity schemas retained | Present, unused | ✅ by design |
| 9 | Attribution survives inquiry→order | `order_attribution` copied from the inquiry at conversion | ✅ by design |
| 10 | Analytics supports both terminal events | `inquiry_submitted` + `booking_confirmed` coexist | ✅ by design |
| 11 | Mixed catalogue renders coherently | One conditional in the CTA component | ✅ by design |
| 12 | No new dependencies added | 21st.dev as design source only, per the house rule | ✅ by design |

### 8.2 Migration strategy — the flip

**Per SKU, reversible, no downtime, no migration.**

1. Rathin adapter passes the §16 Phase 2b validation gate
2. Pick **one** low-risk Tier A SKU. Set `fulfilment_mode = 'instant'`
3. That ADP renders the availability call and "Book now"; checkout un-gates for carts containing only instant SKUs
4. Monitor for a week: price integrity, voucher latency, supplier failures
5. Widen one SKU at a time
6. **Mixed carts:** a cart containing any `inquiry` SKU routes to the inquiry flow. Simplest correct rule, and it protects the margin SKUs
7. **Instant SKUs keep "Ask on WhatsApp"** at equal weight — Rail B never goes away

**Rollback is setting the column back to `'inquiry'`.** That property is worth more than it looks: it means going live with Rathin is a reversible decision rather than a commitment.

### 8.3 Plug-and-play readiness score

**8.5 / 10.**

| Dimension | Score | Note |
|---|---|---|
| Database | 9 | Mirroring + the mode column; no rewrite |
| Backend services | 9 | Order path unchanged; inquiry service is additive |
| Frontend | 8 | Gated not deleted, but ADP and checkout need careful conditional work |
| Supplier layer | 10 | Entirely unaffected |
| Analytics | 8 | Both events coexist; offline upload needs to be right |
| Operations | 7 | Ops must learn a second mode; two flows running side by side is a training cost |

**Not 10/10, and the missing 1.5 is honest:** the ADP and checkout will carry conditional logic for as long as both modes exist — which is forever, not temporarily. That is a permanent complexity cost, and it is the correct trade because most of your margin will always be inquiry-mode.

### 8.4 Decisions that could create technical debt

| Risk | Severity | Avoid by |
|---|---|---|
| **Building the inquiry form as a standalone page divorced from the cart** | **High** | It must write `inquiry_items` in `order_items` shape. A flat "message" field would destroy §8.1 items 2–3 |
| **Deleting checkout steps 3–4 instead of gating them** | **High** | Flag-gate. Deleting is a rebuild later |
| **Storing inquiry prices as text or in major units** | **High** | `BIGINT` minor units, same as everywhere else (§05 principle 1) |
| **A site-wide `INQUIRY_MODE` env flag** | **High** | Per-product column. A global flag makes a mixed catalogue impossible |
| **Letting agents create orders through a bypass** | **High** | Same `order.createOrder()`, always. §06.9 |
| **Skipping attribution on inquiries** | **Medium** | Capture `fbclid`/`fbc`/`fbp` at submission. Without it, Rail B is invisible to Meta — the expensive mistake §11 already warns about |
| **Treating `leads` and `inquiries` as separate** | **Medium** | Merge now, while `leads` is empty |
| **Hard-coding 30 minutes** | **Low** | `settings.sla.inquiry_response_minutes` |
| **Removing prices "temporarily"** | **Medium** | Decided: prices stay. Removing and restoring would cost the SEO twice |

---

## 9. Security Review

Threats change materially: the money path is gone, and a public form that reaches a human is now the front door.

| # | Risk | Likelihood | Impact | Mitigation (lightweight) |
|---|---|---|---|---|
| 1 | **Spam / bot submissions** | **High** | Wastes the throughput that is now your binding constraint | **Honeypot field + submission-timing check** (reject < 2s) + rate limit **3/phone/hour, 10/IP/hour**. **No CAPTCHA initially** — it costs real conversions. Add Cloudflare Turnstile only if spam actually appears |
| 2 | **Fake / junk phone numbers** | **High** | Agent time wasted | **Do not OTP-verify at submission** — it would gut conversion. Verify implicitly: the WhatsApp ack either delivers or does not. Auto-flag `spam` on undelivered ack + no engagement. Maintain a suppression list |
| 3 | **Competitor price harvesting** | Medium | Low real harm | Prices are public anyway. Rate-limit the catalogue API (already §12). Do not expose net cost or margin on any public endpoint — ever |
| 4 | **Inquiry reference enumeration** | Medium | PII exposure | Reference + phone required for lookup; **5/IP/15min** (same control as booking lookup, §12) |
| 5 | **WhatsApp number abuse** | Medium | Ops disruption | BSP-level blocking; suppression list; never publish an agent's personal number |
| 6 | **Form field injection / XSS via notes** | Low | Stored XSS in the admin console | Sanitise on write, encode on output. The admin renders customer text — treat it as untrusted |
| 7 | **PII over-collection** | Medium | DPDP exposure | Two required fields. Dietary and accessibility are operational data — never forwarded to analytics or ad platforms (§13.7.1) |
| 8 | **Admin/agent compromise** | Low | Catastrophic — full customer list | MFA mandatory (already §13). PII access logged per 360 view |
| 9 | **Agent exfiltration of the lead list** | **Medium** | Your customer list is the asset | Rate-limit and audit-log bulk views; `customers.export` restricted to Admin + Finance (already §09.4) |
| 10 | **Consent drift** | Medium | DPDP | Consent captured at submission with `evidence`; re-checked at send time, not schedule time (§08.7) |

**Deliberately not doing at launch:** CAPTCHA, phone OTP on the form, email verification. Each is a measurable conversion cost against a threat that has not yet materialised. Add them **when spam volume justifies it**, and measure the conversion delta when you do.

---

## 10. Open Questions

**Not blocking — sensible defaults assumed, flagged for confirmation.**

1. **WhatsApp: BSP or click-to-chat at launch?** Assumed **click-to-chat now, BSP shortly after**. Click-to-chat works today with zero verification delay and the deep links are already built. **But the automated ack (§7.2 step 6) requires a BSP** — without it, the 30-minute promise has no instant acknowledgement, which is the highest-value element of the whole flow. Recommend starting BSP verification immediately; it is the long pole.
2. **Business hours and timezone for the SLA.** Assumed 9am–11pm IST with UAE-shift extension. Needs the real shift pattern to compute `sla_due_at` correctly.
3. **How many agents at launch, and `max_concurrent` per agent?** Sets the routing rules and the point at which inquiry volume outruns capacity.
4. **Indicative price tolerance.** If the confirmed price exceeds the indicative by more than X%, what happens? Recommend: the agent must explain and the customer must re-consent above **5%** — consistent with `AC-CO-04`'s existing spirit.
5. **Catalogue size at launch** — still 26 SKUs? Affects whether admin product CRUD is needed in the first phase or can wait.
6. **Does Holiday Chacha's existing CRM matter?** If ops already live in a tool, forcing them into a new console is a real adoption risk. Worth checking before building the queue UI.
7. **Is Rathin still being pursued?** §16 says NOT READY with 8 blocking questions. Inquiry mode removes the urgency entirely. Recommend parking it and prioritising the 6–8 direct Tier B suppliers — where the margin actually is.

**No blocking questions remain.** The pivot can be specified in full against the decisions recorded above.

---

## Appendix — Recommended phasing

Sequenced by value, with a launchable line. No fixed dates.

| Phase | Ships | Launchable? |
|---|---|---|
| **A — Inquiry core** | `inquiries` + `inquiry_items` + `inquiry_events` · `POST /api/inquiries` · inquiry form (21st.dev patterns) · inquiry cart · ADP/CTA copy changes · email ack · admin inquiry queue with statuses · `fulfilment_mode` column | **Not yet** — no instant ack |
| **B — The promise** | WhatsApp BSP + 2 templates · automatic ack with concrete deadline · SLA timer + business-hours calculation · ops alerting · auto-assignment | ✅ **LAUNCH HERE.** Everything needed to make and keep the 30-minute promise |
| **C — Agent effectiveness** | Customer 360 · three-option quote builder with margin · manual payment-link recording · **`inquiry.convertToOrder()`** · follow-up ladder | Strongly recommended before scaling spend |
| **D — Measurement** | `inquiry_*` events · Meta CAPI `Lead` · **offline conversion upload** · funnel + SLA dashboards · CAC by won inquiry | Before scaling spend — non-negotiable |
| **E — Hardening** | Spam controls tuned to real traffic · admin product/pricing CRUD · response-time public proof · loss-reason analysis | Ongoing |
| **F — Instant mode** | Rathin per §16 Phase 2a/2b/2c · flip one Tier A SKU · widen | Only after §16's 8 blocking questions close |

**Phase B is the launch line.** A and B together are a small build — most of it is copy changes, one new table pair, one form, one queue screen, and a BSP integration.
