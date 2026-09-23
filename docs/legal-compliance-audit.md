# OUTLYY — Legal, privacy & launch-readiness audit

**Date:** 22 September 2026 · **Scope:** the codebase as it stands (storefront, inquiry flow, customer accounts, admin/agent console, analytics, imports) plus the documented future architecture (payments, supplier APIs, direct bookings).
**Status of this document:** findings and an information request. No legal text has been drafted. This is a product/engineering compliance review, **not legal advice** — the documents it calls for must be reviewed by counsel qualified in the UAE and in India before publication.

**Assumptions given:** the operating company is Dubai-registered; primary market is Dubai activities; customers are largely Indian travellers; the site is reachable globally.

---

## 0. Launch compliance score

**38 / 100 — not launch-ready.**

| Area | Score | Why |
|---|---|---|
| Legal documents | 3/10 | Terms, privacy, cancellation and price-promise pages exist as product drafts, flagged in code as "NOT legal advice and not lawyer-reviewed"; they describe a **payment-taking Indian booking agent** (PCI gateway, EMI, UPI, "Indian consumer law"), not the Inquiry-Mode Dubai entity that will actually launch. No cookie policy, no WhatsApp/marketing consent text, no user-rights/grievance page. |
| Consent | 3/10 | WhatsApp consent checkbox is **pre-ticked**; no acceptance of terms/privacy at inquiry or OTP sign-in; analytics/attribution cookies set without notice or consent. |
| Company identity | 1/10 | Legal name falls back to an **invented** "OUTLYY Travel Technologies Pvt. Ltd." (an Indian company form) when `NEXT_PUBLIC_LEGAL_NAME` is unset; contact page states offices in "Mumbai, India · Business Bay, Dubai" with no address; GSTIN/DED licence blank. |
| Placeholder / fabricated content | 2/10 | Fixture reviews with named authors marked `verified: true`, platform stats ("18,400 travellers served", "6,120 reviews", "14 verified suppliers"), per-activity ratings/review counts, named supplier companies (incl. real brands "Emaar", "Miral", "Rayna") and demo bookings — all fictional or unverified. |
| Data protection engineering | 7/10 | Good: PII redaction in logs, masked phones for agents without permission, IP hashing, audit trail, export endpoint, deletion request endpoint, anonymisation routine designed. Gaps: deletion is a manual ops email (no executed workflow), retention jobs are FUTURE, no admin UI for anonymisation, deletion request has no SLA tracking. |
| Consumer disclosures | 4/10 | Pricing is "all-in" but indicative in Inquiry Mode; the Inquiry pages say so, the legal pages and FAQ still promise payment flows, vouchers "within minutes", refunds and a 24/7 emergency line that are not live. |
| Security posture | 8/10 | MFA for staff, TOTP replay guard, session revocation, rate limits, strict input validation, CSP, immutable audit — documented in `docs/backend/impl/security*.md`. Missing: incident/breach procedure, sub-processor list, backup/retention statement. |

---

## 1. Phase 1 — legal audit findings

### 1.1 What exists (verified in code)

| Item | Where | Assessment |
|---|---|---|
| Terms of use | `/terms` (`src/lib/data/legal.ts`) | Draft. Describes booking + payment agent model, PCI-DSS gateway, reviews policy, liability cap "value of the booking", "rights under **Indian** consumer law". Contradicts Dubai entity and Inquiry-Mode launch. |
| Privacy policy | `/privacy` | Draft. Mentions DPDP Act only; no UAE PDPL, no GDPR; no cookie section; no controller identity/address; no retention table; no sub-processors; no grievance/DPO contact; states "encrypted at rest and in transit" (true of Neon/TLS) and "card data never touches our servers" (no payments yet). |
| Cancellation & refund policy | `/cancellation-policy` | Draft. Promises refunds, "pickup more than 30 minutes late → refund", 24/7 emergency line — operational commitments that are not yet backed by contracts or staffing. |
| Price promise | `/price-guarantee` | Draft. "No fee appears after the first price" — in Inquiry Mode the first price is **indicative** and the agent confirms the final one; the promise needs re-wording or it is a misleading-pricing claim. |
| About | `/about` | Narrative; no fabricated founder claims found. |
| Contact | `/contact` | Shows "Offices: Mumbai, India · Business Bay, Dubai, UAE" (no street address), "Registered entity" from `siteConfig.legalName` (**defaults to an invented name**), support email/phone from env (may be blank). |
| Footer legal line | `legalLine()` | "© 2026 {legalName} · GSTIN … · Dubai DED licence …" — renders the invented name when env is unset. |
| Inquiry form | `src/components/commerce/inquiry-form.tsx` | Collects name, phone, email, travel dates, pax, hotel, dietary, special requests, budget band, cart items; **WhatsApp consent pre-ticked**; no link to privacy policy, no terms acceptance; honeypot + timing anti-spam (fine). |
| Customer sign-in | `/login` (phone OTP) | No terms/privacy acknowledgement at sign-in. |
| Analytics | `src/lib/analytics.ts`, `POST /api/events` | First-party cookies `outlyy_sid` (30 min), `outlyy_aid` (1 year), `outlyy_attr` (1 year, stores utm/gclid/fbclid/fbc/fbp); server stores hashed IP, user agent, country, session/anon ids; **no banner, no consent, no opt-out**. Meta Pixel/CAPI/PostHog/GA4 forwarders exist but are unconfigured. |
| localStorage | cart, wishlist, compare, recent searches, currency | Functional storage; no notice. |
| Customer rights endpoints | `GET /api/me/export`, `POST /api/me/delete-request`, `/account/profile` | Export works; deletion = audit row + email to ops (manual). `privacy.repo.anonymiseByPhone` exists but is not wired to an admin action. |
| Retention | `docs/backend/impl/database.md` §5 | Designed (7 y financial, 24 m inquiries/analytics/notifications) — **jobs not implemented**. |
| Staff security | admin/agent | Password + mandatory TOTP, 8 h sessions, revocation, lockout, MFA replay guard, per-user rate limits, immutable audit log with before/after, PII masking without `customers.view_pii`. |
| Notifications | log adapters | Non-production recipient allowlist; consent re-check before send; STOP handling designed for WhatsApp. |

### 1.2 What is missing

Legal pages: cookie policy; WhatsApp/marketing consent wording; user-rights & grievance page (India DPDP requires a Grievance Officer contact; UAE PDPL requires a controller contact / DPO where applicable); disclaimer/supplier-liability notice; acceptable-use; copyright/IP notice; imprint-style company details (legal name, licence number, registered address) on the site.

Consents: unticked WhatsApp opt-in with purpose text; marketing opt-in separate from transactional; cookie/tracking consent for non-essential cookies and any pixel; terms/privacy acknowledgement on inquiry submit and OTP sign-in; agent recording of verbal consent (WhatsApp conversations) — policy statement needed.

Operational: Grievance Officer named; data-breach response procedure; sub-processor register; DSAR (access/deletion) SLA and executed workflow; retention jobs; supplier contracts with data-processing clauses; content licences for images.

### 1.3 Legal risk register

| # | Risk | Severity | Source |
|---|---|---|---|
| R1 | Invented legal entity name rendered in footer/contact/terms when env unset | **Critical** — misrepresentation | `site-config.ts` default |
| R2 | Fabricated social proof: reviews with authors marked verified, "18,400 travellers", "6,120 reviews", per-activity ratings | **Critical** — misleading advertising (UAE Consumer Protection Law 15/2020; India CPA 2019 / CCPA fake-review guidelines 2023; UK CMA) | `reviews.ts`, `activities.ts` |
| R3 | Named real companies as "verified, contracted" suppliers (Emaar, Miral, Rayna) without contracts | **Critical** — false endorsement / passing off | `activities.ts` supplier blocks |
| R4 | Imported Rayna content: photos from Rayna's CDN, copy "Reserve online with Rayna Tours" | **High** — copyright and misrepresentation if published | imported drafts |
| R5 | Terms/privacy describe payments, vouchers, refunds, EMI/UPI, Indian consumer law — not the launch model or entity | **High** — unenforceable/misleading | `legal.ts` |
| R6 | Pre-ticked WhatsApp consent; no purpose/opt-out text | **High** — invalid consent (GDPR/PECR; WhatsApp Business Policy opt-in rules; UAE PDPL art. 6) | inquiry form |
| R7 | Tracking cookies + attribution ids set without notice/consent; Meta/GA forwarders can be switched on by env alone | **High** for EU/UK visitors; **Medium** UAE/India (notice required) | analytics |
| R8 | No cookie policy, no controller identity in privacy policy, no retention periods, no sub-processors, no grievance contact | **High** — DPDP §5 notice, PDPL art. 13, GDPR art. 13 | `/privacy` |
| R9 | Deletion requests not executed within a defined SLA; retention jobs missing | **Medium** | services |
| R10 | Service promises (30-min human reply, 24/7 emergency line, refund-if-late) with no staffing/contract evidence | **Medium** — unfair-terms / misleading | copy |
| R11 | "Price promise" vs indicative pricing in Inquiry Mode | **Medium** — pricing claim | `/price-guarantee`, cards |
| R12 | Demo bookings/vouchers (`OUT-482913`, supplier phone `+971 50 123 4567`, guest "Imran Sheikh") reachable at `/voucher/<ref>`, `/manage-booking` | **Medium** — fake documents on a live domain | `bookings.ts` |
| R13 | No breach-notification procedure (PDPL 72 h to UAE Data Office where applicable; DPDP to Board + users; GDPR 72 h) | **Medium** | ops |
| R14 | Passport/Emirates ID collection mentioned in privacy policy — sensitive; no field exists yet, but policy promises handling | **Low** now | `/privacy` |
| R15 | Staff PII exposure: agents without `customers.view_pii` see masked phones (good); export endpoint returns full customer record to the customer only (good) | Low | — |

---

## 2. Phase 2 — required legal documents

| Document | Status | Why |
|---|---|---|
| Terms of Service (customer) | **Required** — rewrite | Governs inquiries now, bookings later; must name the Dubai entity, governing law/venue (UAE, likely Dubai courts or DIFC-LCIA as chosen), agency role, limitation of liability, what "confirmation" means in Inquiry Mode. |
| Privacy Policy / Data Protection Notice | **Required** — rewrite | Must satisfy UAE PDPL (Federal Decree-Law 45/2021) notice duties, India DPDP Act 2023 §5 notice for Indian data principals, and GDPR/UK GDPR art. 13 for EU/UK visitors: controller identity + address, purposes + lawful bases, categories, recipients/sub-processors, international transfers (Neon/Vercel regions), retention, rights + how to exercise, grievance/DPO contact, cookies (or link), children, changes. |
| Cookie & Tracking Policy | **Required** | First-party analytics/attribution cookies exist; pixels planned. Needs banner for EU/UK, notice elsewhere. |
| Cancellation & Refund Policy | **Required** — rewrite for Inquiry Mode | Today no payment is taken on-site; policy must describe what happens when an agent confirms a booking off-platform (payment link / supplier terms) and per-activity supplier policies. |
| Consent notices (inline) | **Required** | WhatsApp transactional opt-in text; marketing opt-in text (separate, unticked); OTP sign-in acknowledgement; inquiry-form privacy link. |
| Grievance / Data-rights page | **Required** | DPDP requires a Grievance Officer contact; PDPL requires a contact for data-subject requests; also the consumer-complaints channel required by UAE consumer law. |
| Company identification (imprint) | **Required** | Legal name, licence number + issuing authority (DED/free zone), registered address, contact — in footer/contact/terms. |
| Disclaimer — third-party operators & availability | **Required** | OUTLYY does not operate the activities; indicative pricing; availability confirmed by human; content accuracy of supplier data. |
| Copyright / IP notice + image licensing statement | **Required** | Pexels licence terms allow use without attribution but not implying endorsement; imported supplier imagery needs rights. |
| Acceptable Use / User conduct | Recommended | Reviews, inquiry abuse, scraping. |
| WhatsApp Business messaging policy statement | Recommended | Opt-in/opt-out (STOP), message types, hours — required by Meta's Business Messaging Policy once the BSP goes live. |
| Supplier Terms (B2B) | Recommended before first contract | Data-processing clauses, liability, content licence, rate confidentiality. |
| Data Processing Agreement template | Recommended | For BSP, email, analytics vendors; PDPL art. 7 processor obligations. |
| Sub-processor list (public) | Recommended | Vercel, Neon, Resend, WhatsApp BSP, Pexels, PostHog/Meta when enabled. |
| Data breach response plan (internal) | **Required (internal)** | PDPL/DPDP/GDPR notification duties. |
| Records of processing / retention schedule (internal) | Recommended | GDPR art. 30 style; PDPL art. 7(1)(b). |
| Employee/agent data-handling policy | Recommended | Agents see customer PII; console ownership rules exist, but a written policy is needed. |
| Accessibility statement | Optional | Good practice; PRD targets WCAG. |
| Modern-slavery / anti-corruption statements | Optional | Only if required by partners. |

---

## 3. Phase 3 — information required from you

Nothing below is assumed. Blank = needed.

### A0. Answers received (22 Sep 2026) — to be verified against the trade licence before publication

| # | Item | Answer given |
|---|---|---|
| 1 | Legal entity | **H P D TOURISM L.L.C** |
| 2 | Licensing authority | Dubai **Department of Economy and Tourism** (DED) |
| 3 | Licence number / expiry | **843819**, expires **15/07/2027** |
| 4 | Registered address | 1202, Musallah Tower, near Al Fahidi Metro Station, Bur Dubai, Dubai, UAE · P.O. Box 506642 |
| 5 | Registered phone | +971 58 296 9796 |
| 6 | Domain | **outlyy.com** (to be purchased) |
| 7 | Support / general email | dubai@holidaychacha.com |
| 8 | Grievance & data-protection contact | **Chirag Korani**, Business Strategist & Marketing Lead — chirag@holidaychacha.com |
| 9 | Customer phone / WhatsApp | +971 58 825 6515 (official WhatsApp Business line; +971 58 296 9796 remains the licence-registered phone) |
| 10 | Money flow | Paid into the **H P D Tourism L.L.C** bank account → HPD is the **merchant of record** |
| 11 | Contracting party | Customer contracts with **H P D Tourism L.L.C** (principal, not disclosed agent) |
| 12 | Suppliers | Not disclosed; **no permission to use Rayna photos or copy** |
| 13 | Markets | India first, then worldwide |
| 14 | Pricing | **VAT-inclusive** |
| 15 | Response time | ~30 minutes |
| 16 | Cancellation/refund | Varies per activity — stated on each listing |
| 17 | Reviews | Google reviews of **"Holiday Planner"** (Jodhpur / Dubai / New Delhi / Ahmedabad), 202 rows, supplied as a published Google Sheet |

**Consequences of these answers (decided, feeds the drafting):**

- **Principal, not agent.** The customer contracts with H P D Tourism L.L.C and pays it directly, so the terms must be a **principal / merchant-of-record** contract: OUTLYY owes the service itself and carries consumer-law liability for it, with a separate clause covering the third-party operator's on-site conduct. The existing draft ("we act as a booking agent between you and the operator") is wrong and gets replaced.
- **Brand is not the entity.** The site trades as "OUTLYY" on outlyy.com; the contracting company is H P D Tourism L.L.C. Every legal surface — footer, terms, privacy, confirmations, invoices — must carry "OUTLYY is a trading name of H P D Tourism L.L.C, Dubai DET licence 843819". Without it the customer cannot tell who they contracted with, and the bank/payment name will not match the brand.
- **Email domain mismatch.** Support and grievance addresses are on holidaychacha.com while the site is outlyy.com. Lawful if disclosed, but it reads as a phishing signal; recommended: support@outlyy.com and privacy@outlyy.com forwarding to the same inboxes.
- **VAT-inclusive pricing** must be stated at the point of price display ("prices include UAE VAT"); a TRN is required on tax invoices if the company is VAT-registered (see gaps).
- **Per-activity cancellation** means the listing's own policy governs. The site-wide policy page becomes a short explainer plus "the policy shown on the listing you booked applies". The schema already stores `freeCancellationHours` and `cancellationPolicy` per activity.
- **Rayna content is unlicensed** → imported drafts must not be published with Rayna photos or "Reserve with Rayna Tours" copy. Replace images (own photography, Pexels, or supplier-licensed) and rewrite descriptions before publishing.

**New finding — the review sheet (verified by fetching it):** 202 rows, all Google reviews of a business called **"Holiday Planner"** (Jodhpur 49, Dubai 96, New Delhi 16, Ahmedabad 41), with reviewer names, Google profile links, photo links and dates. These are **not** OUTLYY / H P D Tourism reviews and they were exported from Google Maps. Publishing them on outlyy.com as OUTLYY reviews would be a misleading-reviews violation (India CCPA guidelines 2023; UAE CPL 15/2020), a privacy problem (reviewer names and profile links are third-party personal data), and Google's terms restrict scraping and re-publication. Options, safest first:

1. Do not publish them. Collect OUTLYY's own reviews after real trips (post-trip request flow).
2. If "Holiday Planner" is the same group: publish clearly labelled — "Reviews of our sister brand Holiday Planner, from Google" — with a link to the Google listing, first name + initial only, no imported profile links, and never as per-activity ratings on OUTLYY listings.
3. Embed Google's own review widget for the real Google Business Profile (Google's terms cover that display).

In every option, per-activity `rating` / `reviewCount` on OUTLYY listings stay at 0 until OUTLYY has its own reviews.

### A1. Still needed (short list)

**Company**

1. **VAT / TRN** — is H P D Tourism L.L.C VAT-registered? If yes, the 15-digit TRN (needed on tax invoices and usually shown on the site).
2. Any **Indian entity** (Holiday Planner / Holiday Chacha Pvt Ltd or similar): name, CIN, GSTIN, address — or confirm "no Indian entity, India is a market only".
3. Relationship between **OUTLYY**, **Holiday Chacha** and **Holiday Planner** — same owner? same group? Needed before "sister brand" can be said lawfully, and it explains the email domain.
4. Is **"OUTLYY"** trademarked or applied for (UAE / India)? Not a blocker; affects the IP notice.
5. Does licence 843819 carry an **inbound tour operating / travel agency** activity (the DET activity names printed on it), or a general trading / e-commerce activity? Decides whether trips may be sold as principal under this licence.

**Operations**

6. Support hours you will honour (site currently claims 9am–11pm IST with ~30-minute replies).
7. Is there a **24/7 emergency line**? If not, that promise comes off the cancellation page.
8. Staff: how many people will hold admin/agent logins, and **which countries** do they work from? They will read customer data; the privacy policy must name those countries.

**Reviews**

9. Which of the three review options above do you want?

### A2. Questions 15 and 16, in plain language

**15 — "Vendors / sub-processors."** Every outside company whose servers touch customer data must be named in the privacy policy (a duty under UAE PDPL, India DPDP and GDPR — that is what a "sub-processor list" is). The code already shows what OUTLYY uses; confirm the account owner and, where it matters, the region:

| Purpose | Service in the code | What I need from you |
|---|---|---|
| Hosting / website | Vercel | Which account; which region will the functions run in? |
| Database | Neon Postgres | Which region is the project in (Singapore, Frankfurt, …)? |
| Email sending | Resend | Confirm; which domain sends (outlyy.com?) |
| SMS one-time passwords | MSG91 (India) | Confirm, or name a UAE SMS provider |
| WhatsApp messaging | not connected yet | Meta Cloud API directly, or a partner (Interakt, WATI, Gupshup, 360dialog)? Under which business name is the WhatsApp Business Account registered? |
| Photos | Pexels | Confirm (already configured) |
| Analytics | first-party only today; Google Analytics / Meta Pixel / PostHog can be switched on | Which ones do you actually want at launch? |
| Payments (later) | none connected | Which gateway — Stripe UAE, Telr, PayTabs, Network International, Razorpay? |
| Error monitoring | Sentry (optional) | On or off? |

**16 — "Staff locations and how long data is kept."** Two things:

- *Who sees customer data, and from where* — the number of admin/agent accounts and the countries they work from. Agents in India working for a Dubai company is a cross-border transfer and needs one disclosed sentence in the privacy policy.
- *Retention* — how long each record is kept before deletion. The system is already built to the schedule below; reply "keep as is" or give different numbers:

| Record | Proposed retention |
|---|---|
| Inquiries that never converted, and spam | 24 months, then deleted |
| Won inquiries + bookings, invoices, payments | 7 years (accounting/VAT), personal details anonymised earlier on request |
| Notification logs (WhatsApp/email sent) | 24 months |
| Analytics events | 24 months |
| Consent records | as long as someone could complain about a message |
| Staff audit log | kept (it is the security record) |

### A3. Original full checklist (reference)

#### Company & registration
1. Exact legal entity name (as on the trade licence).
2. Company form (LLC / FZ-LLC / FZE / sole establishment) and **issuing authority** (Dubai DET, DMCC, IFZA, RAKEZ, DIFC…).
3. Trade licence number and expiry.
4. Licensed activity(ies) — specifically whether the licence covers **tourism/travel agency or "tour operator / ticketing"** (DET tourism licence) or is a general e-commerce/tech activity. This determines whether OUTLYY may sell/arrange activities itself or must act purely as a lead-generator.
5. Registered address (full, as on licence).
6. Operational address(es) if different; is there any Indian office/entity at all? (Contact page currently says Mumbai.)
7. Any Indian entity (Pvt Ltd/LLP) — CIN, PAN, GSTIN, registered address; or confirm **none**.
8. UAE VAT/TRN number, or confirm not registered.
9. Ownership/authorised signatory name and title (for notices; not necessarily published).
10. Brand name(s) and trademark status ("OUTLYY" — filed/registered? where?).
11. Domain(s) that will be live (`outlyy.com`? `.ae`? `.com`?).

### B. Contacts to publish
12. Support email; legal/privacy email; grievance email.
13. Support phone / WhatsApp Business number (which country?), support hours (currently "9am–11pm IST").
14. Emergency line — exists? staffed 24/7? (Cancellation policy promises it.)
15. **Grievance Officer** (DPDP): name, designation, email, address.
16. Data Protection contact / DPO (PDPL): name or role, email.
17. Consumer-complaints escalation route you will honour (internal → Dubai Consumer Protection / DET, India NCH).

### C. Business model facts (launch)
18. Confirm launch model: **inquiry-only, no on-site payment** — agent confirms and collects payment how? (Supplier payment link? OUTLYY-issued link? Cash to supplier?) Who is merchant of record when money moves?
19. Contracting party for the activity: does the customer contract with OUTLYY or with the supplier? Is OUTLYY an agent (commission) or principal (reseller)?
20. Which suppliers are actually contracted today (names, entity types) — and which named in the fixtures (Arabian Dunes Tourism LLC, Emaar Entertainment, Miral/Farah, Rayna Tourism, Marina Fleet Charters, …) are **not**.
21. Rayna: do you have written permission to reuse their images and copy? If not, treat as unlicensed.
22. Countries served / marketed to (India primarily? GCC residents? EU/UK?). Do you intend to actively target EU/UK residents (affects GDPR scope)?
23. Currencies quoted (INR indicative, AED); who bears FX; will prices shown be inclusive of UAE VAT?
24. Minimum age of customers; children's data (traveller ages collected — infants/children counts only, no names?).
25. Response-time commitments you will actually honour (30-min human reply? 2-hour quote?) and hours.
26. Refund/cancellation reality in Inquiry Mode: is anything refundable by OUTLYY, or purely supplier policy?
27. Reviews: source plan (post-trip requests only? imported from Google/Tripadvisor?) — fixtures must be removed unless real.
28. Platform stats you can evidence (travellers served, suppliers, ratings) — or confirm none yet.

### D. Data & vendors (sub-processors)
29. Hosting: Vercel (region? Fluid Compute region config).
30. Database: Neon (project region — matters for transfer disclosures and latency).
31. Email: Resend (account country; sending domain).
32. WhatsApp BSP planned (Meta Cloud API direct? Interakt/Gupshup/WATI?) and the WABA business entity name.
33. SMS OTP: MSG91 (India) — confirm; any UAE SMS route?
34. Analytics: first-party only at launch? PostHog (EU/US cloud?), GA4, Meta Pixel/CAPI — which will be enabled and when.
35. Image provider: Pexels (API key holder), any Cloudinary/other CDN.
36. Error monitoring: Sentry? Region.
37. Payment gateway(s) planned: Razorpay (India entity needed), Stripe UAE, Telr/PayTabs, Tap? — determines PCI and merchant-of-record language.
38. Supplier APIs planned: Rayna/"Rathin" — data shared with them (names, phones, passports?).
39. Backups: Neon PITR window; any exports to Google Sheets/Drive (imports flow reads Google; does anyone export customer data to Sheets?).
40. Staff: how many admins/agents, where located (India/UAE) — cross-border access disclosure.
41. Retention you want: keep the documented 7 y / 24 m, or different.

### E. Content rights
42. Logo/brand assets ownership; font licences (Bricolage Grotesque, Plus Jakarta Sans — Google Fonts OFL, fine).
43. Photography: confirm Pexels-only for launch; any supplier-provided images with written licence.
44. Copy written in-house (yes, fixtures) — any third-party text (Rayna) to be removed.

---

## 4. Phase 4 — personal data inventory

| Data | Collected where | Purpose | Lawful basis (PDPL / DPDP / GDPR) | Disclosure | Consent | Retention (documented) | Deletion |
|---|---|---|---|---|---|---|---|
| Name, phone (E.164), email | Inquiry form, OTP sign-in, contact form | Respond to inquiry, identify customer, deliver confirmations | Contract/pre-contract steps; DPDP: consent or legitimate use (voluntarily provided for a specified purpose) | Required | Notice; WhatsApp channel needs opt-in | 24 m (lost/spam) / 7 y (won → order) | Anonymise routine exists; workflow manual |
| Travel dates, pax counts (adults/children/infants/seniors), hotel/pickup, budget band, currency | Inquiry form | Quote and fulfil | Contract | Required | Notice | as above | as above |
| Dietary preference (veg/jain/halal/non-veg) | Inquiry form | Pass to supplier | **Potentially reveals religion** (Jain/halal) → sensitive under GDPR art. 9; PDPL "sensitive"; treat as such: explicit purpose statement, minimise sharing | Required, explicit | Recommend explicit consent line | as above | as above |
| Special requests (free text — may contain medical/mobility info) | Inquiry form | Fulfilment | Sensitive by content; explicit consent line recommended | Required | Yes | as above | scrubbed on anonymise |
| Cart items (activities, variants, add-ons, indicative totals) | Inquiry form | Quote | Contract | Required | — | as above | kept (non-identifying) |
| Attribution: utm_*, gclid, fbclid, fbc/fbp, landing/referrer | Cookie `outlyy_attr` → inquiry + analytics | Marketing measurement | Consent (EU/UK); notice (UAE/IN) | Required | **Yes for EU/UK** | 24 m | nulled on anonymise |
| Session id / anon id | Cookies `outlyy_sid`, `outlyy_aid` | Analytics funnel | Consent for non-essential (EU/UK); notice elsewhere | Required | Yes (EU/UK) | 1 y cookie; 24 m server | nulled |
| Hashed IP, user agent, country | Server on events/inquiries/logins | Fraud/abuse, rate limits, audit | Legitimate interest / security | Required (general) | No | 24 m | nulled |
| OTP challenge (phone, code hash, attempts) | Sign-in | Authentication | Contract/security | Notice | No | short TTL | auto-expire |
| Customer profile (name, email, preferences: language, currency, marketing flags) | `/account/profile` | Service | Contract; marketing flag = consent | Required | Marketing: yes | Account life | export + delete request |
| Agent notes about the customer | Console | Service | Legitimate interest; must be factual — policy needed | Internal | — | append-only | scrub on anonymise |
| Staff data (name, email, roles, sessions, IP hash) | Admin | Access control | Employment/contract | Internal | — | — | — |
| Future: passport/Emirates ID, payment details | Not collected today | — | — | Policy currently mentions ID handling — remove until real | — | — | — |

**Disclosure required for all rows above; explicit consent recommended for dietary/medical free text and required for WhatsApp/marketing channels and EU/UK tracking.**

---

## 5. Phase 5 — cookies & tracking

| Cookie / storage | Type | Lifetime | Verdict |
|---|---|---|---|
| `outlyy_sid` | first-party analytics session | 30 min | Non-essential → consent in EU/UK; disclosure everywhere |
| `outlyy_aid` | first-party anonymous id | 1 year | Non-essential → same; also a "persistent identifier" under DPDP notice |
| `outlyy_attr` | attribution incl. gclid/fbclid/fbc/fbp | 1 year | Marketing → consent in EU/UK; disclosure |
| `outlyy_customer_session` (httpOnly), `outlyy_customer=1` | auth | session days | Strictly necessary |
| `outlyy_admin_session`, `outlyy_admin_pending` | staff auth | 8 h | Strictly necessary |
| localStorage: cart, wishlist, compare, recent searches, currency | functional | until cleared | Functional; disclose |
| Meta Pixel / CAPI, GA4, PostHog | marketing/analytics | — | **Off** until env set; when enabled: consent gate required for EU/UK, notice + opt-out for UAE/India; CAPI event matching uses hashed email/phone → disclose |

Requirements: (1) cookie policy page; (2) a consent banner that defaults non-essential **off** for EU/UK (geo via `x-vercel-ip-country`) and shows a notice + "manage" elsewhere; (3) `analytics.ts` must not set `outlyy_aid`/`outlyy_attr` before consent where required; (4) a "Do not track me" / opt-out control in the footer or account; (5) forwarders must read the consent state before sending to Meta/GA. Today none of these exist.

---

## 6. Phase 6 — consumer protection

- **Pricing:** cards and ADP show "from ₹X per adult · all-in". In Inquiry Mode this is indicative; the ADP has an "Indicative price" note but the price promise page and FAQ speak of guaranteed all-in prices. Required: a clear, consistent statement that displayed prices are indicative until confirmed by an agent in writing; whether UAE VAT is included; FX basis for INR.
- **Availability:** UI already says a human confirms availability (good). Required: disclaimer that availability and price are as confirmed by the supplier at the time of confirmation.
- **Cancellation:** per-activity `freeCancellationHours` and policy text exist; the site-wide policy must say the supplier's policy governs unless OUTLYY states otherwise, and how to cancel in Inquiry Mode (WhatsApp/email).
- **Supplier role:** state that activities are operated by third parties; OUTLYY's role (agent vs principal — depends on your answer to C19) and the limits of liability accordingly. UAE Consumer Protection Law 15/2020 and its 2023 regulations require clear information on the provider, price, and refund conditions; you cannot exclude liability for gross negligence.
- **Claims to remove until evidenced:** "24/7 emergency line", "refund in full if pickup 30 min late", "voucher within minutes", "UPI/EMI", "instant vouchers", "verified suppliers scored monthly", "18,400 travellers".
- **Future bookings/payments:** merchant of record, receipts/tax invoices (UAE VAT invoice requirements), refund timelines, chargeback handling, PCI scope — all to be added when payments go live, not now.

---

## 7. Phase 7 — website content review (placeholders & fabrications)

| Item | Location | Action |
|---|---|---|
| Legal name default "OUTLYY Travel Technologies Pvt. Ltd." | `site-config.ts` | Remove default; render nothing until env set (already the pattern for other identifiers) — **and set the real name** |
| Site URL default `https://outlyy.com` | `site-config.ts` | Confirm real domain |
| "Offices: Mumbai, India · Business Bay, Dubai, UAE" | `/contact` | Replace with real registered address or remove |
| 6 featured reviews + per-activity reviews with author names, cities, `verified: true` | `reviews.ts` | Remove before launch, or clearly label as illustrative — fake verified reviews are unlawful advertising in India (CCPA guidelines), UAE and UK |
| Platform stats (18,400 travellers, 4.7 rating, 6,120 reviews, 8-min median reply, 47-s vouchers, 14 suppliers) | `reviews.ts platformStats`, trust components, footer | Remove or replace with evidenced numbers |
| Activity `rating` / `reviewCount` / `bookedThisMonth` on every listing and card | `activities.ts` + DB content | Zero them or hide until real reviews exist (schema already allows 0) |
| Supplier names incl. real brands ("Emaar Entertainment (official)", "Miral / Farah Experiences (official)", "Rayna Tourism") and "Verified supplier, contracted directly" badges | `activities.ts`, `badge.tsx`, `trust.tsx` | Only show suppliers you have contracts with; never imply official partnership without a written agreement |
| Demo bookings `OUT-482913`, `OUT-517204`, guest "Imran Sheikh", supplier phone `+971 50 123 4567` | `bookings.ts`, `/voucher/[reference]`, `/manage-booking` | Remove routes or gate behind the real order system |
| Imported Rayna drafts: CDN images, "Book … with Rayna Tours" SEO copy, USD prices | DB (drafts) | Do not publish until copy is rewritten and images are licensed/replaced |
| Sample agent personas in inquiry confirmation ("agent.name") | check `inquiries.ts` fixtures | Confirm removed from customer-facing pages |
| Legal pages "updated 1 September 2026" | `legal.ts` | Dates are placeholders |
| WhatsApp placeholder number `919000000000` in dev | `site-config.ts` | Fails safe (renders nothing) — set the real number |
| Pexels photos | manifest | Licence OK; add "Photos: Pexels" line in the IP notice; do not imply they show the exact venue where `manual: true` |

---

## 8. Phase 8 — jurisdiction requirements (practical)

**UAE (Federal PDPL 45/2021 + Executive Regulations; Consumer Protection Law 15/2020; E-commerce; DET tourism licensing)**
- Controller = the Dubai entity. Publish identity, licence, address, contact.
- Lawful basis: consent or contract necessity; keep records; privacy notice with all art. 13 elements.
- Rights: access, correction, deletion, restriction, portability, objection to marketing — need a channel and internal SLA (respond without undue delay; regulations may set timelines).
- Breach notification to the UAE Data Office (once operational) — internal procedure now.
- Cross-border transfer: data hosted outside the UAE (Vercel/Neon regions) → disclose; use contractual safeguards with processors.
- Marketing: opt-in for electronic marketing; STOP honoured.
- Consumer law: clear price incl. VAT, provider identity, refund terms, complaint channel; Arabic-language considerations for UAE-facing consumer terms (advisable, not always mandatory for online B2C targeting expats — confirm with counsel).
- **Licensing:** selling/arranging tours may require a DET tourism activity on the licence; a pure lead-referral model is lighter. Answer C4/C19 decides the terms wording.

**India (DPDP Act 2023 + draft Rules 2025; Consumer Protection Act 2019 & E-commerce Rules 2020; CCPA fake-review guidelines 2023)**
- Applies because data of Indian data principals is processed for offering services in India.
- Notice at or before collection (purpose, data, rights, complaint route, Data Protection Board); consent must be free, specific, informed, unambiguous, **not pre-ticked**; consent-withdrawal as easy as giving it.
- Grievance Officer with published contact; response timelines.
- Children: verifiable parental consent for under-18 data — only collect counts, not child identities (current form collects counts only — keep it that way).
- E-commerce Rules: name of the legal entity, address, contact, grievance officer, country of origin where relevant, no misleading reviews; if you are a "marketplace" (facilitating third-party sellers) additional seller-disclosure duties.
- GST: if an Indian entity invoices Indian customers, GST/TCS treatment (PRD §16 already flags). No Indian entity → state that clearly and price in INR as indicative only.

**EU/UK visitors (GDPR/UK GDPR, ePrivacy/PECR)**
- Site is accessible globally; if you do not target EU/UK, minimal exposure — but tracking cookies still trigger PECR-style consent when EU/UK users are knowingly served. Practical approach: geo-gated consent banner (default off in EU/UK), privacy notice covering GDPR rights and an EU/UK representative statement only if you actively target those markets.

**Common to all:** privacy notice, cookie notice, consent capture with timestamp (the `consents` table exists — use it for terms/privacy/marketing/WhatsApp acceptance with version ids), rights workflow, retention schedule, breach plan, processor agreements.

---

## 9. Phase 9 — security & liability

Present and adequate for launch: staff MFA, session revocation, per-user rate limits, hashed IPs, PII redaction in logs, immutable audit log with actor/before/after, strict validation, CSP, https-only asset policy, encrypted-at-rest database (Neon), TLS in transit, customer export endpoint, anonymisation routine.

Required before launch (operational, not code):
1. **Incident/breach response procedure** with owner, 24/72-hour notification steps, customer notice template.
2. **Access policy:** who holds `customers.view_pii`, quarterly access review, offboarding revokes sessions (`resetCredentials` exists).
3. **Sub-processor register** and DPAs (Vercel, Neon, Resend, BSP, SMS, Pexels, PostHog/Meta when enabled).
4. **DSAR procedure:** request → verify identity (OTP) → export or anonymise via `privacy.repo.anonymiseByPhone` → confirm; target ≤ 30 days; log in audit.
5. **Retention jobs** (24 m analytics/notifications/lost inquiries) — currently FUTURE; either implement before launch or document a manual quarterly purge.
6. **Backups statement** (Neon PITR) and restore test.
7. **Privacy-policy language** to add: security measures summary, no card data (until payments), staff access controls, audit logging, that WhatsApp messages are processed by Meta/BSP under their terms.
8. **Liability clauses** (terms): third-party operator responsibility, force majeure, cap (subject to non-excludable consumer rights in UAE/India), no liability for supplier-provided information errors beyond correcting them.

---

## 10. Final output

1. **Launch compliance score:** 38/100.
2. **Legal risks:** R1–R15 above; top five: invented entity name; fake reviews/stats; real brands named as partners; legal pages describing a different business model/jurisdiction; pre-ticked consent + untracked cookies.
3. **Missing legal pages:** cookie policy; user-rights/grievance page; disclaimer (third-party operators, indicative pricing); IP/copyright notice; company imprint; WhatsApp messaging policy.
4. **Missing policies (internal):** breach response; DSAR procedure; retention execution; access control review; agent data-handling; content-licensing policy.
5. **Missing disclosures:** controller identity/address/licence; purposes & lawful bases; sub-processors & transfers; retention periods; cookies; indicative pricing & VAT/FX; supplier role; response-time reality; children's data handling.
6. **Missing consents:** WhatsApp opt-in (unticked, purposed); marketing opt-in (separate); cookie/tracking consent (EU/UK gate, opt-out elsewhere); terms/privacy acknowledgement on inquiry and OTP sign-in; explicit line for dietary/medical free text; consent versioning stored in `consents`.
7. **Missing business information:** launch commercial model (agent vs principal), merchant of record, contracted suppliers, refund reality, response commitments, countries targeted, VAT/FX basis.
8. **Missing company information:** legal name, form, licence number + authority + activities, registered address, VAT/TRN, Indian entity (or none), trademark status, domain.
9. **Missing contact information:** support/legal/privacy/grievance emails, phone/WhatsApp number, hours, Grievance Officer, DPO/contact.
10. **Missing operational information:** staff locations, vendor list, regions, backup policy, review-collection plan, emergency-line reality.
11. **Required documents:** Terms of Service; Privacy Policy; Cookie Policy; Cancellation & Refund Policy (Inquiry-Mode version); inline consent notices; Grievance/Data-rights page; Company imprint; Disclaimer; IP/Copyright notice; internal breach plan.
12. **Recommended documents:** Acceptable Use; WhatsApp messaging policy; Supplier Terms; DPA template; sub-processor list; records of processing; agent data-handling policy; accessibility statement.
13. **Information needed from you:** Section 3, items 1–44.
14. **Compliance gaps (code/ops, not legal drafting):** consent banner + gating in `analytics.ts`; unticked WhatsApp consent; terms/privacy acknowledgement in inquiry + login; remove fixture reviews/stats/demo bookings/supplier badges; drop invented legal-name default; wire `anonymiseByPhone` to an admin action with SLA; implement retention jobs; add `consents` rows for policy versions; pause Meta/GA forwarders behind consent; hide ratings when `reviewCount = 0`.
15. **Launch blockers:** (a) real legal entity details in env and on the site; (b) fake reviews/stats/supplier claims removed; (c) Terms + Privacy + Cookie + Cancellation rewritten for the actual entity and Inquiry Mode, lawyer-reviewed; (d) consent fixes (WhatsApp unticked, cookie notice/gate, policy acknowledgement); (e) Grievance/data-rights contact published; (f) demo bookings/vouchers removed; (g) Rayna-derived content not published until rights confirmed; (h) breach + DSAR procedures written.
16. **Post-launch improvements:** retention automation; consent-management platform; Arabic versions of consumer terms; supplier DPAs as contracts land; payment-phase documents (merchant of record, invoices, PCI attestation, refund SLAs); EU/UK representative if targeting; accessibility statement; periodic access reviews.

---

## 11. Drafting round 1 — what is now live in the code (22 Sep 2026)

Company identity is env-driven and real: legal name **H P D Tourism L.L.C**, Dubai DET licence **843819**, TRN **100598421400003**, registered office (Musallah Tower, Bur Dubai, P.O. Box 506642), support **dubai@holidaychacha.com**, WhatsApp **+971 58 825 6515**, grievance contact **Chirag Korani / chirag@holidaychacha.com**. The invented "OUTLYY Travel Technologies Pvt. Ltd." default is gone — `siteConfig.legalName` is now optional and renders nothing when unset. `entityLine()` produces "OUTLYY is a trading name of H P D Tourism L.L.C, Dubai Department of Economy and Tourism licence 843819." and appears in the footer and on the legal pages. The emergency-phone variable is deliberately blank, so every 24/7 block hides itself.

Pages rewritten or added (all drafts, still pending counsel review):

| Page | State |
|---|---|
| /terms | Rewritten as a **principal / merchant-of-record** contract: who you contract with, enquiry → written confirmation → payment, VAT-inclusive AED pricing with INR as a convenience conversion, per-activity cancellation, IP + sister-brand review labelling, liability cap with statutory carve-outs, UAE governing law and Dubai courts. |
| /privacy | Rewritten for UAE PDPL + India DPDP + GDPR-style notice: controller identity and address, categories collected, purposes and lawful bases, sensitive dietary/medical handling, named sub-processors (Vercel US-East, Neon US-Ohio, Resend, MSG91, Pexels; WhatsApp and payment providers to be named before enabling), US hosting and UAE/India staff access disclosed, retention table, rights + 30-day SLA, grievance officer, security summary, breach commitment. |
| /cookies | **New.** Every cookie by name and lifetime, split into strictly necessary / measurement-attribution / advertising (none today), and how to refuse. |
| /data-rights | **New.** Grievance Officer contact, what can be requested, 30-day SLA, identity check, escalation to the UAE Data Office / Data Protection Board of India / local authority, and the consumer route via Dubai DET. |
| /disclaimer | **New.** Operators deliver the activity; prices and availability are indicative until confirmed; photographs illustrative; third-party names are not endorsements; travel documents, insurance and fitness are the traveller's. |
| /cancellation-policy | Rewritten: the listing's own terms govern, how to cancel, refund mechanics, operator cancellations, statutory rights preserved. |
| /price-guarantee | Rewritten as **"How our prices work"**: indicative until confirmed, VAT-inclusive, INR is a conversion, no fees after a confirmed price. |
| /about | "Where we are" replaced with the real entity, office and hours; the 8-minute and UPI claims removed. |

Service-promise copy swept across the storefront: "about eight minutes" → "about 30 minutes"; "9am–11pm IST, every day" → "10am–6pm Gulf Standard Time, Monday to Saturday"; the two unconditional 24/7-emergency claims (booking confirmation, support metadata) rewritten. The footer legal band now shows the licence, TRN, entity line and registered office, and links Terms / Privacy / Cookies / Your data rights / Cancellation / How prices work / Disclaimer.

**Score movement:** legal documents 3/10 → 7/10 (drafted and factually correct, not yet lawyer-reviewed); company identity 1/10 → 9/10. Overall **38 → 58**, held down by the items below.

### Still blocking launch after this round

1. **Fabricated social proof is still in the code** — fixture reviews marked `verified: true`, `platformStats` (18,400 travellers, 6,120 reviews, 14 suppliers), per-activity ratings and review counts, "Verified supplier, contracted directly" badges naming Emaar/Miral/Rayna, and the demo bookings reachable at `/voucher/<ref>` and `/manage-booking`. Decision taken: publish the group's **Holiday Planner** Google reviews **labelled as a sister brand**, never as OUTLYY's own and never as per-activity ratings.
2. **Consent mechanics** — the WhatsApp checkbox is still pre-ticked; there is no terms/privacy acknowledgement on the inquiry form or at OTP sign-in; there is no cookie banner, so `outlyy_aid` and `outlyy_attr` are still set before any choice is offered.
3. **Deletion and retention execution** — `privacy.repo.anonymiseByPhone` is still not reachable from the admin console, and the 24-month purge jobs are not implemented.
4. **Counsel review** of all eight pages, and confirmation that DET licence 843819's tour-operator activity covers selling these experiences as principal.
5. **Domain** — outlyy.com is not yet purchased; `NEXT_PUBLIC_SITE_URL` still points at the Vercel preview URL, so canonicals, sitemap and email links are wrong for production.
6. **Support/grievance email domain** — both are on holidaychacha.com while the site is outlyy.com; set up support@outlyy.com and privacy@outlyy.com forwarders.

### Open questions (not blocking the drafts)

- WhatsApp provider (Meta Cloud API direct, or Interakt / WATI / Gupshup / 360dialog) and the WABA business name — needed before WhatsApp messaging is switched on, and named in the privacy policy.
- Which analytics you want live at launch (first-party only, or GA4 / Meta Pixel / PostHog) — determines whether a consent gate is mandatory.
- Payment gateway for the booking phase.
- Sentry on or off.
- Confirmation that support hours are Gulf Standard Time (the drafts say GST; if the team works IST, one word changes).

### Performance note tied to the hosting answers

Neon is in **AWS us-east-2 (Ohio)**. Vercel functions were in **iad1 (Washington DC)** and, on 22 Sep 2026, were pinned to **bom1 (Mumbai)** in `vercel.json` at your instruction.

**Consequence, stated plainly: moving the functions alone makes server rendering slower, not faster.** Every page render and API call runs several database queries; each one now crosses Mumbai → Ohio (~200–250 ms round trip) instead of Washington → Ohio (~10–20 ms). A page doing five queries goes from roughly 100 ms of database time to over a second. What improves is the network hop between the Indian visitor and the function (~200 ms saved once per request), which does not pay for the per-query cost.

The change is only a win once the **database also moves to `ap-south-1` (Mumbai)**: functions and database then sit in the same region (~5 ms per query) and Indian visitors get the short network hop as well. Until then, the fastest configuration is functions and database together in Ohio.

Neon migration when you want it: create a new Neon project in `ap-south-1`, `pg_dump` the current database and restore into it, run `npm run db:migrate` to confirm the schema matches, swap `DATABASE_URL` and `DIRECT_URL`, redeploy. Roughly 15 minutes of downtime for a catalogue this size, or zero with a brief read-only window.

The privacy policy now says the website runs in Mumbai and the database in the United States; once the database moves, that paragraph becomes "India only" and the US transfer disclosure can be removed.
