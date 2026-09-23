import { settingsService } from "@/server/services/settings.service";
import { requirePage } from "../../_lib/guard";
import { PageHeader } from "../../_components/ui";
import { SettingsForms } from "./settings-forms";

/**
 * /admin/settings — SLA, routing, follow-up ladder and price tolerance
 * (§10 §2.13, §17). Values propagate within a minute (settings cache TTL).
 */
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requirePage("settings.edit");
  const all = await settingsService.all();
  return (
    <>
      <PageHeader title="Settings" sub="Changes are audited and take effect within a minute on every instance. No deploy needed." />
      <SettingsForms initial={all} />
    </>
  );
}
