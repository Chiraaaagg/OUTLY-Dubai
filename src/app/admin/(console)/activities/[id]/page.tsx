import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/primitives";
import { activityService } from "@/server/services/activity.service";
import { hasPermission } from "@/server/lib/actor";
import { isAppError } from "@/server/lib/errors";
import { activityInputSchema } from "@/server/schemas/activity.schema";
import { requirePage } from "../../../_lib/guard";
import { ActivityEditor } from "../activity-editor";
import { ActivityRowActions } from "../row-actions";

/** /admin/activities/:id — full editor with lifecycle actions and version history. */
export const dynamic = "force-dynamic";

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePage("products.edit");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let detail;
  try {
    detail = await activityService.get(actor, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const categories = await activityService.listCategories(actor);
  const { id: _cid, rating: _r, reviewCount: _rc, bookedThisMonth: _b, ...rest } = detail.content;
  const initial = activityInputSchema.parse(rest);
  const can = { publish: hasPermission(actor, "products.publish"), delete: hasPermission(actor, "products.delete") };

  return (
    <div className="space-y-4">
      {detail.deletedAt && (
        <Alert tone="warning" title="This activity is deleted">
          <p>It is hidden from the storefront and its slug stays reserved. Restore it to edit.</p>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ActivityRowActions row={{ id: detail.id, slug: detail.slug, title: detail.title, status: detail.status, deleted: Boolean(detail.deletedAt) }} can={can} />
      </div>
      <ActivityEditor
        mode="edit"
        id={detail.id}
        version={detail.version}
        status={detail.status}
        fulfilmentMode={detail.fulfilmentMode}
        initial={initial}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        versions={detail.versions.map((v) => ({ version: v.version, status: v.status, reason: v.reason, createdAt: v.createdAt.toISOString() }))}
        canPublish={can.publish}
      />
    </div>
  );
}
