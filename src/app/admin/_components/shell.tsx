"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, FolderTree, Inbox, LayoutDashboard, ListTree, LogOut, Menu, Package, ScrollText, Settings, Upload, Users, X } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

/**
 * Admin console shell: left rail on desktop, top bar with a disclosure menu on
 * mobile. Receives only plain data from the server layout (display name, role
 * label, permission names as strings) — never session material.
 *
 * Nav items are hidden when the user lacks the permission; every page enforces
 * the same permission server-side (`_lib/guard.ts`). The sidebar-plus-mobile-
 * disclosure layout is the conventional admin shape, built on OUTLYY tokens
 * (sand ground, paper rail, sun accent, 44px targets); nothing was copied
 * from an external pattern library.
 */

export interface ShellUser {
  displayName: string;
  email: string;
  /** Human role label, e.g. "Administrator". */
  roleLabel: string;
  permissions: string[];
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof Inbox;
  /** Required permission; undefined = everyone signed in. */
  permission?: string;
  /** Match only the exact path (for `/admin`). */
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin/inquiries", label: "Inquiries", icon: Inbox },
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users, permission: "users.manage" },
  { href: "/admin/settings", label: "Settings", icon: Settings, permission: "settings.edit" },
  { href: "/admin/audit", label: "Audit", icon: ScrollText, permission: "audit.view" },
  { href: "/admin/activities", label: "Activities", icon: ListTree, permission: "products.edit" },
  { href: "/admin/categories", label: "Categories", icon: FolderTree, permission: "products.edit" },
  { href: "/admin/imports", label: "Imports", icon: Upload, permission: "imports.run" },
  { href: "/admin/products", label: "Fulfilment", icon: Package, permission: "products.edit" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, permission: "analytics.view" },
];

function visibleNav(permissions: string[]) {
  const set = new Set(permissions);
  return NAV.filter((n) => !n.permission || set.has("*") || set.has(n.permission));
}

export function AdminShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = visibleNav(user.permissions);

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));

  const navLinks = (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2.5 rounded-[var(--radius-control)] px-3 text-[0.95rem] font-semibold transition-colors",
                active ? "bg-sun-50 text-sun-700" : "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
              )}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const userBlock = (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-ink-200 bg-shell/60 p-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-ink-900">{user.displayName}</p>
        <p className="truncate text-xs text-ink-600">{user.roleLabel}</p>
      </div>
      <SignOutButton />
    </div>
  );

  return (
    <div className="min-h-dvh bg-sand text-ink-900 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Desktop rail */}
      <aside className="hidden border-r border-ink-200 bg-paper lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-4 lg:p-4">
        <div className="flex items-center gap-2 px-1">
          <Logo />
          <span className="rounded-full bg-ink-900 px-2 py-0.5 text-2xs font-extrabold uppercase tracking-wider text-dune-200">Admin</span>
        </div>
        <nav aria-label="Admin" className="flex-1">
          {navLinks}
        </nav>
        {userBlock}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-paper lg:hidden">
        <div className="flex min-h-14 items-center justify-between gap-2 px-3">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="rounded-full bg-ink-900 px-2 py-0.5 text-2xs font-extrabold uppercase tracking-wider text-dune-200">Admin</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="admin-mobile-nav"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-ink-800 hover:bg-ink-100"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
        {open && (
          <nav id="admin-mobile-nav" aria-label="Admin" className="space-y-3 border-t border-ink-200 p-3">
            {navLinks}
            {userBlock}
          </nav>
        )}
      </header>

      <div className="min-w-0">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</div>
      </div>
    </div>
  );
}

/** POSTs the logout route (which revokes the DB session and clears cookies), then leaves. */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" } });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  };
  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-ink-700 hover:bg-ink-100 disabled:opacity-60", className)}
    >
      <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
      <span className="sr-only">Sign out</span>
    </button>
  );
}
