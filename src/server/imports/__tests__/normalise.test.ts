import { describe, expect, it } from "vitest";
import { activityInputSchema } from "@/server/schemas/activity.schema";
import { normaliseEnumList, rowToInputWithWarnings, suggestMapping } from "../parsers";
import { resolveCategory } from "../categories";

/**
 * Shaped after the real tester file ("Rayna Tours … Activities.csv"): template
 * column names filled with the supplier's own vocabulary. The parser must map
 * that vocabulary onto the schema and report every derivation; the schema is
 * unchanged.
 */
describe("supplier-vocabulary normalisation", () => {
  const headers = ["slug", "title", "subtitle", "tier", "categorySlug", "location", "meetingPoint", "durationMinutes", "price.adult.inr", "price.adult.aed", "images", "imageAlt", "inclusions", "cancellationPolicy", "freeCancellationHours", "dietary", "suitability", "timeSlots", "pickupIncluded", "confirmation", "badges", "supplier.name", "supplier.source"];
  const row = [
    "can-am-maverick-buggy-tour",
    "Can-Am Maverick Buggy Tour",
    "",
    "luxury",
    "adventure-tours",
    "Dubai City",
    "",
    "60",
    "37841",
    "1450.05",
    "https://cdn.example.com/Tour Images/a b.jpg | https://cdn.example.com/c.jpg",
    "Two riders in a buggy kicking up dust while driving across golden dunes in the desert at sunset with a dramatic sky and long shadows over the sand and rocks behind them | Second alt text that is also long",
    "Shared pick-up and drop-off | Dune bashing",
    "Non Refundable",
    "",
    "Vegetarian and non-vegetarian buffet",
    "Not recommended for pregnant individuals | Children must be accompanied by an adult | Minimum age 6",
    "Tours available at Multiple Slots",
    "Yes",
    "Instant Confirmation",
    "New | Instant Confirmation | Mobile Voucher Accepted",
    "Rayna Tours",
    "raynatours.com",
  ];

  it("maps words to enum tokens, rounds fils, derives blanks, keeps leftovers, and validates", () => {
    const { input, warnings } = rowToInputWithWarnings(headers, row, suggestMapping(headers));
    expect(input.tier).toBe("D");
    expect(input.confirmation).toBe("instant");
    expect((input.price as { adult: { aed: number } }).adult.aed).toBe(1450);
    expect([...(input.dietary as string[])].sort()).toEqual(["non-veg", "veg"]);
    expect(input.suitability).toEqual(["kids"]);
    expect(input.importantInfo).toEqual(["Not recommended for pregnant individuals", "Minimum age 6"]);
    expect(String(input.imageAlt).length).toBeLessThanOrEqual(200);
    expect((input.images as string[])[0]).toBe("https://cdn.example.com/Tour%20Images/a%20b.jpg");
    expect(input.freeCancellationHours).toBe(0);
    expect(input.meetingPoint).toBe("Dubai City");
    expect(input.subtitle).toBe("Shared pick-up and drop-off");
    expect((input.supplier as { source: string }).source).toBe("rayna");
    expect(input.badges).toEqual({ newlyAdded: true });
    expect(warnings.map((w) => w.field)).toEqual(expect.arrayContaining(["tier", "confirmation", "price.adult.aed", "dietary", "suitability", "imageAlt", "subtitle", "meetingPoint", "supplier.source", "freeCancellationHours"]));
    // Category is resolved by the service; everything else must validate as-is.
    const parsed = activityInputSchema.safeParse({ ...input, categorySlug: "desert-safari" });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("treats a blank duration as not stated and derives a policy from the hours", () => {
    const h = ["title", "categorySlug", "location", "price.adult.inr", "price.adult.aed", "freeCancellationHours"];
    const { input, warnings } = rowToInputWithWarnings(h, ["Deep Dive Dubai", "water-activities", "Dubai", "10281", "394", "48"], suggestMapping(h));
    expect(input.durationMinutes).toBe(0);
    expect(input.cancellationPolicy).toContain("48 hours");
    expect(warnings.some((w) => w.field === "durationMinutes")).toBe(true);
    const r = activityInputSchema.safeParse(input);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it("does not turn a negated mention into a suitability", () => {
    expect(
      normaliseEnumList(
        ["Not suitable for kids under 5", "Great for couples"],
        [
          [/kids?|child/, "kids"],
          [/couple/, "couples"],
        ],
        ["kids", "couples"],
      ),
    ).toEqual({ values: ["couples"], leftover: ["Not suitable for kids under 5"] });
  });

  it("still rejects what cannot be normalised (tier, confirmation) instead of guessing", () => {
    const h = ["title", "tier", "confirmation", "categorySlug", "location", "price.adult.inr", "price.adult.aed"];
    const { input } = rowToInputWithWarnings(h, ["X", "platinum", "maybe later", "desert-safari", "Dubai", "1", "1"], suggestMapping(h));
    expect(input.tier).toBe("PLATINUM");
    expect(input.confirmation).toBe("manual"); // blank/unknown → manual is the safe default
    const r = activityInputSchema.safeParse(input);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain("tier");
  });
});

describe("resolveCategory", () => {
  const known = [
    { slug: "desert-safari", name: "Desert Safari", shortName: "Desert safari" },
    { slug: "cruises-yachts", name: "Cruises & Yachts", shortName: "Cruises & yachts" },
    { slug: "dubai-attractions", name: "Dubai Attractions & Tickets", shortName: "Attractions" },
  ];
  it("resolves exact, name, alias, keyword, title, and reports none", () => {
    expect(resolveCategory("desert-safari", "", known)).toEqual({ slug: "desert-safari", how: "exact" });
    expect(resolveCategory("Attractions", "", known)).toEqual({ slug: "dubai-attractions", how: "name" });
    expect(resolveCategory("dhow-cruise", "", known)).toEqual({ slug: "cruises-yachts", how: "alias" });
    expect(resolveCategory("Desert Adventures", "", known)).toEqual({ slug: "desert-safari", how: "keyword" });
    expect(resolveCategory("adventure-tours", "Evening Dune Buggy Ride", known)).toEqual({ slug: "desert-safari", how: "title" });
    expect(resolveCategory("events-and-occasions", "New Year Gala", known)).toEqual({ slug: null, how: "none" });
  });
});
