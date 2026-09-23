# OUTLYY — Backend Architecture & Implementation Blueprint

**Version:** 1.0 · **Date:** 9 September 2026 · **Status:** For approval — do not begin implementation until §Approval Gate is signed off
**Inputs:** Feasibility Report (3 Sep 2026) · PRD v1.0 (4 Sep 2026) · Business Model & Unit Economics (4 Sep 2026) · `Rathin API Flow 2.pdf` · the frontend codebase at `D:\Programs\OUTLYY`

---

## How to read this document

| # | File | Covers |
|---|---|---|
| 00 | `00-README.md` | This file — executive summary, the five decisions needing approval, open blockers |
| 01 | `01-frontend-analysis.md` | Phase 1 — what exists, what is mocked, feature→backend mapping |
| 02 | `02-supplier-integration.md` | Phases 2 & 6 — Rathin, the adapter layer, inventory/availability/pricing lifecycles |
| 03 | `03-tech-stack.md` | Phase 3 — stack evaluation, recommendation, costs |
| 04 | `04-system-architecture.md` | Phase 4 — services, boundaries, communication |
| 05 | `05-database-design.md` | Phase 5 — schema, ERD, indexes, audit, retention |
| 06 | `06-booking-engine.md` | Phase 7 — quotes, idempotency, concurrency, failure sagas |
| 07 | `07-payments.md` | Phase 8 — lifecycle, webhooks, refunds, reconciliation |
| 08 | `08-whatsapp.md` | Phase 9 — Rail B architecture |
| 09 | `09-agent-console.md` | Phase 10 — the biggest gap in the product |
| 10 | `10-admin-panel.md` | Phase 11 |
| 11 | `11-analytics.md` | Phase 12 — taxonomy, attribution, offline conversions |
| 12 | `12-api-design.md` | Phase 13 — endpoint catalogue |
| 13 | `13-security.md` | Phase 14 |
| 14 | `14-deployment.md` | Phase 15 — environments, CI/CD, DR, costs |
| 15 | `15-roadmap.md` | Phase 16 — phased plan with approval gates |

**Accuracy convention used throughout.** Anything I could verify from a primary source is cited. Anything modelled, estimated, or inferred is marked **[ASSUMPTION]** or **[VERIFY]**. Commercial rates, supplier terms and tax treatment are *not* things I can confirm for you — they are marked as blockers, not filled in with plausible numbers.

---

## 1. Executive summary

You have an unusually good frontend. It is not a prototype with a backend bolted on later — it was built with a deliberate integration seam (`src/lib/api/`), a domain model (`src/lib/types.ts`) that already normalises three supply sources, and a documented list of every mock. That is worth a lot: **the backend's job is largely to implement an interface that already exists**, rather than to negotiate one.

Three findings change the plan materially.

### Finding 1 — "Rathin" is not Rayna, and it is the wrong shape for your margin

The feasibility report guessed that "Rathin Tourism API" is Rayna Tours. **That guess appears to be wrong.** Rathin Tourism is a separate, real Dubai company (Al Suq St / Kuwait St, Dubai), and its B2B portal was built by a small agency, Ruzinn Technology, and launched December 2022. Ruzinn describes it as *"a comprehensive B2B platform... for attractions in the UAE"* that *"connects to the APIs of various parks and attractions"* — theme parks and water parks.

That matches your flow document exactly: token → **parks** → **ticket types** → **timeslots** → price → book. This is a park-ticket aggregator.

The consequence is commercial, not technical. Per your own business model, park and attraction tickets are **Tier A — 5–8% take, explicitly a cost centre**, and *"if you ever spend Meta money to sell a Burj ticket at 6% take... that is the fastest way to kill this company."* Rathin supplies Tier A. It supplies **none** of Tier B (desert safari, dhow cruise, city tour, Abu Dhabi day trip), Tier C (combos), Tier D (yacht, helicopter) or Tier E (transfers, eSIM) — where the business model puts 70%+ of gross margin.

**Architectural consequence:** the domain model must be **tour-and-activity shaped, with park-ticket as a constrained special case** — never the reverse. If you let Rathin's park/ticket-type/timeslot vocabulary become your internal model, you will not be able to represent a desert safari with pickup zones, pax-type meal choices, and a Jain kitchen guarantee — which is the actual product. The existing `Activity` type in `src/lib/types.ts` is already the right shape. Keep it. Rathin becomes one adapter behind it.

### Finding 2 — the Rathin document is not an API specification

`Rathin API Flow 2.pdf` is one page of seven bullets. It contains no base URL, no endpoint paths, no authentication scheme, no request or response schemas, no error codes, no rate limits, no pagination, no sandbox environment, and — most importantly — **no cancellation, no amendment, and no booking-retrieval operation.**

Two of those omissions are not cosmetic:

- **No booking-retrieval / idempotency mechanism.** If a `CreateBooking` call times out, you cannot ask "did that booking actually get created?" With real money and real inventory, this is how you double-book a customer and pay twice. This is the single highest-priority question in the spike.
- **No cancellation operation.** If Rathin has no cancellation API, you cannot offer self-serve cancellation on any Rathin SKU. PRD `AC-BM-01` becomes unimplementable for that inventory, and the refund becomes a manual ops task with a human SLA. That is a product decision, not an engineering one.

§02 contains a 22-question spike checklist. **No code should be written against Rathin until it is answered in writing.**

### Finding 3 — the build constraint is the architecture

You told me the team is "Claude and Claude Code." That is a real and legitimate constraint, and it should drive the stack harder than any performance or scale argument, because at your projected volumes (1,700 bookings/month at month 12 — roughly **2 orders/hour**), *nothing in this system is technically difficult at the scale it will actually run at.* Every genuine risk is a correctness risk: money, inventory, and idempotency.

So the design goal is not throughput. It is: **minimise the number of places a subtle bug can hide, and maximise the amount of the system that is verifiable by a test rather than by a person remembering how it works.**

That means:

- **One repository, one language, one deployment.** A modular monolith inside the existing Next.js app. Not NestJS-as-a-separate-service, not microservices, not a separate worker fleet at launch.
- **Boring, heavily-documented technology.** Postgres, Prisma, Next.js Route Handlers, Razorpay. These have enormous, consistent, current training representation; an LLM writes them correctly far more often than it writes, say, Drizzle's relational query builder or a hand-rolled BullMQ worker topology.
- **Thin transport, fat services.** All business logic in framework-agnostic modules under `src/server/**`. Route handlers are ten-line adapters. This is both the best structure for AI-generated code (small, single-purpose, individually testable) and what makes a later extraction to a separate service mechanical rather than a rewrite.
- **Managed everything.** No self-hosted Redis, no RabbitMQ, no Kubernetes. Operational work you cannot do at 2am is operational work you should not own.
- **Invariants enforced in the database, not in application code.** Unique constraints, check constraints, foreign keys, and a capacity ledger with row locks. A database constraint cannot be forgotten by a code generator; a validation function can.

**Recommended stack:** Next.js 15 Route Handlers · PostgreSQL (Neon) · Prisma · Upstash Redis · Upstash QStash for async work · Cloudflare R2 · Postgres full-text search · custom phone-OTP auth · Razorpay (INR) + a UAE gateway at V1 · WhatsApp via a BSP · PostHog + GA4 + Meta CAPI · Sentry · hosting stays where it is (see D3).

Full evaluation and the honest case against this choice is in §03.

---

## 2. The five decisions that need your approval before implementation

These are commercial and product decisions with architectural consequences. I have made a recommendation on each, but they are yours.

### D1 — Do we sell before the supplier has confirmed?

For manual-confirmation SKUs and for any supplier without a hold/reserve operation, you must choose one of:

| Option | Customer experience | Risk you carry |
|---|---|---|
| **A. Charge, then fulfil** *(recommended, and what the PRD assumes)* | Instant checkout; "confirming with the operator, voucher within 2 hours" | You hold the customer's money against inventory you have not secured. Supplier rejection means refund + goodwill cost. PRD `AC-VOU-03` already codifies the remedy |
| B. Authorise, capture on confirmation | No money moves until confirmed | Razorpay auth-and-capture adds complexity, auth windows expire, UPI does not support holds well in practice **[VERIFY with Razorpay]** |
| C. Manual SKUs are enquiry-only | Zero risk | Kills self-serve conversion on your highest-margin Tier B/C/D inventory. Directly contradicts the PRD |

**Recommendation: A.** It is what the PRD and the acceptance criteria already describe. But it must be a conscious decision, because it means **the business absorbs supplier rejection**, and the refund reserve (1.5% of GMV in your model) is where that shows up. §06 designs the compensating saga.

### D2 — Cancellation on Rathin inventory if Rathin has no cancellation API

If the spike finds no cancellation endpoint: do we (i) sell Rathin SKUs as strictly non-refundable and say so in bold at the point of sale, or (ii) offer a cancellation window and absorb the cost manually via ops?

**Recommendation: (i) for launch.** Your business model is explicit: *"Never offer the customer a softer cancellation policy than your supplier gives you unless you have priced that gap in."* Clarity beats generosity, and the PRD's own principle is price honesty. Revisit once volume justifies the reserve.

### D3 — Deployment target: Vercel or stay on Netlify?

The repo contains a `.netlify` directory. Netlify's published, non-configurable limits are **60 seconds for synchronous functions, 30 seconds for scheduled functions, and 15 minutes for background functions**, uniform across plans.

That is workable. Sixty seconds comfortably covers the 45-second `createBooking` budget in §06, and 15-minute background functions are genuinely useful. **This is a weaker argument than I initially thought, and I am correcting it rather than leaving the stronger version standing.**

The remaining reasons to consider Vercel are real but ordinary: first-party Next.js support (App Router features land there first and are best-tested), configurable function durations rather than fixed ones, and marginally better DX for a Next.js-only team. Against that, staying put costs nothing and avoids a migration during a build.

**Recommendation: stay on Netlify unless you hit a concrete limitation.** Two caveats to design around either way:
- The 30-second scheduled-function ceiling means cron work must delegate to queued jobs rather than doing the work inline — which §04 already requires.
- Whichever host you choose, set an explicit timeout budget on every supplier call (§02.5.2) rather than relying on the platform ceiling to save you.

### D4 — Agent console: build or buy?

PRD §19.6 flags this as open. Having read the requirement, my view: **build it, inside the same app, as `/admin/console`.**

The reasoning: the standard argument for buying (Wati, Interakt, Freshchat) is that inbox, canned replies, and assignment are commodity. True. But your non-commodity requirement is the **quote builder** — assemble a multi-SKU quote against *live net rates with margin visibility*, then emit a payment link that writes to the *same order object* as self-serve. No helpdesk can do that, because it requires your pricing engine and your order table. Integrating a bought inbox with a built quote builder gives you two systems and a sync problem — exactly what PRD §0 warns will "break reconciliation, refunds, and analytics within three months."

**Recommendation: buy the WhatsApp transport (BSP), build the console.** Use the BSP purely as a message pipe with webhooks; own the conversation state, the customer 360, and the quote builder.

### D5 — Price authority moves to the server, and the frontend must change

Today `src/lib/pricing.ts` computes prices in the browser. That cannot survive contact with money: a client-computed price is a client-controlled price. The backend must issue **server-signed quotes** (§06), and the frontend must be refactored to display a quote rather than compute one.

This is the single largest frontend change the backend forces. It is not large in lines of code — `computeBreakdown` becomes a fetch — but it touches the ADP, cart, and checkout. Budget it explicitly.

---

## 3. Blockers — none of these are engineering problems, and all of them block engineering

| # | Blocker | Blocks | Owner | Needed by |
|---|---|---|---|---|
| **B1** | **Rathin spike answered in writing** (§02 checklist) — auth, endpoints, schemas, idempotency, cancellation, rate limits, sandbox | Supplier adapter, inventory model, booking engine | Chirag + Rathin | Before Phase 1 build |
| **B2** | **Written CA opinion**: TCS applicability on single activity vs package; GST on margin vs gross; FEMA/LRS remittance route | Checkout UI, tax engine, invoice generation | Chirag + CA | Before checkout is built |
| **B3** | **Razorpay account + live negotiated rates.** Published standard is 2% + GST (~2.36%); your model assumes 2.2%. At >₹5L/month, custom pricing is available — ask for it | Payment layer, unit economics | Chirag | Phase 2 |
| **B4** | **WhatsApp BSP selected and business verified.** Meta moved to **per-message** pricing on 1 July 2025 — this changes the cost model and the notification scheduler design (§08) | Rail B entirely | Chirag | Phase 3 |
| **B5** | **Legal entity + settlement decision**: which entity collects INR, which collects AED, how INR settles to AED suppliers | Payments, refunds, reconciliation | Chirag + CA/banker | Phase 2 |
| **B6** | **Direct supplier contracts (6–8)** with net rates. Without these the catalogue is Tier A only and the take rate cannot clear 15% | Inventory, pricing engine, the business case | Chirag | Phase 1 (parallel) |

**B1 and B2 are hard blockers.** B2 in particular: you cannot design a checkout that satisfies "no fee appears that was not visible at the first price shown" (PRD §20) while not knowing whether a 2% TCS line applies.

---

## 4. What I am challenging

You asked me to challenge assumptions. Five, in descending order of how much money they represent.

**1. The PRD is scoped for a team you do not have.** It describes a self-serve marketplace, an assisted rail, an agent console, an admin panel, a supplier portal, programmatic SEO at scale, a loyalty system, and a referral engine — for a business whose own model targets 60 bookings in month 1. The frontend already built most of the storefront, which makes this look closer than it is; the storefront is the cheap half. **My roadmap (§15) deliberately does not build most of V1 in V1.** The MVP is: one supplier adapter, one payment gateway, a correct order object, voucher delivery, and an agent console good enough to take a WhatsApp booking. Everything else waits for evidence.

**2. "Both rails write to the same order object" is correct and is also the hardest thing in the build.** PRD §0 is right, and I would go further: the agent console must not have a privileged path. An agent creating an order should hit the *same* service function as the storefront, with a different actor identity. Any "just this once" bypass — an agent overriding a price, forcing availability, skipping the quote — is where reconciliation dies. §06 specifies these as explicit, audited, permission-gated operations rather than back doors.

**3. Availability caching at 5 minutes is probably wrong in both directions.** The PRD specifies a 5-minute TTL. For Tier A park tickets with large daily capacity, 5 minutes is needlessly aggressive and will hammer a small supplier's portal. For a timeslot with 4 seats left, 5 minutes is far too stale. §02 proposes TTL by inventory characteristic, not a global constant, plus a hard rule that **the only cache TTL that matters is zero, at payment authorisation.**

**4. The 20-minute price lock is a liability you have not priced.** Locking a price means that if the supplier's rate moves inside the window, you eat it. At low volume this is noise. It is also a straightforward attack surface (open 500 carts, lock 500 prices). Recommendation: keep the 20-minute lock as a customer promise, but implement it as a **server-side quote with a signed expiry and a per-session cap**, and log every instance where a locked price was honoured below the current net rate so you can measure what the promise costs.

**5. "5,000 concurrent users (MVP)" in PRD §15 is not a real requirement.** At 100 bookings/month, five thousand concurrent users is roughly the entire Indian outbound-to-Dubai market visiting simultaneously. Designing for it would push you toward architecture (read replicas, aggressive caching layers, horizontal workers) that costs money and — far more expensive — costs correctness attention. I have designed for **~200 concurrent users and 50 req/s sustained** at launch, on a stack that scales to the PRD number by changing a plan tier, not a design. §14 states the scaling path explicitly so this is a conscious deferral rather than an oversight.

---

## 5. Approval gate

Implementation should not begin until:

- [ ] D1–D5 decided and recorded
- [ ] B1 (Rathin spike) answered in writing by Rathin
- [ ] B2 (CA opinion) received in writing
- [ ] §05 database schema reviewed — it is the most expensive thing to change later
- [ ] §15 Phase 1 scope agreed, including what is explicitly *not* in it

Signed off by: _______________  Date: _______

---

## Sources

Verified external facts used in this blueprint:

- [Ruzinn Technology — Rathin Project](https://www.ruzinn.com/portal.html) — Rathin as a UAE attractions B2B ticketing portal, launched Dec 2022
- [Rathin Tourism company listing](https://travelagencies.ae/en-ae/i/58249-rathin-tourism/) — Dubai tour operator and ticket supplier; theme park tickets, visas, desert safari
- [Razorpay pricing](https://razorpay.com/pricing/) — standard 2% + GST across modes; custom pricing above ₹5,00,000/month
- [WhatsApp Business Platform pricing](https://developers.facebook.com/docs/whatsapp/pricing/) — per-message pricing since 1 July 2025; free service messages and utility templates inside an open customer service window; 72-hour free entry-point window
