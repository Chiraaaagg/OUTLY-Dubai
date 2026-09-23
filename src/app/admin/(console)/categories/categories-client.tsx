"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import type { Category } from "@/lib/types";
import { bulkSetCategoryStatusAction, deleteCategoryAction, saveCategoryAction, setCategoryStatusAction, type BulkResult, type CategoryResult } from "../../_actions/activities";
import { DataTable, FormField, INPUT_CLASS, StatusPill, type DataColumn } from "../../_components/ui";

export interface CategoryRow {
  id: string;
  status: string;
  activityCount: number;
  sortOrder: number;
  category: Category;
}

const lines = (v: string[]) => v.join("\n");
const fromLines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export function CategoriesClient({ rows, canEdit }: { rows: CategoryRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CategoryRow | "new" | null>(null);
  const [statusState, statusAction, statusPending] = useActionState<CategoryResult | null, FormData>(setCategoryStatusAction, null);
  const [delState, delAction, delPending] = useActionState<CategoryResult | null, FormData>(deleteCategoryAction, null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  /** Which row's toggle is in flight — one shared `pending` spun every button in the table. */
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [bulkState, bulkAction, bulkPending] = useActionState<BulkResult | null, FormData>(bulkSetCategoryStatusAction, null);

  useEffect(() => {
    if (statusState?.ok || delState?.ok || bulkState?.ok) {
      setDeleting(null);
      router.refresh();
    }
  }, [statusState, delState, bulkState, router]);

  useEffect(() => {
    if (!statusPending) setPendingRow(null);
  }, [statusPending]);

  const drafts = rows.filter((r) => r.status !== "published");

  const columns: DataColumn<CategoryRow>[] = [
    {
      key: "name",
      header: "Category",
      cell: (r) => (
        <div>
          <p className="font-semibold text-ink-900">
            <span aria-hidden="true">{r.category.emoji}</span> {r.category.name}
          </p>
          <p className="font-mono text-2xs text-ink-500">
            /categories/{r.category.slug} · sort {r.sortOrder}
          </p>
        </div>
      ),
    },
    { key: "tagline", header: "Tagline", cell: (r) => <span className="text-ink-700">{r.category.tagline || "—"}</span> },
    { key: "count", header: "Activities", align: "right", cell: (r) => String(r.activityCount) },
    { key: "status", header: "Status", cell: (r) => <StatusPill tone={r.status === "published" ? "success" : r.status === "draft" ? "warning" : "neutral"}>{r.status}</StatusPill> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        canEdit ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
              Edit
            </Button>
            <form action={statusAction} onSubmit={() => setPendingRow(r.id)}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="status" value={r.status === "published" ? "draft" : "published"} />
              <Button type="submit" size="sm" variant="ghost" loading={statusPending && pendingRow === r.id} disabled={statusPending}>
                {r.status === "published" ? "Unpublish" : "Publish"}
              </Button>
            </form>
            <Button size="sm" variant="ghost" className="text-[var(--color-danger)]" onClick={() => setDeleting(r)} disabled={r.activityCount > 0} title={r.activityCount > 0 ? "Move its activities first" : undefined}>
              Delete
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      {canEdit && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {drafts.length > 0 && (
            <form action={bulkAction} className="mr-auto flex flex-wrap items-center gap-2">
              <input type="hidden" name="status" value="published" />
              <input type="hidden" name="reason" value="publish all draft categories" />
              {drafts.map((d) => (
                <input key={d.id} type="hidden" name="ids" value={d.id} />
              ))}
              <span className="text-sm text-ink-600">
                {drafts.length} categor{drafts.length === 1 ? "y is" : "ies are"} not published — activities in {drafts.length === 1 ? "it" : "them"} have no category page.
              </span>
              <Button type="submit" size="sm" variant="primary" loading={bulkPending} loadingLabel="Publishing…">
                Publish all {drafts.length}
              </Button>
            </form>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            New category
          </Button>
        </div>
      )}
      {bulkState && !bulkState.ok && <Alert tone="danger" title={bulkState.message} className="mb-3" />}
      {bulkState?.ok && <Alert tone="success" title={`${bulkState.data.changed} categories published`} className="mb-3" />}
      {(statusState && !statusState.ok) || (delState && !delState.ok) ? (
        <Alert tone="danger" title={(statusState && !statusState.ok ? statusState.message : null) ?? (delState && !delState.ok ? delState.message : "")} className="mb-3" />
      ) : null}
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption="Categories" />

      {editing && <CategoryForm row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      <Sheet open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Delete ${deleting?.category.name ?? "category"}?`} description="Soft delete — the row is kept for audit and can be recreated with the same slug.">
        <form action={delAction} className="space-y-3">
          <input type="hidden" name="id" value={deleting?.id ?? ""} />
          <FormField label="Reason" htmlFor="del-reason" required error={delState && !delState.ok ? delState.fields?.reason : undefined}>
            <input id="del-reason" name="reason" required minLength={3} className={INPUT_CLASS} />
          </FormField>
          <Button type="submit" variant="danger" loading={delPending}>
            Delete category
          </Button>
        </form>
      </Sheet>
    </>
  );
}

function CategoryForm({ row, onClose }: { row: CategoryRow | null; onClose: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CategoryResult | null, FormData>(saveCategoryAction, null);
  const [c, setC] = useState(() => ({
    slug: row?.category.slug ?? "",
    name: row?.category.name ?? "",
    shortName: row?.category.shortName ?? "",
    emoji: row?.category.emoji ?? "",
    tagline: row?.category.tagline ?? "",
    intro: row?.category.intro ?? "",
    heroImage: row?.category.heroImage ?? "",
    faqs: row?.category.faqs ?? [],
    relatedSlugs: row?.category.relatedSlugs ?? [],
    featuredSlugs: row?.category.featuredSlugs ?? [],
    sortOrder: row?.sortOrder ?? 100,
  }));
  const [faqText, setFaqText] = useState(() => c.faqs.map((f) => `${f.q} :: ${f.a}`).join("\n"));

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  const payload = {
    ...c,
    heroImage: c.heroImage || undefined,
    faqs: fromLines(faqText).map((l) => {
      const [q, ...a] = l.split("::");
      return { q: (q ?? "").trim(), a: a.join("::").trim() };
    }),
  };
  const fields = state && !state.ok ? state.fields : undefined;
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) => setC((p) => ({ ...p, [k]: v }));

  return (
    <Sheet open onClose={onClose} title={row ? `Edit ${row.category.name}` : "New category"} className="max-w-2xl">
      <form action={action} className="space-y-3">
        <input type="hidden" name="payload" value={JSON.stringify(payload)} />
        {state && !state.ok && (
          <Alert tone="danger" title={state.message}>
            {fields && (
              <ul className="list-disc pl-5 text-sm">
                {Object.entries(fields).map(([k, v]) => (
                  <li key={k}>
                    <code className="font-mono text-xs">{k}</code>: {v}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Name" htmlFor="c-name" required error={fields?.name}>
            <input id="c-name" value={c.name} onChange={(e) => set("name", e.target.value)} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Short name" htmlFor="c-short" required error={fields?.shortName}>
            <input id="c-short" value={c.shortName} onChange={(e) => set("shortName", e.target.value)} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Slug" htmlFor="c-slug" required error={fields?.slug} hint={row ? "Changing this creates a new category — the old URL needs a redirect" : "lowercase-with-hyphens"}>
            <input id="c-slug" value={c.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} className={INPUT_CLASS} readOnly={Boolean(row)} />
          </FormField>
          <FormField label="Emoji" htmlFor="c-emoji" error={fields?.emoji}>
            <input id="c-emoji" value={c.emoji} onChange={(e) => set("emoji", e.target.value)} className={INPUT_CLASS} maxLength={8} />
          </FormField>
          <FormField label="Tagline" htmlFor="c-tagline" error={fields?.tagline} className="sm:col-span-2">
            <input id="c-tagline" value={c.tagline} onChange={(e) => set("tagline", e.target.value)} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Intro (page copy)" htmlFor="c-intro" error={fields?.intro} className="sm:col-span-2">
            <textarea id="c-intro" value={c.intro} onChange={(e) => set("intro", e.target.value)} rows={5} className={`${INPUT_CLASS} min-h-0 py-2 text-sm`} />
          </FormField>
          <FormField label="Hero image" htmlFor="c-hero" error={fields?.heroImage} hint="https:// URL or img:category:<slug>:0">
            <input id="c-hero" value={c.heroImage} onChange={(e) => set("heroImage", e.target.value)} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Sort order" htmlFor="c-sort" error={fields?.sortOrder}>
            <input id="c-sort" type="number" value={c.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Featured activity slugs (one per line)" htmlFor="c-featured" error={fields?.featuredSlugs}>
            <textarea id="c-featured" value={lines(c.featuredSlugs)} onChange={(e) => set("featuredSlugs", fromLines(e.target.value))} rows={4} className={`${INPUT_CLASS} min-h-0 py-2 font-mono text-sm`} />
          </FormField>
          <FormField label="Related category slugs (one per line)" htmlFor="c-related" error={fields?.relatedSlugs}>
            <textarea id="c-related" value={lines(c.relatedSlugs)} onChange={(e) => set("relatedSlugs", fromLines(e.target.value))} rows={4} className={`${INPUT_CLASS} min-h-0 py-2 font-mono text-sm`} />
          </FormField>
          <FormField label="FAQ — one per line: question :: answer" htmlFor="c-faqs" error={fields?.faqs} className="sm:col-span-2">
            <textarea id="c-faqs" value={faqText} onChange={(e) => setFaqText(e.target.value)} rows={5} className={`${INPUT_CLASS} min-h-0 py-2 font-mono text-sm`} />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} loadingLabel="Saving…">
            Save category
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
