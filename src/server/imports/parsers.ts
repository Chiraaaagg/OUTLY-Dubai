import { DIETARY, IMPORT_FIELDS, IMPORT_REQUIRED, SUITABILITY, TIERS, type ActivityInput, type ImportField } from "../schemas/activity.schema";

/**
 * Pure parsers for the import wizard — no I/O, no database, fully unit-tested.
 *
 *  - `decodeCsvBytes`  bytes → text: UTF-8 (with or without BOM), UTF-16
 *                      (Excel "Unicode text"), else Windows-1252.
 *  - `parseCsv`        RFC 4180: quoted fields, doubled quotes, embedded
 *                      newlines, CRLF, BOM, ragged rows; comma, semicolon or
 *                      tab delimited; finds the header row under title rows.
 *  - `matchHeader` /   header → ActivityInput field, by canonical name, a
 *    `suggestMapping`  table of common aliases, and hints in brackets
 *                      ("Price (AED)", "Duration (hours)", "Tier (A–E)").
 *  - `readRow`         mapped row → the values its cells state, normalised.
 *                      A populated cell that cannot be read is a row error,
 *                      never a silent `undefined`.
 *  - `completeNewActivity` / `mergeIntoExisting`
 *                      what happens to blank cells: a new listing derives the
 *                      contract's derivable fields (and fails on blank
 *                      required ones); an existing listing keeps its value.
 *  - `parseDocToDraft` Google Doc export text → one row, by section headings.
 *  - `toCsv`           ActivityInput[] → CSV with the canonical header (the
 *                      template download and catalogue export). Lossless:
 *                      `readRow` of its output gives the same inputs back.
 */

/* ------------------------------------------------------------------ bytes */

/** Uploaded bytes → text. Spreadsheet apps save CSV as UTF-8, UTF-8 with BOM, UTF-16 ("Unicode text") or Windows-1252. */
export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

/* ------------------------------------------------------------------ csv */

export interface CsvTable {
  headers: string[];
  rows: string[][];
  /** What the parser had to decide (delimiter, skipped title rows, renamed headers) — shown above the preview. */
  notes?: string[];
}

const DELIMITERS = [",", ";", "\t"] as const;

/**
 * The delimiter that splits the first lines most consistently: the one whose
 * per-line count (outside quotes) is the same non-zero number on the most
 * lines. A comma inside tab-separated prose, or in a semicolon file's title
 * row, therefore does not win. Comma on a tie.
 */
function sniffDelimiter(text: string): string {
  const perLine: Map<string, number>[] = [];
  let cur = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  for (let i = 0; i < text.length && perLine.length < 6; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === "\n") {
      perLine.push(cur);
      cur = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
    } else if (!inQuotes && cur.has(ch)) cur.set(ch, cur.get(ch)! + 1);
  }
  if (perLine.length < 6) perLine.push(cur);
  let best = ",";
  let bestScore: [number, number] = [0, 0];
  for (const d of DELIMITERS) {
    const counts = perLine.map((m) => m.get(d)!).filter((n) => n > 0);
    const freq = new Map<number, number>();
    for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1);
    let mode = 0;
    let lines = 0;
    for (const [n, f] of freq) if (f > lines || (f === lines && n > mode)) (mode = n), (lines = f);
    const score: [number, number] = [lines, mode];
    if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) (best = d), (bestScore = score);
  }
  return best;
}

/**
 * RFC 4180 records. A quote opens a quoted field only at the start of a field
 * (after optional spaces); a stray quote inside an unquoted field ("6" sub",
 * `The "Big" Bus`) is kept as a character instead of swallowing the rest of
 * the file into one cell.
 */
function splitRecords(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoted = false;
  const endField = () => {
    row.push(quoted ? field : field.trim());
    field = "";
    quoted = false;
  };
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
    if (ch === '"' && !quoted && field.trim() === "") {
      inQuotes = true;
      quoted = true;
      field = "";
    } else if (ch === delimiter) endField();
    else if (ch === "\r") {
      // swallow; \n follows
    } else if (ch === "\n") {
      endField();
      rows.push(row);
      row = [];
    } else if (quoted) {
      // text after a closing quote ("abc" def) — keep it rather than drop it
      field += ch;
    } else field += ch;
  }
  if (field.length || row.length || quoted) {
    endField();
    rows.push(row);
  }
  return rows;
}

/**
 * The first row (of the first ten) that reads as a header — at least two
 * cells name a known field. Title rows above it are skipped. The first such
 * row wins, not the best-scoring one: data cells such as "Private" or
 * "Pickup" also match field names and must never outrank the real header.
 */
function detectHeaderRow(rows: string[][]): number {
  const filled = (r: string[]) => r.filter((c) => c.trim()).length;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].filter((c) => c.trim() && matchHeader(c)).length < 2) continue;
    // Only title-like rows (a cell or two) may be skipped; a full row above is the real header even if we do not know its names.
    const cap = Math.max(1, Math.floor(filled(rows[i]) / 2));
    return rows.slice(0, i).every((r) => filled(r) <= cap) ? i : 0;
  }
  return 0;
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = sniffDelimiter(text);
  const nonEmpty = splitRecords(text, delimiter).filter((r) => r.some((c) => c.trim() !== ""));
  const notes: string[] = [];
  if (nonEmpty.length === 0) return { headers: [], rows: [], notes };
  if (delimiter !== ",") notes.push(`Read as a ${delimiter === "\t" ? "tab" : "semicolon"}-separated file.`);
  const at = detectHeaderRow(nonEmpty);
  if (at > 0) notes.push(`Skipped ${at} row${at === 1 ? "" : "s"} above the header row (first: “${nonEmpty[0].filter(Boolean).join(" ").slice(0, 60)}”).`);
  const headers: string[] = [];
  const seen = new Map<string, number>();
  for (const [i, h] of nonEmpty[at].entries()) {
    let name = h.replace(/\s+/g, " ").trim() || `Column ${i + 1}`;
    const n = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), n);
    if (n > 1) {
      notes.push(`Two columns are called “${name}”; the second is read as “${name} (${n})”.`);
      name = `${name} (${n})`;
    }
    headers.push(name);
  }
  let overflow = 0;
  const body = nonEmpty.slice(at + 1).map((r) => {
    const out = r.map((c) => c.trim());
    if (out.slice(headers.length).some(Boolean)) overflow++;
    while (out.length < headers.length) out.push("");
    return out.slice(0, headers.length);
  });
  if (overflow) notes.push(`${overflow} row${overflow === 1 ? " has" : "s have"} more cells than the header row; the extra cells were ignored.`);
  return { headers, rows: body, notes };
}

/*
 * Spreadsheet formula guard (CSV injection). A cell a spreadsheet would read
 * as a formula — text starting with = + - @ (ASCII or fullwidth ＝＋－＠),
 * possibly after leading whitespace, or with a tab / CR / LF — is written
 * with a leading ' so Excel / Sheets / LibreOffice show it as text. A strict
 * number (-12, 3.5) is data, not a formula, and is written as is; so is any
 * value the writer knows is numeric. `readRow` takes the ' off again.
 *
 * Round trip is exact: text that itself starts with apostrophes followed by
 * formula-like text gets one more ', so the import strips exactly the one the
 * export added and never eats an apostrophe the operator typed ("'hello" and
 * "'-5" are left alone in both directions).
 */
const FORMULA_START = /^(?:[\t\r\n]|\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/;
const STRICT_NUMBER = /^-?\d+(?:\.\d+)?$/;

function formulaLike(v: string): boolean {
  return FORMULA_START.test(v) && !STRICT_NUMBER.test(v);
}

/** True when `v` is formula-like text behind one or more apostrophes — i.e. it carries (or must be given) an escape '. */
function apostropheEscaped(v: string): boolean {
  let k = 0;
  while (v.charCodeAt(k) === 0x27) k++;
  return k > 0 && formulaLike(v.slice(k));
}

/** The cell text a CSV writer should emit for `v` so no spreadsheet evaluates it. */
export function guardFormula(v: string, opts: { numeric?: boolean } = {}): string {
  if (opts.numeric) return v;
  return formulaLike(v) || apostropheEscaped(v) ? `'${v}` : v;
}

/** Inverse of `guardFormula` for a cell read back from a CSV. */
export function unguardFormula(v: string): string {
  return apostropheEscaped(v) ? v.slice(1) : v;
}

function csvEscape(v: string, numeric = false): string {
  const safe = guardFormula(v, { numeric });
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/* -------------------------------------------------------------- mapping */

export type Mapping = Partial<Record<ImportField, string | null>>;

/** Lower-case alphanumerics only: "What's included?" → "whatsincluded". */
function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ALIASES: Record<string, ImportField> = {
  name: "title",
  activity: "title",
  activityname: "title",
  activitytitle: "title",
  tourname: "title",
  productname: "title",
  packagename: "title",
  heading: "title",
  tagline: "subtitle",
  shortdescription: "subtitle",
  shortdesc: "subtitle",
  subheading: "subtitle",
  summary: "subtitle",
  category: "categorySlug",
  categoryname: "categorySlug",
  maincategory: "categorySlug",
  primarycategory: "categorySlug",
  activitytype: "categorySlug",
  subcategory: "secondaryCategorySlugs",
  subcategories: "secondaryCategorySlugs",
  secondarycategories: "secondaryCategorySlugs",
  urlslug: "slug",
  handle: "slug",
  producttier: "tier",
  attraction: "attractionSlug",
  collections: "collectionSlugs",
  collection: "collectionSlugs",
  image: "images",
  photos: "images",
  photo: "images",
  imageurl: "images",
  imageurls: "images",
  imagelinks: "images",
  gallery: "images",
  alt: "imageAlt",
  imagealt: "imageAlt",
  alttext: "imageAlt",
  duration: "durationMinutes",
  tourduration: "durationMinutes",
  activityduration: "durationMinutes",
  durationmin: "durationMinutes",
  durationmins: "durationMinutes",
  minutes: "durationMinutes",
  private: "isPrivate",
  privatetour: "isPrivate",
  pickup: "pickupIncluded",
  hotelpickup: "pickupIncluded",
  pickupincluded: "pickupIncluded",
  transferincluded: "pickupIncluded",
  pickupzones: "pickupZones",
  pickupareas: "pickupZones",
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
  city: "location",
  venue: "location",
  meetingpoint: "meetingPoint",
  meeting: "meetingPoint",
  meetinglocation: "meetingPoint",
  meetingpointpickup: "meetingPoint",
  pickuppoint: "meetingPoint",
  pickuplocation: "meetingPoint",
  reportingpoint: "meetingPoint",
  startingpoint: "meetingPoint",
  departurepoint: "meetingPoint",
  slots: "timeSlots",
  timeslots: "timeSlots",
  times: "timeSlots",
  timings: "timeSlots",
  starttimes: "timeSlots",
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
  inclusion: "inclusions",
  whatsincluded: "inclusions",
  excluded: "exclusions",
  excludes: "exclusions",
  exclusion: "exclusions",
  notincluded: "exclusions",
  whatsnotincluded: "exclusions",
  highlights: "inclusions",
  description: "importantInfo",
  importantinfo: "importantInfo",
  importantinformation: "importantInfo",
  additionalinfo: "importantInfo",
  additionalinformation: "importantInfo",
  goodtoknow: "importantInfo",
  thingstoknow: "importantInfo",
  knowbeforeyougo: "importantInfo",
  notes: "importantInfo",
  policy: "cancellationPolicy",
  cancellation: "cancellationPolicy",
  cancellationpolicy: "cancellationPolicy",
  cancellationterms: "cancellationPolicy",
  cancellationrules: "cancellationPolicy",
  refundpolicy: "cancellationPolicy",
  cancellationandrefund: "cancellationPolicy",
  cancellationrefundpolicy: "cancellationPolicy",
  policies: "cancellationPolicy",
  meal: "mealNote",
  mealnote: "mealNote",
  faq: "faqs",
  faqs: "faqs",
  itinerary: "itinerary",
  schedule: "itinerary",
  related: "relatedSlugs",
  relatedactivities: "relatedSlugs",
  crosssells: "comboSlugs",
  combos: "comboSlugs",
  packages: "comboSlugs",
  upsells: "addOns",
  addons: "addOns",
  extras: "addOns",
  options: "variants",
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

/** Header words that name a price column, by passenger band. Combined with a currency hint ("Selling Price (AED)"). */
const PRICE_BASES: Record<string, "adult" | "child" | "infant" | "senior" | "compareAt"> = {
  price: "adult",
  adult: "adult",
  adultprice: "adult",
  adultrate: "adult",
  rate: "adult",
  sellingprice: "adult",
  saleprice: "adult",
  salesprice: "adult",
  retailprice: "adult",
  b2cprice: "adult",
  priceperperson: "adult",
  priceperadult: "adult",
  child: "child",
  childprice: "child",
  childrate: "child",
  kidsprice: "child",
  infant: "infant",
  infantprice: "infant",
  infantrate: "infant",
  senior: "senior",
  seniorprice: "senior",
  seniorrate: "senior",
  compareat: "compareAt",
  compareatprice: "compareAt",
  gateprice: "compareAt",
  originalprice: "compareAt",
  wasprice: "compareAt",
  strikeprice: "compareAt",
  rrp: "compareAt",
  mrp: "compareAt",
};

const FIELD_BY_NORM = new Map<string, ImportField>(IMPORT_FIELDS.map((f) => [norm(f), f]));

const INR_WORD = /₹|\binr\b|\brs\b\.?|rupees?/i;
const AED_WORD = /\baed\b|\bdhs?\b\.?|dirhams?|د\.إ/i;

/** "inr" / "aed" when the text names exactly one of the two currencies. */
export function currencyIn(text: string): "inr" | "aed" | null {
  const inr = INR_WORD.test(text);
  const aed = AED_WORD.test(text);
  return inr && !aed ? "inr" : aed && !inr ? "aed" : null;
}

export interface HeaderMatch {
  field: ImportField;
  /** Unit stated by the header for a bare-number duration cell. */
  unit?: "minutes" | "hours" | "days";
  /** True when a price header names no currency and was read as INR. */
  assumedCurrency?: boolean;
}

/** Strip bracketed hints and required-markers: "Tier (A–E) *" → "Tier". */
function withoutHints(h: string): string {
  return h.replace(/\([^)]*\)|\[[^\]]*\]|\*/g, " ");
}

/**
 * One header → one field, or null. Order: canonical field name, alias, the
 * same two with bracketed hints removed, then price and duration headers with
 * their currency / unit read from the words ("Child Rate in AED", "Duration
 * (hrs)"). A price header without a currency is read as INR and flagged.
 */
export function matchHeader(header: string): HeaderMatch | null {
  const m = matchHeaderRaw(header);
  // A price column that is not the customer price ("Price (Net)", "Supplier Rate") or is in a third currency is never auto-mapped.
  if (m?.field.startsWith("price.") && NOT_SELLING_PRICE.test(header)) return null;
  return m;
}

/** Words that make a price column something other than the all-in customer price, or a currency we do not store. */
const NOT_SELLING_PRICE = /\b(net|cost|costs|b2b|supplier|buying|buy|purchase|wholesale|agent|agency|commission|margin|markup|usd|eur|gbp|sar|omr|qar)\b|[$€£]/i;

/** "Duration (hours)", "Time in hrs", "Length (days)" → the unit a bare number in that column is in. */
export function durationUnitOf(header: string): "hours" | "days" | undefined {
  const s = header.toLowerCase();
  if (/\b(hours?|hrs?|h)\b/.test(s)) return "hours";
  if (/\bdays?\b/.test(s)) return "days";
  return undefined;
}

function matchHeaderRaw(header: string): HeaderMatch | null {
  const full = norm(header);
  if (!full) return null;
  const base = norm(withoutHints(header));
  const named = currencyIn(header);
  for (const key of [full, base]) {
    const f = FIELD_BY_NORM.get(key) ?? ALIASES[key];
    if (f) {
      if (f.startsWith("price.")) {
        // The header's own currency word wins over the alias's default ("Price (Dirhams)", "Price (د.إ)").
        if (named && !f.endsWith(`.${named}`)) break;
        if (!named && !/inr|aed/.test(key)) return { field: f, assumedCurrency: true };
        return { field: f };
      }
      return f === "durationMinutes" && key !== norm("durationMinutes") ? { field: f, unit: durationUnitOf(header) } : { field: f };
    }
  }
  const priceBase = norm(withoutHints(header).replace(/₹|د\.إ|\b(inr|rs|rupees?|aed|dhs?|dirhams?|in)\b/gi, " "));
  const pax = PRICE_BASES[priceBase];
  if (pax) return { field: `price.${pax}.${named ?? "inr"}` as ImportField, ...(named ? {} : { assumedCurrency: true }) };
  const durBase = norm(withoutHints(header).replace(/\b(in|hours?|hrs?|mins?|minutes?|days?)\b/gi, " "));
  if (durBase === "duration" || durBase === "tourduration" || durBase === "activityduration" || durBase === "length") return { field: "durationMinutes", unit: durationUnitOf(header) };
  return null;
}

/** Header list → suggested mapping. Canonical names win over aliases; every field is present (null = not mapped). */
export function suggestMapping(headers: string[]): Mapping {
  const out: Mapping = {};
  const used = new Set<string>();
  // Exact field names first (a CSV we exported ourselves maps 1:1).
  for (const h of headers) {
    const f = FIELD_BY_NORM.get(norm(h));
    if (f && !out[f]) {
      out[f] = h;
      used.add(h);
    }
  }
  for (const h of headers) {
    if (used.has(h)) continue;
    const m = matchHeader(h);
    if (m && !out[m.field]) {
      out[m.field] = h;
      used.add(h);
    }
  }
  for (const f of IMPORT_FIELDS) if (!(f in out)) out[f] = null;
  return out;
}

/* ------------------------------------------------------------ cell readers */

/** `|` or newline separated; a JSON array of strings is read as-is (the export uses it when an item itself contains `|`). */
function splitList(v: string): string[] {
  const s = v.trim();
  if (s.startsWith("[")) {
    try {
      const arr: unknown = JSON.parse(s);
      if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) return (arr as string[]).map((x) => x.trim()).filter(Boolean);
    } catch {
      // not JSON — fall through to the plain list
    }
  }
  return s
    .split(/\s*\|\s*|\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Leading yes/no word; text after it is returned so it can be kept. Unknown → undefined. */
export function parseBool(v: string): { value?: boolean; rest: string } {
  const s = v.trim();
  // Longest alternatives first so "N/A" is not read as "N" + "/A". "On request" / "Available on request" are not a yes.
  const m = /^(not included|not available|n\/a|yes|true|included|false|no|na|y|n|1|0)(?![\w/])[\s,.;:–—-]*(.*)$/is.exec(s);
  if (!m) return { rest: s };
  const word = m[1].toLowerCase();
  const rest = m[2].trim();
  const value = ["yes", "y", "true", "1", "included"].includes(word);
  // "Yes, at extra cost" / "Yes, on request" is not included.
  if (value && /extra|additional|surcharge|charge|cost|paid|request/i.test(rest)) return { rest: s };
  return { value, rest };
}

function toBool(v: string): boolean | undefined {
  return parseBool(v).value;
}

export interface Amount {
  value: number;
  currency: "inr" | "aed" | null;
}

const CUR = String.raw`₹|inr|rs\.?|rupees?|aed|dhs?\.?|dirhams?|د\.إ`;
const AMOUNT_RE = new RegExp(String.raw`(${CUR})?\s*(\d[\d,]*(?:\.\d+)?)\s*(${CUR})?`, "gi");
const WELL_GROUPED = /^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d+)?$/;
const PRICE_NOISE = /\b(from|starting(?: at| from)?|only|approx\.?|approximately|around|onwards|per (?:person|adult|pax|head|ticket)|pp|each|net)\b|\/-|\/\s*(?:person|pax|adult)/gi;

/**
 * Money cell → amounts with the currency each one is labelled with.
 * "₹3,400", "Rs. 3,400/-", "From AED 150", "AED 89 / ₹1,990", "1,23,456"
 * all read; anything else left over in the cell ("+ VAT", "on request",
 * "150-200") makes it unreadable — the caller reports it instead of guessing.
 */
export function parseAmounts(cell: string): { amounts: Amount[]; readable: boolean } {
  const s = cell.replace(PRICE_NOISE, " ").trim();
  if (/^free$/i.test(s)) return { amounts: [{ value: 0, currency: null }], readable: true };
  const amounts: Amount[] = [];
  let ambiguous = false;
  const rest = s.replace(AMOUNT_RE, (_m, pre: string | undefined, num: string, post: string | undefined) => {
    const label = pre ?? post;
    // Only plain, western (1,234,567) or Indian (12,34,567) grouping is read. "149,50" (decimal comma) and
    // "1.490" (dot as thousands) cannot be told from 14950 / 1.49 — refuse rather than guess.
    if (!WELL_GROUPED.test(num) || /^\d{1,3}\.\d{3}$/.test(num)) ambiguous = true;
    amounts.push({ value: Number(num.replace(/,/g, "")), currency: label ? currencyIn(label === "rs." || /^rs/i.test(label) ? "rs" : label) : null });
    return " ";
  });
  const leftover = rest.replace(/[\s/|,;:+=]|\b(or|and)\b/gi, "");
  const unlabelled = amounts.filter((a) => a.currency === null).length;
  return { amounts, readable: amounts.length > 0 && !ambiguous && !leftover && amounts.every((a) => Number.isFinite(a.value)) && unlabelled <= 1 };
}

function toNumber(v: string): number | undefined {
  const s = v.replace(/[%\s,]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  return Number(s);
}

/** "2h 30m", "150", "2.5h", "1 day", "1:30 hrs", "2-3 hours" → minutes. A bare number is minutes unless `unit` says otherwise. */
export function parseDuration(v: string, unit: "minutes" | "hours" | "days" = "minutes"): number | undefined {
  const s = v.trim().toLowerCase().replace(/\bapprox(?:imately|\.)?\b|\(approx\.?\)|~|\babout\b/g, " ").trim();
  if (!s) return undefined;
  const factor = unit === "hours" ? 60 : unit === "days" ? 1440 : 1;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * factor);
  // h:mm (Sheets writes 1:30 or 01:30:00), optionally followed by a unit word.
  const clock = /^(\d{1,2}):(\d{2})(?::00)?\s*(?:h|hrs?|hours?)?$/.exec(s);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  // ranges: "2-3 hours", "2 to 3 hrs" → the longer end, so nobody under-plans.
  const range = /^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(d|days?|h|hrs?|hours?|m|mins?|minutes?)?$/.exec(s);
  if (range) {
    const u = range[3] ?? "";
    const f = /^d/.test(u) ? 1440 : /^h/.test(u) ? 60 : /^m/.test(u) ? 1 : factor;
    return Math.round(Number(range[2]) * f);
  }
  let total = 0;
  let matched = false;
  let rest = s;
  const take = (re: RegExp, f: number) => {
    const m = re.exec(rest);
    if (!m) return;
    total += Number(m[1]) * f;
    matched = true;
    rest = rest.replace(m[0], " ");
  };
  take(/(\d+(?:\.\d+)?)\s*(?:d|days?)\b/, 1440);
  take(/(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b/, 60);
  take(/(\d+)\s*(?:m|mins?|minutes?)\b/, 1);
  if (!matched || /\d/.test(rest)) return undefined;
  return Math.round(total);
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

function isJsonLike(v: string): boolean {
  const s = v.trim();
  return s.startsWith("[") || s.startsWith("{");
}

/** `q::a | q::a` or `Q: … A: …` lines, or JSON. Questions are kept as written. */
export function parseFaqs(v: string): { q: string; a: string }[] | undefined {
  return parseJsonOr(v, () => {
    const out: { q: string; a: string }[] = [];
    for (const part of splitList(v)) {
      const m = /^(?:q:\s*)?(.+?)\s*(::|\?\s*a:|\sa:)\s*(.+)$/i.exec(part);
      if (!m) return undefined;
      const q = m[1].trim() + (m[2].startsWith("?") ? "?" : "");
      out.push({ q, a: m[3].trim() });
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
      if (!time || !title) return undefined;
      out.push({ time, title, detail: rest.join(" ") });
    }
    return out.length ? out : undefined;
  });
}

/** `id::name::inr::aed::perPerson::category::description` — both prices are required; there is no free add-on by omission. */
export function parseAddOns(v: string) {
  return parseJsonOr<ActivityInput["addOns"]>(v, () => {
    const out: ActivityInput["addOns"] = [];
    for (const part of splitList(v)) {
      const [id, name, inr, aed, per, category, ...desc] = part.split("::").map((s) => s.trim());
      const pInr = toNumber(inr ?? "");
      const pAed = toNumber(aed ?? "");
      if (!id || !name || pInr === undefined || pAed === undefined) return undefined;
      out.push({
        id,
        name,
        price: { inr: pInr, aed: pAed },
        perPerson: toBool(per ?? "") ?? true,
        category: (category as ActivityInput["addOns"][number]["category"]) || "comfort",
        description: desc.join(" "),
      });
    }
    return out.length ? out : undefined;
  });
}

/** `id::name::deltaInr::deltaAed::blurb` — a blank delta is "same price as the base". */
export function parseVariants(v: string) {
  return parseJsonOr<ActivityInput["variants"]>(v, () => {
    const out: ActivityInput["variants"] = [];
    for (const part of splitList(v)) {
      const [id, name, inr, aed, ...blurb] = part.split("::").map((s) => s.trim());
      if (!id || !name) return undefined;
      const dInr = inr ? toNumber(inr) : 0;
      const dAed = aed ? toNumber(aed) : 0;
      if (dInr === undefined || dAed === undefined) return undefined;
      out.push({ id, name, delta: { inr: dInr, aed: dAed }, blurb: blurb.join(" "), highlights: [], isPrivate: false });
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

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

const LIST_FIELDS = new Set<ImportField>(["secondaryCategorySlugs", "collectionSlugs", "images", "pickupZones", "dietary", "suitability", "timeSlots", "inclusions", "exclusions", "importantInfo", "relatedSlugs", "comboSlugs", "seo.keywords"]);
const SLUG_LIST_FIELDS = new Set<ImportField>(["secondaryCategorySlugs", "collectionSlugs", "relatedSlugs", "comboSlugs"]);
const BOOL_FIELDS = new Set<ImportField>(["isPrivate", "pickupIncluded", "mobileVoucher", "quoteOnly"]);
/** How a yes/no cell's remark reads once it is kept as important info ("Yes, from Deira hotels" → "Pickup: from Deira hotels"). */
const BOOL_LABELS: Partial<Record<ImportField, string>> = { isPrivate: "Private", pickupIncluded: "Pickup", mobileVoucher: "Voucher", quoteOnly: "Pricing" };
const PRICE_FIELDS = IMPORT_FIELDS.filter((f) => f.startsWith("price.")) as ImportField[];
/** Prose lists whose items have a length cap: a long paragraph is split at sentence ends instead of failing the row. */
const ITEM_CAPS: Partial<Record<ImportField, number>> = { inclusions: 300, exclusions: 300, importantInfo: 600 };

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Shorten to `max` characters: at the last sentence end that fits, else the
 * last word boundary. Used for short display text (subtitle, alt, SEO) where
 * the schema cap is a design limit, never for titles, prices or policies.
 */
export function shortenText(text: string, max: number): string {
  if (text.trim().length <= max) return text.trim();
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence >= max * 0.3) return cut.slice(0, sentence + 1).trim();
  const word = cut.slice(0, max - 1).lastIndexOf(" ");
  return `${(word > max * 0.6 ? cut.slice(0, word) : cut.slice(0, max - 1)).replace(/[\s,;:–—-]+$/, "")}…`;
}

/** A list item over its cap → sentence-sized chunks under it (an item with one huge sentence is left for the schema to reject). */
function splitLongItems(items: string[], cap: number): { items: string[]; split: number } {
  let split = 0;
  const out: string[] = [];
  for (const item of items) {
    if (item.length <= cap) {
      out.push(item);
      continue;
    }
    const sentences = item.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [item];
    let buf = "";
    for (const s of sentences.map((x) => x.trim())) {
      if (buf && buf.length + 1 + s.length > cap) {
        out.push(buf);
        buf = s;
      } else buf = buf ? `${buf} ${s}` : s;
    }
    if (buf) out.push(buf);
    split++;
  }
  return { items: out, split };
}

/* ------------------------------------------------------- normalisers */

/**
 * Operators fill the template with the words their supplier uses, not our
 * enum tokens. Every normaliser maps the common spellings onto the schema
 * value and reports what it did so the preview can show it; anything it
 * cannot map is a row error naming the cell. The schema itself is never
 * loosened — this is transformation before validation.
 */

export interface RowWarning {
  field: string;
  message: string;
  /** A derived value a person should check — the row is not published by "publish immediately". */
  review?: boolean;
}

export interface RowError {
  field: string;
  message: string;
  /** The cell as read, so the preview can show exactly what failed. */
  cell?: string;
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

/** "B", "Tier B", "B - Tours", "luxury" → the tier letter; anything else → undefined (a row error, never a default). */
export function normaliseTier(raw: string): string | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  const direct = TIER_WORDS[s] ?? TIER_WORDS[s.replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()];
  if (direct) return direct;
  const lead = /^(?:tier\s*)?([a-e])\b(?:\s*[-–—:(]|\s*$)/.exec(s);
  return lead ? lead[1].toUpperCase() : undefined;
}

export function normaliseConfirmation(raw: string): "instant" | "manual" | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (/\binstant\b|immediate|real[- ]?time|automatic/.test(s)) return "instant";
  if (/manual|request|within|hours|hrs|availability|email|provided|confirm/.test(s)) return "manual";
  return undefined;
}

const DIETARY_RULES: [RegExp, string][] = [
  [/\bjain\b/, "jain"],
  [/\bhalal\b/, "halal"],
  [/non[- ]?veg|non[- ]?vegetarian|\bmeat\b|chicken|mutton|\bbeef\b|\bfish\b/, "non-veg"],
  // "veg" inside "non-veg" / "non-vegetarian" is not veg.
  [/(?<!non[- ]?)\b(?:veg|vegetarian|vegan)\b|pure[- ]veg/, "veg"],
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
    // "not recommended for kids", "Not wheelchair accessible", "No infants" are exclusions, not suitabilities.
    // "non-veg" is a value, not a negation, so "non" is not in the list.
    const negated = /\b(not|no|never|without|unsuitable|cannot|can't|isn't|prohibited|restricted|excluded)\b|\bun(?:suitable|accessible)\b|must not/.test(s);
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

/** "Free cancellation up to 48 hours before" → 48; "Non refundable" → 0; no stated hours → undefined (never a guessed 24). */
export function cancellationHoursFromPolicy(policy: string): number | undefined {
  const s = policy.toLowerCase();
  const toHours = (n: string, unit: string) => (/^d/.test(unit) ? Number(n) * 24 : Number(n));
  // The free-cancellation window wins: "Free cancellation up to 24 hours before. No refund for no-shows." → 24;
  // "Full refund 7 days prior; 50% within 72 hours" → 168.
  const free = /(?:free(?:\s+of\s+charge)?\s+cancel\w*|full\s+refund|100%\s+refund|cancel\w*\s+(?:for\s+)?free)[^.;]*?(\d{1,3})\s*(hours?|hrs?|h|days?)\b/.exec(s);
  if (free) return toHours(free[1], free[2]);
  if (/non[- ]?refundable|no refund|cannot be cancelled|non[- ]?cancell/.test(s)) return 0;
  const first = /(\d{1,3})\s*(hours?|hrs?|h|days?)\b/.exec(s);
  return first ? toHours(first[1], first[2]) : undefined;
}

/** More than one time window in a policy ("…24 hours…; 50% within 72 hours") — the hours read from it deserve a look. */
function policyIsAmbiguous(policy: string): boolean {
  return (policy.toLowerCase().match(/\d{1,3}\s*(?:hours?|hrs?|h|days?)\b/g) ?? []).length > 1;
}

/** Alt text: first item of a `|` list, trimmed to the schema cap at a word boundary. */
export function normaliseAlt(raw: string, max = 200): string {
  // A short alt text is kept whole, "|" included (the export round-trips it); a long one is usually several alts joined.
  if (raw.trim().length <= max) return raw.trim();
  const first = splitList(raw)[0] ?? raw.trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).trim();
}

/* ------------------------------------------------------------ row → input */

export interface RowRead {
  /** Only what the row's cells state, normalised. Blank and unmapped cells are absent. */
  input: Record<string, unknown>;
  warnings: RowWarning[];
  errors: RowError[];
  /** Text that has no field of its own (suitability notes, bool remarks, unparsed durations) — appended to importantInfo. */
  extraInfo: string[];
  /** Unmatched dietary text, used as the meal note when the listing has none. */
  mealNoteHint?: string;
  /** Fields that have a mapped column in this file (blank or not). */
  mapped: ImportField[];
  /** A duration cell with no length in it ("Half day"): a new listing stores 0, an update keeps its minutes. */
  durationText?: string;
}

/**
 * Read the cells a row fills. Cells are strings; type coercion and vocabulary
 * normalisation happen here so the schema sees numbers/booleans/lists/enum
 * tokens. A populated cell that cannot be read becomes a RowError carrying
 * the cell — it is never dropped to `undefined` and then defaulted.
 */
export function readRow(headers: string[], row: string[], mapping: Mapping): RowRead {
  const warnings: RowWarning[] = [];
  const errors: RowError[] = [];
  const extraInfo: string[] = [];
  let mealNoteHint: string | undefined;
  let durationText: string | undefined;
  const warn = (field: string, message: string) => warnings.push({ field, message });
  const fail = (field: string, message: string, cell: string) => errors.push({ field, message, cell: cell.length > 120 ? `${cell.slice(0, 120)}…` : cell });
  const cell = (header: string | null | undefined) => {
    if (!header) return "";
    const i = headers.indexOf(header);
    const v = i >= 0 ? (row[i] ?? "").trim() : "";
    // The export prefixes formula-like text with ' so spreadsheets do not run it (guardFormula); take it off again.
    const u = unguardFormula(v);
    return u === v ? v : u.trim();
  };
  const out: Record<string, unknown> = {};
  const mapped = IMPORT_FIELDS.filter((f) => Boolean(mapping[f] && headers.includes(mapping[f]!)));

  // Prices first: a cell may carry both currencies ("AED 89 / ₹1,990") and fill its blank sibling.
  const spill = new Map<string, { value: number; from: string }>();
  for (const f of PRICE_FIELDS) {
    const raw = cell(mapping[f]);
    if (!raw) continue;
    const want = f.endsWith(".inr") ? "inr" : "aed";
    const { amounts, readable } = parseAmounts(raw);
    const own = amounts.filter((a) => a.currency === want);
    const bare = amounts.filter((a) => a.currency === null);
    const other = amounts.filter((a) => a.currency !== null && a.currency !== want);
    const pick = own.length === 1 ? own[0] : own.length === 0 && bare.length === 1 ? bare[0] : undefined;
    const label = want.toUpperCase();
    if (readable && !pick && other.length && !own.length && !bare.length) {
      // "AED 89" in the INR column: the amount may still fill a blank AED column, but INR is not stated.
      for (const o of other) spill.set(`${f.slice(0, f.lastIndexOf("."))}.${o.currency}`, { value: o.value, from: raw });
      fail(f, `the cell holds a ${other[0].currency!.toUpperCase()} amount, not ${label} — add the ${label} price or check the column mapping`, raw);
      continue;
    }
    if (!readable || !pick) {
      fail(f, `not a single ${label} amount — write a number such as 1490 or 149.50 (₹, Rs, AED and thousands commas are fine; a decimal comma is not)`, raw);
      continue;
    }
    const value = Math.round(pick.value);
    if (value !== pick.value) warn(f, `${raw} rounded to ${value}`);
    setPath(out, f, value);
    for (const o of other) spill.set(`${f.slice(0, f.lastIndexOf("."))}.${o.currency}`, { value: o.value, from: raw });
  }
  for (const [f, s] of spill) {
    if (getPath(out, f) !== undefined || cell(mapping[f as ImportField])) continue;
    const value = Math.round(s.value);
    setPath(out, f, value);
    warn(f, `read ${value} from “${s.from.slice(0, 40)}”`);
  }

  for (const f of IMPORT_FIELDS) {
    if (f.startsWith("price.")) continue;
    const header = mapping[f];
    const raw = cell(header);
    if (raw === "") continue;
    let value: unknown = raw;
    if (f === "dietary") {
      const r = normaliseEnumList(splitList(raw), DIETARY_RULES, DIETARY);
      value = r.values;
      if (r.leftover.length) mealNoteHint = r.leftover.join(" ").slice(0, 300);
      if (raw.toLowerCase() !== r.values.join(" | ")) warn("dietary", `"${raw.slice(0, 60)}" → [${r.values.join(", ") || "none"}]${r.leftover.length ? " (rest kept as meal note if the listing has none)" : ""}`);
    } else if (f === "suitability") {
      const r = normaliseEnumList(splitList(raw), SUITABILITY_RULES, SUITABILITY);
      value = r.values;
      if (r.leftover.length) extraInfo.push(...r.leftover);
      if (raw.toLowerCase() !== r.values.join(" | ")) warn("suitability", `"${raw.slice(0, 60)}" → [${r.values.join(", ") || "none"}]${r.leftover.length ? " (rest kept as important info)" : ""}`);
    } else if (f === "images") {
      // Supplier CDNs often carry spaces in file names; encode them rather than reject the row.
      value = splitList(raw).map((u) => (/^https?:\/\//i.test(u) ? u.replace(/ /g, "%20") : u));
    } else if (f === "timeSlots") {
      // Sheets turns a typed "16:00" into "16:00:00" on export.
      const items = splitList(raw).map((x) => x.replace(/^(\d{1,2}):(\d{2}):00$/, (_m, h: string, m: string) => `${h.padStart(2, "0")}:${m}`));
      const slots = items.filter((x) => x.length <= 80);
      const prose = items.filter((x) => x.length > 80);
      value = slots.length ? slots : undefined;
      if (prose.length) {
        extraInfo.push(...prose);
        warn("timeSlots", "long text moved to important info");
      }
    } else if (SLUG_LIST_FIELDS.has(f)) {
      const items = splitList(raw);
      value = items.map(slugify).filter(Boolean);
      if (items.some((x) => slugify(x) !== x)) warn(f, `written as slugs: ${(value as string[]).join(", ")}`);
    } else if (LIST_FIELDS.has(f)) {
      const items = splitList(raw);
      const cap = ITEM_CAPS[f];
      if (cap) {
        const r = splitLongItems(items, cap);
        value = r.items;
        if (r.split) warn(f, `${r.split} long item${r.split === 1 ? "" : "s"} split at sentence ends (≤${cap} characters each)`);
      } else value = items;
    } else if (BOOL_FIELDS.has(f)) {
      const b = parseBool(raw);
      if (b.value === undefined) {
        fail(f, "write yes or no", raw);
        continue;
      }
      value = b.value;
      if (b.rest) {
        extraInfo.push(`${BOOL_LABELS[f]}: ${b.rest}`);
        warn(f, `read “${raw.slice(0, 40)}” as ${b.value ? "yes" : "no"}; the rest is kept as important info`);
      }
    } else if (f === "freeCancellationHours") {
      const n = toNumber(raw) ?? cancellationHoursFromPolicy(raw);
      if (n === undefined) {
        fail(f, "write the number of hours before the start (0 = non-refundable)", raw);
        continue;
      }
      value = Math.round(n);
    } else if (f === "supplier.reliability") {
      const n = toNumber(raw);
      if (n === undefined) {
        fail(f, "write a score from 0 to 100", raw);
        continue;
      }
      value = Math.round(n);
    } else if (f === "durationMinutes") {
      const unit = header ? durationUnitOf(header) : undefined;
      const minutes = parseDuration(raw, unit);
      if (minutes === undefined) {
        // "Half day", "Flexible": no number to store. Keep the words where a traveller sees them; 0 = not stated.
        // (An update keeps the listing's current minutes instead — see mergeIntoExisting.)
        value = 0;
        durationText = raw;
        extraInfo.push(`Duration: ${raw}`);
        warn(f, `“${raw.slice(0, 40)}” has no length in it — saved as “not stated” and kept as important info`);
      } else {
        value = minutes;
        if (/^\d+(\.\d+)?$/.test(raw) && unit) warn(f, `${raw} ${unit} (from the column name) = ${minutes} minutes`);
        else if (/^\d+$/.test(raw) && !unit && minutes > 0 && minutes <= 12) warnings.push({ field: f, message: `read as ${minutes} minutes — write “${raw}h” (or name the column “Duration (hours)”) if you meant hours`, review: true });
        else if (!/^\d+$/.test(raw)) warn(f, `“${raw.slice(0, 40)}” → ${minutes} minutes`);
      }
    } else if (f === "tier") {
      const t = normaliseTier(raw);
      if (!t || !(TIERS as readonly string[]).includes(t)) {
        fail(f, "write A, B, C, D or E (A attractions/tickets, B tours, C combos, D luxury, E transfers)", raw);
        continue;
      }
      value = t;
      if (t !== raw) warn("tier", `"${raw}" → ${t}`);
    } else if (f === "confirmation") {
      const c = normaliseConfirmation(raw);
      if (!c) {
        fail(f, "write instant or manual", raw);
        continue;
      }
      value = c;
      if (c !== raw.toLowerCase()) warn("confirmation", `"${raw}" → ${c}`);
    } else if (f === "slug" || f === "categorySlug" || f === "attractionSlug") {
      value = slugify(raw);
      if (f === "slug" && value !== raw) warn("slug", `"${raw}" → ${value}`);
    } else if (f === "faqs" || f === "itinerary" || f === "addOns" || f === "variants") {
      const parsed = f === "faqs" ? parseFaqs(raw) : f === "itinerary" ? parseItinerary(raw) : f === "addOns" ? parseAddOns(raw) : parseVariants(raw);
      if (parsed === undefined) {
        const how = {
          faqs: "Question? :: Answer | Question? :: Answer",
          itinerary: "09:00 :: Title :: detail | …",
          addOns: "id :: Name :: inr :: aed :: perPerson :: category :: description | …",
          variants: "id :: Name :: deltaInr :: deltaAed :: blurb | …",
        }[f];
        fail(f, isJsonLike(raw) ? "not valid JSON" : `could not read every item — use ${how} or a JSON array`, raw);
        continue;
      }
      value = parsed;
    } else if (f === "badges") value = normaliseBadges(raw);
    else if (f === "supplier.source") {
      value = normaliseSupplierSource(raw);
      if (value !== raw.toLowerCase()) warn("supplier.source", `"${raw}" → ${value}`);
    } else if (f === "imageAlt") {
      value = normaliseAlt(raw);
      if (value !== raw) warn("imageAlt", "shortened to the first alt text (≤200 chars)");
    } else if (f === "subtitle" || f === "seo.title" || f === "seo.description") {
      const max = f === "subtitle" ? 200 : f === "seo.title" ? 120 : 320;
      value = shortenText(raw, max);
      if ((value as string).length < raw.replace(/\s+/g, " ").trim().length) warn(f, `${raw.length} characters shortened to ${(value as string).length} (limit ${max}): “${(value as string).slice(-40)}”`);
    }
    setPath(out, f, value);
  }

  const inr = getPath(out, "price.adult.inr");
  const aed = getPath(out, "price.adult.aed");
  if (typeof inr === "number" && typeof aed === "number" && aed > 0 && inr > 0) {
    const ratio = inr / aed;
    // ₹ per dirham has stayed in the low-to-high 20s; far outside that is a swapped or mistyped column.
    if (ratio < 12 || ratio > 40) warnings.push({ field: "price.adult", message: `₹${inr} vs AED ${aed} is ${ratio.toFixed(1)} ₹ per dirham — check the two prices are not swapped or in the wrong currency`, review: true });
  }
  return { input: out, warnings, errors, extraInfo, mealNoteHint, mapped, durationText };
}

function appendInfo(input: Record<string, unknown>, extra: string[], warnings: RowWarning[]) {
  if (!extra.length) return;
  const info = Array.isArray(input.importantInfo) ? (input.importantInfo as string[]) : [];
  const all = [...info, ...extra.filter((x) => !info.includes(x))];
  // The schema caps importantInfo at 30 items; say what did not fit instead of dropping it quietly.
  if (all.length > 30) warnings.push({ field: "importantInfo", message: `more than 30 items — not kept: ${all.slice(30).map((x) => `“${x.slice(0, 40)}”`).join(", ")}`, review: true });
  input.importantInfo = all.slice(0, 30);
}

/**
 * A NEW listing from a read row: blank required cells are errors; blank
 * derivable cells are derived from the same row and reported (contract in
 * activity.schema.ts). Mutates and returns `read`.
 */
export function completeNewActivity(read: RowRead): RowRead {
  const { input: out, warnings, errors } = read;
  const note = (field: string, message: string, review = false) => warnings.push({ field, message, ...(review ? { review } : {}) });
  const hasError = (f: string) => errors.some((e) => e.field === f || e.field.startsWith(`${f}.`));
  const required = (f: ImportField) => {
    if (getPath(out, f) !== undefined || hasError(f)) return;
    errors.push({ field: f, message: read.mapped.includes(f) ? "required for a new listing — the cell is blank" : "required for a new listing — no column is mapped to it" });
  };

  appendInfo(out, read.extraInfo, warnings);
  if (read.mealNoteHint && !out.mealNote) out.mealNote = read.mealNoteHint;

  const fromTitle: string[] = [];
  if (!out.slug && typeof out.title === "string") (out.slug = slugify(out.title)), fromTitle.push("slug");
  for (const f of IMPORT_REQUIRED) required(f);

  // Cancellation: one of policy text / hours, the other is read from it. Neither = error, never a guessed 24h.
  const policy = typeof out.cancellationPolicy === "string" ? out.cancellationPolicy : undefined;
  if (out.freeCancellationHours === undefined && policy && !hasError("freeCancellationHours")) {
    const h = cancellationHoursFromPolicy(policy);
    if (h === undefined) errors.push({ field: "freeCancellationHours", message: "the cancellation policy states no hours — fill freeCancellationHours (0 = non-refundable)" });
    else {
      out.freeCancellationHours = h;
      const ambiguous = policyIsAmbiguous(policy);
      note("freeCancellationHours", `blank — read ${h}h from the cancellation policy${ambiguous ? " (it names more than one time window — check)" : ""}`, ambiguous);
    }
  }
  if (!policy && typeof out.freeCancellationHours === "number") {
    const h = out.freeCancellationHours;
    out.cancellationPolicy = h === 0 ? "Non-refundable once booked." : `Free cancellation up to ${h} hours before the activity; no refund after that.`;
    note("cancellationPolicy", `blank — written from freeCancellationHours (${h}h)`);
  }
  if (!policy && out.freeCancellationHours === undefined && !hasError("freeCancellationHours") && !hasError("cancellationPolicy")) {
    errors.push({ field: "cancellationPolicy", message: "required for a new listing — fill cancellationPolicy or freeCancellationHours" });
  }

  if (!out.imageAlt && typeof out.title === "string") (out.imageAlt = out.title), fromTitle.push("imageAlt");
  if (!out.images && typeof out.slug === "string") {
    out.images = [`img:activity:${out.slug}:0`];
    note("images", "blank — placeholder image until photos are added", true);
  }
  if (!out.subtitle && !hasError("subtitle")) {
    const first = Array.isArray(out.inclusions) ? (out.inclusions as string[])[0] : undefined;
    if (first) {
      out.subtitle = shortenText(first, 200);
      note("subtitle", "blank — taken from the first inclusion; rewrite before publishing", true);
    } else errors.push({ field: "subtitle", message: "required for a new listing — the cell is blank and there are no inclusions to take it from" });
  }
  if (out.durationMinutes === undefined) {
    out.durationMinutes = 0;
    note("durationMinutes", "blank — saved as “not stated”; the storefront shows “Duration on request”");
  }
  if (!out.meetingPoint && typeof out.location === "string") {
    out.meetingPoint = out.location;
    note("meetingPoint", "blank — set to the location; give the exact meeting point before publishing", true);
  }
  const seo = (out.seo ?? {}) as Record<string, unknown>;
  if (!seo.title && typeof out.title === "string") (seo.title = shortenText(`${out.title} — Book with OUTLYY`, 120)), fromTitle.push("seo.title");
  if (!seo.keywords && typeof out.title === "string") (seo.keywords = [String(out.title).toLowerCase().slice(0, 80)]), fromTitle.push("seo.keywords");
  if (!seo.description && typeof out.subtitle === "string") {
    seo.description = out.subtitle;
    note("seo.description", "blank — set to the subtitle");
  }
  out.seo = seo;
  if (fromTitle.length) note(fromTitle.join(", "), "blank — derived from the title");
  const supplier = (out.supplier ?? {}) as Record<string, unknown>;
  if (supplier.name) {
    const filled: string[] = [];
    if (!supplier.id) (supplier.id = slugify(String(supplier.name))), filled.push(`id ${String(supplier.id)}`);
    if (!supplier.source) (supplier.source = "direct"), filled.push("source direct");
    if (supplier.reliability === undefined) (supplier.reliability = 80), filled.push("reliability 80");
    if (!supplier.verifiedSince) (supplier.verifiedSince = String(new Date().getFullYear())), filled.push(`verified since ${new Date().getFullYear()}`);
    if (filled.length) note("supplier", `blank supplier details set to ${filled.join(", ")}`);
    out.supplier = supplier;
  } else {
    out.supplier = { id: "outlyy-direct", name: "OUTLYY direct", source: "direct", reliability: 80, verifiedSince: String(new Date().getFullYear()) };
    note("supplier", "blank — recorded as OUTLYY direct");
  }
  return read;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k] as Record<string, unknown>, v) : v;
  return out;
}

/**
 * An UPDATE: the row's cells over the listing's current input. Blank and
 * unmapped cells keep the current value — an update sheet with five columns
 * changes five fields, not the whole listing.
 */
export function mergeIntoExisting(existing: ActivityInput, read: RowRead): RowRead {
  const merged = deepMerge(structuredClone(existing) as unknown as Record<string, unknown>, read.input);
  // A badges cell states the full set.
  if (read.input.badges) merged.badges = read.input.badges;
  // A different supplier name gets its own id; its source/reliability/verified date were the old supplier's — say so.
  const sup = read.input.supplier as Record<string, unknown> | undefined;
  if (typeof sup?.name === "string" && sup.name !== existing.supplier.name) {
    if (!sup.id) (merged.supplier as Record<string, unknown>).id = slugify(sup.name);
    const kept = (["source", "reliability", "verifiedSince"] as const).filter((k) => sup[k] === undefined);
    if (kept.length) read.warnings.push({ field: "supplier", message: `supplier changed to “${sup.name}” — ${kept.join(", ")} kept from “${existing.supplier.name}”; check them`, review: true });
  }
  // "Half day" in an update: the cell has no length, so the listing keeps its minutes (the words still go to important info).
  if (read.durationText !== undefined) {
    merged.durationMinutes = existing.durationMinutes;
    const w = read.warnings.find((x) => x.field === "durationMinutes");
    if (w) w.message = `“${read.durationText.slice(0, 40)}” has no length in it — kept ${existing.durationMinutes} minutes and added the words to important info`;
  }
  appendInfo(merged, read.extraInfo, read.warnings);
  if (read.mealNoteHint && !merged.mealNote) merged.mealNote = read.mealNoteHint;
  const explicitPolicy = typeof read.input.cancellationPolicy === "string";
  const explicitHours = typeof read.input.freeCancellationHours === "number";
  if (explicitPolicy && !explicitHours) {
    const h = cancellationHoursFromPolicy(read.input.cancellationPolicy as string);
    if (h !== undefined && h !== merged.freeCancellationHours) {
      merged.freeCancellationHours = h;
      const ambiguous = policyIsAmbiguous(read.input.cancellationPolicy as string);
      read.warnings.push({ field: "freeCancellationHours", message: `read ${h}h from the new cancellation policy${ambiguous ? " (it names more than one time window — check)" : ""}`, ...(ambiguous ? { review: true } : {}) });
    } else if (h === undefined) read.warnings.push({ field: "freeCancellationHours", message: `new policy states no hours — kept ${String(merged.freeCancellationHours)}h; check it`, review: true });
  } else if (explicitHours && !explicitPolicy && read.input.freeCancellationHours !== existing.freeCancellationHours) {
    read.warnings.push({ field: "cancellationPolicy", message: `hours changed to ${String(read.input.freeCancellationHours)} but the policy text was kept — check it still matches`, review: true });
  }
  read.input = merged;
  return read;
}

/** readRow + completeNewActivity: a row read as a new listing. */
export function rowToInputWithWarnings(headers: string[], row: string[], mapping: Mapping): { input: Record<string, unknown>; warnings: RowWarning[]; errors: RowError[] } {
  const r = completeNewActivity(readRow(headers, row, mapping));
  return { input: r.input, warnings: r.warnings, errors: r.errors };
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
  { keys: ["price", "pricing", "price inr", "adult price", "adult price inr"], field: "price.adult.inr" },
  { keys: ["price aed", "adult price aed", "aed price"], field: "price.adult.aed" },
  { keys: ["child price", "child price inr"], field: "price.child.inr" },
  { keys: ["child price aed"], field: "price.child.aed" },
  { keys: ["duration"], field: "durationMinutes" },
  { keys: ["location", "area"], field: "location" },
  { keys: ["meeting point", "meeting", "pickup point"], field: "meetingPoint" },
  { keys: ["highlights"], field: "highlights" },
  { keys: ["description", "about", "overview"], field: "description" },
  { keys: ["inclusions", "included", "what's included", "whats included"], field: "inclusions" },
  { keys: ["exclusions", "not included", "excluded"], field: "exclusions" },
  { keys: ["important info", "important information", "know before you go", "notes"], field: "importantInfo" },
  { keys: ["cancellation", "cancellation policy", "policy", "policies"], field: "cancellationPolicy" },
  { keys: ["free cancellation hours", "cancellation hours"], field: "freeCancellationHours" },
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
  { keys: ["confirmation"], field: "confirmation" },
  { keys: ["supplier"], field: "supplier.name" },
  { keys: ["meal", "meal note"], field: "mealNote" },
];

export interface DocDraft {
  /** The draft as a new listing (derivations applied) — what the fetch step shows. */
  input: Record<string, unknown>;
  warnings: string[];
  sections: Record<string, string>;
  /** The doc as a one-row table, so preview runs it through the same create/update path as a sheet row. */
  table: { headers: string[]; row: string[]; mapping: Mapping };
}

/**
 * Google Doc (exported as text) → draft. A section starts with a line that is
 * a known heading (`Inclusions`, `Inclusions:`, `## Inclusions`, `INCLUSIONS`,
 * `Price (AED):`) and runs to the next heading. Bulleted lines become list items.
 */
export function parseDocToDraft(text: string): DocDraft {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  const sections: Record<string, string> = {};
  const warnings: string[] = [];
  let current: string | null = null;
  const buf: string[] = [];
  const flush = () => {
    if (current !== null) sections[current] = [sections[current], buf.join("\n").trim()].filter(Boolean).join("\n");
    buf.length = 0;
  };
  const headingOf = (line: string): string | null => {
    const stripped = line.trim().replace(/^#+\s*/, "").replace(/\*\*/g, "");
    // "Heading", "Heading:", "Heading: inline value", "Price (AED): 89"
    const head = stripped.includes(":") ? stripped.slice(0, stripped.indexOf(":")) : stripped;
    const s = head.replace(/[:\-–—]+\s*$/, "").trim();
    if (!s || s.length > 40) return null;
    const key = s.toLowerCase();
    const plain = withoutHints(key).replace(/\s+/g, " ").trim();
    for (const sec of DOC_SECTIONS) if (sec.keys.includes(key) || sec.keys.includes(plain)) {
      // "Price (AED)" names its currency in the hint.
      if (sec.field === "price.adult.inr" && currencyIn(key) === "aed") return "price.adult.aed";
      return sec.field;
    }
    return null;
  };
  let preamble: string | undefined;
  const listSection = (f: string | null) => f !== null && (f === "highlights" || f === "description" || LIST_FIELDS.has(f as ImportField) || ["faqs", "itinerary", "addOns", "variants", "cancellationPolicy"].includes(f));
  for (const line of lines) {
    let h = headingOf(line);
    // Inside a list or prose section, "Pickup: from Deira hotels" is a line of that section, not a new one —
    // only a heading for a single-value field ("Price: …", "Tier: …") or a bare heading line ends it.
    const listHeading = h !== null && (h === "highlights" || LIST_FIELDS.has(h as ImportField) || ["faqs", "itinerary", "addOns", "variants"].includes(h));
    if (h && listHeading && listSection(current) && line.slice(line.indexOf(":") + 1).trim() && line.includes(":")) h = null;
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
      // The first non-empty line before any heading is the title — unless the doc has a "Title:" heading.
      if (line.trim() && preamble === undefined) preamble = line.trim().replace(/^#+\s*/, "");
      continue;
    }
    buf.push(line);
  }
  flush();
  if (!sections.title && preamble) sections.title = preamble;

  const listOf = (v: string | undefined) =>
    v
      ? v
          .split("\n")
          .map((l) => l.replace(/^\s*(?:[-*•●○■▪◦–]|\d+[.)])\s*/, "").trim())
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
      const paras = raw.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
      if (!sections.subtitle && paras[0]) push("subtitle", paras[0]);
      if (!sections.importantInfo && paras.length > 1) push("importantInfo", JSON.stringify(paras.slice(1)));
      continue;
    }
    const f = field as ImportField;
    if (LIST_FIELDS.has(f) || f === "faqs" || f === "itinerary" || f === "addOns" || f === "variants") push(f, isJsonLike(raw) ? raw.trim() : (listOf(raw) ?? []).join(" | "));
    else if (f === "cancellationPolicy" || f === "meetingPoint" || f === "location" || f === "subtitle") push(f, (listOf(raw) ?? [raw]).join(" "));
    else push(f, raw.split("\n")[0]);
  }
  const draft = completeNewActivity(readRow(headers, row, mapping));
  if (!sections.title) warnings.push("No title found — add a 'Title:' line or make the first line the activity name.");
  if (!sections.categorySlug) warnings.push("No 'Category' section — pick one in the form.");
  if (!sections["price.adult.inr"] && !sections["price.adult.aed"]) warnings.push("No 'Price' section — enter adult INR and AED prices.");
  if (!sections.tier) warnings.push("No 'Tier' section — add 'Tier: A–E'.");
  if (!sections.durationMinutes) warnings.push("No 'Duration' section.");
  if (!sections.cancellationPolicy && !sections.freeCancellationHours) warnings.push("No 'Cancellation policy' section.");
  return { input: draft.input, warnings, sections, table: { headers, row, mapping } };
}

/* ------------------------------------------------------------------ csv out */

/** The template header: every importable field, nothing else, in contract order. */
export const CSV_TEMPLATE_HEADERS: readonly ImportField[] = IMPORT_FIELDS;

/** A list cell: `a | b`, or a JSON array when an item itself contains `|` or a line break. */
function listCell(items: string[]): string {
  return items.some((x) => /[|\r\n]/.test(x)) ? JSON.stringify(items) : items.join(" | ");
}

export function toCsv(items: ActivityInput[]): string {
  const lines = [CSV_TEMPLATE_HEADERS.join(",")];
  for (const a of items) {
    const cells = CSV_TEMPLATE_HEADERS.map((f): [string, boolean] => {
      const v = getPath(a, f);
      if (v === undefined || v === null) return ["", false];
      if (Array.isArray(v)) {
        if (v.length === 0) return ["", false];
        // Structured lists go out as JSON: lossless whatever the text contains.
        if (f === "faqs" || f === "itinerary" || f === "variants" || f === "addOns") return [JSON.stringify(v), false];
        return [listCell(v as string[]), false];
      }
      if (typeof v === "object") return [Object.keys(v).length ? JSON.stringify(v) : "", false];
      // A number field is data whatever its sign; only text is guarded against formulas.
      return [String(v), typeof v === "number"];
    });
    lines.push(cells.map(([v, numeric]) => csvEscape(v, numeric)).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
