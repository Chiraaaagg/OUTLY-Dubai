# Admin console — operator guide

`/admin` (sign in with work email + password, then the authenticator code). Every page checks its permission server-side; the left rail only hides what you cannot use.

| Page | What you do there | Permission |
|---|---|---|
| **Inquiries** `/admin/inquiries` | The queue: claim, assign/reassign/release, contact, quote, move status, add notes, mark spam, convert to order, resend notifications, see the timeline. Filters: status tab, search, agent (me/unassigned/all), breached, sort. | signed in (`inquiries.view_own`; `view_all` for other agents' work) |
| **Dashboard** `/admin` | Queue tiles, SLA, 7-day metrics. | signed in |
| **Activities** `/admin/activities` | Create / edit / duplicate / publish / unpublish / archive / delete / restore listings, version history, rollback. See `activities.md`. | `products.edit`, `products.publish`, `products.delete` |
| **Categories** `/admin/categories` | Edit the eight categories (copy, hero, featured, FAQ), publish/unpublish, delete when empty. | `categories.edit` |
| **Imports** `/admin/imports` | CSV / Google Sheet / Google Doc / bulk JSON → preview → import → revert. See `imports.md`. | `imports.run` |
| **Fulfilment** `/admin/products` | THE HINGE — per-SKU inquiry ↔ instant switch (needs an API supplier mapping). | `products.publish` |
| **Analytics** `/admin/analytics` | Daily inquiries / WhatsApp clicks / activity views, funnel, sources, status changes, top activities, agent performance. Date range picker. | `analytics.view` |
| **Users** `/admin/users` | Create staff, roles, shifts, skills, availability, reset password/MFA. | `users.manage` |
| **Settings** `/admin/settings` | SLA, routing, follow-up ladder, price tolerance. | `settings.edit` |
| **Audit** `/admin/audit` | Every admin/agent action with before/after, filterable. | `audit.view` |

## Roles

| Role | Can |
|---|---|
| Administrator | everything |
| Operations | inquiries (all), catalogue incl. publish/delete/imports, fulfilment flip, reports, analytics, audit |
| Agent lead | inquiries (all, assign), reports, analytics |
| Agent | own inquiries: claim, update, notes, spam, convert |
| Finance | orders/payments/refunds, reports, analytics, audit |
| Content | edit activities (drafts), categories, imports — cannot publish or delete |
| Read-only | view inquiries/orders/reports/analytics |

## First run

```
npm run db:migrate
npm run db:seed        # roles/permissions, bootstrap admin, categories, 28 activities with full content, settings
```

Sign in with `ADMIN_BOOTSTRAP_EMAIL`; enrol the authenticator on first login. Re-running the seed never overwrites listings that have been edited in the console.

## Where the storefront gets its content

Published activities and categories in the database. A save in the console invalidates the storefront cache immediately; worst case a page is 60 s stale. Drafts and archived/deleted listings are invisible to customers (their URLs 404).
