# Importing listings

`/admin/imports` (permission `imports.run`). Four sources, one pipeline:

```
source ──▶ parse ──▶ map columns ──▶ PREVIEW (validate every row) ──▶ APPLY (one transaction) ──▶ batch page ──▶ REVERT
```

Nothing touches `products` until you click **Import**. Every run is a batch you can open later and revert.

## Sources

| Method | How | Notes |
|---|---|---|
| **CSV** | Upload a `.csv` (≤ 5 MB, ≤ 500 rows). UTF-8, UTF-16 (Excel "Unicode text") and Windows-1252 (Excel "CSV") are read; comma, semicolon and tab delimiters are detected; title rows above the header row are skipped. | Two downloads in the wizard: **Blank template** (`/api/admin/imports/export?template=blank`, the header row: every importable column) and **Current catalogue as CSV** (every listing in the same columns — edit and re-upload to update). Both re-import without remapping. |
| **Google Sheet** | Paste the sheet link, click **Fetch columns**, adjust the mapping, preview. | Share the sheet as *Anyone with the link → Viewer*. Accepted: `https://docs.google.com/spreadsheets/d/<id>/…` (also the `/u/<n>/` form a browser signed into several Google accounts produces) and "Publish to the web" links (`/d/e/…/pub`). A `gid` in the link selects that tab; without one the first tab is exported. An uploaded `.xlsx` must first be opened and saved as a Google Sheet (Drive `/file/d/…` links are refused with that hint). No Google credentials are needed. |
| **Google Doc** | Paste the doc link (shared the same way) or paste the text. | Headings become fields (see below). Produces **one** row, created or (if its slug exists) updated like a sheet row. |
| **Bulk JSON** | Paste a JSON array of activity objects (the same shape the API accepts). | Create or update many at once; ≤ 500 items. Each item is a whole document (no merging). |

Manual creation (method 1) is `/admin/activities/new`.

## The import contract

One list of columns is shared by the template, the importer, the wizard and these docs: `IMPORT_FIELDS`, `IMPORT_REQUIRED`, `IMPORT_REQUIRED_ONE_OF` and `IMPORT_DERIVED` in `src/server/schemas/activity.schema.ts`. Every row is validated by the same strict schema as the manual editor (`activityInputSchema`); the importer never loosens it, it only turns spreadsheet words into schema values and says so.

**New listing** (no listing has the row's slug):

- Required — never filled in for you, a blank cell is an error on that row: `title`, `tier`, `categorySlug`, `location`, `price.adult.inr`, `price.adult.aed`, and one of `cancellationPolicy` / `freeCancellationHours`.
- Derived when blank, from the same row, always shown as a note. ⚑ = a person must check it, so the row stays a draft even if you tick *Publish immediately*:

| Blank cell | Becomes |
|---|---|
| `slug` | the title, slugified |
| `subtitle` ⚑ | the first inclusion (no inclusions → error) |
| `meetingPoint` ⚑ | the location |
| `images` ⚑ | a placeholder image ref |
| `imageAlt` | the title |
| `durationMinutes` | 0 = "not stated" (storefront shows "Duration on request") |
| `freeCancellationHours` | the hours stated in the policy text ("Non refundable" → 0, "48 hours" → 48); a policy with no hours is an error, never a guessed 24 |
| `cancellationPolicy` | written from the hours ("Free cancellation up to 48 hours before the activity; no refund after that.") |
| `seo.title` / `seo.description` / `seo.keywords` | the title / the subtitle / the title |
| `supplier.*` | "OUTLYY direct" (or, with a supplier name: source direct, reliability 80, verified this year) |

**Update** (the slug exists, or — with no slug column — the title slugifies to an existing slug, which the preview says): only the cells the row fills change. Blank and unmapped cells keep the listing's current value, so a sheet with five columns changes five fields. A list cell replaces the whole list. If someone saves the listing between preview and apply, apply refuses (409) — preview again.

**Populated cells are never dropped.** A cell that cannot be read (`"On request"` as a price, `"platinum"` as a tier, broken JSON in `variants`) is an error on that row showing the cell, not a silent blank that then gets a default.

## Column mapping (CSV / Sheet)

Headers are matched automatically: the canonical field name first (the template maps 1:1), then common aliases (`Tour Name`, `Activity Name → title`; `What's included → inclusions`; `Meeting Point / Pickup`, `Pickup Point → meetingPoint`; `Cancellation Terms`, `Refund Policy → cancellationPolicy`; …), then the same with bracketed hints removed (`Tier (A–E)`, `Subtitle (max 200)`, `Location *`). Price and duration headers carry their currency and unit: `Selling Price (AED)`, `Child Rate in Dirhams`, `Adult Price (₹)`, `Duration (hours)`. A price header with no currency (`Selling Price`) is read as INR and the preview says so; a header naming one currency mapped onto the other currency's price stops the preview. Columns with no field are listed as "Not imported". Anything can be remapped by hand in step 2; choosing a new file or link resets the mapping.

### Vocabulary — what the parser maps for you

| Column | Accepted → stored |
|---|---|
| `tier` | `A–E`, `Tier B`, `C - Combos`; words: attraction/ticket/budget → A, standard/tour → B, premium/combo → C, luxury/vip/private → D, transfer/sim → E. Anything else → error. Blank on a new listing → error. |
| `categorySlug` | a live category slug or name; common supplier names are mapped (`dhow-cruise` → cruises-yachts, `water-parks` → theme-parks, `city-tours` → dubai-city-tours, `burj-khalifa-tickets` → dubai-attractions, …); otherwise keywords in the category text, then in the title (`… Buggy Ride` → desert-safari, flagged ⚑). Unresolved → error listing the valid slugs (or create it as a draft on apply). `secondaryCategorySlugs` are resolved the same way; unknown ones are errors. |
| `price.*` | one amount per currency: `₹2,990`, `Rs. 3,400/-`, `From AED 150`, `INR 3400 per person`, `1,23,456`; decimals are rounded to whole rupees/dirhams (noted). A cell with both currencies (`AED 89 / ₹1,990`) fills a blank sibling column. `On request`, `150-200`, `150 + VAT` → error. INR and AED are both required; one is never converted from the other. An INR/AED pair far from the usual ₹-per-dirham ratio is flagged ⚑. |
| `durationMinutes` | minutes, `2h 30m`, `1.5h`, `1:30`, `2-3 hours` (the longer end), `1 day`; a bare number is minutes unless the header names hours/days (`Duration (hours)`). Words with no length (`Half day`, `Flexible`) → "not stated" and the words are kept in `importantInfo`. |
| `confirmation` | "Instant Confirmation" → instant; "On request", "Confirmation within 24hrs", "voucher by email" → manual. Blank → manual. Anything else → error. |
| yes/no columns | `yes/no`, `true/false`, `1/0`, `included`; a remark after the word is kept (`Yes, from Deira hotels` → pickup yes + "Pickup: from Deira hotels" in `importantInfo`). Anything else → error. |
| `dietary` | free text scanned for veg / jain / halal / non-veg; unmatched text becomes `mealNote` if the listing has none. |
| `suitability` | free text scanned for kids / seniors / wheelchair / infant / couples / groups (negations such as "not recommended for kids" are ignored); unmatched lines are appended to `importantInfo`. |
| `subtitle`, `seo.title`, `seo.description` | over the limit (200 / 120 / 320) → shortened at the last sentence end that fits, else at a word with "…" (noted). Titles, prices and policies are never shortened. |
| `inclusions`, `exclusions`, `importantInfo` | an item over the limit (300 / 300 / 600) is split at sentence ends (noted). |
| `imageAlt` | a `|` list keeps the first item; trimmed to 200 characters at a word boundary. |
| `images` | spaces inside URLs are percent-encoded; `http://` and non-URL text are errors. |
| `timeSlots` | items over 80 characters are moved to `importantInfo`; `16:00:00` (a time cell re-exported by Sheets) → `16:00`. |
| `supplier.source` | "raynatours.com" → rayna; "direct"/"own contract" → direct; other domains/portals → portal. |
| `badges` | "New" → newlyAdded, "Bestseller" → bestseller, "Editor's pick" → editorPick, "Selling fast" → sellingFast; other words are ignored. |
| slug lists (`relatedSlugs`, `comboSlugs`, `collectionSlugs`, `secondaryCategorySlugs`) | items are slugified (noted). |

Cell formats:

- Lists (`inclusions`, `exclusions`, `importantInfo`, `images`, `timeSlots`, `pickupZones`, `dietary`, `suitability`, `relatedSlugs`, `comboSlugs`, `seo.keywords`, `secondaryCategorySlugs`, `collectionSlugs`): items separated by `|` or new lines inside a quoted cell, or a JSON array of strings (the export uses one when an item contains `|`).
- `faqs`: `Question? :: Answer | Question? :: Answer` or a JSON array; questions are kept exactly as written.
- `itinerary`: `09:00 :: Pickup :: detail | 10:30 :: Dunes :: detail` (or JSON).
- `variants`: `id :: Name :: deltaInr :: deltaAed :: blurb` or JSON (a blank delta = same price); `addOns`: `id :: Name :: inr :: aed :: perPerson :: category :: description` or JSON — both add-on prices are required.
- The export writes `faqs`, `itinerary`, `variants`, `addOns` and `badges` as JSON so any text survives a round trip.

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

Recognised headings are case-insensitive, may end with a colon, be Markdown `##` headings or carry a hint (`Price (AED): 89`). `Price: AED 89 / ₹1,990` fills both prices. Missing sections are reported as warnings; the row is then validated like a sheet row (a missing tier or cancellation policy is an error).

## Validation and errors

Failed rows show the offending **cell value** next to each error. Rows marked **check first** are valid but carry a ⚑ derived value; they import, and stay drafts if the batch is published. Every row is validated with the same strict schema as the manual form (`src/server/schemas/activity.schema.ts`): unknown keys rejected, lengths capped, slugs `^[a-z0-9-]+$`, money non-negative integers, https-only image URLs, category must exist, duplicate slugs inside one file flagged, slugs belonging to a deleted listing refused (restore it instead). Errors are shown per row with the field path.

**Missing categories:** rows whose only problem is an unknown category are held back; tick *Create the missing categories as drafts* on the apply step to create them (hidden from the storefront until published on `/admin/categories`) and import those rows in the same transaction.

**Apply** writes the whole batch in one transaction with a fixed number of queries (bulk inserts), so hundreds of rows take seconds, not minutes.

**Apply** is all-or-nothing: if any row fails validation or the transaction hits a conflict (a slug created by someone else between preview and apply, or a listing edited since the preview), nothing is written and the batch is marked `failed`. Tick *Skip the failed rows* to import only the valid ones.

## Revert

On the batch page, **Revert this import**: updated listings get a new version equal to the version they had before the import; created listings are soft-deleted (their slug stays reserved; restore from `/admin/activities?status=deleted`). Audited as `import.revert`.

## API

`POST /api/admin/imports/preview` (JSON or multipart `file`), `POST /api/admin/imports/fetch` (`{ url }`), `POST /api/admin/imports/:id/apply` (`{ partial?, publish?, reason? }`), `POST /api/admin/imports/:id/revert`, `GET /api/admin/imports`, `GET /api/admin/imports/:id`, `GET /api/admin/imports/export` (CSV; `?template=blank` for the header row). Budget: 20 preview/apply/revert/fetch calls per hour per user.
