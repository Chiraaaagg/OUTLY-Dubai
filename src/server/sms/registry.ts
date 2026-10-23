import "server-only";
import { env } from "../lib/env";
import { logSmsAdapter } from "./log.adapter";
import { createMsg91Adapter, msg91ConfigFrom } from "./msg91.adapter";
import type { SmsPort, SmsProvider } from "./port";

/**
 * SMS registry — `SMS_PROVIDER` + credentials → an `SmsPort`.
 *
 *   SMS_PROVIDER=log                            → logSmsAdapter
 *   SMS_PROVIDER=msg91 + all MSG91_* set        → MSG91 v5 OTP API (we own the code)
 *   SMS_PROVIDER=msg91, credentials absent      → logSmsAdapter (`smsMode()` reports
 *                                                 `msg91_unconfigured` so /api/health says so)
 *   SMS_PROVIDER=msg91_widget + widget values   → MSG91 OTP Widget (MSG91 owns the code)
 *   SMS_PROVIDER=msg91_widget, values absent    → logSmsAdapter, `msg91_widget_unconfigured`
 *
 * The two MSG91 modes are not variants of one integration; they are different
 * trust models and only one can be live at a time.
 *
 *   `msg91`         our server generates the code, stores its hash, counts the
 *                   attempts and compares in constant time. Needs a DLT-approved
 *                   template id. Every control in `customer-auth.service.ts` applies.
 *
 *   `msg91_widget`  the browser asks MSG91 to send and verify; our server only
 *                   validates the resulting signed token (`msg91-widget.ts`).
 *                   No DLT template of our own, and the per-phone send limits
 *                   move to MSG91's side — see the warning on `widgetConfig()`.
 *
 * `hasRealSmsProvider()` is the input to `customerAuthService.enabled()`: in
 * production, sign-in exists only when codes can actually reach a phone.
 */

export type SmsMode = SmsProvider | "msg91_unconfigured" | "msg91_widget" | "msg91_widget_unconfigured";

export interface WidgetConfig {
  /** Server-side only. Never sent to the browser. */
  authKey: string;
  /** Public — ships in the page's JavaScript. */
  widgetId: string;
  /** Public — ships in the page's JavaScript. */
  tokenAuth: string;
}

/**
 * Widget credentials, or `undefined` when the mode is not fully configured.
 *
 * `widgetId` and `tokenAuth` are public values: they are readable by anyone who
 * views source. That is how the widget is designed to work, and it is only safe
 * while the widget's **domain allowlist is configured in the MSG91 dashboard**.
 * Without that allowlist these two values let a third party trigger sends from
 * any origin and spend the account's SMS credits. The auth key is the only
 * secret here and it never leaves the server.
 */
export function widgetConfig(): WidgetConfig | undefined {
  const e = env();
  if (e.SMS_PROVIDER !== "msg91_widget") return undefined;
  if (!e.MSG91_AUTH_KEY || !e.NEXT_PUBLIC_MSG91_WIDGET_ID || !e.NEXT_PUBLIC_MSG91_WIDGET_TOKEN) return undefined;
  return {
    authKey: e.MSG91_AUTH_KEY,
    widgetId: e.NEXT_PUBLIC_MSG91_WIDGET_ID,
    tokenAuth: e.NEXT_PUBLIC_MSG91_WIDGET_TOKEN,
  };
}

export function smsMode(): SmsMode {
  const e = env();
  if (e.SMS_PROVIDER === "msg91_widget") return widgetConfig() ? "msg91_widget" : "msg91_widget_unconfigured";
  if (e.SMS_PROVIDER !== "msg91") return "log";
  return msg91ConfigFrom(e) ? "msg91" : "msg91_unconfigured";
}

/** True when the browser drives the code, not our server. */
export function isWidgetMode(): boolean {
  return smsMode() === "msg91_widget";
}

export function hasRealSmsProvider(): boolean {
  const mode = smsMode();
  return mode === "msg91" || mode === "msg91_widget";
}

let cached: SmsPort | null = null;

export function smsAdapter(): SmsPort {
  if (cached) return cached;
  const e = env();
  const cfg = e.SMS_PROVIDER === "msg91" ? msg91ConfigFrom(e) : undefined;
  cached = cfg ? createMsg91Adapter(cfg) : logSmsAdapter;
  return cached;
}

/** Test/seed helper. */
export function resetSmsAdapterCache() {
  cached = null;
}
