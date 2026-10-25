/**
 * Domain errors → the one HTTP error envelope (docs/backend/12-api-design.md §1).
 *
 * `code` values reuse the frontend's `MockScenario` taxonomy where a designed
 * recovery state already exists ("error", "timeout", "offline") and add domain
 * codes the console needs. The frontend API client maps unknown codes to
 * "error" so nothing renders raw.
 */

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "SPAM_REJECTED"
  | "SUPPRESSED"
  | "TOTP_REQUIRED"
  | "TOTP_ENROLMENT_REQUIRED"
  | "VERIFICATION_REQUIRED"
  | "NOT_CONFIGURED"
  | "NOT_IMPLEMENTED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "UNAVAILABLE"
  | "error";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly recovery: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(opts: {
    status: number;
    code: ErrorCode;
    message: string;
    recovery?: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(opts.message);
    this.name = "AppError";
    this.status = opts.status;
    this.code = opts.code;
    this.recovery = opts.recovery ?? "";
    this.retryable = opts.retryable ?? false;
    this.details = opts.details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        recovery: this.recovery,
        retryable: this.retryable,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const Errors = {
  validation: (fields: Record<string, string>, message = "Some fields need attention") =>
    new AppError({
      status: 422,
      code: "VALIDATION_FAILED",
      message,
      recovery: "Check the highlighted fields and try again.",
      details: { fields },
    }),
  unauthorized: (message = "Sign in required") =>
    new AppError({ status: 401, code: "UNAUTHORIZED", message, recovery: "Sign in and try again." }),
  /**
   * The caller's phone is not verified yet, so the action cannot proceed.
   *
   * Distinct from `unauthorized` on purpose: the storefront answers this by
   * opening the one-time-code step inline and retrying, never by sending the
   * visitor to a sign-in page. A generic 401 would be indistinguishable from
   * an expired session and the client would handle it the wrong way.
   */
  verificationRequired: (message = "Verify your number to continue") =>
    new AppError({
      status: 401,
      code: "VERIFICATION_REQUIRED",
      message,
      recovery: "Enter the code we just sent you.",
    }),
  forbidden: (permission?: string) =>
    new AppError({
      status: 403,
      code: "FORBIDDEN",
      message: permission ? `Missing permission: ${permission}` : "Not allowed",
      recovery: "Ask an administrator for access.",
      details: permission ? { permission } : undefined,
    }),
  notFound: (what = "Resource") =>
    new AppError({ status: 404, code: "NOT_FOUND", message: `${what} not found` }),
  conflict: (message: string, details?: Record<string, unknown>) =>
    new AppError({ status: 409, code: "CONFLICT", message, details }),
  invalidTransition: (from: string, to: string) =>
    new AppError({
      status: 409,
      code: "INVALID_TRANSITION",
      message: `Cannot move an inquiry from ${from} to ${to}`,
      recovery: "Refresh the inquiry — someone else may have updated it.",
      details: { from, to },
    }),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError({
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many requests",
      recovery: "Please wait a moment and try again — or message us on WhatsApp.",
      retryable: true,
      details: { retryAfterSeconds },
    }),
  spamRejected: () =>
    // Deliberately generic: never tell a bot which signal tripped (§17 §9 #1).
    new AppError({
      status: 400,
      code: "SPAM_REJECTED",
      message: "We couldn't accept that submission",
      recovery: "Try again, or message us on WhatsApp instead.",
    }),
  totpRequired: () =>
    new AppError({ status: 401, code: "TOTP_REQUIRED", message: "Enter your authenticator code" }),
  totpEnrolmentRequired: () =>
    new AppError({
      status: 403,
      code: "TOTP_ENROLMENT_REQUIRED",
      message: "Two-factor authentication must be set up before you can continue",
    }),
  notConfigured: (what: string) =>
    new AppError({
      status: 503,
      code: "NOT_CONFIGURED",
      message: `${what} is not configured in this environment`,
      retryable: false,
    }),
  notImplemented: (what: string) =>
    new AppError({ status: 501, code: "NOT_IMPLEMENTED", message: `${what} is not implemented yet` }),
  /** A JSON API received a body that is not declared as JSON (form posts, `text/plain`). */
  unsupportedMediaType: (expected = "application/json") =>
    new AppError({
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: `Send the request body as ${expected}`,
      details: { expected },
    }),
  payloadTooLarge: (maxBytes: number) =>
    new AppError({ status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large", details: { maxBytes } }),
  /**
   * A protective dependency (the rate limiter's store) is down, so a
   * security-sensitive action is refused rather than run without its limit.
   */
  unavailable: (retryAfterSeconds = 30) =>
    new AppError({
      status: 503,
      code: "UNAVAILABLE",
      message: "This is temporarily unavailable",
      recovery: "Please try again in a minute — or message us on WhatsApp.",
      retryable: true,
      details: { retryAfterSeconds },
    }),
  internal: (message = "Something went wrong at our end") =>
    new AppError({
      status: 500,
      code: "error",
      message,
      recovery: "That's on us, not you. Try again in a moment — or message us on WhatsApp.",
      retryable: true,
    }),
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
