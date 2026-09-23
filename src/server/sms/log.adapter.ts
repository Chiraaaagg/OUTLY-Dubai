import "server-only";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import { maskPhone } from "../domain/phone";
import type { SmsOtpMessage, SmsPort, SmsSendResult } from "./port";

/**
 * Log adapter — the default when no SMS provider is configured.
 *
 * Records that an OTP would have gone out (masked destination + TTL only).
 * Outside production it ALSO writes the code itself at debug level, clearly
 * marked "[dev only]", so a developer can complete the login flow against a
 * local or staging build without an SMS account. That line is guarded twice:
 * `env().isProduction` (APP_ENV) here and `NODE_ENV=production` inside the
 * logger, which drops debug output altogether. The code is never returned to
 * the client on any path.
 */
export const logSmsAdapter: SmsPort = {
  provider: "log",
  async sendOtp(msg: SmsOtpMessage): Promise<SmsSendResult> {
    const e = env();
    log.info("sms.log_adapter.otp", { to: maskPhone(msg.to), ttlMinutes: msg.ttlMinutes });
    if (!e.isProduction) {
      // [dev only] — never reaches a production log (double-guarded, see above).
      log.debug("sms.log_adapter.otp_code [dev only]", { to: maskPhone(msg.to), devOtpCode: msg.code });
    }
    return { providerId: `log-${Date.now().toString(36)}` };
  },
};
