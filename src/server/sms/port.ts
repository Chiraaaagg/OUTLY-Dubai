/**
 * SMS port — OTP delivery only (docs/backend/13-security.md §2.1).
 *
 * The customer-auth service depends on this interface and nothing else, so
 * switching MSG91 for Twilio (or adding WhatsApp OTP later) is a new adapter
 * plus a registry case. Adapters never receive anything but the E.164
 * destination, the code and its lifetime; they must never log the code in
 * production (the `log` adapter's dev-only line is the single exception).
 */

export type SmsProvider = "log" | "msg91";

export interface SmsOtpMessage {
  /** E.164 destination. */
  to: string;
  /** The plain 6-digit code — hashed by the caller before it is stored. */
  code: string;
  ttlMinutes: number;
}

export interface SmsSendResult {
  providerId: string;
}

export interface SmsPort {
  readonly provider: SmsProvider;
  sendOtp(msg: SmsOtpMessage): Promise<SmsSendResult>;
}
