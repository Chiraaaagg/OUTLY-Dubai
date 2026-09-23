import type { PaxCount } from "@/lib/types";
import { ACK_AVAILABILITY, FOLLOWUP_SENTENCES, WHATSAPP_TEMPLATES, renderWhatsAppBody } from "./whatsapp-templates";
import { siteConfig } from "@/lib/site-config";

/**
 * Notification templates — version-controlled in the repo (AC-WA-04), never
 * edited in a dashboard. One render function per (event, channel).
 *
 * WhatsApp: `templateName` must match the approved BSP template; `variables`
 * are the positional body parameters ("1".."n"). `text` is rendered from the
 * registry body in `whatsapp-templates.ts`, so the log adapter and the
 * `notifications.payload` show exactly what the customer receives.
 *
 * Email: `subject` (<= 78 chars, RFC 2822 friendly), `html` and a `text` part
 * that is always present. Every customer-supplied string (lead name, notes,
 * hotel, dietary, item titles) passes through `escapeHtml` before it touches
 * markup — customer text is untrusted (§17 §9 #6).
 *
 * Tone: plain, specific, no urgency theatre (§17 §3.7). The deadline is the
 * concrete timestamp the confirmation page already showed (§3.9).
 *
 * This module is pure (no env, no I/O, no "server-only") so it is unit-tested
 * directly. Template names are read from process.env here because env.ts is
 * server-only; the defaults match the registry.
 */

export type NotificationEvent =
  | "INQUIRY_ACK"
  | "INQUIRY_OPS_ALERT"
  | "INQUIRY_ASSIGNED"
  | "INQUIRY_SLA_BREACH"
  | "INQUIRY_STILL_CHECKING"
  | "INQUIRY_FOLLOWUP"
  | "INQUIRY_WON"
  | "ACCOUNT_DELETION_REQUEST";

export type NotificationChannel = "whatsapp" | "email";

export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  "INQUIRY_ACK",
  "INQUIRY_OPS_ALERT",
  "INQUIRY_ASSIGNED",
  "INQUIRY_SLA_BREACH",
  "INQUIRY_STILL_CHECKING",
  "INQUIRY_FOLLOWUP",
  "INQUIRY_WON",
  "ACCOUNT_DELETION_REQUEST",
];

/** Which channels each event has a template for. Dispatching elsewhere is a programming error. */
export const EVENT_CHANNELS: Record<NotificationEvent, readonly NotificationChannel[]> = {
  INQUIRY_ACK: ["whatsapp", "email"],
  INQUIRY_OPS_ALERT: ["whatsapp", "email"],
  INQUIRY_ASSIGNED: ["email"],
  INQUIRY_SLA_BREACH: ["email"],
  INQUIRY_STILL_CHECKING: ["whatsapp", "email"],
  INQUIRY_FOLLOWUP: ["whatsapp", "email"],
  INQUIRY_WON: ["email"],
  /** Ops only (impl/customer-auth-contract.md §3 `requestDeletion`): a customer asked for their data to be deleted. */
  ACCOUNT_DELETION_REQUEST: ["email"],
};

export function supportsChannel(event: NotificationEvent, channel: NotificationChannel): boolean {
  return EVENT_CHANNELS[event]?.includes(channel) ?? false;
}

export interface TemplateContext {
  reference: string;
  leadName: string;
  leadFirstName: string;
  leadPhone: string;
  leadEmail?: string;
  agentName: string;
  agentFirstName: string;
  agentRole: string;
  deadlineIso: string;
  deadlineLabel: string;
  outOfHours: boolean;
  items: { title: string; date?: string; time?: string; pax: PaxCount; indicativeTotalInr: number }[];
  itemCount: number;
  travelDateFrom?: string;
  datesFlexible: boolean;
  guests: number;
  dietary?: string;
  hotel?: string;
  specialRequests?: string;
  budgetBand?: string;
  indicativeTotalInr: number;
  currency: string;
  source: string;
  siteUrl: string;
  consoleUrl: string;
  whatsappNumber?: string;
  supportEmail?: string;
  stage?: number;
  reassigned?: boolean;
  orderReference?: string;
  /** ACCOUNT_DELETION_REQUEST only. */
  customerId?: string;
  phoneMasked?: string;
  customerSince?: string;
  deletionReason?: string;
  requestedAt?: string;
  [key: string]: unknown;
}

export interface Rendered {
  /** WhatsApp only: approved BSP template name. */
  templateName?: string;
  /** Email only. Always <= MAX_SUBJECT_LENGTH. */
  subject?: string;
  /** Always present: the plain-text part (email) or the rendered body (WhatsApp). */
  text: string;
  /** Email only. */
  html?: string;
  /** WhatsApp only: positional body parameters keyed "1".."n". */
  variables?: Record<string, string>;
}

export const MAX_SUBJECT_LENGTH = 78;

/* ------------------------------------------------------------------ helpers */

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const templateName = (key: keyof typeof WHATSAPP_TEMPLATES): string => {
  const override =
    key === "inquiry_ack_v1"
      ? process.env.WHATSAPP_TEMPLATE_INQUIRY_ACK
      : key === "inquiry_followup_v1"
        ? process.env.WHATSAPP_TEMPLATE_INQUIRY_FOLLOWUP
        : process.env.WHATSAPP_TEMPLATE_INQUIRY_OPS_ALERT;
  return override?.trim() || WHATSAPP_TEMPLATES[key].name;
};

/** Builds a WhatsApp rendering from the registry so `text` is exactly the template body with values filled in. */
function whatsapp(key: keyof typeof WHATSAPP_TEMPLATES, values: string[]): Rendered {
  const variables: Record<string, string> = {};
  values.forEach((v, i) => {
    variables[String(i + 1)] = cleanVariable(v);
  });
  return { templateName: templateName(key), text: renderWhatsAppBody(WHATSAPP_TEMPLATES[key].body, variables), variables };
}

/**
 * Meta rejects body parameters containing newlines, tabs or more than four
 * consecutive spaces; customer-supplied values are also untrusted. Collapse
 * whitespace and cap the length.
 */
export function cleanVariable(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 200 ? `${collapsed.slice(0, 199)}…` : collapsed || "—";
}

/** Truncates a subject to the RFC-friendly single-line limit without cutting mid-word where possible. */
export function clampSubject(subject: string): string {
  const s = subject.replace(/\s+/g, " ").trim();
  if (s.length <= MAX_SUBJECT_LENGTH) return s;
  const cut = s.slice(0, MAX_SUBJECT_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function itemLines(ctx: TemplateContext): string {
  if (!ctx.items.length) return "No specific activities yet — we'll suggest a plan around your dates.";
  return ctx.items.map((i) => `• ${i.title}${i.date ? ` · ${i.date}` : ""}${i.time ? ` · ${i.time}` : ""}`).join("\n");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** Escapes and converts newlines — for multi-line text blocks inside a paragraph. */
function pre(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

/** Only http(s) URLs may be emitted as hrefs; anything else becomes a plain "#". */
function safeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : "#";
}

/**
 * Brand header for the email shell.
 *
 * The Sand-baked PNG is used rather than the transparent one: the email body
 * is #FFF8F0, and a dark-mode client that inverts the background would make
 * transparent Ink letters disappear. The image needs an absolute URL, and
 * falls back to the wordmark as text when no site URL is configured — an
 * email with a broken image is worse than one with no logo.
 */
function emailHeaderLogo(): string {
  const base = siteConfig.siteUrl?.replace(/\/$/, "");
  if (!base) return `<div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;margin-bottom:16px">OUTLYY</div>`;
  return `<img src="${base}/brand/outlyy-email-header@2x.png" width="208" height="48" alt="OUTLYY" style="display:block;border:0;margin-bottom:16px">`;
}

/** Minimal, inline-styled email shell. Customer text is escaped — it is untrusted (§17 §9 #6). */
export function emailShell(title: string, bodyHtml: string, ctx: TemplateContext): string {
  return `<!doctype html><html><body style="margin:0;background:#FFF8F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  ${emailHeaderLogo()}
  <div style="background:#fff;border:1px solid #e7e5e4;border-radius:16px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
    ${bodyHtml}
  </div>
  <p style="font-size:12px;color:#78716c;margin-top:16px">We message only about this trip. No marketing unless you ask for it.${ctx.supportEmail ? ` Reply to this email or write to ${escapeHtml(ctx.supportEmail)}.` : ""}</p>
</div></body></html>`;
}

function p(html: string) {
  return `<p style="margin:0 0 12px;line-height:1.5">${html}</p>`;
}

function email(subject: string, title: string, bodyHtml: string, text: string, ctx: TemplateContext): Rendered {
  return { subject: clampSubject(subject), text, html: emailShell(title, bodyHtml, ctx) };
}

/* ------------------------------------------------------------------ render */

export function renderTemplate(event: NotificationEvent, channel: NotificationChannel, ctx: TemplateContext): Rendered {
  switch (event) {
    case "INQUIRY_ACK": {
      const availability = ctx.outOfHours ? ACK_AVAILABILITY.outOfHours : ACK_AVAILABILITY.inHours;
      if (channel === "whatsapp") {
        return whatsapp("inquiry_ack_v1", [ctx.leadFirstName, ctx.reference, ctx.agentFirstName, ctx.deadlineLabel, availability]);
      }
      const when = ctx.outOfHours
        ? `Our team is offline right now. ${ctx.agentFirstName} will message you by ${ctx.deadlineLabel}.`
        : `${ctx.agentFirstName} is checking with the operator now and will message you by ${ctx.deadlineLabel}.`;
      const text = [
        `Hi ${ctx.leadFirstName}, got it — your reference is ${ctx.reference}.`,
        when,
        `What we're checking:\n${itemLines(ctx)}`,
        `Nothing is charged until you say yes. If anything changes from the price you saw, we tell you first.`,
        ctx.whatsappNumber ? `Faster on WhatsApp: https://wa.me/${ctx.whatsappNumber}?text=${encodeURIComponent(`Ref ${ctx.reference}`)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      return email(
        `Got it — ${ctx.reference}. ${ctx.agentFirstName} replies by ${ctx.deadlineLabel}`,
        `Got it, ${ctx.leadFirstName}.`,
        p(escapeHtml(when)) +
          p(`<strong>Reference:</strong> ${escapeHtml(ctx.reference)}`) +
          p(`<strong>What we're checking</strong><br>${pre(itemLines(ctx))}`) +
          p(`Nothing is charged until you say yes. If anything changes from the price you saw, we tell you first.`) +
          (ctx.whatsappNumber
            ? p(`Faster on WhatsApp: <a href="${safeHref(`https://wa.me/${ctx.whatsappNumber}?text=${encodeURIComponent(`Ref ${ctx.reference}`)}`)}">message us</a>.`)
            : ""),
        text,
        ctx,
      );
    }

    case "INQUIRY_OPS_ALERT": {
      if (channel === "whatsapp") {
        return whatsapp("inquiry_ops_alert_v1", [ctx.reference, inr(ctx.indicativeTotalInr), String(ctx.itemCount), ctx.agentFirstName, ctx.deadlineLabel, ctx.consoleUrl]);
      }
      const text = [
        `New inquiry ${ctx.reference} · ${inr(ctx.indicativeTotalInr)} · ${ctx.itemCount} item(s)`,
        `Lead: ${ctx.leadName} · ${ctx.leadPhone}${ctx.leadEmail ? ` · ${ctx.leadEmail}` : ""}`,
        `Dates: ${ctx.datesFlexible ? "flexible" : (ctx.travelDateFrom ?? "—")} · Guests: ${ctx.guests}${ctx.dietary ? ` · ${ctx.dietary}` : ""}${ctx.hotel ? ` · Hotel: ${ctx.hotel}` : ""}`,
        `Assigned: ${ctx.agentName} · reply by ${ctx.deadlineLabel}${ctx.outOfHours ? " (out of hours)" : ""}`,
        ``,
        itemLines(ctx),
        ctx.specialRequests ? `\nNotes: ${ctx.specialRequests}` : "",
        `\nOpen: ${ctx.consoleUrl}`,
      ].join("\n");
      return email(
        `[OUTLYY] New inquiry ${ctx.reference} — ${inr(ctx.indicativeTotalInr)} — ${ctx.agentFirstName}`,
        `New inquiry ${ctx.reference}`,
        p(pre(text)) + p(`<a href="${safeHref(ctx.consoleUrl)}">Open in console</a>`),
        text,
        ctx,
      );
    }

    case "INQUIRY_ASSIGNED": {
      const verb = ctx.reassigned ? "Reassigned" : "Assigned";
      const text = `${verb} to you: ${ctx.reference} · ${ctx.leadName} · ${inr(ctx.indicativeTotalInr)}. Reply by ${ctx.deadlineLabel}.\n\n${itemLines(ctx)}\n\n${ctx.consoleUrl}`;
      return email(
        `[OUTLYY] ${verb}: ${ctx.reference} — reply by ${ctx.deadlineLabel}`,
        `${verb} to you`,
        p(pre(text)),
        text,
        ctx,
      );
    }

    case "INQUIRY_SLA_BREACH": {
      const text = `SLA breached: ${ctx.reference} · ${ctx.leadName} · ${inr(ctx.indicativeTotalInr)} was due ${ctx.deadlineLabel}. Assigned: ${ctx.agentName}. The customer has been told we're still checking.\n\n${ctx.consoleUrl}`;
      return email(
        `[OUTLYY] SLA breach ${ctx.reference} — was due ${ctx.deadlineLabel}`,
        `SLA breached — ${ctx.reference}`,
        p(pre(text)) + p(`<a href="${safeHref(ctx.consoleUrl)}">Open in console</a>`),
        text,
        ctx,
      );
    }

    case "INQUIRY_STILL_CHECKING": {
      if (channel === "whatsapp") {
        return whatsapp("inquiry_followup_v1", [ctx.leadFirstName, ctx.reference, FOLLOWUP_SENTENCES.stillChecking, ctx.agentFirstName]);
      }
      const text = `Hi ${ctx.leadFirstName}, about your OUTLYY inquiry ${ctx.reference} — ${FOLLOWUP_SENTENCES.stillChecking}\n\nReply to this email and ${ctx.agentFirstName} will pick it up.`;
      return email(`${ctx.reference} — still checking with the operator`, `Still checking — ${ctx.reference}`, p(pre(text)), text, ctx);
    }

    case "INQUIRY_FOLLOWUP": {
      const stage = ctx.stage ?? 1;
      const sentence = stage <= 1 ? FOLLOWUP_SENTENCES.stage1 : stage === 2 ? FOLLOWUP_SENTENCES.stage2 : FOLLOWUP_SENTENCES.stage3;
      if (channel === "whatsapp") {
        return whatsapp("inquiry_followup_v1", [ctx.leadFirstName, ctx.reference, sentence, ctx.agentFirstName]);
      }
      const text = `Hi ${ctx.leadFirstName}, about your OUTLYY inquiry ${ctx.reference} — ${sentence}\n\nReply to this email and ${ctx.agentFirstName} will pick it up.`;
      const subjectTail = stage <= 1 ? "did the options work?" : stage === 2 ? "checking in" : "last note from us";
      return email(`${ctx.reference} — ${subjectTail}`, `About ${ctx.reference}`, p(pre(text)), text, ctx);
    }

    case "INQUIRY_WON": {
      const booking = ctx.orderReference ?? ctx.reference;
      const text = `Hi ${ctx.leadFirstName}, your trip is confirmed. Booking reference ${booking} (inquiry ${ctx.reference}). Your vouchers and pickup details follow from ${ctx.agentFirstName} on WhatsApp.`;
      return email(`Confirmed — booking ${booking}`, "Your trip is confirmed", p(escapeHtml(text)), text, ctx);
    }

    case "ACCOUNT_DELETION_REQUEST": {
      // Internal, ops recipients only: they need the full identity to find and anonymise the
      // records (§05.8) — the same scope the ops alert already carries. Everything is escaped in html.
      const customerId = ctx.customerId ?? ctx.reference;
      const text = [
        `A customer asked for their account and data to be deleted.`,
        `Customer: ${ctx.leadName || "(no name given)"} · ${ctx.leadPhone}${ctx.leadEmail ? ` · ${ctx.leadEmail}` : ""}`,
        `Customer id: ${customerId}${ctx.customerSince ? ` · with us since ${ctx.customerSince.slice(0, 10)}` : ""}`,
        `Requested: ${ctx.requestedAt ?? "—"}`,
        ctx.deletionReason ? `Reason given: ${ctx.deletionReason}` : "No reason given.",
        ``,
        `Nothing has been deleted yet. Review the request, then run the anonymisation from the console (privacy → anonymise by phone). The account stays usable until then.`,
        ``,
        `Audit trail: ${ctx.consoleUrl}`,
      ].join("\n");
      return email(
        `[OUTLYY] Deletion request — ${ctx.phoneMasked ?? ctx.leadPhone}`,
        "Account deletion request",
        p(pre(text)) + p(`<a href="${safeHref(ctx.consoleUrl)}">Open audit trail</a>`),
        text,
        ctx,
      );
    }
  }
}
