"use client";

import Link from "next/link";
import { Check, Minus, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { Scene } from "@/components/ui/scene";
import { Rating } from "@/components/ui/primitives";
import { activityBySlug } from "@/lib/data/activities";
import type { Activity } from "@/lib/types";
import { cn, formatDuration, priceIn } from "@/lib/utils";

/**
 * Compare tray + comparison table.
 *
 * PRD §3.2 stage 3: "This is where we win or lose. Our ADP must make the
 * comparison itself easy." Persona A opens three tabs and builds this table in
 * his head; we build it for him. It attacks the travel agent's opacity and the
 * OTA's flat listings at the same time.
 */

export type CompareColumn =
  | "price"
  | "duration"
  | "pickup"
  | "confirmation"
  | "cancellation"
  | "dietary"
  | "private";

const ROWS: { id: CompareColumn; label: string; render: (a: Activity, currency: "INR" | "AED") => React.ReactNode }[] =
  [
    {
      id: "price",
      label: "Price per adult (all-in)",
      render: (a, c) => (
        <span className="font-display text-lg font-bold tnum">{priceIn(a.price.adult, c)}</span>
      ),
    },
    {
      id: "duration",
      label: "Duration",
      render: (a) => formatDuration(a.durationMinutes),
    },
    {
      id: "pickup",
      label: "Hotel pickup",
      render: (a) =>
        a.pickupIncluded ? (
          <Yes>Included · {a.pickupZones.length} areas</Yes>
        ) : (
          <No>Meet at the venue</No>
        ),
    },
    {
      id: "confirmation",
      label: "Confirmation",
      render: (a) =>
        a.confirmation === "instant" ? <Yes>Instant</Yes> : <No>Operator confirms in 2h</No>,
    },
    {
      id: "cancellation",
      label: "Free cancellation",
      render: (a) =>
        a.freeCancellationHours > 0 ? (
          <Yes>Up to {a.freeCancellationHours}h before</Yes>
        ) : (
          <No>Non-refundable</No>
        ),
    },
    {
      id: "dietary",
      label: "Food options",
      render: (a) =>
        a.dietary.length ? (
          <span className="text-sm">
            {a.dietary.includes("jain") ? (
              <Yes>Jain &amp; pure veg</Yes>
            ) : a.dietary.includes("veg") ? (
              <Yes>Pure veg available</Yes>
            ) : (
              a.dietary.join(", ")
            )}
          </span>
        ) : (
          <No>No meals included</No>
        ),
    },
    {
      id: "private",
      label: "Private option",
      render: (a) =>
        a.isPrivate || a.variants.some((v) => v.isPrivate) ? (
          <Yes>Available</Yes>
        ) : (
          <No>Shared only</No>
        ),
    },
  ];

function Yes({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-success)]">
      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

function No({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-ink-500">
      <Minus className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

export function ComparisonTable({
  activities,
  columns,
  heading,
  subhead,
  onRemove,
  className,
}: {
  activities: Activity[];
  columns?: CompareColumn[];
  heading?: string;
  subhead?: string;
  onRemove?: (slug: string) => void;
  className?: string;
}) {
  const { currency } = useApp();
  const rows = columns ? ROWS.filter((r) => columns.includes(r.id)) : ROWS;

  if (!activities.length) return null;

  return (
    <section className={className} aria-labelledby="compare-heading">
      {heading && (
        <div className="mb-4">
          <h2 id="compare-heading" className="text-2xl">
            {heading}
          </h2>
          {subhead && <p className="mt-1 text-[0.95rem] text-ink-600">{subhead}</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-tile)] border border-ink-200 bg-paper">
        <table className="w-full min-w-[42rem] border-collapse text-left">
          <caption className="sr-only">
            Side-by-side comparison of {activities.map((a) => a.title).join(", ")}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-40 border-b border-ink-200 p-4 align-bottom">
                <span className="text-xs font-bold uppercase tracking-wide text-ink-400">
                  Compare
                </span>
              </th>
              {activities.map((a) => (
                <th key={a.slug} scope="col" className="border-b border-ink-200 p-4 align-bottom">
                  <div className="relative">
                    {onRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(a.slug)}
                        className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 text-ink-600 hover:bg-ink-200"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span className="sr-only">Remove {a.title} from comparison</span>
                      </button>
                    )}
                    <div className="mb-2 aspect-[16/10] w-full overflow-hidden rounded-xl">
                      <Scene src={a.images[0]} alt="" />
                    </div>
                    <Link
                      href={`/activities/${a.slug}`}
                      className="block text-sm font-bold leading-snug text-ink-900 hover:underline"
                    >
                      {a.title}
                    </Link>
                    <div className="mt-1">
                      <Rating value={a.rating} count={a.reviewCount} size="sm" />
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className={cn(i % 2 === 1 && "bg-shell/60")}>
                <th
                  scope="row"
                  className="p-4 align-top text-sm font-bold text-ink-700"
                >
                  {row.label}
                </th>
                {activities.map((a) => (
                  <td key={a.slug} className="p-4 align-top text-sm text-ink-700">
                    {row.render(a, currency)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="p-4" />
              {activities.map((a) => (
                <td key={a.slug} className="p-4">
                  <ButtonLink href={`/activities/${a.slug}`} size="sm" block>
                    {a.quoteOnly ? "Get a quote" : "View & book"}
                  </ButtonLink>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Floating tray that appears once two or more activities are selected. */
export function CompareTray() {
  const { compare, toggleCompare, clearCompare, hydrated } = useApp();
  if (!hydrated || compare.length === 0) return null;

  const items = compare.map(activityBySlug).filter((a): a is Activity => Boolean(a));

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-paper/97 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-sticky)] backdrop-blur">
      <div className="container-page flex items-center gap-3 px-0">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
          {items.map((a) => (
            <div
              key={a.slug}
              className="flex shrink-0 items-center gap-2 rounded-full border border-ink-200 bg-shell py-1 pl-1 pr-2"
            >
              <span className="h-8 w-8 overflow-hidden rounded-full">
                <Scene src={a.images[0]} alt="" />
              </span>
              <span className="max-w-[9rem] truncate text-xs font-semibold text-ink-800">
                {a.title}
              </span>
              <button
                type="button"
                onClick={() => toggleCompare(a.slug)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 hover:bg-ink-200"
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Remove {a.title}</span>
              </button>
            </div>
          ))}
          {compare.length < 3 && (
            <span className="shrink-0 text-xs text-ink-500">
              Add {3 - compare.length} more to compare
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={clearCompare} className="hidden sm:inline-flex">
          Clear
        </Button>
        <ButtonLink href="/compare" size="md" className="shrink-0">
          Compare {compare.length}
        </ButtonLink>
      </div>
    </div>
  );
}
