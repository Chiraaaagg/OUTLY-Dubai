import type { Metadata } from "next";
import type { ReactNode } from "react";
import { authService } from "@/server/services/auth.service";
import { ROLE_NAMES, type RoleCode } from "@/server/lib/permissions";
import { AdminShell } from "./_components/shell";

/**
 * Root layout for `/admin/**` (§19 §4).
 *
 * Layouts cannot see the pathname, so the split is by route group:
 *   (auth)     login / verify / enrol — rendered bare (no session).
 *   (console)  everything else — `(console)/layout.tsx` redirects to
 *              /admin/login when the session is missing.
 * This layout resolves the session once and wraps children in the shell only
 * when a session exists, so pages that live outside `(console)` (the Agent
 * Console's `/admin/inquiries`) still get the nav. The storefront Header and
 * Footer hide themselves under /admin (see `src/components/layout`).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "OUTLYY Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const session = await authService.resolveCookies();
  if (!session) return <>{children}</>;
  const { user, actor } = session;
  const primaryRole = (user.roles[0] as RoleCode | undefined) ?? undefined;
  return (
    <AdminShell
      user={{
        displayName: actor.displayName ?? user.fullName,
        email: user.email,
        roleLabel: primaryRole ? ROLE_NAMES[primaryRole] : "No role",
        // Names only — never the session or secrets (§19 §4).
        permissions: [...actor.permissions],
      }}
    >
      {children}
    </AdminShell>
  );
}
