import { describe, expect, it } from "vitest";
import { activities } from "@/lib/data/activities";
import { activityInputSchema, type ActivityInput } from "@/server/schemas/activity.schema";
import { guardFormula, parseCsv, readRow, suggestMapping, toCsv, unguardFormula } from "../parsers";

/**
 * H06 — CSV formula injection. These pin what the exporter WRITES (a leading
 * ' on formula-like text) and that the importer reads it back unchanged. They
 * do not run a spreadsheet: whether a given spreadsheet honours the ' is not
 * tested here.
 */

const base: ActivityInput = (() => {
  const { id: _id, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...rest } = activities[0];
  return activityInputSchema.parse(rest);
})();

function roundTrip(a: ActivityInput) {
  const csv = toCsv([a]);
  const t = parseCsv(csv);
  return { csv, cells: Object.fromEntries(t.headers.map((h, i) => [h, t.rows[0][i]])), back: readRow(t.headers, t.rows[0], suggestMapping(t.headers)).input };
}

const DANGEROUS = [
  "=1+1",
  '=HYPERLINK("http://evil","x")',
  "+1",
  "+91 98765 43210",
  "-1+2",
  "-2-3",
  "@SUM(A1)",
  "  =1+1",
  "　=1+1",
  "\t=1+1",
  "\tleading tab",
  "\rcarriage",
  "\nnew line",
  "＝1+1",
  "＋1",
  "－1+2",
  "＠SUM(A1)",
  " ＝SUM(A1)",
  "- dash bullet",
];

describe("guardFormula / unguardFormula", () => {
  it.each(DANGEROUS)("prefixes formula-like text %j and strips it again", (v) => {
    const g = guardFormula(v);
    expect(g).toBe(`'${v}`);
    expect(unguardFormula(g)).toBe(v);
  });

  it.each(["-5", "-12.5", "0", "42", "3.14"])("leaves the strict number %j alone", (v) => {
    expect(guardFormula(v)).toBe(v);
    expect(unguardFormula(v)).toBe(v);
  });

  it("leaves a value the writer knows is numeric alone, whatever its shape", () => {
    expect(guardFormula("-1e+21", { numeric: true })).toBe("-1e+21");
    expect(guardFormula("-1e+21")).toBe("'-1e+21");
  });

  it.each(["Desert safari", "", "1+1", "A-1", "email@example.com", "'hello", "'-5", "''", "it's =fine"])("leaves ordinary text %j alone in both directions", (v) => {
    expect(guardFormula(v)).toBe(v);
    expect(unguardFormula(v)).toBe(v);
  });

  it.each(["'=x", "''=x", "'+91 98", "'''@x"])("text that already starts with apostrophes before formula-like text (%j) round-trips exactly", (v) => {
    const g = guardFormula(v);
    expect(g).toBe(`'${v}`);
    expect(unguardFormula(g)).toBe(v);
  });

  it("a long run of apostrophes does not recurse", () => {
    const v = `${"'".repeat(200_000)}=x`;
    expect(unguardFormula(guardFormula(v))).toBe(v);
  });
});

describe("toCsv → parseCsv → readRow", () => {
  it("writes formula-like text inert and reads it back unchanged", () => {
    const a: ActivityInput = { ...base, title: "-1+2 Desert Ride", subtitle: "+91 98765 43210 for bookings", location: "@Marina", meetingPoint: "=HYPERLINK(\"http://evil\",\"x\")", supplier: { ...base.supplier, name: "＝SUM(A1) Tours" }, inclusions: ["- dash bullet", "+ water"] };
    const { csv, cells, back } = roundTrip(a);
    expect(cells.title).toBe("'-1+2 Desert Ride");
    expect(cells.subtitle).toBe("'+91 98765 43210 for bookings");
    expect(cells.location).toBe("'@Marina");
    expect(cells.meetingPoint.startsWith("'=")).toBe(true);
    expect(cells["supplier.name"]).toBe("'＝SUM(A1) Tours");
    expect(cells.inclusions.startsWith("'- dash bullet")).toBe(true);
    // No data line has a cell (quoted or not) that starts with a formula character.
    for (const line of csv.trimEnd().split("\r\n").slice(1)) expect(line).not.toMatch(/(^|,)"?[=+\-@＝＋－＠]/);
    expect(back.title).toBe(a.title);
    expect(back.subtitle).toBe(a.subtitle);
    expect(back.location).toBe(a.location);
    expect(back.meetingPoint).toBe(a.meetingPoint);
    expect((back.supplier as { name: string }).name).toBe(a.supplier.name);
    expect(back.inclusions).toEqual(a.inclusions);
  });

  it("numeric columns go out as plain numbers", () => {
    const a: ActivityInput = { ...base, durationMinutes: 150, price: { ...base.price, adult: { inr: 2990, aed: 129 } } };
    const { cells, back } = roundTrip(a);
    expect(cells.durationMinutes).toBe("150");
    expect(cells["price.adult.inr"]).toBe("2990");
    expect(back.durationMinutes).toBe(150);
    expect(back.price).toMatchObject({ adult: { inr: 2990, aed: 129 } });
  });

  it("legitimate text starting with an apostrophe is not corrupted", () => {
    const a: ActivityInput = { ...base, title: "'Dhow' Cruise", subtitle: "'=not a formula, an apostrophe first" };
    const { cells, back } = roundTrip(a);
    expect(cells.title).toBe("'Dhow' Cruise");
    expect(cells.subtitle).toBe("''=not a formula, an apostrophe first");
    expect(back.title).toBe(a.title);
    expect(back.subtitle).toBe(a.subtitle);
  });

  it("an operator sheet cell written as '=x (spreadsheet text escape) imports as =x", () => {
    const t = parseCsv(`title,subtitle\n'=x Tour,'+971 4 000\n`);
    const back = readRow(t.headers, t.rows[0], suggestMapping(t.headers)).input;
    expect(back.title).toBe("=x Tour");
    expect(back.subtitle).toBe("+971 4 000");
  });
});
