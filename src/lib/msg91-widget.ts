/**
 * MSG91 OTP Widget — headless client wrapper.
 *
 * We use the widget with `exposeMethods: true`, which means MSG91 renders no UI
 * of its own and instead hands us three global functions. Our own sign-in card
 * stays exactly as it is; only the transport underneath changes. The visible
 * widget would have replaced the page's design with MSG91's, and the two-step
 * card is the one piece of this flow customers actually judge us on.
 *
 * The widget id and client token below are public values — they ship inside the
 * page's JavaScript and anyone can read them. That is how the widget is built to
 * work, and it is only acceptable while the **domain allowlist is set on the
 * widget in the MSG91 dashboard**. Without it these values can be replayed from
 * any origin to spend the account's SMS credits.
 *
 * The signed token this module returns proves nothing on its own. It is checked
 * server-side by `src/server/sms/msg91-widget.ts`, which is where the phone
 * behind it is established. Nothing here should ever be treated as verified.
 */

const SCRIPT_URLS = ["https://verify.msg91.com/otp-provider.js", "https://verify.phone91.com/otp-provider.js"];

/**
 * Where MSG91 draws its reCAPTCHA challenge.
 *
 * Captcha defaults to on, and with `exposeMethods: true` the widget has no UI
 * of its own to host it — without a render target the challenge has nowhere to
 * go and sends fail. The sign-in card renders an empty div with this id; it
 * stays invisible until Google decides a visitor needs to prove themselves.
 */
export const CAPTCHA_ELEMENT_ID = "msg91-captcha";

const WIDGET_ID = process.env.NEXT_PUBLIC_MSG91_WIDGET_ID;
const TOKEN_AUTH = process.env.NEXT_PUBLIC_MSG91_WIDGET_TOKEN;

type Cb = (data: unknown) => void;

declare global {
  interface Window {
    initSendOTP?: (config: Record<string, unknown>) => void;
    sendOtp?: (identifier: string, success: Cb, failure: Cb) => void;
    verifyOtp?: (otp: string, success: Cb, failure: Cb) => void;
    retryOtp?: (channel: string | null, success: Cb, failure: Cb) => void;
    isCaptchaVerified?: () => boolean;
  }
}

/** Is widget sign-in configured for this build? */
export function widgetConfigured(): boolean {
  return Boolean(WIDGET_ID && TOKEN_AUTH);
}

let ready: Promise<void> | null = null;

/**
 * Access token captured from the widget's config-level `success` callback.
 *
 * The two callbacks fire independently and in no guaranteed order, so this
 * holds whichever arrives first. Cleared before every verify attempt, so a
 * token from an earlier attempt can never be replayed into a later one.
 */
let lastAccessToken: string | undefined;

/**
 * Load the provider script and initialise the widget, once per page.
 *
 * MSG91 publishes the same script on two hosts. The second is a fallback for
 * networks that block the first — a real problem for an Indian audience on
 * mobile data, where one of the two is sometimes unreachable. We try them in
 * order and only fail once both are exhausted.
 */
export function loadWidget(): Promise<void> {
  if (ready) return ready;
  if (!widgetConfigured()) return Promise.reject(new Error("widget_not_configured"));

  ready = new Promise<void>((resolve, reject) => {
    let index = 0;

    const attempt = () => {
      const script = document.createElement("script");
      script.src = SCRIPT_URLS[index];
      script.async = true;

      script.onload = () => {
        if (typeof window.initSendOTP !== "function") {
          reject(new Error("widget_script_invalid"));
          return;
        }
        window.initSendOTP({
          widgetId: WIDGET_ID,
          tokenAuth: TOKEN_AUTH,
          // Headless: no MSG91 UI, we drive it from our own card.
          exposeMethods: true,
          captchaRenderId: CAPTCHA_ELEMENT_ID,
          // MSG91's docs point at *this* callback for the access token: "input
          // the location for displaying the unique access token for each user".
          // The per-call verifyOtp callback does not reliably carry it — it can
          // hand back the request token instead — so this one is captured
          // rather than stubbed, and `verifyWidgetOtp` reads whichever arrives.
          success: (data: unknown) => {
            const token = tokenFrom(data);
            if (token) lastAccessToken = token;
          },
          failure: () => {},
        });
        resolve();
      };

      script.onerror = () => {
        index += 1;
        if (index < SCRIPT_URLS.length) attempt();
        else reject(new Error("widget_script_unreachable"));
      };

      document.head.appendChild(script);
    };

    attempt();
  });

  // A failed load must not be cached, or a transient network blip disables
  // sign-in for the rest of the page's life.
  ready.catch(() => {
    ready = null;
  });

  return ready;
}

/**
 * Load and initialise the widget ahead of time.
 *
 * Call this when the surface that will need a code mounts, not when the code is
 * requested. hCaptcha is rendered by `initSendOTP`, and MSG91 refuses `sendOtp`
 * until the challenge is solved — so initialising lazily inside the first send
 * guarantees that first send fails: the checkbox appears at the same instant we
 * ask to send, with nobody having ticked it yet.
 *
 * Preloading gives the visitor a challenge to solve while they are still
 * filling the form, so the send works on the first press.
 *
 * Safe to call repeatedly; `loadWidget` is idempotent. Failures are swallowed
 * because this is preparation, not the operation — a genuine failure surfaces
 * when the send is actually attempted.
 */
export function preloadWidget(): void {
  if (!widgetConfigured()) return;
  void loadWidget().catch(() => {});
}

/**
 * Has the visitor cleared hCaptcha?
 *
 * Returns false when the widget has not loaded yet, which is the honest answer:
 * an unsolved challenge and an absent one both mean a send would be refused.
 */
export function captchaCleared(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.isCaptchaVerified !== "function") return false;
  try {
    return window.isCaptchaVerified() === true;
  } catch {
    return false;
  }
}

/**
 * Pull the access token out of the widget's verify response.
 *
 * Shape is trusted over field name, because the response carries several long
 * strings — a request id, a status message, the token — and the earlier version
 * of this function took the first long string it found under `message`. When
 * that happened to be a request id we posted it to MSG91 as an access token and
 * got a flat rejection, which looks identical to an expired code from the
 * customer's side.
 *
 * A real access token is a JWT: three dot-separated base64url segments. That is
 * checkable, so check it rather than guessing which key MSG91 used.
 */
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/**
 * The widget hands out two different JWTs and they are easy to confuse.
 *
 *   request token  `{companyId, requestId}` — identifies the send, issued by
 *                  sendOtp and echoed back in later responses. Useless to
 *                  `verifyAccessToken`, which rejects it as an invalid token.
 *   access token   proof that a code was verified. Carries the identifier.
 *
 * Both are well-formed JWTs of similar length, so shape alone cannot separate
 * them — only the claims can. This predicate identifies the one we must not
 * send.
 */
function isRequestToken(jwt: string): boolean {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return false;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    const keys = Object.keys(json);
    return keys.length > 0 && keys.every((k) => k === "companyId" || k === "requestId");
  } catch {
    return false;
  }
}

/** Every JWT-shaped string in the response, in the order MSG91 put them. */
function jwtCandidates(data: unknown): string[] {
  if (typeof data === "string") return JWT.test(data) ? [data] : [];
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const named = ["access-token", "accessToken", "token", "jwt", "message"];
  const seen = new Set<string>();
  for (const key of named) {
    const v = d[key];
    if (typeof v === "string" && JWT.test(v)) seen.add(v);
  }
  for (const v of Object.values(d)) {
    if (typeof v === "string" && JWT.test(v)) seen.add(v);
  }
  return [...seen];
}

/** The first JWT that is not the request token. */
function tokenFrom(data: unknown): string | undefined {
  return jwtCandidates(data).find((t) => !isRequestToken(t));
}

function reasonFrom(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return "unknown";
}

/** Ask MSG91 to send a code. `phoneE164` without the leading `+`, as the widget expects. */
export async function sendWidgetOtp(phoneE164: string): Promise<void> {
  await loadWidget();
  const identifier = phoneE164.replace(/^\+/, "");
  return new Promise((resolve, reject) => {
    if (typeof window.sendOtp !== "function") return reject(new Error("widget_not_ready"));
    window.sendOtp(
      identifier,
      () => resolve(),
      (error) => reject(new Error(reasonFrom(error))),
    );
  });
}

/** Resend on the same identifier. */
export async function retryWidgetOtp(): Promise<void> {
  await loadWidget();
  return new Promise((resolve, reject) => {
    if (typeof window.retryOtp !== "function") return reject(new Error("widget_not_ready"));
    window.retryOtp(
      null,
      () => resolve(),
      (error) => reject(new Error(reasonFrom(error))),
    );
  });
}

/**
 * Submit the code. Resolves with the signed access token, which means only that
 * MSG91 accepted the code — the account is not opened until the server has
 * exchanged this token for a phone number.
 */
export async function verifyWidgetOtp(code: string): Promise<string> {
  await loadWidget();
  // Never inherit a token from a previous attempt.
  lastAccessToken = undefined;

  return new Promise((resolve, reject) => {
    if (typeof window.verifyOtp !== "function") return reject(new Error("widget_not_ready"));

    window.verifyOtp(
      code,
      async (data) => {
        const direct = tokenFrom(data);
        if (direct) return resolve(direct);

        // The per-call callback carried only the request token. The config-level
        // callback is the documented home of the access token and may land a
        // moment later, so give it a brief window before giving up.
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
          if (lastAccessToken) return resolve(lastAccessToken);
          await new Promise((r) => setTimeout(r, 50));
        }
        reject(new Error("no_access_token"));
      },
      (error) => reject(new Error(reasonFrom(error))),
    );
  });
}
