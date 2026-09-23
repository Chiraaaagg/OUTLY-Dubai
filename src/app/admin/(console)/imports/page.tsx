import Link from "next/link";
import { importService } from "@/server/services/import.service";
import { hasPermission } from "@/server/lib/actor";
import { requirePage } from "../../_lib/guard";
import { DataTable, PageHeader, Pagination, StatusPill, fmtDateTime, type DataColumn } from "../../_components/ui";
import { ImportWizard } from "./import-wizard";

/**
 * /admin/imports — create listings from a CSV, a Google Sheet, a Google Doc or
 * a JSON array; every run is a batch that can be reverted. Wizard on top,
 * batch history below.
 */
export const dynamic = "force-dynamic";

const STATUS_TONE = { previewed: "info", applied: "success", reverted: "neutral", failed: "danger" } as const;

type Row = Awaited<ReturnType<typeof importService.list>>["rows"][number];

export default async function ImportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { actor } = await requirePage("imports.run");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const list = await importService.list(actor, page);
  const canPublish = hasPermission(actor, "products.publish");

  const columns: DataColumn<Row>[] = [
    {
      key: "batch",
      header: "Batch",
      cell: (r) => (
        <div>
          <Link href={`/admin/imports/${r.id}`} className="font-semibold text-ink-900 hover:underline">
            {r.fileName ?? r.sourceRef ?? `${r.source} import`}
          </Link>
          <p className="font-mono text-2xs text-ink-500">
            {r.source} · {r.id.slice(0, 8)}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusPill tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status}</StatusPill> },
    { key: "rows", header: "Rows", align: "right", cell: (r) => `${r.rowsOk} ok${r.rowsFailed ? ` · ${r.rowsFailed} failed` : ""}` },
    { key: "created", header: "Previewed", cell: (r) => fmtDateTime(r.createdAt) },
    { key: "applied", header: "Applied", cell: (r) => fmtDateTime(r.appliedAt) },
    { key: "reverted", header: "Reverted", cell: (r) => fmtDateTime(r.revertedAt) },
  ];

  return (
    <>
      <PageHeader title="Import listings" sub="CSV, Google Sheet, Google Doc or JSON. Preview first; nothing is written until you apply. Every batch can be reverted." />
      <ImportWizard canPublish={canPublish} />
      <h2 className="mb-2 mt-8 text-lg">Batch history</h2>
      <DataTable columns={columns} rows={list.rows} rowKey={(r) => r.id} caption="Import batches" empty="No imports yet." />
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} hrefFor={(p) => `/admin/imports?page=${p}`} />
    </>
  );
}
