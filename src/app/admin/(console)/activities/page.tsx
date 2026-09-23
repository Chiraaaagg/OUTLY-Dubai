import { ButtonLink } from "@/components/ui/button";
import { activityService, type ActivityListFilters } from "@/server/services/activity.service";
import { hasPermission } from "@/server/lib/actor";
import { requirePage } from "../../_lib/guard";
import { INPUT_CLASS, PageHeader, Pagination } from "../../_components/ui";
import { ActivitiesTable, type ActivityTableRow } from "./activities-table";

/**
 * /admin/activities — every listing the storefront can show, with its
 * lifecycle state. Search is on title/slug/location; filters are status, tier
 * and category. Rows can be selected and published in bulk; row actions and
 * the bulk bar both call Server Actions that re-check permissions.
 */
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const PAGE_SIZES = [25, 50, 100, 200];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { actor } = await requirePage("products.edit");
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").trim().slice(0, 80);
  const statusRaw = one(sp.status);
  const status = statusRaw === "draft" || statusRaw === "published" || statusRaw === "archived" || statusRaw === "deleted" ? statusRaw : undefined;
  const tier = one(sp.tier)?.toUpperCase();
  const category = one(sp.category);
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  const sizeRaw = Number.parseInt(one(sp.size) ?? "", 10);
  const pageSize = PAGE_SIZES.includes(sizeRaw) ? sizeRaw : PAGE_SIZES[0];
  const filters: ActivityListFilters = { q: q || undefined, status, tier: tier && /^[A-E]$/.test(tier) ? tier : undefined, category };

  const [list, categories] = await Promise.all([
    activityService.list(actor, { ...filters, page, pageSize }),
    activityService.listCategories(actor),
  ]);
  // A published listing whose category is still a draft has no category page
  // to sit on, so the table flags it rather than letting it go quietly live.
  const publishedCategories = new Set(categories.filter((c) => c.status === "published").map((c) => c.slug));
  const can = {
    publish: hasPermission(actor, "products.publish"),
    delete: hasPermission(actor, "products.delete"),
    imports: hasPermission(actor, "imports.run"),
  };

  const href = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = { q: q || undefined, status, tier, category, size: pageSize === PAGE_SIZES[0] ? undefined : String(pageSize), ...overrides };
    if (!("page" in overrides)) delete merged.page;
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/admin/activities?${s}` : "/admin/activities";
  };

  const rows: ActivityTableRow[] = list.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    tier: r.tier,
    status: r.status,
    categorySlug: r.categorySlug,
    categoryPublished: publishedCategories.has(r.categorySlug),
    fulfilmentMode: r.fulfilmentMode,
    quoteOnly: r.quoteOnly,
    priceFromInr: r.priceFromInr,
    version: r.version,
    updatedAt: r.updatedAt.toISOString(),
    deleted: Boolean(r.deletedAt),
  }));

  return (
    <>
      <PageHeader
        title="Activities"
        sub={`${list.total.toLocaleString("en-IN")} listing${list.total === 1 ? "" : "s"}${status ? ` · ${status}` : ""}`}
        actions={
          <>
            {can.imports && (
              <ButtonLink href="/admin/imports" variant="outline" size="sm">
                Import
              </ButtonLink>
            )}
            <ButtonLink href="/admin/activities/new" size="sm">
              New activity
            </ButtonLink>
          </>
        }
      />

      <form method="get" action="/admin/activities" className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_8rem_12rem_auto]">
        <input name="q" defaultValue={q} placeholder="Search title, slug, location" className={INPUT_CLASS} aria-label="Search activities" />
        <select name="status" defaultValue={status ?? ""} className={INPUT_CLASS} aria-label="Status">
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
          <option value="deleted">Deleted</option>
        </select>
        <select name="tier" defaultValue={tier ?? ""} className={INPUT_CLASS} aria-label="Tier">
          <option value="">All tiers</option>
          {["A", "B", "C", "D", "E"].map((t) => (
            <option key={t} value={t}>
              Tier {t}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={category ?? ""} className={INPUT_CLASS} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name} ({c.activityCount})
            </option>
          ))}
        </select>
        <button type="submit" className="min-h-11 rounded-[var(--radius-control)] border border-ink-300 bg-paper px-4 text-sm font-semibold text-ink-800 hover:border-ink-600">
          Filter
        </button>
      </form>

      <ActivitiesTable
        rows={rows}
        can={can}
        filters={filters}
        total={list.total}
        emptyMessage={q || status || tier || category ? "No activities match these filters." : "No activities yet — create one or import a sheet."}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-600">
        <span>Rows per page</span>
        {PAGE_SIZES.map((n) => (
          <a
            key={n}
            href={href({ size: n === PAGE_SIZES[0] ? undefined : String(n), page: undefined })}
            aria-current={pageSize === n ? "true" : undefined}
            className={pageSize === n ? "rounded-full bg-ink-900 px-2.5 py-1 font-bold text-white" : "rounded-full px-2.5 py-1 font-semibold hover:bg-ink-100"}
          >
            {n}
          </a>
        ))}
      </div>

      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} hrefFor={(p) => href({ page: String(p) })} />
    </>
  );
}
