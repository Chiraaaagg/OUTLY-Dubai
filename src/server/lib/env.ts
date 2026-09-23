import "server-only";
import { z } from "zod";

/**
 * Environment — validated once, read everywhere through `env()`.
 *
 * Rules (docs/backend/13-security.md §9, 14-deployment.md §1):
 *  - Only variables the Inquiry Mode backend genuinely reads are declared here.
 *    Deferred integrations (Rathin, Razorpay API, BSP, Meta, PostHog, Redis)
 *    are declared optional so their absence selects the log/mock adapter and
 *    never blocks boot.
 *  - Secrets are asserted present at boot in production (`assertBootEnv`) so a
 *    misconfigured deploy fails loudly, not at the first customer request.
 *  - Nothing here is ever logged. `logger.ts` redacts these keys by name.
 */

const bool = z
  .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0"), z.literal("")])
  .optional()
  .transform((v) => v === "true" || v === "1");

/** Tri-state flag: unset/empty ⇒ `undefined` (no override), otherwise a boolean. */
const optionalBool = z
  .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0"), z.literal("")])
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v === "true" || v === "1"));

const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number.parseInt(v, 10)))
    .pipe(z.number().int().nonnegative());

const optionalStr = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_WHATSAPP_NUMBER: optionalStr,
  NEXT_PUBLIC_SUPPORT_EMAIL: optionalStr,

  // Database
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: optionalStr,

  // Auth — admin + agents (§13.2.2) and customer phone OTP (§13.2.1, impl/customer-auth-contract.md)
  AUTH_JWT_SECRET: z.string().min(32),
  AUTH_COOKIE_SECRET: z.string().min(32),
  TOTP_ENCRYPTION_KEY: optionalStr,
  ADMIN_BOOTSTRAP_EMAIL: optionalStr,
  ADMIN_BOOTSTRAP_PASSWORD: optionalStr,
  AUTH_ADMIN_SESSION_HOURS: int(8),
  AUTH_CUSTOMER_SESSION_DAYS: int(30),
  OTP_TTL_SECONDS: int(300),
  OTP_MAX_ATTEMPTS: int(5),
  OTP_RATE_LIMIT_PER_PHONE_PER_15MIN: int(3),
  OTP_RATE_LIMIT_PER_IP_PER_HOUR: int(10),

  // SMS — OTP delivery port. `log` writes the code to the server log in non-production only;
  // `msg91` needs every MSG91_* value below (DLT-registered OTP template).
  SMS_PROVIDER: z.enum(["log", "msg91"]).default("log"),
  MSG91_AUTH_KEY: optionalStr,
  MSG91_SENDER_ID: optionalStr,
  MSG91_TEMPLATE_ID_OTP: optionalStr,
  MSG91_DLT_ENTITY_ID: optionalStr,

  // Email — Resend (ACTIVE, narrow scope). Absent key → log adapter.
  RESEND_API_KEY: optionalStr,
  EMAIL_FROM_TRANSACTIONAL: optionalStr,
  EMAIL_REPLY_TO: optionalStr,
  /** Preflight audit name (§18 §1.3); `OPS_ALERT_EMAIL` accepted as alias. */
  EMAIL_OPS_ALERT_TO: csv,
  OPS_ALERT_EMAIL: csv,
  EMAIL_CATCH_ALL: optionalStr,
  /** Non-production recipient allowlist — the guard that stops staging messaging real customers. */
  NOTIFICATION_RECIPIENT_ALLOWLIST: csv,
  NOTIFY_ALLOWLIST: csv,

  // WhatsApp — click-to-chat needs nothing; the BSP adapter is DEFERRED.
  WHATSAPP_PROVIDER: z.enum(["log", "cloud_api"]).default("log"),
  WHATSAPP_API_BASE_URL: optionalStr,
  WHATSAPP_API_TOKEN: optionalStr,
  WHATSAPP_PHONE_NUMBER_ID: optionalStr,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: optionalStr,
  WHATSAPP_WEBHOOK_SECRET: optionalStr,
  WHATSAPP_TEMPLATE_INQUIRY_ACK: z.string().default("inquiry_ack_v1"),
  WHATSAPP_TEMPLATE_INQUIRY_FOLLOWUP: z.string().default("inquiry_followup_v1"),
  WHATSAPP_TEMPLATE_INQUIRY_OPS_ALERT: z.string().default("inquiry_ops_alert_v1"),
  WHATSAPP_OPS_ALERT_NUMBER: optionalStr,

  // Analytics destinations — all DEFERRED; our own collector is the source of truth.
  NEXT_PUBLIC_META_PIXEL_ID: optionalStr,
  META_DATASET_ID: optionalStr,
  META_CAPI_ACCESS_TOKEN: optionalStr,
  META_CAPI_TEST_EVENT_CODE: optionalStr,
  META_OFFLINE_EVENT_SET_ID: optionalStr,
  NEXT_PUBLIC_POSTHOG_KEY: optionalStr,
  NEXT_PUBLIC_POSTHOG_HOST: optionalStr,
  GA4_API_SECRET: optionalStr,
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: optionalStr,

  // Supplier — Rathin NOT READY (§16). Adapter selection only.
  SUPPLIER_ADAPTER_RATHIN: z.enum(["mock", "live"]).default("mock"),
  RATHIN_BASE_URL: optionalStr,
  RATHIN_CLIENT_ID: optionalStr,
  RATHIN_CLIENT_SECRET: optionalStr,
  RATHIN_AGENCY_ID: optionalStr,
  RATHIN_TIMEOUT_MS: int(8000),

  // Security / abuse (§17 §9)
  CRON_SECRET: optionalStr,
  INTERNAL_API_KEY: optionalStr,
  TURNSTILE_SECRET_KEY: optionalStr,
  INQUIRY_MIN_SUBMIT_SECONDS: int(2),
  INQUIRY_RATE_LIMIT_PER_PHONE_PER_HOUR: int(3),
  INQUIRY_RATE_LIMIT_PER_IP_PER_HOUR: int(10),
  LOOKUP_RATE_LIMIT_PER_IP: int(5),
  LOOKUP_RATE_LIMIT_WINDOW_SECONDS: int(900),
  EVENTS_RATE_LIMIT_PER_HOUR: int(1000),
  ADMIN_LOGIN_RATE_LIMIT_PER_15MIN: int(5),

  // Ops defaults — seeded into `settings` and admin-editable thereafter (§17 §6.4)
  SLA_INQUIRY_RESPONSE_MINUTES: int(30),
  SLA_BUSINESS_HOURS_START: z.string().default("10:00"),
  SLA_BUSINESS_HOURS_END: z.string().default("18:00"),
  /** Comma-separated 0–6 (0 = Sunday). The team works Mon–Sat. */
  SLA_BUSINESS_DAYS: z.string().default("1,2,3,4,5,6"),
  SLA_TIMEZONE: z.string().default("Asia/Dubai"),
  SLA_ESCALATION_MINUTES: int(30),
  ROUTING_PREMIUM_THRESHOLD_INR: int(100000),
  ROUTING_GROUP_THRESHOLD_PAX: int(5),
  AGENT_MAX_CONCURRENT_INQUIRIES: int(15),
  FOLLOWUP_LADDER_HOURS: z.string().default("2,24,72,168"),
  PRICE_TOLERANCE_PERCENT: int(5),
  OPS_ALERT_WEBHOOK_URL: optionalStr,

  // Feature flags (env-level; DB `feature_flags` overrides at runtime)
  FEATURE_DESIGN_SYSTEM_PAGE: bool,
  FEATURE_MAINTENANCE_MODE: bool,
  /** Optional override for customer sign-in. Unset ⇒ enabled outside production, or when a real SMS provider is configured. */
  FEATURE_CUSTOMER_AUTH: optionalBool,

  // Photography — Pexels search for any catalogue image without a curated id (src/lib/images/manifest.ts).
  PEXELS_API_KEY: optionalStr,

  SENTRY_DSN: optionalStr,
});

export type Env = z.infer<typeof schema> & {
  opsAlertEmails: string[];
  recipientAllowlist: string[];
  followupLadderHours: number[];
  isProduction: boolean;
  isNonProduction: boolean;
};

let cached: Env | null = null;

/** Lazily validated so `next build` never needs a full runtime environment. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  const e = parsed.data;
  cached = {
    ...e,
    opsAlertEmails: e.EMAIL_OPS_ALERT_TO.length ? e.EMAIL_OPS_ALERT_TO : e.OPS_ALERT_EMAIL,
    recipientAllowlist: e.NOTIFICATION_RECIPIENT_ALLOWLIST.length
      ? e.NOTIFICATION_RECIPIENT_ALLOWLIST
      : e.NOTIFY_ALLOWLIST,
    followupLadderHours: e.FOLLOWUP_LADDER_HOURS.split(",")
      .map((s) => Number.parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
    isProduction: e.APP_ENV === "production",
    isNonProduction: e.APP_ENV !== "production",
  };
  return cached;
}

/**
 * Production boot assertions — things that must never be missing where real
 * customers exist. Called from the health check and the admin layout so a bad
 * deploy is visible within one request.
 */
export function assertBootEnv(): string[] {
  const e = env();
  const problems: string[] = [];
  if (!e.NEXT_PUBLIC_WHATSAPP_NUMBER) problems.push("NEXT_PUBLIC_WHATSAPP_NUMBER missing — click-to-chat CTAs are dead");
  if (e.isProduction) {
    if (!e.CRON_SECRET) problems.push("CRON_SECRET missing — scheduled jobs disabled");
    if (!e.RESEND_API_KEY) problems.push("RESEND_API_KEY missing — email acknowledgements will only be logged");
    if (!e.EMAIL_FROM_TRANSACTIONAL) problems.push("EMAIL_FROM_TRANSACTIONAL missing");
    if (!e.opsAlertEmails.length) problems.push("EMAIL_OPS_ALERT_TO missing — nobody is alerted to new inquiries");
    if (!e.TOTP_ENCRYPTION_KEY) problems.push("TOTP_ENCRYPTION_KEY missing — falling back to a derived key");
  } else if (!e.recipientAllowlist.length && e.RESEND_API_KEY) {
    problems.push("Non-production with a live RESEND_API_KEY and an empty recipient allowlist — nothing will send");
  }
  return problems;
}

/** Test/seed helper. */
export function resetEnvCache() {
  cached = null;
}
