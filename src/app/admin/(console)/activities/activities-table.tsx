"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { bulkSetActivityStatusAction, type BulkResult } from "../../_actions/activities";
import { DataTable, INPUT_CLASS, StatusPill, fmtDateTime, type DataColumn } from "../../_components/ui";
import { ActivityRowActions, type RowCapabilities } from "./row-actions";

/**
 * Activities table with multi-select.
 *
 * Publishing an imported catalogue one row at a time was the single slowest
 * thing in the console, so selection lives here: tick rows, or "select all N
 * matching these filters" — which sends the *filters*, not 200 ids, and the
 * service re-runs them server-side in one transaction. The table itself is
 * still the shared `DataTable`; only the leading checkbox column and the
 * action bar are new.
 */

export interface ActivityTableRow {
  id: string;
  slug: string;
  title: string;
  tier: string;
  status: string;
  categorySlug: string;
  categoryPublished: boolean;
  fulfilmentMode: string;
  quoteOnly: boolean;
  priceFromInr: number | null;
  version: number;
  updatedAt: string;
  deleted: boolean;
}

export interface TableFilters {
  q?: string;
  status?: string;
  tier?: string;
  category?: string;
}

const STATUS_TONE = { draft: "warning", published: "success", archived: "neutral" } as const;
const TARGETS = [
  { status: "published", label: "Publish", variant: "primary" as const },
  { status: "draft", label: "Unpublish", variant: "outline" as const },
  { status: "archived", label: "Archive", variant: "ghost" as const },
];

export function ActivitiesTable({
  rows,
  can,
  filters,
  total,
  emptyMessage,
}: {
  rows: ActivityTableRow[];
  can: RowCapabilities & { publish: boolean };
  filters: TableFilters;
  /** Rows matching the filters across every page — the "select all" count. */
  total: number;
  emptyMessage: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [state, submit, pending] = useActionState<BulkResult | null, FormData>(bulkSetActivityStatusAction, null);

  // The page re-renders with new rows after a filter change or a refresh;
  // a selection that no longer exists must not survive it.
  const rowIds = useMemo(() => rows.map((r) => r.id).join(","), [rows]);
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [rowIds]);

  useEffect(() => {
    if (state?.ok) {
      setSelected(new Set());
      setAllMatching(false);
      setReason("");
      router.refresh();
    }
  }, [state, router]);

  const selectable = rows.filter((r) => !r.deleted);
  const allOnPage = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const count = allMatching ? total : selected.size;

  const toggle = (id: string) => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setAllMatching(false);
    setSelected(allOnPage ? new Set() : new Set(selectable.map((r) => r.id)));
  };

  const columns: DataColumn<ActivityTableRow>[] = [
    {
      key: "select",
      className: "w-10",
      header: (
        <>
          <input
            type="checkbox"
            checked={allOnPage}
            onChange={toggleAllOnPage}
            disabled={selectable.length === 0 || pending}
            aria-label="Select every activity on this page"
            className="h-4 w-4 align-middle"
          />
          <span className="sr-only">Select</span>
        </>
      ),
      cell: (r) =>
        r.deleted ? null : (
          <input
            type="checkbox"
            checked={allMatching || selected.has(r.id)}
            onChange={() => toggle(r.id)}
            disabled={pending}
            aria-label={`Select ${r.title}`}
            className="h-4 w-4 align-middle"
          />
        ),
    },
    {
      key: "title",
      header: "Activity",
      cell: (r) => (
        <div className="min-w-[16rem]">
          <Link href={`/admin/activities/${r.id}`} className="font-semibold text-ink-900 hover:underline">
            {r.title}
          </Link>
          <p className="font-mono text-2xs text-ink-500">
            {r.slug} · {r.categorySlug}
            {!r.categoryPublished && (
              <span className="ml-1 font-sans font-semibold text-[var(--color-warning)]" title="This category is not published — the listing will have no category page">
                category draft
              </span>
            )}
          </p>
        </div>
      ),
    },
    { key: "tier", header: "Tier", cell: (r) => <StatusPill tone={r.tier === "A" ? "accent" : "neutral"}>Tier {r.tier}</StatusPill> },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          <StatusPill tone={r.deleted ? "danger" : STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.deleted ? "deleted" : r.status}</StatusPill>
          {r.quoteOnly && <StatusPill tone="info">quote only</StatusPill>}
          <StatusPill tone={r.fulfilmentMode === "instant" ? "success" : "neutral"}>{r.fulfilmentMode}</StatusPill>
        </div>
      ),
    },
    { key: "price", header: "From ₹", align: "right", cell: (r) => (r.priceFromInr == null ? "—" : r.priceFromInr.toLocaleString("en-IN")) },
    { key: "version", header: "v", align: "right", cell: (r) => String(r.version) },
    { key: "updated", header: "Updated", cell: (r) => <span className="whitespace-nowrap text-ink-600">{fmtDateTime(new Date(r.updatedAt))}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (r) => <ActivityRowActions row={{ id: r.id, slug: r.slug, title: r.title, status: r.status, deleted: r.deleted }} can={can} />,
    },
  ];

  return (
    <>
      {can.publish && (
        <form action={submit} className="mb-3 rounded-[var(--radius-card)] border border-ink-200 bg-paper p-3">
          <input type="hidden" name="scope" value={allMatching ? "filter" : "ids"} />
          <input type="hidden" name="filters" value={JSON.stringify(filters)} />
          {!allMatching && [...selected].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-800">
              {count === 0 ? "Select listings to publish in bulk" : `${count.toLocaleString("en-IN")} selected`}
            </span>
            {selected.size > 0 && !allMatching && total > selectable.length && (
              <button type="button" onClick={() => setAllMatching(true)} className="text-sm font-semibold text-sun-700 underline underline-offset-2">
                Select all {total.toLocaleString("en-IN")} matching these filters
              </button>
            )}
            {(selected.size > 0 || allMatching) && (
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setAllMatching(false);
                }}
                className="text-sm text-ink-600 underline underline-offset-2"
              >
                Clear
              </button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <input
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="Reason (optional, goes in the audit log)"
                className={`${INPUT_CLASS} min-h-10 w-64 text-sm`}
                aria-label="Reason for the bulk change"
              />
              {TARGETS.map((t) => (
                <Button
                  key={t.status}
                  type="submit"
                  name="status"
                  value={t.status}
                  size="sm"
                  variant={t.variant}
                  onClick={() => setBusy(t.status)}
                  disabled={count === 0 || pending}
                  loading={pending && busy === t.status}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          {state && !state.ok && (
            <Alert tone="danger" title={state.message} className="mt-3">
              {state.fields?.ids ?? state.recovery}
            </Alert>
          )}
          {state?.ok && (
            <Alert tone={state.data.changed > 0 ? "success" : "info"} title={summary(state.data)} className="mt-3" />
          )}
        </form>
      )}

      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption="Activities" empty={emptyMessage} />
    </>
  );
}

function summary(d: { changed: number; skipped: number; invalid: number; remaining: number; status: string }) {
  const verb = d.status === "published" ? "published" : d.status === "archived" ? "archived" : "moved to draft";
  const parts = [`${d.changed.toLocaleString("en-IN")} ${verb}`];
  if (d.skipped) parts.push(`${d.skipped} already there`);
  if (d.invalid) parts.push(`${d.invalid} skipped — content needs fixing`);
  if (d.remaining) parts.push(`${d.remaining} still matching — run it again`);
  return parts.join(" · ");
}
