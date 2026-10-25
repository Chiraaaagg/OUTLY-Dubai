# Release checklist — security remediation (`fix/security-remediation`)

Nothing in this checklist has been done. Every step that touches production needs the owner's explicit approval, step by step. The local implementation approval of 25 October 2026 does **not** cover merging, deploying, hosted configuration, secrets, migrations, real records, contacting people or paid provider calls.

## What changes for users when deployed

- Storefront: no visible change. Catalogue text containing `<` is still displayed; only the hidden structured data is encoded differently.
- Staff console:
  - The content role can no longer roll back an import batch that created listings (clear 403 message).
  - Rolling back a batch whose listings were edited afterwards gives a 409 that names them; undo those from version history instead.
  - Agents can add notes to any inquiry they can see.
  - Agents can resend messages only on their own inquiries.
- Customers: account history no longer shows inquiries or orders that belong to a different account with the same phone number.
- Integrations:
  - The WhatsApp webhook answers 401 to unsigned requests and 503 if `WHATSAPP_WEBHOOK_SECRET` is missing.
  - Cookie-authenticated API calls must come from the site's own pages (Origin `https://outlyy.com` or `https://www.outlyy.com`).
  - JSON APIs need `content-type: application/json`.
  - When the rate-limit store (Postgres) is down, sign-in, OTP, inquiry and lookup answer 503 "try again in a minute" instead of running unlimited.
- No database migration. No new environment variable is required. `APP_ALLOWED_ORIGINS` and `TRUST_PROXY_IP_HEADERS` are optional and must stay unset on Vercel production.

## Before merge (owner)

1. Review the PR and the independent review record ([test-record.md](test-record.md)).
2. **APPROVAL NEEDED: merge PR into `main`** (merge commit, as with PR #2 and #3). No force-push.

## Before deploy

3. **Check production configuration (read-only, owner or approved session).**
   - `NEXT_PUBLIC_SITE_URL` is either unset or `https://outlyy.com` / `https://www.outlyy.com`.
     - `https://outlyy.com`, `https://www.outlyy.com` and Vercel's production domain are always allowed (commit `c143a5d`), so an unset value no longer risks a 403 on every mutation.
     - If it is set to some *other* host, mutations from the real hosts still work, but the setting is wrong elsewhere too (for example, links in notifications).
     - Vercel preview deployments allow their own `VERCEL_URL` / `VERCEL_BRANCH_URL` automatically. Any other host (for example a custom staging domain) needs `APP_ALLOWED_ORIGINS`.
   - `WHATSAPP_WEBHOOK_SECRET` is set. Without it, Meta deliveries get 503 and Meta keeps retrying; nothing is stored.
   - `CRON_SECRET` is set (unchanged requirement).
4. Backups: no schema change.
   - Record the time and Supabase's latest automatic backup / PITR point for project `vujeuhpdpcimedhsuxoo` before deploying.
   - This only requires viewing the dashboard; it is not a database write.
5. Note the current production deployment id in Vercel, for the rollback step.

## Deploy

6. **APPROVAL NEEDED: production deploy of the merged `main`.**
   - Expected impact: a normal Vercel deploy, with no downtime expected.
   - The build log must show `▲ Next.js 16.4.3`.

## Cache refresh after deploy

7. A new deployment rebuilds and serves HTML from the new code. ISR pages (`/`, `/activities`, `/activities/[slug]`, `/categories/[slug]`, revalidate 60 s) and static pages (`/attractions/[slug]`, `/combos/[slug]`, `/collections/[slug]`, `/lp/[slug]`, the four landing pages, `/sitemap.xml`) come from the new build.
   - The catalogue data cache (tag `catalog`) holds data, not HTML, so it cannot bring back the old encoding.
   - If any CDN or cache sits in front of Vercel, purge it. Vercel's own deployment-scoped cache needs nothing.
   - Only run invalidation with approval.

## Post-deploy verification (read-only; bounded; approval for anything that writes)

8. Anonymous read-only checks:
   - `curl -sI https://outlyy.com/` shows the security headers unchanged.
   - Fetch `/activities/<a published slug>` and `/dubai-activities-for-indians`, and confirm the `application/ld+json` bodies contain no raw `<`.
   - `GET /api/health` shows `status`, `db` and `warningCount`, and no `warnings` texts.
9. Anonymous refusals:
   - `POST /api/inquiries/lookup` with `Origin: https://outlyy.com` and `content-type: text/plain` → 415.
   - The same request with `Origin: https://example.com`, or without an Origin → 403.
   - The 415 probe passes the origin check, so it uses one of that IP's lookup attempts (5 per 15 minutes) and writes a rate-limit counter row. It creates no business data.
10. With approval only, staff smoke test using a designated account:
    - The console loads and an activity edit saves.
    - The import wizard previews a CSV.
    - One real Google Sheet import fetch succeeds. This confirms the export-redirect host allowlist (H05); if it reports "redirected somewhere unexpected", record the host and adjust the allowlist.
11. With approval only, webhook check:
    - Confirm in Meta's dashboard that deliveries succeed (200).
    - A forged unsigned POST is refused with 401. Production webhook POSTs must not be sent without approval.
12. Review any existing catalogue text containing `</script` or `<script` with a read-only query (approval needed). The fix neutralises it on render, but its presence would indicate past abuse.

## Rollback

- Code: in Vercel, promote the previous production deployment (instant). Or revert the merge commit on `main` and redeploy.
- No migration to undo, and no data shape changed.
- After a code rollback, F01–F03 and the D01 advisories are exposed again.
- Cookies and sessions are unaffected either way. Staff and customers stay signed in.

## External approvals still needed

| Item | Why | Who |
|---|---|---|
| Merge to `main` | release | owner |
| Production deploy | release | owner |
| Read-only production config check (`NEXT_PUBLIC_SITE_URL`, `WHATSAPP_WEBHOOK_SECRET`) | avoid 403/503 after deploy | owner |
| Post-deploy staff smoke test and one real Google import | H05 allowlist, console | owner / designated staff |
| Catalogue content review query | F01 follow-up | owner |
| Policy decisions (register "Open decisions") | G06 deletion/retention, content-role publishing, readonly/finance inquiry reads | owner |
| Edge/WAF rate limits | global (not per-instance) abuse limits | owner (Vercel Firewall) |
