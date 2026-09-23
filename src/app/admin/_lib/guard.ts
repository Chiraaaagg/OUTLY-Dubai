import "server-only";
import { redirect } from "next/navigation";
import { authService, type ResolvedSession } from "@/server/services/auth.service";
import { isAppError } from "@/server/lib/errors";
import type { Permission } from "@/server/lib/permissions";

/**
 * Page-level guard for `src/app/admin/**` Server Components.
 *
 * Every admin page enforces its permission server-side (AC-ADM-02); the nav
 * only hides links. Unauthenticated → `/admin/login`; missing permission →
 * `/admin?denied=<permission>` where the dashboard explains what happened.
 * Server Actions must NOT use this — they return the error envelope instead
 * of redirecting (see `_actions/result.ts`).
 */
export async function requirePage(permission?: Permission): Promise<ResolvedSession> {
  try {
    return await authService.requireCookies(permission);
  } catch (err) {
    if (isAppError(err) && err.code === "UNAUTHORIZED") redirect("/admin/login");
    if (isAppError(err) && err.code === "FORBIDDEN") redirect(`/admin?denied=${encodeURIComponent(permission ?? "")}`);
    throw err;
  }
}
