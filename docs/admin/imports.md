# Importing listings

`/admin/imports` (permission `imports.run`). Four sources, one pipeline:

```
source ──▶ parse ──▶ map columns ──▶ PREVIEW (validate every row) ──▶ APPLY (one transaction) ──▶ batch page ──▶ REVERT
```

Nothing touches `products` until you click **Import**. Every run is a batch you can open later and revert.

## Sources

| Method | How | Notes |
|---|---|---|
| **CSV** | Upload a `.csv` (≤ 5 MB, ≤ 500 rows). | Download the template from the wizard (**Download the template / current catalogue as CSV**) — it is the full catalogue in the exact column format, so editing it and re-uploading is a bulk update. |
| **Google Sheet** | Paste the sheet link, click **Fetch columns**, adjust the mapping, preview. | Share the sheet as *Anyone with the link → Viewer*. Accepted: `https://docs.google.com/spreadsheets/d/<id>/…` and "Publish to the web" links (`/d/e/…/pub`). A `gid` in the link selects that tab; without one the first tab is exported. An uploaded `.xlsx` must first be opened and saved as a Google Sheet (Drive `/file/d/…` links are refused with that hint). No Google credentials are needed. |
| **Google Doc** | Paste the doc link (shared the same way) or paste the text. | Headings become fields (see below). Produces **one draft** listing. |
| **Bulk JSON** | Paste a JSON array of activity objects (the same shape the API accepts). | Create or update many at once; ≤ 500 items. |

Manual creation (method 1) is `/admin/activities/new`.

## Column mapping (CSV / Sheet)

Headers are matched automatically to fields by name and by common aliases (`Activity Name → title`, `Price (INR) → price.adult.inr`, `What's included → inclusions`, `Duration → durationMinutes`, …). Anything unmatched can be set by hand in step 2. Required for a **new** listing:

`title`, `categorySlug` (must exist in `/admin/categories`, see vocabulary below), `location`, `price.adult.inr`, `price.adult.aed`. Everything else is derived when blank (slug from title, subtitle from the first inclusion, meeting point from the location, cancellation policy from the hours, SEO from title/subtitle) and flagged as a note.

### Vocabulary — what the parser maps for you

Operators fill the template with the words their supplier uses. Every mapping is shown as a **note** on the row in the preview so nothing is silent:

| Column | Accepted spellings → stored value |
|---|---|
| `tier` | `A–E`, `Tier B`; words: attraction/ticket/budget → A, standard/tour → B, premium/combo → C, luxury/vip/private → D, transfer/sim → E. Blank → B (note). Anything else → error. |
| `categorySlug` | a live category slug or name; common supplier names are mapped (`dhow-cruise` → cruises-yachts, `water-parks` → theme-parks, `city-tours` → dubai-city-tours, `burj-khalifa-tickets` → dubai-attractions, …); otherwise keywords in the category text, then in the title (`… Buggy Ride` → desert-safari). Unresolved → error listing the valid slugs — create the category first on `/admin/categories`. |
| `confirmation` | "Instant Confirmation" → instant; "On request", "Confirmation within 24hrs", "voucher by email" → manual. Blank → manual. |
| `dietary` | free text scanned for veg / jain / halal / non-veg; unmatched text becomes `mealNote` if that is blank. |
| `suitability` | free text scanned for kids / seniors / wheelchair / infant / couples / groups (negations such as "not recommended for kids" are ignored); unmatched lines (age limits, medical notes) are appended to `importantInfo`. |
| `price.*` | decimals are rounded to whole rupees/dirhams (`1450.05` → 1450). |
| `durationMinutes` | minutes, `2h 30m`, `1.5h`, `1 day`; blank → 0 = "not stated" (storefront shows "Duration on request"). |
| `imageAlt` | a `|` list keeps the first item; trimmed to 200 characters at a word boundary. |
| `images` | spaces inside URLs are percent-encoded; `http://` and non-URL text are errors. |
| `timeSlots` | items over 80 characters are moved to `importantInfo`. |
| `supplier.source` | "raynatours.com" → rayna; "direct"/"own contract" → direct; other domains/portals → portal. |
| `badges` | "New" → newlyAdded, "Bestseller" → bestseller, "Editor's pick" → editorPick, "Selling fast" → sellingFast; other words ("Mobile Voucher Accepted") are ignored. |
| `freeCancellationHours` | blank → read from the policy text ("Non refundable" → 0, "48 hours" → 48), else 24. |
| `cancellationPolicy` | blank → written from the hours ("Free cancellation up to 24 hours before…"). |
| `subtitle` | blank → the first inclusion (or a placeholder) — flagged; rewrite before publishing. |
| `meetingPoint` | blank → the location — flagged. |

Cell formats:

- Lists (`inclusions`, `exclusions`, `importantInfo`, `images`, `timeSlots`, `pickupZones`, `dietary`, `suitability`, `relatedSlugs`, `comboSlugs`, `seo.keywords`, `secondaryCategorySlugs`, `collectionSlugs`): items separated by `|` (or new lines inside a quoted cell).
- Booleans (`pickupIncluded`, `isPrivate`, `mobileVoucher`, `quoteOnly`): `yes/no`, `true/false`, `1/0`.
- `durationMinutes`: `150`, `2h 30m`, `1.5h`, `1 day`.
- Money: whole rupees/dirhams; `₹2,990` is accepted.
- `faqs`: `Question? :: Answer | Question? :: Answer` (or a JSON array).
- `itinerary`: `09:00 :: Pickup :: detail | 10:30 :: Dunes :: detail` (or JSON).
- `variants`: `id :: Name :: deltaInr :: deltaAed :: blurb` or JSON; `addOns`: `id :: Name :: inr :: aed :: perPerson :: category :: description` or JSON.
- `images`: `https://…` URLs or `img:activity:<slug>:<n>` refs (Pexels-backed).

A row whose `slug` already exists becomes an **update** (new version of that listing); otherwise a **create** (draft, or published if you tick *Publish new listings immediately* and hold `products.publish`).

## Google Doc structure

```
Sunset Dhow Cruise            ← first line = title (or "Title: …")
Subtitle: Two hours on the Marina with a veg buffet
Category: Cruises & Yachts
Tier: B
Price: 1990
Price AED: 89
Duration: 2 hours
Location: Dubai Marina
Meeting point: Marina Walk, pier 7

Highlights
- Live tanoura show
Inclusions
- Buffet dinner (veg & Jain on request)
Exclusions
- Alcohol
Important info
- Dress code is smart casual
Cancellation policy
Free cancellation until 24 hours before.
FAQ
Is the food Jain? :: Yes, on request at booking.
Itinerary
19:30 :: Boarding :: Marina Walk pier 7
SEO title / SEO description / Keywords / Related / Combos / Add-ons / Variants / Dietary / Suitable for / Time slots / Pickup zones / Supplier / Meal note
```

Recognised headings are case-insensitive and may end with a colon or be Markdown `##` headings. Missing sections are reported as warnings; the row still validates if the required fields are present.

## Validation and errors

Failed rows show the offending **cell value** next to each error. Every row is validated with the same strict schema as the manual form (`src/server/schemas/activity.schema.ts`): unknown keys rejected, lengths capped, slugs `^[a-z0-9-]+$`, money non-negative integers, https-only image URLs, category must exist, duplicate slugs inside one file flagged, slugs belonging to a deleted listing refused (restore it instead). Errors are shown per row with the field path.

**Missing categories:** rows whose only problem is an unknown category are held back; tick *Create the missing categories as drafts* on the apply step to create them (hidden from the storefront until published on `/admin/categories`) and import those rows in the same transaction.

**Apply** writes the whole batch in one transaction with a fixed number of queries (bulk inserts), so hundreds of rows take seconds, not minutes.

**Apply** is all-or-nothing: if any row fails validation or the transaction hits a conflict (for example a slug created by someone else between preview and apply), nothing is written and the batch is marked `failed`. Tick *Skip the failed rows* to import only the valid ones.

## Revert

On the batch page, **Revert this import**: updated listings get a new version equal to the version they had before the import; created listings are soft-deleted (their slug stays reserved; restore from `/admin/activities?status=deleted`). Audited as `import.revert`.

## API

`POST /api/admin/imports/preview` (JSON or multipart `file`), `POST /api/admin/imports/fetch` (`{ url }`), `POST /api/admin/imports/:id/apply` (`{ partial?, publish?, reason? }`), `POST /api/admin/imports/:id/revert`, `GET /api/admin/imports`, `GET /api/admin/imports/:id`, `GET /api/admin/imports/export` (CSV). Budget: 20 preview/apply/revert/fetch calls per hour per user.
