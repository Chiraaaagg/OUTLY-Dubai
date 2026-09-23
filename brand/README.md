# OUTLYY brand asset pack

Route A, "break-out O": the O of OUTLYY opens at the top right and the sun steps out of it. The same shape works as the wordmark's O, the favicon, the app icon, the WhatsApp image and the agent avatar ring.

Everything in the pack is generated from one set of geometry by the build scripts in `_build/`. All text is outlined, so no file depends on an installed font.

---

## 1. Asset inventory

| # | Asset | Tier | Files | Status |
|---|---|---|---|---|
| 1 | Primary logo (horizontal) | 1 | `01-logo/svg/outlyy-logo-primary.svg`, `…-primary-mono.svg`, PNG at 240/480/960/1920w | Done |
| 2 | White logo | 1 | `01-logo/svg/outlyy-logo-white.svg`, `…-white-mono.svg`, PNGs | Done |
| – | Logo on Sun ground | 1 | `01-logo/svg/outlyy-logo-on-sun.svg`, PNGs | Done (extra) |
| 3 | Logomark | 1 | `02-logomark/svg/outlyy-mark*.svg` (64-grid master + 16px hinted master, in 5 colourways), PNG at 64–1024 | Done |
| 4 | Favicon set | 1 | `03-favicon/favicon.ico` (16+32+48), `favicon-16/32/48.png`, `icon.svg` | Done |
| 5 | Apple touch icon | 1 | `04-app-icons/apple-touch-icon.png` (180×180) | Done |
| 6 | Android / PWA icons | 1 | `04-app-icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `manifest.webmanifest` | Done |
| 7 | Default OG image | 1 | `05-og/og-default.png` (1200×630), SVG master | Done |
| 8 | WhatsApp Business profile | 1 | `06-whatsapp/outlyy-whatsapp-640.png` (Sun ground), `…-640-ink.png` (alternative) | Done |
| 9 | Email header logo | 2 | `07-email/outlyy-email-header@1x/2x/3x.png` (on Sand), transparent variants | Done |
| 10 | Voucher / invoice lettermark | 2 | `08-voucher/svg/outlyy-lettermark*.svg`, `outlyy-voucher-lockup*.svg`, PNGs, black print versions | Done |
| 11 | OG templates | 2 | `09-og-templates/og-activity / og-category / og-collection-template` (SVG + PNG) | Done (templates with [placeholders]) |
| 12 | Empty-state illustrations | 2 | `10-empty-states/outlyy-empty-{saved,bookings,inquiries,search,filters,cart,offline,notifications}.svg` + @2x PNG | Done |
| 13 | Verified Supplier badge | 2 | `11-badges/outlyy-verified-supplier.svg`, `…-mono.svg`, `…-chip.svg`, PNGs | Done. **Not placed in product** |
| 14 | Agent avatar frame | 2 | `12-agent-avatar/outlyy-agent-frame-{96,48,32}-{online,away}.svg`, example | Done |
| 15 | Loading indicator | 3 | `13-loader/outlyy-loader.svg`, `outlyy-loader-white.svg` (CSS-animated SVG) | Done |
| 16 | 404 illustration | 3 | `14-404/outlyy-404.svg`, @2x PNG | Done |
| 17 | Dark-mode favicon | 3 | `03-favicon/icon.svg` (adaptive), `icon-dark.svg`, `icon-light.svg` | Done |
| 18 | Social avatars | 3 | `15-social/outlyy-avatar-instagram-1080.png`, `-x-400.png`, `-linkedin-400.png`, Ink alternative | Done |
| – | Drop-in code | – | `16-implementation/src/components/layout/logo.tsx`, `src/app/manifest.ts`, `src/app/brand-motion.css` | Ready to review |

---

## 2. File structure

```
outlyy-brand/
├── README.md                     ← this file
├── OUTLYY-brand-asset-book.pdf   ← visual reference, 10 pages
├── 01-logo/          svg/ (5 masters) · png/ (4 widths each)
├── 02-logomark/      svg/ (64-grid + 16px hinted × 5 colourways) · png/ (64–1024)
├── 03-favicon/       favicon.ico · favicon-16/32/48.png · icon.svg · icon-light.svg · icon-dark.svg
├── 04-app-icons/     apple-touch-icon.png · icon-192/512.png · icon-512-maskable.png · manifest.webmanifest · svg/
├── 05-og/            og-default.png · svg/
├── 06-whatsapp/      outlyy-whatsapp-640.png · outlyy-whatsapp-640-ink.png · svg/
├── 07-email/         outlyy-email-header@1x/2x/3x.png · transparent variants · svg/
├── 08-voucher/       svg/ lettermark (ink, sun, print-black) · voucher lockup (colour, print-black) · png/
├── 09-og-templates/  og-activity/category/collection-template.png · svg/
├── 10-empty-states/  8 × .svg · png/ @2x
├── 11-badges/        verified-supplier (.svg, mono, chip) · png/
├── 12-agent-avatar/  frames 96/48/32 × online/away · example-initials · png/
├── 13-loader/        outlyy-loader.svg · outlyy-loader-white.svg
├── 14-404/           outlyy-404.svg · png/
├── 15-social/        instagram-1080 · x-400 · linkedin-400 · master-1080 · ink-1080 · svg/
├── 16-implementation/src/…  drop-in code (mirrors the repo paths)
└── _build/           lib.py · build_tier1.py · build_tier23.py (regenerate everything)
```

**Naming:** `outlyy-<asset>[-<variant>][-<size>].<ext>`. Sizes are px (`-512`) or width (`-960w`), and `@2x`/`@3x` mark density. SVG masters sit in `svg/` subfolders wherever a PNG export exists.

---

## 3. Usage guide

### The mark
- **Construction (64 grid):** the ring is centred at (30, 34) with radius 19 and a 10-unit stroke, open 90° at the top right with round caps. The sun is centred at (49, 15) with radius 9. The ink bounding box runs from 6 to 58, so the mark is optically centred.
- **16px master:** `*-16px.svg` uses a 16-unit grid with a heavier ring (2.8) and a larger sun (r 2.4). Use it for anything rendered at 24px or smaller.
- **Clear space:** keep a gap equal to the sun's diameter on every side.
- **Minimum size:** 16px for the mark alone using the 16px master. The wordmark needs at least 88px width on screen or 22mm in print.

### Colourways (only these)

| Ground | Ring and letters | Sun | File suffix |
|---|---|---|---|
| Sand `#FFF8F0` / Paper `#FFFFFF` | Ink `#14101F` | Sun `#FF6A13` | `primary`, `mark` |
| Ink or dark photo | Paper `#FFFFFF` | Sun `#FF6A13` | `white` |
| Sun `#FF6A13` | Ink | Paper | `on-sun` |
| One-colour (emboss, fax, stamp) | Ink or white | same as ring | `mono` |
| Black-and-white print | Black | White knockout | `print-black` |

### Colour rules
1. Brand assets use only the five brand colours (Ink, Sun, Paper, Sand, Lagoon) plus their existing tints from `globals.css` (sun-100, lagoon-100, ink-300/400/600). Dune and Sunset stay product-only, for ratings and deals.
2. **One sun per asset.** It's always Sun orange, except on a Sun ground where it turns white.
3. **Lagoon means trust**: verified, confirmed, secure. It's never decoration.
4. Don't recolour, gradient-fill, outline, shadow, rotate or stretch the mark. The only rotation allowed is inside the Verified stamp.

### Motifs (from the 21st.dev review)

| Motif | Source pattern | Where |
|---|---|---|
| **Sticker** (−8° to +8°, 1.5–3px Ink border, hard 2–4px Ink offset shadow) | designali-in *Sticker* and the existing `sticker` utility | OG, social, category chips |
| **Ticket stub** (notches and dashed perforation) | *Admit One Ticket* / *Ticket Confirmation Card* | OG templates, voucher lettermark |
| **Stamp** (serrated edge, curved type) | designali-in *Stamp* | Verified Supplier |
| **Fanned tiles** (−8° / 0 / +8°) | serafimcloud *Empty State* | Empty states, category OG |
| **Arc ring and status sun** | originui / shadcn *Avatar* | Agent avatar frame |

### Illustration rules (empty states, 404)
- Icons are drawn on a 24-grid with 2px Ink strokes and round caps and joins, and no fills except Paper tiles.
- Only the **centre tile carries the sun**, as a 1-dot accent at its top right that echoes the mark.
- Everything is transparent and drawn to sit on Sand. The soft floor shadow is Ink at 6%.
- Don't add gradients, 3D, people, globes, pins, planes or palms.

### Motion language

| Name | What | Timing |
|---|---|---|
| Sun out | The sun nudges up and to the right on logo hover or focus | 280ms, `--ease-spring` |
| Draw on | Arcs draw in with stroke-dashoffset (loader, first reveal) | 400–770ms, `--ease-out-soft` |
| Sticker drop | Chips land using the existing `pop-in` animation | 280ms, `--ease-spring` |
| Reduced motion | The loader becomes a static mark with an opacity pulse. Everything else is static | – |

Never use spinning suns, bounce loops or parallax skies.

### Per-asset notes
- **Favicon PNGs and ICO** sit on a Sand rounded tile so they stay visible on dark tab strips. **icon.svg** is transparent and switches the ring to white under `prefers-color-scheme: dark`.
- **WhatsApp and social avatars** put the mark on a Sun ground at 50% of the canvas, so it's safe inside any circle crop. Use the same image on every channel. The Ink version is an alternative only.
- **Email header**: use the Sand-baked PNG (it matches the `#FFF8F0` email body). The transparent version is for white templates only, because dark-mode clients can make Ink letters disappear.
- **Voucher and invoice**: use `outlyy-voucher-lockup` in the voucher header and `outlyy-lettermark` in the invoice corner or PDF footer. Use the `print-black` versions for monochrome printers.
- **OG templates**: the `[bracketed]` fields are slots. Don't ship the template PNGs as-is.
- **Verified Supplier** is an asset only and isn't placed anywhere. The seal (64–160px) goes on supplier pages; the chip (24px tall) goes on cards.
- **Agent frame**: the photo or initials circle sits at r40 inside the 112-unit grid (about 71% of the frame). The sun is the online dot and turns Ink-400 when the agent is away.

---

## 4. Export checklist

- [x] Every wordmark and all text converted to outlines (Bricolage Grotesque opsz 36 / 800, and Plus Jakarta Sans 600–800)
- [x] SVG masters have transparent backgrounds except app icons, OG images and avatars, which need a ground
- [x] Mark drawn as filled paths, not strokes, so it renders the same in every renderer
- [x] 16px hinted master checked at true pixel size on light and dark tab backgrounds
- [x] favicon.ico holds 16, 32 and 48 frames
- [x] apple-touch-icon is 180×180 with the mark at 60% of the canvas
- [x] Maskable icon keeps its ink inside the 40% radius safe circle
- [x] OG images are 1200×630
- [x] WhatsApp image is 640×640 with the mark at 50%, safe for a circle crop
- [x] `₹` renders (it comes from the latin-ext subset; see implementation note 6)
- [x] Voucher lockup has a pure-black print version
- [ ] **You to verify:** current platform avatar specs for Instagram, X and LinkedIn. I exported 1080 and 400, and I'm not certain of each platform's current recommended size.
- [ ] **You to verify:** SVG-favicon behaviour in Safari. The ICO fallback covers it either way.
- [ ] **You to verify:** that the loader's reduced-motion media query takes effect when the SVG is loaded via `<img>` in your target browsers. Inline SVG is the safe option.

---

## 5. Implementation notes for the existing codebase

Nothing in the repo has been changed. These are the steps to adopt the pack, in order.

1. **Static files → `public/`** (it's empty today):
   `favicon.ico`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`, `brand/outlyy-email-header@2x.png`, `brand/outlyy-lettermark.svg`, and `brand/outlyy-voucher-lockup.svg`.
2. **Metadata file conventions → `src/app/`**: copy `03-favicon/icon.svg` to `src/app/icon.svg`, `04-app-icons/apple-touch-icon.png` to `src/app/apple-icon.png`, and `05-og/og-default.png` to `src/app/opengraph-image.png` (add `opengraph-image.alt.txt` containing "OUTLYY — things to do in Dubai, priced in rupees"). Next generates the `<link>` and `og:image` tags from these filenames. Please check these conventions against the Next 16 docs.
3. **Manifest**: add `16-implementation/src/app/manifest.ts`. I found no manifest in the repo, even though the brief mentions an existing one.
4. **Logo**: replace `src/components/layout/logo.tsx` with `16-implementation/src/components/layout/logo.tsx`. It keeps the same `Logo({ className, tone, href })` API, so `header.tsx`, `footer.tsx` and `admin/_components/shell.tsx` don't need changes. It also exports `Wordmark` and `BrandMark`. It drops the unused `SunBurst`, so check that nothing imports it (grep found no usages). Then append `brand-motion.css` to `globals.css`.
5. **Email** (`server/notifications/templates.ts:186`): replace the text `<div>OUTLYY</div>` with
   `<img src="${siteUrl}/brand/outlyy-email-header@2x.png" width="208" height="48" alt="OUTLYY" style="display:block;border:0;margin-bottom:16px">`.
   This needs an absolute URL; `siteConfig.siteUrl` already exists.
6. **Font subset bug found during the audit**: `layout.tsx` loads both fonts with `subsets: ["latin"]`, and the latin subset has **no ₹ glyph**, so every rupee price on the site currently falls back to a system font. Add `"latin-ext"` to both `subsets` arrays. The cost is a little extra font weight, so measure it against your LCP budget.
7. **Empty states**: `EmptyState` in `components/ui/primitives.tsx` takes an `icon` today. Add an optional `illustration` prop that renders `/brand/empty/outlyy-empty-<name>.svg` at 320×200, `alt=""`.
8. **404**: in `app/not-found.tsx`, swap `<Scene src="dune-calm" />` for `<img src="/brand/outlyy-404.svg" width="480" height="220" alt="">` and keep the rest of the recovery page as it is.
9. **Agent avatar** (`AgentCard`): wrap the photo or initials in `outlyy-agent-frame-<size>-<online|away>.svg` as an absolutely-positioned overlay. The photo circle is 71% of the frame, centred 2% below the middle.
10. **Loader**: use `outlyy-loader.svg` inline for full-page waits over 400ms. Keep the skeleton shimmer for lists.
11. **OG per route**: add `opengraph-image.tsx` in `activities/[slug]`, `categories/[slug]` and `collections/[slug]`, using `ImageResponse` from `next/og` and following the 09 template layouts. `ImageResponse` needs fonts passed as ArrayBuffers, so load the `.woff`/`.ttf` files (next/og doesn't accept woff2, as far as I know; please verify). I haven't written or tested this route code; the SVG templates are the spec.
12. **WhatsApp**: set `NEXT_PUBLIC_WHATSAPP_NUMBER=971588256515` (from the brief) and upload `06-whatsapp/outlyy-whatsapp-640.png` in WhatsApp Business → Profile.
13. **Verified Supplier**: don't wire it up until it's approved. When it is, put the chip in `components/commerce/trust.tsx`.

## 6. Regenerating

```
pip install fonttools uharfbuzz cairosvg brotli pillow
npm pack @fontsource-variable/bricolage-grotesque @fontsource-variable/plus-jakarta-sans   # then untar; paths are at the top of _build/lib.py
python3 _build/build_tier23.py      # also runs tier 1
```
