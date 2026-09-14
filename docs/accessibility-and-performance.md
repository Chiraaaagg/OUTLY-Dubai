# Accessibility & performance

## 1. Posture

WCAG 2.1 AA is the target. The build is written to it rather than retrofitted,
but it has **not** been through an assistive-technology audit — see the gaps at
the end.

The audience makes this practical rather than abstract: a mid-range Android, in
daylight, on hotel wifi, often used by someone in their sixties who is not
confident with websites.

## 2. Semantics & structure

- One `<h1>` per page; heading levels never skip.
- Landmarks: `header`, `nav` (each labelled), `main#main`, `aside`, `footer`.
- Lists are lists; the itinerary is an `<ol>`; the comparison is a real `<table>`
  with `<caption>`, `<th scope="col">` and `<th scope="row">`.
- `<fieldset>`/`<legend>` around every grouped control (variants, add-ons, pax,
  dietary, payment method, filters).
- Breadcrumbs use `aria-current="page"`.
- Accordion panels stay in the DOM when collapsed so FAQ content is crawlable
  and findable by in-page search.

## 3. Keyboard

- **Skip link** to `#main` as the first focusable element.
- Single visible focus treatment site-wide: 3px ink-800 outline, 2px offset —
  no `outline: none` anywhere in the codebase.
- `Sheet` traps Tab, closes on Escape, moves focus in on open and restores it to
  the trigger on close, and locks background scroll.
- `Tabs` implement the WAI-ARIA pattern with roving tabindex: Left/Right, Home,
  End.
- Header search is a `combobox` with `aria-expanded`, `aria-controls`,
  `aria-autocomplete`, arrow-key navigation and Escape to dismiss.
- Rails are focusable scroll containers, so keyboard users scroll them natively
  rather than needing the hover arrows.
- Gallery lightbox: arrows navigate, Escape closes.

## 4. Screen readers

- Every icon is `aria-hidden`; meaning is always carried by adjacent text.
- Icon-only buttons carry `sr-only` labels ("Remove Evening Desert Safari from
  saved" — the item name, not "Remove").
- `Rating` exposes `aria-label="Rated 4.8 out of 5 from 2,416 verified reviews"`.
- Toasts are `aria-live="polite"`; danger alerts are `role="alert"`; loading
  regions are `aria-busy` with `aria-live="polite"`.
- Loading buttons keep their label in the DOM (`aria-busy`) so context is not
  lost mid-transaction.
- Pax steppers announce the count via `aria-live`.
- Decorative `Scene` illustrations pass `alt=""`; content images carry a real
  `imageAlt` from the catalogue.

## 5. Colour & contrast

- Body text ink-600+ on sand/paper — ≥4.5:1 in all combinations.
- Primary buttons: white on sun-500 with a darker bottom edge for definition.
- Sun-700 is used for orange text on light surfaces; sun-500 is a fill colour,
  not a text colour.
- **Colour is never the only signal.** Sold-out slots carry strikethrough and
  the word "Sold out"; limited availability carries a number; badges pair colour
  with an icon and a word.
- White text on illustration always sits over a scrim gradient, never over raw
  artwork.

## 6. Motion

Everything animated sits behind `prefers-reduced-motion: reduce`, which drops
durations to 0.001ms and stops the trust marquee. No parallax, no autoplay
video, no attention-seeking loops. Motion is limited to: 150ms interaction
feedback, 200–280ms entrances, a 500ms image scale on hover-capable pointers.

## 7. Forms

- Every input has a real `<label>`; no placeholder-as-label.
- Errors: `aria-invalid`, `aria-describedby` to the message, message adjacent
  to the field, plain language ("We need a working number — the driver and your
  voucher both use it"), never a code.
- Validation on submit, not on keystroke — mid-typing errors punish slow typers.
- Correct `inputMode` and `autoComplete` on name, email, tel.
- Consent checkboxes are unticked-by-default where consent is legally required
  and explain the consequence of opting out.

## 8. Touch

- All interactive controls ≥44px on their smallest axis. Steppers, wishlist
  hearts, close buttons and pagination are 44px explicitly.
- Hover-only affordances are eliminated: everything hover-revealed on desktop is
  permanently visible on touch, gated by `@media (hover: hover)`.
- Sticky bars use `env(safe-area-inset-bottom)`.
- The floating WhatsApp button raises above the sticky booking bar so they never
  overlap or obscure the primary CTA.

## 9. Performance

**Budget (PRD §15, p75 mobile 4G):** LCP < 2.5s · INP < 200ms · CLS < 0.1 ·
TTFB < 600ms.

What the build does about it:

| Decision | Effect |
|---|---|
| Three runtime dependencies | ~102KB shared first-load JS |
| No animation library | Saves ~40KB gzipped against a motion library |
| No component library | No unused CSS or JS shipped |
| Illustrated SVG media | Hero image ≈2KB inline, no network request, no decode cost, no layout shift |
| Server Components by default | Content pages ship almost no client JS; `"use client"` only where interaction demands it |
| 63 routes prerendered | TTFB is a CDN read |
| `next/font` self-hosted, `display: swap` | No render-blocking font request, no FOIT |
| Skeletons match real layout | CLS from lists ≈0 |
| `.tnum` on all numerals | Prices don't reflow when values change |
| Fixed aspect ratios on every media box | No image-driven shift |
| URL-driven filters | No client-side result store to hydrate |

**Resilience:** every async call has an error and a timeout path; failures
degrade to a retry plus a human, never a blank region. A slow supplier API shows
a skeleton and then an explanation, and never blocks page render.

## 10. SEO (shares the same foundations)

- SSR for every indexable page; content is present without JS execution.
- Unique title, meta description, H1 and 300–400+ words per indexable page.
- Structured data: Organization, Product, AggregateRating, FAQPage,
  BreadcrumbList, ItemList.
- Canonicals throughout; `hreflang` for en-IN / en-AE declared in the root
  layout.
- Segmented `sitemap.xml`; `robots.txt` blocks faceted and personal URLs.
- Internal linking on every template, so no page is more than two clicks from a
  category and a landing page.

## 11. Known gaps

1. No screen-reader pass with NVDA/VoiceOver/TalkBack. Written to the spec, not
   yet verified against real AT.
2. No automated axe/Lighthouse CI gate. Should be a build step.
3. Contrast verified by construction, not by tooling across every state
   (particularly badge text on tinted backgrounds).
4. Real Core Web Vitals need a deployed environment and field data; the numbers
   above are design intent plus a local production build.
5. `Sheet` does not yet mark background content `inert` — focus is trapped, but
   older AT may still reach background nodes.
6. Hindi/regional language support is V2 in the PRD and not started; `lang` is
   `en-IN` throughout.
