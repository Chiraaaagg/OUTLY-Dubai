/**
 * Recover the server's §12 error code from a thrown `ApiError`.
 *
 * `ApiError.code` is the frontend scenario taxonomy ("error" | "offline" |
 * "timeout" | …), so the server code (NOT_FOUND, RATE_LIMITED, NOT_CONFIGURED,
 * UNAUTHORIZED, VALIDATION_FAILED) is not preserved on the instance. The
 * customer-auth pages need it to pick honest copy — "we couldn't find that
 * inquiry with that number" is not the same state as "wait fifteen minutes".
 *
 * Order of preference: an explicit `serverCode`/`code` carrying a §12 name
 * (if the API seam starts attaching one), then the server's own message
 * strings from `src/server/lib/errors.ts`, which are stable and not customer
 * input. Anything else is `undefined` and callers fall back to `recovery`.
 */

export type ServerErrorCode =
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "VALIDATION_FAILED"
  | "FORBIDDEN";

const KNOWN: ServerErrorCode[] = [
  "NOT_FOUND",
  "RATE_LIMITED",
  "NOT_CONFIGURED",
  "UNAUTHORIZED",
  "VALIDATION_FAILED",
  "FORBIDDEN",
];

export function serverErrorCode(err: unknown): ServerErrorCode | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as { serverCode?: unknown; code?: unknown; message?: unknown; status?: unknown };

  for (const candidate of [e.serverCode, e.code]) {
    if (typeof candidate === "string" && (KNOWN as string[]).includes(candidate)) {
      return candidate as ServerErrorCode;
    }
  }

  if (typeof e.status === "number") {
    if (e.status === 404) return "NOT_FOUND";
    if (e.status === 429) return "RATE_LIMITED";
    if (e.status === 503) return "NOT_CONFIGURED";
    if (e.status === 401) return "UNAUTHORIZED";
    if (e.status === 422) return "VALIDATION_FAILED";
  }

  const message = typeof e.message === "string" ? e.message : "";
  if (/\bnot found\b/i.test(message)) return "NOT_FOUND";
  if (/^too many requests/i.test(message)) return "RATE_LIMITED";
  if (/is not configured in this environment/i.test(message)) return "NOT_CONFIGURED";
  if (/^sign in required/i.test(message)) return "UNAUTHORIZED";
  if (/^some fields need attention/i.test(message)) return "VALIDATION_FAILED";
  return undefined;
}
