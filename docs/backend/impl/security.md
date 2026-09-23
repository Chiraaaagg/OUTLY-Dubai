# Security — implementation note

**Agent:** Security · **Scope:** full review of the Inquiry Mode backend per §13, §17 §9, §14 §1 and §19; fixes applied directly (smallest correct change), everything else recorded here.
**Verification at hand-off:** `npm run typecheck` clean · `npm test` 16 files / 202 tests pass · `npm audit --omit=dev` = 3 high, all one advisory in a build-time dependency (see §4). No `next build`/`dev`/`start`, no migrations, no seed, nothing destructive against the database.

The production server on :3000 that the smoke test uses is on an **older build** than the source tree: its CSP is `script-src 'self' 'unsafe-inline'` (neither branch of the current `proxy.ts`) and its `/admin` redirect carries no security headers. Both are relevant to findings 1 and 2 below.

---

## 1. Findings and fixes

Severity: **critical** = exploitable now with real impact · **high** = exploitable with a valid low-privilege account or breaks a launch control · **medium** = defence-in-depth gap or data exposure beyond need-to-know · **low** = hardening · **info** = accepted / documented.

| # | Sev | Location | Finding | Fix |
|---|---|---|---|---|
| 1 | high | `src/proxy.ts:22-24, 63-108` | Production CSP was `script-src 'self' 'nonce-…' 'strict-dynamic'` for **every** route, but the storefront is statically prerendered (`x-nextjs-prerender: 1` on `/`): a per-request nonce can never reach those pages' inline bootstrap scripts, so the first production deploy of this source would have blocked hydration site-wide. The nonce was also only placed on the *response*; Next.js reads it from the **request** `Content-Security-Policy` header, so even dynamic pages would not have been stamped. | Nonce + `'strict-dynamic'` is now applied to `/admin/**` (force-dynamic) and the CSP is also set on the request headers so Next stamps its inline scripts. The static storefront keeps `'self' 'unsafe-inline'` for scripts (no `'unsafe-eval'` in production) — the policy the smoke-tested build already ships. Accepted deviation from §13.8 for the storefront: it renders fixture data only, no UGC, no customer text. **Needs-human:** confirm on the first preview deploy that `/admin/login` renders (nonce path) — fallback is one line (`isAdmin ? … : …`). |
| 2 | medium | `src/proxy.ts:70-97` | Early-return responses (design-system 404 rewrite, maintenance 503 rewrite, `/admin` login redirects) were sent **without** any security header (confirmed live: `HTTP 307 /admin` had no CSP/HSTS/nosniff). | All responses pass through `withHeaders()`; `X-Robots-Tag`/`Cache-Control: no-store` now also cover the admin redirects. |
| 3 | high | `src/server/services/inquiry.service.ts` `markSpam` | No ownership check: any actor with `inquiries.mark_spam` (every agent role) could mark **another agent's** inquiry as spam and suppress the customer's phone via `POST /api/agent/inquiries/:id/spam` or the `markInquirySpam` Server Action. | `assertCanModerate()` — same rule as `assertCanUpdate`: leads/ops (`inquiries.assign`) anywhere, agents only on inquiries assigned to them. `transition(… "spam")` already ran `assertCanUpdate`, so behaviour there is unchanged. |
| 4 | high | `src/server/services/notification.service.ts` `resend` | No ownership check: an agent with `notifications.resend` could resend any notification row by id (including ops-alert emails and other agents' customers' acks) — the console passes `inquiryId` but the service ignored it. | Actors without `inquiries.view_all` may only resend rows whose inquiry is assigned to them. |
| 5 | medium | `src/server/services/inquiry.service.ts` `get`/`list` | Contact PII (`leadPhone`, `leadEmail`) was returned to **every** actor with a view permission. The console hides it without `customers.view_pii`, but `GET /api/agent/inquiries[/:id]` did not — `readonly` holds `inquiries.view_all` and got full phone numbers (§17 §9 #9 exfiltration risk). | `redactDetail`/`redactSummary`: without `customers.view_pii` the service returns the masked phone, no email, and masks `history` too. The `inquiry.view_pii` audit row is written only when PII is actually released. |
| 6 | medium | `src/server/services/inquiry.service.ts` `toCustomerView` | Spread-based projection leaked internal ops data to the public lookup: `lostReason`, `escalatedAt`, `slaBreachedAt`, `nextFollowupAt`/`followupStage`, `ackSentAt`, `convertedOrderId`, `channelPreference`, `assignedAt`, and per-item `availabilityNote` (agent-written free text), `productId`/`comboId`. Agent email was already stripped (Inquiry Engine cross-cutting #1 — re-verified). | Rewritten as an explicit allow-list. Public shape now: submission fields, status, masked phone, agent public card (no email), coarse timeline, items without internal notes/ids. `src/lib/api/index.ts` `InquiryLookupResult` aligned (dropped `lostReason`, `items[].availabilityNote`). |
| 7 | medium | `src/app/api/inquiries/lookup/route.ts` | (a) IP-less requests shared the literal bucket `lookup:ip:unknown` — safe (not fail-open) but implicit; (b) the only limiter was per IP, so a **known reference** could have its phone guessed across many IPs. | (a) explicit `NO_IP_BUCKET` constant with the rationale; behind Vercel `x-forwarded-for` is always set. (b) second limiter `lookup:ref:<sha256(reference)>` at 20 per window. Reference and phone mismatch remain an identical 404 (`findForCustomer` needs both). |
| 8 | medium | `src/server/services/auth.service.ts` `login` | `"This account is suspended"` was returned **before** the password check — confirms the email exists and its status to anyone. | Suspended accounts now fail with the generic message, run the same dummy scrypt as the unknown-email path, and write an `auth.login_suspended` audit row. |
| 9 | low | `src/server/services/auth.service.ts:94` | Timing-equaliser hash was `…$AA==` (1-byte digest → `keylen=1`); scrypt cost is dominated by the memory-hard phase so it still ran, but it was not shaped like a real hash. | `DUMMY_HASH` is a well-formed 16-byte-salt / 64-byte-digest string, identical cost profile to a real verify. |
| 10 | low | `src/server/services/auth.service.ts` `createUser` | Password floor (12) enforced only by the route/action schema. | Service enforces `MIN_PASSWORD_LENGTH = 12` for a supplied password; generated passwords are `randomToken(12)` = 16 chars base64url. Temporary password is returned once, never logged (`temporarypassword` now in the redaction list) and stripped from audit payloads. |
| 11 | low | `src/server/lib/audit.ts:14` | `before/after` scrub list covered only `passwordHash`, `totpSecretEncrypted`, `refreshHash`. | Added `password`, `temporaryPassword`, `totpSecret`, `secret`, `otpauthUri`, `token`. |
| 12 | low | `src/server/lib/logger.ts:12-42` | Redaction keys lacked `otpauthUri` (carries the TOTP secret) and raw client-IP style keys. `leadPhone`/`leadEmail`/`recipient`/`secret`/`password` were already covered by the suffix match. | Added `otpauthuri`, `temporarypassword`, `clientip`, `remoteaddr`, `xforwardedfor`. |
| 13 | low | `src/app/admin/(auth)/auth-client.tsx` `safeNext` | Prefix check accepted `/adminevil…`, backslashes, tabs/newlines (browsers strip them before parsing). Not exploitable as an open redirect (single leading `/` is always same-origin) but the guard was weaker than its comment. | Now requires `^/admin(?:[/?#]|$)`, rejects `\`, whitespace and control chars, `://`, length > 512, and the three auth pages. Exercised against 16 payloads (`//evil.com`, `javascript:`, `/admin\evil.com`, `/admin\tx`, …) — all fall back. |
| 14 | low | `src/server/schemas/admin.schemas.ts` `photoUrl` | `z.url()` accepts any scheme (`javascript:`, `data:`); the value is rendered on agent-facing surfaces (`AgentPublic.photoUrl`, storefront `Agent.photoUrl`). | Must be `https://`. **Schema note:** consider a DB check `photo_url ~ '^https://'` (Database agent). |
| 15 | low | `src/app/api/admin/users/[id]/reset/route.ts:18` | `JSON.parse(raw)` outside `handle()`'s validation path → malformed body was a 500 (`request.unhandled` log) instead of 400. | Wrapped; returns the `VALIDATION_FAILED` envelope. |
| 16 | low | `src/app/admin/(console)/inquiries/[id]/page.tsx:248` | `mailto:${leadEmail}` interpolated raw; the create-time regex permits `?`, so a stored address like `x?bcc=…@y.z` could inject mailto parameters. `tel:` uses the validated E.164 and `wa.me` uses digits only — fine. | Address percent-encoded (`mailto:` accepts `%40`). |
| 17 | low | `src/app/robots.ts` | `/admin` and `/api` not disallowed (X-Robots-Tag noindex already set by the proxy). | Added. |
| 18 | low | `src/server/services/inquiry.service.ts` `convertToOrder` | Zoneless `paidAt` regex was `/^d{4}-d{2}…/` (missing `\`), so the "treat as IST" branch never matched. Functional, not security; found while reviewing input handling. | Backslashes restored. The Server Action already sends ISO with offset, so the API route is the only caller affected. |
| 19 | info | `src/app/api/health/route.ts` | `warnings` are the `assertBootEnv` sentences — variable **names** and consequences only, never values. The `env()`-invalid branch echoes zod's message (names + "expected string", no values). Live check: `{"status":"ok","appEnv":"development",…,"warnings":["Non-production with a live RESEND_API_KEY and an empty recipient allowlist — nothing will send"]}`. | Accepted — ops needs the names; no value can appear. |
| 20 | info | `next.config.mjs` | `X-Powered-By: Next.js` is emitted (seen live). Outside my edit scope. | **Needs-human:** add `poweredByHeader: false` to `next.config.mjs` (one line). |
| 21 | info | `src/server/lib/permissions.ts:49`, `src/server/repositories/privacy.repo.ts` | `privacy.anonymise` exists in the matrix (admin only) and `anonymiseByPhone` exists, but no service/route/UI calls it. | Left as-is per brief. Wiring (permission check via `requirePermission(actor, "privacy.anonymise")`, audit is already inside the repo) is the Admin agent's follow-up; until then DPDP erasure is a manual DB operation. |
| 22 | info | `src/server/services/auth.service.ts` lockout | "Too many failed attempts" is returned before the password check once an account is locked, which confirms existence. Reaching the lock needs 10 failures against the email at 5/15min, i.e. an attacker who already targets that address. | Accepted — the message is the legitimate user's only signal; the per-email limiter bounds the enumeration cost. |
| 23 | info | `src/server/lib/db.ts:16-19`, `src/server/notifications/templates.ts:118-121` | `process.env` reads outside `env.ts`: `NODE_ENV` for Prisma logging / hot-reload singleton, and template-name overrides in the pure templates module (unit-tested without `server-only`). Neither reads a secret. | Accepted. |
| 24 | info | `src/server/services/catalog.service.ts` `priceCartItems` | `Unknown activity: ${item.slug}` echoes the slug in an error; the schema limits it to `[a-z0-9-]{1,120}`. | Accepted — bounded charset, no markup possible. |
| 25 | info | `src/app/api/events/route.ts`, `analytics.service.ts` | Size caps (50 events, 40 props, 500-char strings, snake_case keys), per-anon-id/IP limiter with constant `events:anon` fallback; `scrubProps` drops dietary/contact/etc. before persistence and forwarding; forwarders gate on `environment === "production"` and are no-ops. Rate limit is per request, not per event (Analytics note) — 50×1000/h ceiling is acceptable at launch. | Verified, no change. |

### Checks that passed without change

- **APIs** (`src/app/api/**`): every route exports `runtime="nodejs"` + `dynamic="force-dynamic"`, is wrapped in `handle()`, parses with `.strict()` zod, calls `authService.requireRequest(permission)` where non-public, `assertSameOrigin` on every POST/PATCH/PUT, exactly one service call, no repository import except `GET /api/admin/audit` (named exception in §19 §3). Errors never echo raw input (`parseWith` maps issues to field → message). `/api/jobs/*` → `requireCron` only, 503 when `CRON_SECRET` unset, constant-time compare.
- **Webhook** `POST /api/webhooks/whatsapp`: raw-body HMAC with constant-time compare; forged or missing `X-Hub-Signature-256` ⇒ 200, row stored with `signature_valid=false` keyed by body hash, **nothing applied** (no consent row, no notification status change) — `ingestWhatsAppWebhook` returns before `applyItem`. No secret ⇒ `secret_not_configured`, same non-processing path. `GET` verify ⇒ 403 when unconfigured or token mismatch. Body capped at 1 MB. Unit tests cover forged/tampered signatures (`whatsapp-webhook.parse.test.ts`).
- **Auth**: cookies httpOnly, `Secure` outside `development`, `SameSite=Lax`, `path=/`; JWTs HS256 with issuer `outlyy-admin` and distinct audiences `session`/`pending`; every request resolves the DB session row (revocation, expiry, user status honoured); permissions are empty until `totpEnabled`; `beginTotpEnrolment` needs stage `enrol` **and** `totpEnabled=false` (409 otherwise) so a pending cookie cannot re-enrol an enabled account; `completeTotp` needs a correct code against the stored secret before any session is minted; per-email 5/15min, per-IP 20/15min, per-user TOTP 8/10min, lockout after 10; logout revokes the row and clears both cookies; `next` is only consumed by `safeNext()`.
- **RBAC**: every mutating service method calls `requirePermission` (auth, inquiry, notification, settings, catalog, order); ownership in `assertCanView/assertCanUpdate` (+ new `assertCanModerate`) and in `inquiryRepo.list` scope; Server Actions in `src/app/admin/_actions/*.ts` re-resolve the session via `requireCookies(permission)` and pass only validated ids — the service scopes. Console pages use `requirePage(permission)`.
- **DTOs**: `admin.repo.toRecord`/`listRoutable`/`GET /api/admin/auth/me` expose no `passwordHash`/TOTP material; `findCredentialsByEmail`/`findTotpSecret` are the only credential reads and never leave the auth service. `/api/agent/agents` → `inquiryService.listAgents` (no email/roles/permissions).
- **Forms / XSS**: `cleanText` strips control chars and caps lengths; phone → E.164 with per-country rules; email regex + lower-case; `attribution` bounded (30 keys × 512 chars, primitives only). Email templates escape every customer string (`hotel`, `dietary`, `specialRequests`, item titles, lead name — `templates.test.ts` asserts `<script>` never appears raw in any event's HTML; `budgetBand` is never rendered). WhatsApp variables are whitespace-collapsed and capped. No `dangerouslySetInnerHTML` under `src/app/admin` (the six storefront uses are JSON-LD from fixtures). No `$queryRawUnsafe`/`$executeRawUnsafe` anywhere; the three `$queryRaw` uses are tagged templates.
- **Spam**: honeypot + timing + per-phone/IP limits + suppression list all live in `inquiryService.create`; `POST /api/inquiries` is the only caller and the only public write path; rejected submissions return the generic `SPAM_REJECTED` envelope; suppressed numbers are quarantined as `spam` with no acknowledgement.
- **Notifications**: non-production allowlist checked before consent and send (empty list ⇒ nothing sends); consent re-read at send; STOP/UNSUBSCRIBE writes `granted=false` for transactional **and** marketing; `retryFailed` claims rows with a conditional `attempt` update (no double send under overlapping sweeps); provider errors truncated to 200/500 chars; `log.*` calls carry event/channel/reason only.
- **Secrets**: `.env.example` contains placeholders only; `NEXT_PUBLIC_*` limited to public identifiers; `env()` is the single validated read (exceptions in #23); no secret reaches a client component (`AdminShell` receives display name, role label and permission names).
- **Headers**: HSTS preload (prod), `frame-ancestors 'none'` + `X-Frame-Options: DENY`, nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, minimal `Permissions-Policy`, COOP; `/design-system` 404 in production unless `FEATURE_DESIGN_SYSTEM_PAGE=true`; the matcher excludes only static assets, so `/api/**` gets headers.

---

## 2. Files touched

`src/proxy.ts` · `src/server/lib/logger.ts` · `src/server/lib/audit.ts` · `src/server/services/auth.service.ts` · `src/server/services/inquiry.service.ts` · `src/server/services/notification.service.ts` · `src/server/schemas/admin.schemas.ts` · `src/app/api/inquiries/lookup/route.ts` · `src/app/api/admin/users/[id]/reset/route.ts` · `src/app/admin/(auth)/auth-client.tsx` · `src/app/admin/(console)/inquiries/[id]/page.tsx` · `src/app/robots.ts` · `src/lib/api/index.ts` (type only) · this note.

Not touched: `prisma/**`, `.env.example` (already clean), `next.config.mjs` (out of scope — see #20).

---

## 3. Verification commands

```
npm run typecheck            → tsc --noEmit, no output (clean)
npm test                     → 16 files, 202 tests passed (40 s; db-integrity ran against Neon)
npm audit --omit=dev         → 3 high: deepmerge-ts < 8 (GHSA-ggr8-5vv4-36mx) via @prisma/config → prisma CLI
curl -sD- http://localhost:3000/        → headers of the RUNNING (older) build; nonce absent, X-Powered-By present
curl -sD- http://localhost:3000/admin   → 307 with no security headers on the running build (finding #2)
curl -s   http://localhost:3000/api/health → warnings carry names only (finding #19)
node <scratch>/sn.ts probe   → safeNext against 16 payloads (finding #13)
```

## 4. Dependency audit

`deepmerge-ts` stack exhaustion on recursive object graphs, reached only through `@prisma/config` inside the **Prisma CLI** (`prisma generate`/`migrate`), not `@prisma/client` at runtime, and only with attacker-controlled config input — not applicable to this deployment. The only fix npm offers is a downgrade to `prisma@6.12.0` (breaking); no major version changes were made per the brief. **Deferred:** re-run after the next Prisma minor.

---

## 5. Pre-launch checklist (§13.11)

| # | Item | Status | Note |
|---|---|---|---|
| 1 | Penetration test, critical/high remediated | needs-human | External; this note is the internal pass. Findings #1–#8 fixed. |
| 2 | No card data reaches app servers | done | No card fields; payment is a Razorpay link pasted by the agent (`convertToOrder` stores link/gateway ids only). |
| 3 | MFA enforced on every admin account; no shared accounts | done | Permissions empty until `totpEnabled`; unique email; agent identity visible via `whatsapp_display_name`. |
| 4 | Data export and deletion verified end to end | deferred | `anonymiseByPhone` exists, unwired (#21); no export endpoint in inquiry mode. |
| 5 | Rate limits verified under load | needs-human | Limits present (login, TOTP, inquiry phone/IP, lookup IP + reference, events); Postgres-backed, fails open with a log. |
| 6 | Webhook signature verification with forged payloads | done | Unit-tested; behaviour re-verified in code (200, `signature_valid=false`, nothing applied). Run once against the deployed URL. |
| 7 | `/design-system` and debug surfaces blocked in production | done | Proxy rewrite to 404; `FEATURE_DESIGN_SYSTEM_PAGE` opt-in only. `/api/health` is intentionally public and value-free. |
| 8 | Secret scan clean; no secrets in git history | needs-human | `.env.example` clean; `.env*.local` ignored. Run `gitleaks`/GitHub secret scanning on the repo before the first push of the backend files. |
| 9 | Backup restore drill | needs-human | Neon PITR; §14. |
| 10 | Incident response plan rehearsed | needs-human | |
| 11 | Legal review of DPDP posture | needs-human | Consent rows with evidence exist; dietary never forwarded to analytics (`scrubProps`). |
| 12 | Security headers verified externally | needs-human | Set for every response after #2; re-check with securityheaders.com after deploy, and confirm #1 (admin nonce) on a preview. |
| 13 | Dependency audit clean of high/critical | deferred | §4 — build-time only; not fixable without a Prisma major/downgrade. |
| 14 | Anonymised staging data confirmed | needs-human | Notification allowlist + `EMAIL_CATCH_ALL` stop staging sends; the data copy itself is an ops step. |

## 6. Requests

- **Backend Architect / owner of `next.config.mjs`:** `poweredByHeader: false` (#20).
- **Database:** optional check constraint `admin_users.photo_url ~ '^https://'` (#14).
- **Admin:** wire `privacy.anonymise` → `anonymiseByPhone` behind `requirePermission` (#21).
- **Whoever deploys first:** open `/admin/login` on the preview and confirm it renders under the nonce CSP (#1); the storefront is unaffected.
