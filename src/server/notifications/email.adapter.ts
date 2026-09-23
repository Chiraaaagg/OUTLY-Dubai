import "server-only";
import { env } from "../lib/env";
import { log } from "../lib/logger";

/**
 * Email transport — Resend REST API via fetch (no SDK). ACTIVE when
 * RESEND_API_KEY is set; otherwise the log adapter records the message and
 * returns a synthetic provider id prefixed `log-` so the notifications table
 * still shows what would have gone out.
 */

export interface EmailSend {
  to: string;
  subject: string;
  html: string;
  /** Plain-text part — always present so text-only clients and previews work. */
  text: string;
}

export interface SendResult {
  providerId: string;
  costMinor?: bigint;
}

async function sendViaResend(msg: EmailSend): Promise<SendResult> {
  const e = env();
  const from = e.EMAIL_FROM_TRANSACTIONAL;
  if (!from) throw new Error("EMAIL_FROM_TRANSACTIONAL is not set");
  if (!msg.html || !msg.subject) throw new Error("Email has no subject or html body");
  const to = e.EMAIL_CATCH_ALL && e.isNonProduction ? e.EMAIL_CATCH_ALL : msg.to;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: e.EMAIL_REPLY_TO,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { id?: string };
    return { providerId: data.id ?? "resend" };
  } finally {
    clearTimeout(timer);
  }
}

export const emailAdapter = {
  provider(): "resend" | "log" {
    return env().RESEND_API_KEY ? "resend" : "log";
  },
  async send(msg: EmailSend): Promise<SendResult> {
    if (emailAdapter.provider() === "resend") return sendViaResend(msg);
    log.info("email.log_adapter", { subject: msg.subject, bytes: msg.html.length });
    return { providerId: `log-${Date.now().toString(36)}` };
  },
};
