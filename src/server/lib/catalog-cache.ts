import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { log } from "./logger";

/** Cache tag every catalogue read model is keyed on (src/lib/catalog/server.ts). */
export const CATALOG_TAG = "catalog";

/**
 * Invalidate every storefront surface that renders catalogue content. Safe
 * to call outside a request scope (tests, scripts): Next throws when there
 * is no static-generation store and we swallow that — the 60s ISR window
 * still catches up.
 */
export function revalidateCatalog(): void {
  try {
    revalidateTag(CATALOG_TAG, "max");
    revalidatePath("/", "layout");
  } catch (error) {
    log.debug("catalog.revalidate_skipped", { error: error instanceof Error ? error.message : String(error) });
  }
}
