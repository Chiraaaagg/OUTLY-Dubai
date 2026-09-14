# OUTLY — Dubai activities marketplace for Indian travellers

A production-shaped Next.js frontend for the product described in
`dubai-activities-marketplace-prd.md`. Every page, flow and state in the PRD's
scope is implemented against a mock data layer with a clean integration seam,
so backend work can start without touching the UI.

---

> **Inquiry Mode (12 Sep 2026).** The storefront now terminates in
> `POST /inquiries`, not `POST /orders`, per `docs/backend/17-inquiry-mode-pivot.md`.
> Frontend implementation notes: `docs/inquiry-mode-implementation.md`. The
> booking/checkout/voucher code is gated behind `Activity.fulfilmentMode`, not
> deleted.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # production build — all routes prerender
npm run start    # serve the production build
npm run typecheck
```

No environment variables are required. There is no database, no auth provider
and no payment gateway — see **Integration boundaries** below.

### See every state without breaking anything

Append `?mock=<scenario>` to any URL and every async call in the product behaves
that way:

| Scenario | What it does |
|---|---|
| `slow` | 2.6s responses — skeletons and loading copy stay on screen |
| `error` | Supplier API returns 500 |
| `timeout` | Availability check exceeds 8s |
| `empty` | Search returns nothing |
| `sold_out` | SKU has no availability; ADP offers the next three dates |
| `price_changed` | Checkout requires explicit re-consent to the new price |
| `payment_failed` | Gateway declines; cart preserved, alternative offered |
| `payment_timeout` | No webhook received; "do not pay again" state |
| `supplier_pending` | Manual-confirmation booking flow |
| `pickup_unavailable` | Hotel outside the supplier's coverage |
| `offline` | Request never leaves the device |

Examples:

```
/activities/burj-khalifa-124-125?mock=sold_out
/checkout?mock=payment_failed
/search?mock=empty
```

`/design-system` lists them all as links, alongside the token and component
inventory and a live analytics event tail.

### Useful demo routes

| Route | Why |
|---|---|
| `/` | Homepage |
| `/activities/evening-desert-safari-veg-jain` | The richest ADP — dietary, variants, itinerary, pickup. Inquiry-mode CTA |
| `/inquiry` | The inquiry form (2 required fields) |
| `/inquiry/confirmation?ref=INQ-204817` | Named agent + concrete deadline + next steps |
| `/account/inquiries` | Inquiry status tracking |
| `/activities/private-yacht-charter-sunset` | Tier D quote-only treatment |
| `/lp/desert-safari-dubai` | SEO landing template with comparison module |
| `/search?dietary=jain&category=water-activities` | Near-match recovery instead of an empty state |
| `/combos/family-fun-pack` | Package page with verifiable savings |
| `/booking/OUT-482913` | Confirmed booking, driver details, cancel + modify flows |
| `/booking/OUT-517204` | Supplier-pending booking |
| `/voucher/OUT-482913` | Voucher (print-ready) |
| `/reviews/OUT-390118` | Post-activity review with the dietary-met question |
| `/design-system` | Tokens, components, every state |

---

## Stack

| Choice | Why |
|---|---|
| Next.js 15 App Router | SSR is a hard PRD requirement (§7) — every indexable page renders server-side and is crawlable without JS |
| React 19 | Server Components keep client JS off content pages |
| Tailwind CSS v4 (CSS-first `@theme`) | Design tokens live in one stylesheet, not a JS config; no runtime cost |
| lucide-react, clsx, tailwind-merge | The only runtime dependencies |

**Three dependencies total.** No component library, no animation library, no
state manager. That is a deliberate response to PRD §15: LCP < 2.5s at p75 on
mid-range Android over 4G. Shared first-load JS is ~102KB.

---

## Structure

```
src/
  app/                     Routes (App Router)
  components/
    ui/                    Design-system primitives — no domain knowledge
    commerce/              Domain components — cards, price, booking, WhatsApp
    layout/                Header, footer, logo
    pages/                 Reusable page templates (landing, legal)
    providers/             Client app state
    analytics/             Page-view instrumentation
  lib/
    data/                  MOCK CONTENT — swap for API responses
    api/                   INTEGRATION BOUNDARY — every async call
    types.ts               Domain model
    search.ts              Filtering, ranking, near-match recovery
    pricing.ts             Price computation, coupons, deposits
    availability.ts        Availability model
    analytics.ts           Event taxonomy and dispatch
    whatsapp.ts            Rail B context passing and copy
docs/                      Strategy, specs and documentation
```

### Integration boundaries

Everything that will one day be a network call already goes through
`src/lib/api/`. No component imports `src/lib/data/*` for anything dynamic.

| Seam | File | Replace with |
|---|---|---|
| Catalogue | `lib/api/index.ts` → `fetchSearch`, `fetchRecommendations` | `GET /products`, `GET /search` |
| Availability | `checkAvailability` | Supplier availability service, 5-min TTL cache, zero cache at payment |
| Price re-verification | `reverifyPrice` | Server-side price lock check (AC-CO-04) |
| Orders | `submitOrder` | Order service; **state must come from webhooks, not this response** (AC-PAY-01) |
| Bookings | `fetchBooking`, `quoteCancellation`, `cancelBooking` | Order + refund services |
| Vouchers | `resendVoucher` | WhatsApp BSP + transactional email |
| Reviews | `submitReview` | Review service with moderation queue |
| Leads | `requestQuote` | CRM / agent console |
| Analytics transport | `lib/analytics.ts` → `deliver()` | Server-side collector + Meta CAPI |
| Auth | `lib/data/bookings.ts` → `demoUser` | Session read + a guard in `app/account/layout.tsx` |
| Content | `lib/data/*.ts` | CMS or admin-managed product model |

### Deliberately mocked

- **Auth.** `/login` and `/signup` render the OTP flow and its states; there is
  no session. `/account` uses `demoUser`.
- **Payments.** No gateway. `submitOrder` simulates latency and failure modes.
  No card fields exist anywhere in the codebase by design (AC-CO-07).
- **Availability.** Deterministic from a hash of `(slug, date)` so server and
  client always agree and no fake scarcity can drift between two views.
- **Images.** Every activity image is a generated SVG scene (`components/ui/scene.tsx`).
  Passing an `http(s)` URL instead of a scene key switches to real photography
  with no other change.
- **QR codes.** Visually representative, not scannable. One component
  (`components/commerce/voucher.tsx`) to swap.

---

## Documentation

| Document | Contents |
|---|---|
| `ux-strategy.md` | Positioning, competitor analysis, conversion rationale |
| `information-architecture.md` | Sitemap, route table, user flows |
| `design-system.md` | Tokens, component inventory, motion, responsive rules |
| `page-specs.md` | Page-by-page objective, hierarchy, CTAs, states, events |
| `analytics-and-experiments.md` | Event plan, properties, dashboards, A/B roadmap |
| `accessibility-and-performance.md` | WCAG posture, keyboard, performance budget |
| `states-and-edge-cases.md` | Every loading / empty / error / pending state |
| `whatsapp-strategy.md` | Rail B placement, triggers, templates, escalation |
| `checkout-optimisation.md` | Friction audit and the decisions behind checkout |
| `21st-dev-implementation.md` | What was sourced from 21st.dev and how it was adapted |
| `coverage-checklist.md` | Every required page, flow and state, with status |
| `known-limitations.md` | What is not built, and what needs a decision |
| `inquiry-mode-implementation.md` | Inquiry Mode pivot: what changed, what is gated, CTA matrix, field justification |
