/**
 * Replace em dashes in customer-facing copy.
 *
 * The em dash is the single strongest structural tell in AI-written prose, and
 * the storefront carried 402 of them. Vocabulary fixes do nothing while the
 * punctuation rhythm stays machine-shaped, so this is the higher-value pass.
 *
 * The rules are deliberately conservative, because a wrong replacement changes
 * meaning and a missed one costs nothing:
 *
 *   " — " before a capital letter or a clause that ends the string  ->  ". "
 *   " — " mid-sentence (lowercase continuation)                     ->  ", "
 *   "word—word" with no spaces (a range or compound)                ->  left alone
 *
 * Code comments are skipped: a dash in a JSDoc block is not something a
 * customer ever reads, and rewriting them would churn the diff for no gain.
 *
 * Usage: node scripts/sweep-em-dashes.mjs [--apply] [glob-ish path prefix...]
 */
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOTS = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TARGETS = ROOTS.length ? ROOTS : ["src/app", "src/components", "src/lib/data"];
const EXT = new Set([".ts", ".tsx"]);

/**
 * Never rewrite these.
 *
 * `sister-reviews.ts` holds real Google reviews written by real customers.
 * Editing their punctuation to make our site sound less machine-written would
 * be altering a testimonial, which is the exact thing the fake-review rules
 * exist to stop. Their em dashes stay.
 */
const NEVER = ["sister-reviews.ts"];

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      yield* walk(full);
    } else if (EXT.has(path.extname(e.name))) yield full;
  }
}

/** A line that is part of a comment block — not customer copy. */
function isComment(line) {
  const t = line.trim();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
}

/** Sentence-ish: the tail after the dash reads as a full clause we can promote. */
function endsClause(tail) {
  return /^[A-Z]/.test(tail.trim());
}

let files = 0;
let replaced = 0;
const samples = [];

for (const target of TARGETS) {
  for (const file of walk(target)) {
    if (NEVER.some((n) => file.endsWith(n))) continue;
    const before = fs.readFileSync(file, "utf8");
    if (!before.includes("—")) continue;

    const out = before
      .split("\n")
      .map((line) => {
        if (isComment(line) || !line.includes("—")) return line;
        return line.replace(/ — (.)/g, (m, next) => {
          replaced++;
          if (samples.length < 12) samples.push(`${path.basename(file)}: … — ${next}…`);
          // A capitalised continuation is its own sentence; lowercase is an aside.
          return endsClause(next) ? `. ${next}` : `, ${next}`;
        });
      })
      .join("\n");

    if (out !== before) {
      files++;
      if (APPLY) fs.writeFileSync(file, out);
    }
  }
}

console.log(`${APPLY ? "rewrote" : "would rewrite"} ${replaced} em dashes across ${files} files`);
if (!APPLY) {
  console.log("\nsamples:");
  for (const s of samples) console.log("  " + s);
  console.log("\nDry run. Re-run with --apply.");
}
