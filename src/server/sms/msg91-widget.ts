import "server-only";
import { log } from "../lib/logger";
import { maskPhone } from "../domain/phone";

/**
 * MSG91 OTP Widget — server-side token verification.
 *
 * The widget is a different trust model from `msg91.adapter.ts`. There, we
 * generate the code, store its hash and compare it ourselves. Here MSG91 owns
 * the whole code lifecycle: the browser asks MSG91 to send a code, the customer
 * types it into our field, MSG91 verifies it and hands the browser a signed
 * access token. The token is the only thing our server sees.
 *
 * That makes this function the entire security boundary of the widget flow, so
 * it is deliberately paranoid:
 *
 *  - **The endpoint answers HTTP 200 on failure.** A rejected token comes back
 *    as `{"type":"error","code":"418"}` with a 200 status, so `res.ok` is
 *    meaningless. We accept `type === "success"` and nothing else. Anything we
 *    do not positively recognise is a rejection.
 *  - **The identifier comes from MSG91, never from the client.** The caller does
 *    not get to say which phone was verified; the response does. Trusting a
 *    client-supplied phone alongside a valid token would let anyone verify
 *    their own number and then claim somebody else's account.
 *  - **A token that verifies but yields no usable phone is a rejection.** If the
 *    widget is ever reconfigured for email identifiers, this fails closed
 *    rather than signing someone in against a phone we guessed.
 *
 * Nothing here is logged in the clear: not the token, not the auth key, and the
 * phone only through `maskPhone`.
 */

const ENDPOINT = "https://control.msg91.com/api/v5/widget/verifyAccessToken";
const TIMEOUT_MS = 10_000;

/** MSG91's own error codes, mapped for the log line only — never shown to the customer. */
const REASONS: Record<string, string> = {
  "418": "token_rejected",
  "201": "bad_auth_key",
  "401": "auth_key_missing",
};

/**
 * Describe a rejected token without disclosing it.
 *
 * A token that is well-formed but refused is either expired, already spent, or
 * issued for a different account than the key verifying it — and those need
 * completely different fixes. The JWT's own claims separate them, so read them
 * rather than guess again.
 *
 * Claim *names* are logged, never values, with two exceptions: `exp` and `iat`
 * are timestamps and settle the expiry question outright. The payload can carry
 * the customer's phone number, so nothing else from it is ever logged.
 */
function inspectToken(token: string): Record<string, unknown> {
  try {
    const [, payload] = token.split(".");
    if (!payload) return {};
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const exp = typeof json.exp === "number" ? json.exp : undefined;
    const iat = typeof json.iat === "number" ? json.iat : undefined;
    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
      claims: Object.keys(json).sort(),
      ageSeconds: iat ? nowSeconds - iat : undefined,
      expiresInSeconds: exp ? exp - nowSeconds : undefined,
    };
  } catch {
    return { claims: "undecodable" };
  }
}

export interface WidgetVerifyResult {
  /** E.164, as verified by MSG91. */
  phoneE164: string;
}

export class WidgetVerifyError extends Error {
  constructor(readonly reason: string) {
    super(`MSG91 widget verify failed: ${reason}`);
    this.name = "WidgetVerifyError";
  }
}

/**
 * Turn whatever MSG91 calls the verified identity into E.164, or return
 * `undefined` if it is not a phone number we can use.
 *
 * The widget returns the mobile with a country code and no `+` ("919876543210").
 * We are strict about length because a short string here means the widget was
 * configured for something other than a phone, and signing someone in on that
 * basis would be a guess.
 */
function toE164(identifier: unknown): string | undefined {
  if (typeof identifier !== "string") return undefined;
  const digits = identifier.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return undefined;
  return `+${digits}`;
}

export async function verifyWidgetToken(input: { authKey: string; accessToken: string }): Promise<WidgetVerifyResult> {
  // The widget issues two JWTs and only one is an access token. The other, a
  // `{companyId, requestId}` pair, identifies the send. Posting it here returns
  // a flat rejection that reads to the customer as an expired code, which cost
  // several rounds to track down — so name it explicitly rather than let it
  // reach MSG91 and come back as a generic failure.
  const claims = inspectToken(input.accessToken).claims;
  if (Array.isArray(claims) && claims.length > 0 && claims.every((c) => c === "companyId" || c === "requestId")) {
    log.error("customer_auth.widget_request_token_sent", { claims });
    throw new WidgetVerifyError("request_token_not_access_token");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      // Both secrets travel in the body only, so neither can land in a proxy access log.
      body: JSON.stringify({ authkey: input.authKey, "access-token": input.accessToken }),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = (await res.json().catch(() => ({}))) as { type?: string; message?: unknown; code?: string | number };

    // Note the shape of this check: success is the narrow case, everything else
    // is rejection. The endpoint's 200-on-error behaviour makes the inverse unsafe.
    if (data.type !== "success") {
      const reason = REASONS[String(data.code ?? "")] ?? `unrecognised_${res.status}`;
      // Shape only, never the value. A rejected token is usually not a token at
      // all — the widget's verify response carries several long strings and
      // picking the wrong one yields exactly this error. A real access token is
      // a JWT: three dot-separated segments. `dots: 0` means we sent a request
      // id or a status message and the fix is client-side, not here.
      log.warn("customer_auth.widget_verify_rejected", {
        reason,
        tokenLength: input.accessToken.length,
        tokenDots: input.accessToken.split(".").length - 1,
        ...inspectToken(input.accessToken),
      });
      throw new WidgetVerifyError(reason);
    }

    const phoneE164 = toE164(data.message);
    if (!phoneE164) {
      // Verified, but not against something we can treat as an account identity.
      log.error("customer_auth.widget_identifier_unusable", {});
      throw new WidgetVerifyError("identifier_not_a_phone");
    }

    log.info("customer_auth.widget_verified", { phone: maskPhone(phoneE164) });
    return { phoneE164 };
  } catch (error) {
    if (error instanceof WidgetVerifyError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    log.error("customer_auth.widget_verify_failed", { error: message.slice(0, 200) });
    throw new WidgetVerifyError("provider_unreachable");
  } finally {
    clearTimeout(timer);
  }
}
