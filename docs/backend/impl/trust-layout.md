# Trust & layout — implementation note

**Agent:** Trust & Layout · **Scope:** audit items S01 (footer), X03 (placeholder identifiers), X04 (mock agents on `/inquiry`), S05 (category "About" block), S06 (category catalogue layout) and the filter-sidebar scrollbar.
**Verification at hand-off:** `npm run typecheck` — zero errors in any file listed below (the remaining errors are in `src/app/account/**`, `src/app/login`, `src/app/signup`, `src/server/**` and stale `.next/types`, all owned by the parallel auth/account agents) · `npx vitest run` 16 files / 206 tests pass · `eslint` on every touched file: 0 errors, only the three pre-existing warnings in `inquiry/confirmation/page.tsx` and `whatsapp.ts`. No `next build`/`dev`.

```
grep -rn "90000 00000\|919000000000\|4 000 0000\|97140000000\|07AABCO\|licence 000000\|help@outlyy.com\|OUTLYY Travel Technologies" src | grep -v src/lib/site-config.ts
→ no hits
```

---

## 1. X03 — placeholders → `siteConfig`

Rule applied everywhere: a value that is `undefined` in `siteConfig` renders **nothing** — the line, link or card is dropped. No fallback strings, no "TBC".

| File | Change |
| --- | --- |
| `src/lib/site-config.ts` | Exported `PLACEHOLDER_WHATSAPP` (the only place the digits `919000000000` exist) so `whatsapp.ts` no longer carries its own copy. |
| `src/lib/whatsapp.ts` | `WHATSAPP_NUMBER = siteConfig.whatsappNumber ?? PLACEHOLDER_WHATSAPP`; `WHATSAPP_NUMBER_IS_PLACEHOLDER = siteConfig.whatsappNumber === undefined`; `SUPPORT_HOURS = siteConfig.supportHours`. Same exports, same dev-only console warning. |
| `src/app/concierge/page.tsx` | Hero phone button conditional on `emergencyDisplay()/emergencyHref()`; the "That didn't send" alert says "call us on {number}" or "message us on WhatsApp". |
| `src/app/contact/page.tsx` | Emergency and Email rows in "Other ways" conditional; "Registered entity" = `legalName` + optional `GSTIN …`. |
| `src/app/error.tsx` | WhatsApp link built with `whatsAppUrl({ intent: "general", question, placement: "route_error" })`. |
| `src/app/global-error.tsx` | Imports only `site-config` (dependency-free env reads, so safe in the root boundary). Help line shows WhatsApp and/or Dubai number; whole paragraph omitted when neither is set. |
| `src/app/maintenance/page.tsx` | WhatsApp number conditional; the emergency card is omitted and the grid drops to `sm:grid-cols-2` when no line is configured. |
| `src/app/support/page.tsx` | WhatsApp number conditional; Phone + 24/7 emergency cards omitted (and the section sub-copy changes from "Three channels" to "One channel") when no line is configured. |
| `src/app/voucher/[reference]/page.tsx` | Emergency block and WhatsApp block in the voucher footer conditional; non-refundable copy says "call the emergency number above" only when there is one. |
| `src/app/inquiry/confirmation/page.tsx` | "Travelling in the next 48 hours?" phone link conditional; sentence trimmed when absent. |
| `src/components/commerce/booking-detail.tsx` | "Who to contact": WhatsApp number shown only when set (SLA text stays); emergency row conditional. |
| `src/components/commerce/whatsapp.tsx` | `PhoneEscalation` defaults `number` to `emergencyDisplay()` and returns `null` when there is no number. (No current call sites.) |
| `src/lib/data/legal.ts` | Terms intro and "Where we are" use `siteConfig.legalName`; GSTIN sentence and the "24/7 emergency line" clause are omitted when unset. |
| `src/components/layout/footer.tsx` | See §2. |

## 2. S01 — footer

`src/components/layout/footer.tsx` rewritten as three bands on the dark ink ground (pattern: 21st.dev `@shadcnspace/footer-01` — brand summary · sitemap · legal · contact — reimplemented on OUTLYY tokens, cited in the header comment):

- **Band A** — wordmark, tagline, the one honest payment sentence ("You pay only after a real person confirms availability — by UPI, card or EMI through a secure Razorpay link."), then on the right an `<address>` with only the configured channels (WhatsApp / 24/7 line / email + support hours) and a single-line trust summary `30-min reply promise · 4.7/5 from 6,120 verified reviews · 14 verified suppliers` (values from `platformStats`). `lg:grid-cols-[1.3fr_1fr]`, stacked below.
- **Band B** — the three `COLUMNS` (data untouched; the "Your booking" array is intact for the Account-UI agent's `Track an inquiry` link) in `sm:grid-cols-3`, plus the "Browse by category" row kept underneath because category pages count on those internal links (AC-CAT-01).
- **Band C** — `legalLine()` + Terms / Privacy / Cancellation policy / Price guarantee. "Design system" link removed.

Removed: the four-stat trust strip (now the one-liner in band A; the big version stays on the homepage `SocialProofStrip`), the PCI box, the ten "We accept" badges (payment chips live on the ADP "When you pay" block).

Widths: at 360 everything stacks with 16px gutters; 768 gets three link columns; 1024/1440 get the two-part brand band. No new tokens, spacing stays on the existing scale, Bricolage on the column headings.

## 3. X04 — `/inquiry` "Who replies"

`src/app/inquiry/page.tsx`: the named mock agents are gone. The card keeps the same structure (avatar disc + name + sub-line) but shows shift coverage only — **India desk 9 am – 5 pm IST** and **UAE desk 5 pm – 11 pm IST** — and the intro copy ends "A named specialist is assigned the moment you send." `TrustSummary` unchanged. `agents` and `AgentCard` are no longer imported there; `src/lib/inquiry.ts` `agents` is untouched (design-system page and the confirmation page still use it).

## 4. S06 — category catalogue layout

`src/app/categories/[slug]/page.tsx`: the "Our picks" section now lives inside the right column of the `lg:grid-cols-[17rem_1fr]` grid, above the "All … (N)" heading, so `FilterSidebar` (sticky, left) starts at the top of the catalogue area. Picks render as `grid-cols-1 sm:grid-cols-2` of `layout="compact"` `ActivityCard`s (16:9 image, tighter padding) — a 2 × 2 on lg that stays visible without dominating; pure CSS grid, so no CLS. `SectionHeading` kicker "Our picks" kept. Mobile flow unchanged (`FilterToolbar` sheet). The section is skipped when a category has no `featuredSlugs`.

`src/app/search/page.tsx` has no equivalent section above its grid, so it was left alone; it shares the same `FilterSidebar` and benefits from §5.

## 5. Sidebar scrolling

`src/components/commerce/filters.tsx` `FilterSidebar`: the bordered card no longer carries `max-h`/`overflow-y-auto`. A wrapper `div.no-scrollbar.sticky.top-32.max-h-[calc(100vh-9rem)].overflow-y-auto.overscroll-contain` provides scrolling only when the card is taller than the viewport, with no visible track (`no-scrollbar` utility already existed in `globals.css`). The card itself is natural height. Every filter group is unchanged.

## 6. S05 — category "About" block

Wrapped in `SectionHeading` (kicker "About", title "About {category name}") and a `Card` (`p-5 sm:p-6`) with `Prose` inside, matching the FAQ block beneath it. `longIntro = category.intro.length >= 900` switches to a full-width container with `lg:columns-2 lg:gap-10`; every current intro is 520–670 chars, so today they render single-column `max-w-3xl`.

## 7. Left / notes for other agents

- `.env.example` still lists `NEXT_PUBLIC_EMERGENCY_PHONE=+97140000000` and `NEXT_PUBLIC_WHATSAPP_NUMBER=919000000000`; `site-config.ts` already treats both as unset (all-zero / placeholder detection), so a fresh `.env` copied from it renders no phone numbers. Not edited here — outside the brief.
- Account-UI agent: add `{ label: "Track an inquiry", href: "/inquiry/track" }` to the `Your booking` array in `footer.tsx`; nothing else in that file needs to change.
- `PhoneEscalation` has no call sites today; when one is added it needs no props to pick up the configured line.
- `platformStats.averageRating` is `4.7` and `reviewCount` is `6120` — the footer prints those; the brief's "4.8/5 from 6,128" figure was illustrative.
