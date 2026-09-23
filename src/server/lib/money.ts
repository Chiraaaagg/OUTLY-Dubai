import type { Money } from "@/lib/types";

/**
 * Money at the boundary (§03.4.3): the database holds BigInt minor units
 * (paise, fils); the API and UI use `Money` in major units for display only.
 * Conversion happens here and nowhere else.
 */

export function toMinor(major: number): bigint {
  return BigInt(Math.round(major * 100));
}

export function toMajor(minor: bigint | number | null | undefined): number {
  if (minor === null || minor === undefined) return 0;
  return Number(minor) / 100;
}

export function moneyToMinor(m: Money): { inr: bigint; aed: bigint } {
  return { inr: toMinor(m.inr), aed: toMinor(m.aed) };
}

export function minorToMoney(inr: bigint | number | null | undefined, aed: bigint | number | null | undefined): Money {
  return { inr: toMajor(inr), aed: toMajor(aed) };
}

/** Percent difference of `confirmed` against `indicative`, for the tolerance rule (§17 open Q4). */
export function percentDelta(indicative: bigint, confirmed: bigint): number {
  if (indicative === 0n) return confirmed === 0n ? 0 : 100;
  return (Number(confirmed - indicative) / Number(indicative)) * 100;
}

/** JSON.stringify replacer — BigInt → number of major units is a display concern; here we emit strings. */
export function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
