# Phase 11 — Admin Panel

---

## 1. Scope and the test it must pass

Same Next.js app, `/admin/**`, RBAC enforced server-side. Server Components read through repositories; every mutation goes through the same services the storefront uses, with an actor attached.

The acceptance test for the whole panel is PRD §20: **"admin can operate it without engineering."** If a routine business action requires a developer, a deploy, or a database query, the panel is incomplete. In practice that means these must be admin-editable without a deploy:

- Product content, media, attributes, publish state
- Prices, price rules, margin floors
- **Search ranking weights** (`AC-SRCH-05`) — currently a const in `src/lib/search.ts`
- Coupons
- Homepage merchandising slots
- SLA thresholds, business hours, CAC alert threshold
- Feature flags

---

## 2. Modules

### 2.1 Dashboard
Today: GMV, orders, AOV, blended take rate, orders by rail, voucher latency p95, WhatsApp median first response, supplier-pending count, SLA breaches, refund rate.
Alerts panel: money-without-order, orders stuck in `paid`, supplier circuit open, DLQ items, reviews ≤2 stars, **blended CAC over the ₹700 threshold** (`AC-AN-03`).

### 2.2 Orders (PRD §9.1)
List with filters: status, date range, supplier, rail, value, payment status, voucher status.
**`AC-ADM-03`: locate any booking by reference, phone, or email in under 5 seconds** — indexed in §05, and worth an explicit performance test.

Detail view: full timeline (placed → paid → supplier submitted → confirmed → voucher sent → delivered → travelled), items with supplier booking state, payment and refund history, communication log with delivery receipts, audit trail.
Actions: resend voucher · amend · cancel with refund quote · refund (full/partial) · reassign supplier · force-confirm (Ops, audited) · add internal note.

### 2.3 Agent console
§09. Lives at `/admin/console`.

### 2.4 Products (PRD §9.3)
CRUD over the model in §05: content, media, variants, add-ons, inclusions/exclusions, itinerary, dietary and accessibility attributes, cancellation policy, tier, supplier mappings with priority, SEO fields, publish/unpublish.
Lifecycle gates from §02.6.1 enforced in the UI **and** in the service.
Bulk actions: publish, pause, retier, reassign supplier.

**Migration note:** the first job here is importing the 26 SKUs from `src/lib/data/activities.ts`. Keep that file afterwards as a test fixture.

### 2.5 Inventory
Capacity ledger by product and date — capacity, committed, held, remaining. Blackout dates. Availability cache inspector with `checkedAt` and a force-refresh. Supplier circuit-breaker status. Manual confirmation queue with SLA countdown (`AC-INV-03`) — this screen is where ops lives on a busy day, so it should be the fastest page in the panel.

### 2.6 Pricing (PRD §9 / §12)
Net rates by supplier with validity windows. Retail prices, INR and AED **independently editable** (`AC-PRC-03`). Price rules engine: tier markup, seasonal ranges, lead-time, pax-group. Margin floors per tier. **Margin visible on every SKU** — never price blind. Bulk update by category/supplier/tier. Override flow requiring a reason (`AC-PRC-01`). Price change log (`AC-PRC-04`).
Propagation within 5 minutes (`AC-PRC-02`) — show the last-propagated timestamp so ops can see it worked.

### 2.7 Suppliers (PRD §9.6)
Profile, contacts, payment terms, capabilities. Contracted rate cards. **Reliability scorecard**: on-time %, rejection rate, average review, complaint count, computed nightly (§02.6.5). Payout and reconciliation status. Booking volume and margin contribution. Pause/terminate.

### 2.8 Customers (PRD §9.4)
360 view (shared with §09.3.5): booking history, LTV, segment with manual override (`AC-CRM-01`), credits, consent state, communication log, support tickets. Export and deletion request handling (`AC-ACC-03`) with the anonymisation pattern from §05.8.

### 2.9 Reviews (PRD §9.5)
Moderation queue with a **24-hour SLA** (`AC-REV-02`) — publish or reject with a reason. Photo review. ≤2-star reviews flagged, routed to an ops alert within 1 hour and attached to the supplier scorecard (`AC-REV-03`). Dietary-met flag reported separately — it is the direct measurement of your differentiation.

### 2.10 Coupons (PRD §13)
Create with all constraints: type, value, min order, valid tiers/categories/SKUs, date range, usage caps (total and per user), new-customer-only, channel. **Margin guardrail** (`AC-CPN-01`) — a coupon that would breach the floor is rejected at validation with a clear message. Stacking rules with credits. Auto-apply links. Reporting: redemptions, incremental GMV, **margin impact** (`AC-CPN-03`).

### 2.11 Content
Categories, collections, attraction hubs, combos, landing pages, FAQs, legal pages, homepage merchandising slots.
**Merchandising rule enforced in code, not policy:** `AC-HP-05` — no Tier A SKU in positions 1–8 of any hero rail. The frontend already enforces this; the admin must not be able to configure a violation.

### 2.12 Reports (PRD §9.7 / §8)
The seven dashboards from PRD §8, all exportable to CSV:
1. Funnel, split by rail
2. Unit economics live — GMV, take rate, blended CAC, contribution margin, by day and channel
3. **GMV by tier A–E** (`AC-AN-04`) — the take-rate lever, reviewed weekly
4. **FIT vs expat share** — board-level KPI per the business model
5. Attach — combo attach rate, in-trip second booking rate
6. Ops — voucher latency, WhatsApp response time, refund rate, supplier reliability
7. Cohorts — repeat rate by segment and acquisition channel

### 2.13 Settings and users (PRD §9.8)
Admin users with mandatory MFA (`AC-SEC-02`), roles and permissions, business hours, SLA thresholds, ranking weights, tier markups, CAC alert threshold, feature flags, WhatsApp templates registry, **audit log viewer** with filters by actor, entity and date.

---

## 3. Cross-cutting requirements

| Requirement | AC | Implementation |
|---|---|---|
| Every state-changing action audited with actor, timestamp, before/after | `AC-ADM-01` | `withAudit()` wrapper; `audit_logs` append-only at the grant level |
| Permissions enforced server-side, not only in the UI | `AC-ADM-02` | Permission check inside the service, not the route |
| Any booking findable by ref/phone/email in < 5s | `AC-ADM-03` | Indexes in §05; performance-tested |
| No shared accounts; MFA mandatory | `AC-SEC-02` | `admin_users.totp_enabled` required before any permission grants |
| PII access logged | §13 | `customers.view_pii` writes an audit entry on each 360 view |

---

## 4. Supplier dashboard — correctly deferred

PRD §10 defers this to V2, and that is right: *"suppliers are managed over WhatsApp and email by ops — which is correct at low volume and avoids building a portal nobody uses."*

Prepare for it without building it:
- `suppliers` and `supplier_bookings` already carry everything a portal would read
- The **daily manifest** is a report ops emails today (`AC-SUP-D-01`: available by 6pm the previous day) and a portal screen later. Build the report now — ops needs it regardless
- Confirm/reject is an admin action now, a supplier action later — same service, different actor
- When built: hard tenancy isolation (`AC-SUP-D-03`), scoped by `supplier_id` in a repository-level filter, not a WHERE clause an engineer must remember

---

## 5. Build sequencing

| Phase | Modules |
|---|---|
| **MVP** | Orders (list, detail, resend, cancel, refund) · Products (CRUD, publish) · Pricing (net rates, retail, margin visible) · Manual confirmation queue · Customers (basic 360) · Audit log · Admin users + MFA |
| **V1** | Reviews moderation · Coupons · Suppliers with scorecard · Reports 1–4 · Content management · Settings (ranking weights, flags) · Inventory ledger UI |
| **V2** | Reports 5–7 · Supplier portal · Advanced merchandising · Bulk operations |

MVP is deliberately narrow: **whatever ops needs to rescue a booking that went wrong.** That is orders, products, prices and the confirmation queue. Everything else can be a database query for the first hundred bookings.
