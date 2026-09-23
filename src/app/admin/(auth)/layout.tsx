import type { ReactNode } from "react";

/**
 * Bare layout for the sign-in steps. No session check here: a signed-out user
 * must be able to reach these pages. The proxy already bounces signed-in users
 * away from /admin/login.
 */
export const dynamic = "force-dynamic";

export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-sand px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
