# Cleanup record — security remediation (25 October 2026)

## Created for this work

| Item | Where | Status |
|---|---|---|
| Docker container `outly-sec-pg` (postgres:17-alpine, `127.0.0.1:55433`), databases `outly_sec`, `outly_luna`, `outly_atlas`, `outly_terra`, `outly_mercury`, `outly_echo` | local Docker | **Removed** (`docker rm -f outly-sec-pg`). All synthetic rows went with it. |
| Synthetic staff users `zz-sec-<run>-*@outlyy.test`, customers named `zz-sec-<run>` with numbers in the `+9199…` test range, `zz-test-*` / `zz-sec-*` products and categories, import batches, inquiries, orders, payments, analytics events, webhook events, consent rows | inside the container only | Most were cleaned by each suite. Append-only audit, consent and inquiry-event rows (and the fixtures they reference) stayed until the container was removed. |
| Local dev/production servers `next dev` / `next start` on port 3217 | local | Stopped. |
| Static foreign-origin probe page served on `127.0.0.1:3299` (python `http.server`) | session scratchpad | Stopped; directory deleted. |
| Worktree `/Users/ASUS/Programs/OUTLYY/OUTLY-Dubai-security` (branch `fix/security-remediation`) | local | **Kept** for the PR. |
| Worktree `.env.local` (gitignored; locally generated fake secrets; points at the removed container) | worktree | Kept. Contains no real credentials. Delete it with the worktree once the PR is closed. |
| `.next/` build output and `node_modules/` | worktree (gitignored) | Kept with the worktree. |
| Logs, baseline outputs and the isolation script | session scratchpad (outside the repository) | Kept as evidence for this session; not committed. |

## Isolation evidence

- No production, Supabase, Vercel or provider endpoint was contacted; see [test-record.md](test-record.md).
- No real account, phone number, customer record, OTP or payment was used.
- The other project's container (`supabase_db_tripnavigate-crm`) was never touched by this work.
- The main checkout `/Users/ASUS/Programs/OUTLYY/OUTLY-Dubai` and its uncommitted files were not touched.

## Remaining actions

- After the PR is merged or closed: `git worktree remove ../OUTLY-Dubai-security`. This is only on the owner's request; it deletes the local `.env.local`, `.next/` and `node_modules/` with it.
- Nothing remains to clean in any hosted system.
