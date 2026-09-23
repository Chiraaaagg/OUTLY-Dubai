import { randomBytes } from "node:crypto";

/**
 * Identifiers.
 *  - UUIDv7 primary keys: time-ordered, index-friendly (§05.1 rule 7).
 *  - Human-facing references: DB sequence + Luhn check digit, formatted
 *    INQ-104821 / OUT-482913. The check digit rejects most typos and casual
 *    enumeration before a query is made.
 */

export function uuidv7(): string {
  const ts = BigInt(Date.now());
  const bytes = randomBytes(16);
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

export type ReferencePrefix = "INQ" | "OUT";

export function formatReference(prefix: ReferencePrefix, sequence: number | bigint): string {
  const body = String(sequence);
  return `${prefix}-${body}${luhnCheckDigit(body)}`;
}

/** Cheap structural validation before touching the database (§17 §9 #4). */
export function isValidReference(ref: string, prefix: ReferencePrefix): boolean {
  const m = new RegExp(`^${prefix}-(\\d{5,10})$`).exec(ref.trim().toUpperCase());
  if (!m) return false;
  const digits = m[1];
  const body = digits.slice(0, -1);
  return luhnCheckDigit(body) === Number(digits.slice(-1));
}

export function normaliseReference(ref: string): string {
  return ref.trim().toUpperCase().replace(/\s+/g, "");
}
