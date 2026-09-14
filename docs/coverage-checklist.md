# Coverage checklist

Status key: **✅ built** · **◐ built as UI with a mocked backend** · **○ not built (documented)**

## Pages

| Required page | Route | Status |
|---|---|---|
| Homepage | `/` | ✅ |
| SEO landing pages (14) | 6 top-level + `/lp/[slug]` × 8 | ✅ |
| Category listing pages (8) | `/categories/[slug]` | ✅ |
| Search results | `/search` | ✅ |
| Activity comparison | `/compare` + compare tray | ✅ |
| Activity detail pages (26) | `/activities/[slug]` | ✅ |
| Package / combo pages (6) | `/combos/[slug]` | ✅ |
| Family activity pages | `/lp/dubai-activities-for-families`, `/collections/dubai-with-kids`, `/categories/family-activities` | ✅ |
| Couple experience pages | `/lp/dubai-activities-for-couples`, `/collections/dubai-honeymoon` | ✅ |
| Luxury experience pages | `/lp/luxury-experiences-in-dubai`, `/collections/luxury-dubai`, `/categories/luxury-experiences` | ✅ |
| Last-minute booking pages | `/last-minute-dubai-activities` | ✅ |
| Seasonal campaign pages | Homepage seasonal module + `/collections/first-time-dubai` | ✅ |
| Checkout | `/checkout` | ◐ |
| Payment states | All 6 in checkout | ◐ |
| Booking confirmation | `/booking/confirmation` | ◐ |
| Voucher page | `/voucher/[reference]` | ◐ |
| Manage booking | `/manage-booking`, `/booking/[reference]` | ◐ |
| Booking cancellation flow | Cancellation sheet with refund quote | ◐ |
| Booking modification flow | Date-change sheet | ◐ |
| Customer account pages | `/account`, `/bookings`, `/saved`, `/profile`, `/referrals` | ◐ |
| Saved activities / wishlist | `/account/saved` | ✅ |
| Help & support | `/support` | ✅ |
| FAQ | `/faq` | ✅ |
| Contact | `/contact` | ◐ |
| WhatsApp assistance flow | 25+ contextual entry points | ✅ |
| Review submission | `/reviews/[booking]` | ◐ |
| Post-activity review experience | Review prompt on booking + account, dietary-met question | ✅ |
| Login / signup | `/login`, `/signup` | ◐ |
| 404 | `not-found.tsx` | ✅ |
| Maintenance | `/maintenance` | ✅ |
| Attraction hubs (6) | `/attractions/[slug]` | ✅ |
| Editorial collections (8) | `/collections/[slug]` | ✅ |
| Concierge / quote request | `/concierge` | ◐ |
| Trust & legal (5) | `/about`, `/terms`, `/privacy`, `/cancellation-policy`, `/price-guarantee` | ✅ |
| Design system & state gallery | `/design-system` | ✅ |
| sitemap.xml / robots.txt | `sitemap.ts`, `robots.ts` | ✅ |

## States

| State | Where | Status |
|---|---|---|
| Network error | `?mock=offline`, ErrorState | ✅ |
| API error | `?mock=error` | ✅ |
| API timeout | `?mock=timeout` | ✅ |
| Loading | Route skeletons, card skeletons, inline skeletons | ✅ |
| Skeleton | `SkeletonGrid`, `ActivityCardSkeleton`, `loading.tsx` | ✅ |
| Empty | Search, cart, wishlist, compare, trips, reviews | ✅ |
| No results with recovery | Near-matches naming the relaxed constraint | ✅ |
| Success | Booking, coupon, voucher sent, preferences, review, cancellation | ✅ |
| Failure | Payment failed, booking failed, form errors, lookup failed | ✅ |
| Supplier confirmation pending | ADP badge, checkout notice, confirmation, voucher, booking | ✅ |
| Activity sold out | `?mock=sold_out` → next three dates | ✅ |
| Date unavailable | Date strip + calendar disabled states | ✅ |
| Price changed | `?mock=price_changed` → explicit re-consent | ✅ |
| Payment processing / timeout | Checkout | ✅ |
| Pickup unavailable | `?mock=pickup_unavailable` | ✅ |
| Package unavailable | Combo confirmation state | ✅ |
| Filter applied | Pills with individual removal | ✅ |
| Route / root error boundaries | `error.tsx`, `global-error.tsx` | ✅ |

## Flows

| Flow | Status |
|---|---|
| Self-serve booking, end to end | ✅ verified in-browser |
| WhatsApp-assisted booking with context | ✅ |
| Comparison → decision | ✅ |
| Multi-activity trip building with conflict detection | ✅ |
| Guest checkout | ✅ |
| Deposit (30/70) | ✅ UI |
| Coupon application and rejection | ✅ |
| Voucher delivery and resend | ◐ |
| Cancellation with refund quote | ◐ |
| Date modification | ◐ |
| Booking lookup without an account | ◐ |
| Review submission with dietary verification | ◐ |
| Referral share | ◐ |
| Quote request (Tier D) | ◐ |
| OTP login | ◐ |

## Per-page requirements

Every implemented page has: a stated conversion or task objective · defined
content hierarchy · responsive behaviour · loading behaviour · empty behaviour ·
error behaviour · accessibility considerations · analytics events · a clear
primary CTA · a recovery path. Documented per page in `page-specs.md`.

## PRD acceptance criteria addressable in the frontend

| AC | Requirement | Status |
|---|---|---|
| AC-HP-02 | Quick-intent chip lands on a filtered search | ✅ |
| AC-HP-03 | UAE geo → AED + today/tomorrow | ◐ timezone-based mock |
| AC-HP-04 | WhatsApp CTA visible without scrolling at 360×640 | ✅ verified |
| AC-HP-05 | No Tier A SKU in hero rail positions 1–8 | ✅ enforced in code |
| AC-ADP-01 | Live price/availability or a skeleton | ✅ |
| AC-ADP-02 | No availability → next three dates | ✅ verified |
| AC-ADP-03 | WhatsApp pre-populated + event logged | ✅ |
| AC-ADP-04 | Dietary options above the fold | ✅ |
| AC-ADP-05 | Displayed price = charged price | ✅ single computation |
| AC-ADP-06 | Tier D → "Request a quote", no fabricated price | ✅ |
| AC-ADP-07 | Product + AggregateRating + FAQ structured data | ✅ |
| AC-SRCH-01 | Zero results → near-matches naming the constraint | ✅ verified |
| AC-SRCH-02 | Filters in the URL, shareable, back-safe | ✅ |
| AC-SRCH-04 | Compare tray at 2–3 selections | ✅ |
| AC-SRCH-05 | Ranking weights configurable | ✅ single config object |
| AC-CAT-01 | Unique H1, meta, ≥300 words per category | ✅ |
| AC-CAT-02 | Category pages crawlable without JS | ✅ |
| AC-CAT-03 | ≥2 internal links to Tier B/C above the fold on hubs | ✅ |
| AC-CART-01 | Time-conflict warning before checkout | ✅ |
| AC-CART-02 | Relevant upsell with a Tier B item present | ✅ |
| AC-CO-01 | Guest checkout completes without an account | ✅ verified |
| AC-CO-02 | Review total = charged total | ✅ |
| AC-CO-03 | Payment failure preserves the cart and explains | ✅ |
| AC-CO-04 | Price change requires re-consent | ✅ |
| AC-CO-06 | Abandoned-checkout consent captured | ✅ consent; sending pending |
| AC-CO-07 | No card data on our servers | ✅ no card fields exist |
| AC-VOU-04 | Voucher prints correctly on A4 | ✅ print stylesheet |
| AC-BM-01 | Exact refund and credit date before confirming | ✅ |
| AC-BM-03 | Supplier/driver + emergency contact inside 48h | ✅ |
| AC-ACC-01 | Phone OTP primary | ◐ UI only |
| AC-ACC-03 | Data export / deletion available | ◐ UI only |
| AC-REV-01 | Only completed bookings can review | ✅ reference-gated |
| AC-MOB-01 | Primary flows one-handed at 360×640 | ✅ |
| AC-MOB-04 | No horizontal scroll from 320px | ✅ verified at 360 |
| AC-SEO-01 | Indexable pages render server-side | ✅ |
| AC-SEO-02 | Unique title, description, H1, ≥400 words | ✅ landing pages |
| AC-AN-01/02 | Attribution and reconciliation | ○ server-side work |
| AC-INV-01 | Availability re-verified before authorisation | ✅ client seam; server enforcement required |
| AC-PAY-01 | Webhook-driven order state | ○ documented, backend work |
