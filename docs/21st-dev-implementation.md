# 21st.dev implementation plan

## 1. How 21st.dev was used

The 21st.dev MCP was used as the **design source** for this build: to survey how
the current generation of React component libraries solves each surface, to pull
reference implementations, and to decide what to adopt, what to adapt and what
to reject.

It was **not** used as a code-installation path. That is a deliberate
architectural decision, explained below.

### Searches run

| Query | Purpose |
|---|---|
| travel booking hero with search bar date picker | Hero search and calendar patterns |
| product card with price rating badges grid | Activity card anatomy |
| sticky bottom bar mobile checkout CTA | Sticky booking bar, bottom sheets |
| faceted filter sidebar ecommerce search results | Filter panel and searchable FAQ |
| testimonial marquee social proof reviews section | Trust marquee, review presentation |
| playful colorful bento hero section gradient | Hero treatment, bento tiles |
| 404 not found error page illustration | 404 recovery layout |
| ticket boarding pass card QR code | Voucher and confirmation card |
| design system color palette typography showcase | `/design-system` page structure |

### Components retrieved in full

- **Product Card** — `21st.dev/@educalvolpz/components/product-card` (with its
  `SmoothButton` dependency)

## 2. The adoption decision

Every 21st.dev component in this category ships on **shadcn/ui + Radix +
`motion/react` + `class-variance-authority`**. Installing them would have added
at least three runtime dependencies, with `motion` (framer-motion) the
heavyweight at roughly 40KB gzipped.

That conflicts directly with two PRD requirements:

- §15 — LCP < 2.5s at p75 on **mobile 4G**
- §6 — "Designed for a mid-range Android on hotel wifi", not merely "responsive"

So the patterns were adopted and reimplemented on OUTLY's own tokens with
**CSS-only motion and zero new dependencies**. Total runtime dependencies:
`lucide-react`, `clsx`, `tailwind-merge`. Shared first-load JS: ~102KB.

## 3. What was adapted, and how

| 21st.dev source | Pattern taken | OUTLY implementation | Deliberate change |
|---|---|---|---|
| Product Card (`@educalvolpz`) | Card anatomy: full-bleed image, badge top-left, wishlist top-right, rating row, price with strike-through and a discount chip, action button pinned to the bottom | `components/commerce/activity-card.tsx` | **Wishlist is never hover-gated.** The source reveals it on hover; on 80%+ mobile traffic hover does not exist, so ours is always visible at 44px. Motion is CSS `transition` + `@media (hover:hover)` rather than `motion/react`. Trust attributes (instant confirmation, free cancellation, dietary, pickup) outrank aesthetics on the card because they decide the click for this audience |
| Product Card | `useReducedMotion` gating every animation | Global `@media (prefers-reduced-motion: reduce)` in `globals.css` | Applies to every component at once, including third-party markup, rather than per-component |
| Product Card | Hover-device detection via `matchMedia("(hover: hover) and (pointer: fine)")` | CSS `[@media(hover:hover)]:` variants | Same behaviour, no JS, no hydration cost |
| Product Card | `-{n}%` discount chip | `SavingsBadge` | Only renders where `compareAt` is a genuinely verifiable published rate — no invented anchors |
| Product Grid Skeleton (`@cnippet-dev`) | Skeleton matching image + title + rating + price | `ActivityCardSkeleton`, `SkeletonGrid` | Aspect ratios and line counts match the real card exactly, so CLS from lists is ~0 |
| Booking Calendar / Appointment Calendar (`@cnippet-dev`) | Month grid with unavailable and fully-booked days greyed out, chosen slot highlighted | `DatePickerSheet` + `DateStrip` | Adds a **date strip** as the fast path — seven tappable days ahead of the calendar, because most bookings are within a week. Availability dots mark limited dates |
| Smooth Drawer (`@kokonutd`) | Bottom drawer with staggered content and a pricing block | `components/ui/sheet.tsx` | One primitive serves bottom sheet, centred dialog and right drawer. Adds focus trap, focus restore, Escape and scroll lock — the source is presentational only |
| Glass Checkout Card (`@moumensoliman`) | Payment-method selector layout | Checkout step 3 | No card fields anywhere — gateway-hosted only (AC-CO-07). Methods reordered for this audience: UPI first with the largest target |
| Testimonial Marquee (`@componentry`) | Infinite horizontal marquee with edge fade masks | `TrustMarquee` | CSS keyframes with a duplicated track instead of a JS animation loop; duplicated items `aria-hidden`; the same claims appear as real text in `WhyOutly` |
| Searchable FAQ Accordion (`@cnippet-dev`) | Expandable Q&A list | `components/ui/accordion.tsx` | Panels stay in the DOM when collapsed so FAQ content is crawlable for FAQPage structured data |
| Not Found 06 (`@shadcnui-blocks`) | 404 as a grid of real destination cards rather than a single Home button | `app/not-found.tsx` | Adds bestseller activity cards, every category, and a WhatsApp route — a dead end is a lost booking |
| Ticket Confirmation Card (`@ravikatiyar162`) + Admit One Ticket (`@larsen66`) | Receipt-style confirmation, perforated stub, barcode block | `/voucher/[reference]`, `ticket-edge` utility | Dashed perforation between sections, notch mask utility, print stylesheet targeting A4 (AC-VOU-04) |
| Color Palette branding card (`@ravikatiyar162`) | Palette + typography showcase | `/design-system` | Extended into a full state gallery with a live analytics event tail and the `?mock=` scenario switcher |
| Flight Search / Booking Form (`@ravikatiyar162`, `@lavikatiyar`) | Destination + dates + guests in one row | `HeroSearch` | **Destination removed.** It is always Dubai, so date and pax are the primary inputs (PRD §5.1) |
| Colorful Bento Grid (`@radu`), Feature Bento (`@uilayout.contact`) | Bento tiles for value propositions | Homepage seasonal module, `BenefitCard` | Tiles link to real landing pages rather than being decorative |

## 4. Coverage — where these patterns landed

| Surface | Components used |
|---|---|
| Homepage | HeroSearch, QuickChips, ActivityCard (rail), ComboCard, CategoryCard, CollectionCard, ReviewCard, TrustMarquee, SocialProofStrip, WhyOutly, Accordion, WhatsAppCard, FloatingWhatsApp |
| SEO landing | LandingPageView, BenefitCard, ComparisonTable, ComboCard, StickyLandingCTA, Accordion |
| Category / attraction / collection | FilterSidebar, FilterToolbar, ActiveFilterPills, ActivityCard, Accordion, Scene hero with scrim |
| Search | loading.tsx skeleton, near-match Alert, EmptyState, CompareTray, pagination |
| Comparison | ComparisonTable, CompareTray |
| ADP | Gallery, BookingWidget, DateStrip, DatePickerSheet, TimeSlots, GuestSelector, PriceBlock, ReviewsSection, Accordion, StickyBookingBar, TrustSummary |
| Cart | Trip timeline, conflict Alert, price-lock Alert, upsell grid |
| Checkout | Step indicator, form fields, coupon, payment selector, deposit, all payment states |
| Confirmation / voucher | Ticket card, VoucherCode, VoucherActions, cross-sell, referral, review setup |
| Account / booking management | BookingDetail, cancellation Sheet, modify Sheet, wishlist grid, referral dashboard, preference toggles |
| Support | Task grid, channel cards, six-section FAQ, contact form, concierge lead form |
| System | 404 recovery grid, maintenance, error boundaries, design system |

## 4b. Inquiry Mode additions (12 Sep 2026)

| 21st.dev source | Pattern taken | OUTLY implementation | Deliberate change |
|---|---|---|---|
| Contact 01 — Project Inquiry Form (`@shadcnspace/contact-01`) | 12-col grid: form beside contact details and trust signals | `/inquiry` | Split inverted to 7/5 — the form is the primary object |
| Support Ticket Form (`@cnippet-dev/v-textarea-10`) | Category chips, textarea with live count, loading submit, in-place submitted state | `InquiryForm` (dietary + budget chips, notes counter) | Submitted state routed to `/inquiry/confirmation` so it survives refresh and carries the reference |
| Multi-Field Form (`@cnippet-dev/v-field-17`) | Inline validation on submit | `InquiryForm` | Two required fields only |
| Centered Contact Form (`@ln-dev7/contact-16`) | Swap-to-confirmation | Confirmation route | — |
| How It Works Steps (`@ln-dev7/how-it-works-09`) | Numbered circles + connector + CTA | `HowItWorks` on the homepage | Copy states the confirm-first model |
| Vertical How It Works Timeline (`@ln-dev7/how-it-works-02`) | Dashed rail, numbered nodes | `NextSteps` on the confirmation page | First node rendered as done |
| Profile Card (`@waleedkibhen/profile-card`) | Avatar, name, role, activity line | `AgentCard` | Initials avatar until photos exist; deadline line replaces "last active" |
| Order History (`@kavikatiyar/order-history`) | Progress track from placed to delivered | `/account/inquiries` | Nine internal statuses collapsed to four customer stages |

Same rule as before: patterns adopted, dependencies not taken. Runtime deps still three.

## 5. If the team later wants the 21st.dev components directly

The seam is narrow. `components/ui/` primitives have no domain knowledge, so
replacing `Button`, `Sheet`, `Accordion` and `Tabs` with shadcn equivalents is a
contained change — the domain components in `components/commerce/` import them
by name and would not need editing.

Before doing that, weigh it against the measured mobile budget: the current
build ships ~102KB of shared JS, and the animation library alone would be a
~40% increase on that for behaviour that is currently CSS.
