# Phase 14 — Security

---

## 1. Threat model — what actually threatens this business

Ranked by expected loss, not by how interesting the attack is.

| # | Threat | Likelihood | Impact | Primary control |
|---|---|---|---|---|
| 1 | **Price manipulation** — client submits its own amount | High if unguarded | Direct revenue loss | Server-signed quotes; client never sends an amount (§06.2) |
| 2 | **Booking-lookup enumeration** — reference + phone brute force | Medium | PII breach, DPDP exposure | 5/IP/15min, generic errors, monitoring |
| 3 | **Payment fraud** — stolen cards, chargebacks | Medium | Loss + dispute-rate damage | Gateway risk engine + velocity checks (§5) |
| 4 | **Coupon abuse** — cap bypass, self-referral farming | Medium | Margin erosion | Atomic caps, fraud fingerprinting (`AC-REF-02`) |
| 5 | **Admin credential compromise** | Low | Catastrophic — refunds, PII, pricing | Mandatory MFA, RBAC, audit, short sessions |
| 6 | **Webhook forgery** — fake payment success | Low | Free bookings | HMAC verification, constant-time compare |
| 7 | **Supplier credential leak** | Low | Fraudulent supplier bookings on your account | Secret store, rotation, no logging |
| 8 | **DoS via expensive endpoints** — quote spam, availability spam | Medium | Cost, supplier rate-limit exhaustion | Rate limits, quote caps |
| 9 | **PII exposure via agent console** | Medium | DPDP | Least privilege, PII access logging |
| 10 | **XSS via review/UGC content** | Low | Session theft | Output encoding, CSP, sanitisation |

Note what is *not* near the top: sophisticated application attacks. The realistic threats to this business are economic (price, coupon, fraud) and procedural (credentials, PII). Spend the effort there.

---

## 2. Authentication

### 2.1 Customers — phone OTP

- 6 digits, cryptographically random, **hashed** in Redis, 5-minute TTL, single-use, max 5 attempts, constant-time compare
- Request limited to 3/phone/15min and 10/IP/hour
- Response identical whether or not the account exists — never leak account existence
- Never log the code, never return it, not even in development builds that could be deployed
- SMS via MSG91/Twilio. **[VERIFY India DLT template registration — mandatory, and registration takes time; start it early or launch slips]**
- Email as a secondary channel

**Tokens:** access JWT (15 min, `jose`, HS256 with a rotating secret) + refresh token (30 days, rotating, httpOnly + Secure + SameSite=Lax cookie, hash stored in `sessions`). Refresh-token reuse detection revokes the whole session family.

**Guest-order linking** (`AC-ACC-02`): on successful verification, match `orders.lead_phone` and `orders.lead_email` and attach. Do this only on **verified** identity — never on a claimed one.

### 2.2 Admin and agents — stricter

- Email + password (Argon2id) + **mandatory TOTP** (`AC-SEC-02`). No permission is granted until `totp_enabled`
- 8-hour sessions, absolute expiry, re-auth required for: refunds above a threshold, permission changes, data export
- **No shared accounts** — enforced by unique email and by making agent identity visible to customers (`whatsapp_display_name`, `photo_url`)
- Login rate-limited 5/email/15min; alert on repeated failures
- IP allowlist for admin routes is available as an option **[decide — it helps, but breaks mobile ops from a hotel wifi in Dubai, which is exactly when ops is needed]**

---

## 3. Authorisation

Permission-based, not role-based, at the enforcement point. Roles are bundles of permissions (§09.4); services check permissions.

```
Every service method that mutates:
  requirePermission(actor, 'orders.refund')      → throws Forbidden
  audit(actor, 'order.refund', before, after, reason)
```

**`AC-ADM-02`: enforced server-side, not only in the UI.** The UI hides what is not permitted; the service refuses it regardless. Test this explicitly — an integration test that calls each privileged endpoint with an under-privileged token and asserts 403.

**Resource ownership** is checked separately from permission: a customer may read their own order; an agent may read any order but only if they hold `orders.view_all`. Ownership checks live in the repository layer where the query is built, so they cannot be skipped by a caller.

---

## 4. Payment security

- **No card data anywhere.** Gateway-hosted checkout only. Keeps you at **PCI-DSS SAQ-A** — the lightest scope, and worth protecting as a property (`AC-CO-07`, `AC-SEC-01`)
- The frontend contains no card fields today. Add a CI check that greps for card-like field names, so a future "nicer checkout" cannot silently change your compliance scope
- Webhook HMAC verified over the **raw body** with a constant-time compare; invalid signatures return `200` (never `401` — a `401` triggers provider retry storms) but are logged and alerted
- Gateway keys in the secret store; separate test and live keys; **live keys are never present in a preview deployment**
- Refund amounts recomputed server-side, never taken from the request

---

## 5. Fraud controls

| Control | Trigger | Action |
|---|---|---|
| Velocity — orders | > 3 orders/phone/24h | Manual review queue |
| Velocity — cards | > 3 distinct cards/phone/7d | Block + review |
| Velocity — amount | Order > ₹1,50,000 first-time customer | Manual review before fulfilment |
| Mismatch | Billing country ≠ IP country ≠ phone country | Risk score +, review above threshold |
| **Self-referral** (`AC-REF-02`) | Matching phone, device fingerprint, or payment instrument between referrer and referee | Block, log, no credit |
| Referral cap | > 10 successful/user/year | Block further credits |
| Coupon abuse | Same coupon, different phones, same device | Block + review |
| Disposable email | Known throwaway domains on high-value orders | Risk score + |
| Chargeback history | Phone or email with a prior chargeback | Manual review |

A manual review queue in admin, with a **hold on fulfilment** rather than on payment — the money is captured, the supplier booking waits for a human. Reviews must resolve within 2 hours or auto-approve, because a held booking that nobody looks at is a worse outcome than a small fraud loss.

**Referral credit only after travel completes with no refund** (`AC-REF-01`) — this is itself the strongest anti-fraud control in the referral scheme.

---

## 6. Rate limiting and abuse

Per §12.12. Beyond the table:

- **Quote caps**: 20 concurrent live quotes per session, 100/hour per IP — prevents price-lock farming (§06.2.4)
- **Availability caps** protect the *supplier's* rate limit as much as yours; the circuit breaker is also an abuse control
- **Bot management**: Vercel's protection on `/api/**`; a challenge on `/bookings/lookup` after repeated failures
- **Global fallback** limit so a new endpoint is never unprotected by omission

---

## 7. Data protection and PII

### 7.1 Classification

| Class | Data | Handling |
|---|---|---|
| **Sensitive** | Phone, email, name, hotel, passport/Emirates ID (where a supplier requires it), dietary and accessibility needs | Encrypted at rest, access logged, minimised, never in logs |
| **Financial** | Payment references, refunds, invoices | 7-year retention, restricted access |
| **Behavioural** | Events, sessions | Pseudonymised, 24-month retention |
| **Public** | Catalogue, published reviews | — |

**Dietary and accessibility data deserves a note.** Jain/halal preference can imply religion, and accessibility needs can imply health status. Under DPDP these warrant care: collect only what is operationally needed, never use them for ad targeting, and do not send them to third-party analytics. They exist to get the customer the right meal and the right vehicle — nothing else.

### 7.2 Controls

- Encryption in transit (TLS 1.3, HSTS with preload) and at rest (Neon and R2 default encryption)
- Passport / Emirates ID collected **only where a supplier genuinely requires it** — never speculatively (PRD §5.6 says this explicitly). Encrypted at the column level with a separate key, and purged after travel completes
- IP stored as `ip_hash` only
- **PII never in logs.** A log redaction helper applied at the logger, plus a CI check for obvious leaks. Sentry configured with `beforeSend` scrubbing
- PII access from the agent console writes an audit entry per 360 view
- Non-production databases seeded from an **anonymised** dump. This is the control most often skipped and most often regretted

### 7.3 DPDP Act compliance

**[VERIFY with counsel before launch — PRD §16 requires legal review, and DPDP implementation rules continue to evolve. This is a checklist, not legal advice, and I am not a lawyer.]**

| Obligation | Implementation |
|---|---|
| Consent — specific, informed, unambiguous | `consents` append-only with `evidence` (exact wording shown, page, timestamp) |
| Purpose limitation | Consent recorded per channel **and** per purpose (transactional / marketing / recovery) |
| Withdrawal as easy as giving | One-tap STOP on WhatsApp, honoured within 60s; profile toggles |
| Data minimisation | Collect at the point of need, not speculatively |
| Access and portability | `POST /me/export` (`AC-ACC-03`) |
| Erasure | Anonymisation pattern (§05.8) — financial records survive, PII within them is tokenised |
| Breach notification | Incident response plan (§14) with defined timelines |
| Children's data | Not knowingly collected. Child pax counts are numbers, not identities — never collect a child's name or DOB unless a supplier legally requires it |
| Grievance officer | Named contact published in the privacy policy |

---

## 8. Application security (OWASP)

| Risk | Control |
|---|---|
| Broken access control | Permission checks in services; ownership checks in repositories; integration tests asserting 403 |
| Cryptographic failures | TLS 1.3, Argon2id, HMAC quotes and webhooks, secrets never in code |
| Injection | Prisma parameterises everything; **zero raw SQL with interpolation** — enforce by lint |
| Insecure design | Idempotency, state machines, DB-level invariants (§05.6) |
| Misconfiguration | `/design-system` blocked in prod; verbose errors dev-only; security headers |
| Vulnerable components | Dependabot; `npm audit` in CI blocking on high/critical |
| Auth failures | §2 |
| Integrity failures | Signed quotes; webhook verification; QStash signature |
| Logging failures | Structured logs, Sentry, audit trail, alerting |
| SSRF | No user-supplied URLs are fetched server-side. If a supplier ticket URL is downloaded, validate the host against an allowlist |

**Security headers** (`middleware.ts`): HSTS with preload · CSP (script-src self + explicitly allowlisted analytics hosts, no `unsafe-inline` for scripts) · X-Content-Type-Options: nosniff · Referrer-Policy: strict-origin-when-cross-origin · Permissions-Policy minimal · X-Frame-Options: DENY (except the voucher print view).

**XSS on UGC**: review text and photos are user content. Sanitise on write, encode on output, and moderate before publish (which is already required by `AC-REV-02`). Photos go through a presigned upload with content-type validation and are served from R2, never inline.

---

## 9. Secrets management

- Vercel environment variables, scoped per environment. **Never** in the repo, never in `.env` files that are committed
- Distinct secrets per environment; live payment and BSP credentials exist only in production
- Rotation: quarterly for API keys, immediately on any suspected exposure, and on staff departure
- A pre-commit secret scanner plus GitHub secret scanning
- Supplier credentials never logged, never included in error payloads, never in Sentry breadcrumbs

---

## 10. Audit

`audit_logs`, append-only **at the grant level** (`REVOKE UPDATE, DELETE`), covering:

- Every admin and agent mutation with actor, timestamp, before, after (`AC-ADM-01`)
- Every price change, with margin context and any override reason
- Every refund, cancellation, amendment
- Every permission or role change
- Every guardrail override
- Every PII access from the console
- Every login, successful or failed

Retention: 7 years, alongside financial records.

---

## 11. Pre-launch security checklist

| # | Item | AC |
|---|---|---|
| 1 | **Penetration test; all critical and high findings remediated** | `AC-SEC-03` |
| 2 | Confirm no card data reaches application servers | `AC-SEC-01` |
| 3 | MFA enforced on every admin account; no shared accounts | `AC-SEC-02` |
| 4 | Data export and deletion verified end to end | `AC-SEC-04`, `AC-ACC-03` |
| 5 | All rate limits verified under load |  |
| 6 | Webhook signature verification tested with forged payloads |  |
| 7 | `/design-system` and all debug surfaces blocked in production |  |
| 8 | Secret scan clean; no secrets in git history |  |
| 9 | Backup restore drill completed successfully | §14 |
| 10 | Incident response plan documented and rehearsed once | PRD §16 |
| 11 | Legal review of DPDP posture, terms, privacy and cancellation policy | PRD §16 |
| 12 | Security headers verified (securityheaders.com or equivalent) |  |
| 13 | Dependency audit clean of high/critical |  |
| 14 | Anonymised staging data confirmed — no production PII outside production |  |

Items 1 and 11 have lead times measured in weeks. **Start them at the beginning of Phase 5, not at the end.**
