# Information architecture, sitemap & user flows

## 1. Route decisions

The brief and the PRD specify two different URL taxonomies. Both are honoured:

- The **brief's routes are canonical** (`/activities/[slug]`, `/categories/[slug]`)
  because they are explicit, readable and better for SEO than single-letter
  prefixes.
- The **PRD's short forms are preserved as permanent redirects** in
  `next.config.mjs`, so any link built against `/d/…` or `/c/…` keeps working:

| From (PRD §4.1) | To (canonical) |
|---|---|
| `/d/[slug]` | `/activities/[slug]` |
| `/c/[slug]` | `/categories/[slug]` |
| `/packages/[slug]` | `/combos/[slug]` |
| `/experiences/[slug]` | `/collections/[slug]` |
| `/account/trips` | `/account/bookings` |
| `/account/wishlist` | `/account/saved` |

No duplicate route patterns were created: `/packages` and `/experiences` from
the brief resolve to the `/combos` and `/collections` implementations rather
than becoming second copies.

## 2. Complete sitemap

```
/                                     Homepage
/search                               Search results (filters in URL, noindex)
/activities                           Full catalogue
/activities/[slug]                    Activity detail page (26)
/categories/[slug]                    Category page (8)
/collections/[slug]                   Editorial collection (8)
/attractions/[slug]                   Attraction hub (6)
/combos/[slug]                        Package / combo detail (6)
/compare                              Side-by-side comparison (noindex)

SEO landing pages — top-level, highest-volume queries
/dubai-activities-for-indians
/dubai-activities-with-upi
/last-minute-dubai-activities
/dubai-activities-with-hotel-pickup
/dubai-attraction-combos
/abu-dhabi-day-tours-from-dubai

SEO landing pages — shared template
/lp/burj-khalifa-tickets
/lp/desert-safari-dubai
/lp/dubai-frame-tickets
/lp/atlantis-aquaventure-tickets
/lp/marina-cruise-dubai
/lp/dubai-activities-for-families
/lp/dubai-activities-for-couples
/lp/luxury-experiences-in-dubai

Booking funnel
/cart                                 Trip builder with timeline + conflicts
/checkout                             Four steps, one page
/booking/confirmation                 Confirmed or supplier-pending
/booking/[reference]                  Booking management (public lookup)
/voucher/[reference]                  Voucher, print-ready
/manage-booking                       Guest booking lookup

Account
/account                              Dashboard
/account/bookings                     My trips (upcoming / past)
/account/saved                        Wishlist, shareable
/account/profile                      Profile, comms, payment, data rights
/account/referrals                    Referral dashboard and credits

Support & conversion
/support                              Help centre
/faq                                  Six-section FAQ
/contact                              Contact form + channels
/concierge                            Luxury lead form (Persona C)
/reviews/[booking]                    Review submission

Auth
/login                                Phone OTP primary
/signup                               Optional account

Trust & legal
/about
/terms
/privacy
/cancellation-policy
/price-guarantee

System
/design-system                        Tokens, components, state gallery
/maintenance                          Maintenance mode
/404 (not-found.tsx)                  Recovery-oriented 404
error.tsx / global-error.tsx          Route and root error boundaries
/sitemap.xml
/robots.txt
```

**63 routes prerendered at build time**; `/search` and `/reviews/[booking]` are
server-rendered on demand.

## 3. Taxonomy rules

- Lowercase, hyphenated, no IDs where a slug exists.
- Category slugs are SEO-owned and permanent; a rename requires a 301 and
  product sign-off.
- Every activity belongs to exactly one primary category and 0–3 secondary ones.
- Attraction hubs aggregate every SKU for an attraction — the Tier A magnet
  surface that ranks, then routes traffic to Tier B/C.
- Personal surfaces (cart, checkout, account, vouchers, bookings, reviews) are
  `noindex` on the page **and** disallowed in `robots.txt`.
- Faceted search is disallowed rather than noindexed, so it consumes no crawl
  budget.

## 4. Navigation model

**Header** — trust bar (all-in pricing, no hidden fees, voucher time), then
logo, search, currency toggle, saved, cart, account, WhatsApp. Below it: six
primary categories plus four intent links. Mobile collapses to a drawer with
categories, curated collections and booking management, and the search bar moves
to its own full-width row.

**Footer** — four link columns organised by *task* rather than by site
structure: popular searches, for Indian travellers, your booking, and all
categories. Plus licence details, GST number, payment methods and support
numbers.

**Internal linking** — every category links to three related categories; every
landing page links to 4–6 related pages and 3 categories; attraction hubs link
to their SKUs and to combos containing them; the 404 links to bestsellers and
every category.

## 5. Key user flows

### 5.1 Rajesh — family, assisted (the hardest and most valuable path)

```
Google "dubai desert safari jain food"
  → /lp/desert-safari-dubai            (comparison module, three safaris)
  → /activities/evening-desert-safari-veg-jain
      reads meal section, pickup zones, cancellation
      sets 7 pax → total updates live
  → taps "Ask on WhatsApp"
      context passed: SKU, variant, date, 7-pax breakdown, price shown
  → agent replies with three options and a payment link
  → same order object, same voucher pipeline as self-serve
  → /voucher/[ref]  → T-1 driver details → post-trip review
```

Failure points designed against: filters returning nothing (near-matches), dune
bashing unsuitable for parents (gentle safari as its own SKU), Jain food
uncertainty (confirmed in writing, asked about again in the review).

### 5.2 Sana — expat, self-serve, last-minute

```
/last-minute-dubai-activities  (AED prices, today/tomorrow default)
  → /activities/[slug]  live availability for tomorrow
  → Book now → /checkout  (UAE card, ~90 seconds)
  → /booking/confirmation  → voucher on WhatsApp in under a minute
```

### 5.3 Aditya & Nisha — couple, visual-first

```
Instagram → /collections/dubai-honeymoon
  → /activities/luxury-yacht-tour-90min  (private vs shared stated up front)
  → sunset variant → cake add-on → checkout
```

### 5.4 Mr. Khanna — luxury, lead not cart

```
Google "dubai private yacht charter"
  → /activities/private-yacht-charter-sunset  (quote-only, no fabricated price)
  → /concierge?sku=…  → quote within two hours → agent-placed order
```

### 5.5 Recovery flows

| Situation | Path |
|---|---|
| Payment failed | Checkout keeps state → retry, alternative method, or WhatsApp payment link |
| Price changed | Old and new price shown → explicit re-consent → pay |
| Sold out at ADP | Next three available dates inline |
| Zero search results | Near-matches with the relaxed constraint named |
| Lost booking reference | `/manage-booking` → or WhatsApp with phone/email |
| Driver hasn't arrived | Voucher emergency number → replacement vehicle or full refund |
| Dietary request unmet | Same-day WhatsApp → meal refund + supplier scorecard |
| Broken link | 404 with bestsellers, categories and WhatsApp |
| Site down | `/maintenance` — booking paused, support and vouchers unaffected |
