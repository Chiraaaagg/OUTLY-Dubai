# Test and retest record — security remediation

## Environment

- Candidate: branch `fix/security-remediation`, commit `2a07f24` (final gate), base `origin/main` `a463dca`.
- Machine: macOS, Node v24.21.0, npm 11.19.0.
- Database: disposable Docker container `outly-sec-pg` (postgres:17-alpine), bound to `127.0.0.1:55433`, databases `outly_sec` (gate), `outly_luna`, `outly_atlas`, `outly_terra`, `outly_mercury`, `outly_echo` (per helper). All migrated with `prisma migrate deploy`; seeded with `npm run db:seed` (no admin bootstrap).
- Isolation: before every install, build, migration, seed and DB test run, a check script verified that every database URL resolved (process env and `.env.local`; no other env files present) pointed at `127.0.0.1:55433/outly_*`. It also checked that no hosted-service URL, libpq fallback or provider credential was set, that SMS/WhatsApp adapters were `log` with an empty allowlist, and that the port belonged to `outly-sec-pg`.
- External calls: none to production, Supabase, Vercel, Meta, MSG91, Razorpay, Resend or Google. Import fetch tests mock fetch and DNS. Security suites stub `fetch` where a provider could be reached. Read-only research used public advisory pages, the npm registry and Vercel docs.
- Every new DB-writing test calls `assertDisposableDb()`, which throws (does not skip) if the database is not the disposable instance.

## Baseline (a463dca, before any change)

| Command | Result |
|---|---|
| `npx vitest run` | 27 files, 372 passed, 0 failed, 0 skipped |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 34 warnings |

## Baseline failures of the new regression tests (run against the pre-fix code)

| ID | Test | On vulnerable code | On fixed code |
|---|---|---|---|
| F01 | `app/__tests__/json-ld-render.test.ts` (real pages from `next dev`) | 4 of 7 failed; injected scripts executable on the page: activity 6, category 4, content-edited published activity 2, landing page 1 | 7/7 |
| F02/H15 | `server/__tests__/security/imports-revert.test.ts` | 7 of 14 failed: content rollback returned 200 (expected 403); mixed batch, later-edited listing, already-deleted item and apply permission were all accepted; concurrent revert threw P2002; competing save overwritten | 14/14 (3 runs) |
| F03 | `server/__tests__/security/webhook.test.ts` | 22 of 26 failed. Unsigned body: 200, `webhook_events` 0 → 1 (`unverified:…`, full payload stored) | 26/26; 0 rows on every rejection |
| H06 | node run of the old `csvEscape` rule | `-1+2`, `-2-3`, `  =1+1`, `＝1+1`, `\t=1+1` left unguarded | guarded (`csv-formula.test.ts`) |
| H07 | `ownership.test.ts` (audited note) | failed (no audit row) | pass |
| H08 | `events.test.ts` | 6 failed (aid rotation unlimited, form bodies accepted, no 64 KiB cap, no instance ceiling) | 14/14 |
| H16 | `health.test.ts` | 2 of 2 failed (warning texts public) | 2/2 |
| G01 | `customer-ownership.test.ts` | 2 failed (rows linked to another customer followed the phone) | 9/9 |
| G02 | `auth-session.test.ts` | 3 failed (HS512 accepted; spoofed XFF in audit IP hash; no Secure flag under `NODE_ENV=production`) | 25/25 |
| N02 | `pricing.test.ts` convert interleave | 201 with 2 payments | 409, 1 order, 1 payment |
| N04/N05 | `pricing.test.ts` draft combo; `ownership.test.ts` resend | `it.fails` markers showed the gaps | pass |
| N07 | proxy algorithm check (ad hoc script) | HS384/HS512 tokens passed the proxy gate | refused; HS256 passes |

H05 has no executed baseline: no network was allowed, so the old redirect behaviour is established by source review only.

## Final gate on the frozen candidate `2a07f24`

| Step | Command | Result |
|---|---|---|
| Isolation | `node check-isolation.mjs <worktree>` | ok, 0 problems |
| Type check | `npm run typecheck` | clean (exit 0) |
| Lint | `npm run lint` | 0 errors, 34 warnings (same count as baseline; all pre-existing kinds) |
| Unit + integration | `npx vitest run` (DB `outly_sec`) | 45 files: 44 passed, 1 skipped; **994 tests: 987 passed, 0 failed, 7 skipped** |
| Production build | `npm run build` | success, `▲ Next.js 16.4.3 (Turbopack)` |
| Render (needs server) | `next start -p 3217` + `JSON_LD_RENDER_BASE=http://127.0.0.1:3217 npx vitest run src/app/__tests__/json-ld-render.test.ts` | 7 passed |
| Headers on build | `curl -sI /` | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy and COOP all present |
| SVG optimiser gate | `GET /_next/image?url=/brand/outlyy-404.svg&w=64&q=75` | 400 |
| Origin required | `POST /api/inquiries/lookup` without Origin | 403 |
| Webhook | unsigned `POST /api/webhooks/whatsapp` | 401 |

The 7 skipped tests are the render suite, which is skipped in the plain run because it needs a running server. They are **not** counted as passes there. The suite was run separately against the production server, with 7 passed.

Per-file counts for the final run (passed): origin-media 326, ownership 42, pricing 29, webhook 26, auth-session 25, events 14, rate-limit 14, imports-revert 14, imports-preview-limits 11, customer-ownership 9, privacy 6, health 2, csv-formula 43, fetch 26, allowed-origins 5, logger 5, json-ld 16, whatsapp-webhook.parse 10, events.schemas 14, import.service 15, activity.service 11. The remaining existing files are unchanged.

## Real-browser checks (Claude Browser pane, production build, local)

- F01: `/activities/zz-sec-…-luna-act` and `/categories/zz-sec-…-luna-cat` (malicious titles, FAQs, category names):
  - `document.documentElement.dataset.lunaProof` stays undefined, and each page has exactly one ld+json element.
  - JSON parses back to the stored strings, and the payload is shown as text. No console errors.
- H04, cross-site form posts from a foreign origin (`http://127.0.0.1:3299`) to `http://localhost:3217`:
  - `text/plain` to `/api/inquiries/lookup` → 403; urlencoded to `/api/events` → 403. Inquiries 12 → 12; analytics events unchanged.
- H04, same-origin controls:
  - JSON lookup → 404 (business response; passed the origin check). `text/plain` lookup → 415.
  - Beacon `text/plain` events → 204 (`x-events-accepted: 1`); `sendBeacon` queued. Analytics events 0 → 2.

## Simulated / mocked evidence (labelled)

- Rate-limit store outage: simulated with `vi.spyOn(prisma, "$queryRaw").mockRejectedValue(...)`. Fail-closed behaviour is proven against that simulation, not a real database outage.
- Google fetch, redirects and DNS: mocked fetch and resolver only. The real Google export redirect hosts are not verified.
- Webhook: synthetic Meta-shaped payloads signed with a local fake secret. Meta's real retry/disable behaviour is not verified.

## Independent review (Echo)

- Reviewed `origin/main..666a579` plus `c143a5d`. **No blocker or high findings.**
- Echo's own focused run (DB `outly_echo`): 27 files passed, 1 skipped; 771 passed, 7 skipped, 0 failed; tsc clean.

Echo's findings and how each was resolved:

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Medium | `test-record.md` missing | This file |
| 2 | Low | H04 register row stale after `c143a5d` | Updated (`3e321ae`) |
| 3 | Low | Checklist probe: without Origin a 403 comes first; the 415 probe uses up a lookup attempt | Checklist corrected (`3e321ae`) |
| 4 | Low | Canonical site allowed in every environment; localhost default allowed in production; preview deployments 403 | Canonical site only in production; localhost default only outside production; the deployment's own `VERCEL_URL`/`VERCEL_BRANCH_URL` allowed on Vercel (`3e321ae`, `allowed-origins.test.ts`) |
| 5 | Low | `scrubText` leaked names after `)`, missed bracket/dot phone formats and camelCase keys, and over-redacted dates | Fixed with tests (`3e321ae`) |
| 6 | Low | `isPrivateAddress` missed non-canonical IPv6 forms, 6to4, Teredo and discard ranges | IPv6 normalised to groups; ranges added with tests (`3e321ae`) |
| 7 | Low | Lint rule bypassable through a variable; `.ts` files not covered | Rule changed to an allowlist over `.ts`/`.tsx`; bypass forms flagged (probe) (`3e321ae`) |
| 8 | Low | Rollback keeps publish status (pre-existing) | Documented as follow-up |
| 9 | Low | Off-Vercel, admin-login and inquiry IP limits are skipped | Documented as follow-up |
| 10 | Low | Per-instance analytics ceiling shared by all callers off Vercel | Accepted, documented |
| 11 | Nit | Render allowlist prefix-anchored; transitive deps unlisted; `serializeJsonLd(undefined)`; 403 wording; CSV ` '=1` edge; Revert button visibility | Transitive deps listed; `serializeJsonLd(undefined)` returns `null`; the rest documented |

After the fixes, the full gate above was re-run on `2a07f24`.

## Not tested

- Production (anything).
- Real Google, Meta, MSG91, Razorpay or Resend calls.
- Spreadsheet formula execution.
- Live race campaigns.
- RCE/DoS/smuggling/cache-poisoning payloads (excluded by policy).
- TLS/DNS/mail configuration.
