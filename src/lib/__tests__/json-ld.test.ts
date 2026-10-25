import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "@/lib/json-ld";

/**
 * serializeJsonLd output is written verbatim inside
 * `<script type="application/ld+json">`. Two properties matter:
 *
 *  1. Containment: nothing in the output can end the script element or open
 *     a comment/escape state in the HTML tokenizer. Every one of those needs a
 *     literal `<`, so the output must contain no `<` at all.
 *  2. Fidelity: `JSON.parse(output)` must give back exactly the input, so
 *     search engines read the same structured data as before.
 */

const PAYLOADS: Record<string, string> = {
  closingScript: "</script><script>document.documentElement.dataset.lunaProof=1</script>",
  mixedCase: "</ScRiPt><sCrIpT>document.documentElement.dataset.lunaProof=1</sCrIpT>",
  closingWithSpace: "</script >x",
  closingWithSlash: "</script/>x",
  htmlComment: "<!-- <script> --> after",
  commentOnly: "<!--",
  quotes: `He said "hi" and it's fine \\ backslash`,
  lineSeparators: "a b c",
  nonAscii: "Burj Khalifa — بُرْج خَلِيفَة · ₹3,690 · 🏜️ · Ünïcödé",
  ampersand: "Tom &amp; Jerry &lt;b&gt;",
  controlChars: "tab\tnew\nline\rnull\u0000",
};

function roundTrip(value: unknown) {
  return JSON.parse(serializeJsonLd(value));
}

describe("serializeJsonLd", () => {
  for (const [name, payload] of Object.entries(PAYLOADS)) {
    it(`contains and round-trips: ${name}`, () => {
      const doc = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [{ "@type": "Question", name: payload, acceptedAnswer: { "@type": "Answer", text: payload } }],
      };
      const out = serializeJsonLd(doc);
      expect(out).not.toContain("<");
      expect(out.toLowerCase()).not.toContain("</script");
      expect(out).not.toContain("<!--");
      expect(JSON.parse(out)).toEqual(doc);
    });
  }

  it("escapes every < as \\u003c and leaves other characters alone", () => {
    expect(serializeJsonLd("<a><b>")).toBe('"\\u003ca>\\u003cb>"');
    expect(serializeJsonLd({ a: "x>y" })).toBe('{"a":"x>y"}');
  });

  it("is byte-identical to JSON.stringify when there is no <", () => {
    const doc = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Product", name: "Desert Safari", description: "Pickup & dinner — ₹1,990", offers: { price: 1990 } },
        { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Dubai", item: "https://outlyy.com/" }] },
      ],
    };
    expect(serializeJsonLd(doc)).toBe(JSON.stringify(doc));
  });

  it("keeps U+2028 / U+2029 as data (valid in JSON and ES2019+ string literals)", () => {
    const value = { text: "a b c" };
    expect(roundTrip(value)).toEqual(value);
    // Also evaluates as a JS expression unchanged (the GA bootstrap relies on this).
    expect(new Function(`return ${serializeJsonLd(value.text)}`)()).toBe(value.text);
  });

  it("round-trips nested arrays, numbers, booleans and null", () => {
    const value = { list: [1, 2.5, -3, true, false, null, ["</script>", { deep: "<!--x-->" }]] };
    expect(roundTrip(value)).toEqual(value);
  });

  it("does not let a parsed HTML document see an early end tag", () => {
    // Model of the HTML script-data state: the element ends at the first
    // case-insensitive `</script`, and `<!--` + `<script` switch to the
    // double-escaped state. With no `<` in the body neither can occur.
    const body = serializeJsonLd({ t: PAYLOADS.mixedCase, c: PAYLOADS.htmlComment });
    const html = `<script type="application/ld+json">${body}</script>`;
    const firstEnd = html.toLowerCase().indexOf("</script");
    expect(firstEnd).toBe(html.length - "</script>".length);
  });
});
