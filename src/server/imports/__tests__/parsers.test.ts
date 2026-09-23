import { describe, expect, it } from "vitest";
import { activities } from "@/lib/data/activities";
import { activityInputSchema } from "@/server/schemas/activity.schema";
import { parseCsv, parseDocToDraft, parseDuration, parseFaqs, rowToInput, suggestMapping, toCsv } from "../parsers";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded newlines, CRLF and BOM", () => {
    const csv = '\uFEFFtitle,notes,price\r\n"Burj, Khalifa","He said ""hi""\nsecond line",3690\r\nDesert,,1500\r\n';
    const t = parseCsv(csv);
    expect(t.headers).toEqual(["title", "notes", "price"]);
    expect(t.rows).toEqual([
      ["Burj, Khalifa", 'He said "hi"\nsecond line', "3690"],
      ["Desert", "", "1500"],
    ]);
  });

  it("pads ragged rows and drops empty lines", () => {
    const t = parseCsv("a,b,c\n1,2\n\n4,5,6,7\n");
    expect(t.rows).toEqual([
      ["1", "2", ""],
      ["4", "5", "6"],
    ]);
  });

  it("returns empty for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("suggestMapping", () => {
  it("maps exact field names and common aliases", () => {
    const m = suggestMapping(["Activity Name", "Category", "Price (INR)", "Price AED", "Duration", "What's included", "slug", "seo.title"]);
    expect(m.title).toBe("Activity Name");
    expect(m.categorySlug).toBe("Category");
    expect(m["price.adult.inr"]).toBe("Price (INR)");
    expect(m["price.adult.aed"]).toBe("Price AED");
    expect(m.durationMinutes).toBe("Duration");
    expect(m.inclusions).toBe("What's included");
    expect(m.slug).toBe("slug");
    expect(m["seo.title"]).toBe("seo.title");
    expect(m.exclusions).toBeNull();
  });
});

describe("rowToInput", () => {
  it("coerces types, lists, durations and derives slug/seo/supplier defaults", () => {
    const headers = ["Activity Name", "Category", "Price (INR)", "Price AED", "Duration", "Inclusions", "Pickup", "Cancellation", "Location", "Meeting point", "Tier", "Sub title"];
    const row = ["Dune Bashing Safari", "Desert Safari", "₹2,990", "129", "2h 30m", "Pickup | Dinner | Camel ride", "yes", "Free until 24h before", "Al Awir", "Hotel lobby", "b", "Classic evening safari"];
    const m = suggestMapping(headers);
    m.subtitle = "Sub title";
    const input = rowToInput(headers, row, m);
    expect(input.slug).toBe("dune-bashing-safari");
    expect(input.categorySlug).toBe("desert-safari");
    expect(input.durationMinutes).toBe(150);
    expect(input.inclusions).toEqual(["Pickup", "Dinner", "Camel ride"]);
    expect(input.pickupIncluded).toBe(true);
    expect(input.tier).toBe("B");
    expect((input.price as { adult: { inr: number; aed: number } }).adult).toEqual({ inr: 2990, aed: 129 });
    expect((input.seo as { title: string }).title).toContain("Dune Bashing Safari");
    const parsed = activityInputSchema.safeParse(input);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("never lets an unmapped or unknown column into the input", () => {
    const headers = ["title", "isAdmin", "__proto__"];
    const input = rowToInput(headers, ["X", "true", "{}"], suggestMapping(headers));
    expect("isAdmin" in input).toBe(false);
    expect(Object.getPrototypeOf(input)).toBe(Object.prototype);
  });
});

describe("parseDuration / parseFaqs", () => {
  it("parses common duration spellings", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("2 hours 15 mins")).toBe(135);
    expect(parseDuration("1 day")).toBe(1440);
    expect(parseDuration("soon")).toBeUndefined();
  });
  it("parses q::a and Q:/A: notations and JSON", () => {
    expect(parseFaqs("Is food veg?::Yes | Pickup?::Included")).toEqual([
      { q: "Is food veg?", a: "Yes" },
      { q: "Pickup?", a: "Included" },
    ]);
    expect(parseFaqs('[{"q":"A?","a":"B"}]')).toEqual([{ q: "A?", a: "B" }]);
  });
});

describe("parseDocToDraft", () => {
  it("turns a headed Google Doc export into a draft", () => {
    const doc = `Sunset Dhow Cruise

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
- Unlimited soft drinks

Inclusions
• Buffet dinner (veg & Jain on request)
• Hotel pickup

Exclusions
- Alcohol

Cancellation policy
Free cancellation until 24 hours before.

FAQ
Is the food Jain?::Yes, on request at booking.
`;
    const d = parseDocToDraft(doc);
    expect(d.input.title).toBe("Sunset Dhow Cruise");
    expect(d.input.subtitle).toBe("Two hours on the Marina with a veg buffet");
    expect(d.input.categorySlug).toBe("cruises-yachts");
    expect(d.input.durationMinutes).toBe(120);
    expect(d.input.inclusions).toEqual(["Live tanoura show", "Unlimited soft drinks", "Buffet dinner (veg & Jain on request)", "Hotel pickup"]);
    expect(d.input.exclusions).toEqual(["Alcohol"]);
    expect(d.input.faqs).toEqual([{ q: "Is the food Jain?", a: "Yes, on request at booking." }]);
    expect(d.warnings).toEqual([]);
    const parsed = activityInputSchema.safeParse(d.input);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("warns about missing sections instead of failing", () => {
    const d = parseDocToDraft("Just a title line\nSome prose without headings.");
    expect(d.input.title).toBe("Just a title line");
    expect(d.warnings.length).toBeGreaterThan(0);
  });
});

describe("toCsv round-trip", () => {
  it("re-imports every fixture activity with zero validation errors", () => {
    const inputs = activities.map(({ id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...rest }) => activityInputSchema.parse(rest));
    const csv = toCsv(inputs);
    const table = parseCsv(csv);
    expect(table.rows.length).toBe(activities.length);
    const mapping = suggestMapping(table.headers);
    for (const [i, row] of table.rows.entries()) {
      const input = rowToInput(table.headers, row, mapping);
      const parsed = activityInputSchema.safeParse(input);
      expect(parsed.success, `${inputs[i].slug}: ${JSON.stringify(parsed.error?.issues.slice(0, 3))}`).toBe(true);
      if (parsed.success) {
        expect(parsed.data.slug).toBe(inputs[i].slug);
        expect(parsed.data.price).toEqual(inputs[i].price);
        expect(parsed.data.inclusions).toEqual(inputs[i].inclusions);
        expect(parsed.data.faqs).toEqual(inputs[i].faqs);
        expect(parsed.data.variants).toEqual(inputs[i].variants);
        expect(parsed.data.addOns).toEqual(inputs[i].addOns);
      }
    }
  });
});
