# Design system

Live reference: **`/design-system`** — tokens, every component, every state, and
a live analytics event tail.

## 1. Brand direction

A playful, sun-warm, trustworthy marketplace that reads as *specialist travel
advisor*, not global OTA.

| Attribute | Expression | Guard against |
|---|---|---|
| Playful, not childish | Illustrated SVG scenes, sticker badges with a 2° tilt, warm sand ground | Cartoon mascots; nothing playful may enter a price block |
| Vibrant, controlled | One primary (marigold) doing one job; accents restricted to meaning | Rainbow gradients, colour used decoratively |
| Premium, approachable | Deep plum for luxury surfaces, sand for everything else | Black-and-gold luxury clichés |
| Friendly, credible | Plain sentences, specific promises, stated downsides | Exclamation marks, "amazing", manufactured urgency |
| Expressive, conversion-focused | Decoration in the chrome | Decoration never competes with price, availability, Book or WhatsApp |

**Voice.** Direct, warm, specific. "Jain thali, cooked to order, no onion or
garlic" — not "dietary options available". State the downside before the
customer finds it. Where a competitor writes "book now to avoid
disappointment", we write "sunset slots sell out five to seven days ahead in
winter".

## 2. Colour

Defined as Tailwind v4 `@theme` tokens in `src/app/globals.css`. **Colour is
meaning.** A discount and a failure must never share a hue.

| Ramp | Role | Key values |
|---|---|---|
| **Ink** 100–900 | Text, dark surfaces, premium sections | `#14101f` … `#f2eff7` |
| **Sun** 50–800 | Primary action only — one per view | `#ff6a13`, hover `#e85403`, text-safe `#bd4102` |
| **Lagoon** 50–700 | Trust: instant confirmation, free cancellation, security | `#00a6a0` |
| **Sunset** 50–600 | Savings and deals **only** | `#f02e63` |
| **Dune** 50–500 | Sand highlights, ratings, seasonal | `#f7b73f` |
| Surfaces | `sand #fff8f0` (page), `shell #fdf3e7` (bands), `paper #ffffff` (cards) | |
| Semantic | success `#0e9f6e`, warning `#b45309`, danger `#dc2626`, info `#2563eb` | |
| Channel | `whatsapp #25d366` — **reserved exclusively** for WhatsApp affordances | |

Rules:
- Ink-900 is never pure black; pure black on a warm ground reads harsh.
- Body text is ink-600 or darker on sand/paper — all combinations ≥ 4.5:1.
- Sunset is never used for errors; danger is never used for savings.
- The page ground is sand, not white. White is a card, and therefore a signal.

**Light-mode only, deliberately.** A dark theme would double the QA surface for
every state in a build whose target device is a mid-range Android in daylight.
Tokens are structured so adding one later is a token-block addition, not a
refactor.

## 3. Typography

| Role | Face | Notes |
|---|---|---|
| Display | **Bricolage Grotesque** 600/700/800 | Slightly quirky, high contrast. Headings only |
| Body | **Plus Jakarta Sans** variable | Wide apertures; holds up at 14px on mid-range Android |

Both loaded via `next/font` with `display: swap`, latin subset, self-hosted.
Headings use `letter-spacing: -0.02em` and `text-wrap: balance`.

| Token | Size | Use |
|---|---|---|
| Display XL | 2rem → 3.4rem | Page H1 |
| H2 | 1.75rem | Section heading |
| H3 | 1.02–1.05rem | Card title |
| Body | 0.95rem / 1.75 | Default |
| Small | 0.875rem | Secondary |
| Caption | 0.75rem | Meta |
| Kicker `text-2xs` | 0.6875rem, 800, tracking 0.12em, uppercase | Section eyebrows, badges |

**All prices, dates, counts and references use `.tnum`** (tabular numerals) so
numbers never shift width while loading.

## 4. Space, radius, elevation, motion

- **Spacing** — 4px base. Section rhythm 3rem mobile / 4rem desktop. Card
  padding 1rem–1.25rem. Container max 80rem with 1/1.5/2rem gutters.
- **Radius** — `--radius-card 1.25rem`, `--radius-tile 1.75rem`,
  `--radius-control 0.75rem`, pills full. Generous radii carry the "friendly"
  half of the brief.
- **Shadows** — warm-tinted, never neutral grey: `soft` (resting card), `lift`
  (hover, booking widget), `pop` (overlays), `sticky` (upward, for bottom bars).
- **Motion** — CSS only. `--ease-out-soft` for movement, `--ease-spring` for
  playful pops. 150ms interaction, 200–280ms entrance, 500ms image scale.
  Marquee 34s. Everything sits behind
  `@media (prefers-reduced-motion: reduce)`, which reduces all durations to
  0.001ms and stops the marquee.

**Hover is never the only affordance.** Hover effects are gated behind
`@media (hover: hover)` so touch devices get the full-strength state — a
correction to the common product-card pattern that hides the wishlist button
until hover.

## 5. Component inventory

### Primitives — `components/ui/`

| Component | Variants | States |
|---|---|---|
| `Button` / `ButtonLink` | primary, whatsapp, secondary, outline, ghost, danger × sm/md/lg | hover, active, focus-visible, disabled, loading (label retained for SR) |
| `Badge` + 11 presets | trust, deal, heat, diet, neutral, warn, premium | sm/md |
| `Sticker` | sun, lagoon, sunset, dune | decorative only |
| `Card` | div/article/section/li | — |
| `SectionHeading` | kicker, title, sub, optional "see all" | — |
| `Rating` | sm/md/lg | with/without count; full a11y label |
| `Alert` | info, warning, danger, success | with title, icon, action slot |
| `Skeleton`, `ActivityCardSkeleton`, `SkeletonGrid` | — | shimmer, reduced-motion safe |
| `EmptyState` | icon, body, primary + secondary action | — |
| `ErrorState` | offline variant | retry + escalation |
| `Breadcrumbs` | — | current page marked `aria-current` |
| `Stat`, `Prose`, `Divider` | — | — |
| `Accordion` | default-open index | panels always in DOM for crawlability |
| `Tabs` | with badges | roving tabindex, arrows/Home/End |
| `Sheet` | sheet (bottom→dialog), drawer, dialog | focus trap, restore, Escape, scroll lock |
| `Rail` / `RailItem` | — | scroll-snap; arrows only on hover-capable pointers |
| `Toaster` | success, error, info | `aria-live=polite`, sits above the sticky bar |
| `Scene` | 14 motifs × 27 palettes | switches to `<img>` for `http` sources |

### Domain — `components/commerce/`

| Component | Purpose |
|---|---|
| `ActivityCard` | grid / rail / compact / row layouts; unavailable state; compare and WhatsApp slots |
| `CategoryCard`, `CollectionCard`, `ComboCard`, `ReviewCard`, `BenefitCard` | Discovery surfaces |
| `PriceBlock`, `CardPrice`, `QuotePrice`, `Price`, `CurrencyToggle` | Price presentation; tax line is part of the component |
| `BookingWidget` | The ADP conversion engine — variants, dates, slots, pax, add-ons, live breakdown, both rails |
| `StickyBookingBar` | Mobile, appears after 520px |
| `ComboBooking` | Package panel with savings proof |
| `DateStrip`, `DatePickerSheet`, `DateField`, `GuestSelector`, `GuestSheet`, `GuestField`, `TimeSlots` | Selection primitives |
| `HeaderSearch`, `HeroSearch` | Combobox with recent/popular; date+pax hero |
| `FilterSidebar`, `FilterToolbar`, `ActiveFilterPills` | URL-driven filtering; drawer on mobile |
| `ComparisonTable`, `CompareTray` | Comparison experience |
| `Gallery` | Mobile snap rail / desktop mosaic / keyboard lightbox |
| `ReviewsSection` | Filter by traveller type; dietary-met summary |
| `WhatsAppButton`, `WhatsAppCard`, `FloatingWhatsApp`, `PhoneEscalation` | Rail B |
| `TrustMarquee`, `WhyOutlyy`, `SocialProofStrip`, `TrustSummary`, `PaymentMethods` | Trust modules |
| `VoucherActions`, `VoucherCode` | Voucher delivery and QR |
| `BookingDetail` | Management, cancellation quote, date change |
| `StickyLandingCTA`, `QuickChips` | Landing conversion |

### Every reusable component defines

Purpose · variants · props · responsive behaviour · hover / focus / disabled /
loading / error / empty states · accessibility requirements · analytics events
where relevant. Enforced by review against `/design-system`, which renders each
one in every state.

## 6. Responsive rules

Breakpoints: `sm 640` · `md 768` · `lg 1024` · `xl 1280`. Design starts at 360.

| Surface | Mobile | Desktop |
|---|---|---|
| Header | Drawer + full-width search row | Inline search, category bar |
| Search / category | Filter and sort drawers, sticky toolbar | 17rem sticky sidebar |
| ADP | Single column, gallery snap rail, sticky booking bar | 1.55fr/1fr with sticky widget |
| Cart / checkout | Stacked, summary last | Two columns, sticky summary |
| Rails | Native swipe, scroll-snap | Hover arrows |
| Selectors | Bottom sheets | Inline / popover |
| Grids | 1 col → 2 at `sm` → 3 at `xl` | |

Mobile requirements met: no horizontal scroll from 320px (verified at 360),
touch targets ≥44px on all controls, sticky booking and WhatsApp CTAs that never
overlap (the floating button raises when a sticky bar is present), one-handed
reach for all primary flows.
