/**
 * Turn the exported Holiday Planner Google-review sheet into
 * `src/lib/data/sister-reviews.ts`.
 *
 * These are real reviews of a *different* company in the same group, so the
 * rules are strict and enforced here rather than left to whoever edits the
 * page later:
 *
 *  - first name + surname initial only; no full names
 *  - reviewer profile links are dropped entirely (we have no permission to
 *    link a stranger's Google profile from a commercial page)
 *  - review photos are dropped (no permission to reproduce them)
 *  - nothing is attached to an OUTLYY activity, ever — these can never become
 *    a per-listing rating or an AggregateRating
 *  - the branch stays on the record so the page can say which office
 *
 * Usage: node scripts/build-sister-reviews.mjs <exported.csv> [capturedOn]
 */
import fs from "node:fs";
import path from "node:path";

const IN = process.argv[2];
const CAPTURED_ON = process.argv[3] ?? new Date().toISOString().slice(0, 10);
const OUT = path.join("src", "lib", "data", "sister-reviews.ts");
if (!IN) {
  console.error("usage: node scripts/build-sister-reviews.mjs <exported.csv> [YYYY-MM-DD]");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "Karishma Singhal" → "Karishma S."; a single word stays as-is. */
function displayName(raw) {
  const parts = raw.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (!parts.length) return "A traveller";
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  if (parts.length === 1) return first;
  return `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

/** "3 weeks ago (edited)" → an approximate ISO month, anchored on the capture date. */
function approxDate(label, capturedOn) {
  const m = /^(a|an|\d+)\s+(day|week|month|year)s?\s+ago/i.exec(label.trim());
  const base = new Date(`${capturedOn}T00:00:00Z`);
  if (!m) return capturedOn.slice(0, 7);
  const n = /^(a|an)$/i.test(m[1]) ? 1 : Number.parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const days = unit === "day" ? n : unit === "week" ? n * 7 : unit === "month" ? n * 30 : n * 365;
  const at = new Date(base.getTime() - days * 86_400_000);
  return at.toISOString().slice(0, 7);
}

const rows = parseCsv(fs.readFileSync(IN, "utf8"));
const header = rows[0].map((h) => h.trim());
const col = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
const C = {
  business: col("Business Name"),
  location: col("Location"),
  name: col("Reviewer Name"),
  stars: col("Star Rating"),
  date: col("Review Date"),
  text: col("Review Text"),
};
for (const [k, v] of Object.entries(C)) if (v < 0) throw new Error(`column missing: ${k}`);

const all = rows
  .slice(1)
  .filter((r) => r[C.name]?.trim() && r[C.text]?.trim())
  .map((r) => ({
    author: displayName(r[C.name]),
    branch: r[C.location].trim(),
    rating: Number.parseInt(r[C.stars], 10) || 0,
    month: approxDate(r[C.date], CAPTURED_ON),
    body: r[C.text].trim().replace(/\s+/g, " "),
  }))
  .filter((r) => r.rating >= 1 && r.rating <= 5);

/* --------------------------------------------------- the published subset */

// Only reviews that actually say something a reader can judge, and that are
// about the kind of trip OUTLYY sells. "Good service, thanks" proves nothing.
const MIN_BODY = 90;
const DUBAI = /dubai|abu ?dhabi|u\.?a\.?e\.?|emirat/i;

const published = all
  .filter((r) => r.body.length >= MIN_BODY)
  .filter((r) => DUBAI.test(r.body) || r.branch.toLowerCase() === "dubai")
  // Longest first, then most recent — then cap so the page stays readable.
  .sort((a, b) => b.month.localeCompare(a.month) || b.body.length - a.body.length)
  .slice(0, 24);

const byBranch = {};
for (const r of all) byBranch[r.branch] = (byBranch[r.branch] ?? 0) + 1;
const average = all.reduce((s, r) => s + r.rating, 0) / all.length;

const file = `import type { SisterReview } from "../types";

/**
 * GENERATED — do not edit by hand.
 * Source: the group's exported Google reviews for Holiday Planner.
 * Regenerate: node scripts/build-sister-reviews.mjs <export.csv> ${CAPTURED_ON}
 *
 * These are reviews of **Holiday Planner**, the sister company in the same
 * group — NOT of OUTLYY, which has not traded long enough to have its own.
 * Every surface that renders them must say so (see \`SisterBrandReviews\`).
 *
 * What the generator strips, and why:
 *  - surnames, so a reviewer is not fully identified on a page they never
 *    posted to
 *  - Google profile links, which we have no permission to republish
 *  - review photographs, same reason
 *
 * They are never attached to an OUTLYY listing and never feed a rating,
 * a review count or schema.org AggregateRating. Presenting another company's
 * reviews as your own product's rating is exactly what the CCPA's 2023 fake
 * review rules and the UAE consumer-protection law prohibit.
 */

/** When the export was taken — shown to the reader instead of a drifting "3 weeks ago". */
export const SISTER_REVIEWS_CAPTURED_ON = ${JSON.stringify(CAPTURED_ON)};

/** The company these reviews belong to. */
export const SISTER_BRAND = {
  name: "Holiday Planner",
  relationship: "our sister company in the same group",
  offices: ${JSON.stringify(Object.keys(byBranch).sort())},
} as const;

/** Verifiable aggregate across the whole export — about Holiday Planner, never about OUTLYY. */
export const sisterReviewStats = {
  total: ${all.length},
  average: ${average.toFixed(2)},
  byBranch: ${JSON.stringify(byBranch, null, 2).replace(/\n/g, "\n  ")},
} as const;

export const sisterReviews: SisterReview[] = ${JSON.stringify(published, null, 2)};
`;

fs.writeFileSync(OUT, file);
console.log(`read ${all.length} reviews · published ${published.length} · average ${average.toFixed(2)}`);
console.log(`branches: ${JSON.stringify(byBranch)}`);
console.log(`wrote ${OUT}`);
