"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Quick-intent chips (AC-HP-02): tapping one lands on a filtered search page
 * with that facet already applied, so a user with no date in mind still gets
 * to a shortlist in one tap.
 */
export interface Chip {
  label: string;
  href: string;
  emoji?: string;
}

export const HOME_CHIPS: Chip[] = [
  { label: "Travelling this week", href: "/search?when=tomorrow", emoji: "⚡" },
  { label: "Desert safari", href: "/categories/desert-safari", emoji: "🐪" },
  { label: "With kids", href: "/search?suitability=kids", emoji: "👨‍👩‍👧" },
  { label: "Veg & Jain", href: "/search?dietary=jain", emoji: "🌿" },
  { label: "Honeymoon", href: "/collections/dubai-honeymoon", emoji: "💛" },
  { label: "Under ₹3,000", href: "/search?maxPrice=3000", emoji: "🏷️" },
  { label: "Hotel pickup", href: "/search?pickup=1", emoji: "🚐" },
];

export function QuickChips({
  chips = HOME_CHIPS,
  className,
  source = "homepage_hero",
}: {
  chips?: Chip[];
  className?: string;
  source?: string;
}) {
  return (
    <ul className={cn("rail", className)} aria-label="Quick filters">
      {chips.map((chip) => (
        <li key={chip.href} className="rail-item">
          <Link
            href={chip.href}
            onClick={() =>
              track("filter_applied", { filters: chip.label, page_type: source })
            }
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink-300 bg-paper px-3.5 py-2 text-sm font-semibold text-ink-800 shadow-[var(--shadow-soft)] transition-colors hover:border-ink-900 hover:bg-white"
          >
            {chip.emoji && <span aria-hidden="true">{chip.emoji}</span>}
            {chip.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
