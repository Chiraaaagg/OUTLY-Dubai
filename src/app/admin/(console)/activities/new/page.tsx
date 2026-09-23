import { activityService } from "@/server/services/activity.service";
import { hasPermission } from "@/server/lib/actor";
import { requirePage } from "../../../_lib/guard";
import { ActivityEditor, emptyActivityInput } from "../activity-editor";

/** /admin/activities/new — manual creation (Import method 1). */
export const dynamic = "force-dynamic";

export default async function NewActivityPage() {
  const { actor } = await requirePage("products.edit");
  const categories = await activityService.listCategories(actor);
  return (
    <ActivityEditor
      mode="create"
      initial={emptyActivityInput()}
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      canPublish={hasPermission(actor, "products.publish")}
    />
  );
}
