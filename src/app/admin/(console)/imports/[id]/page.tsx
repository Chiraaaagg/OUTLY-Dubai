import Link from "next/link";
import { notFound } from "next/navigation";
import { importService } from "@/server/services/import.service";
import { isAppError } from "@/server/lib/errors";
import { hasPermission } from "@/server/lib/actor";
import { requirePage } from "../../../_lib/guard";
import { DataTable, KeyValueList, PageHeader, Panel, StatusPill, fmtDateTime, type DataColumn } from "../../../_components/ui";
import { BatchActions } from "./batch-actions";

/** /admin/imports/:id — one batch: what was previewed, what was applied, and the revert button. */
export const dynamic = "force-dynamic";

const STATUS_TONE = { previewed: "info", applied: "success", reverted: "neutral", failed: "danger" } as const;

interface PreviewRow {
  row: number;
  slug: string;
  title: string;
  action: "create" | "update";
  ok: boolean;
  warnings?: { field: string; message: string }[];
  raw?: Record<string, string> | null;
  missingCategory?: string | null;
}
interface RowError {
  row: number;
  field: string;
  message: string;
}

export default async function ImportBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePage("imports.run");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let batch;
  try {
    batch = await importService.get(actor, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const preview = (Array.isArray(batch.preview) ? batch.preview : []) as unknown as PreviewRow[];
  const errors = (Array.isArray(batch.errors) ? batch.errors : []) as unknown as RowError[];
  const errorsByRow = new Map<number, RowError[]>();
  for (const e of errors) errorsByRow.set(e.row, [...(errorsByRow.get(e.row) ?? []), e]);
  const missingCategories = [...new Set(preview.map((r) => r.missingCategory).filter((c): c is string => Boolean(c)))];

  const previewColumns: DataColumn<PreviewRow>[] = [
    { key: "row", header: "Row", cell: (r) => String(r.row) },
    { key: "slug", header: "Slug", cell: (r) => <span className="font-mono text-xs">{r.slug || "—"}</span> },
    { key: "title", header: "Title", cell: (r) => r.title || "—" },
    { key: "action", header: "Action", cell: (r) => <StatusPill tone={r.action === "create" ? "accent" : "info"}>{r.action}</StatusPill> },
    {
      key: "result",
      header: "Result",
      cell: (r) =>
        (
          <div>
            {r.ok ? (
              <StatusPill tone="success">valid</StatusPill>
            ) : (
              <ul className="text-xs text-[var(--color-danger)]">
                {(errorsByRow.get(r.row) ?? []).map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.field}</span>: {e.message}
                    {r.raw && r.raw[e.field] !== undefined && <span className="ml-1 text-ink-500">(cell: “{r.raw[e.field].slice(0, 80)}”)</span>}
                  </li>
                ))}
              </ul>
            )}
            {r.warnings && r.warnings.length > 0 && (
              <details className="mt-1 text-xs text-ink-600">
                <summary className="cursor-pointer select-none">{r.warnings.length} note{r.warnings.length === 1 ? "" : "s"}</summary>
                <ul className="mt-1">
                  {r.warnings.map((w, i) => (
                    <li key={i}>
                      <span className="font-mono">{w.field}</span>: {w.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ),
    },
  ];

  const itemColumns: DataColumn<(typeof batch.items)[number]>[] = [
    {
      key: "slug",
      header: "Activity",
      cell: (i) => (
        <Link href={`/admin/activities/${i.productId}`} className="font-mono text-xs underline">
          {i.slug}
        </Link>
      ),
    },
    { key: "action", header: "Action", cell: (i) => <StatusPill tone={i.action === "create" ? "accent" : "info"}>{i.action}</StatusPill> },
    { key: "versions", header: "Version", cell: (i) => `${i.beforeVersion ?? "—"} → ${i.afterVersion}` },
  ];

  return (
    <>
      <PageHeader
        title={batch.fileName ?? batch.sourceRef ?? `${batch.source} import`}
        sub={
          <>
            <StatusPill tone={STATUS_TONE[batch.status as keyof typeof STATUS_TONE] ?? "neutral"}>{batch.status}</StatusPill> <span className="ml-1 font-mono text-xs">{batch.id}</span>
          </>
        }
        actions={
          <BatchActions
            id={batch.id}
            status={batch.status}
            canPublish={hasPermission(actor, "products.publish")}
            rowsFailed={batch.rowsFailed}
            missingCategories={missingCategories}
            canCreateCategories={hasPermission(actor, "categories.edit")}
          />
        }
      />
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel title="Summary">
          <KeyValueList
            items={[
              { label: "Source", value: batch.source },
              { label: "Rows", value: String(batch.rowsTotal) },
              { label: "Valid", value: String(batch.rowsOk) },
              { label: "Failed", value: String(batch.rowsFailed) },
              { label: "Previewed", value: fmtDateTime(batch.createdAt) },
              { label: "Applied", value: fmtDateTime(batch.appliedAt) },
              { label: "Reverted", value: fmtDateTime(batch.revertedAt) },
            ]}
          />
        </Panel>
        <div className="space-y-4">
          {batch.items.length > 0 && (
            <Panel title="Applied changes" sub="Revert restores every updated listing to its previous version and soft-deletes the created ones.">
              <DataTable columns={itemColumns} rows={batch.items} rowKey={(i) => i.id} caption="Applied items" />
            </Panel>
          )}
          <Panel title="Preview rows">
            <DataTable columns={previewColumns} rows={preview} rowKey={(r) => String(r.row)} caption="Preview rows" empty="No rows recorded." />
          </Panel>
        </div>
      </div>
    </>
  );
}
