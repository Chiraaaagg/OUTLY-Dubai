# Security remediation — October 2026

Implementation of the fixes for the 24 October 2026 security assessment (reviewed commit `a463dca`). Branch `fix/security-remediation`. Built, tested locally and independently reviewed. **Not merged, not deployed, not verified in production.**

## Records

- [remediation-register.md](remediation-register.md): every assessment ID (F01–F03, D01, H01–H16, G01–G19, families A–J) with evidence, action, tests, results and state.
- [test-record.md](test-record.md): baseline failures, patched results, final gate, browser checks and independent review.
- [dependency-record.md](dependency-record.md): advisories, versions before and after, build evidence.
- [route-permission-matrix.md](route-permission-matrix.md): every API route with its guard, media type and ownership rule.
- [release-checklist.md](release-checklist.md): what changes for users, pre-deploy checks, deploy, cache refresh, verification, rollback, approvals still needed.
- [cleanup-record.md](cleanup-record.md): what was created locally and what was removed.
- [csp-storefront-plan.md](csp-storefront-plan.md): why the storefront keeps `'unsafe-inline'` and how to remove it.

## Summary of behaviour, before and after

| Area | Before | After |
|---|---|---|
| Catalogue structured data (F01) | Catalogue text containing `</script>` ran as script on activity, category and landing pages. | All structured data is HTML-safe. A lint rule allows only reviewed producers for inline HTML. |
| Import rollback (F02/H15) | Anyone with `imports.run` could delete listings by rolling back; later edits were silently overwritten; repeated rollback raced. | Rollback needs the delete/edit permissions it uses, checked for the whole batch first. Later edits, repeats and concurrent saves are refused with 409 and nothing changes. |
| WhatsApp webhook (F03) | Unsigned bodies were stored; the body was buffered before the size check. | The signature is checked over the exact bytes before anything is parsed or stored. Unsigned → 401, missing secret → 503, oversize → 413. Logs are bounded and redacted. |
| Dependencies (D01) | Next 16.3.4 / sharp 0.35.4 were inside advisory ranges. | Next 16.4.3, sharp 0.35.5, zod 4.6.7. |
| Cross-site requests (H04) | A missing Origin was accepted; `text/plain` reached JSON handlers. | An allowed Origin is required. JSON APIs need a JSON content type and have body-size ceilings. The beacon, webhook and cron exceptions are explicit. |
| Google import fetch (H05) | Redirects were followed automatically; only the final host was checked. | Every hop is checked before connecting, with a tight allowlist, public-DNS check, hop limit, deadline and streamed size cap. |
| CSV export (H06) | `-1+2`-style text bypassed formula protection. | Formula-like text is guarded; real numbers are untouched. |
| Notes and resend (H07/N05) | Notes were collaborative by accident and undocumented; any agent could resend another agent's customer messages. | Notes are collaborative by the owner's decision and audited. Resend follows the update rule. |
| Rate limits (H08/H09) | The analytics quota could be reset with a new client id; every limiter failed open. | An independent per-IP quota and an instance ceiling. Sign-in, OTP, inquiry, lookup and heavy admin actions fail closed (503) when the limiter store is down. |
| Customer history (G01/N01) | Rows linked to another account with the same phone appeared in a customer's history and export. | Only the customer's own rows, plus unlinked rows for their verified phone. |
| Money (H12/N02–N04) | Double convert could record two payments; client titles were stored as snapshots; draft combos were priced. | Convert is claimed atomically; titles come from the catalogue; draft combos are refused; negative amounts are refused. |
| Sessions (G02/N07/N08) | Admin JWT verification accepted other HMAC algorithms; the audit IP hash came from a raw header. | HS256 pinned; trusted client IP; cookies Secure in production builds. |
| Logs and health (G18/H16) | Error texts could carry PII; health listed configuration warnings publicly. | Error texts are scrubbed; health shows only a warning count to anonymous callers. |

## Limits

- No production verification has been done; see the release checklist.
- Per-instance limits are not global. Edge or WAF limits are an owner decision.
- The storefront CSP still allows inline scripts; the plan is documented.
- Policy decisions remain open. They are listed at the end of the register (deletion/retention, content-role publishing, readonly/finance inquiry access, and others).
- These changes reduce specific risks. They do not guarantee that no other security problem exists.
