import Link from "next/link";
import { AlertTriangle, Inbox, MoonStar, Search } from "lucide-react";
import { requirePage } from "@/app/admin/_lib/guard";
import { PageHeader, Pagination } from "@/app/admin/_components/ui";
import { inquiryService } from "@/server/services/inquiry.service";
import { settingsService } from "@/server/services/settings.service";
import type { InquiryListFilters, InquirySummary, QueueCounts } from "@/server/services/inquiry.types";
import { OPEN_STATUSES } from "@/server/domain/inquiry-state";
import { isWithinBusinessHours } from "@/server/domain/sla";
import { hasPermission } from "@/server/lib/actor";
import { AppError } from "@/server/lib/errors";
import type { InquiryStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert, Card, EmptyState } from "@/components/ui/primitives";
import { StatusPill, AgentAvatar } from "@/app/admin/_components/inquiry/status-pill";
import { SlaCountdown, RelativeTime } from "@/app/admin/_components/inquiry/sla-countdown";
import { DIETARY_LABELS, fmtDateRange, fmtMoney, truncate } from "@/app/admin/_components/inquiry/format";
import type { RoutableAgent } from "@/app/admin/_components/inquiry/assign-picker";
import { adminRepo } from "@/server/repositories/admin.repo";
import { QueueBulkBar } from "./queue-bulk";

/**
 * Inquiry queue — the primary agent screen (§17 §7: "admin inquiry queue with
 * statuses"). Pure Server Component driven by URL search params so every
 * filter is a link, back/forward works, and the page needs no client state.
 * Layout pattern: a dense "inbox" table with status tabs above and a filter
 * rail (mine / unassigned / breached) — the classic support-inbox shape, not
 * taken from a specific 21st.dev component; adapted to OUTLYY tokens.
 *
 * Triage rule (§17 §7.5 "out-of-hours surge: queue by value"): outside business
 * hours the open tabs default to sort=value so the next shift works the
 * highest-value inquiries first; inside hours they default to sort=sla.
 */

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

interface Tab {
  key: string;
  label: string;
  statuses?: InquiryStatus[];
  count?: (c: QueueCounts) => number;
}

const TABS: Tab[] = [
  { key: "open", label: "Open", statuses: OPEN_STATUSES, count: (c) => c.new + c.assigned + c.contacted + c.quoted + c.negotiating + c.payment_pending },
  { key: "new", label: "New", statuses: ["new"], count: (c) => c.new },
  { key: "assigned", label: "Assigned", statuses: ["assigned"], count: (c) => c.assigned },
  { key: "contacted", label: "Contacted", statuses: ["contacted"], count: (c) => c.contacted },
  { key: "quoted", label: "Quoted", statuses: ["quoted"], count: (c) => c.quoted },
  { key: "negotiating", label: "Negotiating", statuses: ["negotiating"], count: (c) => c.negotiating },
  { key: "payment_pending", label: "Payment pending", statuses: ["payment_pending"], count: (c) => c.payment_pending },
  { key: "won", label: "Won", statuses: ["won"] },
  { key: "lost", label: "Lost", statuses: ["lost"] },
  { key: "spam", label: "Spam", statuses: ["spam"] },
  { key: "all", label: "All" },
];

const SORTS: { key: NonNullable<InquiryListFilters["sort"]>; label: string }[] = [
  { key: "sla", label: "SLA (soonest due)" },
  { key: "value", label: "Highest value" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
];

const PAGE_SIZE = 25;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<Params> }) {
  // No page-level permission: the service decides between view_own and view_all.
  const { actor } = await requirePage();
  const viewAll = hasPermission(actor, "inquiries.view_all");

  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === one(sp.status)) ?? TABS[0];
  const q = (one(sp.q) ?? "").trim().slice(0, 120);
  const breached = one(sp.breached) === "1";
  const agentParam = one(sp.agent);
  const agent: "me" | "unassigned" | "all" = viewAll ? (agentParam === "me" || agentParam === "unassigned" ? agentParam : "all") : "me";
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  const now = new Date();
  const sla = await settingsService.sla();
  const outOfHours = !isWithinBusinessHours(sla, now);
  const openTab = tab.key === "open" || tab.key === "new" || tab.key === "assigned";
  const defaultSort: InquiryListFilters["sort"] = openTab ? (outOfHours ? "value" : "sla") : "newest";
  const sortParam = one(sp.sort);
  const sort = SORTS.some((s) => s.key === sortParam) ? (sortParam as InquiryListFilters["sort"]) : defaultSort;

  const filters: InquiryListFilters = {
    status: tab.statuses,
    q: q || undefined,
    slaBreached: breached || undefined,
    sort,
    page,
    pageSize: PAGE_SIZE,
    ...(viewAll && agent !== "all" ? { assignedAgentId: agent } : {}),
  };

  let error: AppError | null = null;
  let list = { items: [] as InquirySummary[], total: 0, page, pageSize: PAGE_SIZE };
  let counts: QueueCounts = { new: 0, assigned: 0, contacted: 0, quoted: 0, negotiating: 0, payment_pending: 0, breached: 0, mine: 0, unassigned: 0 };
  try {
    [list, counts] = await Promise.all([inquiryService.list(actor, filters), inquiryService.queueCounts(actor)]);
  } catch (e) {
    if (e instanceof AppError) error = e;
    else throw e;
  }

  /** Build a queue URL from the current params with overrides; changing a filter resets the page. */
  const href = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const base: Record<string, string | undefined> = { status: tab.key, q: q || undefined, agent: viewAll ? agent : undefined, sort: sortParam, breached: breached ? "1" : undefined };
    const merged = { ...base, ...overrides };
    if (!("page" in overrides)) delete merged.page;
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "status" && v === "open") && !(k === "agent" && v === "all")) next.set(k, v);
    const s = next.toString();
    return s ? `/admin/inquiries?${s}` : "/admin/inquiries";
  };

  const serverNow = now.getTime();
  const filtered = Boolean(q) || breached || agent !== (viewAll ? "all" : "me");

  // Bulk assignment is only offered to someone who may assign at all; the
  // Server Action and the service both re-check.
  const canAssign = hasPermission(actor, "inquiries.assign");
  let routable: RoutableAgent[] = [];
  if (canAssign && list.items.length) {
    routable = (await adminRepo.listRoutable()).map((u) => {
      const name = u.whatsappDisplayName?.includes(" ") ? u.whatsappDisplayName : u.fullName;
      return {
        id: u.id,
        name,
        initials: name.split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join(""),
        shift: u.availability?.shift ?? "IST",
        openCount: u.openCount,
        availability: u.availability?.status ?? "available",
        title: u.availability?.title ?? undefined,
      };
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inquiries"
        className="mb-0"
        sub={
          <>
            {counts.breached > 0 ? (
              <span className="font-semibold text-[var(--color-danger)]">{counts.breached} past the 30-minute promise</span>
            ) : (
              "Every open inquiry, with its clock."
            )}
            {viewAll && counts.unassigned > 0 && <span className="ml-2 text-ink-500">· {counts.unassigned} waiting for an owner</span>}
          </>
        }
        actions={
        <form action="/admin/inquiries" method="get" role="search" className="flex w-full max-w-md items-center gap-2 sm:w-auto">
          <input type="hidden" name="status" value={tab.key} />
          {viewAll && agent !== "all" && <input type="hidden" name="agent" value={agent} />}
          {sortParam && <input type="hidden" name="sort" value={sortParam} />}
          <label className="relative flex-1">
            <span className="sr-only">Search inquiries</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Reference, name, phone or item"
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-ink-300 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sun-300"
            />
          </label>
          <button type="submit" className="min-h-11 rounded-[var(--radius-control)] bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800">
            Search
          </button>
        </form>
        }
      />

      {outOfHours && openTab && (
        <Alert tone="info" icon={<MoonStar className="h-4.5 w-4.5" />} title="Out of hours">
          Sorted by value so the next shift works the highest-value inquiries first. Acknowledgements still go out automatically.
        </Alert>
      )}

      {/* Status tabs */}
      <nav aria-label="Status" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-ink-200 px-1">
        {TABS.map((t) => {
          const active = t.key === tab.key;
          const n = t.count?.(counts);
          return (
            <Link
              key={t.key}
              href={href({ status: t.key })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-bold transition-colors",
                active ? "border-sun-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-800",
              )}
            >
              {t.label}
              {n !== undefined && n > 0 && <span className={cn("rounded-full px-1.5 py-0.5 text-2xs tnum", t.key === "new" ? "bg-sun-100 text-sun-800" : "bg-ink-100 text-ink-600")}>{n}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Filter rail */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {viewAll && (
          <div role="group" aria-label="Owner" className="inline-flex rounded-full border border-ink-200 bg-white p-0.5">
            {(
              [
                { key: "me", label: `Mine${counts.mine ? ` · ${counts.mine}` : ""}` },
                { key: "unassigned", label: `Unassigned${counts.unassigned ? ` · ${counts.unassigned}` : ""}` },
                { key: "all", label: "All agents" },
              ] as const
            ).map((o) => (
              <Link
                key={o.key}
                href={href({ agent: o.key })}
                aria-current={agent === o.key ? "true" : undefined}
                className={cn("min-h-9 rounded-full px-3 py-1.5 text-xs font-bold tnum", agent === o.key ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100")}
              >
                {o.label}
              </Link>
            ))}
          </div>
        )}
        <Link
          href={href({ breached: breached ? undefined : "1" })}
          aria-pressed={breached}
          className={cn(
            "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold tnum",
            breached ? "border-[var(--color-danger)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-100",
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> SLA breached{counts.breached ? ` · ${counts.breached}` : ""}
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-ink-500">Sort</span>
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={href({ sort: s.key })}
              aria-current={sort === s.key ? "true" : undefined}
              className={cn("min-h-9 rounded-full px-2.5 py-1.5 text-xs font-bold", sort === s.key ? "bg-ink-100 text-ink-900" : "text-ink-500 hover:text-ink-800")}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <Alert tone="danger" title={error.message}>
          {error.recovery}
        </Alert>
      ) : list.items.length === 0 ? (
        <EmptyState
          illustration="inquiries"
          icon={<Inbox className="h-6 w-6" />}
          title={filtered ? "Nothing matches" : tab.key === "new" ? "No new inquiries right now" : tab.key === "open" ? "The queue is clear" : `No ${tab.label.toLowerCase()} inquiries`}
          body={
            filtered
              ? "Try clearing the search or switching the owner filter."
              : tab.key === "new"
                ? "The next one lands here with its 30-minute clock already running."
                : tab.key === "open"
                  ? "Every customer has been answered. Go make someone's Dubai."
                  : "When an inquiry reaches this stage it will show up here."
          }
          action={filtered ? <Link href={href({ q: undefined, breached: undefined, agent: "all" })} className="text-sm font-semibold text-sun-700 underline underline-offset-2">Clear filters</Link> : undefined}
        />
      ) : (
        <QueueBulkBar agents={routable} enabled={canAssign} total={list.items.length}>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead className="bg-shell/70 text-left text-2xs font-bold uppercase tracking-wider text-ink-500">
                <tr>
                  {canAssign && (
                    <th scope="col" className="w-10 px-3 py-2.5">
                      <span className="sr-only">Select</span>
                    </th>
                  )}
                  <th scope="col" className="px-3 py-2.5">Reference</th>
                  <th scope="col" className="px-3 py-2.5">Lead</th>
                  <th scope="col" className="px-3 py-2.5">Items</th>
                  <th scope="col" className="px-3 py-2.5">Trip</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Value</th>
                  <th scope="col" className="px-3 py-2.5">Agent</th>
                  <th scope="col" className="px-3 py-2.5">Status</th>
                  <th scope="col" className="px-3 py-2.5">SLA</th>
                  <th scope="col" className="px-3 py-2.5">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {list.items.map((row) => (
                  <Row key={row.id} row={row} serverNow={serverNow} selectable={canAssign} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} hrefFor={(p) => href({ page: String(p) })} className="mt-0 border-t border-ink-100 px-3 py-2" />
        </Card>
        </QueueBulkBar>
      )}
    </div>
  );
}

function Row({ row, serverNow, selectable }: { row: InquirySummary; serverNow: number; selectable?: boolean }) {
  const detail = `/admin/inquiries/${row.id}`;
  const urgent = (row.status === "new" || row.status === "assigned") && Boolean(row.slaBreachedAt);
  const titles = row.itemTitles.length ? row.itemTitles : ["No items"];
  return (
    <tr className={cn("align-top transition-colors hover:bg-shell/60 focus-within:bg-shell/60", urgent && "bg-[var(--color-danger-bg)]/30")}>
      {selectable && (
        <td className="px-3 py-2.5">
          {/* Uncontrolled on purpose: the checkbox belongs to the bulk form that wraps this table. */}
          <input type="checkbox" name="ids" value={row.id} aria-label={`Select ${row.reference}`} className="h-4 w-4 align-middle" />
        </td>
      )}
      <td className="px-3 py-2.5">
        <Link href={detail} className="font-bold tnum text-ink-900 underline-offset-2 hover:underline focus-visible:underline">
          {row.reference}
        </Link>
      </td>
      <td className="px-3 py-2.5">
        <Link href={detail} className="block font-semibold text-ink-900 hover:underline">
          {truncate(row.leadName, 28)}
        </Link>
        <span className="text-xs text-ink-500 tnum">{row.leadPhoneMasked}</span>
      </td>
      <td className="max-w-[260px] px-3 py-2.5">
        <span className="block truncate text-ink-800" title={row.itemTitles.join(" · ")}>
          {truncate(titles[0], 40)}
        </span>
        {row.itemCount > 1 && <span className="text-xs text-ink-500">+{row.itemCount - 1} more</span>}
      </td>
      <td className="px-3 py-2.5 text-xs text-ink-700">
        <span className="block">{fmtDateRange(row.travelDateFrom, undefined, row.datesFlexible)}</span>
        <span className="text-ink-500">
          {row.guests} guest{row.guests === 1 ? "" : "s"}
          {row.dietary ? ` · ${DIETARY_LABELS[row.dietary]}` : ""}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-semibold tnum text-ink-900">{fmtMoney(row.indicativeTotal, row.currency)}</td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5">
          <AgentAvatar size="sm" initials={row.assignedAgent?.initials} name={row.assignedAgent?.name} />
          <span className="text-xs text-ink-700">{row.assignedAgent ? row.assignedAgent.name.split(" ")[0] : "Unassigned"}</span>
        </span>
      </td>
      <td className="px-3 py-2.5">
        <StatusPill status={row.status} size="sm" />
      </td>
      <td className="px-3 py-2.5">
        <SlaCountdown status={row.status} slaDueAt={row.slaDueAt} slaBreachedAt={row.slaBreachedAt} firstResponseAt={row.firstResponseAt} createdAt={row.createdAt} serverNow={serverNow} compact />
      </td>
      <td className="px-3 py-2.5 text-xs text-ink-500">
        <RelativeTime iso={row.createdAt} serverNow={serverNow} />
      </td>
    </tr>
  );
}
