/**
 * Human-facing reference checks — the client-side twin of
 * `src/server/lib/ids.ts` (which is `server-only` and cannot be imported by
 * pages). Pure: no imports, no I/O. Keep the two Luhn implementations
 * identical; the server is the source of truth.
 *
 * References look like INQ-104821 / OUT-482913: a sequence body plus one Luhn
 * check digit. Checking here rejects most typos before a request is made and
 * spares the lookup rate limit (5 per IP per 15 minutes) for real attempts.
 */

export type ReferencePrefix = "INQ" | "OUT";

export function luhnCheckDigit(digits: string): number {
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

/** Uppercase, trimmed, no internal whitespace: " inq-104821 " → "INQ-104821". */
export function normaliseReference(ref: string): string {
  return ref.trim().toUpperCase().replace(/\s+/g, "");
}

/** Structural + check-digit validation. Never says *which* part is wrong. */
export function isValidReference(ref: string, prefix: ReferencePrefix): boolean {
  const m = new RegExp(`^${prefix}-(\\d{5,10})$`).exec(normaliseReference(ref));
  if (!m) return false;
  const digits = m[1];
  const body = digits.slice(0, -1);
  return luhnCheckDigit(body) === Number(digits.slice(-1));
}
