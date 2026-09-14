"use client";

import Link from "next/link";
import { Scale } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { ActivityCard } from "@/components/commerce/activity-card";
import { ComparisonTable } from "@/components/commerce/compare";
import { WhatsAppCard } from "@/components/commerce/whatsapp";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs, EmptyState } from "@/components/ui/primitives";
import { activities, activityBySlug } from "@/lib/data/activities";
import type { Activity } from "@/lib/types";

/**
 * COMPARISON EXPERIENCE (AC-SRCH-04)
 *
 * Persona A's step 3: three tabs open, building this table in his head. We
 * build it for him. Client-rendered because the selection lives in the visitor's
 * own session; it is deliberately `noindex` in the sitemap.
 */
export default function ComparePage() {
  const { compare, toggleCompare, clearCompare, hydrated } = useApp();
  const items = compare.map(activityBySlug).filter((a): a is Activity => Boolean(a));

  const suggestions = activities
    .filter((a) => !compare.includes(a.slug) && (a.tier === "B" || a.tier === "C"))
    .slice(0, 3);

  return (
    <div className="container-page py-6 pb-16">
      <Breadcrumbs items={[{ label: "Dubai", href: "/" }, { label: "Compare" }]} className="mb-3" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] sm:text-3xl">Compare experiences</h1>
          <p className="mt-1.5 text-[0.95rem] text-ink-600">
            The attributes that actually decide it — pickup, confirmation, cancellation and food —
            side by side.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearCompare}
            className="text-sm font-bold text-sun-700 underline underline-offset-2"
          >
            Clear comparison
          </button>
        )}
      </div>

      {!hydrated ? (
        <div className="skeleton h-96 w-full rounded-[var(--radius-tile)]" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Scale className="h-6 w-6" />}
          title="Nothing to compare yet"
          body="Tick Compare on any two or three activity cards in search or a category page, and they'll appear here side by side."
          action={<ButtonLink href="/search">Browse experiences</ButtonLink>}
          secondary={
            <ButtonLink href="/categories/desert-safari" variant="outline">
              Compare desert safaris
            </ButtonLink>
          }
        />
      ) : (
        <ComparisonTable activities={items} onRemove={toggleCompare} />
      )}

      {items.length > 0 && items.length < 3 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl">Add another to compare</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {suggestions.map((a, i) => (
              <ActivityCard
                key={a.slug}
                activity={a}
                layout="compact"
                position={i + 1}
                source="compare_suggestions"
                showCompare
              />
            ))}
          </div>
        </section>
      )}

      <WhatsAppCard
        className="mt-10"
        context={{
          intent: "activity",
          question:
            items.length > 0
              ? `I'm deciding between: ${items.map((i) => i.title).join(" / ")}`
              : undefined,
          placement: "compare",
        }}
        title="Still can't decide?"
        body="Send us your group — ages, dietary needs, how much walking is realistic — and we'll tell you which of these actually suits you, and why."
      />

      <p className="mt-8 text-sm text-ink-600">
        Looking for something specific?{" "}
        <Link href="/search" className="font-bold text-sun-700 underline underline-offset-2">
          Search all experiences
        </Link>
        .
      </p>
    </div>
  );
}
