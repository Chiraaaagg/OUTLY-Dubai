import Link from "next/link";
import { redirect } from "next/navigation";
import { analyticsService } from "@/server/services/analytics.service";
import { hasPermission } from "@/server/lib/actor";
import { STATUS_LABELS } from "@/server/domain/inquiry-state";
import type { InquiryStatus } from "@/lib/types";
import { requirePage } from "../../_lib/guard";
import { ADMIN_TZ_LABEL, type DataColumn, DataTable, fmtDuration, fmtPercent, INPUT_CLASS, PageHeader, Panel, StatCard } from "../../_components/ui";

/**
 * /admin/analytics — inquiry-mode operations dashboard (§11.6, §17 §5.3):
 * daily inquiries + WhatsApp clicks + activity views, funnel, sources, top
 * activities, WhatsApp placements, status changes and agent performance.
 * Booking analytics (orders, GMV by rail) plug into the same page once orders
 * flow — the repo already reads `orders`.
 */
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function bars(values: number[]): string[] {
  const max = Math.max(1, ...values);
  return values.map((v) => `${Math.round((v / max) * 100)}%`);
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { actor } = await requirePage();
  if (!hasPermission(actor, "analytics.view") && !hasPermission(actor, "reports.view")) {
    redirect("/admin?denied=analytics.view");
  }
  const sp = await searchParams;
  const toStr = sp.to && ISO.test(sp.to) ? sp.to : new Date().toISOString().slice(0, 10);
  const to = new Date(`${toStr}T23:59:59.999Z`);
  const fromStr = sp.from && ISO.test(sp.from) ? sp.from : new Date(to.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const from = new Date(`${fromStr}T00:00:00.000Z`);
  const d = await analyticsService.inquiryDashboard(actor, { from, to });

  const totals = d.daily.reduce((s, r) => ({ inquiries: s.inquiries + r.inquiries, won: s.won + r.won, wa: s.wa + r.whatsappClicks, views: s.views + r.activityViews }), { inquiries: 0, won: 0, wa: 0, views: 0 });
  const heights = bars(d.daily.map((r) => r.inquiries));

  const agentColumns: DataColumn<(typeof d.agents)[number]>[] = [
    { key: "name", header: "Agent", cell: (a) => <span className="font-semibold text-ink-900">{a.name}</span> },
    { key: "assigned", header: "Assigned", align: "right", cell: (a) => String(a.assigned) },
    { key: "responded", header: "Responded", align: "right", cell: (a) => String(a.responded) },
    { key: "median", header: "Median first reply", align: "right", cell: (a) => fmtDuration(a.medianFirstResponseSeconds) },
    { key: "sla", header: "SLA hit", align: "right", cell: (a) => fmtPercent(a.slaHitRate) },
    { key: "won", header: "Won", align: "right", cell: (a) => String(a.won) },
    { key: "lost", header: "Lost", align: "right", cell: (a) => String(a.lost) },
    { key: "win", header: "Win rate", align: "right", cell: (a) => fmtPercent(a.winRate) },
    { key: "open", header: "Open now", align: "right", cell: (a) => String(a.openNow) },
    { key: "notes", header: "Notes / contacts", align: "right", cell: (a) => `${a.notes} / ${a.contacts}` },
  ];

  const activityColumns: DataColumn<(typeof d.topActivities)[number]>[] = [
    {
      key: "title",
      header: "Activity",
      cell: (r) => (
        <Link href={`/activities/${r.slug}`} className="font-semibold text-ink-900 hover:underline">
          {r.title ?? r.slug}
        </Link>
      ),
    },
    { key: "views", header: "Sessions viewed", align: "right", cell: (r) => r.views.toLocaleString("en-IN") },
    { key: "wa", header: "WhatsApp clicks", align: "right", cell: (r) => String(r.whatsappClicks) },
    { key: "inq", header: "Inquiries", align: "right", cell: (r) => String(r.inquiries) },
    { key: "rate", header: "Inquiry rate", align: "right", cell: (r) => fmtPercent(r.inquiryRate) },
  ];

  const sourceColumns: DataColumn<(typeof d.sources)[number]>[] = [
    { key: "source", header: "Source / medium", cell: (r) => `${r.source} / ${r.medium}` },
    { key: "sessions", header: "Sessions", align: "right", cell: (r) => r.sessions.toLocaleString("en-IN") },
    { key: "inquiries", header: "Inquiries", align: "right", cell: (r) => String(r.inquiries) },
    { key: "rate", header: "Inquiry rate", align: "right", cell: (r) => fmtPercent(r.inquiryRate) },
    { key: "won", header: "Won", align: "right", cell: (r) => String(r.won) },
    { key: "win", header: "Win rate", align: "right", cell: (r) => fmtPercent(r.winRate) },
  ];

  return (
    <>
      <PageHeader
        title="Analytics"
        sub={`${fromStr} → ${toStr} · server-side counts; client events net of ad blockers`}
        actions={
          <form method="get" className="flex items-end gap-2">
            <label className="text-xs font-semibold text-ink-700">
              From
              <input type="date" name="from" defaultValue={fromStr} className={`${INPUT_CLASS} mt-1 min-h-9 text-sm`} />
            </label>
            <label className="text-xs font-semibold text-ink-700">
              To
              <input type="date" name="to" defaultValue={toStr} className={`${INPUT_CLASS} mt-1 min-h-9 text-sm`} />
            </label>
            <button type="submit" className="min-h-9 rounded-[var(--radius-control)] border border-ink-300 bg-paper px-3 text-sm font-semibold text-ink-800 hover:border-ink-600">
              Apply
            </button>
          </form>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Inquiries" value={totals.inquiries.toLocaleString("en-IN")} hint={`${totals.won} won`} tone="accent" />
        <StatCard label="Activity views (sessions)" value={totals.views.toLocaleString("en-IN")} hint={d.funnel.sessionToInquiry != null ? `${fmtPercent(d.funnel.sessionToInquiry)} session → inquiry` : undefined} />
        <StatCard label="WhatsApp clicks" value={totals.wa.toLocaleString("en-IN")} hint={d.whatsapp.byContext[0] ? `top: ${d.whatsapp.byContext[0].context}` : undefined} />
        <StatCard label="Inquiry → won" value={fmtPercent(d.funnel.inquiryToWon)} tone={d.funnel.inquiryToWon != null && d.funnel.inquiryToWon >= 0.2 ? "good" : "neutral"} />
      </div>

      <Panel title="Daily inquiries" sub={`Bars = inquiries created (${ADMIN_TZ_LABEL} days). Hover for WhatsApp clicks and views.`} className="mb-5">
        {d.daily.length === 0 ? (
          <p className="text-sm text-ink-500">No activity in this range yet.</p>
        ) : (
          <div className="flex h-40 items-end gap-1 overflow-x-auto">
            {d.daily.map((r, i) => (
              <div key={r.day} className="flex min-w-[1.25rem] flex-1 flex-col items-center justify-end gap-1" title={`${r.day}: ${r.inquiries} inquiries · ${r.won} won · ${r.whatsappClicks} WhatsApp · ${r.activityViews} views`}>
                <div className="w-full rounded-t bg-sun-500" style={{ height: heights[i] }} />
                <span className="text-[0.6rem] text-ink-500">{r.day.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Funnel" sub="Browse stages are distinct sessions; pipeline stages are inquiries (server truth).">
          <ol className="space-y-1.5">
            {d.funnel.stages.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-700">{s.label}</span>
                <span className="tnum font-semibold text-ink-900">
                  {s.count.toLocaleString("en-IN")}
                  {d.funnel.stepRates[s.key] != null && <span className="ml-2 text-xs font-normal text-ink-500">{fmtPercent(d.funnel.stepRates[s.key])}</span>}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Status changes" sub="Transitions recorded in the range.">
          {d.statusChanges.length === 0 ? (
            <p className="text-sm text-ink-500">None yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {d.statusChanges.map((s) => (
                <li key={s.toStatus} className="flex items-center justify-between text-sm">
                  <span className="text-ink-700">→ {STATUS_LABELS[s.toStatus as InquiryStatus] ?? s.toStatus}</span>
                  <span className="tnum font-semibold text-ink-900">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-1.5 mt-4 text-sm font-semibold text-ink-800">WhatsApp clicks by placement</h3>
          {d.whatsapp.byContext.length === 0 ? (
            <p className="text-sm text-ink-500">None yet.</p>
          ) : (
            <ul className="space-y-1">
              {d.whatsapp.byContext.map((c) => (
                <li key={c.context} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-ink-700">{c.context}</span>
                  <span className="tnum font-semibold text-ink-900">{c.clicks}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <h2 className="mb-2 text-lg">Agent performance</h2>
      <DataTable columns={agentColumns} rows={d.agents} rowKey={(a) => a.agentId} caption="Agent performance" empty="No assigned inquiries in this range." className="mb-5" />

      <h2 className="mb-2 text-lg">Top activities</h2>
      <DataTable columns={activityColumns} rows={d.topActivities} rowKey={(r) => r.slug} caption="Top activities" empty="No activity views recorded yet." className="mb-5" />

      <h2 className="mb-2 text-lg">Sources</h2>
      <DataTable columns={sourceColumns} rows={d.sources} rowKey={(r) => `${r.source}|${r.medium}`} caption="Traffic sources" empty="No sessions recorded yet." />
    </>
  );
}
