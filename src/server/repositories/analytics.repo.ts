import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { env } from "../lib/env";

/**
 * Report queries over `analytics_events` + the inquiry pipeline (§11.6
 * dashboards 2–6 are owned SQL, not PostHog; §17 §5.3 new funnel + core
 * metrics). Every query filters `environment = APP_ENV` so staging events
 * never leak into a production report (§11.8).
 *
 * Funnel semantics, decided here so every consumer agrees:
 *  - Browse stages count DISTINCT client sessions (`analytics_events.session_id`).
 *  - Pipeline stages count inquiries created in the range (spam excluded),
 *    read from `inquiries` / `inquiry_events`, never from client events —
 *    the server is the source of truth for anything past submission.
 *
 * Callers: `analyticsService.report()` (route) and the admin dashboard
 * (Server Components may import this repo directly for read models).
 */

export interface DateRange {
  from: Date;
  to: Date;
}

export interface FunnelStage {
  key: FunnelStageKey;
  label: string;
  unit: "sessions" | "inquiries";
  count: number;
}

export type FunnelStageKey =
  | "session"
  | "activity_viewed"
  | "inquiry_item_added"
  | "inquiry_started"
  | "inquiry_submitted"
  | "contacted"
  | "quoted"
  | "won";

export interface FunnelReport {
  from: string;
  to: string;
  stages: FunnelStage[];
  /** Ratios between adjacent stages, null when the upstream stage is empty. */
  stepRates: Partial<Record<FunnelStageKey, number | null>>;
  /** Headline conversions. */
  sessionToInquiry: number | null;
  inquiryToWon: number | null;
}

export interface TierRateRow {
  tier: string;
  /** Distinct sessions that viewed an activity of this tier. */
  views: number;
  /** Inquiries containing at least one item of this tier. */
  inquiries: number;
  won: number;
  inquiryRate: number | null;
  winRate: number | null;
}

export interface SourceRow {
  source: string;
  medium: string;
  sessions: number;
  inquiries: number;
  won: number;
  inquiryRate: number | null;
  winRate: number | null;
}

export interface ReconciliationRow {
  event: string;
  client: number;
  server: number;
  /** (client - server) / server, null when no server events. §11.7 AC-AN-02. */
  delta: number | null;
}

export interface PendingOfflineConversionRow {
  orderId: string;
  orderReference: string;
  sourceInquiryId: string | null;
  status: string;
  paidAt: Date | null;
  confirmedAt: Date | null;
  totalInr: bigint;
  currency: string;
  leadEmail: string | null;
  leadPhone: string | null;
  fbclid: string | null;
  fbc: string | null;
  fbp: string | null;
  gclid: string | null;
  firstTouchAt: Date | null;
  lastTouchAt: Date | null;
}

export interface AgentPerformanceRow {
  agentId: string;
  name: string;
  email: string;
  /** Inquiries created in range currently assigned to the agent. */
  assigned: number;
  responded: number;
  medianFirstResponseSeconds: number | null;
  slaHitRate: number | null;
  won: number;
  lost: number;
  winRate: number | null;
  openNow: number;
  notes: number;
  contacts: number;
}

export interface DailyRow {
  day: string;
  inquiries: number;
  won: number;
  whatsappClicks: number;
  activityViews: number;
}

export interface ActivityViewRow {
  slug: string;
  title: string | null;
  views: number;
  whatsappClicks: number;
  inquiries: number;
  inquiryRate: number | null;
}

export interface WhatsappClickRow {
  context: string;
  clicks: number;
}

export interface StatusChangeRow {
  toStatus: string;
  count: number;
}

const n = (v: unknown): number => Number(v ?? 0);
const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

const STAGE_LABELS: Record<FunnelStageKey, string> = {
  session: "Sessions",
  activity_viewed: "Viewed an activity",
  inquiry_item_added: "Added to inquiry",
  inquiry_started: "Started inquiry form",
  inquiry_submitted: "Inquiry submitted",
  contacted: "Contacted by agent",
  quoted: "Quoted",
  won: "Won",
};

export const analyticsRepo = {
  /**
   * session → activity_viewed → inquiry_item_added/add_to_cart →
   * inquiry_started → inquiry_submitted → contacted → quoted → won.
   */
  async funnel(range: DateRange): Promise<FunnelReport> {
    const environment = env().APP_ENV;
    const [browse, pipeline] = await Promise.all([
      prisma.$queryRaw<{ sessions: bigint; viewed: bigint; added: bigint; started: bigint; submitted: bigint }[]>(Prisma.sql`
        SELECT
          COUNT(DISTINCT session_id)                                                                  AS sessions,
          COUNT(DISTINCT session_id) FILTER (WHERE name = 'activity_viewed')                          AS viewed,
          COUNT(DISTINCT session_id) FILTER (WHERE name IN ('inquiry_item_added', 'add_to_cart'))     AS added,
          COUNT(DISTINCT session_id) FILTER (WHERE name = 'inquiry_started')                          AS started,
          COUNT(DISTINCT session_id) FILTER (WHERE name = 'inquiry_submitted')                        AS submitted
        FROM analytics_events
        WHERE source = 'client'
          AND environment = ${environment}
          AND session_id IS NOT NULL
          AND occurred_at >= ${range.from} AND occurred_at <= ${range.to}
      `),
      prisma.$queryRaw<{ submitted: bigint; contacted: bigint; quoted: bigint; won: bigint }[]>(Prisma.sql`
        SELECT
          COUNT(*)                                                       AS submitted,
          COUNT(*) FILTER (WHERE i.first_response_at IS NOT NULL)        AS contacted,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM inquiry_events e
            WHERE e.inquiry_id = i.id AND e.to_status::text = 'quoted'))  AS quoted,
          COUNT(*) FILTER (WHERE i.status::text = 'won')                 AS won
        FROM inquiries i
        WHERE i.status::text <> 'spam'
          AND i.created_at >= ${range.from} AND i.created_at <= ${range.to}
      `),
    ]);
    const b = browse[0] ?? {};
    const p = pipeline[0] ?? {};
    const stages: FunnelStage[] = [
      { key: "session", label: STAGE_LABELS.session, unit: "sessions", count: n(b.sessions) },
      { key: "activity_viewed", label: STAGE_LABELS.activity_viewed, unit: "sessions", count: n(b.viewed) },
      { key: "inquiry_item_added", label: STAGE_LABELS.inquiry_item_added, unit: "sessions", count: n(b.added) },
      { key: "inquiry_started", label: STAGE_LABELS.inquiry_started, unit: "sessions", count: n(b.started) },
      // Server count of submitted inquiries: the source of truth (§11.1).
      { key: "inquiry_submitted", label: STAGE_LABELS.inquiry_submitted, unit: "inquiries", count: n(p.submitted) },
      { key: "contacted", label: STAGE_LABELS.contacted, unit: "inquiries", count: n(p.contacted) },
      { key: "quoted", label: STAGE_LABELS.quoted, unit: "inquiries", count: n(p.quoted) },
      { key: "won", label: STAGE_LABELS.won, unit: "inquiries", count: n(p.won) },
    ];
    const stepRates: FunnelReport["stepRates"] = {};
    for (let i = 1; i < stages.length; i++) stepRates[stages[i].key] = ratio(stages[i].count, stages[i - 1].count);
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      stages,
      stepRates,
      sessionToInquiry: ratio(n(p.submitted), n(b.sessions)),
      inquiryToWon: ratio(n(p.won), n(p.submitted)),
    };
  },

  /**
   * §17 §3.2 recommendation 3: inquiry rate measured per tier, because a
   * blended rate hides that Tier A pages convert badly by design while the
   * margin tiers convert well.
   */
  async inquiryRateByTier(range: DateRange): Promise<TierRateRow[]> {
    const environment = env().APP_ENV;
    const [views, inquiries] = await Promise.all([
      prisma.$queryRaw<{ tier: string | null; views: bigint }[]>(Prisma.sql`
        SELECT tier, COUNT(DISTINCT session_id) AS views
        FROM analytics_events
        WHERE name = 'activity_viewed' AND source = 'client'
          AND environment = ${environment}
          AND session_id IS NOT NULL
          AND occurred_at >= ${range.from} AND occurred_at <= ${range.to}
        GROUP BY tier
      `),
      prisma.$queryRaw<{ tier: string; inquiries: bigint; won: bigint }[]>(Prisma.sql`
        SELECT
          it.tier_snapshot                                              AS tier,
          COUNT(DISTINCT i.id)                                          AS inquiries,
          COUNT(DISTINCT i.id) FILTER (WHERE i.status::text = 'won')    AS won
        FROM inquiries i
        JOIN inquiry_items it ON it.inquiry_id = i.id
        WHERE i.status::text <> 'spam'
          AND i.created_at >= ${range.from} AND i.created_at <= ${range.to}
        GROUP BY it.tier_snapshot
      `),
    ]);
    const tiers = new Map<string, TierRateRow>();
    const row = (tier: string) => {
      let r = tiers.get(tier);
      if (!r) {
        r = { tier, views: 0, inquiries: 0, won: 0, inquiryRate: null, winRate: null };
        tiers.set(tier, r);
      }
      return r;
    };
    for (const v of views) row((v.tier ?? "?").trim().toUpperCase()).views = n(v.views);
    for (const i of inquiries) {
      const r = row(i.tier.trim().toUpperCase());
      r.inquiries = n(i.inquiries);
      r.won = n(i.won);
    }
    return [...tiers.values()]
      .map((r) => ({ ...r, inquiryRate: ratio(r.inquiries, r.views), winRate: ratio(r.won, r.inquiries) }))
      .sort((a, b) => a.tier.localeCompare(b.tier));
  },

  /**
   * Sessions by last-touch source/medium (from `page_view`/`landing_page_view`
   * props) joined to inquiries by the `last_source`/`last_medium` keys of
   * `inquiries.attribution`. "inquiry→won by source" (§17 §7.6).
   */
  async sourceBreakdown(range: DateRange): Promise<SourceRow[]> {
    const environment = env().APP_ENV;
    const [sessions, inquiries] = await Promise.all([
      prisma.$queryRaw<{ source: string | null; medium: string | null; sessions: bigint }[]>(Prisma.sql`
        SELECT
          NULLIF(props->>'traffic_source', '') AS source,
          NULLIF(props->>'traffic_medium', '') AS medium,
          COUNT(DISTINCT session_id)           AS sessions
        FROM analytics_events
        WHERE name IN ('page_view', 'landing_page_view') AND source = 'client'
          AND environment = ${environment}
          AND session_id IS NOT NULL
          AND occurred_at >= ${range.from} AND occurred_at <= ${range.to}
        GROUP BY 1, 2
      `),
      prisma.$queryRaw<{ source: string | null; medium: string | null; inquiries: bigint; won: bigint }[]>(Prisma.sql`
        SELECT
          NULLIF(attribution->>'last_source', '')                  AS source,
          NULLIF(attribution->>'last_medium', '')                  AS medium,
          COUNT(*)                                                 AS inquiries,
          COUNT(*) FILTER (WHERE status::text = 'won')             AS won
        FROM inquiries
        WHERE status::text <> 'spam'
          AND created_at >= ${range.from} AND created_at <= ${range.to}
        GROUP BY 1, 2
      `),
    ]);
    const rows = new Map<string, SourceRow>();
    const row = (source: string | null, medium: string | null) => {
      const s = source ?? "direct";
      const m = medium ?? "none";
      const key = `${s}|${m}`;
      let r = rows.get(key);
      if (!r) {
        r = { source: s, medium: m, sessions: 0, inquiries: 0, won: 0, inquiryRate: null, winRate: null };
        rows.set(key, r);
      }
      return r;
    };
    for (const s of sessions) row(s.source, s.medium).sessions = n(s.sessions);
    for (const i of inquiries) {
      const r = row(i.source, i.medium);
      r.inquiries = n(i.inquiries);
      r.won = n(i.won);
    }
    return [...rows.values()]
      .map((r) => ({ ...r, inquiryRate: ratio(r.inquiries, r.sessions), winRate: ratio(r.won, r.inquiries) }))
      .sort((a, b) => b.inquiries - a.inquiries || b.sessions - a.sessions);
  },

  /**
   * AC-AN-02 — client vs server counts for the events both sides emit. The
   * server count is authoritative; the delta measures ad-blocker prevalence
   * (expected to be well above 2% on Indian mobile, §11.7).
   */
  async reconciliation(range: DateRange, names: string[] = ["inquiry_submitted", "booking_confirmed"]): Promise<ReconciliationRow[]> {
    const environment = env().APP_ENV;
    const rows = await prisma.$queryRaw<{ name: string; client: bigint; server: bigint }[]>(Prisma.sql`
      SELECT name,
        COUNT(*) FILTER (WHERE source = 'client') AS client,
        COUNT(*) FILTER (WHERE source = 'server') AS server
      FROM analytics_events
      WHERE name IN (${Prisma.join(names)})
        AND environment = ${environment}
        AND occurred_at >= ${range.from} AND occurred_at <= ${range.to}
      GROUP BY name
    `);
    const byName = new Map(rows.map((r) => [r.name, r]));
    return names.map((name) => {
      const r = byName.get(name);
      const client = n(r?.client);
      const server = n(r?.server);
      return { event: name, client, server, delta: server > 0 ? (client - server) / server : null };
    });
  },


  /* ------------------------------------------------- inquiry-mode dashboards */

  /**
   * Per-agent performance for inquiries created in the range (§09 §6). Response
   * time is measured from inquiry creation; SLA hit uses the inquiry's own
   * `sla_due_at`. Notes/contacts come from `inquiry_events` by actor.
   */
  async agentPerformance(range: DateRange): Promise<AgentPerformanceRow[]> {
    const rows = await prisma.$queryRaw<
      { agent_id: string; name: string; email: string; assigned: bigint; responded: bigint; median_secs: number | null; sla_hit: bigint; won: bigint; lost: bigint; open_now: bigint; notes: bigint; contacts: bigint }[]
    >(Prisma.sql`
      WITH scoped AS (
        SELECT i.*
        FROM inquiries i
        WHERE i.status::text <> 'spam'
          AND i.assigned_agent_id IS NOT NULL
          AND i.created_at >= ${range.from} AND i.created_at <= ${range.to}
      ),
      per_agent AS (
        SELECT
          assigned_agent_id AS agent_id,
          COUNT(*) AS assigned,
          COUNT(*) FILTER (WHERE first_response_at IS NOT NULL) AS responded,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_response_at - created_at))) FILTER (WHERE first_response_at IS NOT NULL) AS median_secs,
          COUNT(*) FILTER (WHERE first_response_at IS NOT NULL AND sla_due_at IS NOT NULL AND first_response_at <= sla_due_at) AS sla_hit,
          COUNT(*) FILTER (WHERE status::text = 'won') AS won,
          COUNT(*) FILTER (WHERE status::text = 'lost') AS lost,
          COUNT(*) FILTER (WHERE status::text IN ('new','assigned','contacted','quoted','negotiating','payment_pending')) AS open_now
        FROM scoped
        GROUP BY assigned_agent_id
      ),
      activity AS (
        SELECT e.actor_id AS agent_id,
          COUNT(*) FILTER (WHERE e.kind::text = 'note') AS notes,
          COUNT(*) FILTER (WHERE e.kind::text = 'contact') AS contacts
        FROM inquiry_events e
        WHERE e.actor_id IS NOT NULL AND e.created_at >= ${range.from} AND e.created_at <= ${range.to}
        GROUP BY e.actor_id
      )
      SELECT u.id AS agent_id, u.full_name AS name, u.email,
        COALESCE(p.assigned, 0) AS assigned, COALESCE(p.responded, 0) AS responded, p.median_secs,
        COALESCE(p.sla_hit, 0) AS sla_hit, COALESCE(p.won, 0) AS won, COALESCE(p.lost, 0) AS lost, COALESCE(p.open_now, 0) AS open_now,
        COALESCE(a.notes, 0) AS notes, COALESCE(a.contacts, 0) AS contacts
      FROM admin_users u
      LEFT JOIN per_agent p ON p.agent_id = u.id
      LEFT JOIN activity a ON a.agent_id = u.id
      WHERE p.agent_id IS NOT NULL OR a.agent_id IS NOT NULL
      ORDER BY COALESCE(p.assigned, 0) DESC, u.full_name ASC
    `);
    return rows.map((r) => ({
      agentId: r.agent_id,
      name: r.name,
      email: r.email,
      assigned: n(r.assigned),
      responded: n(r.responded),
      medianFirstResponseSeconds: r.median_secs == null ? null : Number(r.median_secs),
      slaHitRate: ratio(n(r.sla_hit), n(r.responded)),
      won: n(r.won),
      lost: n(r.lost),
      winRate: ratio(n(r.won), n(r.assigned)),
      openNow: n(r.open_now),
      notes: n(r.notes),
      contacts: n(r.contacts),
    }));
  },

  /** Inquiries, wins, WhatsApp clicks and activity views per day (IST calendar days). */
  async daily(range: DateRange): Promise<DailyRow[]> {
    const environment = env().APP_ENV;
    const [inq, ev] = await Promise.all([
      prisma.$queryRaw<{ day: string; inquiries: bigint; won: bigint }[]>(Prisma.sql`
        SELECT to_char((created_at AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
          COUNT(*) AS inquiries,
          COUNT(*) FILTER (WHERE status::text = 'won') AS won
        FROM inquiries
        WHERE status::text <> 'spam' AND created_at >= ${range.from} AND created_at <= ${range.to}
        GROUP BY 1
      `),
      prisma.$queryRaw<{ day: string; whatsapp: bigint; views: bigint }[]>(Prisma.sql`
        SELECT to_char((occurred_at AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
          COUNT(*) FILTER (WHERE name = 'whatsapp_initiated') AS whatsapp,
          COUNT(DISTINCT session_id) FILTER (WHERE name = 'activity_viewed') AS views
        FROM analytics_events
        WHERE source = 'client' AND environment = ${environment}
          AND occurred_at >= ${range.from} AND occurred_at <= ${range.to}
        GROUP BY 1
      `),
    ]);
    const days = new Map<string, DailyRow>();
    const row = (day: string) => {
      let r = days.get(day);
      if (!r) {
        r = { day, inquiries: 0, won: 0, whatsappClicks: 0, activityViews: 0 };
        days.set(day, r);
      }
      return r;
    };
    for (const i of inq) Object.assign(row(i.day), { inquiries: n(i.inquiries), won: n(i.won) });
    for (const e of ev) Object.assign(row(e.day), { whatsappClicks: n(e.whatsapp), activityViews: n(e.views) });
    return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  },

  /** Most viewed activities with their WhatsApp clicks and inquiries (§11.6 dashboard 3). */
  async topActivities(range: DateRange, limit = 20): Promise<ActivityViewRow[]> {
    const environment = env().APP_ENV;
    const take = Math.max(1, Math.min(limit, 100));
    const [views, inquiries] = await Promise.all([
      prisma.$queryRaw<{ slug: string; views: bigint; whatsapp: bigint }[]>(Prisma.sql`
        SELECT product_slug AS slug,
          COUNT(DISTINCT session_id) FILTER (WHERE name = 'activity_viewed') AS views,
          COUNT(*) FILTER (WHERE name = 'whatsapp_initiated') AS whatsapp
        FROM analytics_events
        WHERE source = 'client' AND environment = ${environment} AND product_slug IS NOT NULL
          AND occurred_at >= ${range.from} AND occurred_at <= ${range.to}
        GROUP BY product_slug
        ORDER BY views DESC
        LIMIT ${take}
      `),
      prisma.$queryRaw<{ slug: string; title: string; inquiries: bigint }[]>(Prisma.sql`
        SELECT it.slug_snapshot AS slug, MAX(it.title_snapshot) AS title, COUNT(DISTINCT i.id) AS inquiries
        FROM inquiry_items it
        JOIN inquiries i ON i.id = it.inquiry_id
        WHERE i.status::text <> 'spam' AND i.created_at >= ${range.from} AND i.created_at <= ${range.to}
        GROUP BY it.slug_snapshot
      `),
    ]);
    const byInq = new Map(inquiries.map((i) => [i.slug, i]));
    const titles = await prisma.product.findMany({ where: { slug: { in: views.map((v) => v.slug) } }, select: { slug: true, title: true } });
    const titleBy = new Map(titles.map((t) => [t.slug, t.title]));
    return views.map((v) => {
      const inq = n(byInq.get(v.slug)?.inquiries);
      return { slug: v.slug, title: titleBy.get(v.slug) ?? byInq.get(v.slug)?.title ?? null, views: n(v.views), whatsappClicks: n(v.whatsapp), inquiries: inq, inquiryRate: ratio(inq, n(v.views)) };
    });
  },

  /** WhatsApp clicks by placement (`whatsapp_context` prop). */
  async whatsappClicks(range: DateRange): Promise<{ total: number; byContext: WhatsappClickRow[] }> {
    const environment = env().APP_ENV;
    const rows = await prisma.$queryRaw<{ context: string | null; clicks: bigint }[]>(Prisma.sql`
      SELECT NULLIF(props->>'whatsapp_context', '') AS context, COUNT(*) AS clicks
      FROM analytics_events
      WHERE name = 'whatsapp_initiated' AND source = 'client' AND environment = ${environment}
        AND occurred_at >= ${range.from} AND occurred_at <= ${range.to}
      GROUP BY 1
      ORDER BY clicks DESC
    `);
    const byContext = rows.map((r) => ({ context: r.context ?? "unknown", clicks: n(r.clicks) }));
    return { total: byContext.reduce((s, r) => s + r.clicks, 0), byContext };
  },

  /** Status transitions recorded in the range (§17 §5.3). */
  async statusChanges(range: DateRange): Promise<StatusChangeRow[]> {
    const rows = await prisma.$queryRaw<{ to_status: string; count: bigint }[]>(Prisma.sql`
      SELECT to_status::text AS to_status, COUNT(*) AS count
      FROM inquiry_events
      WHERE kind::text = 'status' AND to_status IS NOT NULL
        AND created_at >= ${range.from} AND created_at <= ${range.to}
      GROUP BY 1
      ORDER BY count DESC
    `);
    return rows.map((r) => ({ toStatus: r.to_status, count: n(r.count) }));
  },

  /* --------------------------------------------- offline conversions (Rail B) */

  /**
   * Paid/confirmed orders whose attribution has not been uploaded to Meta
   * (AC-META-02). Orders without an `order_attribution` row have nothing to
   * upload and are not returned. Contact fields are returned raw here and
   * hashed by `offline-conversions.ts` before anything leaves the process.
   */
  async pendingOfflineConversions(limit = 100): Promise<PendingOfflineConversionRow[]> {
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ["paid", "confirmed"] },
        attribution: { is: { uploadedToMetaAt: null } },
      },
      select: {
        id: true,
        reference: true,
        sourceInquiryId: true,
        status: true,
        paidAt: true,
        confirmedAt: true,
        totalInr: true,
        currency: true,
        leadEmail: true,
        leadPhone: true,
        attribution: { select: { fbclid: true, fbc: true, fbp: true, gclid: true, firstTouchAt: true, lastTouchAt: true } },
      },
      orderBy: { paidAt: "asc" },
      take: Math.max(1, Math.min(limit, 1000)),
    });
    return orders.map((o) => ({
      orderId: o.id,
      orderReference: o.reference,
      sourceInquiryId: o.sourceInquiryId,
      status: o.status,
      paidAt: o.paidAt,
      confirmedAt: o.confirmedAt,
      totalInr: o.totalInr,
      currency: o.currency,
      leadEmail: o.leadEmail,
      leadPhone: o.leadPhone,
      fbclid: o.attribution?.fbclid ?? null,
      fbc: o.attribution?.fbc ?? null,
      fbp: o.attribution?.fbp ?? null,
      gclid: o.attribution?.gclid ?? null,
      firstTouchAt: o.attribution?.firstTouchAt ?? null,
      lastTouchAt: o.attribution?.lastTouchAt ?? null,
    }));
  },

  async countPendingOfflineConversions(): Promise<number> {
    return prisma.order.count({
      where: { status: { in: ["paid", "confirmed"] }, attribution: { is: { uploadedToMetaAt: null } } },
    });
  },

  async markOfflineUploaded(orderIds: string[], at = new Date()): Promise<number> {
    if (!orderIds.length) return 0;
    const r = await prisma.orderAttribution.updateMany({
      where: { orderId: { in: orderIds }, uploadedToMetaAt: null },
      data: { uploadedToMetaAt: at },
    });
    return r.count;
  },
};
