"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", href: "/account" },
  { label: "My inquiries", href: "/account/inquiries" },
  { label: "My trips", href: "/account/bookings" },
  { label: "Saved", href: "/account/saved" },
  { label: "Profile", href: "/account/profile" },
];

/** Horizontal tab nav; the current section is underlined and announced. */
export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="mb-6 border-b border-ink-200">
      <ul className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
        {NAV.map((item) => {
          const current = item.href === "/account" ? pathname === "/account" : pathname?.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block min-h-11 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold transition-colors",
                  current
                    ? "border-ink-900 text-ink-900"
                    : "border-transparent text-ink-600 hover:border-ink-300 hover:text-ink-900",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
