"use client";

import { useMemo, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { ReviewCard } from "./cards";
import { Rating } from "@/components/ui/primitives";
import { track } from "@/lib/analytics";
import type { Review } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Review display, filterable by traveller type (PRD §5.11).
 *
 * The filter is not decoration: a family booking a desert safari wants to read
 * other families, and "was the dietary requirement actually met" is a field we
 * collect and surface because it is the promise most likely to be broken.
 */
const TYPES = [
  { id: "all", label: "All reviews" },
  { id: "family", label: "Families" },
  { id: "couple", label: "Couples" },
  { id: "solo", label: "Solo" },
  { id: "friends", label: "Friends" },
] as const;

export function ReviewsSection({
  reviews,
  rating,
  count,
  className,
}: {
  reviews: Review[];
  rating: number;
  count: number;
  className?: string;
}) {
  const [filter, setFilter] = useState<string>("all");

  const filtered = useMemo(
    () => (filter === "all" ? reviews : reviews.filter((r) => r.travellerType === filter)),
    [reviews, filter],
  );

  const dietaryMet = reviews.filter((r) => r.dietaryMet).length;

  return (
    <section className={className} aria-labelledby="reviews-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="reviews-heading" className="text-2xl">
            Reviews from verified bookings
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Rating value={rating} size="lg" showCount={false} />
            <span className="text-sm text-ink-600">
              {count.toLocaleString("en-IN")} reviews · only customers who completed a booking can
              write one
            </span>
          </div>
        </div>
        {dietaryMet > 0 && (
          <p className="flex items-center gap-1.5 rounded-full bg-[var(--color-success-bg)] px-3 py-1.5 text-xs font-bold text-[var(--color-success)]">
            <BadgeCheck className="h-4 w-4" />
            {dietaryMet} of {reviews.length} confirmed their dietary request was met
          </p>
        )}
      </div>

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto" role="group" aria-label="Filter reviews">
        {TYPES.map((t) => {
          const n = t.id === "all" ? reviews.length : reviews.filter((r) => r.travellerType === t.id).length;
          if (n === 0 && t.id !== "all") return null;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={filter === t.id}
              onClick={() => {
                setFilter(t.id);
                track("filter_applied", { filters: `reviews:${t.id}`, result_count: n });
              }}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
                filter === t.id
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-300 bg-paper text-ink-700 hover:border-ink-900",
              )}
            >
              {t.label} <span className="tnum opacity-70">({n})</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-ink-300 p-6 text-center text-sm text-ink-600">
          No reviews from this traveller type yet. Showing all reviews is usually more useful —
          switch the filter back to see them.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </section>
  );
}
