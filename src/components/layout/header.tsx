"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, Menu, ShoppingBag, User, X } from "lucide-react";
import { Logo } from "./logo";
import { HeaderSearch } from "@/components/commerce/search-box";
import { CurrencyToggle } from "@/components/commerce/price";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { useApp } from "@/components/providers/app-provider";
import { categories } from "@/lib/data/categories";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { label: "Desert safaris", href: "/categories/desert-safari" },
  { label: "Attractions", href: "/categories/dubai-attractions" },
  { label: "Cruises & yachts", href: "/categories/cruises-yachts" },
  { label: "Theme parks", href: "/categories/theme-parks" },
  { label: "Combos", href: "/dubai-attraction-combos" },
  { label: "Luxury", href: "/categories/luxury-experiences" },
];

const SECONDARY_NAV = [
  { label: "Travelling this week", href: "/last-minute-dubai-activities" },
  { label: "With kids", href: "/collections/dubai-with-kids" },
  { label: "Honeymoon", href: "/collections/dubai-honeymoon" },
  { label: "Jain & pure veg", href: "/collections/jain-veg-friendly" },
  { label: "With parents", href: "/collections/senior-friendly" },
  { label: "Abu Dhabi", href: "/abu-dhabi-day-tours-from-dubai" },
];

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cart, wishlist, hydrated } = useApp();

  useEffect(() => setMenuOpen(false), [pathname]);

  const cartCount = hydrated ? cart.length : 0;
  const savedCount = hydrated ? wishlist.length : 0;

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>

      {/* Trust bar — the first thing a first-time visitor reads (PRD §5.1). */}
      <div className="border-b border-ink-200 bg-ink-900 text-white">
        <div className="container-page flex h-9 items-center justify-between gap-4 text-2xs sm:text-xs">
          {/* Short form on small screens: a truncated trust claim reads worse
              than a complete shorter one. */}
          <p className="truncate font-semibold">
            <span className="sm:hidden">All-in ₹ pricing · Human reply in 30 min</span>
            <span className="hidden sm:inline">
              All-in ₹ pricing · No hidden fees · Human reply in 30 minutes
            </span>
          </p>
          <div className="hidden shrink-0 items-center gap-4 sm:flex">
            <Link href="/support" className="hover:underline">
              Help
            </Link>
            <Link href="/manage-booking" className="hover:underline">
              Manage booking
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-ink-200 bg-sand/95 backdrop-blur supports-[backdrop-filter]:bg-sand/80">
        <div className="container-page">
          <div className="flex h-16 items-center gap-3 lg:gap-6">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-800 hover:bg-ink-100 lg:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>

            <Logo />

            <div className="hidden min-w-0 flex-1 lg:block">
              <HeaderSearch />
            </div>

            <div className="ml-auto flex items-center gap-1 lg:ml-0 lg:gap-2">
              <CurrencyToggle className="hidden sm:inline-flex" />

              <Link
                href="/account/saved"
                className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
                aria-label={`Saved activities${savedCount ? ` (${savedCount})` : ""}`}
              >
                <Heart className="h-5 w-5" />
                {savedCount > 0 && <Dot>{savedCount}</Dot>}
              </Link>

              <Link
                href="/cart"
                className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
                aria-label={`Your trip${cartCount ? ` (${cartCount} activities)` : ""}`}
              >
                <ShoppingBag className="h-5 w-5" />
                {cartCount > 0 && <Dot>{cartCount}</Dot>}
              </Link>

              <Link
                href="/account"
                className="hidden h-11 w-11 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100 sm:flex"
                aria-label="Your account"
              >
                <User className="h-5 w-5" />
              </Link>

              <WhatsAppButton
                size="sm"
                className="hidden xl:inline-flex"
                context={{ intent: "general", placement: "header" }}
                label="WhatsApp us"
              />
            </div>
          </div>

          {/* Mobile search sits under the bar so the tap target is full-width. */}
          <div className="pb-3 lg:hidden">
            <HeaderSearch />
          </div>

          <nav aria-label="Categories" className="hidden lg:block">
            <ul className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-2">
              {PRIMARY_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                      pathname === item.href
                        ? "bg-ink-900 text-white"
                        : "text-ink-700 hover:bg-ink-100",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li aria-hidden="true" className="mx-1 h-4 w-px bg-ink-200" />
              {SECONDARY_NAV.slice(0, 4).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
    </>
  );
}

function Dot({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sun-500 px-1 text-2xs font-bold tnum text-white">
      {children}
    </span>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[75] lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/45"
      />
      <div className="relative flex h-full w-[86%] max-w-sm flex-col bg-paper shadow-[var(--shadow-pop)]">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3.5">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close menu</span>
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-4 py-4">
          <p className="mb-2 text-2xs font-extrabold uppercase tracking-[0.12em] text-ink-400">
            Categories
          </p>
          <ul className="mb-6 space-y-0.5">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/categories/${c.slug}`}
                  className="flex items-center gap-3 rounded-xl px-2.5 py-3 text-[0.95rem] font-semibold text-ink-800 hover:bg-shell"
                >
                  <span aria-hidden="true" className="text-lg">
                    {c.emoji}
                  </span>
                  {c.shortName}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mb-2 text-2xs font-extrabold uppercase tracking-[0.12em] text-ink-400">
            Curated for you
          </p>
          <ul className="mb-6 space-y-0.5">
            {SECONDARY_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-xl px-2.5 py-3 text-[0.95rem] font-semibold text-ink-800 hover:bg-shell"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mb-2 text-2xs font-extrabold uppercase tracking-[0.12em] text-ink-400">
            Your bookings
          </p>
          <ul className="space-y-0.5">
            {[
              { label: "My trips", href: "/account/bookings" },
              { label: "Saved activities", href: "/account/saved" },
              { label: "Find a booking", href: "/manage-booking" },
              { label: "Help & support", href: "/support" },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-xl px-2.5 py-3 text-[0.95rem] font-semibold text-ink-800 hover:bg-shell"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-3 border-t border-ink-200 p-4">
          <CurrencyToggle />
          <WhatsAppButton block context={{ intent: "general", placement: "mobile_menu" }} />
        </div>
      </div>
    </div>
  );
}
