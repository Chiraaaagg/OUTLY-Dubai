import { describe, expect, it } from "vitest";
import { activities } from "@/lib/data/activities";
import { activityInputSchema, IMPORT_DERIVED, IMPORT_FIELDS, IMPORT_REQUIRED, IMPORT_REQUIRED_ONE_OF, type ActivityInput } from "@/server/schemas/activity.schema";
import { completeNewActivity, decodeCsvBytes, matchHeader, mergeIntoExisting, parseAmounts, parseCsv, parseDocToDraft, parseDuration, readRow, rowToInputWithWarnings, suggestMapping, toCsv, CSV_TEMPLATE_HEADERS } from "../parsers";
import { googleExportUrl } from "../google";

/**
 * The import contract, end to end through the pure layer: source text →
 * table → mapping → read → create/update completion → schema. Each `describe`
 * pins one reported failure so it cannot come back.
 */

const fixtures: ActivityInput[] = activities.map(({ id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...rest }) => activityInputSchema.parse(rest));
const withoutHinge = (a: ActivityInput) => {
  const { fulfilmentMode: _f, ...rest } = a;
  return rest;
};

/** A sheet row through the whole pure pipeline as a NEW listing. */
function importNew(csv: string) {
  const t = parseCsv(csv);
  const m = suggestMapping(t.headers);
  return t.rows.map((r) => {
    const { input, warnings, errors } = rowToInputWithWarnings(t.headers, r, m);
    const parsed = activityInputSchema.safeParse(input);
    return { input, warnings, errors, parsed, table: t, mapping: m };
  });
}

/** A complete minimal row, so each test varies one thing. */
const H = ["title", "tier", "categorySlug", "location", "price.adult.inr", "price.adult.aed", "cancellationPolicy", "inclusions"];
const R = ["Evening Desert Safari", "B", "desert-safari", "Al Awir", "2990", "129", "Free cancellation up to 24 hours before", "Dune bashing | BBQ dinner"];
const csvOf = (headers: string[], ...rows: string[][]) => [headers, ...rows].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");

describe("baseline row", () => {
  it("validates with no errors", () => {
    const [r] = importNew(csvOf(H, R));
    expect(r.errors).toEqual([]);
    expect(r.parsed.success, JSON.stringify(r.parsed.error?.issues)).toBe(true);
  });
});

describe("symptom: subtitle Too big (≤200)", () => {
  const long = "Glide past the glittering Dubai Marina skyline aboard a traditional wooden dhow. An international buffet dinner, live Tanoura dance, soft drinks and hotel transfers from most Dubai hotels are included in the price.";
  it("a long supplier short-description is shortened at a sentence end and reported, not rejected", () => {
    expect(long.length).toBeGreaterThan(200);
    const [r] = importNew(csvOf([...H, "Short Description"], [...R, long]));
    expect(r.errors).toEqual([]);
    expect(r.parsed.success).toBe(true);
    expect(r.input.subtitle).toBe("Glide past the glittering Dubai Marina skyline aboard a traditional wooden dhow.");
    expect(r.warnings.find((w) => w.field === "subtitle")?.message).toMatch(/shortened/);
  });
  it("a Google Doc Subtitle/Description line is shortened the same way", () => {
    const d = parseDocToDraft(`Desert Safari\nTier: B\nCategory: desert-safari\nPrice: 2500\nPrice AED: 110\nLocation: Lahbab\nCancellation policy: Non refundable\nSubtitle: ${"Red dunes, BBQ dinner and a tanoura show with hotel pickup. ".repeat(4)}`);
    expect(String(d.input.subtitle).length).toBeLessThanOrEqual(200);
    expect(activityInputSchema.safeParse(d.input).success).toBe(true);
  });
});

describe("symptom: price expected object, received undefined", () => {
  it.each([
    ["Rs. 3,400", "AED 150", 3400, 150],
    ["3400/-", "From AED 150", 3400, 150],
    ["₹3,400", "Dhs 150", 3400, 150],
    ["1,23,456", "5,600.40", 123456, 5600],
    ["INR 3400 per person", "150 AED", 3400, 150],
  ])("reads %s / %s", (inr, aed, wantInr, wantAed) => {
    const [r] = importNew(csvOf(["title", "tier", "categorySlug", "location", "Price (INR)", "Price (AED)", "freeCancellationHours", "inclusions"], ["X Tour", "B", "desert-safari", "Dubai", inr, aed, "24", "Dunes"]));
    expect(r.errors).toEqual([]);
    expect((r.input.price as ActivityInput["price"]).adult).toEqual({ inr: wantInr, aed: wantAed });
  });
  it("maps supplier price headers with the currency in the name", () => {
    expect(matchHeader("Selling Price (AED)")).toEqual({ field: "price.adult.aed" });
    expect(matchHeader("Child Rate in Dirhams")).toEqual({ field: "price.child.aed" });
    expect(matchHeader("Adult Price (₹)")).toMatchObject({ field: "price.adult.inr" });
    expect(matchHeader("Price (Dirhams)")).toEqual({ field: "price.adult.aed" });
    expect(matchHeader("Selling Price")).toEqual({ field: "price.adult.inr", assumedCurrency: true });
  });
  it("one cell with both currencies fills both prices (Google Doc “Price: AED 89 / ₹1,990”)", () => {
    const d = parseDocToDraft("Sunset Dhow\nTier: B\nCategory: cruises-yachts\nPrice: AED 89 / ₹1,990\nLocation: Marina\nCancellation policy: Free cancellation 24 hours before\nInclusions\n- Dinner\n");
    expect(d.input.price).toEqual({ adult: { inr: 1990, aed: 89 } });
    expect(activityInputSchema.safeParse(d.input).success).toBe(true);
  });
  it("an unreadable or wrong-currency cell is a row error carrying the cell, never undefined", () => {
    const [r] = importNew(csvOf(H, ["X Tour", "B", "desert-safari", "Dubai", "On request", "150 + VAT", "Non refundable", "Dunes"]));
    expect(r.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "price.adult.inr", cell: "On request" }), expect.objectContaining({ field: "price.adult.aed", cell: "150 + VAT" })]));
    const [w] = importNew(csvOf(H, ["X Tour", "B", "desert-safari", "Dubai", "AED 150", "", "Non refundable", "Dunes"]));
    expect(w.errors).toEqual([expect.objectContaining({ field: "price.adult.inr", message: expect.stringContaining("AED amount, not INR") })]);
    expect(parseAmounts("150-200").readable).toBe(false);
  });
  it("a missing currency says which one, instead of “price: expected object”", () => {
    const [r] = importNew(csvOf(["title", "tier", "categorySlug", "location", "price.adult.aed", "freeCancellationHours", "inclusions"], ["X", "B", "desert-safari", "Dubai", "150", "24", "Dunes"]));
    expect(r.errors).toEqual([{ field: "price.adult.inr", message: "required for a new listing — no column is mapped to it" }]);
  });
  it("flags INR/AED pairs that look swapped for review", () => {
    const [r] = importNew(csvOf(H, ["X", "B", "desert-safari", "Dubai", "150", "3400", "Non refundable", "Dunes"]));
    expect(r.warnings.find((w) => w.field === "price.adult")).toMatchObject({ review: true });
  });
});

describe("symptom: tier blank — saved as Tier B", () => {
  it("never invents a tier for a new listing", () => {
    const [r] = importNew(csvOf(H.filter((h) => h !== "tier"), R.filter((_c, i) => H[i] !== "tier")));
    expect(r.input.tier).toBeUndefined();
    expect(r.errors).toEqual([{ field: "tier", message: "required for a new listing — no column is mapped to it" }]);
  });
  it("reads tier headers with hints and tier cells with words", () => {
    expect(matchHeader("Tier (A-E)")).toEqual({ field: "tier" });
    expect(matchHeader("Tier *")).toEqual({ field: "tier" });
    const [r] = importNew(csvOf([H[0], "Tier (A–E)", ...H.slice(2)], [R[0], "C - Combos", ...R.slice(2)]));
    expect(r.input.tier).toBe("C");
  });
});

describe("symptom: durationMinutes blank — saved as not stated", () => {
  it("reads the unit from the header", () => {
    expect(matchHeader("Duration (hours)")).toEqual({ field: "durationMinutes", unit: "hours" });
    const [r] = importNew(csvOf([...H, "Duration (hrs)"], [...R, "2.5"]));
    expect(r.input.durationMinutes).toBe(150);
  });
  it("reads clock and range spellings correctly", () => {
    expect(parseDuration("1:30 hrs")).toBe(90); // was 1800: "30 hrs" matched
    expect(parseDuration("01:30:00")).toBe(90);
    expect(parseDuration("2-3 hours")).toBe(180);
    expect(parseDuration("Approx 6 Hours")).toBe(360);
    expect(parseDuration("2", "hours")).toBe(120);
  });
  it("keeps words it cannot turn into minutes instead of dropping them", () => {
    const [r] = importNew(csvOf([...H, "Duration"], [...R, "Half day"]));
    expect(r.input.durationMinutes).toBe(0);
    expect(r.input.importantInfo).toContain("Duration: Half day");
  });
  it("blank is still the explicit “not stated” state, reported", () => {
    const [r] = importNew(csvOf(H, R));
    expect(r.input.durationMinutes).toBe(0);
    expect(r.warnings.some((w) => w.field === "durationMinutes")).toBe(true);
  });
});

describe("symptom: meetingPoint blank — set to the location", () => {
  it("maps common meeting-point headers", () => {
    for (const h of ["Meeting Point / Pickup", "Pickup Point", "Meeting location", "Reporting Point"]) expect(matchHeader(h)?.field, h).toBe("meetingPoint");
    const [r] = importNew(csvOf([...H, "Meeting Point / Pickup"], [...R, "Al Awir camp gate 3"]));
    expect(r.input.meetingPoint).toBe("Al Awir camp gate 3");
  });
  it("a truly blank meeting point is derived but flagged for review", () => {
    const [r] = importNew(csvOf(H, R));
    expect(r.input.meetingPoint).toBe("Al Awir");
    expect(r.warnings.find((w) => w.field === "meetingPoint")).toMatchObject({ review: true });
  });
});

describe("symptom: cancellationPolicy blank — written from freeCancellationHours (24h)", () => {
  it("maps “Cancellation Terms” and reads its hours instead of writing a 24h policy", () => {
    const [r] = importNew(csvOf([...H.filter((h) => h !== "cancellationPolicy"), "Cancellation Terms"], [...R.filter((_c, i) => H[i] !== "cancellationPolicy"), "Free cancellation up to 48 hours before"]));
    expect(r.errors).toEqual([]);
    expect(r.input.cancellationPolicy).toBe("Free cancellation up to 48 hours before");
    expect(r.input.freeCancellationHours).toBe(48);
  });
  it("no policy and no hours is an error, not an invented 24h", () => {
    const [r] = importNew(csvOf(H.filter((h) => h !== "cancellationPolicy"), R.filter((_c, i) => H[i] !== "cancellationPolicy")));
    expect(r.input.freeCancellationHours).toBeUndefined();
    expect(r.errors).toEqual([{ field: "cancellationPolicy", message: "required for a new listing — fill cancellationPolicy or freeCancellationHours" }]);
  });
  it("a policy with no hours in it asks for the hours", () => {
    const [r] = importNew(csvOf(H, [...R.slice(0, 6), "Free cancellation available", R[7]]));
    expect(r.errors).toEqual([expect.objectContaining({ field: "freeCancellationHours" })]);
  });
  it("hours alone write a policy that states those hours", () => {
    const [r] = importNew(csvOf([...H.filter((h) => h !== "cancellationPolicy"), "freeCancellationHours"], [...R.filter((_c, i) => H[i] !== "cancellationPolicy"), "72"]));
    expect(r.input.cancellationPolicy).toBe("Free cancellation up to 72 hours before the activity; no refund after that.");
  });
});

describe("CSV reading: delimiters, encodings, header row, quotes, duplicates", () => {
  it("semicolon and tab files", () => {
    expect(parseCsv("title;tier\nA;B\n")).toMatchObject({ headers: ["title", "tier"], rows: [["A", "B"]] });
    expect(parseCsv("title\ttier\nA\tB\n")).toMatchObject({ headers: ["title", "tier"], rows: [["A", "B"]] });
  });
  it("skips title rows above the header", () => {
    const t = parseCsv("OUTLYY activity import,,\n,,\nName,Category,Price (AED)\nX,desert-safari,150\n");
    expect(t.headers).toEqual(["Name", "Category", "Price (AED)"]);
    expect(t.rows).toEqual([["X", "desert-safari", "150"]]);
    expect(t.notes?.[0]).toMatch(/Skipped 1 row above/);
  });
  it("keeps a stray quote inside an unquoted cell instead of swallowing the next rows", () => {
    const t = parseCsv('title,tier\nKids 6" tablet tour,B\nNext,C\n');
    expect(t.rows).toEqual([
      ['Kids 6" tablet tour', "B"],
      ["Next", "C"],
    ]);
  });
  it("renames duplicate headers so both columns stay mappable", () => {
    expect(parseCsv("Price,Price\n1,2\n").headers).toEqual(["Price", "Price (2)"]);
  });
  it("collapses multi-line header cells", () => {
    expect(parseCsv('"tier\n(A–E)",title\nB,X\n').headers).toEqual(["tier (A–E)", "title"]);
  });
  it("decodes UTF-16 and Windows-1252 uploads", () => {
    const utf16 = new Uint8Array([0xff, 0xfe, ...Array.from("title\tprice\nÉté\t₹5\n").flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])]);
    expect(decodeCsvBytes(utf16)).toEqual({ text: "title\tprice\nÉté\t₹5\n", encoding: "utf-16le" });
    expect(decodeCsvBytes(new Uint8Array([0x93, 0x41, 0x94]))).toEqual({ text: "“A”", encoding: "windows-1252" });
    expect(decodeCsvBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toEqual({ text: "A", encoding: "utf-8" });
  });
});

describe("populated cells never become undefined", () => {
  it("booleans with a remark keep the remark", () => {
    const [r] = importNew(csvOf([...H, "Hotel Pickup"], [...R, "Yes, from Deira and Bur Dubai hotels"]));
    expect(r.input.pickupIncluded).toBe(true);
    expect(r.input.importantInfo).toContain("Pickup: from Deira and Bur Dubai hotels");
  });
  it("unreadable structured cells are errors, not silently empty lists", () => {
    const [r] = importNew(csvOf([...H, "variants", "faqs", "isPrivate"], [...R, "[{broken json", "just some text", "sometimes"]));
    expect(r.errors.map((e) => e.field).sort()).toEqual(["faqs", "isPrivate", "variants"]);
  });
  it("add-ons without prices are errors, not free add-ons", () => {
    const [r] = importNew(csvOf([...H, "addOns"], [...R, "photos::Photo pack"]));
    expect(r.errors).toEqual([expect.objectContaining({ field: "addOns" })]);
  });
});

describe("update rows keep what the sheet does not state", () => {
  it("a five-column update changes five things and nothing else", () => {
    const existing = fixtures.find((a) => a.tier === "C")!;
    const headers = ["slug", "title", "price.adult.inr", "price.adult.aed", "inclusions"];
    const read = readRow(headers, [existing.slug, "New title", "9999", "444", "Only this"], suggestMapping(headers));
    const merged = mergeIntoExisting(existing, read);
    const parsed = activityInputSchema.parse(merged.input);
    expect(parsed).toEqual({ ...existing, title: "New title", price: { ...existing.price, adult: { inr: 9999, aed: 444 } }, inclusions: ["Only this"] });
    expect(merged.errors).toEqual([]);
  });
  it("blank cells of mapped columns keep the current value too", () => {
    const existing = fixtures[0];
    const headers = ["slug", "tier", "durationMinutes", "meetingPoint", "cancellationPolicy"];
    const merged = mergeIntoExisting(existing, readRow(headers, [existing.slug, "", "", "", ""], suggestMapping(headers)));
    expect(activityInputSchema.parse(merged.input)).toEqual(existing);
    expect(merged.warnings).toEqual([]);
  });
});

describe("template ⇄ importer round-trip", () => {
  it("the template header is exactly the contract's field list", () => {
    expect(parseCsv(toCsv([])).headers).toEqual([...IMPORT_FIELDS]);
    expect(CSV_TEMPLATE_HEADERS).toEqual(IMPORT_FIELDS);
    expect(suggestMapping([...IMPORT_FIELDS])).toEqual(Object.fromEntries(IMPORT_FIELDS.map((f) => [f, f])));
  });

  it("every fixture survives export → import as a new listing, field for field", () => {
    const t = parseCsv(toCsv(fixtures));
    const m = suggestMapping(t.headers);
    expect(t.rows).toHaveLength(fixtures.length);
    for (const [i, row] of t.rows.entries()) {
      const r = completeNewActivity(readRow(t.headers, row, m));
      expect(r.errors, fixtures[i].slug).toEqual([]);
      expect(withoutHinge(activityInputSchema.parse(r.input)), fixtures[i].slug).toEqual(withoutHinge(fixtures[i]));
    }
  });

  it("every fixture survives export → import as an update with no change and no notes", () => {
    const t = parseCsv(toCsv(fixtures));
    const m = suggestMapping(t.headers);
    for (const [i, row] of t.rows.entries()) {
      const r = mergeIntoExisting(fixtures[i], readRow(t.headers, row, m));
      expect(r.errors).toEqual([]);
      expect(activityInputSchema.parse(r.input), fixtures[i].slug).toEqual(fixtures[i]);
      expect(r.warnings.filter((w) => w.review), fixtures[i].slug).toEqual([]);
    }
  });

  it("text containing | :: newlines and quotes survives", () => {
    const a: ActivityInput = {
      ...fixtures[0],
      inclusions: ["Pickup | drop-off from Deira", 'A "quoted" line'],
      importantInfo: ["Line one\nline two"],
      faqs: [{ q: "Is it A | B?", a: "Both :: really.\nSecond line" }, { q: "No question mark", a: "Kept as written" }],
    };
    const t = parseCsv(toCsv([a]));
    const r = completeNewActivity(readRow(t.headers, t.rows[0], suggestMapping(t.headers)));
    const out = activityInputSchema.parse(r.input);
    expect(out.inclusions).toEqual(a.inclusions);
    expect(out.importantInfo).toEqual(a.importantInfo);
    expect(out.faqs).toEqual(a.faqs);
  });

  it("survives a pass through Google Sheets (time cells re-exported as 16:00:00)", () => {
    const a: ActivityInput = { ...fixtures[0], timeSlots: ["16:00"] };
    const csv = toCsv([a]).replace(/,16:00,/, ",16:00:00,");
    const t = parseCsv(csv);
    expect(activityInputSchema.parse(completeNewActivity(readRow(t.headers, t.rows[0], suggestMapping(t.headers))).input).timeSlots).toEqual(["16:00"]);
  });
});

describe("contract consistency", () => {
  it("required and derived fields are importable, disjoint, and cover every schema-required field", () => {
    const one = IMPORT_REQUIRED_ONE_OF.flat();
    for (const f of [...IMPORT_REQUIRED, ...one, ...Object.keys(IMPORT_DERIVED)]) expect(IMPORT_FIELDS).toContain(f);
    for (const f of IMPORT_REQUIRED) expect(Object.keys(IMPORT_DERIVED)).not.toContain(f);
    // A row with only the required cells (and one of each group) must validate — nothing else is needed.
    const headers = [...IMPORT_REQUIRED, "freeCancellationHours", "inclusions"];
    const [r] = importNew(csvOf(headers, ["Burj Khalifa At the Top", "A", "dubai-attractions", "Downtown", "3690", "159", "24", "Levels 124 and 125"]));
    expect(r.errors).toEqual([]);
    expect(r.parsed.success, JSON.stringify(r.parsed.error?.issues)).toBe(true);
  });
});

describe("Google links", () => {
  it("accepts multi-account /u/<n>/ links and keeps the tab", () => {
    expect(googleExportUrl("https://docs.google.com/spreadsheets/u/1/d/1AbCdEfGhIjKlMnOp/edit#gid=42", "sheet")).toBe("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/export?format=csv&gid=42");
    expect(googleExportUrl("https://docs.google.com/document/u/0/d/1AbCdEfGhIjKlMnOp/edit", "doc")).toBe("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/export?format=txt");
  });
  it("still refuses other hosts", () => {
    expect(() => googleExportUrl("https://evil.example.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit", "sheet")).toThrow();
  });
});
