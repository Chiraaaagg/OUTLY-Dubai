import Link from "next/link";
import { Alert } from "@/components/ui/primitives";
import { inquiryService } from "@/server/services/inquiry.service";
import { healthService, type HealthIssue } from "@/server/services/health.service";
import { hasPermission } from "@/server/lib/actor";
import { LOST_REASON_LABELS, STATUS_LABELS, type LostReason } from "@/server/domain/inquiry-state";
import type { InquiryStatus } from "@/lib/types";
import { requirePage } from "../_lib/guard";
import { ADMIN_TZ, ADMIN_TZ_LABEL, fmtDuration, fmtPercent, KeyValueList, PageHeader, Panel, StatCard } from "../_components/ui";

/**
 * /admin — today's queue at a glance plus the last 7 days for anyone with
 * `reports.view`. Agents without it see only their queue counts. Also the
 * landing spot for "you don't have permission" redirects from other pages.
 */
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const [{ actor }, { denied }] = await Promise.all([requirePage(), searchParams]);
  const canReport = hasPermission(actor, "reports.view");
  const now = new Date();
  const canSeeAll = hasPermission(actor, "inquiries.view_all");
  const [counts, metrics, health] = await Promise.all([
    inquiryService.queueCounts(actor),
    canReport ? inquiryService.metrics(actor, { from: new Date(now.getTime() - 7 * DAY_MS), to: now }) : Promise.resolve(null),
    // Silent operational failures — a dead cron, an unroutable agent, a
    // swallowed notification — belong on the first screen, not in a log.
    canSeeAll ? healthService.check(actor, now).catch(() => [] as HealthIssue[]) : Promise.resolve([] as HealthIssue[]),
  ]);

  const openTotal = counts.new + counts.assigned + counts.contacted + counts.quoted + counts.negotiating + counts.payment_pending;

  return (
    <>
      <PageHeader title="Dashboard" sub={`Queue as of ${now.toLocaleString("en-IN", { timeZone: ADMIN_TZ, hour: "2-digit", minute: "2-digit", hour12: false })} ${ADMIN_TZ_LABEL}`} />

      {denied && (
        <Alert tone="warning" title="That page needs a permission you don't have" className="mb-5">
          Missing <code className="font-mono text-xs">{denied}</code>. Ask an administrator if you need it.
        </Alert>
      )}

      {health.length > 0 && (
        <section aria-labelledby="health-heading" className="mb-6 space-y-2">
          <h2 id="health-heading" className="sr-only">
            Needs attention
          </h2>
          {health.map((issue) => (
            <Alert key={issue.id} tone={issue.severity} title={issue.title}>
              <p>{issue.detail}</p>
              {issue.href && (
                <p className="mt-1">
                  <Link href={issue.href} className="font-semibold underline underline-offset-2">
                    {issue.action ?? "Fix it"}
                  </Link>
                </p>
              )}
            </Alert>
          ))}
        </section>
      )}

      <section aria-labelledby="queue-heading" className="mb-6">
        <h2 id="queue-heading" className="mb-3 text-lg">
          Queue now
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Unassigned" value={String(counts.unassigned)} tone={counts.unassigned > 0 ? "accent" : "neutral"} href="/admin/inquiries?status=new&agent=unassigned" hint="New, nobody on it" />
          <StatCard label="SLA breached" value={String(counts.breached)} tone={counts.breached > 0 ? "bad" : "good"} href="/admin/inquiries?breached=1" hint="New or assigned, past due" />
          <StatCard label="Mine" value={String(counts.mine)} href="/admin/inquiries?agent=me" hint="Open and assigned to you" />
          <StatCard label="Open total" value={String(openTotal)} href="/admin/inquiries" hint="All non-terminal" />
          <StatCard label="Payment pending" value={String(counts.payment_pending)} tone={counts.payment_pending > 0 ? "warn" : "neutral"} href="/admin/inquiries?status=payment_pending" hint="Confirmed, awaiting money" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(["new", "assigned", "contacted", "quoted", "negotiating"] as const).map((s) => (
            <StatCard key={s} label={STATUS_LABELS[s as InquiryStatus] ?? s} value={String(counts[s])} href={`/admin/inquiries?status=${s}`} />
          ))}
        </div>
      </section>

      {metrics ? (
        <section aria-labelledby="week-heading">
          <h2 id="week-heading" className="mb-3 text-lg">
            Last 7 days
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Inquiries" value={String(metrics.total)} hint="Excludes spam" />
            <StatCard label="SLA hit rate" value={fmtPercent(metrics.slaHitRate)} tone={metrics.slaHitRate == null ? "neutral" : metrics.slaHitRate >= 0.9 ? "good" : metrics.slaHitRate >= 0.7 ? "warn" : "bad"} hint={`${metrics.responded} responded`} />
            <StatCard label="Median first reply" value={fmtDuration(metrics.medianFirstResponseSeconds)} />
            <StatCard label="p90 first reply" value={fmtDuration(metrics.p90FirstResponseSeconds)} />
            <StatCard label="Win rate" value={fmtPercent(metrics.winRate)} tone="accent" hint={`${metrics.won} won`} />
            <StatCard label="GMV (won)" value={`₹${Math.round(metrics.gmvInr).toLocaleString("en-IN")}`} hint="Order total, else indicative" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title="By status" sub="Inquiries created in the window, current status">
              <KeyValueList
                items={Object.entries(metrics.byStatus)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, n]) => ({ label: STATUS_LABELS[status as InquiryStatus] ?? status, value: String(n) }))}
              />
              {Object.keys(metrics.byStatus).length === 0 && <p className="text-sm text-ink-500">No inquiries in the last 7 days.</p>}
            </Panel>
            <Panel title="Lost reasons" sub={`${metrics.breached} breached SLA in the same window`}>
              <KeyValueList
                items={Object.entries(metrics.lostReasons)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, n]) => ({ label: LOST_REASON_LABELS[reason as LostReason] ?? reason, value: String(n) }))}
              />
              {Object.keys(metrics.lostReasons).length === 0 && <p className="text-sm text-ink-500">Nothing marked lost yet.</p>}
            </Panel>
          </div>
        </section>
      ) : (
        <p className="text-sm text-ink-600">
          Weekly metrics need the <code className="font-mono text-xs">reports.view</code> permission.{" "}
          <Link href="/admin/inquiries" className="font-semibold underline underline-offset-2">
            Go to your queue
          </Link>
          .
        </p>
      )}
    </>
  );
}
