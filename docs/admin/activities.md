# Managing activities and categories

## Activities — `/admin/activities`

| Action | Where | Permission | What happens |
|---|---|---|---|
| Create | **New activity** → editor → *Create draft* / *Create & publish* | `products.edit` (+ `products.publish` to publish) | New product row, version 1, supplier + mapping ensured, audit `activity.create` |
| Edit | Row title → editor → *Save changes* | `products.edit` | New version; optimistic concurrency — if someone saved in between you get a 409 and must reload |
| Duplicate | Row → *Duplicate* | `products.edit` | Draft copy `<slug>-copy[-n]`, title suffixed “(copy)”, badges cleared |
| Publish / Unpublish | Row → *Publish* / *Unpublish* | `products.publish` | `published` ↔ `draft`; sets `published_at` on first publish |
| Archive | Row → *Archive* | `products.publish` | Hidden from storefront, kept editable |
| Delete | Row → *Delete* → reason → *Confirm delete* | `products.delete` | Soft delete (`deleted_at`), slug reserved; visible under filter *Deleted* |
| Restore | Filter *Deleted* → *Restore* | `products.delete` | Back to `draft` |
| Roll back | Editor → *Version history* → *Restore* | `products.edit` | Writes a new version identical to the chosen one (history is never rewritten) |
| Fulfilment mode | `/admin/products` (Fulfilment) | `products.publish` | THE HINGE — unchanged; the editor shows it read-only |

Only `published` listings appear on the storefront and in `/api/catalog`; drafts and archived listings are invisible to customers but their URLs 404 rather than leak. The storefront updates immediately after a save (cache tag revalidation) and at worst within 60 seconds.

### Editor fields

Basics (name, slug, subtitle, tier, category, sub-categories, attraction, collections) · Pricing (adult/child/infant/senior/compare-at in ₹ and AED, quote-only) · Logistics (duration, cancellation window, location, meeting point, time slots, pickup zones, pickup/private/voucher flags, confirmation type, dietary, suitability) · Content (inclusions, exclusions, important info, cancellation policy, meal note, itinerary, FAQ) · Options (variants JSON, add-ons/upsells JSON, related activities, cross-sell combos) · Images (https URLs or `img:` refs, alt, video) · SEO (meta title, description, keywords) · Badges · Supplier (name, source, reliability, verified since) · Change note (kept in version history).

List fields use one item per line. Itinerary and FAQ use `a :: b :: c` lines. Variants and add-ons are JSON arrays (the hint under each box shows the shape). Every save is validated server-side; errors are shown next to the field and summarised at the top.

### List filters

Search (title, slug, location), status (`published`, `draft`, `archived`, `deleted`), tier, category. 25 per page.

## Categories — `/admin/categories`

Permission `categories.edit` to change; `products.edit` to view. Fields: name, short name, slug (fixed once created — slugs are permanent SEO URLs; a rename needs a redirect in `next.config.mjs`), emoji, tagline, intro, hero image, sort order, featured activity slugs, related category slugs, FAQ. Publish/unpublish hides a category from navigation and its page; delete is refused while any live activity still uses it.

## Retiring the whole catalogue

`node --env-file=.env.local scripts/retire-listings.mjs` (dry run) / `--apply` soft-deletes every seeded listing (`--all` for imported ones too). Reversible per listing from `/admin/activities?status=deleted`. The storefront renders an empty catalogue rather than falling back to the bundled fixtures; re-running the seed does **not** recreate retired listings.

## Where things are recorded

- `product_versions` — every state of every listing, with actor and reason.
- `audit_logs` — `activity.create|update|publish|unpublish|archive|delete|restore|duplicate|restore_version`, `category.*`, `import.*`.
- `/admin/audit` shows them.
