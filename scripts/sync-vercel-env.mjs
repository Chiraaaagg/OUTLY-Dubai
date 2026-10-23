/**
 * Push the server-side configuration from .env.local to Vercel production.
 *
 * Deliberately NOT a blind copy of the file. Four values are *corrected*
 * because the local value would be wrong or unsafe in production, and three
 * are refused outright:
 *
 *   corrected  APP_ENV                    development -> production
 *              CORS_ALLOWED_ORIGINS       localhost:3000 -> the live origin
 *              FEATURE_DESIGN_SYSTEM_PAGE true -> false (it is a debug surface)
 *              FEATURE_MAINTENANCE_MODE   pinned false so a stale local value
 *                                         can never 503 the live site
 *
 *   refused    NODE_ENV                   Vercel sets this itself; overriding
 *                                         it breaks the build
 *              ADMIN_BOOTSTRAP_*          a plaintext admin password has no
 *                                         business in a deployment config, and
 *                                         the admin accounts already exist
 *
 * Empty values are skipped rather than written as empty strings, so an unset
 * integration stays unset instead of looking configured.
 *
 * Usage: node scripts/sync-vercel-env.mjs [--apply]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const SITE = "https://outlyy.com";

/** Server-side keys worth having in production, grouped by what they switch on. */
const KEYS = [
  // Scheduled work — without CRON_SECRET the sweep route answers 503 and every
  // SLA breach, follow-up and auto-lost stays unprocessed.
  "CRON_SECRET",
  "INTERNAL_API_KEY",
  // Email
  "RESEND_API_KEY",
  "EMAIL_FROM_TRANSACTIONAL",
  "EMAIL_FROM_MARKETING",
  "EMAIL_REPLY_TO",
  "OPS_ALERT_EMAIL",
  "NOTIFICATION_RECIPIENT_ALLOWLIST",
  // Sign-in codes
  "SMS_PROVIDER",
  "MSG91_AUTH_KEY",
  "MSG91_SENDER_ID",
  "OTP_TTL_SECONDS",
  "OTP_MAX_ATTEMPTS",
  // Photography
  "PEXELS_API_KEY",
  // WhatsApp (still the log adapter until a BSP exists)
  "WHATSAPP_PROVIDER",
  "WHATSAPP_TEMPLATE_INQUIRY_ACK",
  "WHATSAPP_TEMPLATE_INQUIRY_FOLLOWUP",
  "WHATSAPP_TEMPLATE_INQUIRY_OPS_ALERT",
  // Sessions
  "AUTH_CUSTOMER_SESSION_DAYS",
  "AUTH_ADMIN_SESSION_HOURS",
  // SLA, routing and follow-up tuning
  "SLA_INQUIRY_RESPONSE_MINUTES",
  "SLA_BUSINESS_HOURS_START",
  "SLA_BUSINESS_HOURS_END",
  "SLA_BUSINESS_DAYS",
  "SLA_TIMEZONE",
  "SLA_ESCALATION_MINUTES",
  "ROUTING_PREMIUM_THRESHOLD_INR",
  "ROUTING_GROUP_THRESHOLD_PAX",
  "AGENT_MAX_CONCURRENT_INQUIRIES",
  "FOLLOWUP_LADDER_HOURS",
  "PRICE_TOLERANCE_PERCENT",
  // Abuse limits
  "INQUIRY_MIN_SUBMIT_SECONDS",
  "INQUIRY_RATE_LIMIT_PER_PHONE_PER_HOUR",
  "INQUIRY_RATE_LIMIT_PER_IP_PER_HOUR",
  "LOOKUP_RATE_LIMIT_PER_IP",
  "LOOKUP_RATE_LIMIT_WINDOW_SECONDS",
  // Supplier adapter stays mocked; Rathin is not implemented.
  "SUPPLIER_ADAPTER_RATHIN",
  "RATHIN_TIMEOUT_MS",
  "AVAILABILITY_CACHE_TTL_SECONDS",
  // Feature flags
  "FEATURE_RESPONSE_PROMISE",
  "FEATURE_FORCE_CHECKOUT_ROUTE",
];

/** Values we override rather than copy. */
const CORRECTED = {
  APP_ENV: "production",
  CORS_ALLOWED_ORIGINS: SITE,
  FEATURE_DESIGN_SYSTEM_PAGE: "false",
  FEATURE_MAINTENANCE_MODE: "false",
};

/** Never sent, whatever the local file says. */
const REFUSED = new Set(["NODE_ENV", "ADMIN_BOOTSTRAP_EMAIL", "ADMIN_BOOTSTRAP_NAME", "ADMIN_BOOTSTRAP_PASSWORD"]);

function readEnvLocal() {
  const out = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m) continue;
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const local = readEnvLocal();
const plan = [];

for (const [key, value] of Object.entries(CORRECTED)) {
  plan.push({ key, value, note: `corrected (local: ${local[key] ?? "unset"})` });
}
for (const key of KEYS) {
  if (REFUSED.has(key)) continue;
  const value = local[key];
  if (value === undefined || value === "") {
    console.log(`skip (empty)   ${key}`);
    continue;
  }
  plan.push({ key, value, note: "" });
}

console.log(`\n${plan.length} variables to set on production:\n`);
for (const p of plan) {
  const shown = /SECRET|KEY|TOKEN|PASSWORD/.test(p.key) ? `<${p.value.length} chars hidden>` : p.value;
  console.log(`  ${p.key.padEnd(38)} ${shown} ${p.note}`);
}
console.log(`\nrefused outright: ${[...REFUSED].join(", ")}`);

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write them.");
  process.exit(0);
}

let ok = 0;
let failed = 0;
for (const { key, value } of plan) {
  try {
    execFileSync("vercel", ["env", "add", key, "production", "--force"], {
      input: value,
      stdio: ["pipe", "ignore", "ignore"],
      shell: process.platform === "win32",
      timeout: 60_000,
    });
    ok++;
    console.log(`set    ${key}`);
  } catch {
    failed++;
    console.log(`FAILED ${key}`);
  }
}
console.log(`\n${ok} set, ${failed} failed.`);
