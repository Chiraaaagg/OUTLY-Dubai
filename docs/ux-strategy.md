# UX strategy & competitor analysis

## 1. Who we are actually competing with

The PRD is unambiguous and the whole design follows from it: **the competitor is
the local travel agent, not Klook.** A product that is merely a better Klook
loses to the agent on trust and wins nothing.

| Agent strength | How the interface answers it |
|---|---|
| A trusted human | WhatsApp CTA at equal visual weight to Book now on every ADP, with page context passed into the conversation |
| INR pricing, EMI | All-in rupee prices everywhere; UPI first at checkout; EMI above ₹15,000; 30/70 deposit above ₹25,000 |
| Hand-holding | Assisted rail, trip timeline in the cart, driver details the night before, named coordinator on premium |
| Local reference | Verified reviews filterable by traveller type, with a dietary-met field |

| Agent weakness | How the interface exploits it |
|---|---|
| Opaque markup | "Includes all taxes and fees" under every price; no fee may appear after the first price shown |
| Limited inventory | A curated catalogue with the reasoning stated, plus quoted access to what isn't listed |
| Slow quotes | Instant self-serve booking with live availability |
| No reviews | Verified-booking reviews with photo support |
| No post-booking service | Self-serve cancellation and date change with the refund shown before confirming |

## 2. Competitor analysis

**Method and its limits.** Klook, GetYourGuide, Viator and Headout all blocked
automated access during this build (HTTP 403 and connection refusals), so this
analysis is written from prior working knowledge of their public products rather
than from a fresh crawl. The patterns below are stable, long-standing ones
rather than anything version-specific — but they are not a September 2026
snapshot, and anything load-bearing should be re-verified by hand before it
informs a roadmap decision.

### What each does well

**Klook** — the strongest at *density without chaos*. City pages act as
merchandising surfaces rather than category listings: rails by intent ("Popular
in Dubai", "Best deals"), heavy use of badges, and a card that packs rating,
review count, price, discount and a "X booked" signal into a small footprint.
App-first behaviours (coupons, credits) drive repeat.
*Take:* the intent-rail model, and card density.
*Leave:* the coupon-and-credit layering, which trains customers to wait for a
discount and quietly erodes take rate.

**GetYourGuide** — the cleanest *product page*. Strong photography, a clear
free-cancellation promise near the top, transparent inclusion lists, and a
booking widget that responds to date and pax immediately rather than after a
"check availability" round trip. Reviews are prominent and skimmable.
*Take:* the live-responding booking widget and the cancellation promise placed
high; the calm, uncrowded ADP.
*Leave:* the relatively generic attribute set — nothing in it speaks to dietary
or multi-generational travel.

**Viator** — the best *filtering and scale* experience, and the most honest
about supply: "Likely to sell out" and free-cancellation filters are genuinely
useful. Cross-sell after booking is well-judged.
*Take:* filter breadth, and surfacing cancellation terms as a filter rather than
a footnote.
*Leave:* the sheer option count, which is precisely the paralysis the PRD's
"certainty over selection" principle is written against.

**Headout** — the sharpest *conversion mechanics* and the best programmatic SEO
model. Attraction-first URLs, aggressive but legible price presentation, tight
mobile flows, and a very short path from landing to checkout.
*Take:* the attraction-hub pattern (rank on the attraction, route to the
margin-carrying SKUs) and the short mobile path.
*Leave:* the urgency treatments — countdowns and scarcity language that isn't
always tied to real inventory.

### Cross-cutting patterns worth adopting

1. Timed-slot selection inline on the product page, not behind a modal.
2. Badge systems that compress trust attributes into a scannable row.
3. Sticky mobile booking bars.
4. Post-booking cross-sell at the confirmation step, when intent is highest.
5. Skeletons matched to the real layout so lists don't jump.

### Where OUTLYY deliberately differs

| Competitor norm | OUTLYY |
|---|---|
| Price + "taxes calculated at checkout" | All-in price, with the tax line stated as a promise |
| Dietary needs as a free-text note | Dietary as a **primary search facet**, confirmed with the supplier and printed on the voucher |
| "Suitable for all" | Explicit suitability variants — a gentle safari with no dune bashing is its own bookable product |
| Scarcity copy loosely tied to inventory | Urgency only from live supplier availability; the ADP says the count is the operator's, not ours |
| Support widget in the corner | WhatsApp as a first-class booking rail with page context passed in |
| Maximum catalogue | Curated catalogue with the reasoning published on `/activities` |
| Struck-through "was" prices | Comparison price only where a real published gate rate exists |

**What we do not copy:** no competitor layout, visual identity, illustration
style, copy or component code was reproduced. The visual system — illustrated
SVG scenes, sand ground, marigold primary, sticker accents — has no analogue in
any of the four.

## 3. Design principles applied

The PRD's six principles map to concrete implementation decisions:

1. **Certainty over selection.** 26 SKUs. `/activities` opens by explaining why
   the number is small. Category pages lead with "the ones we'd book ourselves"
   before the full grid.
2. **Price honesty is the product.** `PriceBlock` renders the tax line as part
   of the component, not as optional copy. `computeBreakdown` has no place to
   add a fee. The price promise is its own page.
3. **Dietary, accessibility and language are first-class filters.** "Food" and
   "Who's coming" sit above Price and Duration in the filter panel. Jain is a
   filter value, an activity attribute, a checkout field, a voucher line and a
   review question.
4. **The human is a feature.** WhatsApp CTAs are `Button` variants, not links.
   `whatsapp.ts` passes SKU, dates, pax, price and checkout step into every
   conversation, and logs `whatsapp_initiated` as a conversion event.
5. **In-trip is a shopping session.** Booking detail pages carry an "Add to this
   trip" rail; confirmation carries cross-sell; the last-minute landing page is
   a top-level route.
6. **Mobile-first, Android-first, low-bandwidth-tolerant.** Illustrated SVG
   media instead of photography, three runtime dependencies, CSS-only motion,
   bottom sheets for every selector, 44px targets.

## 4. Conversion rationale, by decision

| Decision | Reasoning |
|---|---|
| Date + pax as the hero search inputs, not a text box | Destination is fixed. A search box asks the customer to name something they haven't chosen yet |
| Both CTAs on the ADP at equal weight | The two rails serve different buyers. Demoting either loses that segment |
| Full inclusions **and** exclusions in two columns | Persona A compares in tabs. Making the comparison easy is the conversion act |
| Cancellation policy in plain language, high on the page | It's an objection, and objections convert better answered early |
| Gentle safari as a separate SKU | "Ask the driver to go slower" is not a product. A bookable variant is |
| Savings shown against separate-purchase price on combos | A verifiable number outperforms a larger unverifiable one |
| Guest checkout, account offered after payment | Forced registration is a conversion tax; the PRD says so outright |
| Coupon field on review, not payment | Hunting for a code at the payment step is a documented abandonment trigger |
| Sticky bar appears after 520px of scroll | Competing with the hero CTA wastes both |
| Near-matches instead of empty states | Zero results is the single highest-drop-off moment in search |
| Price lock timer shown, not hidden | A silent expiry that changes the price is the exact behaviour we exist to avoid |

## 5. Funnel, stage by stage

| Stage | Intent | Objection | What answers it | Primary CTA | Drop-off risk | Recovery |
|---|---|---|---|---|---|---|
| Paid / organic landing | "Can I trust this?" | Unknown brand | Trust bar, all-in price, verified reviews | See experiences | Slow LCP on 4G | SVG media, SSR, no blocking JS |
| Discovery | "What's worth doing?" | Too many options | Curated rails, intent chips | Card → ADP | Choice paralysis | Collections framed by who you travel with |
| Search / category | "What fits my group?" | Filters return nothing | Dietary and suitability facets | Card → ADP | Zero results | Near-matches naming the relaxed constraint |
| Comparison | "Which of these three?" | Opaque differences | Compare tray + comparison table | Add to compare | Leaves to competitor tabs | The table is built for them |
| ADP | "Is this right for us?" | Food, mobility, pickup | Meal section, variants, pickup zones, remedy | Book now / Ask on WhatsApp | Unanswered anxiety | WhatsApp with full context |
| Date & pax | "Is it available?" | Uncertainty | Live availability, next-3-dates | Select | Sold-out dead end | Alternative dates inline |
| Cart | "Does this plan work?" | Timing clashes | Day-by-day timeline, conflict warning | Checkout | Realising it doesn't fit | Conflict warning before payment |
| Checkout | "Will I be charged more?" | Hidden fees | Order summary restating the total | Pay | Payment friction | UPI first, WhatsApp handoff, cart preserved |
| Payment | "Did it work?" | Failure anxiety | Processing copy, plain-language errors | Retry | Failure abandonment | Retry, alternative method, agent payment link |
| Confirmation | "Where's my ticket?" | Delivery doubt | Reference, voucher CTAs, ETA | View voucher | — | Triple delivery + auto-resend |
| Pre-trip | "Will the driver come?" | Pickup anxiety | Driver name, photo, number at T-1 | — | — | Emergency number with a stated remedy |
| Post-trip | "Was it as promised?" | — | Review request with the dietary question | Write a review | Low review rate | One-tap WhatsApp entry |
| Repeat | "Where next?" | — | Account recommendations, referral credit | Book again | — | Expat seasonal campaigns |
