# Customer auth + account — implementation contract (audit decision Q3 = Option B)

**Status:** binding for the Auth-Backend agent and the Account-UI agent working in parallel. Backend owns everything under `src/server/**`, `prisma/**`, `src/app/api/auth/**`, `src/app/api/me/**`. UI owns `src/app/login`, `src/app/signup`, `src/app/account/**`, `src/app/inquiry/track/**`, `src/components/layout/header.tsx` (account link only), `src/components/commerce/inquiry-ui.tsx` additions.

Conventions from `docs/backend/19-implementation-conventions.md` apply unchanged (handle(), strict zod, services own permissions, audit, no PII in logs, `"server-only"`).

## 1. Product rules

- Customer identity = **phone (E.164)**, verified by a 6-digit OTP. No passwords. Email optional.
- An account is created implicitly on first successful OTP verify (guest-first stays true; the inquiry form never requires login).
- On verify, every inquiry and order whose `lead_phone` equals the verified phone is linked (`customer_id`) — verified identity only, never claimed (§13.2.1).
- OTP delivery is a **port**. Adapters: `log` (dev/staging: code written to server log only, never returned to the client) and `msg91` (gated on `MSG91_AUTH_KEY` + `MSG91_SENDER_ID` + `MSG91_TEMPLATE_ID_OTP`, `SMS_PROVIDER=msg91`). `customerAuthEnabled()` = `APP_ENV !== "production"` OR a real SMS provider is configured. When disabled, `/login` renders an honest "Sign-in is coming soon — track your inquiry with your reference and phone instead" state and the API returns `NOT_CONFIGURED` (503).
- OTP: 6 digits, cryptographically random, stored as SHA-256 hash, 5-minute TTL, max 5 attempts, single-use, constant-time compare, never logged in production, request limited 3/phone/15 min + 10/IP/hour (§12.2).
- Session: opaque random token, SHA-256 hash stored in `customer_sessions`, 30-day sliding expiry, cookie `outlyy_customer_session` httpOnly/Secure(non-dev)/SameSite=Lax/path=/. A second, non-httpOnly hint cookie `outlyy_customer=1` (no data) lets the header decide between "Sign in" and "Account" without an API call. Logout clears both and revokes the row.

## 2. Schema additions (Backend agent, one additive migration)

```
customers            id uuid pk · phone_e164 unique · email? · full_name? · dietary? · hotel? · locale 'en-IN' · preferred_currency INR|AED · created_at · last_login_at? · deleted_at?
customer_sessions    id uuid pk · customer_id fk · token_hash · user_agent? · ip_hash? · expires_at · revoked_at? · created_at   (index customer_id, token_hash)
otp_challenges       id uuid pk · phone_e164 · code_hash · attempts int 0 · expires_at · consumed_at? · ip_hash? · created_at   (index phone_e164, created_at desc)
inquiries.customer_id  uuid? fk customers (index)
orders.customer_id     uuid? fk customers (index)
```
`consents` already exists; customer preferences are consent rows (`source: "profile"`).

## 3. Server API (Backend agent)

`src/server/services/customer-auth.service.ts` — `customerAuthService`:

```ts
requestOtp(input: { phone: string; countryCode: string; ip?: string }): Promise<{ challengeId: string; expiresInSeconds: number; phoneMasked: string }>
verifyOtp(input: { challengeId: string; code: string; ip?: string; userAgent?: string }): Promise<{ token: string; expiresAt: Date; customer: CustomerPublic; linkedInquiries: number }>
logout(token: string | undefined): Promise<void>
resolveRequest(req: NextRequest): Promise<CustomerSession | null>
resolveCookies(): Promise<CustomerSession | null>          // Server Components / Actions
requireCookies(): Promise<CustomerSession>                 // throws Errors.unauthorized()
enabled(): boolean
```
`CustomerSession = { customer: CustomerPublic; sessionId: string; expiresAt: Date }`
`CustomerPublic = { id; phoneE164; phoneMasked; email?; fullName?; firstName?; dietary?; hotel?; preferredCurrency; createdAt: string }`

`src/server/services/customer.service.ts` — `customerService`:
```ts
updateProfile(session, patch: { fullName?; email?; dietary?; hotel?; preferredCurrency? }): Promise<CustomerPublic>   // audited (actor type "customer")
getPreferences(session): Promise<{ whatsappTransactional: boolean; whatsappMarketing: boolean; email: boolean }>
updatePreferences(session, prefs): Promise<...>            // appends consent rows, source "profile"
listInquiries(session): Promise<InquiryCustomerView[]>     // by customer_id OR lead_phone = session phone; customer projection only (inquiryService.toCustomerView)
listOrders(session): Promise<OrderCustomerView[]>          // orders by customer_id / lead_phone; reference, status, placedAt, items (title/date/pax), totals — no net cost, no payments detail beyond status
exportData(session): Promise<Record<string, unknown>>      // customer + inquiries + orders + consents, JSON
requestDeletion(session, reason?): Promise<void>           // audit row + ops email (notification event ACCOUNT_DELETION_REQUEST, email to opsAlertEmails); does NOT delete (§05.8 anonymisation is an ops action)
```

Routes (all `runtime="nodejs"`, `dynamic="force-dynamic"`, `handle()`, strict zod in `src/server/schemas/customer.schemas.ts`, `assertSameOrigin` on mutations):

| Method | Path | Body / result |
|---|---|---|
| POST | `/api/auth/otp/request` | `{ phone, countryCode }` → `{ challengeId, expiresInSeconds, phoneMasked }`; 503 `NOT_CONFIGURED` when disabled |
| POST | `/api/auth/otp/verify` | `{ challengeId, code }` → sets cookies → `{ customer, linkedInquiries }` |
| POST | `/api/auth/logout` | → clears cookies, `{ ok: true }` |
| GET | `/api/auth/me` | → `{ customer }` or 401 |
| PATCH | `/api/me` | profile patch → `{ customer }` |
| GET/PUT | `/api/me/preferences` | |
| GET | `/api/me/inquiries` | `{ items }` |
| GET | `/api/me/orders` | `{ items }` |
| GET | `/api/me/export` | JSON download (`content-disposition: attachment`) |
| POST | `/api/me/delete-request` | `{ reason? }` → `{ ok: true }` |

Cookie helpers in `src/server/lib/customer-session.ts` (mirror `session.ts` naming): `CUSTOMER_COOKIE`, `CUSTOMER_HINT_COOKIE`, `setCustomerCookies(res, token, expiresAt)`, `clearCustomerCookies(res)`, `customerTokenFromRequest(req)`, `customerTokenFromCookies()`.

Frontend API seam (Backend agent adds to `src/lib/api/index.ts`, real fetches, no mock): `requestOtp`, `verifyOtp`, `logoutCustomer`, `fetchMe`, `updateMe`, `fetchMyInquiries`, `fetchMyOrders`, `fetchPreferences`, `updatePreferences`, `requestDeletion`. `lookupInquiry` already exists.

## 4. UI (Account agent)

- `/login`: phone (+91/+971 select, uses `normalisePhone` from `@/lib/phone` for inline validation) → `requestOtp` → 6-digit code step (auto-submit on 6 digits, resend after 30s, "wrong number?" back) → `verifyOtp` → `router.replace(next ?? "/account")`. `?next` must be same-site path (reuse the `safeNext` idea from `src/app/admin/(auth)/auth-client.tsx`, storefront paths only). Disabled state per §1. No mock "000000" copy anywhere.
- `/signup`: `redirect("/login")` (accounts are implicit).
- `/account/layout.tsx`: Server Component; `customerAuthService.resolveCookies()`; none → `redirect("/login?next=<path>")`. Greeting from the real customer (first name, else masked phone). Nav: Dashboard · My inquiries · My trips · Saved · Profile. Remove referrals route (delete the page — credits/loyalty are V2 and the mock balance was a trust cost).
- `/account` dashboard: open inquiries (real) with agent + WhatsApp follow-up; upcoming orders (real, may be empty → honest empty state); saved (existing localStorage wishlist); no `demoUser`, no `openInquiries` mock, no `upcomingBookings` mock.
- `/account/inquiries`: real list via `customerService.listInquiries`; reuse the existing 4-stage track component (`STAGES`).
- `/account/bookings` ("My trips"): real orders list; each links to `/booking/[reference]` only if that page can render it — it cannot (fixture-backed), so link to the WhatsApp follow-up instead and show reference/status/items/total. Do not touch `/booking/[reference]` or `/voucher/**` (retained booking-mode surfaces).
- `/account/profile`: editable form (name, email, dietary chips, hotel/area) via Server Action `updateProfileAction` → `customerService.updateProfile`; communication preferences → `updatePreferences`; **remove the Payment preferences card entirely** (no saved instruments exist; Razorpay links are sent by the agent); "Your data": Export → `GET /api/me/export`; Request deletion → confirm → `POST /api/me/delete-request`. Remove the "This build has no authentication" banner.
- Header (`components/layout/header.tsx`): user icon href = `/account` when `document.cookie` contains `outlyy_customer=1` after mount, else `/login`; `aria-label` "Your account" / "Sign in". Mobile menu "Your bookings" group → "My inquiries" · "Track an inquiry" · "Saved activities" · "Help & support"; add "Sign in" / "Account".
- `/inquiry/track`: guest tracker. Form: reference (`INQ-…`, uppercase, Luhn-checked client-side with `isValidReference` — copy it into `src/lib/reference.ts` since `src/server/lib/ids.ts` is server-only) + phone; → `lookupInquiry` → render: status pill, the 4-stage track, agent card + concrete deadline, items, "Message <agent> on WhatsApp" (inquiry_followup), and a "Sign in to see all your inquiries" link. Errors: 404 → "We couldn't find that inquiry with that number" (never say which was wrong); 429 → wait copy. Link to it from: header trust bar ("Track an inquiry"), footer "Your booking" column, `/inquiry/confirmation` ("Track this inquiry"), `/manage-booking` (add a second card "Looking for an inquiry?").
- 21st.dev: reuse the already-adapted `@kavikatiyar/order-history` track; the lookup form follows `@javierdev0/order-tracking` (reference + identifier → status) reimplemented on OUTLYY tokens. Cite in the page header comment.
- Remove `demoUser` from `src/lib/data/bookings.ts` once nothing imports it. Remove mock `inquiries` fixture imports from account pages (fixture file may stay for the design-system page only).

## 5. Verification (both)

- Wrong phone on tracker → 404 copy; right phone → track.
- Login: invalid phone inline error; OTP request rate-limited; wrong code → attempts message; correct code → `/account` shows real inquiries linked by phone.
- `grep -rn "Rajesh\|rajesh.patel\|demoUser\|RAJESH500\|okhdfcbank\|4412" src` returns nothing outside `src/lib/data/inquiries.ts` (design-system fixture) and tests.
- `npm run typecheck`, `npm test`, no `next build`/`dev` (the architect runs them).
