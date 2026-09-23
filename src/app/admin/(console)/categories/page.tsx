import { activityService } from "@/server/services/activity.service";
import { hasPermission } from "@/server/lib/actor";
import { requirePage } from "../../_lib/guard";
import { PageHeader } from "../../_components/ui";
import { CategoriesClient, type CategoryRow } from "./categories-client";

/** /admin/categories — the eight functional categories, editable (slugs are SEO-owned; change with care). */
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const { actor } = await requirePage("products.edit");
  const rows = await activityService.listCategories(actor, { includeDeleted: false });
  const canEdit = hasPermission(actor, "categories.edit");
  const data: CategoryRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    activityCount: r.activityCount,
    sortOrder: r.sortOrder,
    category: r.category,
  }));
  return (
    <>
      <PageHeader title="Categories" sub={`${rows.length} categories · slugs are permanent URLs (PRD §4.2) — renaming one needs a redirect`} />
      <CategoriesClient rows={data} canEdit={canEdit} />
    </>
  );
}
