import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, TX_OPTIONS, type Tx } from "../lib/db";
import { env } from "../lib/env";
import { Errors } from "../lib/errors";
import { log } from "../lib/logger";
import { defer } from "../lib/defer";
import { uuidv7, isValidReference, normaliseReference } from "../lib/ids";
import { hashIp, sha256Hex } from "../lib/crypto";
import { enforceRateLimit } from "../lib/rate-limit";
import { audit } from "../lib/audit";
import { moneyToMinor, percentDelta, toMinor } from "../lib/money";
import { customerActor, hasPermission, requirePermission, SYSTEM_ACTOR, type Actor } from "../lib/actor";
import { computeSlaDueAt, formatDeadline, isWithinBusinessHours, nextFollowupAt, zonedParts } from "../domain/sla";
import { normalisePhone } from "../domain/phone";
import { canTransition, CONTACTED_OR_LATER, LOST_REASONS, OPEN_STATUSES, TERMINAL } from "../domain/inquiry-state";
import { chooseAgent, type AgentCandidate } from "../domain/routing";
import { cleanText, evaluateSpam } from "../domain/spam";
import { inquiryRepo, toAgentPublic } from "../repositories/inquiry.repo";
import { adminRepo } from "../repositories/admin.repo";
import { recordConsent } from "../repositories/consent.repo";
import { settingsRepo } from "../repositories/settings.repo";
import { settingsService } from "./settings.service";
import { catalogService } from "./catalog.service";
import { notificationService } from "./notification.service";
import { analyticsService } from "./analytics.service";
import { orderService } from "./order.service";
import type {
  AgentPublic,
  CreateInquiryInput,
  CreateInquiryResult,
  InquiryDetail,
  InquiryListFilters,
  InquirySummary,
} from "./inquiry.types";
import type { InquiryStatus, Money, PaxCount } from "@/lib/types";

/** settings key holding the last sweep heartbeat — read by the dashboard health check. */
export const SWEEP_HEARTBEAT_KEY = "sweep_heartbeat";

/** One click can never start an unbounded transaction. */
export const BULK_ASSIGN_LIMIT = 200;

/**
 * Inquiry service — the core system of Inquiry Mode (§17 §5–§7).
 *
 * Owns: validation + spam + rate limits, server-side re-pricing, creation
 * with items/events/consent in one transaction, SLA deadline, lead routing,
 * every status transition, notes, agent-confirmed figures, conversion to an
 * order via `orderService.createOrder`, and the scheduled sweep (breach,
 * follow-up ladder, auto-lost). Every mutation is audited and permission-checked
 * here, not in the route (§13.3).
 */

const TEAM_AGENT: AgentPublic = {
  id: "team",
  name: "The OUTLYY team",
  initials: "OT",
  role: "Dubai trip specialists",
  languages: ["English", "Hindi"],
  shift: "IST",
};

const PAX_KEYS: (keyof PaxCount)[] = ["adult", "child", "infant", "senior"];

function guestsOf(pax?: PaxCount): number {
  return pax ? PAX_KEYS.reduce((s, k) => s + (pax[k] ?? 0), 0) : 0;
}

function activeShift(cfg: { timeZone: string }, now: Date): "IST" | "GST" {
  // IST desk covers the morning/afternoon; the UAE desk covers the evening (§17 §7.3 rule 6).
  const { minutesOfDay } = zonedParts(now, cfg.timeZone);
  return minutesOfDay >= 9 * 60 && minutesOfDay < 17 * 60 ? "IST" : "GST";
}

async function loadCandidates(): Promise<AgentCandidate[]> {
  const users = await adminRepo.listRoutable();
  return users.map((u) => ({
    id: u.id,
    status: u.availability?.status ?? "available",
    maxConcurrent: u.availability?.maxConcurrent ?? 0,
    openCount: u.openCount,
    skills: u.availability?.skills ?? [],
    shift: u.availability?.shift ?? "IST",
    roles: u.roles,
  }));
}

async function agentPublicById(id: string | null | undefined): Promise<AgentPublic | undefined> {
  if (!id) return undefined;
  const a = await prisma.adminUser.findUnique({
    where: { id },
    select: { id: true, fullName: true, whatsappDisplayName: true, photoUrl: true, email: true, availability: { select: { title: true, languages: true, shift: true } } },
  });
  return toAgentPublic(a);
}

async function addEvent(
  tx: Tx | typeof prisma,
  inquiryId: string,
  data: { kind: "status" | "note" | "assignment" | "contact" | "item" | "system"; from?: InquiryStatus; to?: InquiryStatus; actor: Actor; note?: string; meta?: Record<string, unknown> },
) {
  await tx.inquiryEvent.create({
    data: {
      inquiryId,
      kind: data.kind,
      fromStatus: data.from,
      toStatus: data.to,
      actorType: data.actor.type,
      actorId: data.actor.id,
      note: data.note,
      meta: data.meta as Prisma.InputJsonValue | undefined,
    },
  });
}

function assertCanView(actor: Actor, inquiry: { assignedAgent?: { id: string } }) {
  if (hasPermission(actor, "inquiries.view_all")) return;
  if (hasPermission(actor, "inquiries.view_own") && inquiry.assignedAgent?.id === actor.id) return;
  throw Errors.forbidden("inquiries.view_all");
}

function assertCanUpdate(actor: Actor, inquiry: { assignedAgent?: { id: string } }) {
  requirePermission(actor, "inquiries.update");
  if (hasPermission(actor, "inquiries.assign")) return; // leads/ops can act on any
  if (inquiry.assignedAgent?.id !== actor.id) throw Errors.forbidden("inquiries.assign");
}

/** Spam moderation follows the same ownership rule as updates: leads/ops anywhere, agents on their own inquiries. */
function assertCanModerate(actor: Actor, inquiry: { assignedAgent?: { id: string } }) {
  requirePermission(actor, "inquiries.mark_spam");
  if (hasPermission(actor, "inquiries.assign")) return;
  if (inquiry.assignedAgent?.id !== actor.id) throw Errors.forbidden("inquiries.assign");
}

/**
 * Contact PII leaves the service only for actors holding `customers.view_pii`
 * (§13.7, §17 §9 #9). Everyone else (read-only, content) gets the masked phone
 * and no email — the same rule the console applies when it renders.
 */
function redactSummary<T extends InquirySummary>(s: T): T {
  return { ...s, leadPhone: s.leadPhoneMasked };
}

function redactDetail(d: InquiryDetail): InquiryDetail {
  return { ...redactSummary(d), leadEmail: undefined, history: d.history.map(redactSummary) };
}

function forActor<T extends InquirySummary>(actor: Actor, s: T): T {
  return hasPermission(actor, "customers.view_pii") ? s : redactSummary(s);
}

export const inquiryService = {
  /* ================================================================ create */

  async create(input: CreateInquiryInput, ctx: { ip?: string; userAgent?: string } = {}): Promise<CreateInquiryResult> {
    const e = env();
    const now = new Date();

    // 1. Identity + validation (§12.13)
    const phone = normalisePhone(input.leadPhone, input.countryCode);
    if (!phone.valid) throw Errors.validation({ phone: phone.reason ?? "That doesn't look like a valid WhatsApp number." });
    const leadName = cleanText(input.leadName, 120);
    if (!leadName || leadName.length < 2) throw Errors.validation({ name: "So we know who to reply to." });
    const leadEmail = input.leadEmail?.trim().toLowerCase() || undefined;
    if (leadEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)) throw Errors.validation({ email: "Check the email address" });
    if (input.items.length > 12) throw Errors.validation({ items: "Too many items for one inquiry — message us on WhatsApp instead" });

    // 2. Rate limits — per phone and per IP (§17 §9 #1)
    await enforceRateLimit({ key: `inquiry:phone:${sha256Hex(phone.e164).slice(0, 16)}`, limit: e.INQUIRY_RATE_LIMIT_PER_PHONE_PER_HOUR, windowSeconds: 3600 });
    if (ctx.ip) await enforceRateLimit({ key: `inquiry:ip:${hashIp(ctx.ip)}`, limit: e.INQUIRY_RATE_LIMIT_PER_IP_PER_HOUR, windowSeconds: 3600 });

    // 3. Spam verdict
    const suppressed = await inquiryRepo.isSuppressed(phone.e164);
    const verdict = evaluateSpam({
      honeypot: input.honeypot,
      startedAt: input.startedAt,
      now: now.getTime(),
      minSubmitSeconds: e.INQUIRY_MIN_SUBMIT_SECONDS,
      suppressed,
      leadName,
      notes: input.specialRequests,
      email: leadEmail,
    });
    if (verdict.reject) {
      log.warn("inquiry.spam_rejected", { signals: verdict.signals, ipHash: hashIp(ctx.ip) });
      throw Errors.spamRejected();
    }

    // 4. Server-side re-pricing — never trust the client's totals
    const priced = await catalogService.priceCartItems(input.items);
    const totalInr = priced.reduce((s, p) => s + p.totalMinor.inr, 0n);
    const totalAed = priced.reduce((s, p) => s + p.totalMinor.aed, 0n);
    if (priced.some((p) => p.clientMismatch)) verdict.signals.priceMismatch = true;

    // 5. SLA + routing
    const [sla, routing] = await Promise.all([settingsService.sla(), settingsService.routing()]);
    const withinHours = isWithinBusinessHours(sla, now);
    const slaDueAt = computeSlaDueAt(sla, now);
    const guests = guestsOf(input.pax);
    let chosen: { id: string; rule: string } | null = null;
    if (!verdict.quarantine) {
      const candidates = await loadCandidates();
      const previousAgentId = await inquiryRepo.previousAgentForPhone(phone.e164);
      const pick = chooseAgent(candidates, {
        totalInrMinor: totalInr,
        guests,
        currency: input.currency,
        countryCode: phone.countryCode,
        hasTierD: priced.some((p) => p.tier === "D"),
        dietary: input.dietary,
        previousAgentId,
        withinBusinessHours: withinHours,
        activeShift: activeShift(sla, now),
        premiumThresholdMinor: toMinor(routing.premiumThresholdInr),
        groupThreshold: routing.groupThresholdPax,
        maxConcurrentDefault: routing.maxConcurrentDefault,
      });
      if (pick.agent) chosen = { id: pick.agent.id, rule: pick.rule };
    }

    // 6. Persist — inquiry + items + events + consent, one transaction
    const actor = customerActor({ ipHash: hashIp(ctx.ip), userAgent: ctx.userAgent });
    const id = uuidv7();
    const status: InquiryStatus = verdict.quarantine ? "spam" : chosen ? "assigned" : "new";

    const agent = (await agentPublicById(chosen?.id)) ?? TEAM_AGENT;
    const reference = await prisma.$transaction(async (tx) => {
      const ref = await inquiryRepo.nextReference(tx);
      await tx.inquiry.create({
        data: {
          id,
          reference: ref,
          status,
          source: input.source,
          leadName,
          leadPhone: phone.e164,
          leadEmail,
          countryCode: phone.countryCode,
          whatsappConsent: input.whatsappConsent,
          travelDateFrom: input.datesFlexible || !input.travelDateFrom ? null : new Date(`${input.travelDateFrom}T00:00:00Z`),
          travelDateTo: input.datesFlexible || !input.travelDateTo ? null : new Date(`${input.travelDateTo}T00:00:00Z`),
          datesFlexible: input.datesFlexible,
          pax: input.pax as unknown as Prisma.InputJsonValue | undefined,
          hotel: cleanText(input.hotel, 200),
          dietary: input.dietary,
          specialRequests: cleanText(input.specialRequests, 1000),
          budgetBand: input.budgetBand,
          currency: input.currency,
          indicativeTotalInr: totalInr,
          indicativeTotalAed: totalAed,
          assignedAgentId: chosen?.id,
          assignedAt: chosen ? now : null,
          slaDueAt: verdict.quarantine ? null : slaDueAt,
          attribution: input.attribution as Prisma.InputJsonValue | undefined,
          sessionId: input.sessionId,
          anonId: input.anonId,
          ipHash: hashIp(ctx.ip),
          userAgent: ctx.userAgent,
          spamSignals: verdict.signals as Prisma.InputJsonValue,
          items: {
            create: priced.map((p, idx) => ({
              id: uuidv7(),
              productId: p.productId,
              comboId: p.comboId,
              variantCode: p.cartItem.variantId,
              serviceDate: p.cartItem.date ? new Date(`${p.cartItem.date}T00:00:00Z`) : null,
              timeslot: p.cartItem.time,
              pax: p.cartItem.pax as unknown as Prisma.InputJsonValue,
              addons: p.cartItem.addOnIds as unknown as Prisma.InputJsonValue,
              titleSnapshot: p.cartItem.title,
              tierSnapshot: p.tier,
              slugSnapshot: p.cartItem.slug,
              kindSnapshot: p.cartItem.kind,
              imageSnapshot: p.cartItem.image,
              variantNameSnapshot: p.cartItem.variantName,
              confirmationSnapshot: p.cartItem.confirmation,
              fulfilmentModeSnapshot: p.fulfilmentMode,
              freeCancellationHoursSnapshot: p.cartItem.freeCancellationHours,
              durationMinutesSnapshot: p.cartItem.durationMinutes,
              inclusionsSnapshot: p.inclusions,
              cancellationPolicySnapshot: p.cancellationPolicy as Prisma.InputJsonValue,
              indicativeUnitInr: p.unitMinor.inr,
              indicativeUnitAed: p.unitMinor.aed,
              indicativeTotalInr: p.totalMinor.inr,
              indicativeTotalAed: p.totalMinor.aed,
              sortOrder: idx,
            })),
          },
        },
      });
      await addEvent(tx, id, { kind: "system", to: status, actor, note: "Inquiry received", meta: { source: input.source, itemCount: priced.length } });
      if (chosen) {
        await addEvent(tx, id, { kind: "assignment", from: "new", to: "assigned", actor: SYSTEM_ACTOR, meta: { agentId: chosen.id, agentName: agent.name, rule: chosen.rule } });
      }
      await recordConsent(
        {
          phoneE164: phone.e164,
          email: leadEmail,
          channel: "whatsapp",
          purpose: "transactional",
          granted: input.whatsappConsent,
          source: input.source,
          evidence: { copy: "Reply to me on WhatsApp about this trip.", page: "/inquiry", ipHash: hashIp(ctx.ip) },
        },
        tx,
      );
      return ref;
    }, TX_OPTIONS);

    // 7. Side effects — after the response, never failing the submission (§17 §7.2 steps 6–9)
    const deadlineLabel = formatDeadline(slaDueAt, sla, now);
    if (!verdict.quarantine) {
      defer("inquiry.notify", async () => {
        const detail = await inquiryRepo.findById(id);
        if (detail) {
          await notificationService.onInquirySubmitted({ inquiry: detail, agent, deadline: slaDueAt, deadlineLabel, outOfHours: !withinHours });
        }
      });
      defer("inquiry.analytics", () => analyticsService.emit({
        name: "inquiry_submitted",
        inquiryId: id,
        rail: "assisted",
        valueMinor: totalInr,
        currency: "INR",
        sessionId: input.sessionId,
        anonId: input.anonId,
        tier: priced[0]?.tier,
        productSlug: priced[0]?.cartItem.slug,
        props: { inquiry_reference: reference, inquiry_source: input.source, item_count: priced.length, guest_count: guests, assigned: Boolean(chosen), routing_rule: chosen?.rule, out_of_hours: !withinHours },
      }));
    } else {
      log.warn("inquiry.quarantined", { reference, signals: verdict.signals });
    }

    return { id, reference, slaDueAt: slaDueAt.toISOString(), agent, outOfHours: !withinHours };
  },

  /* ============================================================== customer */

  /** Reference + phone both required (§17 §9 #4). Returns the customer-safe projection. */
  async lookupForCustomer(reference: string, phoneRaw: string, countryCode = "+91") {
    const ref = normaliseReference(reference);
    if (!isValidReference(ref, "INQ")) throw Errors.notFound("Inquiry");
    const phone = normalisePhone(phoneRaw, countryCode);
    const detail = await inquiryRepo.findForCustomer(ref, phone.e164);
    if (!detail || detail.status === "spam") throw Errors.notFound("Inquiry");
    return inquiryService.toCustomerView(detail);
  },

  toCustomerView(d: InquiryDetail) {
    // Allow-list projection (§17 §9 #4): the customer sees their own submission, the public status,
    // the agent's public card and a coarse timeline. Never: attribution, spam signals, ip/ua, internal
    // notes, ops timers (SLA/follow-up/escalation), loss reasons, other inquiries from the same phone,
    // notification recipients, or the agent's email.
    const agent = d.assignedAgent ? { ...d.assignedAgent, email: undefined } : undefined;
    return {
      id: d.id,
      reference: d.reference,
      status: d.status,
      source: d.source,
      leadName: d.leadName,
      leadPhone: d.leadPhoneMasked,
      leadPhoneMasked: d.leadPhoneMasked,
      leadEmail: d.leadEmail,
      countryCode: d.countryCode,
      currency: d.currency,
      indicativeTotal: d.indicativeTotal,
      itemCount: d.itemCount,
      itemTitles: d.itemTitles,
      travelDateFrom: d.travelDateFrom,
      travelDateTo: d.travelDateTo,
      datesFlexible: d.datesFlexible,
      guests: d.guests,
      pax: d.pax,
      hotel: d.hotel,
      dietary: d.dietary,
      specialRequests: d.specialRequests,
      budgetBand: d.budgetBand,
      whatsappConsent: d.whatsappConsent,
      slaDueAt: d.slaDueAt,
      firstResponseAt: d.firstResponseAt,
      lastContactAt: d.lastContactAt,
      convertedOrderReference: d.convertedOrderReference,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      agent,
      timeline: d.events
        .filter((ev) => ev.kind === "status" || ev.kind === "system" || ev.kind === "contact")
        .map((ev) => ({ kind: ev.kind, toStatus: ev.toStatus, createdAt: ev.createdAt })),
      items: d.items.map((i) => ({
        id: i.id,
        kind: i.kind,
        slug: i.slug,
        title: i.title,
        image: i.image,
        tier: i.tier,
        date: i.date,
        time: i.time,
        variantId: i.variantId,
        variantName: i.variantName,
        pax: i.pax,
        addOnIds: i.addOnIds,
        confirmation: i.confirmation,
        fulfilmentMode: i.fulfilmentMode,
        freeCancellationHours: i.freeCancellationHours,
        durationMinutes: i.durationMinutes,
        inclusions: i.inclusions,
        cancellationPolicy: i.cancellationPolicy,
        indicativeUnit: i.indicativeUnit,
        indicativeTotal: i.indicativeTotal,
        confirmedTotal: i.confirmedTotal,
        availabilityCheckedAt: i.availabilityCheckedAt,
        sortOrder: i.sortOrder,
      })),
    };
  },

  /* ================================================================ reads */

  async get(actor: Actor, id: string): Promise<InquiryDetail> {
    const d = await inquiryRepo.findById(id);
    if (!d) throw Errors.notFound("Inquiry");
    assertCanView(actor, d);
    if (!hasPermission(actor, "customers.view_pii")) return redactDetail(d);
    // PII access from the console is logged per view (§13.7.2) — fire and forget.
    void audit(actor, "inquiry.view_pii", { type: "inquiry", id }).catch(() => {});
    return d;
  },

  async list(actor: Actor, filters: InquiryListFilters) {
    if (!hasPermission(actor, "inquiries.view_all")) requirePermission(actor, "inquiries.view_own");
    const result = await inquiryRepo.list(filters, { agentId: actor.id, viewAll: hasPermission(actor, "inquiries.view_all") });
    return { ...result, items: result.items.map((s) => forActor(actor, s)) };
  },

  async queueCounts(actor: Actor) {
    if (!hasPermission(actor, "inquiries.view_all")) requirePermission(actor, "inquiries.view_own");
    return inquiryRepo.queueCounts(actor.id);
  },

  /** Routable agents for the assign picker — public fields and current load only (no email, roles or permissions). */
  async listAgents(actor: Actor) {
    if (!hasPermission(actor, "inquiries.view_all")) requirePermission(actor, "inquiries.view_own");
    const users = await adminRepo.listRoutable();
    return users.map((u) => {
      const name = u.whatsappDisplayName?.includes(" ") ? u.whatsappDisplayName : u.fullName;
      return {
        id: u.id,
        name,
        initials: name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join(""),
        role: u.availability?.title ?? "Dubai trip specialist",
        languages: u.availability?.languages ?? [],
        shift: u.availability?.shift === "GST" ? ("GST" as const) : ("IST" as const),
        photoUrl: u.photoUrl ?? undefined,
        availability: u.availability?.status ?? "available",
        openCount: u.openCount,
        maxConcurrent: u.availability?.maxConcurrent ?? 0,
        isLead: u.roles.includes("agent_lead"),
      };
    });
  },

  /* ========================================================= assignment */

  async claim(actor: Actor, id: string) {
    requirePermission(actor, "inquiries.claim");
    if (!actor.id) throw Errors.forbidden("inquiries.claim");
    return inquiryService.assign(actor, id, actor.id, "Claimed from queue");
  },

  async assign(actor: Actor, id: string, agentId: string, reason?: string) {
    const d = await inquiryRepo.findById(id);
    if (!d) throw Errors.notFound("Inquiry");
    const selfClaim = agentId === actor.id && !d.assignedAgent;
    if (!selfClaim) requirePermission(actor, "inquiries.assign");
    if (TERMINAL.has(d.status)) throw Errors.invalidTransition(d.status, "assigned");
    const target = await adminRepo.findById(agentId);
    if (!target || target.status !== "active" || !target.totpEnabled) throw Errors.validation({ agentId: "That agent cannot receive inquiries" });

    const now = new Date();
    const from = d.status;
    const to: InquiryStatus = d.status === "new" ? "assigned" : d.status;
    await prisma.$transaction(async (tx) => {
      await tx.inquiry.update({ where: { id }, data: { assignedAgentId: agentId, assignedAt: now, status: to, escalatedAt: null } });
      await addEvent(tx, id, { kind: "assignment", from, to, actor, note: reason, meta: { agentId, agentName: target.fullName, previousAgentId: d.assignedAgent?.id, previousAgentName: d.assignedAgent?.name } });
      await audit(actor, "inquiry.assign", { type: "inquiry", id }, { before: { agentId: d.assignedAgent?.id, status: from }, after: { agentId, status: to }, reason }, tx);
    }, TX_OPTIONS);

    const [sla, agent, detail] = await Promise.all([settingsService.sla(), agentPublicById(agentId), inquiryRepo.findById(id)]);
    if (detail && agent && agent.id !== actor.id) {
      const deadline = detail.slaDueAt ? new Date(detail.slaDueAt) : now;
      defer("inquiry.assign_notify", () =>
        notificationService.onInquiryAssigned({ inquiry: detail, agent, deadline, deadlineLabel: formatDeadline(deadline, sla, now), outOfHours: !isWithinBusinessHours(sla, now), reassigned: Boolean(d.assignedAgent) }),
      );
    }
    return detail!;
  },

  /**
   * Assign many inquiries to one agent in a single transaction.
   *
   * Assigning from the queue one row at a time costs four round trips each;
   * a morning triage of thirty leads was minutes of waiting. This does the
   * same writes — assignment, timeline event, audit row — in a fixed number
   * of queries.
   *
   * Deliberately does NOT fire the per-inquiry "you've been assigned"
   * notification: thirty of them at once is a notification storm, not an
   * alert. The agent sees the leads in their queue, and every row still
   * carries its assignment event and audit entry.
   */
  async bulkAssign(actor: Actor, ids: string[], agentId: string, reason?: string) {
    requirePermission(actor, "inquiries.assign");
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) throw Errors.validation({ ids: "Select at least one inquiry" });
    if (unique.length > BULK_ASSIGN_LIMIT) throw Errors.validation({ ids: `Too many at once — ${BULK_ASSIGN_LIMIT} is the limit` });

    const target = await adminRepo.findById(agentId);
    if (!target || target.status !== "active" || !target.totpEnabled) {
      throw Errors.validation({ agentId: "That agent cannot receive inquiries — check they are active and have finished two-factor enrolment" });
    }

    const now = new Date();
    const why = reason?.trim() || "Bulk assigned from the queue";

    return prisma.$transaction(async (tx) => {
      const rows = await tx.inquiry.findMany({
        where: { id: { in: unique } },
        select: { id: true, status: true, assignedAgentId: true },
      });
      const open = rows.filter((r) => !TERMINAL.has(r.status as InquiryStatus));
      const skipped = rows.length - open.length;
      const moving = open.filter((r) => r.assignedAgentId !== agentId);
      if (!moving.length) return { assigned: 0, skipped, alreadyTheirs: open.length, agentName: target.fullName };

      // "new" becomes "assigned"; anything further along keeps its status.
      const fresh = moving.filter((r) => r.status === "new").map((r) => r.id);
      const later = moving.filter((r) => r.status !== "new").map((r) => r.id);
      if (fresh.length) {
        await tx.inquiry.updateMany({ where: { id: { in: fresh } }, data: { assignedAgentId: agentId, assignedAt: now, status: "assigned", escalatedAt: null } });
      }
      if (later.length) {
        await tx.inquiry.updateMany({ where: { id: { in: later } }, data: { assignedAgentId: agentId, assignedAt: now, escalatedAt: null } });
      }

      await tx.inquiryEvent.createMany({
        data: moving.map((r) => ({
          inquiryId: r.id,
          kind: "assignment",
          fromStatus: r.status,
          toStatus: r.status === "new" ? "assigned" : r.status,
          actorType: actor.type,
          actorId: actor.id,
          note: why,
          meta: { agentId, agentName: target.fullName, previousAgentId: r.assignedAgentId, bulk: true } as Prisma.InputJsonValue,
        })),
      });

      await tx.auditLog.createMany({
        data: moving.map((r) => ({
          actorType: actor.type,
          actorId: actor.id,
          action: "inquiry.assign",
          entityType: "inquiry",
          entityId: r.id,
          before: { agentId: r.assignedAgentId, status: r.status } as Prisma.InputJsonValue,
          after: { agentId, status: r.status === "new" ? "assigned" : r.status, bulk: true } as Prisma.InputJsonValue,
          reason: why,
          ipHash: actor.ipHash,
          userAgent: actor.userAgent,
        })),
      });

      return { assigned: moving.length, skipped, alreadyTheirs: open.length - moving.length, agentName: target.fullName };
    }, TX_OPTIONS);
  },

  /**
   * Release an inquiry back to the queue (ownership management, §09 §5).
   * The owner may release their own; anyone else needs `inquiries.assign`.
   * Status returns to `new` only if no agent has contacted the customer yet.
   */
  async unassign(actor: Actor, id: string, reason?: string) {
    const d = await inquiryRepo.findById(id);
    if (!d) throw Errors.notFound("Inquiry");
    if (!d.assignedAgent) return d;
    if (d.assignedAgent.id !== actor.id) requirePermission(actor, "inquiries.assign");
    if (TERMINAL.has(d.status)) throw Errors.invalidTransition(d.status, "new");
    const from = d.status;
    const to: InquiryStatus = d.status === "assigned" ? "new" : d.status;
    await prisma.$transaction(async (tx) => {
      await tx.inquiry.update({ where: { id }, data: { assignedAgentId: null, assignedAt: null, status: to } });
      await addEvent(tx, id, { kind: "assignment", from, to, actor, note: reason ?? "Released to queue", meta: { agentId: null, previousAgentId: d.assignedAgent?.id, previousAgentName: d.assignedAgent?.name } });
      await audit(actor, "inquiry.unassign", { type: "inquiry", id }, { before: { agentId: d.assignedAgent?.id, status: from }, after: { agentId: null, status: to }, reason }, tx);
    }, TX_OPTIONS);
    return (await inquiryRepo.findById(id))!;
  },

  /* ========================================================= transitions */

  async transition(actor: Actor, id: string, to: InquiryStatus, opts: { reason?: string; note?: string } = {}): Promise<InquiryDetail> {
    const d = await inquiryRepo.findById(id);
    if (!d) throw Errors.notFound("Inquiry");
    assertCanUpdate(actor, d);
    const from = d.status;
    if (from === to && to !== "assigned") return d;
    if (!canTransition(from, to)) throw Errors.invalidTransition(from, to);
    if (to === "won") throw Errors.conflict("Use convertToOrder to win an inquiry — it creates the order");
    if (to === "spam") return inquiryService.markSpam(actor, id, { reason: opts.reason ?? "Marked spam", suppress: false });
    if (to === "lost") {
      if (!opts.reason || !(LOST_REASONS as readonly string[]).includes(opts.reason)) throw Errors.validation({ reason: "Pick a loss reason" });
      requirePermission(actor, "inquiries.update");
    }
    if (from === "lost" || from === "spam") requirePermission(actor, "inquiries.assign"); // reopen is a lead action

    const now = new Date();
    const followup = await settingsService.followup();
    const data: Prisma.InquiryUpdateInput = { status: to };
    if (from === "spam" && to === "new") {
      // markSpam cleared the deadline; a reopened lead gets a fresh one so the sweep sees it.
      data.slaDueAt = computeSlaDueAt(await settingsService.sla(), now);
      data.slaBreachedAt = null;
    }
    if (CONTACTED_OR_LATER.has(to)) {
      if (!d.firstResponseAt) data.firstResponseAt = now;
      data.lastContactAt = now;
      data.followupStage = 0;
      data.nextFollowupAt = to === "payment_pending" ? null : nextFollowupAt(followup.ladderHours, 0, now);
      data.slaBreachedAt = d.slaBreachedAt ? new Date(d.slaBreachedAt) : null;
    }
    if (to === "lost") {
      data.lostReason = opts.reason;
      data.lostAt = now;
      data.nextFollowupAt = null;
    }
    if ((from === "lost" || from === "spam") && to !== "lost") {
      data.lostReason = null;
      data.lostAt = null;
      data.nextFollowupAt = nextFollowupAt(followup.ladderHours, 0, now);
    }

    await prisma.$transaction(async (tx) => {
      await tx.inquiry.update({ where: { id }, data });
      await addEvent(tx, id, { kind: "status", from, to, actor, note: opts.note ?? (to === "lost" ? opts.reason : undefined) });
      await audit(actor, "inquiry.transition", { type: "inquiry", id }, { before: { status: from }, after: { status: to }, reason: opts.reason }, tx);
    }, TX_OPTIONS);

    const eventName =
      to === "contacted" ? "inquiry_first_response" : to === "quoted" ? "inquiry_quoted" : to === "lost" ? "inquiry_lost" : `inquiry_${to}`;
    await analyticsService.emit({
      name: eventName,
      inquiryId: id,
      rail: "assisted",
      valueMinor: BigInt(Math.round(d.indicativeTotal.inr * 100)),
      currency: "INR",
      props: {
        inquiry_reference: d.reference,
        from_status: from,
        to_status: to,
        lost_reason: opts.reason,
        agent_id: d.assignedAgent?.id,
        ...(to === "contacted" && !d.firstResponseAt ? { first_response_seconds: Math.round((now.getTime() - new Date(d.createdAt).getTime()) / 1000) } : {}),
      },
    });

    return (await inquiryRepo.findById(id))!;
  },

  async addNote(actor: Actor, id: string, note: string): Promise<InquiryDetail> {
    const d = await inquiryRepo.findById(id);
    if (!d) throw Errors.notFound("Inquiry");
    assertCanView(actor, d);
    requirePermission(actor, "inquiries.update");
    const text = cleanText(note, 2000);
    if (!text) throw Errors.validation({ note: "Write something first" });
    await addEvent(prisma, id, { kind: "note", actor, note: text });
    return (await inquiryRepo.findById(id))!;
  },

  /** Agent records a customer touch without changing status (keeps the follow-up clock honest). */
  async logContact(actor: Actor, id: string, note?: string): Promise<InquiryDetail> {
    const d = await inquiryRepo.findById(id);
    if (!d) throw Errors.notFound("Inquiry");
    assertCanUpdate(actor, d);
    if (d.status === "new" || d.status === "assigned") return inquiryService.transition(actor, id, "contacted", { note });
    const now = new Date();
    const followup = await settingsService.followup();
    // A touch on a won/lost/spam inquiry is recorded but must not restart the ladder;
    // payment_pending never runs the ladder (the link itself is the follow-up).
    const scheduleFollowup = !TERMINAL.has(d.status) && d.status !== "payment_pending";
    await prisma.$transaction(async (tx) => {
      await tx.inquiry.update({
        where: { id },
        data: { lastContactAt: now, followupStage: 0, nextFollowupAt: scheduleFollowup ? nextFollowupAt(followup.ladderHours, 0, now) : null },
      });
      await addEvent(tx, id, { kind: "contact", actor, note });
    }, TX_OPTIONS);
    return (await inquiryRepo.findById(id))!;
  },

  /**
   * Agent-confirmed figures per item (§17 §7.2 steps 11–12). Returns a
   * tolerance warning when the confirmed total exceeds the indicative by more
   * than `pricing.tolerancePercent` — the agent must explain, the customer
   * must re-consent, and it must never be quoted quietly (§7.5).
   */
  async updateItem(actor: Actor, id: string, itemId: string, patch: { confirmedTotal?: Money | null; availabilityNote?: string; availabilityChecked?: boolean }) {
    const d = await inquiryRepo.findById(id);
    if (!d) throw Errors.notFound("Inquiry");
    assertCanUpdate(actor, d);
    const item = d.items.find((i) => i.id === itemId);
    if (!item) throw Errors.notFound("Inquiry item");

    const pricing = await settingsService.pricing();
    let toleranceExceeded = false;
    const data: Prisma.InquiryItemUpdateInput = {};
    if (patch.confirmedTotal === null) {
      data.confirmedTotalInr = null;
      data.confirmedTotalAed = null;
    } else if (patch.confirmedTotal) {
      const minor = moneyToMinor(patch.confirmedTotal);
      if (minor.inr < 0n || minor.aed < 0n) throw Errors.validation({ confirmedTotal: "Cannot be negative" });
      data.confirmedTotalInr = minor.inr;
      data.confirmedTotalAed = minor.aed;
      toleranceExceeded = percentDelta(BigInt(Math.round(item.indicativeTotal.inr * 100)), minor.inr) > pricing.tolerancePercent;
    }
    if (patch.availabilityNote !== undefined) data.availabilityNote = cleanText(patch.availabilityNote, 500) ?? null;
    if (patch.availabilityChecked) data.availabilityCheckedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.inquiryItem.update({ where: { id: itemId }, data });
      await addEvent(tx, id, { kind: "item", actor, meta: { itemId, ...patch, toleranceExceeded } });
      await audit(actor, "inquiry.item_update", { type: "inquiry_item", id: itemId }, { before: { confirmedTotal: item.confirmedTotal, availabilityNote: item.availabilityNote }, after: patch, reason: toleranceExceeded ? `Confirmed price exceeds indicative by > ${pricing.tolerancePercent}%` : undefined }, tx);
    }, TX_OPTIONS);
    return { inquiry: (await inquiryRepo.findById(id))!, toleranceExceeded, tolerancePercent: pricing.tolerancePercent };
  },

  async markSpam(actor: Actor, id: string, opts: { reason: string; suppress: boolean }): Promise<InquiryDetail> {
    requirePermission(actor, "inquiries.mark_spam");
    const d = await inquiryRepo.findById(id);
    if (!d) throw Errors.notFound("Inquiry");
    assertCanModerate(actor, d);
    if (d.status === "won") throw Errors.invalidTransition("won", "spam");
    await prisma.$transaction(async (tx) => {
      await tx.inquiry.update({ where: { id }, data: { status: "spam", nextFollowupAt: null, slaDueAt: null } });
      await addEvent(tx, id, { kind: "status", from: d.status, to: "spam", actor, note: opts.reason });
      if (opts.suppress) {
        await tx.suppressedPhone.upsert({ where: { phoneE164: d.leadPhone }, create: { phoneE164: d.leadPhone, reason: opts.reason, addedBy: actor.id }, update: { reason: opts.reason, addedBy: actor.id } });
      }
      await audit(actor, "inquiry.mark_spam", { type: "inquiry", id }, { before: { status: d.status }, after: { status: "spam", suppressed: opts.suppress }, reason: opts.reason }, tx);
    }, TX_OPTIONS);
    return (await inquiryRepo.findById(id))!;
  },

  async unsuppress(actor: Actor, phoneE164: string) {
    requirePermission(actor, "inquiries.assign");
    await prisma.suppressedPhone.deleteMany({ where: { phoneE164 } });
    await audit(actor, "suppression.remove", { type: "phone", id: sha256Hex(phoneE164).slice(0, 16) });
  },

  /* ========================================================== conversion */

  /**
   * THE load-bearing artefact (§17 §6.5): won inquiry → order by column copy.
   * `confirmed_*` wins where present, `indicative_*` otherwise. Attribution is
   * copied so the win is uploadable to Meta offline (AC-META-02). Payment is
   * recorded from the Razorpay Payment Link the agent sent by hand.
   */
  async convertToOrder(
    actor: Actor,
    id: string,
    input: { paymentLinkUrl?: string; paymentLinkId?: string; gatewayPaymentId?: string; amountPaidInr?: number; method?: string; paidAt?: string; note?: string },
  ) {
    requirePermission(actor, "inquiries.convert");
    const d = await inquiryRepo.findById(id);
    if (!d) throw Errors.notFound("Inquiry");
    assertCanUpdate(actor, d);
    if (d.status === "won") throw Errors.conflict("Already converted", { orderReference: d.convertedOrderReference });
    if (!canTransition(d.status, "won")) throw Errors.invalidTransition(d.status, "won");
    if (!d.items.length) throw Errors.validation({ items: "Add at least one item before converting" });
    const missingDate = d.items.find((i) => !i.date);
    if (missingDate) throw Errors.validation({ items: `"${missingDate.title}" needs a confirmed service date` });
    const unconfirmed = d.items.filter((i) => !i.confirmedTotal);
    if (unconfirmed.length) throw Errors.validation({ items: `Confirm the price on: ${unconfirmed.map((i) => i.title).join(", ")}` });

    const items = d.items.map((i) => {
      const total = moneyToMinor(i.confirmedTotal ?? i.indicativeTotal);
      const unit = moneyToMinor(i.indicativeUnit);
      return {
        productId: i.productId,
        comboId: i.comboId,
        variantCode: i.variantId,
        titleSnapshot: i.title,
        tierSnapshot: i.tier,
        slugSnapshot: i.slug,
        kindSnapshot: i.kind,
        imageSnapshot: i.image,
        variantNameSnapshot: i.variantName,
        confirmationSnapshot: i.confirmation,
        fulfilmentModeSnapshot: i.fulfilmentMode,
        freeCancellationHoursSnapshot: i.freeCancellationHours,
        durationMinutesSnapshot: i.durationMinutes,
        inclusionsSnapshot: i.inclusions,
        cancellationPolicySnapshot: i.cancellationPolicy,
        serviceDate: i.date!,
        timeslot: i.time,
        pax: i.pax,
        addons: i.addOnIds,
        unitInr: unit.inr,
        unitAed: unit.aed,
        totalInr: total.inr,
        totalAed: total.aed,
      };
    });
    const totalInr = items.reduce((s, i) => s + i.totalInr, 0n);
    const attribution = (d.attribution ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof attribution[k] === "string" ? (attribution[k] as string) : undefined);
    const date = (k: string) => {
      const v = attribution[k];
      const d = typeof v === "string" || typeof v === "number" ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d : undefined;
    };
    // `datetime-local` values carry no zone; agents work in IST, so treat a zoneless string as IST.
    const paidAtRaw = input.paidAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(input.paidAt) ? `${input.paidAt}+05:30` : input.paidAt;
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
    if (Number.isNaN(paidAt.getTime())) throw Errors.validation({ paidAt: "Enter a valid date and time" });

    const result = await prisma.$transaction(async (tx) => {
      const order = await orderService.createOrder(
        {
          rail: "assisted",
          currency: d.currency,
          paymentCollection: "manual_link",
          sourceInquiryId: id,
          idempotencyKey: `inquiry:${id}`,
          traveller: { fullName: d.leadName, phoneE164: d.leadPhone, email: d.leadEmail, hotel: d.hotel, pickupZone: d.pickupZone, dietary: d.dietary, specialRequests: d.specialRequests },
          items,
          attribution: {
            firstSource: str("utm_source") ?? str("first_source"),
            firstMedium: str("utm_medium") ?? str("first_medium"),
            firstCampaign: str("utm_campaign") ?? str("first_campaign"),
            firstTouchAt: date("first_touch_at"),
            lastSource: str("last_source") ?? str("utm_source"),
            lastMedium: str("last_medium") ?? str("utm_medium"),
            lastCampaign: str("last_campaign") ?? str("utm_campaign"),
            lastTouchAt: date("last_touch_at"),
            fbclid: str("fbclid"),
            fbc: str("fbc"),
            fbp: str("fbp"),
            gclid: str("gclid"),
          },
          initialStatus: "paid",
          paidAt,
        },
        actor,
        tx,
      );
      await orderService.recordManualPayment(
        actor,
        order.id,
        { amountMinor: input.amountPaidInr !== undefined ? toMinor(input.amountPaidInr) : totalInr, currency: "INR", method: input.method, paymentLinkId: input.paymentLinkId, paymentLinkUrl: input.paymentLinkUrl, gatewayPaymentId: input.gatewayPaymentId, capturedAt: paidAt },
        tx,
      );
      await tx.inquiry.update({ where: { id }, data: { status: "won", convertedOrderId: order.id, nextFollowupAt: null, lastContactAt: new Date() } });
      await addEvent(tx, id, { kind: "status", from: d.status, to: "won", actor, note: input.note, meta: { orderId: order.id, orderReference: order.reference } });
      await audit(actor, "inquiry.convert", { type: "inquiry", id }, { before: { status: d.status }, after: { status: "won", orderReference: order.reference, totalInr: totalInr.toString() } }, tx);
      return order;
    }, TX_OPTIONS);

    // booking_confirmed stays the business conversion (§17 §5.3) — emitted server-side, uploadable offline.
    await analyticsService.emit({ name: "inquiry_won", inquiryId: id, orderId: result.id, rail: "assisted", valueMinor: totalInr, currency: "INR", props: { inquiry_reference: d.reference, order_reference: result.reference, item_count: items.length, agent_id: d.assignedAgent?.id } });
    await analyticsService.emit({ name: "booking_confirmed", inquiryId: id, orderId: result.id, rail: "assisted", valueMinor: totalInr, currency: "INR", tier: items[0]?.tierSnapshot, props: { order_reference: result.reference, gmv: Number(totalInr) / 100, item_count: items.length, has_combo: items.some((i) => i.kindSnapshot === "combo"), payment_collection: "manual_link", offline_conversion_pending: true } });

    const detail = (await inquiryRepo.findById(id))!;
    defer("inquiry.won_notify", () => notificationService.onInquiryWon({ inquiry: detail, agent: detail.assignedAgent, orderReference: result.reference }));
    return { inquiry: detail, order: result };
  },

  /* =============================================================== sweep */

  /**
   * Scheduled sweep (§17 §7.2 ladder, §7.5 breach). Idempotent: each row is
   * advanced by one rung per pass; breaches are marked once. Safe to run every
   * few minutes from Vercel Cron.
   */
  async sweep(now = new Date()) {
    const [sla, followup] = await Promise.all([settingsService.sla(), settingsService.followup()]);
    const summary = { breached: 0, followups: 0, autoLost: 0, notificationRetries: 0 };

    // 1. SLA breaches → mark, escalate to ops, tell the customer we're still checking
    for (const row of await inquiryRepo.dueForSla(now)) {
      await prisma.inquiry.update({ where: { id: row.id }, data: { slaBreachedAt: now, escalatedAt: now } });
      await addEvent(prisma, row.id, { kind: "system", actor: SYSTEM_ACTOR, note: "SLA breached — escalated", meta: { dueAt: row.slaDueAt } });
      const detail = await inquiryRepo.findById(row.id);
      if (detail) {
        const deadline = row.slaDueAt ?? now;
        await notificationService
          .onSlaBreach({ inquiry: detail, agent: detail.assignedAgent, deadline, deadlineLabel: formatDeadline(deadline, sla, now), outOfHours: !isWithinBusinessHours(sla, now) })
          .catch((error) => log.error("sweep.breach_notify_failed", { id: row.id, error }));
        await analyticsService.emit({ name: "inquiry_sla_breached", inquiryId: row.id, rail: "assisted", props: { inquiry_reference: row.reference, agent_id: row.assignedAgentId } });
      }
      summary.breached++;
    }

    // 2. Follow-up ladder → next rung, or auto-lost after the final one.
    //    Rungs are anchored on the last agent contact (T+2h, T+24h, T+72h, T+7d — §17 §7.2),
    //    not on the sweep that sent the previous rung, so a late cron does not drift the
    //    ladder. A rung already in the past fires on the next pass; the floor below stops a
    //    burst of nudges after an outage.
    const MIN_GAP_MS = 60 * 60_000;
    for (const row of await inquiryRepo.dueForFollowup(now)) {
      const stage = row.followupStage + 1;
      const detail = await inquiryRepo.findById(row.id);
      if (!detail) continue;
      const lastContact = row.lastContactAt ?? new Date(detail.createdAt);
      if (stage > followup.ladderHours.length) {
        if (now.getTime() - lastContact.getTime() >= followup.autoLostAfterHours * 3600_000 && row.status !== "payment_pending") {
          await inquiryService.transition(SYSTEM_ACTOR, row.id, "lost", { reason: "no_response", note: "Auto-closed after follow-up ladder" });
          summary.autoLost++;
        } else {
          await prisma.inquiry.update({ where: { id: row.id }, data: { nextFollowupAt: new Date(lastContact.getTime() + followup.autoLostAfterHours * 3600_000) } });
        }
        continue;
      }
      const anchored = nextFollowupAt(followup.ladderHours, stage, lastContact) ?? new Date(lastContact.getTime() + followup.autoLostAfterHours * 3600_000);
      const next = new Date(Math.max(anchored.getTime(), now.getTime() + MIN_GAP_MS));
      await prisma.inquiry.update({ where: { id: row.id }, data: { followupStage: stage, nextFollowupAt: next } });
      await addEvent(prisma, row.id, { kind: "system", actor: SYSTEM_ACTOR, note: `Follow-up ${stage} sent`, meta: { stage } });
      await notificationService.onFollowupDue({ inquiry: detail, agent: detail.assignedAgent, stage }).catch((error) => log.error("sweep.followup_failed", { id: row.id, error }));
      summary.followups++;
    }

    // 3. Retry failed notifications
    const retry = await notificationService.retryFailed();
    summary.notificationRetries = retry.retried;

    // Record the heartbeat so the console can say when the sweep last ran.
    // A cron that silently never fires makes every SLA feature inert; this is
    // what turns that into something visible on the dashboard.
    await settingsRepo.set(SWEEP_HEARTBEAT_KEY, { ranAt: now.toISOString(), ...summary }).catch((error) => log.error("sweep.heartbeat_failed", { error }));

    log.info("inquiry.sweep", summary);
    return summary;
  },

  /* ============================================================ reporting */

  async metrics(actor: Actor, range: { from: Date; to: Date }) {
    requirePermission(actor, "reports.view");
    const where = { createdAt: { gte: range.from, lte: range.to }, status: { not: "spam" as const } };
    const [total, byStatus, responded, won, breached] = await Promise.all([
      prisma.inquiry.count({ where }),
      prisma.inquiry.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.inquiry.findMany({ where: { ...where, firstResponseAt: { not: null } }, select: { createdAt: true, firstResponseAt: true, slaDueAt: true } }),
      prisma.inquiry.findMany({ where: { ...where, status: "won" }, select: { createdAt: true, lostAt: true, updatedAt: true, indicativeTotalInr: true, convertedOrder: { select: { totalInr: true } } } }),
      prisma.inquiry.count({ where: { ...where, slaBreachedAt: { not: null } } }),
    ]);
    const secs = responded.map((r) => (r.firstResponseAt!.getTime() - r.createdAt.getTime()) / 1000).sort((a, b) => a - b);
    const pct = (p: number) => (secs.length ? secs[Math.min(secs.length - 1, Math.floor(p * secs.length))] : null);
    const withinSla = responded.filter((r) => r.slaDueAt && r.firstResponseAt! <= r.slaDueAt).length;
    const gmvMinor = won.reduce((s, w) => s + (w.convertedOrder?.totalInr ?? w.indicativeTotalInr), 0n);
    const lost = await prisma.inquiry.groupBy({ by: ["lostReason"], where: { ...where, status: "lost" }, _count: { _all: true } });
    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      responded: responded.length,
      medianFirstResponseSeconds: pct(0.5),
      p90FirstResponseSeconds: pct(0.9),
      slaHitRate: responded.length ? withinSla / responded.length : null,
      breached,
      won: won.length,
      winRate: total ? won.length / total : null,
      gmvInr: Number(gmvMinor) / 100,
      lostReasons: Object.fromEntries(lost.map((l) => [l.lostReason ?? "unknown", l._count._all])),
      openStatuses: OPEN_STATUSES,
    };
  },
};
