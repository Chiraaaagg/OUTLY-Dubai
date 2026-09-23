/**
 * Site identity — every legal identifier, contact point and company detail the
 * storefront renders comes from here, and every one of them comes from an
 * environment variable.
 *
 * Rule: an unset value renders **nothing**. There is no placeholder legal name,
 * no placeholder address, no invented licence number. A customer must never be
 * shown an identifier that is not the real one — that is a trust and legal
 * problem, not a cosmetic one (see docs/legal-compliance-audit.md).
 *
 * The contracting company is H P D Tourism L.L.C; "OUTLYY" is the trading name.
 * `entityLine()` is the sentence that must appear wherever the brand is used
 * in a contractual context (footer, legal pages, confirmations).
 */

function optional(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/**
 * Development-only fallback so `wa.me` links are never malformed. Exported for
 * `src/lib/whatsapp.ts`; nothing may render it as a phone number.
 */
export const PLACEHOLDER_WHATSAPP = "919000000000";

const whatsappDigits = optional(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)?.replace(/\D/g, "");
const emergencyRaw = optional(process.env.NEXT_PUBLIC_EMERGENCY_PHONE);

export const siteConfig = {
  name: "OUTLYY",
  /** Registered company name. Undefined until set — never a default. */
  legalName: optional(process.env.NEXT_PUBLIC_LEGAL_NAME),
  siteUrl: optional(process.env.NEXT_PUBLIC_SITE_URL) ?? "https://outlyy.com",

  /** Digits only, with country code. `undefined` when unset or still the placeholder. */
  whatsappNumber: whatsappDigits && whatsappDigits !== PLACEHOLDER_WHATSAPP ? whatsappDigits : undefined,
  /** E.164, e.g. +97141234567. `undefined` when unset or an obvious placeholder (all zeros). */
  emergencyPhone: emergencyRaw && !/0{6,}/.test(emergencyRaw.replace(/\D/g, "")) ? emergencyRaw : undefined,
  supportEmail: optional(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),

  /** Legal identifiers — rendered only when present. */
  gstin: optional(process.env.NEXT_PUBLIC_GSTIN),
  dubaiLicence: optional(process.env.NEXT_PUBLIC_DED_LICENCE),
  vatTrn: optional(process.env.NEXT_PUBLIC_VAT_TRN),
  registeredAddress: optional(process.env.NEXT_PUBLIC_REGISTERED_ADDRESS),

  /** Data-protection / grievance contact (India DPDP + UAE PDPL). */
  grievanceName: optional(process.env.NEXT_PUBLIC_GRIEVANCE_NAME),
  grievanceEmail: optional(process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL),

  supportHours: "10am – 6pm Gulf Standard Time, Monday to Saturday",

  /**
   * Public Google listing for the sister company whose reviews we republish.
   * Undefined until set, and the "read them on Google" link then hides itself
   * — an unverifiable claim is worse than no link.
   */
  sisterReviewsUrl: optional(process.env.NEXT_PUBLIC_SISTER_REVIEWS_URL),
} as const;

/** "+91 98765 43210" style display for the WhatsApp number, or undefined. */
export function whatsappDisplay(): string | undefined {
  const d = siteConfig.whatsappNumber;
  if (!d) return undefined;
  if (d.startsWith("91") && d.length === 12) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.startsWith("971") && d.length === 12) return `+971 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return `+${d}`;
}

/** Display form for the emergency line, or undefined. */
export function emergencyDisplay(): string | undefined {
  const e = siteConfig.emergencyPhone;
  if (!e) return undefined;
  const d = e.replace(/\D/g, "");
  if (d.startsWith("971") && d.length === 12) return `+971 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (d.startsWith("971") && d.length === 11) return `+971 ${d.slice(3, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return e;
}

/** `tel:` href for the emergency line, or undefined. */
export function emergencyHref(): string | undefined {
  const e = siteConfig.emergencyPhone;
  return e ? `tel:${e.replace(/[^\d+]/g, "")}` : undefined;
}

/**
 * The one sentence that ties the brand to the contracting company. Returns
 * undefined until the legal name is configured, so a page can omit the line
 * rather than render half of it.
 */
export function entityLine(): string | undefined {
  const { legalName, dubaiLicence } = siteConfig;
  if (!legalName) return undefined;
  const licence = dubaiLicence ? `, Dubai Department of Economy and Tourism licence ${dubaiLicence}` : "";
  return `${siteConfig.name} is a trading name of ${legalName}${licence}.`;
}

/** Legal footer line, only from configured values: "© 2026 Legal Name · DET licence … · TRN … · GSTIN …". */
export function legalLine(year = new Date().getFullYear()): string {
  const parts = [siteConfig.legalName ? `© ${year} ${siteConfig.legalName}` : `© ${year} ${siteConfig.name}`];
  if (siteConfig.dubaiLicence) parts.push(`Dubai DET licence ${siteConfig.dubaiLicence}`);
  if (siteConfig.vatTrn) parts.push(`TRN ${siteConfig.vatTrn}`);
  if (siteConfig.gstin) parts.push(`GSTIN ${siteConfig.gstin}`);
  return parts.join(" · ");
}
