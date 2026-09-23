# UI/UX audit fixes — 18–19 September 2026

Source: the tester's Google Sheet (13 rows, 10 screenshots, one tab) audited against the codebase; plan approved with decisions: theme item skipped (Q1), legal identifiers supplied later and hidden until then (Q2), **customer OTP login built** (Q3 = Option B), category picks kept (Q4), About block made its own section (Q5). Working notes per area: `docs/backend/impl/{trust-layout,customer-auth,customer-auth-contract}.md`.

## Issue → fix

| ID | Issue | Root cause | Fix | Verified |
|---|---|---|---|---|
| S08/S09/X01 | ADP and combo pages: main column 99–278px on every desktop width, giant CTAs, one-word-per-line WhatsApp card | `grid-cols-[1.55fr_1fr]` = `minmax(auto,…)`; the aside's `DateStrip` (10 non-shrinking rail chips, ~870px min-content) forced its column wide | `grid-safe` utility in `globals.css` (`& > * { min-width: 0 }`) applied to all 20 fr grids | 61/39 split at 1024, 1100, 1280, 1418, 1920; 343px main at 360; no horizontal scroll |
| S07 | Floating WhatsApp button on top of the compare tray's Compare action (desktop) | `raised` only lifted the FAB below `sm` | FAB reads compare state and lifts on every breakpoint when the tray is mounted; tray adds an in-flow spacer so it never covers page-bottom content | FAB bottom 712 < tray top 731 at 1418; 720 < 743 at 375 |
| S10 | 11-digit number rejected with a generic page alert | Client regex `\d{7,12}` vs server rule (10 digits, 6–9); server field error rendered as page alert | One shared validator `src/lib/phone.ts` (server re-exports it); customer-facing reasons ("Indian mobile numbers are 10 digits — you entered 11 digits."); server `VALIDATION_FAILED.details.fields` rendered inline at the field with focus | Inline error on `77709587678`; `07709587678` normalised → 201 `INQ-105361` |
| S02/S03/S11/S12 | Fake logged-in "Rajesh" account for every visitor; login/registration unreachable; inert Edit button; fake saved cards; "no authentication" banner | Mock customer identity survived the inquiry pivot | Real customer auth: phone → OTP (SMS port, `log` adapter in non-prod, MSG91 adapter gated on credentials) → 30-day session; account linked to inquiries and orders by verified phone; `/account` (dashboard, inquiries, trips, profile with real edit + consents, data export, deletion request); `/signup` → `/login`; referrals page deleted; payment card removed; header user icon → Sign in / Your account | Wrong code → "4 attempts left"; right code → `/account` with the real won inquiry and order; logout clears session (me → 401) |
| — | Track my inquiry (guest) | No customer-facing status without an account | `/inquiry/track`: reference + phone → `POST /api/inquiries/lookup` → 4-stage track, agent, items, WhatsApp follow-up; linked from header trust bar, footer, confirmation, manage-booking | Wrong phone → 404 copy; right phone → track (`INQ-105072`, won, `OUT-483081`) |
| S01/X03 | Footer dense; placeholder GSTIN/DED/phone numbers in 15 files | Hard-coded strings; no config source | `src/lib/site-config.ts` (env-driven, `undefined` renders nothing); footer rebuilt as three bands (pattern `@shadcnspace/footer-01`), PCI box, badge wall and Design-system link removed | `grep` for every placeholder string returns nothing outside `site-config.ts`; footer legal line = `© 2026 OUTLYY Travel Technologies Pvt. Ltd.` until `NEXT_PUBLIC_GSTIN`/`NEXT_PUBLIC_DED_LICENCE` are set |
| X04 | `/inquiry` sidebar named mock agents | Fixture | Shift-coverage card, no names; the confirmation page shows the real assigned agent | — |
| S06 | Filters ~1,350px below the hero; always-visible scrollbar | Picks section sat above the two-column grid; `max-h + overflow-y-auto` | Picks moved into the list column (2×2 compact cards); sticky sidebar starts at the top of the catalogue area; scroll only when needed, no track | Sidebar in first viewport at 1418; mobile sheet unchanged; no CLS change (CSS grid only) |
| S05 | "About …" prose orphaned between grid and FAQ | Bare `h2 + Prose` | `SectionHeading` (kicker "About") + paper card, consistent with the FAQ block | — |
| — | `/manage-booking` "Demo references — this build runs on mock data" card | Mock leftover | Removed | — |
| S04 | "Theme not perfect" | No detail | **Skipped by decision** — needs a screenshot or specifics | — |

## Systemic rules added

- Every fr-sized grid uses `grid-safe` (see comment in `globals.css`).
- Contact and legal identifiers come only from `siteConfig`; a missing value renders nothing.
- Phone validation has one implementation (`src/lib/phone.ts`) for client and server.
- `npm run lint` (ESLint 9 flat config) enforces the §19 import boundaries; `react-hooks/purity` and `set-state-in-effect` are warnings by design.
- Customer auth: `docs/backend/impl/customer-auth-contract.md` is the contract; `SMS_PROVIDER=log` in non-production; production sign-in requires MSG91 (`MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_TEMPLATE_ID_OTP` — DLT template registration is the long pole) or `FEATURE_CUSTOMER_AUTH=true` to force.

## Follow-ups

1. Provide `NEXT_PUBLIC_GSTIN`, `NEXT_PUBLIC_DED_LICENCE`, real `NEXT_PUBLIC_WHATSAPP_NUMBER` and `NEXT_PUBLIC_EMERGENCY_PHONE` (currently placeholders → hidden).
2. Register the MSG91 OTP DLT template and set `SMS_PROVIDER=msg91` in production; until then `/login` shows the honest "coming soon → track instead" state there.
3. S04 theme feedback — ask the tester for specifics.
4. `/booking/[reference]`, `/voucher/**`, `/reviews/[booking]` still render the booking-mode fixtures (`src/lib/data/bookings.ts`); they are gated surfaces retained for the instant path and are not linked from the account area.
