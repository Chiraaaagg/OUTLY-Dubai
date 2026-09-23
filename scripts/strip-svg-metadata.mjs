/**
 * Strip C2PA provenance blobs from the SVGs we serve.
 *
 * Every SVG in the brand pack carries a `<metadata><c2pa:manifest>` block of
 * base64 — about 7.7 KB in a 9.4 KB file, so roughly 82% of the bytes on the
 * wire are provenance that no browser reads. On the empty states, the 404, the
 * loader and the favicon that is real weight on real pages.
 *
 * The masters in `brand/` are left untouched, so the provenance chain survives
 * where it matters. Only the copies under `public/` and `src/app/` are cleaned.
 *
 * Run: node scripts/strip-svg-metadata.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";

const CHECK = process.argv.includes("--check");
const ROOTS = ["public", path.join("src", "app")];

function* svgs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* svgs(full);
    else if (entry.name.endsWith(".svg")) yield full;
  }
}

let saved = 0;
let touched = 0;

for (const root of ROOTS) {
  for (const file of svgs(root)) {
    const before = fs.readFileSync(file, "utf8");
    const after = before
      .replace(/<metadata>[\s\S]*?<\/metadata>/g, "")
      .replace(/\s+xmlns:c2pa="[^"]*"/g, "");
    if (after === before) continue;
    saved += Buffer.byteLength(before) - Buffer.byteLength(after);
    touched++;
    if (!CHECK) fs.writeFileSync(file, after);
    console.log(`${CHECK ? "would strip" : "stripped"} ${file}: ${Buffer.byteLength(before)} → ${Buffer.byteLength(after)} bytes`);
  }
}

console.log(`\n${touched} files, ${(saved / 1024).toFixed(1)} KB ${CHECK ? "recoverable" : "saved"}`);
