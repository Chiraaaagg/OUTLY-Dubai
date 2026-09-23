import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import { uuidv7 } from "../lib/ids";
import type { Actor } from "../lib/actor";
import { hasPermission, requirePermission } from "../lib/actor";
import { audit } from "../lib/audit";
import { Errors } from "../lib/errors";
import { analyticsService } from "./analytics.service";
import type { AgentPublic, InquiryDetail } from "./inquiry.types";
import { renderTemplate, supportsChannel, type NotificationEvent, type TemplateContext } from "../notifications/templates";
import { emailAdapter } from "../notifications/email.adapter";
import { whatsappAdapter } from "../notifications/whatsapp.adapter";
import { isRecipientAllowed } from "../notifications/allowlist";
import { latestConsent } from "../repositories/consent.repo";

/**
 * Notification service — channel-agnostic dispatch (§04.6.3, §17 §7.2 steps 6–8).
 *
 * A caller says *what happened* (`onInquirySubmitted`); this decides who is
 * told, on which channel, with which template, and records every attempt in
 * `notifications`. Rules that live here and nowhere else:
 *
 *  - Non-production recipient allowlist (§14.1 non-negotiable #3): outside
 *    production a message to a recipient not on the allowlist is recorded as
 *    `suppressed`, never sent. An empty allowlist suppresses everything.
 *  - Consent is re-checked at send time, not schedule time (§08.7). An
 *    explicit `granted=false` row (STOP keyword, profile toggle) suppresses
 *    transactional and marketing alike; marketing additionally needs a
 *    positive grant.
 *  - A notification failure never fails the inquiry. Errors are recorded on
 *    the row and logged; the sweep job retries `failed` rows in place.
 *
 * Channels: email via Resend (ACTIVE when RESEND_API_KEY is set, else log);
 * WhatsApp via the BSP adapter (DEFERRED — log adapter until credentials exist).
 *
 * Recording model: `dispatch` writes exactly one row per attempt to reach a
 * recipient. `retryFailed` re-attempts the *same* row (attempt++), so the
 * table reads as one row per intended message, not one per try. `resend`
 * (a human clicking "resend") deliberately creates a new row — it is a new
 * decision and is audited as such.
 */

export interface DispatchInput {
  event: NotificationEvent;
  channel: "whatsapp" | "email";
  recipient: string;
  inquiryId?: string;
  orderId?: string;
  context: TemplateContext;
  /** transactional (default) or marketing — marketing requires explicit consent */
  purpose?: "transactional" | "marketing";
  scheduledFor?: Date;
}

export interface DispatchResult {
  id: string;
  status: "sent" | "failed" | "suppressed";
  providerId?: string;
  error?: string;
}

type SuppressedReason = "non_production_allowlist" | "opted_out" | "no_consent" | "unsupported_channel";

/** Outcome of one attempt to reach a recipient, before anything is written. */
type Outcome =
  | { status: "sent"; template?: string; providerId: string; costMinor?: bigint }
  | { status: "failed"; template?: string; error: string }
  | { status: "suppressed"; template?: string; reason: SuppressedReason };

const MAX_ATTEMPTS = 4;
const RETRY_WINDOW_MS = 24 * 3600_000;

/**
 * Render → environment guard → consent → send. Pure with respect to the
 * notifications table so both `dispatch` and `retryFailed` share it.
 */
async function attempt(input: DispatchInput): Promise<Outcome> {
  const e = env();

  if (!supportsChannel(input.event, input.channel)) {
    log.error("notification.unsupported_channel", { event: input.event, channel: input.channel });
    return { status: "suppressed", reason: "unsupported_channel" };
  }

  let rendered;
  try {
    rendered = renderTemplate(input.event, input.channel, input.context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("notification.render_failed", { event: input.event, channel: input.channel, error: message });
    return { status: "failed", error: `render: ${message}` };
  }
  const template = rendered.templateName;

  // 1. Environment guard — staging can never message a real customer.
  if (e.isNonProduction && !isRecipientAllowed(input.recipient, e.recipientAllowlist)) {
    log.info("notification.suppressed", { event: input.event, channel: input.channel, reason: "non_production_allowlist" });
    return { status: "suppressed", template, reason: "non_production_allowlist" };
  }

  // 2. Consent — transactional replies to an inquiry are legitimate; marketing needs an explicit grant.
  const purpose = input.purpose ?? "transactional";
  const consent = await latestConsent({ recipient: input.recipient, channel: input.channel, purpose });
  if (consent && consent.granted === false) {
    log.info("notification.suppressed", { event: input.event, channel: input.channel, reason: "opted_out" });
    return { status: "suppressed", template, reason: "opted_out" };
  }
  if (purpose === "marketing" && !consent?.granted) {
    return { status: "suppressed", template, reason: "no_consent" };
  }

  // 3. Send.
  try {
    if (input.channel === "email") {
      if (!rendered.subject || !rendered.html) return { status: "failed", template, error: `No email template for ${input.event}` };
      const r = await emailAdapter.send({ to: input.recipient, subject: rendered.subject, html: rendered.html, text: rendered.text });
      return { status: "sent", template, providerId: r.providerId, costMinor: r.costMinor };
    }
    const r = await whatsappAdapter.send({ to: input.recipient, templateName: rendered.templateName, text: rendered.text, variables: rendered.variables ?? {} });
    return { status: "sent", template, providerId: r.providerId, costMinor: r.costMinor };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("notification.failed", { event: input.event, channel: input.channel, error: message });
    return { status: "failed", template, error: message.slice(0, 500) };
  }
}

interface OutcomeColumns {
  status: Outcome["status"];
  sentAt?: Date;
  providerId?: string;
  costMinor?: bigint;
  providerError?: string | null;
  failedAt?: Date | null;
  suppressedReason?: string | null;
}

/** Column values for an outcome — shared by the insert (dispatch) and the update (retry). */
function outcomeColumns(o: Outcome, now: Date): OutcomeColumns {
  switch (o.status) {
    case "sent":
      return { status: "sent", sentAt: now, providerId: o.providerId, costMinor: o.costMinor, providerError: null, failedAt: null, suppressedReason: null };
    case "failed":
      return { status: "failed", failedAt: now, providerError: o.error };
    case "suppressed":
      return { status: "suppressed", suppressedReason: o.reason };
  }
}

function toResult(id: string, o: Outcome): DispatchResult {
  if (o.status === "sent") return { id, status: "sent", providerId: o.providerId };
  if (o.status === "failed") return { id, status: "failed", error: o.error };
  return { id, status: "suppressed" };
}

function serialisableContext(ctx: TemplateContext): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(ctx)) as Prisma.InputJsonValue;
}

export const notificationService = {
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const outcome = await attempt(input);
    const id = uuidv7();
    await prisma.notification.create({
      data: {
        id,
        event: input.event,
        channel: input.channel,
        recipient: input.recipient,
        inquiryId: input.inquiryId,
        orderId: input.orderId,
        template: outcome.template,
        payload: serialisableContext(input.context),
        scheduledFor: input.scheduledFor,
        ...outcomeColumns(outcome, new Date()),
      },
    });
    return toResult(id, outcome);
  },

  /* -------------------------------------------------- inquiry triggers */

  /** T+0: ack to the customer (WhatsApp + email fallback) and the ops alert (§17 §7.2 steps 6–8). */
  async onInquirySubmitted(ctx: { inquiry: InquiryDetail; agent: AgentPublic; deadline: Date; deadlineLabel: string; outOfHours: boolean }) {
    const e = env();
    const base = { inquiryId: ctx.inquiry.id, context: buildContext(ctx) };
    const customerAcks: DispatchResult[] = [];
    const internal: DispatchResult[] = [];

    if (ctx.inquiry.whatsappConsent) {
      customerAcks.push(await notificationService.dispatch({ ...base, event: "INQUIRY_ACK", channel: "whatsapp", recipient: ctx.inquiry.leadPhone }));
    }
    if (ctx.inquiry.leadEmail) {
      customerAcks.push(await notificationService.dispatch({ ...base, event: "INQUIRY_ACK", channel: "email", recipient: ctx.inquiry.leadEmail }));
    }
    for (const to of e.opsAlertEmails) {
      internal.push(await notificationService.dispatch({ ...base, event: "INQUIRY_OPS_ALERT", channel: "email", recipient: to }));
    }
    if (e.WHATSAPP_OPS_ALERT_NUMBER) {
      internal.push(await notificationService.dispatch({ ...base, event: "INQUIRY_OPS_ALERT", channel: "whatsapp", recipient: e.WHATSAPP_OPS_ALERT_NUMBER }));
    }
    if (ctx.agent.email) {
      internal.push(await notificationService.dispatch({ ...base, event: "INQUIRY_ASSIGNED", channel: "email", recipient: ctx.agent.email }));
    }

    // ack_sent_at means "the customer was acknowledged", not "some email went out".
    if (customerAcks.some((r) => r.status === "sent")) {
      await prisma.inquiry.update({ where: { id: ctx.inquiry.id }, data: { ackSentAt: new Date() } }).catch(() => {});
      await analyticsService.emit({ name: "inquiry_acknowledged", inquiryId: ctx.inquiry.id, rail: "assisted", props: { inquiry_reference: ctx.inquiry.reference, out_of_hours: ctx.outOfHours } });
    }
    return [...customerAcks, ...internal];
  },

  async onInquiryAssigned(ctx: { inquiry: InquiryDetail; agent: AgentPublic; deadline: Date; deadlineLabel: string; outOfHours: boolean; reassigned: boolean }) {
    if (!ctx.agent.email) return [];
    return [
      await notificationService.dispatch({
        event: "INQUIRY_ASSIGNED",
        channel: "email",
        recipient: ctx.agent.email,
        inquiryId: ctx.inquiry.id,
        context: { ...buildContext(ctx), reassigned: ctx.reassigned },
      }),
    ];
  },

  /** SLA breach: escalate to ops + a proactive "still checking" to the customer — never silence (§17 §7.5). */
  async onSlaBreach(ctx: { inquiry: InquiryDetail; agent?: AgentPublic; deadline: Date; deadlineLabel: string; outOfHours: boolean }) {
    const e = env();
    const context = buildContext({ ...ctx, agent: ctx.agent ?? fallbackAgent() });
    const results: DispatchResult[] = [];
    for (const to of e.opsAlertEmails) {
      results.push(await notificationService.dispatch({ event: "INQUIRY_SLA_BREACH", channel: "email", recipient: to, inquiryId: ctx.inquiry.id, context }));
    }
    if (ctx.inquiry.whatsappConsent) {
      results.push(await notificationService.dispatch({ event: "INQUIRY_STILL_CHECKING", channel: "whatsapp", recipient: ctx.inquiry.leadPhone, inquiryId: ctx.inquiry.id, context }));
    } else if (ctx.inquiry.leadEmail) {
      results.push(await notificationService.dispatch({ event: "INQUIRY_STILL_CHECKING", channel: "email", recipient: ctx.inquiry.leadEmail, inquiryId: ctx.inquiry.id, context }));
    }
    return results;
  },

  /** Follow-up ladder rung (§17 §7.2). Consent-gated at send time. */
  async onFollowupDue(ctx: { inquiry: InquiryDetail; agent?: AgentPublic; stage: number }) {
    const context = { ...buildContext({ ...ctx, agent: ctx.agent ?? fallbackAgent(), deadline: new Date(), deadlineLabel: "", outOfHours: false }), stage: ctx.stage };
    const results: DispatchResult[] = [];
    if (ctx.inquiry.whatsappConsent) {
      results.push(await notificationService.dispatch({ event: "INQUIRY_FOLLOWUP", channel: "whatsapp", recipient: ctx.inquiry.leadPhone, inquiryId: ctx.inquiry.id, context }));
    } else if (ctx.inquiry.leadEmail) {
      results.push(await notificationService.dispatch({ event: "INQUIRY_FOLLOWUP", channel: "email", recipient: ctx.inquiry.leadEmail, inquiryId: ctx.inquiry.id, context }));
    }
    return results;
  },

  async onInquiryWon(ctx: { inquiry: InquiryDetail; agent?: AgentPublic; orderReference: string }) {
    const context = { ...buildContext({ ...ctx, agent: ctx.agent ?? fallbackAgent(), deadline: new Date(), deadlineLabel: "", outOfHours: false }), orderReference: ctx.orderReference };
    const results: DispatchResult[] = [];
    if (ctx.inquiry.leadEmail) {
      results.push(await notificationService.dispatch({ event: "INQUIRY_WON", channel: "email", recipient: ctx.inquiry.leadEmail, inquiryId: ctx.inquiry.id, context }));
    }
    return results;
  },

  /* ------------------------------------------------------------ console */

  /** Manual resend from the console. A new decision, so a new row + audit entry. */
  async resend(actor: Actor, notificationId: string) {
    requirePermission(actor, "notifications.resend");
    const n = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!n) throw Errors.notFound("Notification");
    // Ownership mirrors the inquiry rule: agents may only act on inquiries assigned to them (§13.3).
    if (!hasPermission(actor, "inquiries.view_all")) {
      const owner = n.inquiryId ? await prisma.inquiry.findUnique({ where: { id: n.inquiryId }, select: { assignedAgentId: true } }) : null;
      if (!owner || !actor.id || owner.assignedAgentId !== actor.id) throw Errors.forbidden("inquiries.view_all");
    }
    if (n.channel !== "email" && n.channel !== "whatsapp") throw Errors.conflict("Only email and WhatsApp can be resent");
    const result = await notificationService.dispatch({
      event: n.event as NotificationEvent,
      channel: n.channel,
      recipient: n.recipient,
      inquiryId: n.inquiryId ?? undefined,
      orderId: n.orderId ?? undefined,
      context: (n.payload as unknown as TemplateContext) ?? {},
    });
    await audit(actor, "notification.resend", { type: "notification", id: notificationId }, { after: { newId: result.id, status: result.status } });
    return result;
  },

  /**
   * Retry `failed` rows younger than 24h — called by the sweep job.
   *
   * Idempotent under concurrent sweeps: each row is claimed with a
   * conditional update (`status = failed AND attempt = <seen>`), so two
   * overlapping runs cannot both send it. The row is then updated in place —
   * no second row, no second `attempt` bump. After MAX_ATTEMPTS the row stays
   * `failed` and surfaces in `recentFailures` for a human.
   */
  async retryFailed(limit = 50) {
    const rows = await prisma.notification.findMany({
      where: { status: "failed", attempt: { lt: MAX_ATTEMPTS }, createdAt: { gt: new Date(Date.now() - RETRY_WINDOW_MS) } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    let retried = 0;
    let stillFailing = 0;
    for (const n of rows) {
      if (n.channel !== "email" && n.channel !== "whatsapp") continue;
      const claim = await prisma.notification.updateMany({
        where: { id: n.id, status: "failed", attempt: n.attempt },
        data: { attempt: { increment: 1 } },
      });
      if (claim.count === 0) continue; // another sweep got here first

      const outcome = await attempt({
        event: n.event as NotificationEvent,
        channel: n.channel,
        recipient: n.recipient,
        inquiryId: n.inquiryId ?? undefined,
        orderId: n.orderId ?? undefined,
        context: (n.payload as unknown as TemplateContext) ?? {},
      });
      await prisma.notification.update({ where: { id: n.id }, data: outcomeColumns(outcome, new Date()) });
      if (outcome.status === "sent") retried++;
      else if (outcome.status === "failed") stillFailing++;
    }
    return { scanned: rows.length, retried, stillFailing };
  },
};

function fallbackAgent(): AgentPublic {
  return { id: "team", name: "The OUTLYY team", initials: "OT", role: "Dubai trip specialists", languages: ["English", "Hindi"], shift: "IST" };
}

export function buildContext(ctx: { inquiry: InquiryDetail; agent: AgentPublic; deadline: Date; deadlineLabel: string; outOfHours: boolean }): TemplateContext {
  const e = env();
  const i = ctx.inquiry;
  return {
    reference: i.reference,
    leadName: i.leadName,
    leadFirstName: i.leadName.trim().split(/\s+/)[0] || i.leadName,
    leadPhone: i.leadPhone,
    leadEmail: i.leadEmail,
    agentName: ctx.agent.name,
    agentFirstName: ctx.agent.name.trim().split(/\s+/)[0] || ctx.agent.name,
    agentRole: ctx.agent.role,
    deadlineIso: ctx.deadline.toISOString(),
    deadlineLabel: ctx.deadlineLabel,
    outOfHours: ctx.outOfHours,
    items: i.items.map((it) => ({ title: it.title, date: it.date, time: it.time, pax: it.pax, indicativeTotalInr: it.indicativeTotal.inr })),
    itemCount: i.items.length,
    travelDateFrom: i.travelDateFrom,
    datesFlexible: i.datesFlexible,
    guests: i.guests,
    dietary: i.dietary,
    hotel: i.hotel,
    specialRequests: i.specialRequests,
    budgetBand: i.budgetBand,
    indicativeTotalInr: i.indicativeTotal.inr,
    currency: i.currency,
    source: i.source,
    siteUrl: e.NEXT_PUBLIC_SITE_URL,
    consoleUrl: `${e.NEXT_PUBLIC_SITE_URL}/admin/inquiries/${i.id}`,
    whatsappNumber: e.NEXT_PUBLIC_WHATSAPP_NUMBER,
    supportEmail: e.NEXT_PUBLIC_SUPPORT_EMAIL ?? e.EMAIL_REPLY_TO,
  };
}
