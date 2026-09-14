# Phase 15 — Deployment, Operations and Cost

---

## 1. Environments

| | Development | Staging | Production |
|---|---|---|---|
| App | local `next dev` | Vercel preview (per PR) | Vercel production |
| Domain | localhost:3000 | `staging.outly.in` | `outly.in` |
| Database | Neon dev branch | Neon staging branch, **anonymised** prod copy | Neon production |
| Redis | Upstash dev | Upstash staging | Upstash prod |
| QStash | dev topic (or local no-op) | staging topic | prod topic |
| R2 | dev bucket | staging bucket | prod bucket |
| **Rathin** | **mock adapter** | sandbox if it exists, else mock | live |
| Razorpay | test keys | test keys | **live keys** |
| WhatsApp | log-only adapter | BSP sandbox number | production number |
| Email | Resend catch-all | catch-all inbox | live |
| Analytics | disabled | tagged `environment=staging`, excluded from reports | live |
| `/design-system` | open | open | **blocked** |

**Non-negotiables:**
1. No real customer PII outside production.
2. No live payment or BSP credential outside production.
3. Staging can never send a message to a real customer. Enforce with a global recipient allowlist in non-production, checked in the notification service — not by remembering.

**Deployment note (Decision D3):** the repo currently has a `.netlify` directory. Netlify's limits are **60s synchronous, 30s scheduled, 15 min background**, non-configurable and uniform across plans — which is adequate for this system. The table above assumes Vercel because that is the marginally better fit for a Next.js-only team, but **staying on Netlify is a legitimate choice and avoids a migration mid-build**; substitute "Netlify" throughout if you stay. Two constraints apply either way: scheduled work must delegate to queued jobs (the 30s ceiling), and every supplier call needs its own timeout budget (§02.5.2) rather than relying on the platform ceiling.

---

## 2. CI/CD

```
Pull request
  ├ typecheck (tsc --noEmit)
  ├ lint (eslint, incl. the import-boundary rules from §03.3)
  ├ unit tests (server/domain — must be fast, must be exhaustive)
  ├ integration tests (Postgres service container, mock supplier)
  ├ prisma migrate diff → FAIL if the migration is not committed
  ├ npm audit → FAIL on high/critical
  ├ secret scan
  ├ build
  └ deploy Vercel preview + Neon DB branch  → E2E smoke suite

Merge to main
  ├ all of the above
  ├ prisma migrate deploy (staging)
  ├ deploy staging
  ├ E2E suite against staging
  └ [manual approval gate]
        ├ prisma migrate deploy (production)
        └ deploy production → post-deploy smoke → auto-rollback on failure
```

**The manual gate stays.** With an AI writing the code and one person reviewing it, an automatic path from merge to production is not a velocity win — it is a way to discover a bad migration in front of customers.

**Migration discipline** matters more than anything else in this pipeline:
- Every migration reviewed as SQL, by a human, before it touches staging
- Forward-only, backwards-compatible: expand → migrate data → contract, across three deploys, never a destructive change in one
- Never drop a column in the same release that stops writing to it
- Long-running migrations run out of band, not in the deploy step

---

## 3. Monitoring and alerting

### Health
`GET /api/health` → app, database, Redis, and last-successful-run age for each critical job. Uptime monitor every minute from two regions (India and UAE — your two markets, and latency from each is a real signal).

### Alerts, with routing

| Severity | Condition | Route |
|---|---|---|
| **P1** | Payment captured with no order (`AC-PAY-02`) | WhatsApp + email + Sentry, immediate |
| **P1** | Order in `paid` for > 15 minutes | WhatsApp + email |
| **P1** | Supplier booking in `unknown` | WhatsApp + ops queue |
| **P1** | Any price mismatch detected (`AC-CO-02`) | WhatsApp + Sentry |
| **P1** | Database or gateway unreachable | WhatsApp + email |
| P2 | Supplier circuit breaker open | Slack/email |
| P2 | QStash DLQ non-empty | Slack/email |
| P2 | Voucher latency p95 > 5 min | Slack |
| P2 | Manual confirmation SLA breach (`AC-INV-03`) | Ops queue + Slack |
| P2 | Error rate > 1% over 5 minutes | Sentry |
| **P2** | **Blended CAC > ₹700** (`AC-AN-03`) | WhatsApp + email to Chirag |
| P3 | Review ≤2 stars (`AC-REV-03`) | Ops queue within 1h |
| P3 | Refund rate > 6% (business-model kill signal) | Weekly report |

**Alert to a person, not a dashboard.** With a team of one, an alert that lands somewhere nobody looks is the same as no alert. WhatsApp is the right channel — you will see it.

### Business monitoring
Daily digest at 09:00 IST: yesterday's GMV, orders, take rate, CAC, refunds, voucher latency p95, WhatsApp median first response, SLA breaches. This is the habit that catches slow problems before an alert would.

---

## 4. Backups and disaster recovery

| | Target |
|---|---|
| **RPO** (data loss tolerance) | **< 5 minutes** — Neon PITR |
| **RTO** (time to restore) | **< 2 hours** |

- Neon automated backups with point-in-time restore; retention per plan **[VERIFY your tier]**
- Weekly logical dump (`pg_dump`) to R2, encrypted, 90-day retention — an independent copy, not just the provider's
- R2 versioning enabled on the voucher bucket
- **Quarterly restore drill, actually performed.** A backup you have never restored is a hypothesis. Record the elapsed time and fix whatever made it slow

### DR scenarios

| Scenario | Response |
|---|---|
| Bad deploy | Vercel instant rollback (previous immutable deployment) |
| Bad migration | Restore to a PITR point; replay `payment_events` (immutable, append-only) to rebuild order state |
| Neon regional outage | Restore to another region from PITR; update the connection string; ~1–2h |
| Redis outage | **Degraded, not down** — cache misses fall through to Postgres. Rate limiting fails open with a global cap. Design the code to tolerate this |
| QStash outage | Jobs queue at the source; a cron sweep re-enqueues on recovery. Vouchers are delayed, not lost |
| Supplier outage | Circuit breaker; SKUs hidden; manual fulfilment (§02.5.5) |
| Gateway outage | Payment links via the alternate gateway (once V1 adds one); agent-assisted booking continues |
| WhatsApp/BSP outage | Fall back to email and SMS with a voucher link. Ops notified |

**The reason `payment_events` is immutable and append-only** is precisely this: it is the ledger from which order state can be rebuilt if the derived state is ever corrupted.

---

## 5. Runbook — the six incidents you will actually have

Written out because at 2am you will not reason well.

**1. Payment captured, no order.** Find the payment in `payment_events`. Find the intended cart from the gateway `notes`. Create the order manually via admin with the same amount. Fulfil. If it cannot be reconstructed, refund in full and message the customer.

**2. Order stuck in `paid`.** Check `supplier_bookings` status. If `unknown` → call the supplier, confirm or reject, resolve in admin. If the job failed → check the DLQ, fix, re-enqueue.

**3. Supplier down.** Confirm the circuit is open. Verify affected SKUs are hidden from search. Message customers with pending bookings proactively. Fulfil manually where possible.

**4. Voucher not delivered.** Check `notifications` status. Resend from admin. If WhatsApp is failing → send by email, then SMS with a link. Customer can always self-serve from `/booking/[reference]`.

**5. Oversold slot.** Should be impossible for our own inventory (`capacity_not_oversold`), possible for supplier inventory. Contact the supplier for an alternative slot; if none, rejection saga — three options, refund pre-authorised.

**6. Suspected fraud order.** Hold fulfilment (not payment). Review velocity signals in admin. Approve or refund and blocklist.

Each of these should be a page in a `docs/runbook.md`, written before launch, with the exact admin screens named.

---

## 6. Cost — summary

Full breakdown in §03.7.

| Stage | Infrastructure | + WhatsApp/SMS | Total/month | % of GMV |
|---|---|---|---|---|
| Launch (100 bookings, ₹5L GMV) | ~₹4,000 | ~₹4,000–10,000 | **₹8,000–14,000** | 1.6–2.8% |
| 500 bookings (₹27.5L GMV) | ~₹12,000 | ~₹12,000–25,000 | **₹24,000–37,000** | 0.9–1.3% |
| 1,700 bookings (₹1cr GMV) | ~₹25,000 | ~₹25,000–60,000 | **₹50,000–95,000** | 0.5–0.95% |

**[ASSUMPTION — list prices at research date; verify each before committing.]**

Two observations that matter commercially:

1. **Infrastructure is not the cost problem; WhatsApp is.** And WhatsApp is a revenue channel, not overhead — but it should be modelled as a **variable cost per order**, not as "tools & fixed" (where the business model currently puts ₹5,000 at Tier 1). At Tier 1 that line is understated.
2. **The free-window optimisation in §08.2 is worth real money at scale.** Utility templates inside an open customer service window are free; the same messages sent blind are not. Building the scheduler to be window-aware is a few days of work against a line item that reaches ₹25,000–60,000/month.

---

## 7. Scaling plan

| Trigger | Action |
|---|---|
| Vercel function duration p95 > 5s | Profile; move slow work to jobs |
| Neon CPU sustained > 70% | Upgrade tier; add read replica for reports |
| DB connections exhausted | Prisma Accelerate or a larger pool |
| Search p75 > 800ms with > 1,000 SKUs | Materialised view, then Typesense |
| Catalogue traffic cost rising | Longer ISR, more edge caching |
| QStash > $50/month **or** a job needing > 5 min | Extract a worker service (§03.3.4) |
| `analytics_events` > 10M rows | Monthly partitions; archive to R2 |
| > 200 orders/day | Load-test the capacity ledger; consider advisory locks |
| Second developer hired | Revisit the monolith/service split |

**Do none of these preemptively.** Each is a response to a measurement, and every one of them costs the thing you have least of — attention on correctness.

---

## 8. Operational cadence

| Frequency | Activity |
|---|---|
| Daily | Business digest 09:00 IST; alert triage; ops confirmation queue |
| Weekly | SLA report (WhatsApp response, voucher latency); refund review; supplier scorecard; **GMV mix by tier**; dependency updates |
| Monthly | Cost review; performance review (Core Web Vitals, p75s); security patching; **expat mix vs target** |
| Quarterly | **Backup restore drill**; secret rotation; access review; DR tabletop; penetration retest if scope changed |
| Annually | Full penetration test; legal/DPDP review; supplier contract renegotiation on volume rebates |
