import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { authService } from "@/server/services/auth.service";

/**
 * Console pages require a live session (DB row, not just a valid JWT — the
 * proxy only checks the JWT). Individual pages enforce their own permission
 * via `_lib/guard.ts`.
 */
export const dynamic = "force-dynamic";

export default async function AdminConsoleLayout({ children }: { children: ReactNode }) {
  const session = await authService.resolveCookies();
  if (!session) redirect("/admin/login");
  return <>{children}</>;
}
