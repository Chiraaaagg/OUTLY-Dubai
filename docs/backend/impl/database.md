# Database agent — implementation note

**Scope:** `prisma/**`, data-integrity tests, `audit.repo.ts`, `privacy.repo.ts`.
**State of the dev branch (Neon `neondb`, Postgres 18.6):** 2 migrations applied, `npm run db:status` clean, seeded (28 products, 6 combos, 6 suppliers, 28 mappings, 7 roles, bootstrap admin).

## 1. What was built

| File | What |
|---|---|
| `prisma/schema.prisma` | `inquiry_items.inclusions_snapshot` + `cancellation_policy_snapshot`; FK `orders.source_inquiry_id → inquiries`; FK `notifications.order_id → orders`. |
| `prisma/migrations/20260914102118_inquiry_item_snapshots_and_money_guards/` | The one additive migration (Prisma diff + hand-written tail). Reviewed as SQL below. |
| `prisma/seed.ts` | Two hardening edits (§7). Behaviour otherwise unchanged. |
| `src/server/__tests__/db-integrity.test.ts` | 20 tests against the real dev database; rollback-only, zero residue. |
| `vitest.setup.ts` + `vitest.config.ts` (`test.setupFiles`) | Loads `.env.local` (KEY=VALUE, quotes stripped, never overrides an existing var). |
| `src/server/repositories/audit.repo.ts` | `auditRepo.list(filters)` / `forEntity()` for `GET /api/admin/audit` (§19 §3). Read-only. |
| `src/server/repositories/privacy.repo.ts` | `anonymiseByPhone(phoneE164, actorId)` — DPDP deletion (§5). |

## 2. Tables (ERD-ish)

```
admin_users ─┬─ admin_user_roles ─ roles ─ role_permissions
             ├─ admin_sessions
             ├─ agent_availability (1:1)
             └─ settings.updated_by

inquiries ─┬─ inquiry_items      (mirror of order_items; CASCADE)
           ├─ inquiry_events     (append-only, trigger)
           ├─ notifications      (SET NULL)
           ├─ analytics_events   (SET NULL)
           ├─ wa_conversations   (inquiries.wa_conversation_id)
           ├─ converted_order_id ──► orders  (unique; the win)
           └─ ◄── orders.source_inquiry_id  (FK, SET NULL; NEW)

guests ─ orders ─┬─ order_items
                 ├─ order_attribution (1:1)
                 ├─ payments
                 ├─ notifications (NEW FK)
                 └─ analytics_events

suppliers ─ product_supplier_mappings ─ products ─┬─ inquiry_items
combos ───────────────────────────────────────────┴─ order_items

Cross-cutting: audit_logs (append-only) · consents (append-only) · suppressed_phones ·
webhook_events · rate_limit_buckets · idempotency_keys · job_executions · feature_flags
Sequences: inquiry_ref_seq (10482…) · order_ref_seq (48291…) + Luhn digit in code
```

| Table | Purpose | Mutability |
|---|---|---|
| `admin_users`, `roles`, `role_permissions`, `admin_user_roles`, `admin_sessions`, `agent_availability` | Staff identity, RBAC, refresh-token families, routing inputs | soft-delete on users |
| `audit_logs` | AC-ADM-01 trail | **append-only (trigger)** |
| `settings`, `feature_flags` | Admin-editable config without deploy | mutable |
| `suppliers`, `products`, `combos`, `product_supplier_mappings` | Catalogue identity for FK integrity + the `fulfilment_mode` hinge | soft-delete |
| `inquiries` | The pipeline (§17 §6.1) | mutable; PII anonymisable |
| `inquiry_items` | Cart lines at inquiry time, `order_items` shape | mutable (confirmed_* by agent) |
| `inquiry_events` | Status history + notes | **append-only (trigger)** |
| `suppressed_phones` | Spam / deletion-request block list | mutable |
| `consents` | DPDP evidence | **append-only (trigger)** |
| `guests`, `orders`, `order_items`, `order_attribution`, `payments` | Money path (§05.3.5–3.6), dormant until a win | never deleted (financial record) |
| `wa_conversations` | BSP conversation shell (deferred adapter) | mutable |
| `notifications` | Every outbound message + outcome | mutable (status) |
| `webhook_events` | Raw inbound payloads, dedup by provider id | mutable (processed_at) |
| `analytics_events` | Our collector is the source of truth (§11) | insert-mostly |
| `rate_limit_buckets`, `idempotency_keys`, `job_executions` | Infra | ephemeral |

## 3. Deviations from §05 / §17 §6 (all intentional, none blocking)

| Deviation | Rationale |
|---|---|
| No `citext`; `admin_users.email`, `inquiries.lead_email`, `orders.lead_email`, `guests.email`, `consents.email` are `TEXT` **lowercased on write** | Avoids an extension dependency on Neon; every writer (`auth.service`, `inquiry.service.create`, `order.service`, `consent.repo`) normalises. Case-insensitive uniqueness on admin email is therefore enforced by the write path, not the index — acceptable while admins are created only through `authService`. |
| `products.category_slug TEXT` instead of `category_id FK` | Categories live in `src/lib/data` fixtures (§10.2.4); there is no `categories` table to reference. |
| `analytics_events` **not partitioned** | Launch volume; §05.8 retention (24 months) handled by a dated delete. Partitioning later is a table swap, not a schema redesign. |
| `guests.email` and `orders.lead_email` nullable | Phone is the only mandatory channel in inquiry mode (§17 §6.1). |
| No `users`, `carts`, `quotes`, `traveller_profiles`, `sessions` (customer) | No customer accounts exist (§19 §0). `order_has_buyer` is `guest_id IS NOT NULL`. |
| FUTURE tables absent (`quotes`, `availability_cache`, `capacity_ledger`, `supplier_bookings`, `vouchers`, `refunds`, `tax_lines`, `coupons`, `reviews`, `wa_messages`, `price_*`, `net_rates`) | §17 §5.1 — additive when Rathin/self-serve arrives. |
| `inquiries.wa_conversation_id` instead of §17's `wa_conversations.inquiry_id` | One conversation can spawn several inquiries; the FK belongs on the many side. |
| `inquiry_has_identity` check omitted | `lead_phone` is `NOT NULL`; the check is tautological without `user_id`/`guest_id`. |
| `channel_preference`, `budget_band`, `payment_mode`, `products.status` are unchecked `TEXT` | Validated by zod at the edge; §05.1 rule 5 (churny sets stay text). Add checks after the vocabularies settle. |
| `order_items(service_date)` full index instead of `WHERE status='confirmed'` | In inquiry mode items are created `pending` and confirmed off-platform; a partial index would be empty. Revisit with pg_stat when fulfilment is automated. |
| `notifications(status, scheduled_for)` full instead of `WHERE status='queued'` | Same reasoning; `retryFailed` also scans `failed`. |
| `inquiries_status_sla_idx` (full) coexists with `inquiries_open_queue_idx` (partial) | Redundant but harmless at launch; drop the full one after a month of `pg_stat_user_indexes`. |
| `inquiry_events.actor_type` uses the shared `actor_type` enum (includes `admin`, `supplier`) | One enum for audit and events; superset of §17's three values. |
| `audit_logs` grant-level `REVOKE` is conditional on role `outlyy_app` existing | Neon's default connection is the owner role; the **trigger** is what enforces immutability for every role. Create `outlyy_app` before go-live (§6.4) so both hold. |
| `product_supplier_mappings` unique `(product_id, supplier_id, variant_code)` does not dedupe `variant_code IS NULL` | SQL NULL semantics. The seed guards it in code (look-then-create); a partial unique `WHERE variant_code IS NULL` is queued for the next migration (§8). |

## 4. Verification results

### 4.1 Indexes the queue and console need — all live (checked in `pg_indexes`)

| Query | Index | Status |
|---|---|---|
| Open queue / SLA sweep (`dueForSla`) | `inquiries_open_queue_idx (status, sla_due_at) WHERE status IN ('new','assigned')` | present |
| Value triage | `inquiries_value_triage_idx (indicative_total_inr DESC) WHERE status='new'` | present |
| Agent inbox / `listRoutable` load counts | `inquiries_agent_status_idx (assigned_agent_id, status)` | present |
| Customer lookup, history, previous agent | `inquiries_lead_phone_idx` | present |
| Default list sort | `inquiries_created_idx (created_at DESC)` | present |
| Follow-up sweep (`dueForFollowup`) | `inquiries_followup_idx (next_followup_at)` | present |
| Won attribution | `inquiries_converted_order_id_key` (unique), `orders_source_inquiry_idx` | present |
| Daily manifest | `order_items_service_date_idx` | present |
| Notification dispatch / retry | `notifications_status_sched_idx (status, scheduled_for)` | present |
| Audit console | `audit_logs_entity_idx (entity_type, entity_id, created_at DESC)`, `audit_logs_actor_idx (actor_id, created_at DESC)` | present |
| Double submit | `orders_idem (idempotency_key) WHERE NOT NULL` | present |
| Duplicate payment | `payments_gateway_payment_idx (gateway, gateway_payment_id) WHERE NOT NULL` | **added** |
| Dedup | `analytics_events (event_id, source)` unique, `webhook_events (provider, provider_event_id)` unique | present |
| Rate limiter | PK `(bucket_key, window_start)`, `rate_limit_expires_idx` | present |

Known seq scan: `inquiryRepo.list({ q })` uses `ILIKE`-style `contains` on `lead_name` / `lead_email` / `title_snapshot`. Fine at launch volume; add `pg_trgm` GIN indexes if the console search gets slow.

### 4.2 Money columns
Every `*_inr`, `*_aed`, `*_minor` column is `BigInt` (Prisma) / `BIGINT` (PG). `reliability_score` is `NUMERIC(5,2)` (not money). Non-negative checks now cover: `inquiries` (3 totals), `inquiry_items` (all 5 indicative + 3 confirmed, NULL-safe), `orders` (9 columns), `order_items` (5), `payments` (`amount_minor`, `fee_minor`, `tax_on_fee_minor`). `order_totals_consistent` covers both currencies.

### 4.3 `inquiry_items` vs `order_items` — column-for-column

| Column | inquiry_items | order_items | Decision |
|---|---|---|---|
| `inclusions_snapshot TEXT[]` | **added** | yes | Add. `convertToOrder` was writing `[]` into the order, losing what the customer was shown. |
| `cancellation_policy_snapshot JSONB` | **added** | yes | Add. Same reason — the policy at time of inquiry must become the policy at time of sale. |
| `mapping_id` | no | yes | Intentional: the supplier mapping is chosen at fulfilment, after the win. |
| `status` | no | yes (`order_item_status`) | Intentional: inquiry state lives on `inquiries`; per-item fulfilment status is an order concept. |
| `service_date` | nullable | NOT NULL | Intentional (§17 §6.2): dates may be flexible at inquiry; `convertToOrder` refuses items without one. |
| `unit_*`, `total_*`, `net_cost_aed` | as `indicative_*` (+ `confirmed_total_*`, `confirmed_net_cost_aed`) | plain | The one semantic difference (§17 §6.2). `confirmed_*` wins on copy. |
| `availability_checked_at`, `availability_note` | yes | no | Intentional: conversation state, not a snapshot. |
| `sort_order` | yes | no | Intentional: `order_items.id` is UUIDv7 (time-ordered); insertion order is display order. |
| `variant_code`, `title/tier/slug/kind/image/variant_name/confirmation/fulfilment_mode/free_cancellation_hours/duration_minutes` snapshots, `timeslot`, `pax`, `addons` | identical | identical | — |

## 5. Retention and anonymisation for inquiries (§05.8 applied)

| Data | Retention | Mechanism |
|---|---|---|
| `inquiries` (won) + their `orders`/`payments` | 7 years, PII anonymised on request | financial record; anonymise, never delete |
| `inquiries` lost/spam and their `inquiry_items`, `inquiry_events` | 24 months, then delete the inquiry (items cascade; events are append-only, so delete via a superuser maintenance session or leave the events — they carry no PII once `note` is scrubbed) | monthly job (FUTURE) |
| `notifications` (`recipient`, `payload`) | 24 months | dated delete |
| `analytics_events` | 24 months raw | dated delete |
| `consents` | as long as the subject can complain (keep) | append-only |
| `webhook_events` | 12 months | dated delete |
| `rate_limit_buckets`, `idempotency_keys`, `job_executions` | hours / 30 d / 90 d | opportunistic + job |

**DPDP deletion request (by phone) — what `privacy.repo.anonymiseByPhone` does, in one transaction:**

1. `inquiries WHERE lead_phone = $phone`: `lead_name`, `lead_phone` → `[deleted-<token>]`; `lead_email`, `hotel`, `special_requests`, `user_agent`, `ip_hash`, `session_id`, `anon_id` → `NULL`; `attribution` → `NULL` (fbclid/fbc/fbp/gclid are identifiers). `pax`, `dietary`, `pickup_zone`, dates, money columns, `items` stay — needed for reporting and the financial record and not identifying on their own.
2. `orders WHERE lead_phone = $phone`: same five PII columns → marker / `NULL`. `order_attribution.{fbclid,fbc,fbp,gclid}` → `NULL`; source/medium/campaign kept for aggregate reporting.
3. `guests WHERE phone_e164 = $phone`: `full_name`, `phone_e164` → marker; `email` → `NULL`.
4. `notifications` still `queued` for the number or the affected inquiries → `suppressed` (`deletion_request`) so nothing further goes out.
5. `suppressed_phones` gets the number (`deletion_request`) so a new form submission is not contacted.
6. `audit_logs` row: `action = privacy.anonymise`, `entity_type = phone`, `entity_id = [deleted-<token>]`, `after = { token, inquiryIds, orderIds, guestIds }`, `reason = DPDP deletion request`. The phone number itself is **not** written to the audit row; the token is random and lives only there.

Not scrubbed automatically (ops review, because rows are append-only): `inquiry_events.note` and `audit_logs.before/after` may contain the name typed by an agent. `consents.phone_e164` is the legal evidence of consent and is retained. Equivalent raw SQL for a maintenance session is the same five statements; run them inside `BEGIN … COMMIT` and insert the audit row last.

**Request → Admin agent:** wire `anonymiseByPhone` behind `privacy.anonymise` permission (add to `permissions.ts` matrix — Architect) with a confirm step; log the request reference in `reason`.

## 6. Operations

### 6.1 Backup / restore drill (Neon)
- **PITR:** Neon keeps a restore window per project (7 days on Launch, configurable). Restore = Neon console → Branches → *Restore* → pick branch + timestamp → Neon creates `<branch>_old_<ts>` and rewinds the branch. Drill quarterly: restore `dev` to 10 minutes ago, run `npm run db:status` and the integrity tests against it, then delete the `_old` branch.
- **Logical dump (off-platform copy, before every production migration):**
  ```bash
  # DIRECT_URL is the non-pooled endpoint; pg_dump must not go through the pooler.
  pg_dump "$DIRECT_URL" --format=custom --no-owner --no-privileges \
    --file "outlyy-$(date -u +%Y%m%dT%H%M%SZ).dump"
  # restore into a fresh branch / database:
  pg_restore --dbname "$RESTORE_URL" --no-owner --no-privileges --clean --if-exists outlyy-<ts>.dump
  ```
  Use the `pg_dump` from a PG 18 client (server is 18.6). Encrypt the file at rest; it contains PII.
- **Schema-only branch for migration rehearsal:** `neon branches create --parent main --name migrate-rehearsal` (or a schema-only branch), point `DIRECT_URL` at it, `npm run db:migrate`, run the integrity tests, delete the branch.

### 6.2 Production migration procedure
1. Migration authored on the dev branch with `npm run db:migrate:dev -- --name <slug> --create-only`, hand-written SQL appended, **reviewed as SQL**, then applied with `npm run db:migrate:dev`.
2. Rehearse on a branch of production (§6.1), take the logical dump.
3. Deploy: `DATABASE_URL=… DIRECT_URL=… npm run db:migrate` (`prisma migrate deploy`; forward-only, never `migrate dev`/`reset` against production). Then `npm run db:status` must print "up to date".
4. **Expand → migrate → contract.** Every migration is additive (new column with default / nullable, new index `CONCURRENTLY` when the table is large, new check with `NOT VALID` + `VALIDATE` for big tables). The app is deployed after the expand step and must run against both the old and new schema. Drops, renames and `NOT NULL` tightenings go in a later migration only after no deployed code reads the old shape.
5. Never drop, rename or narrow in the same release that introduces the replacement.
6. Create the `outlyy_app` role before go-live and connect the app as it; the conditional `REVOKE` in the init migration then applies at grant level.

## 7. Seed review (`prisma/seed.ts`)
- **Never overwrites an admin-changed `fulfilment_mode`:** confirmed. The product `update` block sets `title, tier, categorySlug, confirmation, quoteOnly` only; the combo `update` sets `name, tier, confirmation` only. `fulfilmentMode` is written on `create` alone.
- **Never prints a password when `ADMIN_BOOTSTRAP_PASSWORD` is set:** confirmed, and tightened — the guard now uses the *trimmed* value, so a whitespace-only value no longer creates an admin with an unprinted random password.
- **Idempotent:** roles upsert + permission reconcile; admin created once; suppliers/products/combos upsert by code/slug; mapping is look-then-create (was upsert-with-NULL that relied on Prisma throwing into a `.catch`); settings created only if absent; flags `update: {}`. Verified by re-running: 28 mappings before and after.
- Safe in production: no `deleteMany` on business tables, no `reset`, reads env only.

## 8. Requests / follow-ups
- **Inquiry Engine:** in `inquiry.service.create`, populate `inclusionsSnapshot` and `cancellationPolicySnapshot` from the fixture (`activity.inclusions`, `{ text: activity.cancellationPolicy, freeCancellationHours }`); in `convertToOrder`, copy both into the `CreateOrderItemInput` (the fields already exist there). Until then the order snapshot for those two fields is `[]` / `{}` — data is not lost at the inquiry level any more, only not forwarded.
- **Admin:** wire `auditRepo.list` to `GET /api/admin/audit`; wire `anonymiseByPhone` (see §5).
- **Architect:** `DATABASE_URL` is the `-pooler` host without `pgbouncer=true`; Prisma's Neon guide recommends `?pgbouncer=true&connect_timeout=15` on the pooled URL. Confirm or add.
- **Next migration (batch, not urgent):** partial unique `product_supplier_mappings (product_id, supplier_id) WHERE variant_code IS NULL`; FK `payments.recorded_by → admin_users`; check on `inquiries.channel_preference`; drop `inquiries_status_sla_idx` after pg_stat review.

## 9. Test status
- `npx vitest run src/server/__tests__/db-integrity.test.ts`: 20/20 pass (~40 s, real Neon round-trips). Skips cleanly when `DATABASE_URL` is unset. Residue check after the run: 0 rows in every touched table.
- `npm test`: 186/188 — the 2 failures are in `src/server/notifications/__tests__/templates.test.ts` (Notification agent, in progress), unrelated to the schema.
- `npm run typecheck`: no errors in `prisma/**`, `src/server/repositories/**`, `src/server/__tests__/**`, `order.service.ts`, `inquiry.service.ts`. Remaining errors are in other agents' in-progress files (`admin/(console)/users`, `events.schemas.ts`, `notification.service.ts`, `rathin.mock.ts`).
