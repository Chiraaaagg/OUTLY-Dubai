import { describe, expect, it } from "vitest";
import { formatReference, isValidReference, luhnCheckDigit, normaliseReference, uuidv7 } from "../ids";

describe("ids: Luhn check digit", () => {
  it("matches the textbook example", () => {
    // 7992739871 → check digit 3 (79927398713 is the classic valid Luhn number)
    expect(luhnCheckDigit("7992739871")).toBe(3);
  });

  it("handles single digits and zero", () => {
    expect(luhnCheckDigit("0")).toBe(0);
    expect(luhnCheckDigit("5")).toBe(9); // 5*2 = 10 → 1; (10 - 1) % 10 = 9
    expect(luhnCheckDigit("9")).toBe(1); // 9*2 = 18 → 9; (10 - 9) % 10 = 1
  });

  it("produces a digit that makes the full number pass the Luhn test", () => {
    const luhnValid = (s: string) => {
      let sum = 0;
      let dbl = false;
      for (let i = s.length - 1; i >= 0; i--) {
        let d = Number(s[i]);
        if (dbl) {
          d *= 2;
          if (d > 9) d -= 9;
        }
        sum += d;
        dbl = !dbl;
      }
      return sum % 10 === 0;
    };
    for (const body of ["1", "10482", "104821", "482913", "999999", "1000000", "123456789"]) {
      expect(luhnValid(`${body}${luhnCheckDigit(body)}`), body).toBe(true);
    }
  });
});

describe("ids: human references", () => {
  it("formats sequence + check digit with the prefix", () => {
    expect(formatReference("INQ", 10482)).toBe(`INQ-10482${luhnCheckDigit("10482")}`);
    expect(formatReference("OUT", 482913n)).toBe(`OUT-482913${luhnCheckDigit("482913")}`);
  });

  it("round-trips through validation", () => {
    for (const seq of [10000, 10482, 104821, 999999, 1234567]) {
      expect(isValidReference(formatReference("INQ", seq), "INQ")).toBe(true);
      expect(isValidReference(formatReference("OUT", seq), "OUT")).toBe(true);
    }
  });

  it("rejects a single-digit typo anywhere in the body", () => {
    const ref = formatReference("INQ", 104821); // INQ-104821X
    const digits = ref.slice(4);
    for (let i = 0; i < digits.length; i++) {
      const wrong = (Number(digits[i]) + 1) % 10;
      const mutated = `INQ-${digits.slice(0, i)}${wrong}${digits.slice(i + 1)}`;
      expect(isValidReference(mutated, "INQ"), mutated).toBe(false);
    }
  });

  it("rejects the wrong prefix, bad shapes and out-of-range lengths", () => {
    const ref = formatReference("INQ", 104821);
    expect(isValidReference(ref, "OUT")).toBe(false);
    expect(isValidReference("INQ-", "INQ")).toBe(false);
    expect(isValidReference("INQ-12", "INQ")).toBe(false); // too short
    expect(isValidReference("INQ-123456789012", "INQ")).toBe(false); // too long
    expect(isValidReference("INQ 104821", "INQ")).toBe(false);
    expect(isValidReference("104821", "INQ")).toBe(false);
    expect(isValidReference("", "INQ")).toBe(false);
  });

  it("is case- and whitespace-tolerant after normalisation", () => {
    const ref = formatReference("INQ", 104821);
    expect(isValidReference(ref.toLowerCase(), "INQ")).toBe(true);
    expect(isValidReference(`  ${ref}  `, "INQ")).toBe(true);
    expect(normaliseReference(` inq - 104821 `)).toBe("INQ-104821");
    expect(normaliseReference("inq-104821\n")).toBe("INQ-104821");
  });

  it("rejects most casual enumeration: only one in ten neighbours validates", () => {
    const valid = formatReference("INQ", 104821);
    const body = valid.slice(4, -1);
    let passes = 0;
    for (let d = 0; d < 10; d++) if (isValidReference(`INQ-${body}${d}`, "INQ")) passes++;
    expect(passes).toBe(1);
  });
});

describe("ids: uuidv7", () => {
  it("has the RFC shape with version 7 and the 10xx variant", () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("is unique and roughly time-ordered", () => {
    const ids = Array.from({ length: 200 }, () => uuidv7());
    expect(new Set(ids).size).toBe(200);
    // The first 48 bits are the millisecond timestamp, so ids generated later never sort earlier.
    const prefixes = ids.map((i) => i.slice(0, 13));
    for (let i = 1; i < prefixes.length; i++) expect(prefixes[i] >= prefixes[i - 1]).toBe(true);
  });
});
