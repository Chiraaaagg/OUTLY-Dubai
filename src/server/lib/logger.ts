import "server-only";

/**
 * Structured JSON logger with PII redaction at the logger (§13.7.2: "PII never
 * in logs"). Anything keyed like a phone, email, name, secret or token is
 * replaced before serialisation, so a careless `log.info("inquiry", inquiry)`
 * cannot leak.
 *
 * Sentry is DEFERRED; `log.error` is the single seam to add `captureException`.
 */

const REDACT_KEYS = [
  "phone",
  "leadphone",
  "phone_e164",
  "phonee164",
  "email",
  "leademail",
  "name",
  "fullname",
  "leadname",
  "lead_name",
  "hotel",
  "specialrequests",
  "special_requests",
  "dietary",
  "password",
  "passwordhash",
  "password_hash",
  "secret",
  "token",
  "authorization",
  "cookie",
  "refreshhash",
  "totp",
  "totpsecretencrypted",
  "database_url",
  "direct_url",
  "api_key",
  "apikey",
  "recipient",
  "otpauthuri",
  "temporarypassword",
  "clientip",
  "remoteaddr",
  "xforwardedfor",
];

function shouldRedact(key: string) {
  const k = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return REDACT_KEYS.some((r) => k === r || k.endsWith(r));
}

export function redact<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as T;
  if (typeof value === "bigint") return value.toString() as unknown as T;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack } as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shouldRedact(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...(fields ? redact(fields) : {}),
  });
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => {
    emit("error", msg, fields);
    // TODO(sentry): Sentry.captureException(fields?.error ?? new Error(msg)) once SENTRY_DSN is set (§18 §1.8).
  },
};
