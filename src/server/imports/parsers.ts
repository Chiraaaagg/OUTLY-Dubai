import { DIETARY, IMPORT_FIELDS, SUITABILITY, type ActivityInput, type ImportField } from "../schemas/activity.schema";

/**
 * Pure parsers for the import wizard — no I/O, no database, fully unit-tested.
 *
 *  - `parseCsv`        RFC 4180-ish: quoted fields, doubled quotes, embedded
 *                      newlines, CRLF, UTF-8 BOM, ragged rows.
 *  - `suggestMapping`  header → ActivityInput field, by normalised name and a
 *                      table of common aliases (what a sheet built by ops
 *                      actually calls the columns).
 *  - `rowToInput`      mapped row → nested ActivityInput candidate. Lists are
 *                      `|`-separated; FAQ/itinerary/variants/add-ons accept
 *                      either JSON or a compact `q::a | q::a` notation.
 *  - `parseDocToDraft` Google Doc export text → draft, by section headings.
 *  - `toCsv`           ActivityInput[] → CSV with the canonical header (for
 *                      the template download and round-trips).
 */

/* ------------------------------------------------------------------ csv */

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      // swallow; \n follows
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const body = nonEmpty.slice(1).map((r) => {
    const out = r.map((c) => c.trim());
    while (out.length < headers.length) out.push("");
    return out.slice(0, headers.length);
  });
  return { headers, rows: body };
}

function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/* -------------------------------------------------------------- mapping */

export type Mapping = Partial<Record<ImportField, string | null>>;

const ALIASES: Record<string, ImportField> = {
  name: "title",
  activity: "title",
  activityname: "title",
  heading: "title",
  tagline: "subtitle",
  shortdescription: "subtitle",
  summary: "subtitle",
  category: "categorySlug",
  primarycategory: "categorySlug",
  subcategory: "secondaryCategorySlugs",
  subcategories: "secondaryCategorySlugs",
  secondarycategories: "secondaryCategorySlugs",
  attraction: "attractionSlug",
  collections: "collectionSlugs",
  collection: "collectionSlugs",
  image: "images",
  photos: "images",
  imageurls: "images",
  alt: "imageAlt",
  imagealt: "imageAlt",
  duration: "durationMinutes",
  durationmin: "durationMinutes",
  durationminutes: "durationMinutes",
  minutes: "durationMinutes",
  private: "isPrivate",
  pickup: "pickupIncluded",
  hotelpickup: "pickupIncluded",
  pickupzones: "pickupZones",
  zones: "pickupZones",
  freecancellation: "freeCancellationHours",
  freecancellationhours: "freeCancellationHours",
  cancellationhours: "freeCancellationHours",
  voucher: "mobileVoucher",
  mobilevoucher: "mobileVoucher",
  food: "dietary",
  diet: "dietary",
  suitablefor: "suitability",
  suitability: "suitability",
  area: "location",
  place: "location",
  meetingpoint: "meetingPoint",
  meeting: "meetingPoint",
  slots: "timeSlots",
  timeslots: "timeSlots",
  times: "timeSlots",
  price: "price.adult.inr",
  priceinr: "price.adult.inr",
  adultinr: "price.adult.inr",
  adultprice: "price.adult.inr",
  adultpriceinr: "price.adult.inr",
  priceaed: "price.adult.aed",
  adultaed: "price.adult.aed",
  adultpriceaed: "price.adult.aed",
  childinr: "price.child.inr",
  childprice: "price.child.inr",
  childpriceinr: "price.child.inr",
  childaed: "price.child.aed",
  childpriceaed: "price.child.aed",
  infantinr: "price.infant.inr",
  infantaed: "price.infant.aed",
  seniorinr: "price.senior.inr",
  senioraed: "price.senior.aed",
  compareatinr: "price.compareAt.inr",
  gateprice: "price.compareAt.inr",
  compareataed: "price.compareAt.aed",
  quoteonly: "quoteOnly",
  included: "inclusions",
  includes: "inclusions",
  whatsincluded: "inclusions",
  excluded: "exclusions",
  excludes: "exclusions",
  notincluded: "exclusions",
  highlights: "inclusions",
  description: "importantInfo",
  importantinfo: "importantInfo",
  knowbeforeyougo: "importantInfo",
  notes: "importantInfo",
  policy: "cancellationPolicy",
  cancellation: "cancellationPolicy",
  cancellationpolicy: "cancellationPolicy",
  policies: "cancellationPolicy",
  meal: "mealNote",
  mealnote: "mealNote",
  faq: "faqs",
  faqs: "faqs",
  related: "relatedSlugs",
  relatedactivities: "relatedSlugs",
  crosssells: "comboSlugs",
  combos: "comboSlugs",
  packages: "comboSlugs",
  upsells: "addOns",
  addons: "addOns",
  extras: "addOns",
  supplier: "supplier.name",
  suppliername: "supplier.name",
  supplierid: "supplier.id",
  suppliersource: "supplier.source",
  reliability: "supplier.reliability",
  supplierreliability: "supplier.reliability",
  verifiedsince: "supplier.verifiedSince",
  seotitle: "seo.title",
  metatitle: "seo.title",
  seodescription: "seo.description",
  metadescription: "seo.description",
  keywords: "seo.keywords",
  seokeywords: "seo.keywords",
  badges: "badges",
  confirmation: "confirmation",
  confirmationtype: "confirmation",
};

function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function suggestMapping(headers: string[]): Mapping {
  const byNorm = new Map<string, string>();
  for (const h of headers) if (!byNorm.has(norm(h))) byNorm.set(norm(h), h);
  const out: Mapping = {};
  const used = new Set<string>();
  // Exact field names first (a CSV we exported ourselves maps 1:1).
  for (const f of IMPORT_FIELDS) {
    const h = byNorm.get(norm(f));
    if (h && !used.has(h)) {
      out[f] = h;
      used.add(h);
    }
  }
  for (const h of headers) {
    if (used.has(h)) continue;
    const f = ALIASES[norm(h)];
    if (f && !out[f]) {
      out[f] = h;
      used.add(h);
    }
  }
  for (const f of IMPORT_FIELDS) if (!(f in out)) out[f] = null;
  return out;
}

/* ------------------------------------------------------------ row → input */

function splitList(v: string): string[] {
  return v
    .split(/\s*\|\s*|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toBool(v: string): boolean | undefined {
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return undefined;
}

function toNumber(v: string): number | undefined {
  const s = v.replace(/[₹$,\s]|aed|inr/gi, "").trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** "2h 30m", "150", "2.5h", "1 day" → minutes. */
export function parseDuration(v: string): number | undefined {
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0;
  let matched = false;
  const day = /(\d+(?:\.\d+)?)\s*(d|day|days)\b/.exec(s);
  const hr = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/.exec(s);
  const mn = /(\d+)\s*(m|min|mins|minute|minutes)\b/.exec(s);
  if (day) (total += Number(day[1]) * 1440), (matched = true);
  if (hr) (total += Number(hr[1]) * 60), (matched = true);
  if (mn) (total += Number(mn[1])), (matched = true);
  return matched ? Math.round(total) : undefined;
}

function parseJsonOr<T>(v: string, fallback: () => T | undefined): T | undefined {
  const s = v.trim();
  if (!s) return undefined;
  if (s.startsWith("[") || s.startsWith("{")) {
    try {
      return JSON.parse(s) as T;
    } catch {
      return undefined;
    }
  }
  return fallback();
}

/** `q::a | q::a` or `Q: … A: …` lines. */
export function parseFaqs(v: string): { q: string; a: string }[] | undefined {
  return parseJsonOr(v, () => {
    const out: { q: string; a: string }[] = [];
    for (const part of splitList(v)) {
      const m = /^(?:q:\s*)?(.+?)\s*(?:::|\?\s*a:|\sa:)\s*(.+)$/i.exec(part);
      if (m) out.push({ q: m[1].trim().replace(/\?$/, "") + "?", a: m[2].trim() });
    }
    return out.length ? out : undefined;
  });
}

/** `09:00::Pickup::detail | 10:30::Dunes::detail` */
export function parseItinerary(v: string): { time: string; title: string; detail: string }[] | undefined {
  return parseJsonOr(v, () => {
    const out: { time: string; title: string; detail: string }[] = [];
    for (const part of splitList(v)) {
      const [time, title, ...rest] = part.split("::").map((s) => s.trim());
      if (time && title) out.push({ time, title, detail: rest.join(" ") });
    }
    return out.length ? out : undefined;
  });
}

/** `id::name::inr::aed::perPerson::category::description` */
export function parseAddOns(v: string) {
  return parseJsonOr<ActivityInput["addOns"]>(v, () => {
    const out: ActivityInput["addOns"] = [];
    for (const part of splitList(v)) {
      const [id, name, inr, aed, per, category, ...desc] = part.split("::").map((s) => s.trim());
      if (!id || !name) continue;
      out.push({
        id,
        name,
        price: { inr: toNumber(inr ?? "") ?? 0, aed: toNumber(aed ?? "") ?? 0 },
        perPerson: toBool(per ?? "") ?? true,
        category: (category as ActivityInput["addOns"][number]["category"]) || "comfort",
        description: desc.join(" "),
      });
    }
    return out.length ? out : undefined;
  });
}

/** `id::name::deltaInr::deltaAed::blurb` */
export function parseVariants(v: string) {
  return parseJsonOr<ActivityInput["variants"]>(v, () => {
    const out: ActivityInput["variants"] = [];
    for (const part of splitList(v)) {
      const [id, name, inr, aed, ...blurb] = part.split("::").map((s) => s.trim());
      if (!id || !name) continue;
      out.push({ id, name, delta: { inr: toNumber(inr ?? "") ?? 0, aed: toNumber(aed ?? "") ?? 0 }, blurb: blurb.join(" "), highlights: [], isPrivate: false });
    }
    return out.length ? out : undefined;
  });
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  if (value === undefined) return;
  const keys = path.split(".");
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

const LIST_FIELDS = new Set<ImportField>(["secondaryCategorySlugs", "collectionSlugs", "images", "pickupZones", "dietary", "suitability", "timeSlots", "inclusions", "exclusions", "importantInfo", "relatedSlugs", "comboSlugs", "seo.keywords"]);
const BOOL_FIELDS = new Set<ImportField>(["isPrivate", "pickupIncluded", "mobileVoucher", "quoteOnly"]);
const NUM_FIELDS = new Set<ImportField>(["freeCancellationHours", "supplier.reliability", "price.adult.inr", "price.adult.aed", "price.child.inr", "price.child.aed", "price.infant.inr", "price.infant.aed", "price.senior.inr", "price.senior.aed", "price.compareAt.inr", "price.compareAt.aed"]);

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/* ------------------------------------------------------- normalisers */

/**
 * Operators fill the template with the words their supplier uses, not our
 * enum tokens. Every normaliser maps the common spellings onto the schema
 * value and reports what it did so the preview can show it; anything it
 * cannot map is left for the schema to reject with a clear message. The
 * schema itself is never loosened — this is transformation before validation.
 */

export interface RowWarning {
  field: string;
  message: string;
}

const TIER_WORDS: Record<string, string> = {
  a: "A", b: "B", c: "C", d: "D", e: "E",
  "tier a": "A", "tier b": "B", "tier c": "C", "tier d": "D", "tier e": "E",
  attraction: "A", attractions: "A", ticket: "A", tickets: "A", budget: "A", economy: "A", basic: "A",
  standard: "B", regular: "B", tour: "B", tours: "B", experience: "B", experiences: "B",
  premium: "C", combo: "C", combos: "C", package: "C", packages: "C",
  luxury: "D", vip: "D", exclusive: "D", private: "D",
  transfer: "E", transfers: "E", essential: "E", essentials: "E", sim: "E", esim: "E",
};

export function normaliseTier(raw: string): string | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  return TIER_WORDS[s] ?? TIER_WORDS[s.replace(/[^a-z ]/g, "").trim()] ?? raw.trim().toUpperCase();
}

export function normaliseConfirmation(raw: string): "instant" | "manual" | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (/\binstant\b|immediate|real[- ]?time|automatic/.test(s)) return "instant";
  if (/manual|request|within|hours|hrs|availability|email|provided|confirm/.test(s)) return "manual";
  return s === "instant" ? "instant" : s === "manual" ? "manual" : undefined;
}

const DIETARY_RULES: [RegExp, string][] = [
  [/\bjain\b/, "jain"],
  [/\bhalal\b/, "halal"],
  [/non[- ]?veg|non[- ]?vegetarian|\bmeat\b|chicken|mutton|\bbeef\b|\bfish\b/, "non-veg"],
  [/\bveg\b|vegetarian|vegan|pure[- ]veg/, "veg"],
];
const SUITABILITY_RULES: [RegExp, string][] = [
  [/\bkids?\b|children|child[- ]friendly|family|families/, "kids"],
  [/senior|elderly|older adults|60\+/, "seniors"],
  [/wheelchair|accessible|mobility/, "wheelchair"],
  [/infant|toddler|baby|babies|stroller/, "infant"],
  [/couple|honeymoon|romantic|anniversary/, "couples"],
  [/\bgroups?\b|corporate|team|large parties/, "groups"],
];

/**
 * Enum list from free text: each item that mentions a known keyword maps to
 * the enum; items that mention none (age limits, medical notes, weight
 * limits…) are returned as `leftover` so the caller can keep them as
 * important info instead of dropping them.
 */
export function normaliseEnumList(items: string[], rules: [RegExp, string][], allowed: readonly string[]): { values: string[]; leftover: string[] } {
  const values: string[] = [];
  const leftover: string[] = [];
  for (const item of items) {
    const s = item.trim().toLowerCase();
    if (!s) continue;
    if (allowed.includes(s)) {
      if (!values.includes(s)) values.push(s);
      continue;
    }
    // "not recommended for kids" / "not suitable for seniors" is an exclusion, not a suitability.
    const negated = /\b(not|no|un)[- ]?(recommended|suitable|allowed|permitted|for)\b|cannot|must not|prohibited/.test(s);
    let hit = false;
    for (const [re, v] of rules) {
      if (re.test(s)) {
        hit = true;
        if (!negated && !values.includes(v)) values.push(v);
      }
    }
    if (!hit || negated) leftover.push(item.trim());
  }
  return { values, leftover };
}

export function normaliseSupplierSource(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "direct";
  if (s === "direct" || s === "rayna" || s === "portal") return s;
  if (/rayna/.test(s)) return "rayna";
  if (/direct|own|contract|inhouse|in-house/.test(s)) return "direct";
  if (/portal|dtcm|official|gov|trade|\.(com|ae|in|net)\b/.test(s)) return "portal";
  return s;
}

const BADGE_WORDS: [RegExp, string][] = [
  [/best[- ]?seller|top[- ]?seller|most popular|popular/, "bestseller"],
  [/\bnew\b|newly added|just added|latest/, "newlyAdded"],
  [/editor|staff pick|recommended|our pick/, "editorPick"],
  [/selling fast|limited|few left|hot/, "sellingFast"],
];

export function normaliseBadges(raw: string): Record<string, boolean> {
  const parsed = parseJsonOr<Record<string, boolean>>(raw, () => undefined);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  const out: Record<string, boolean> = {};
  for (const item of splitList(raw)) {
    const s = item.toLowerCase();
    const known = ["bestseller", "newlyadded", "editorpick", "sellingfast"];
    const compact = s.replace(/[^a-z]/g, "");
    const idx = known.indexOf(compact);
    if (idx >= 0) {
      out[["bestseller", "newlyAdded", "editorPick", "sellingFast"][idx]] = true;
      continue;
    }
    for (const [re, key] of BADGE_WORDS) if (re.test(s)) out[key] = true;
  }
  return out;
}

/** "Free cancellation up to 48 hours before" → 48; "Non refundable" → 0. */
export function cancellationHoursFromPolicy(policy: string): number | undefined {
  const s = policy.toLowerCase();
  if (/non[- ]?refundable|no refund|cannot be cancelled|non[- ]?cancell/.test(s)) return 0;
  const m = /(\d{1,3})\s*(?:hours?|hrs?|h)\b/.exec(s);
  if (m) return Number(m[1]);
  const d = /(\d{1,2})\s*days?\b/.exec(s);
  if (d) return Number(d[1]) * 24;
  if (/free cancellation/.test(s)) return 24;
  return undefined;
}

/** Alt text: first item of a `|` list, trimmed to the schema cap at a word boundary. */
export function normaliseAlt(raw: string, max = 200): string {
  const first = splitList(raw)[0] ?? raw.trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).trim();
}

/**
 * Turn a mapped row into an ActivityInput *candidate* (unknown shape — the
 * caller validates with `activityInputSchema`). Cells are strings; type
 * coercion and vocabulary normalisation happen here so the schema sees
 * numbers/booleans/lists/enum tokens. Returns the warnings it raised.
 */
export function rowToInputWithWarnings(headers: string[], row: string[], mapping: Mapping): { input: Record<string, unknown>; warnings: RowWarning[] } {
  const warnings: RowWarning[] = [];
  const warn = (field: string, message: string) => warnings.push({ field, message });
  const cell = (header: string | null | undefined) => {
    if (!header) return "";
    const i = headers.indexOf(header);
    return i >= 0 ? (row[i] ?? "") : "";
  };
  const out: Record<string, unknown> = {};
  const extraInfo: string[] = [];
  for (const f of IMPORT_FIELDS) {
    const raw = cell(mapping[f]);
    if (raw === "") continue;
    let value: unknown = raw;
    if (f === "dietary") {
      const r = normaliseEnumList(splitList(raw), DIETARY_RULES, DIETARY);
      value = r.values;
      if (r.leftover.length && !cell(mapping.mealNote)) setPath(out, "mealNote", r.leftover.join(" ").slice(0, 300));
      if (r.values.length || r.leftover.length) if (raw.trim().toLowerCase() !== r.values.join(" | ")) warn("dietary", `"${raw.slice(0, 60)}" → [${r.values.join(", ") || "none"}]${r.leftover.length ? " (rest kept as meal note)" : ""}`);
    } else if (f === "suitability") {
      const r = normaliseEnumList(splitList(raw), SUITABILITY_RULES, SUITABILITY);
      value = r.values;
      if (r.leftover.length) extraInfo.push(...r.leftover);
      if (raw.trim().toLowerCase() !== r.values.join(" | ")) warn("suitability", `"${raw.slice(0, 60)}" → [${r.values.join(", ") || "none"}]${r.leftover.length ? " (rest kept as important info)" : ""}`);
    } else if (f === "images") {
      // Supplier CDNs often carry spaces in file names; encode them rather than reject the row.
      value = splitList(raw).map((u) => (/^https?:\/\//i.test(u) ? u.replace(/ /g, "%20") : u));
    } else if (f === "timeSlots") {
      const items = splitList(raw);
      const slots = items.filter((x) => x.length <= 80);
      const prose = items.filter((x) => x.length > 80);
      value = slots;
      if (prose.length) {
        extraInfo.push(...prose);
        warn("timeSlots", "long text moved to important info");
      }
    } else if (LIST_FIELDS.has(f)) value = splitList(raw);
    else if (BOOL_FIELDS.has(f)) value = toBool(raw);
    else if (NUM_FIELDS.has(f)) {
      const n = toNumber(raw);
      value = n === undefined ? undefined : f.startsWith("price.") ? Math.round(n) : n;
      if (n !== undefined && value !== n) warn(f, `${raw.trim()} rounded to ${value}`);
    } else if (f === "durationMinutes") value = parseDuration(raw);
    else if (f === "tier") {
      value = normaliseTier(raw);
      if (value !== raw.trim()) warn("tier", `"${raw.trim()}" → ${value}`);
    } else if (f === "confirmation") {
      value = normaliseConfirmation(raw);
      if (value && value !== raw.trim().toLowerCase()) warn("confirmation", `"${raw.trim()}" → ${value}`);
    } else if (f === "slug" || f === "categorySlug" || f === "attractionSlug") value = slugify(raw);
    else if (f === "faqs") value = parseFaqs(raw);
    else if (f === "itinerary") value = parseItinerary(raw);
    else if (f === "addOns") value = parseAddOns(raw);
    else if (f === "variants") value = parseVariants(raw);
    else if (f === "badges") value = normaliseBadges(raw);
    else if (f === "supplier.source") {
      value = normaliseSupplierSource(raw);
      if (value !== raw.trim().toLowerCase()) warn("supplier.source", `"${raw.trim()}" → ${value}`);
    } else if (f === "imageAlt") {
      value = normaliseAlt(raw);
      if (value !== raw.trim()) warn("imageAlt", "shortened to the first alt text (≤200 chars)");
    }
    setPath(out, f, value);
  }
  if (extraInfo.length) {
    const info = Array.isArray(out.importantInfo) ? (out.importantInfo as string[]) : [];
    out.importantInfo = [...info, ...extraInfo.filter((x) => !info.includes(x))].slice(0, 30);
  }

  // Derivable defaults so a minimal sheet still validates — each one is reported.
  if (!out.slug && typeof out.title === "string") out.slug = slugify(out.title);
  if (!out.imageAlt && typeof out.title === "string") out.imageAlt = out.title;
  if (!out.images && typeof out.slug === "string") out.images = [`img:activity:${out.slug}:0`];
  if (!out.subtitle && typeof out.title === "string") {
    const inclusions = Array.isArray(out.inclusions) ? (out.inclusions as string[]) : [];
    const first = inclusions[0] ?? (Array.isArray(out.importantInfo) ? (out.importantInfo as string[])[0] : undefined);
    out.subtitle = (first ?? `${out.title} in Dubai — all-in price, confirmed on WhatsApp`).slice(0, 200);
    warn("subtitle", first ? "blank — derived from the first inclusion; rewrite before publishing" : "blank — placeholder written; rewrite before publishing");
  }
  if (!out.tier) {
    out.tier = "B";
    warn("tier", "blank — saved as Tier B (standard); set A–E before publishing");
  }
  if (out.durationMinutes === undefined) {
    out.durationMinutes = 0;
    warn("durationMinutes", "blank — saved as “not stated”; the storefront shows “Duration on request”");
  }
  if (!out.meetingPoint && typeof out.location === "string") {
    out.meetingPoint = out.location;
    warn("meetingPoint", "blank — set to the location");
  }
  const seo = (out.seo ?? {}) as Record<string, unknown>;
  if (!seo.title && typeof out.title === "string") seo.title = `${out.title} — Book with OUTLYY`;
  if (!seo.description && typeof out.subtitle === "string") seo.description = out.subtitle;
  if (!seo.keywords) seo.keywords = typeof out.title === "string" ? [String(out.title).toLowerCase()] : [];
  out.seo = seo;
  const supplier = (out.supplier ?? {}) as Record<string, unknown>;
  if (supplier.name && !supplier.id) supplier.id = slugify(String(supplier.name));
  if (!supplier.source) supplier.source = "direct";
  if (supplier.reliability === undefined) supplier.reliability = 80;
  if (!supplier.verifiedSince) supplier.verifiedSince = String(new Date().getFullYear());
  if (supplier.name) out.supplier = supplier;
  if (!out.supplier) out.supplier = { id: "outlyy-direct", name: "OUTLYY direct", source: "direct", reliability: 80, verifiedSince: String(new Date().getFullYear()) };
  if (!out.confirmation) out.confirmation = "manual";
  if (out.freeCancellationHours === undefined) {
    const fromPolicy = typeof out.cancellationPolicy === "string" ? cancellationHoursFromPolicy(out.cancellationPolicy) : undefined;
    out.freeCancellationHours = fromPolicy ?? 24;
    if (fromPolicy !== undefined && fromPolicy !== 24) warn("freeCancellationHours", `blank — read ${fromPolicy}h from the cancellation policy`);
  }
  if (!out.cancellationPolicy) {
    const h = typeof out.freeCancellationHours === "number" ? out.freeCancellationHours : undefined;
    if (h !== undefined) {
      out.cancellationPolicy = h === 0 ? "Non-refundable once booked." : `Free cancellation up to ${h} hours before the activity; no refund after that.`;
      warn("cancellationPolicy", `blank — written from freeCancellationHours (${h}h)`);
    }
  }

  return { input: out, warnings };
}

export function rowToInput(headers: string[], row: string[], mapping: Mapping): Record<string, unknown> {
  return rowToInputWithWarnings(headers, row, mapping).input;
}

/* ------------------------------------------------------------------ doc */

const DOC_SECTIONS: { keys: string[]; field: ImportField | "highlights" | "description" }[] = [
  { keys: ["title", "name", "activity"], field: "title" },
  { keys: ["subtitle", "tagline", "summary"], field: "subtitle" },
  { keys: ["slug"], field: "slug" },
  { keys: ["category"], field: "categorySlug" },
  { keys: ["sub category", "subcategory", "sub-category", "secondary categories"], field: "secondaryCategorySlugs" },
  { keys: ["tier"], field: "tier" },
  { keys: ["price", "pricing", "price inr", "adult price"], field: "price.adult.inr" },
  { keys: ["price aed", "adult price aed"], field: "price.adult.aed" },
  { keys: ["child price", "child price inr"], field: "price.child.inr" },
  { keys: ["child price aed"], field: "price.child.aed" },
  { keys: ["duration"], field: "durationMinutes" },
  { keys: ["location", "area"], field: "location" },
  { keys: ["meeting point", "meeting"], field: "meetingPoint" },
  { keys: ["highlights"], field: "highlights" },
  { keys: ["description", "about", "overview"], field: "description" },
  { keys: ["inclusions", "included", "what's included", "whats included"], field: "inclusions" },
  { keys: ["exclusions", "not included", "excluded"], field: "exclusions" },
  { keys: ["important info", "important information", "know before you go", "notes"], field: "importantInfo" },
  { keys: ["cancellation", "cancellation policy", "policy", "policies"], field: "cancellationPolicy" },
  { keys: ["faq", "faqs", "questions"], field: "faqs" },
  { keys: ["itinerary", "schedule"], field: "itinerary" },
  { keys: ["images", "photos", "image urls"], field: "images" },
  { keys: ["seo title", "meta title"], field: "seo.title" },
  { keys: ["seo description", "meta description"], field: "seo.description" },
  { keys: ["keywords", "seo keywords"], field: "seo.keywords" },
  { keys: ["related", "related activities"], field: "relatedSlugs" },
  { keys: ["combos", "packages", "cross-sells", "cross sells"], field: "comboSlugs" },
  { keys: ["add-ons", "addons", "upsells", "extras"], field: "addOns" },
  { keys: ["variants", "options"], field: "variants" },
  { keys: ["dietary", "food"], field: "dietary" },
  { keys: ["suitability", "suitable for"], field: "suitability" },
  { keys: ["time slots", "slots", "timings"], field: "timeSlots" },
  { keys: ["pickup zones", "pickup"], field: "pickupZones" },
  { keys: ["supplier"], field: "supplier.name" },
  { keys: ["meal", "meal note"], field: "mealNote" },
];

export interface DocDraft {
  input: Record<string, unknown>;
  warnings: string[];
  sections: Record<string, string>;
}

/**
 * Google Doc (exported as text) → draft. A section starts with a line that is
 * a known heading (`Inclusions`, `Inclusions:`, `## Inclusions`, `INCLUSIONS`)
 * and runs to the next heading. Bulleted lines become list items.
 */
export function parseDocToDraft(text: string): DocDraft {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: Record<string, string> = {};
  const warnings: string[] = [];
  let current: string | null = null;
  const buf: string[] = [];
  const flush = () => {
    if (current !== null) sections[current] = buf.join("\n").trim();
    buf.length = 0;
  };
  const headingOf = (line: string): string | null => {
    const stripped = line.trim().replace(/^#+\s*/, "");
    // "Heading", "Heading:", "Heading: inline value"
    const head = stripped.includes(":") ? stripped.slice(0, stripped.indexOf(":")) : stripped;
    const s = head.replace(/[:\-–—]+\s*$/, "").trim();
    if (!s || s.length > 40) return null;
    const key = s.toLowerCase();
    for (const sec of DOC_SECTIONS) if (sec.keys.includes(key)) return sec.field;
    return null;
  };
  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      flush();
      current = h;
      // inline value: "Title: Burj Khalifa"
      const idx = line.indexOf(":");
      const inline = idx >= 0 ? line.slice(idx + 1).trim() : "";
      if (inline) buf.push(inline);
      continue;
    }
    if (current === null) {
      // First non-empty line before any heading is treated as the title.
      if (line.trim() && !sections.title) {
        sections.title = line.trim();
        continue;
      }
      continue;
    }
    buf.push(line);
  }
  flush();

  const listOf = (v: string | undefined) =>
    v
      ? v
          .split("\n")
          .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
          .filter(Boolean)
      : undefined;

  const headers: string[] = [];
  const row: string[] = [];
  const mapping: Mapping = {};
  const push = (f: ImportField, v: string | undefined) => {
    if (v === undefined || v === "") return;
    headers.push(f);
    row.push(v);
    mapping[f] = f;
  };
  // Highlights have no column of their own: they lead the inclusions list.
  if (sections.highlights) {
    sections.inclusions = [...(listOf(sections.highlights) ?? []), ...(listOf(sections.inclusions) ?? [])].join("\n");
    delete sections.highlights;
  }
  for (const [field, raw] of Object.entries(sections)) {
    if (field === "description") {
      if (!sections.subtitle) push("subtitle", raw.split("\n")[0].slice(0, 200));
      const rest = listOf(raw) ?? [];
      if (!sections.importantInfo && rest.length > 1) push("importantInfo", rest.slice(1).join(" | "));
      continue;
    }
    const f = field as ImportField;
    if (LIST_FIELDS.has(f) || f === "faqs" || f === "itinerary" || f === "addOns" || f === "variants") push(f, (listOf(raw) ?? []).join(" | "));
    else if (f === "cancellationPolicy" || f === "meetingPoint" || f === "location") push(f, (listOf(raw) ?? [raw]).join(" "));
    else push(f, raw.split("\n")[0]);
  }
  const input = rowToInput(headers, row, mapping);
  if (!sections.title) warnings.push("No title found — add a 'Title:' line or make the first line the activity name.");
  if (!sections.categorySlug) warnings.push("No 'Category' section — pick one in the form.");
  if (!sections["price.adult.inr"]) warnings.push("No 'Price' section — enter adult INR/AED prices.");
  if (!sections.durationMinutes) warnings.push("No 'Duration' section.");
  if (!sections.cancellationPolicy) warnings.push("No 'Cancellation policy' section.");
  return { input, warnings, sections };
}

/* ------------------------------------------------------------------ csv out */

export const CSV_TEMPLATE_HEADERS: ImportField[] = [
  "slug", "title", "subtitle", "tier", "categorySlug", "secondaryCategorySlugs", "location", "meetingPoint", "durationMinutes",
  "price.adult.inr", "price.adult.aed", "price.child.inr", "price.child.aed", "price.infant.inr", "price.infant.aed", "price.senior.inr", "price.senior.aed", "price.compareAt.inr", "price.compareAt.aed",
  "images", "imageAlt", "inclusions", "exclusions", "importantInfo", "cancellationPolicy", "freeCancellationHours",
  "dietary", "suitability", "timeSlots", "pickupIncluded", "pickupZones", "isPrivate", "confirmation", "quoteOnly",
  "faqs", "itinerary", "variants", "addOns", "relatedSlugs", "comboSlugs", "badges",
  "seo.title", "seo.description", "seo.keywords", "supplier.id", "supplier.name", "supplier.source", "supplier.reliability", "supplier.verifiedSince", "mealNote", "mobileVoucher",
];

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function toCsv(items: ActivityInput[]): string {
  const lines = [CSV_TEMPLATE_HEADERS.join(",")];
  for (const a of items) {
    const cells = CSV_TEMPLATE_HEADERS.map((f) => {
      const v = getPath(a, f);
      if (v === undefined || v === null) return "";
      if (Array.isArray(v)) {
        if (f === "faqs") return (v as { q: string; a: string }[]).map((x) => `${x.q}::${x.a}`).join(" | ");
        if (f === "itinerary" || f === "variants" || f === "addOns") return JSON.stringify(v);
        return (v as string[]).join(" | ");
      }
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    });
    lines.push(cells.map(csvEscape).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
