/**
 * Phone normalisation and validation — ONE implementation shared by the
 * inquiry form (client) and the inquiry service (server), so a number can
 * never pass the form and fail the API (audit issue S10).
 *
 * Pure: no imports, no I/O. `src/server/domain/phone.ts` re-exports this.
 */

export interface NormalisedPhone {
  e164: string;
  countryCode: string;
  national: string;
  valid: boolean;
  /** Plain-language reason when `valid` is false, written for the customer. */
  reason?: string;
}

interface CountryRule {
  name: string;
  /** Accepted national lengths (digits, after stripping trunk 0 and country code). */
  length: number[];
  /** First-digit constraint for mobiles, where the numbering plan has one. */
  first?: RegExp;
  firstHint?: string;
}

export const PHONE_RULES: Record<string, CountryRule> = {
  "+91": { name: "Indian", length: [10], first: /^[6-9]/, firstHint: "start with 6, 7, 8 or 9" },
  "+971": { name: "UAE", length: [9], first: /^5/, firstHint: "start with 5" },
};

export const SUPPORTED_COUNTRY_CODES = Object.keys(PHONE_RULES);

const plural = (n: number) => `${n} digit${n === 1 ? "" : "s"}`;

function describeLength(rule: CountryRule): string {
  return rule.length.map(plural).join(" or ");
}

export function normalisePhone(raw: string, countryCode = "+91"): NormalisedPhone {
  let digits = raw.replace(/[^\d+]/g, "");
  let cc = countryCode.startsWith("+") ? countryCode : `+${countryCode}`;

  if (digits.startsWith("+")) {
    const all = digits.slice(1);
    const known = SUPPORTED_COUNTRY_CODES.find((k) => all.startsWith(k.slice(1)));
    if (known) {
      cc = known;
      digits = all.slice(known.length - 1);
    } else {
      const valid = all.length >= 8 && all.length <= 15;
      return {
        e164: `+${all}`,
        countryCode: `+${all.slice(0, 2)}`,
        national: all.slice(2),
        valid,
        reason: valid ? undefined : "That doesn't look like a complete international number.",
      };
    }
  } else if (digits.startsWith("00")) {
    return normalisePhone(`+${digits.slice(2)}`, cc);
  } else {
    // National number — tolerate a leading trunk 0 and a repeated country code ("919876…").
    const ccDigits = cc.slice(1);
    const rule = PHONE_RULES[cc];
    if (rule && digits.startsWith(ccDigits) && digits.length > Math.max(...rule.length)) {
      digits = digits.slice(ccDigits.length);
    }
    digits = digits.replace(/^0+/, "");
  }

  const rule = PHONE_RULES[cc];
  if (!rule) {
    const valid = digits.length >= 6 && digits.length <= 13;
    return { e164: `${cc}${digits}`, countryCode: cc, national: digits, valid, reason: valid ? undefined : "That doesn't look like a complete number." };
  }

  if (!digits.length) {
    return { e164: `${cc}${digits}`, countryCode: cc, national: digits, valid: false, reason: "Enter your WhatsApp number." };
  }
  if (!rule.length.includes(digits.length)) {
    return {
      e164: `${cc}${digits}`,
      countryCode: cc,
      national: digits,
      valid: false,
      reason: `${rule.name} mobile numbers are ${describeLength(rule)} — you entered ${plural(digits.length)}.`,
    };
  }
  if (rule.first && !rule.first.test(digits)) {
    return {
      e164: `${cc}${digits}`,
      countryCode: cc,
      national: digits,
      valid: false,
      reason: `${rule.name} mobile numbers ${rule.firstHint}. Check the first digit.`,
    };
  }
  return { e164: `${cc}${digits}`, countryCode: cc, national: digits, valid: true };
}

/** Display form: +91 98765 43210 · +971 50 123 4567 */
export function formatPhone(e164: string): string {
  if (e164.startsWith("+91") && e164.length === 13) return `+91 ${e164.slice(3, 8)} ${e164.slice(8)}`;
  if (e164.startsWith("+971") && e164.length === 13) return `+971 ${e164.slice(4, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`;
  return e164;
}

/** Last four digits only — for lists and logs. */
export function maskPhone(e164: string): string {
  return `${e164.slice(0, 3)}•••••${e164.slice(-4)}`;
}
