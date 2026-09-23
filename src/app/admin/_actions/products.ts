"use server";

import { revalidatePath } from "next/cache";
import { authService } from "@/server/services/auth.service";
import { catalogService } from "@/server/services/catalog.service";
import { parseWith } from "@/server/lib/http";
import { fulfilmentModeSchema, productIdSchema } from "@/server/schemas/admin.schemas";
import { form, runAction, type ActionResult } from "./result";

/**
 * THE HINGE (§17 §6.4): per-SKU fulfilment mode flip, audited with a reason.
 * `products.publish` is checked here and again inside the service.
 */

export type SetFulfilmentModeResult = ActionResult<{ id: string; mode: "inquiry" | "instant" }>;

export async function setFulfilmentModeAction(_prev: SetFulfilmentModeResult | null, fd: FormData): Promise<SetFulfilmentModeResult> {
  return runAction(async () => {
    const { actor } = await authService.requireCookies("products.publish");
    const id = parseWith(productIdSchema, form.str(fd, "id"));
    const input = parseWith(fulfilmentModeSchema, {
      kind: form.str(fd, "kind"),
      mode: form.str(fd, "mode"),
      reason: form.str(fd, "reason") ?? "",
    });
    const after = await catalogService.setFulfilmentMode(actor, { kind: input.kind, id }, input.mode, input.reason);
    revalidatePath("/admin/products");
    return { id, mode: after.fulfilmentMode };
  });
}
