import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import { Errors } from "../lib/errors";
import { uuidv7 } from "../lib/ids";
import { requirePermission, type Actor, requireAnyPermission } from "../lib/actor";
import { forwarders } from "../analytics/forwarders";
import { analyticsRepo, type DateRange, type FunnelReport, type ReconciliationRow, type SourceRow, type TierRateRow } from "../repositories/analytics.repo";

/**
 * Analytics — our collector is the source of truth (§11.1, §17 §5.3).
 *
 *  - `collect()` persists client events from POST /api/events (validated,
 *    rate-limited and enriched by the route).
 *  - `emit()` records server-emitted events on state transitions. Money and
 *    pipeline events (`inquiry_submitted`, `inquiry_won`, `booking_confirmed`)
 *    come from services, never from the browser.
 *  - Forwarding to Meta CAPI / PostHog / GA4 is a port (`analytics/forwarders`)
 *    with no-op adapters until credentials exist. It is fire-and-forget after
 *    the row is written; the request never waits on it.
 *  - `report()` / `funnel()` expose the owned-SQL reports (§11.6) behind
 *    `reports.view`.
 *
 * Privacy (§11.9, §13.7.1): dietary, accessibility, special requests and any
 * contact field are stripped from `props` before the row is written, so they
 * can never reach a forwarder by accident. Analytics must never break an
 * inquiry: every write is caught and logged.
 */

export interface ServerEventInput {
  name: string;
  eventId?: string;
  occurredAt?: Date;
  inquiryId?: string;
  orderId?: string;
  productSlug?: string;
  rail?: "self_serve" | "assisted";
  tier?: string;
  valueMinor?: bigint;
  currency?: string;
  sessionId?: string;
  anonId?: string;
  props?: Record<string, unknown>;
}

export interface ClientEventInput {
  event: string;
  event_id: string;
  ts?: number;
  props: Record<string, unknown>;
  sessionId?: string;
  anonId?: string;
  ipHash?: string;
  userAgent?: string;
  geoCountry?: string;
}

/* ---------------------------------------------------------------------------
 * PII scrub — exact keys (after normalisation) plus fragments that catch
 * variants like `lead_phone`, `traveller_email`, `dietary_requirements`.
 * ------------------------------------------------------------------------ */

const PII_EXACT = new Set([
  "dietary", "accessibility", "special_requests", "specialrequests", "notes", "message", "comments",
  "hotel", "hotel_name", "pickup_zone", "pickup_address", "address", "room_number",
  "phone", "email", "name", "full_name", "first_name", "last_name", "lead_name", "lead_phone", "lead_email",
  "whatsapp", "whatsapp_number", "contact", "contact_number",
  "passport", "passport_number", "dob", "date_of_birth", "nationality",
  "ip", "ip_address", "user_agent",
  "password", "token", "otp", "authorization", "cookie",
]);
const PII_FRAGMENTS = ["phone", "email", "passport", "dietary", "accessib", "special_request", "allerg", "medical", "password", "secret", "token"];

function isPiiKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (PII_EXACT.has(k)) return true;
  return PII_FRAGMENTS.some((f) => k.includes(f));
}

export function scrubProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) if (!isPiiKey(k) && v !== undefined) out[k] = v;
  return out;
}

const RANGE_MAX_DAYS = 366;

function assertRange(range: DateRange): DateRange {
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw Errors.validation({ range: "from must be before to" });
  }
  if (to.getTime() - from.getTime() > RANGE_MAX_DAYS * 86_400_000) {
    throw Errors.validation({ range: `Pick a range of at most ${RANGE_MAX_DAYS} days` });
  }
  return { from, to };
}

export interface AnalyticsReport {
  range: { from: string; to: string };
  funnel: FunnelReport;
  byTier: TierRateRow[];
  sources: SourceRow[];
  reconciliation: ReconciliationRow[];
  forwarders: { name: string; enabled: boolean; implemented: boolean }[];
}

export const analyticsService = {
  async emit(input: ServerEventInput): Promise<void> {
    const e = env();
    const eventId = input.eventId ?? `${input.name}-${uuidv7()}`;
    const props = scrubProps(input.props ?? {});
    try {
      await prisma.analyticsEvent.create({
        data: {
          id: uuidv7(),
          eventId,
          name: input.name,
          occurredAt: input.occurredAt ?? new Date(),
          sessionId: input.sessionId,
          anonId: input.anonId,
          inquiryId: input.inquiryId,
          orderId: input.orderId,
          productSlug: input.productSlug,
          rail: input.rail,
          tier: input.tier?.slice(0, 1),
          valueMinor: input.valueMinor,
          currency: input.currency,
          props: props as Prisma.InputJsonValue,
          source: "server",
          environment: e.APP_ENV,
        },
      });
    } catch (error) {
      log.error("analytics.emit_failed", { name: input.name, error });
      return;
    }
    void forwarders
      .forward({ ...input, props, eventId, source: "server", environment: e.APP_ENV })
      .catch((error) => log.warn("analytics.forward_failed", { name: input.name, error }));
  },

  async collect(events: ClientEventInput[]): Promise<{ accepted: number; duplicates: number }> {
    const e = env();
    let accepted = 0;
    let duplicates = 0;
    for (const ev of events) {
      const props = scrubProps(ev.props);
      const value = typeof props.value === "number" && Number.isFinite(props.value) ? BigInt(Math.round(props.value * 100)) : undefined;
      const occurredAt = ev.ts ? new Date(ev.ts) : new Date();
      const row = {
        eventId: ev.event_id,
        name: ev.event,
        occurredAt,
        sessionId: ev.sessionId,
        anonId: ev.anonId,
        productSlug: typeof props.activity_slug === "string" ? props.activity_slug.slice(0, 120) : undefined,
        rail: typeof props.rail === "string" ? props.rail : undefined,
        tier: typeof props.tier === "string" ? props.tier.slice(0, 1).toUpperCase() : undefined,
        valueMinor: value,
        currency: typeof props.currency === "string" ? props.currency.slice(0, 3) : undefined,
      };
      try {
        await prisma.analyticsEvent.create({
          data: {
            id: uuidv7(),
            ...row,
            props: props as Prisma.InputJsonValue,
            source: "client",
            ipHash: ev.ipHash,
            userAgent: ev.userAgent,
            geoCountry: ev.geoCountry,
            environment: e.APP_ENV,
          },
        });
        accepted++;
      } catch (error) {
        // Unique (event_id, source) — sendBeacon retries produce duplicates; that is fine.
        if ((error as { code?: string }).code === "P2002") duplicates++;
        else log.warn("analytics.collect_failed", { name: ev.event, error });
        continue;
      }
      void forwarders
        .forward({ ...row, props, source: "client", environment: e.APP_ENV })
        .catch((error) => log.warn("analytics.forward_failed", { name: ev.event, error }));
    }
    return { accepted, duplicates };
  },

  /* ============================================================ reports */

  /** Everything the inquiries report page needs from analytics, in one call. */
  async report(actor: Actor, range: DateRange): Promise<AnalyticsReport> {
    requirePermission(actor, "reports.view");
    const r = assertRange(range);
    const [funnel, byTier, sources, reconciliation] = await Promise.all([
      analyticsRepo.funnel(r),
      analyticsRepo.inquiryRateByTier(r),
      analyticsRepo.sourceBreakdown(r),
      analyticsRepo.reconciliation(r),
    ]);
    return {
      range: { from: r.from.toISOString(), to: r.to.toISOString() },
      funnel,
      byTier,
      sources,
      reconciliation,
      forwarders: forwarders.list(),
    };
  },

  /**
   * Inquiry-mode operations dashboard (`analytics.view`): daily trend, top
   * activities, WhatsApp clicks by placement, status changes and per-agent
   * performance. Booking-mode metrics plug in here once orders flow (§17 §5.3).
   */
  async inquiryDashboard(actor: Actor, range: DateRange) {
    requireAnyPermission(actor, ["analytics.view", "reports.view"]);
    const r = assertRange(range);
    const [daily, topActivities, whatsapp, statusChanges, agents, funnel, sources] = await Promise.all([
      analyticsRepo.daily(r),
      analyticsRepo.topActivities(r),
      analyticsRepo.whatsappClicks(r),
      analyticsRepo.statusChanges(r),
      analyticsRepo.agentPerformance(r),
      analyticsRepo.funnel(r),
      analyticsRepo.sourceBreakdown(r),
    ]);
    return { range: { from: r.from.toISOString(), to: r.to.toISOString() }, daily, topActivities, whatsapp, statusChanges, agents, funnel, sources };
  },

  async agentPerformance(actor: Actor, range: DateRange) {
    requireAnyPermission(actor, ["analytics.view", "reports.view"]);
    return analyticsRepo.agentPerformance(assertRange(range));
  },

  async funnel(actor: Actor, range: DateRange): Promise<FunnelReport> {
    requirePermission(actor, "reports.view");
    return analyticsRepo.funnel(assertRange(range));
  },

  async inquiryRateByTier(actor: Actor, range: DateRange): Promise<TierRateRow[]> {
    requirePermission(actor, "reports.view");
    return analyticsRepo.inquiryRateByTier(assertRange(range));
  },

  async sourceBreakdown(actor: Actor, range: DateRange): Promise<SourceRow[]> {
    requirePermission(actor, "reports.view");
    return analyticsRepo.sourceBreakdown(assertRange(range));
  },
};
