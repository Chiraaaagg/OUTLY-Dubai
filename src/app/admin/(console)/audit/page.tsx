import { auditRepo, type AuditRow } from "@/server/repositories/audit.repo";
import { adminRepo } from "@/server/repositories/admin.repo";
import { Button } from "@/components/ui/button";
import { requirePage } from "../../_lib/guard";
import { ADMIN_TZ_LABEL, type DataColumn, DataTable, fmtDateTime, FormField, INPUT_CLASS, PageHeader, Pagination, StatusPill } from "../../_components/ui";

/**
 * /admin/audit — the append-only log viewer (§10 §2.13, AC-ADM-01). Filters
 * live in the query string so a view is linkable; the form is a plain GET.
 * Reads through `auditRepo` (Database agent) which resolves actor names.
 */
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Entity types the services write today — a hint list, not a constraint. */
const KNOWN_ENTITY_TYPES = ["inquiry", "inquiry_item", "order", "admin_user", "admin_session", "setting", "product", "combo", "notification", "suppressed_phone"];

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function Json({ value }: { value: unknown }) {
  if (value == null) return <span className="text-ink-400">—</span>;
  const flat = JSON.stringify(value);
  return (
    <details className="max-w-xs">
      <summary className="cursor-pointer text-xs font-semibold text-ink-700">{flat.length > 60 ? `${flat.slice(0, 60)}…` : flat}</summary>
      <pre className="mt-1 max-h-48 overflow-auto rounded border border-ink-200 bg-shell/60 p-2 text-2xs leading-snug">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [, sp] = await Promise.all([requirePage("audit.view"), searchParams]);
  const q = {
    action: one(sp.action),
    entity: one(sp.entity),
    entityId: one(sp.entityId),
    actor: one(sp.actor),
    from: DATE_RE.test(one(sp.from)) ? one(sp.from) : "",
    to: DATE_RE.test(one(sp.to)) ? one(sp.to) : "",
    page: Math.max(1, Number.parseInt(one(sp.page) || "1", 10) || 1),
  };

  const users = await adminRepo.list();

  // The actor filter accepts a UUID or an email.
  let actorId: string | undefined;
  let actorUnknown = false;
  if (q.actor) {
    if (UUID_RE.test(q.actor)) actorId = q.actor;
    else {
      const match = users.find((u) => u.email === q.actor.toLowerCase());
      if (match) actorId = match.id;
      else actorUnknown = true;
    }
  }

  const result = actorUnknown
    ? { items: [] as AuditRow[], total: 0, page: 1, pageSize: PAGE_SIZE }
    : await auditRepo.list({
        action: q.action || undefined,
        entityType: q.entity || undefined,
        entityId: q.entityId || undefined,
        actorId,
        from: q.from || undefined,
        to: q.to || undefined,
        page: q.page,
        pageSize: PAGE_SIZE,
      });

  const hrefFor = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (k !== "page" && v) p.set(k, String(v));
    p.set("page", String(page));
    return `/admin/audit?${p.toString()}`;
  };

  const columns: DataColumn<AuditRow>[] = [
    { key: "when", header: `When (${ADMIN_TZ_LABEL})`, cell: (r) => <span className="tnum whitespace-nowrap">{fmtDateTime(r.createdAt)}</span> },
    {
      key: "actor",
      header: "Actor",
      cell: (r) => (
        <div>
          <p className="font-semibold text-ink-900">{r.actorName ?? r.actorType}</p>
          <p className="font-mono text-2xs text-ink-500">{r.actorId ?? "—"}</p>
        </div>
      ),
    },
    { key: "action", header: "Action", cell: (r) => <code className="font-mono text-xs text-ink-800">{r.action}</code> },
    {
      key: "entity",
      header: "Entity",
      cell: (r) => (
        <div>
          <StatusPill tone="neutral">{r.entityType}</StatusPill>
          <p className="mt-0.5 font-mono text-2xs text-ink-500">{r.entityId}</p>
        </div>
      ),
    },
    { key: "before", header: "Before", cell: (r) => <Json value={r.before} /> },
    { key: "after", header: "After", cell: (r) => <Json value={r.after} /> },
    { key: "reason", header: "Reason", cell: (r) => <span className="text-ink-700">{r.reason ?? "—"}</span> },
  ];

  return (
    <>
      <PageHeader title="Audit log" sub="Every admin and agent mutation, immutable. Newest first." />

      <form method="get" action="/admin/audit" className="mb-4 grid grid-cols-2 gap-3 rounded-[var(--radius-card)] border border-ink-200 bg-paper p-4 shadow-[var(--shadow-soft)] sm:grid-cols-3 lg:grid-cols-6">
        <FormField label="Action" htmlFor="f-action" hint="Prefix, e.g. users.">
          <input id="f-action" name="action" defaultValue={q.action} className={INPUT_CLASS} />
        </FormField>
        <FormField label="Entity type" htmlFor="f-entity">
          <input id="f-entity" name="entity" defaultValue={q.entity} className={INPUT_CLASS} list="audit-entity-types" />
          <datalist id="audit-entity-types">
            {KNOWN_ENTITY_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Entity id" htmlFor="f-entityId">
          <input id="f-entityId" name="entityId" defaultValue={q.entityId} className={INPUT_CLASS} />
        </FormField>
        <FormField label="Actor" htmlFor="f-actor" hint="Email or id" error={actorUnknown ? "No user with that email" : undefined}>
          <input id="f-actor" name="actor" defaultValue={q.actor} className={INPUT_CLASS} list="audit-actors" />
          <datalist id="audit-actors">
            {users.map((u) => (
              <option key={u.id} value={u.email}>
                {u.fullName}
              </option>
            ))}
          </datalist>
        </FormField>
        <FormField label="From" htmlFor="f-from">
          <input id="f-from" name="from" type="date" defaultValue={q.from} className={INPUT_CLASS} />
        </FormField>
        <FormField label="To" htmlFor="f-to">
          <input id="f-to" name="to" type="date" defaultValue={q.to} className={INPUT_CLASS} />
        </FormField>
        <div className="col-span-full flex justify-end gap-2">
          <a href="/admin/audit" className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3.5 text-sm font-semibold text-ink-700 hover:bg-ink-100">
            Clear
          </a>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </div>
      </form>

      <DataTable columns={columns} rows={result.items} rowKey={(r) => r.id} caption="Audit entries" empty="No entries match these filters." />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={hrefFor} />
    </>
  );
}
