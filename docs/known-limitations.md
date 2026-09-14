# Known limitations, assumptions & next steps

## 1. What is mocked

| Area | Current | What replaces it |
|---|---|---|
| Auth | `/login` and `/signup` render the OTP flow and its states; `demoUser` backs `/account` | Session provider + guard in `app/account/layout.tsx` |
| Payments | `submitOrder` simulates latency and failure modes | Razorpay/Cashfree (India) + a UAE-capable gateway. **Order state must come from webhooks, never this response** |
| Catalogue | 26 SKUs in `lib/data/activities.ts` | Unified Product model over direct, Rayna and portal supply |
| Availability | Deterministic hash of `(slug, date)` | Supplier availability service, 5-min TTL, **zero cache at payment authorisation** |
| Vouchers | Delivery simulated; QR is a visual placeholder | WhatsApp BSP + PDF service + real supplier barcode |
| Reviews | Submission simulated | Review service with a 24-hour moderation queue |
| Analytics | Client buffer + `dataLayer`; `deliver()` is a no-op without an endpoint | Server-side collector + Meta CAPI with `event_id` dedup |
| Images | Generated SVG scenes | Real photography — pass an `http` URL instead of a scene key |
| Geo detection | Timezone check (`Asia/Dubai`) | Edge geo header |
| Content | TypeScript data files | CMS or admin product model |

## 2. Not built (and why)

| Item | Reason |
|---|---|
| Admin dashboard (PRD §9) | Separate application at `/admin`; the brief scoped the customer storefront |
| Agent console (PRD §5.14) | Separate application. **This is the highest-priority missing piece** — Rail B is 45% of target GMV and cannot operate without a quote builder and customer 360 |
| Supplier portal (PRD §10) | Explicitly V2 in the PRD |
| Loyalty / wallet credits | Explicitly V2. Referral credits are shown; loyalty earn is not |
| PWA / offline vouchers | Manifest and service worker not added. The voucher page is static and cache-friendly, so this is a small addition |
| Hindi / regional languages | V2 |
| Multi-traveller detail collection | Only lead traveller collected; per-activity passport/Emirates ID capture is supplier-dependent |
| Real TCS calculation | Blocked on the written CA opinion (PRD §19.4) |
| Photo upload on reviews | UI present, upload not wired |
| Calendar file generation | Button present, `.ics` generation not wired |

## 3. Product decisions taken (flagging them rather than burying them)

1. **Canonical routes follow the brief, not the PRD's short forms.**
   `/activities/[slug]` and `/categories/[slug]` are canonical;
   `/d/` and `/c/` 301 to them. Longer URLs, but readable and better for SEO.
2. **Illustrated SVG scenes instead of photography.** Performance, resilience
   and brand distinction — and it avoids shipping stock photos that appear on
   every competitor. Swappable per SKU without touching a component.
3. **Light mode only.** A dark theme would double the QA surface for every
   state. Tokens are structured so adding one is additive.
4. **21st.dev used as a design source, not an install path.** Its components
   depend on shadcn + Radix + `motion/react`; adopting them would add ~40KB
   gzipped against an LCP < 2.5s budget on mid-range Android. Patterns adapted,
   dependencies not taken. Full accounting in `21st-dev-implementation.md`.
5. **26 SKUs, not 300.** "Certainty over selection" is a PRD design principle,
   and `/activities` states the reasoning to the customer.
6. **Coupon field at review, not payment.** Reduces the "hunt for a code"
   abandonment at the most expensive step.
7. **No dark patterns.** No fake countdowns, no invented scarcity, no
   struck-through prices without a real published rate. Where availability is
   limited, the ADP says the number is the operator's.

## 4. Assumptions to confirm

| Assumption | Why it matters |
|---|---|
| INR/AED prices set independently, not FX-converted | Implemented that way (`Money` carries both). Confirm the pricing team agrees |
| Infants free on every SKU | Hardcoded in `paxBillable`. Confirm per supplier |
| Children are 3–11, seniors 60+ | Used in copy and pricing bands. Varies by supplier in reality |
| 20-minute price lock | From PRD §12. Server must enforce it; the client only displays it |
| Deposit at ₹25,000, EMI at ₹15,000 | From PRD §5.6. Both are single constants in `pricing.ts` |
| Booking references are `OUT-######` | Shared with the agent console — confirm the format before it is printed on vouchers |
| Reviews publish first name + city | Confirm against the privacy policy and consent copy |

## 5. Recommended next steps

**Immediately (unblocks everything else)**
1. Rayna API spike — endpoints, auth, rate limits, availability freshness,
   cancellation semantics. The inventory model depends on the findings.
2. WhatsApp BSP selection and template approval. Rail B is inert without it.
3. Payment gateway integration, **webhook-driven order state** (AC-PAY-01).
4. Written CA opinion on TCS before the checkout UI is finalised.

**Then**
5. Agent console with quote builder and customer 360 — the missing half of the
   product.
6. Server-side analytics + Meta CAPI with offline conversion upload for
   WhatsApp bookings. Without it we systematically under-bid on our best
   traffic.
7. Auth (phone OTP) with automatic linking of guest bookings.
8. Real photography for the top 10 SKUs by traffic; keep scenes as the fallback.
9. Accessibility audit with NVDA, VoiceOver and TalkBack, plus an axe CI gate.
10. Deploy and measure real Core Web Vitals; the current numbers are design
    intent plus a local production build.

**Before public launch (PRD §16)**
11. Penetration test with all critical and high findings remediated.
12. Legal review of the DPDP posture, terms and cancellation policy — the
    drafts in `lib/data/legal.ts` are product-written, not lawyer-reviewed.
13. GST invoicing logic decision (margin scheme vs gross).
