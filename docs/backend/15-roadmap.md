# Phase 16 — Implementation Roadmap

---

## 1. Sequencing principle

The PRD's own phasing (MVP weeks 1–8, V1 weeks 9–20, V2 weeks 21–36) is scoped for a team you do not have. **This roadmap is deliberately smaller and slower at the front and does not attempt most of PRD V1 in V1.**

The ordering rule: **build the money path first, correctly, then everything else.** A booking engine that is right is worth more than a feature-complete product that occasionally charges the wrong amount, because the second one destroys the trust position that is the entire competitive strategy.

Second rule: **anything blocked on a supplier, a lawyer, or a bank is started immediately and in parallel**, because those have lead times measured in weeks and engineering does not.

---

## 2. Phase 0 — Unblock (Week 0, parallel to everything)

**Not engineering work. It is the critical path.**

| Task | Owner | Blocks |
|---|---|---|
| Send Rathin the 22-question spike (§02.2); get written answers | Chirag | All supplier work |
| Confirm Rathin's contracting entity; ask whether non-park inventory reaches the API | Chirag | Catalogue strategy |
| Written CA opinion: TCS single-activity vs package; GST margin vs gross; FEMA/LRS route | Chirag + CA | Checkout, invoicing |
| Razorpay account; **negotiate rates** (published standard is 2% + GST) | Chirag | Payments |
| WhatsApp BSP selection; business verification started | Chirag | Rail B |
| Entity/settlement decision: who collects INR, who collects AED | Chirag + CA/banker | Payments, refunds |
| **Sign 2–3 direct Tier B suppliers** (safari with contracted Jain kitchen, dhow, transfers) | Chirag | The business case |
| Decide D1–D5 (§00.2) | Chirag | Architecture |
| Decide hosting: stay on Netlify (adequate) or move to Vercel — see §00 D3 | Chirag | Nothing blocking |

**Exit gate:** B1 and B2 answered in writing. D1–D5 recorded. Without these, Phase 1 builds against guesses.

---

## 3. Phase 1 — Core booking engine (≈4 weeks)

**Objective:** a real order can be created, priced correctly by the server, verified against inventory, and persisted — with no payment yet.

| | |
|---|---|
| **Dependencies** | Phase 0 exit gate; D1, D5 |
| **Deliverables** | Postgres schema (§05) with all constraints · Prisma setup · `server/**` structure + lint boundaries · Catalogue API + migration of the 26 SKUs from `lib/data/activities.ts` · **Quote engine with signing, expiry, margin floors** · Availability service with TTL policy + capacity ledger · `ManualAdapter` (built **first**, before Rathin) · `RathinMockAdapter` reproducing every `MockScenario` · Order creation with idempotency, locks, snapshots · Server cart · Frontend F1–F4, F6 |
| **Risks** | Rathin spike answers arrive late → mitigate by building `ManualAdapter` first, which is where the margin is anyway · Schema churn → freeze after review, expand-only after |
| **Testing** | Unit: pricing, margin floors, money arithmetic · Integration: concurrent checkout on last seat, idempotency, quote expiry/tamper/reuse, coupon cap race · **Load: 50 concurrent checkouts on capacity 20 → exactly 20** |
| **Approval gate** | Displayed price = order price across 50 randomised carts (property test) · Zero oversell under the load test · Every `MockScenario` reproducible against the mock adapter |

**Why `ManualAdapter` first:** it needs no supplier, no network and no spike answers; it is where 70% of gross margin will flow; and building against it forces the abstraction to be genuine rather than Rathin-shaped.

---

## 4. Phase 2 — Payments and fulfilment (≈3 weeks)

**Objective:** money moves, bookings confirm, vouchers deliver. **This phase makes the product real.**

| | |
|---|---|
| **Dependencies** | Phase 1; Razorpay live; B2 (CA opinion) for the tax lines |
| **Deliverables** | `PaymentGatewayPort` + Razorpay adapter · Gateway order creation · **Webhook ingestion: verify, persist, 200, enqueue** · Order state machine · `FULFIL_ORDER` with retries and the rejection saga · **Rathin adapter (real)** once the spike is answered · Voucher PDF → R2 · Email delivery (Resend) · Public booking lookup · Cancellation with the real refund policy engine (replacing `free = true`) · Refunds via gateway API · Reconciliation sweeps (payments, supplier bookings, capacity, duplicates) · `tax_lines` if B2 says they apply |
| **Risks** | **Payment success + booking failure** → the saga in §06.6 is the mitigation and must be tested, not just written · Rathin has no idempotency/lookup → §02.5.4 fallback, and cap Rathin volume · Voucher latency misses 60s → measure early |
| **Testing** | Webhook replay ×3 → one transition · Forged webhook rejected · Supplier rejection → three options + pre-authorised refund · Refund maths at every policy boundary · Full E2E: browse → book → pay → voucher, in staging with test keys |
| **Approval gate** | 20 end-to-end test bookings with zero manual intervention · Voucher p95 < 5 min (60s target comes with WhatsApp) · Every failure mode in §06.7.4 produces the designed UI state · Reconciliation sweeps running and clean |

**Exit here and you have a business.** Everything after this is leverage.

---

## 5. Phase 3 — WhatsApp (≈3 weeks)

**Objective:** Rail B works end to end — 45% of target GMV.

| | |
|---|---|
| **Dependencies** | Phase 2; B4 (BSP live, templates approved, business verified) |
| **Deliverables** | BSP integration · Inbound webhook + conversation state · **CSW and free-entry-window tracking** (the cost model, §08.2) · `/api/wa/intents` context refs with attribution capture · Identity resolution (phone → user → orders → session) · Template registry, version-controlled and script-deployed · Consent engine with 60s opt-out and send-time re-check · Notification service · Flows 1, 3, 4, 5 (enquiry, confirmation + voucher, balance reminder, pre-trip) · Voucher over WhatsApp with auto-resend at T+10 min · Out-of-hours auto-acknowledgement |
| **Risks** | **Template approval delays** — start submissions in Phase 2, not here · Meta messaging-tier limits on a new number cap launch volume · Per-message costs higher than modelled → the free-window logic is the hedge |
| **Testing** | Voucher PDF renders and downloads on Android and iOS (`AC-WA-02`) · Opt-out honoured within 60s across every flow · Context arrives intact from every one of the 25+ placements · Cost recording accurate against the BSP invoice |
| **Approval gate** | `AC-VOU-01` — voucher on WhatsApp within 60s at p95 · `AC-WA-01`, `AC-WA-03`, `AC-WA-04` pass · Cost per order measured, not estimated |

---

## 6. Phase 4 — Agent console (≈3 weeks)

**Objective:** an agent can take a WhatsApp booking through the real engine.

| | |
|---|---|
| **Dependencies** | Phases 2 and 3; D4 |
| **Deliverables** | Admin auth with mandatory MFA · RBAC (permission matrix §09.4) · **Customer 360 in one call** (`AC-SUP-02`) · **Quote builder with live net rates and margin** · Multi-option quoting with the three-option rule · Payment link generation · `order.createOrder(input, actor)` from the console — same engine · Voucher resend, amend, cancel, refund · Support panel with supplier and driver contacts · Audit logging on every mutation |
| **Risks** | **Scope creep into a full helpdesk** — hold the MVP line: quote, 360, order, link · A bypass creeping into the order path — enforce by code review and by an integration test asserting agent orders are indistinguishable in the database |
| **Testing** | Agent-created order is byte-identical in shape to a self-serve order except `rail` and `created_by_agent` · Permission enforcement server-side: every privileged endpoint returns 403 to an under-privileged token · `AC-SUP-03` — quote + link in under 3 minutes, timed with a real agent |
| **Approval gate** | 10 real bookings placed through the console · Zero divergence between rails in orders, vouchers or refunds · Audit trail complete |

---

## 7. Phase 5 — Analytics and attribution (≈2 weeks)

**Objective:** CAC becomes measurable. Until this ships, every commercial decision is guesswork.

| | |
|---|---|
| **Dependencies** | Phases 2–4 (you need real orders to attribute) |
| **Deliverables** | `/api/events` collector · Server-emitted money events on state transition · Attribution capture (first + last touch, `fbclid`/`fbc`/`fbp`) · `order_attribution` · Meta CAPI with `event_id` dedup · **Offline conversion upload for Rail B** (`AC-META-02`) · GA4 Measurement Protocol · PostHog · Admin dashboards 1–4 · **Blended CAC daily with the ₹700 alert** (`AC-AN-03`) · Real `bookedThisMonth` and rating aggregates (removing the seeded fake) |
| **Risks** | Attribution chain broken for Rail B → the single most expensive analytics bug available to you; test the full path from CTWA ad → conversation → order · `AC-AN-02` (2% reconciliation) may not be literally achievable given Indian ad-blocker rates — reframe as "server count authoritative, delta explained" |
| **Testing** | Place an order through each acquisition path and assert attribution · Meta and internal counts reconcile within 10% (`AC-META-03`) · CAC alert fires on a synthetic breach |
| **Approval gate** | `AC-AN-01`, `AC-AN-03`, `AC-AN-04`, `AC-META-01`, `AC-META-02` pass · Rail B bookings visible in Meta |

---

## 8. Phase 6 — Admin panel (≈3 weeks)

**Objective:** ops can run the business without a developer (PRD §20).

| | |
|---|---|
| **Dependencies** | Phase 2 |
| **Deliverables** | Orders (list, detail, all actions) · Products CRUD with lifecycle gates · Pricing with net rates, retail, rules, floors, margin visible, change log · Inventory and manual confirmation queue with SLA countdown · Customers 360 with segment override · Reviews moderation with the 24h SLA · Coupons with the margin guardrail · Suppliers with the computed scorecard · Settings (ranking weights, flags, thresholds) · Audit log viewer · Reports 1–4 exportable |
| **Risks** | Building screens nobody uses — start from the runbook (§14.5): build what ops needs to rescue a booking, then expand |
| **Testing** | `AC-ADM-01` audit completeness · `AC-ADM-02` server-side enforcement · `AC-ADM-03` find any booking in < 5s · `AC-PRC-01`–`04` · `AC-CPN-01`–`03` |
| **Approval gate** | Ops runs for one week with zero engineering requests |

---

## 9. Phase 7 — Accounts, retention, launch hardening (≈3 weeks)

| | |
|---|---|
| **Deliverables** | Phone OTP auth + guest-order linking (`AC-ACC-02`) · Account area (trips, saved, profile, travellers, preferences) · Self-serve cancellation and date change · Wishlist with sharing · Reviews submission + display + moderation · Referral with fraud controls · WhatsApp flows 2, 6, 7 (abandoned cart, **in-trip upsell**, review request) · Trip grouping · PWA with offline vouchers · Data export and deletion (`AC-ACC-03`) · **Penetration test** · Load test · Legal review |
| **Approval gate** | §13.11 pre-launch checklist complete, all 14 items · Penetration test critical and high findings remediated (`AC-SEC-03`) |

**The in-trip upsell loop is here, not earlier, because it needs real bookings to be worth building** — but it is the highest-ROI mechanic in the product, so it should not slip past this phase.

---

## 10. Timeline

| Phase | Duration | Cumulative | Milestone |
|---|---|---|---|
| 0 — Unblock | Week 0 (parallel) | — | Blockers answered, decisions made |
| 1 — Booking engine | 4 weeks | W4 | Orders created correctly |
| 2 — Payments + fulfilment | 3 weeks | W7 | **First real booking** |
| 3 — WhatsApp | 3 weeks | W10 | Rail B live |
| 4 — Agent console | 3 weeks | W13 | Assisted bookings at scale |
| 5 — Analytics | 2 weeks | W15 | **CAC measurable** |
| 6 — Admin | 3 weeks | W18 | Ops self-sufficient |
| 7 — Accounts + hardening | 3 weeks | W21 | **Public launch ready** |

**≈21 weeks to a hardened public launch.** With a soft launch to warm demand (the business model's E1/E2 channels — expat communities, family agent network) possible from **week 7**, which is what the model recommends anyway: *"Soft launch to warm demand first... Target first 50–100 real bookings at near-zero CAC."*

**On seasonality:** the business model says to set the start so months 3–7 land in Nov–Mar (Dubai peak + DSF), and warns against beginning the scaling months in the Jun–Aug trough. Starting the build in September puts first bookings around late October and the scaling months squarely in the peak. That timing works.

---

## 11. Explicitly deferred

Deferring these is a decision, not an oversight.

| Deferred | Until | Why |
|---|---|---|
| AED payments / UAE gateway | V1, after entity resolution | Blocked on B5. The expat thesis needs it, but it cannot be built before the entity exists |
| Deposit (30/70) | V1 | Schema ready (`payment_schedules`); it is working capital before it is engineering |
| Supplier failover automation | V2 | Prepare the swap, let a human offer it. Automating equivalence needs evidence |
| Supplier portal | V2 | PRD defers it; ops over WhatsApp is correct at low volume |
| Loyalty / wallet credits | V2 | *"Loyalty without volume is a discount with extra engineering."* **Remove the credits UI now** |
| AI-drafted agent replies | V2 | Attack the throughput wall at ~500 bookings/month, not before |
| Programmatic SEO at scale | Content workstream, from month 1 | Not backend work, but a 6–9 month lag — **start publishing in month 1** |
| Native app | V2+, evaluate against PWA first | PRD is right to be sceptical |
| Typesense / Algolia | > 5,000 SKUs | |
| Extracting `server/` to a service | Per the trigger in §03.3.4 | |

---

## 12. Kill and pivot criteria

From the business model, checked monthly against real data. These are engineering-relevant because they change what gets built next.

| Signal | Threshold | Action |
|---|---|---|
| Blended take rate | < 15% at month 6 | Mix is broken. Force Tier C into every quote; cut Tier A visibility; **deprioritise Rathin work entirely** |
| Blended CAC | > ₹700 sustained | Cut paid spend. FIT no longer pays back |
| In-trip attach | < 20% at month 6 | The retention loop failed. Rebuild the sequence before scaling spend |
| Expat mix | < 15% at month 8 | The LTV thesis is not landing. **Prioritise AED payments and expat features over everything else** |
| Refund rate | > 6% | Supplier quality. Cut the worst operator |
| Contribution margin | Negative at month 9 | Pivot to B2B/white-label. Better economics, a fraction of the CAC, and it reuses this entire backend with a different front end |

That last row is worth noting architecturally: **a B2B/white-label pivot reuses everything in this blueprint.** Same catalogue, same booking engine, same suppliers, same vouchers — a different auth model, agent-level pricing, and credit terms. Nothing here forecloses it.

---

## 13. The one-paragraph summary

Build the money path first and get it exactly right: server-signed quotes so the displayed price is the charged price, a capacity ledger with database-level constraints so you cannot oversell, idempotency at three layers so one intent makes one booking, and payment strictly separated from fulfilment so a supplier's bad day is a delayed voucher rather than a lost order. Build the `ManualAdapter` before the Rathin adapter, because that is where the margin is and because it forces the abstraction to be honest. Treat Rathin as a shelf-filler, not a foundation, and do not write a line against it until the 22 spike questions are answered — particularly the two about idempotency and booking lookup, because an API that can create a booking but not tell you whether it did is not safe to put a payment gateway in front of. Get WhatsApp working as a real booking rail through the same engine, then make CAC measurable, because every strategic decision in your business model depends on a number you currently cannot see. And keep the whole thing in one repository with enforced module boundaries, because the constraint that should shape this architecture is not scale — it is that one person and an AI have to hold it in their heads, and be able to tell when something is wrong.
