"use client";

import { requestOtp, verifyOtp, verifyOtpWidget } from "@/lib/api";
import { maskPhone } from "@/lib/phone";
import {
  CAPTCHA_ELEMENT_ID,
  captchaCleared,
  preloadWidget,
  sendWidgetOtp,
  verifyWidgetOtp,
  widgetConfigured,
} from "@/lib/msg91-widget";

/**
 * One-time-code verification, independent of where it is used.
 *
 * Two transports exist and the difference matters only here:
 *
 *   widget  MSG91 sends and checks the code in the browser and hands back a
 *           signed token; the server exchanges that token for the phone it
 *           actually verified.
 *   server  our own challenge row, our own hash comparison, our own attempt
 *           counter.
 *
 * Both end with the session cookies set, so callers get the same thing either
 * way: after `verify()` resolves, the visitor is signed in. Neither path is
 * reimplemented here — this only picks one and hands back the same shape — so
 * there is no second place for the security behaviour to drift.
 *
 * An attempt is a value, not module state, so two forms on one page cannot
 * overwrite each other's challenge.
 */

export { CAPTCHA_ELEMENT_ID, captchaCleared, preloadWidget, widgetConfigured };

/**
 * Thrown when a send is attempted before hCaptcha has been cleared.
 *
 * Worth its own type: to the visitor this is "tick the box", not "something
 * went wrong", and those two need different copy. Without it the failure
 * arrives as a bare provider error and every caller renders its generic
 * try-again message for a problem the visitor can fix in one click.
 */
export class CaptchaPendingError extends Error {
  constructor() {
    super("captcha_not_cleared");
    this.name = "CaptchaPendingError";
  }
}

export interface OtpAttempt {
  /** Safe to display: "+91 ••••• ••210". */
  phoneMasked: string;
  /** Seconds until the code expires, or 0 when the provider owns the clock. */
  expiresInSeconds: number;
  /** Resolves once the session cookies are set. */
  verify: (code: string) => Promise<void>;
  /** Send another code to the same number. Returns the replacement attempt. */
  resend: () => Promise<OtpAttempt>;
}

export interface OtpTarget {
  /** E.164, as `normalisePhone` produces it. */
  e164: string;
  /** National part, for the server transport's own parsing. */
  national: string;
  countryCode: string;
}

export async function startOtp(target: OtpTarget): Promise<OtpAttempt> {
  if (widgetConfigured()) {
    // MSG91 refuses the send outright when the challenge is unsolved, and the
    // refusal it returns is indistinguishable from a network failure. Checking
    // first is the only way the caller can say "tick the box" instead of
    // "something went wrong".
    if (!captchaCleared()) throw new CaptchaPendingError();
    await sendWidgetOtp(target.e164);
    return {
      phoneMasked: maskPhone(target.e164),
      // MSG91 owns expiry in widget mode; showing our own countdown would be
      // a number we cannot honour.
      expiresInSeconds: 0,
      verify: async (code) => {
        const accessToken = await verifyWidgetOtp(code);
        await verifyOtpWidget(accessToken);
      },
      resend: () => startOtp(target),
    };
  }

  const challenge = await requestOtp({ phone: target.national, countryCode: target.countryCode });
  return {
    phoneMasked: challenge.phoneMasked,
    expiresInSeconds: challenge.expiresInSeconds,
    verify: async (code) => {
      await verifyOtp({ challengeId: challenge.challengeId, code });
    },
    resend: () => startOtp(target),
  };
}
