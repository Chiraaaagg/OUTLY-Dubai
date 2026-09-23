/**
 * Phone normalisation to E.164 (§12.13). The single implementation lives in
 * `src/lib/phone.ts` so the storefront form and the server validate with the
 * same rules (audit S10). This module re-exports it for the server layers;
 * the shared file is pure and imports nothing, which keeps the domain rule
 * ("domain imports only domain + lib/types") honest in spirit.
 */
export { normalisePhone, formatPhone, maskPhone, PHONE_RULES, SUPPORTED_COUNTRY_CODES } from "@/lib/phone";
export type { NormalisedPhone } from "@/lib/phone";
