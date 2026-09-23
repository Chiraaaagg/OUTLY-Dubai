import "server-only";
import { log } from "../lib/logger";
import { maskPhone } from "../domain/phone";
import type { SmsOtpMessage, SmsPort, SmsSendResult } from "./port";

/**
 * MSG91 OTP adapter (India; DLT-registered OTP template).
 *
 * Uses the v5 OTP endpoint with our own code supplied as the `otp` parameter
 * so the hash we store is the one the customer receives — MSG91 never picks
 * the code. `template_id` is the DLT-approved OTP template; the sender id and
 * entity id are attached to that template in the MSG91 dashboard, so they are
 * validated for presence (contract §1 gating) but not sent on the wire.
 *
 * The auth key travels only in the `authkey` header; the code only in the
 * request body. Neither appears in logs — the only thing logged is the masked
 * destination and the provider's request id.
 *
 * TODO(msg91): confirm the template's variable name for the code once DLT
 * registration is through; the v5 OTP API reads `otp` for the ##OTP## slot.
 */

export interface Msg91Config {
  authKey: string;
  senderId: string;
  templateId: string;
  /** Optional; recorded for completeness, the template carries it. */
  dltEntityId?: string;
}

const ENDPOINT = "https://control.msg91.com/api/v5/otp";
const TIMEOUT_MS = 10_000;

/** All three required values present ⇒ a config; otherwise `undefined` (registry falls back to `log`). */
export function msg91ConfigFrom(env: {
  MSG91_AUTH_KEY?: string;
  MSG91_SENDER_ID?: string;
  MSG91_TEMPLATE_ID_OTP?: string;
  MSG91_DLT_ENTITY_ID?: string;
}): Msg91Config | undefined {
  if (!env.MSG91_AUTH_KEY || !env.MSG91_SENDER_ID || !env.MSG91_TEMPLATE_ID_OTP) return undefined;
  return {
    authKey: env.MSG91_AUTH_KEY,
    senderId: env.MSG91_SENDER_ID,
    templateId: env.MSG91_TEMPLATE_ID_OTP,
    dltEntityId: env.MSG91_DLT_ENTITY_ID,
  };
}

export function createMsg91Adapter(cfg: Msg91Config): SmsPort {
  return {
    provider: "msg91",
    async sendOtp(msg: SmsOtpMessage): Promise<SmsSendResult> {
      // MSG91 wants the number with country code and no "+".
      const mobile = msg.to.replace(/^\+/, "");
      const url = new URL(ENDPOINT);
      url.searchParams.set("template_id", cfg.templateId);
      url.searchParams.set("mobile", mobile);
      url.searchParams.set("otp_expiry", String(Math.max(1, Math.round(msg.ttlMinutes))));
      url.searchParams.set("realTimeResponse", "1");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { authkey: cfg.authKey, "content-type": "application/json", accept: "application/json" },
          // The code goes in the body only — never in the URL, so it cannot land in a proxy log.
          body: JSON.stringify({ otp: msg.code }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string; request_id?: string };
        if (!res.ok || data.type === "error") {
          // The provider message may echo the mobile; keep only the status.
          throw new Error(`MSG91 ${res.status}${data.type ? ` ${data.type}` : ""}`);
        }
        const providerId = data.request_id ?? data.message ?? `msg91-${Date.now().toString(36)}`;
        log.info("sms.msg91.otp_sent", { to: maskPhone(msg.to), providerId });
        return { providerId };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("sms.msg91.failed", { to: maskPhone(msg.to), error: message.slice(0, 200) });
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
