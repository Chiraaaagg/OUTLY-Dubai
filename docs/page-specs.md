# Page-by-page specifications

Each page states its job, content hierarchy, CTAs, states and events. Every page
implements: responsive behaviour, loading, empty, error, accessibility and a
recovery path.

---

## Homepage — `/`

**Job (PRD §5.1):** establish trust in under 5 seconds, route to intent in
under 15.

| # | Section | Purpose | Primary CTA | Secondary | Mobile adaptation |
|---|---|---|---|---|---|
| 0 | Trust bar | The first claim a stranger reads | — | Help / Manage booking | Shortened copy, not truncated |
| 1 | Header + search | Route to intent | Search | Category nav | Drawer; search on its own row |
| 2 | Hero | State what we sell and why us | Find things to do | Quick chips | Illustration hidden below `lg` |
| 3 | Trust marquee | Compress eight claims | — | — | Same, masked edges |
| 4 | Available today & tomorrow | Serve last-minute + expat | Card → ADP | See all last-minute | Swipe rail |
| 5 | Top experiences | **Tier B/C only** — the margin engine | Card → ADP | Ask on WhatsApp | Swipe rail |
| 6 | Combo rail | Tier C — the take-rate lever | See package | All combos | Swipe rail |
| 7 | Category grid | Undecided visitors | Category → listing | — | 2 columns |
| 8 | Desert safari band | Highest-margin, highest-anxiety category | Compare all safaris | See the gentle safari | Stacks |
| 9 | Collections | Route by who you travel with | Collection | — | 1–2 columns |
| 10 | Family rail | Persona A | Card → ADP | See collection | Swipe |
| 11 | Cruises band (dark) | Visual contrast + private/shared honesty | Card → ADP | All cruises | Swipe |
| 12 | Couple + luxury rails | Personas B and C | Card → ADP | Collection | Swipe |
| 13 | Seasonal + four value tiles | Timely relevance | Tile → landing page | — | Stacks |
| 14 | Social proof | Verified reviews + platform stats | — | — | Swipe |
| 15 | Why OUTLYY | Four checkable promises | — | — | 1 column |
| 16 | FAQ + WhatsApp | Objection handling | Chat with a Dubai expert | — | Card moves below |

**Merchandising rule enforced:** no Tier A SKU appears in positions 1–8 of any
hero rail (AC-HP-05). Tier A appears in the category grid and on attraction
hubs, where it belongs.

**Loading:** server-rendered; rails ship with content. **Empty/fallback:** a
rail with no qualifying SKUs is omitted rather than rendered empty.
**Events:** `page_view`, `search_started`, `search_submitted`, `filter_applied`
(chips), `activity_card_viewed`, `whatsapp_initiated`.

---

## SEO landing template — `/lp/[slug]` and six top-level routes

**Job:** answer the search query in the first screen, then convert.

Module order is conversion-ordered: hero (answers the query) → four benefits →
featured activities → comparison module → combos → 400+ words of unique body
copy → social proof + trust → FAQs → WhatsApp → internal links.

- **Content gate:** `body` is required config, not optional. PRD §7 sets a
  400-word non-boilerplate minimum; thin doorway pages waste the entire SEO
  spend.
- **Structured data:** FAQPage + ItemList per page.
- **Sticky mobile CTA:** appears after 640px with the from-price and both rails.
- **CTAs:** primary "See experiences from ₹X"; secondary "Read the FAQs";
  persistent WhatsApp.
- **Events:** `landing_page_view` with `landing_page`, then standard card and
  WhatsApp events.

Six queries earn top-level URLs (for Indians, with UPI, last-minute, hotel
pickup, attraction combos, Abu Dhabi day tours); eight more render through
`/lp/[slug]`. Same template, entirely different content.

---

## Category — `/categories/[slug]`

**Job:** rank for the category term, then convert the visitor who arrives on it.

Hero (scrim over scene) → curated "our picks" (4, Tier B/C first) → filtered
grid with sidebar/drawer → 300–600 words of unique copy → FAQ → WhatsApp →
related categories.

- Server-rendered and crawlable without JS (AC-CAT-02).
- Unique H1, meta title, meta description and ≥300 words (AC-CAT-01).
- **States:** results / near-matches / empty / filter applied.
- **Events:** `page_view`, `filter_applied`, `sort_applied`, `activity_card_viewed`.

## Attraction hub — `/attractions/[slug]`

Ranks on the attraction name; routes to margin. Tickets first (≥2 internal links
to Tier B/C above the fold, AC-CAT-03), then packages containing it, then
practical info (location, hours, time needed, transport, height limits), best
time to go, getting there, FAQs.

## Collection — `/collections/[slug]`

Editorial: narrative first, curated SKUs second, ordered deliberately. Premium
collections switch the WhatsApp card to the dark concierge treatment.

---

## Activity detail page — `/activities/[slug]`

**The most important page.** It converts self-serve buyers *and* equips
comparison shoppers.

Order (mobile, top to bottom):

1. Breadcrumbs
2. Gallery — snap rail with counter (mobile) / mosaic + lightbox (desktop)
3. Title, subtitle, rating, review count, "X booked this month", location
4. **Key attributes strip** — duration, private/shared, pickup, mobile voucher
5. Badge row — instant confirmation, free cancellation, Jain & veg,
   senior-friendly, private, verified supplier
6. Price block (mobile) — all-in, child/senior/infant rates, savings
7. **Meal & dietary** — where applicable; Persona A converts here
8. Inclusions / exclusions in two explicit columns
9. Itinerary timeline
10. Pickup & transfers — zones, meeting point, **the stated remedy if the driver is late**
11. Before you book + cancellation policy in plain language
12. Frequently booked together (cross-sell)
13. Combo upsell with verifiable savings
14. Reviews, filterable by traveller type
15. FAQs
16. WhatsApp card
17. Related experiences
18. Sticky mobile booking bar; floating WhatsApp raised above it

Sidebar (desktop, sticky): price block → **BookingWidget** → trust summary.

**BookingWidget states:** loading (skeleton) · available · limited (real count,
labelled as the operator's) · sold out (next three dates) · error/timeout (retry
+ WhatsApp) · quote-only (Tier D, no fabricated price).

**Acceptance criteria implemented:** AC-ADP-01 (skeleton under 1.5s),
AC-ADP-02 (next three dates), AC-ADP-03 (WhatsApp pre-populated + logged),
AC-ADP-04 (dietary above the fold), AC-ADP-05 (displayed price = charged
price), AC-ADP-06 (quote CTA), AC-ADP-07 (Product + AggregateRating + FAQ +
BreadcrumbList).

---

## Search — `/search`

Filter state lives entirely in the URL (AC-SRCH-02): shareable, back-button
safe, server-rendered.

Filter order reflects the wedge: **When → Food → Who's coming → Booking
convenience → Price → Category → Duration → Rating.**

Sort: Recommended (business-weighted) · Most booked · Price ↑↓ · Rating ·
Duration. The sort sheet explains what "Recommended" blends, because pretending
it is neutral is the kind of small dishonesty this product is positioned
against.

**States:** results · near-matches (AC-SRCH-01) · true empty · loading
(`loading.tsx` skeleton matching the real grid) · filter applied · error.
**Compare tray** appears at two selections (AC-SRCH-04).

## Compare — `/compare`

Up to three SKUs across price, duration, pickup, confirmation, cancellation,
food and private availability. Empty state explains how to add. Suggestions when
under three.

---

## Cart / trip builder — `/cart`

Not a standard cart — a **trip timeline**. Chronological day-by-day grouping,
time-conflict warnings (AC-CART-01), a relevant upsell whenever anything is in
the cart (AC-CART-02), and a **visible** 20-minute price-lock timer.

## Checkout — `/checkout`

Four steps, one page. See `checkout-optimisation.md` for the full rationale and
the state list.

## Confirmation — `/booking/confirmation`

Two first-class states: confirmed and supplier-pending. Reference with
copy-to-clipboard, voucher + WhatsApp actions, booking detail, before-you-go,
what-to-do-if-something-goes-wrong, pending explainer, optional account
creation, cross-sell, referral and review setup.

## Voucher — `/voucher/[reference]`

Everything PRD §5.7 requires on the voucher itself: reference, QR, activity,
date, time, pax, supplier contact, driver details, pickup, inclusions,
**emergency number** and cancellation terms. Print stylesheet targets A4.
Missing/pending references get an explanatory state, not a 404.

## Booking management — `/booking/[reference]`, `/manage-booking`

Public lookup by reference + phone/email. Driver panel inside 48 hours.
Self-serve cancellation shows the exact refund and credit date **before**
confirming (AC-BM-01), with a "talk to us first" WhatsApp offer inside the
sheet. Date change shows any fee before confirming. In-trip attach rail.

## Account — `/account`, `/bookings`, `/saved`, `/profile`, `/referrals`

Dashboard leads with the next trip and a countdown. Trips grouped by trip, not
order. Wishlist is shareable — the family decision-making mechanic. Profile
carries communication preferences (honoured immediately), tokenised payment
methods, currency, and data export/deletion.

## Support surfaces — `/support`, `/faq`, `/contact`, `/concierge`

Self-serve first, then WhatsApp, then phone, then 24/7 emergency. FAQ is grouped
by the six things that actually stop a booking. Concierge is a lead form with a
named-coordinator promise and a two-hour quote commitment.

## System pages

`/404` recovery grid · `/maintenance` (support and vouchers explicitly
unaffected) · `error.tsx` (retry + WhatsApp + digest) · `global-error.tsx`
(zero imports, inline styles, emergency number) · `/design-system`.
