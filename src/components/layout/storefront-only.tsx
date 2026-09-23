"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Renders its children everywhere except under /admin. Lets the root layout
 * keep rendering the storefront chrome for every route while the admin
 * console gets its own shell, without moving every storefront page into a
 * route group. Children stay Server Components — only the gate is client-side.
 */
export function StorefrontOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
