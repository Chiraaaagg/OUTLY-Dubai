# Admin — implementation note

**Agent:** Admin · **Scope:** §19 §4 admin shell + auth pages, `/admin` dashboard, `/admin/{users,settings,audit,products}`, Server Actions, and the thin JSON routes under `/api/admin/{users,settings,audit,products}`.
**Verification:** `npm run typecheck` is clean for every file listed here. The remaining errors at my last run are in other agents' files (`(console)/inquiries/[id]/page.tsx` Card `as="header"`, `api/admin/reports/inquiries/route.ts` duplicate `range`, `api/events/route.ts` + `schemas/events.schemas.ts` `unknown` event name). No tests added; `next build`/`next dev` deliberately not run.

---

## 1. Layout and session flow

```
src/app/admin/layout.tsx              root: force-dynamic, robots noindex, resolves session once;
                                      wraps children in <AdminShell> only when a session exists
src/app/admin/(auth)/layout.tsx       bare centred card; no session check (login/verify/enrol)
src/app/admin/(console)/layout.tsx    redirect("/admin/login") when resolveCookies() is null
src/app/admin/_lib/guard.ts           requirePage(permission) for pages (see §3)
```

Why this shape: layouts cannot read the pathname, so the auth pages and the console are split by route group. The root layout still resolves the session so that any page under `/admin` (including the Agent Console's, which landed under `(console)/inquiries/**`) gets the shell when signed in, and the auth pages render bare when signed out. The proxy's JWT check saves a render for logged-out hits; the `(console)` layout checks the *database* session (revocation), and every page then checks its permission.

**Storefront chrome under /admin:** `Header` (already a client component) returns `null` when `usePathname()` starts with `/admin`. `Footer` stays a Server Component: it is wrapped in a new `src/components/layout/storefront-only.tsx` client gate (`<StorefrontOnly>`), which returns `null` under `/admin`. Zero visual change elsewhere. The root `layout.tsx` was not touched; admin pages still render inside `<main id="main">` and `AppProvider`, which is harmless.

## 2. Pages

| Route | File | Permission | Reads | Notes |
|---|---|---|---|---|
| `/admin/login` | `(auth)/login/{page,login-form}.tsx` | — | — | POST `/api/admin/auth/login`; `{next:"totp"}` → `/admin/verify`, `{next:"enrol"}` → `/admin/enrol`. Carries a `?next=` through, sanitised by `safeNext()` (same-site `/admin/*` only, never an auth page). |
| `/admin/verify` | `(auth)/verify/{page,verify-form}.tsx` | — | — | 6-digit code → POST `/api/admin/auth/totp/verify` → `router.replace(next ?? "/admin/inquiries")` + `refresh()`. |
| `/admin/enrol` | `(auth)/enrol/{page,enrol-form}.tsx` | — | — | On mount POST `/api/admin/auth/totp/enrol`; shows the base32 key grouped in fours as text and the `otpauthUri` as an `<a href>` ("Open in authenticator app"); then code → verify. No QR library. |
| `/admin` | `(console)/page.tsx` | signed in; metrics need `reports.view` | `inquiryService.queueCounts`, `inquiryService.metrics` (last 7 days) | Queue tiles link into the console with its real params (`status=`, `agent=me\|unassigned`, `breached=1`). Shows the `?denied=<permission>` banner from the guard. |
| `/admin/users` | `(console)/users/{page,users-client}.tsx` | `users.manage` | `adminRepo.list()` (see Deviations) | Table + right drawer (`Sheet variant="drawer"`) for create/edit; dialog for reset. One-time password shown once in the drawer, never re-fetchable. Roles as checkboxes; shift/languages/skills/title/maxConcurrent/availability/photoUrl. |
| `/admin/settings` | `(console)/settings/{page,settings-forms}.tsx` | `settings.edit` | `settingsService.all()` | Four forms (sla / routing / followup / pricing), each posts `updateSettingAction` with a hidden `key`. Field errors come back from the service's zod schema. |
| `/admin/audit` | `(console)/audit/page.tsx` | `audit.view` | `auditRepo.list`, `adminRepo.list` (for the actor datalist + email→id) | Plain GET filter form (action prefix, entity type, entity id, actor email-or-uuid, from/to dates), 50/page, before/after as collapsible JSON. |
| `/admin/products` | `(console)/products/{page,fulfilment-flip}.tsx` | `products.edit`; flip needs `products.publish` | `catalogService.listProducts/listCombos` | Products and combos with tier, status, confirmation, fulfilment mode. Inline audited flip form with mandatory reason (≥ 8 chars). Explains inline that instant needs an active API supplier mapping (Rathin) and combos cannot go instant. |

All pages: `export const dynamic = "force-dynamic"`; Server Components read via services (audit/users via repositories, see Deviations); customer text is rendered through React escaping only.

## 3. Server Actions — `src/app/admin/_actions/*.ts`

Every action starts with `authService.requireCookies(permission)`; the client never names the actor. FormData is shaped by `form.*` helpers, validated with the strict schemas, passed to the service, then `revalidatePath`. Actions never throw to the client — `runAction()` maps `AppError` to the §12 envelope.

| Action | File | Permission | Service | Returns |
|---|---|---|---|---|
| `createUserAction` | `users.ts` | `users.manage` | `authService.createUser` | `{ id, temporaryPassword }` |
| `updateUserAction` | `users.ts` | `users.manage` | `authService.updateUser` | `{ id }` |
| `resetCredentialsAction` | `users.ts` | `users.manage` | `authService.resetCredentials` | `{ id, temporaryPassword, resetTotp }` |
| `updateSettingAction` | `settings.ts` | `settings.edit` | `settingsService.update(actor, key, value)` | `{ key }` |
| `setFulfilmentModeAction` | `products.ts` | `products.publish` | `catalogService.setFulfilmentMode` | `{ id, mode }` |

`_actions/result.ts` (no `"use server"`): `ActionResult<T>`, `runAction(fn)`, and `form.{str,num,bool,list,all}` — the Agent Console's `_actions/inquiries.ts` may reuse these.

## 4. JSON routes — `src/app/api/admin/**`

`runtime = "nodejs"`, `dynamic = "force-dynamic"`, `handle()`, `authService.requireRequest(req, permission)`, `assertSameOrigin` on every mutation, strict zod from `src/server/schemas/admin.schemas.ts`, one service call.

| Method | Path | Permission | Call |
|---|---|---|---|
| GET | `/api/admin/users` | `users.manage` | `adminRepo.list()` (deviation, below) → `{ items }` |
| POST | `/api/admin/users` | `users.manage` | `authService.createUser` → 201 `{ id, temporaryPassword }` |
| PATCH | `/api/admin/users/:id` | `users.manage` | `authService.updateUser` → `AdminUserRecord` |
| POST | `/api/admin/users/:id/reset` | `users.manage` | `authService.resetCredentials(actor, id, { resetTotp? })`; empty body allowed |
| GET | `/api/admin/settings` | `reports.view` | `settingsService.all()` |
| PUT | `/api/admin/settings` | `settings.edit` | body `{ key, value }` → `settingsService.update` |
| GET | `/api/admin/audit` | `audit.view` | `auditRepo.list({ action, entityType: entity, entityId, actorId: actor, from, to, page, pageSize })` |
| GET | `/api/admin/products` | `products.edit` | `{ products, combos }` |
| POST | `/api/admin/products/:id/fulfilment-mode` | `products.publish` | body `{ kind, mode, reason }` → `catalogService.setFulfilmentMode` |

`/api/admin/reports/**` belongs to the Analytics agent and was not touched.

### Schemas — `src/server/schemas/admin.schemas.ts` (owned here)

`createUserSchema`, `updateUserSchema`, `resetCredentialsSchema`, `userIdSchema`, `settingKeySchema`, `updateSettingSchema`, `auditQuerySchema` (`actor` must be a UUID at the API; the page also resolves emails), `fulfilmentModeSchema` (reason 8–500 chars), `productIdSchema`. All `.strict()`.

## 5. Shared components (usable by the Agent Console)

### `src/app/admin/_components/shell.tsx` (client)
- `AdminShell({ user: ShellUser, children })` — `ShellUser = { displayName, email, roleLabel, permissions: string[] }`. Left rail ≥ `lg`, sticky top bar with disclosure menu below. Nav: Inquiries · Dashboard · Users (`users.manage`) · Settings (`settings.edit`) · Audit (`audit.view`) · Products (`products.edit`). Active state by pathname prefix (`/admin` exact).
- `SignOutButton({ className? })` — POSTs `/api/admin/auth/logout`, then `router.replace("/admin/login")`.

### `src/app/admin/_components/ui.tsx` (no hooks; server or client)
| Export | Props |
|---|---|
| `PageHeader` | `{ title, sub?, actions?, className? }` |
| `StatCard` | `{ label, value: string (pre-formatted), hint?, tone?: "neutral"\|"good"\|"warn"\|"bad"\|"accent", href?, className? }` |
| `StatusPill` | `{ tone?: "neutral"\|"info"\|"success"\|"warning"\|"danger"\|"accent", children, className? }` |
| `DataTable<T>` | `{ columns: DataColumn<T>[], rows: T[], rowKey: (row) => string, empty?, caption?, className? }` — `DataColumn<T> = { key, header, cell(row), className?, align?: "left"\|"right" }`. Scrolls inside `overflow-x-auto`; `min-w-[40rem]`. |
| `FormField` | `{ label, htmlFor, hint?, error?, required?, children, className? }` — pass the control as children with a matching `id`. |
| `INPUT_CLASS` | string — the 44px input/select style. |
| `Panel` | `{ title?, sub?, actions?, children, className? }` |
| `KeyValueList` | `{ items: { label, value }[], className? }` |
| `Pagination` | `{ page, pageSize, total, hrefFor(page) => string, className? }` |
| `fmtDateTime(d)`, `fmtDuration(seconds)`, `fmtPercent(ratio)` | IST formatting helpers |

The console agent created its own `_components/inquiry/status-pill.tsx`; both `StatusPill`s coexist (different import paths). Consolidation is a follow-up, not a conflict.

### `src/app/admin/_lib/guard.ts` (server)
`requirePage(permission?)` → `ResolvedSession`. Unauthorized → `redirect("/admin/login")`; Forbidden → `redirect("/admin?denied=<permission>")`. Not for Server Actions.

## 6. Deviations from the contract

1. **`adminRepo.list()` is read from a page and from `GET /api/admin/users`.** `authService` has no list method; §19 §1 says routes must not import repositories. Kept the import to the one route and the users page; see Requests #1.
2. **`audit.repo.ts` ownership.** My brief named it mine; §19 §8 gives it to the Database agent, whose version landed on disk while I worked. I adopted theirs (`AuditRow` with resolved `actorName`, string dates, `from`/`to` as ISO strings) and did not rewrite it. Their file has no `entityTypes()`; the audit page uses a static datalist of known entity types instead of a distinct query.
3. **`_lib/guard.ts` and `_actions/result.ts`** are new files outside the listed ownership paths but under `src/app/admin/**`, which no other agent claims for these names.
4. **Header/Footer** — the requested "return null under /admin" is done for Header in place; Footer via the `StorefrontOnly` client gate so it stays a Server Component (no bundle growth on the storefront).
5. **21st.dev** — not consulted. The shell and table are hand-built on OUTLYY tokens; the header comments say so, and no external pattern is cited.

## 7. Requests

1. **Auth (Backend Architect):** add `authService.listUsers(actor)` (requires `users.manage`, returns `AdminUserRecord[]`) so the users page and `GET /api/admin/users` stop importing `adminRepo`.
2. **Catalogue (Backend Architect / Rathin):** `catalogService.listProducts()` could include `mappings: { supplier: { source, adapter }, isActive }` (or a boolean `hasApiMapping`) so the products page can show "instant-eligible" before the flip is attempted instead of surfacing the 409 afterwards.
3. **Database:** consider `auditRepo.entityTypes()` (distinct `entity_type`) for the audit filter; cheap with the existing entity index.
4. **Agent Console:** if you want the `?denied=` banner behaviour on `/admin/inquiries`, call `requirePage("inquiries.view_own")` from `_lib/guard.ts` instead of `requireCookies` directly.
5. **Security review:** `safeNext()` in `(auth)/auth-client.tsx` is the only open-redirect guard for `?next=`; the proxy sets `next` to the raw pathname. Worth a second look.
