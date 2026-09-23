import "server-only";
import { env } from "../lib/env";
import { logSmsAdapter } from "./log.adapter";
import { createMsg91Adapter, msg91ConfigFrom } from "./msg91.adapter";
import type { SmsPort, SmsProvider } from "./port";

/**
 * SMS registry — `SMS_PROVIDER` + credentials → an `SmsPort`.
 *
 *   SMS_PROVIDER=log                       → logSmsAdapter
 *   SMS_PROVIDER=msg91 + all MSG91_* set   → MSG91
 *   SMS_PROVIDER=msg91, credentials absent → logSmsAdapter (and `smsMode()`
 *                                            reports `msg91_unconfigured` so
 *                                            /api/health can say so)
 *
 * `hasRealSmsProvider()` is the input to `customerAuthService.enabled()`:
 * in production, sign-in exists only when codes can actually reach a phone.
 */

export type SmsMode = SmsProvider | "msg91_unconfigured";

export function smsMode(): SmsMode {
  const e = env();
  if (e.SMS_PROVIDER !== "msg91") return "log";
  return msg91ConfigFrom(e) ? "msg91" : "msg91_unconfigured";
}

export function hasRealSmsProvider(): boolean {
  return smsMode() === "msg91";
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
