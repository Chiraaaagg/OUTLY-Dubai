# Route → guard → service permission and ownership matrix (H04 / H07 / H10)

Built on 25 October 2026 from the code on `fix/security-remediation`. Route-level tests: `src/server/__tests__/security/origin-media.test.ts` (guards and media types, with a meta-test that fails if a new mutation handler is not listed), `ownership.test.ts` and `customer-ownership.test.ts` (objects and roles).

Auth key: **S(perm)** = staff session (admin JWT + live `admin_sessions` row, TOTP enrolled, active user) plus that permission via `requireAdmin` (in-memory 300/min per user; "heavy" = Postgres 20/hour, fails closed). **C** = customer session (opaque token, SHA-256 in `customer_sessions`). **P** = public. **Pend** = pending-login cookie.

"Origin" = `assertSameOrigin` (allowed Origin required; missing, `null`, foreign or `Sec-Fetch-Site: cross-site` → 403). "JSON" = `parseJson` (JSON media type, else 415; byte ceiling, else 413; strict schema).

## Mutations

| Method | Path | Auth | Origin | Body | Service rule / ownership |
|---|---|---|---|---|---|
| POST | /api/admin/activities | S(products.edit) | yes | JSON | create |
| PATCH | /api/admin/activities/:id | S(products.edit) | yes | JSON | version-checked update |
| DELETE | /api/admin/activities/:id | S(products.delete) | yes | JSON (reason) | `productLifecycle.softDeleteInTx` |
| POST | /api/admin/activities/:id/duplicate | S(products.edit) | yes | none | |
| POST | /api/admin/activities/:id/restore | S(products.delete) | yes | none | |
| POST | /api/admin/activities/:id/restore-version | S(products.edit) | yes | JSON | `productLifecycle.restoreVersionInTx` |
| POST | /api/admin/activities/:id/status | S(products.publish) | yes | JSON | |
| POST | /api/admin/auth/login | P (pre-auth) | yes | JSON | login limits fail closed |
| POST | /api/admin/auth/logout | staff cookie | yes | none | revokes session row |
| POST | /api/admin/auth/totp/enrol | Pend (enrol) | yes | none | |
| POST | /api/admin/auth/totp/verify | Pend | yes | JSON | replay-protected; limit fails closed |
| POST | /api/admin/categories | S(categories.edit) | yes | JSON | |
| PATCH / DELETE | /api/admin/categories/:id | S(categories.edit) | yes | JSON | |
| POST | /api/admin/imports/:id/apply | S(imports.run), heavy | yes | JSON | also `products.edit`; `products.publish` when publishing; `categories.edit` when creating categories; tamper checks |
| POST | /api/admin/imports/:id/revert | S(imports.run), heavy | yes | JSON | `products.delete` per created item, `products.edit` per restored item, preflighted; batch claim; per-item version guard |
| POST | /api/admin/imports/fetch | S(imports.run), heavy | yes | JSON | hop-validated Google fetch |
| POST | /api/admin/imports/preview | S(imports.run), heavy | yes | JSON ≤12 MiB, or multipart CSV ≤5.25 MiB | |
| POST | /api/admin/products/:id/fulfilment-mode | S(products.publish) | yes | JSON | |
| PUT | /api/admin/settings | S(settings.edit) | yes | JSON | |
| POST | /api/admin/users | S(users.manage) | yes | JSON | |
| PATCH | /api/admin/users/:id | S(users.manage) | yes | JSON | role change takes effect on the next request; suspend revokes sessions |
| POST | /api/admin/users/:id/reset | S(users.manage) | yes | optional JSON ≤16 KiB | |
| POST | /api/agent/inquiries/:id/assign | S(inquiries.assign) | yes | JSON | target must be active and TOTP-enrolled |
| POST | /api/agent/inquiries/:id/claim | S(inquiries.claim) | yes | none | self-claim only when unassigned |
| POST | /api/agent/inquiries/:id/contact | S(inquiries.update) | yes | JSON | `assertCanUpdate` (assignee or `inquiries.assign`) |
| POST | /api/agent/inquiries/:id/convert | S(inquiries.convert) | yes | JSON | `assertCanUpdate` + `orders.create` + `payments.record`; in-transaction claim; idempotent |
| PATCH | /api/agent/inquiries/:id/items/:itemId | S(inquiries.update) | yes | JSON | `assertCanUpdate`; item must belong to the inquiry (else 404) |
| POST | /api/agent/inquiries/:id/notes | S(inquiries.update) | yes | JSON | **`assertCanAddNote`: view + update — collaborative (owner decision 2026-10-25)**; audited |
| POST | /api/agent/inquiries/:id/spam | S(inquiries.mark_spam) | yes | JSON | `assertCanModerate` |
| POST | /api/agent/inquiries/:id/status | S(inquiries.update) | yes | JSON | `assertCanUpdate`; reopen needs `inquiries.assign` |
| POST | /api/agent/inquiries/:id/unassign | S(inquiries.claim) | yes | JSON | owner, or `inquiries.assign` |
| POST | /api/agent/notifications/:id/resend | S(notifications.resend) | yes | none | **update rule**: `inquiries.assign`, or assignee of the notification's inquiry; no-inquiry messages lead/ops only |
| POST | /api/auth/logout | C | yes | none | revokes session |
| POST | /api/auth/otp/request | P | yes | JSON | phone + IP limits fail closed |
| POST | /api/auth/otp/verify | P | yes | JSON | single-use challenge; phone never taken from the body |
| POST | /api/auth/otp/widget | P | yes | JSON | provider token verified server-side |
| POST | /api/events | P (anonymous cookies) | yes | **exception**: JSON or `text/plain` (sendBeacon) ≤64 KiB | instance ceiling, per-IP quota, identity quota (fail open, bounded in memory) |
| POST | /api/inquiries | P (+ optional C) | yes | JSON | server pricing; phone/IP limits fail closed; a signed-in customer cannot file under another phone |
| POST | /api/inquiries/lookup | P | yes | JSON | IP limit fails closed |
| POST | /api/me/delete-request | C | yes | optional JSON ≤16 KiB | audit + ops alert; nothing deleted |
| PUT | /api/me/preferences | C | yes | JSON | own consents only |
| PATCH | /api/me | C | yes | JSON | own profile; id/phone not accepted |
| GET, POST | /api/jobs/inquiry-sweep, /api/jobs/offline-conversions | cron secret (constant time; disabled without one) | n/a (server-to-server) | none | |
| POST | /api/webhooks/whatsapp | Meta HMAC over raw bytes | n/a (server-to-server) | raw ≤1 MB | nothing stored unless the signature is valid |

Server Actions (`src/app/admin/_actions/*.ts`, `src/app/account/_actions.ts`) rely on Next's built-in Origin/Host check (`null` and mismatched origins rejected; a missing Origin is allowed with a warning) and re-authorise through `requireCookies` and the same services as the routes.

## Reads (not origin-checked by design)

| Path | Auth | Rule / projection |
|---|---|---|
| GET /api/me/inquiries, /api/me/orders | C | `customer_id = me` **or** (`lead_phone = my verified phone` **and** not linked to any customer); customer view excludes notes, events, attribution and agent email |
| GET /api/me/export | C | same rule; `no-store`; attachment; audited |
| GET /api/me/preferences | C | own consents |
| GET /api/agent/inquiries, /counts, /agents | S(inquiries.view_own) | `view_all` sees all; otherwise own only; phone/email masked without `customers.view_pii`. readonly/finance (view_all only) get 403 at the route — open matrix question |
| GET /api/agent/inquiries/:id | S(inquiries.view_own) | `assertCanView`; redacted without `customers.view_pii`; PII view audited |
| GET /api/admin/users | S(users.manage) | no credential fields |
| GET /api/admin/settings | S(reports.view) | |
| GET /api/admin/audit | S(audit.view) | |
| GET /api/admin/reports/inquiries | S(reports.view) | |
| GET /api/admin/reports/agents, /dashboard | staff session | service requires `analytics.view` or `reports.view` |
| GET /api/admin/imports, /imports/:id | S(imports.run) | |
| GET /api/admin/imports/export | S(products.edit), heavy | catalogue only; CSV formula guard |
| GET /api/admin/activities…, /categories, /products | S(products.edit) | |
| GET /api/catalog*, /api/images/…, /api/health | P | public catalogue; image params validated; health without config warnings |
| GET /api/webhooks/whatsapp | verify token | constant-time compare; 403 when not configured |

## Role summary (observed in tests)

admin: everything. ops: no `users.manage`/`settings.edit`. agent_lead: no admin users/audit/settings writes. agent: writes on own inquiries, reads all, notes anywhere (collaborative), resend only on own. finance: `payments.record` but not convert; blocked from agent routes. content: catalogue only; rollback of batches with created items refused; 403 on inquiry routes. readonly: reports/settings reads; 403 on agent routes and every write. Suspended user: 401. Removed role row: 403 on the next request.
