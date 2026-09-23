/**
 * Spam controls for the public inquiry form (§17 §9 #1–#2) — pure.
 *
 * Launch posture: honeypot + submission timing + rate limits (enforced by the
 * caller) + suppression list. No CAPTCHA, no OTP — each is a measurable
 * conversion cost against a threat that has not materialised. Signals are
 * recorded on the inquiry so the decision can be revisited with data.
 */

export interface SpamInput {
  honeypot?: string;
  startedAt?: number;
  now: number;
  minSubmitSeconds: number;
  suppressed: boolean;
  leadName: string;
  notes?: string;
  email?: string;
}

export interface SpamVerdict {
  /** Reject with a generic 400 — bots only. */
  reject: boolean;
  /** Accept but file directly as `spam`, no acknowledgement (suppressed numbers). */
  quarantine: boolean;
  signals: Record<string, unknown>;
}

const URL_RE = /https?:\/\/|www\./gi;

export function evaluateSpam(input: SpamInput): SpamVerdict {
  const signals: Record<string, unknown> = {};
  let reject = false;

  if (input.honeypot && input.honeypot.trim().length > 0) {
    signals.honeypot = true;
    reject = true;
  }

  if (typeof input.startedAt === "number" && Number.isFinite(input.startedAt)) {
    const elapsedMs = input.now - input.startedAt;
    signals.elapsedMs = elapsedMs;
    if (elapsedMs >= 0 && elapsedMs < input.minSubmitSeconds * 1000) {
      signals.tooFast = true;
      reject = true;
    }
  } else {
    signals.noTiming = true;
  }

  const urls = (input.notes ?? "").match(URL_RE)?.length ?? 0;
  if (urls > 0) signals.urlsInNotes = urls;
  if (/https?:\/\//i.test(input.leadName)) {
    signals.urlInName = true;
    reject = true;
  }

  if (input.suppressed) signals.suppressed = true;

  return { reject, quarantine: !reject && input.suppressed, signals };
}

/** Strip control characters; keep newlines and tabs in free text (§12.13). */
export function cleanText(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}
