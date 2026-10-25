/**
 * Structured data (JSON-LD) for `<script type="application/ld+json">`.
 *
 * `JSON.stringify` alone is not safe inside a script element: JSON escaping
 * leaves `</script>` intact, so catalogue text containing it would end the
 * element and anything after it would run as HTML. Every `<` is therefore
 * written as the JSON escape `<`, which an HTML parser cannot read as a
 * tag and which `JSON.parse` turns back into `<` — the data is unchanged for
 * search engines. This is the escaping the Next.js JSON-LD guide prescribes.
 *
 * Use this for every JSON-LD sink; never pass raw `JSON.stringify` output to
 * `dangerouslySetInnerHTML`.
 */
export function serializeJsonLd(value: unknown): string {
  // JSON.stringify(undefined) is undefined, not a string; emit JSON null instead.
  return (JSON.stringify(value) ?? "null").replace(/</g, "\\u003c");
}
