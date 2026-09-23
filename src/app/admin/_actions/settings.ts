"use server";

import { revalidatePath } from "next/cache";
import { authService } from "@/server/services/auth.service";
import { settingsService } from "@/server/services/settings.service";
import { parseWith } from "@/server/lib/http";
import { settingKeySchema } from "@/server/schemas/admin.schemas";
import { form, runAction, type ActionResult } from "./result";

/**
 * Settings forms (sla / routing / followup / pricing). The form is flat
 * strings; this action shapes them into the typed value and lets
 * `settingsService.update` validate with the per-key zod schema and audit.
 */

export type UpdateSettingResult = ActionResult<{ key: string }>;

function shape(key: "sla" | "routing" | "followup" | "pricing", fd: FormData): Record<string, unknown> {
  switch (key) {
    case "sla":
      return {
        responseMinutes: form.num(fd, "responseMinutes"),
        businessStart: form.str(fd, "businessStart"),
        businessEnd: form.str(fd, "businessEnd"),
        timeZone: form.str(fd, "timeZone"),
        escalationMinutes: form.num(fd, "escalationMinutes"),
      };
    case "routing":
      return {
        premiumThresholdInr: form.num(fd, "premiumThresholdInr"),
        groupThresholdPax: form.num(fd, "groupThresholdPax"),
        maxConcurrentDefault: form.num(fd, "maxConcurrentDefault"),
      };
    case "followup":
      return {
        ladderHours: (form.list(fd, "ladderHours") ?? []).map(Number),
        autoLostAfterHours: form.num(fd, "autoLostAfterHours"),
      };
    case "pricing":
      return { tolerancePercent: form.num(fd, "tolerancePercent") };
  }
}

export async function updateSettingAction(_prev: UpdateSettingResult | null, fd: FormData): Promise<UpdateSettingResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("settings.edit");
    const key = parseWith(settingKeySchema, form.str(fd, "key"));
    await settingsService.update(actor, key, shape(key, fd));
    revalidatePath("/admin/settings");
    return { key };
  });
}
