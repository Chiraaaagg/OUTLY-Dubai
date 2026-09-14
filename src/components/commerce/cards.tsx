import Link from "next/link";
import { ArrowRight, BadgeCheck, CheckCircle2, Quote, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, Rating } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import type { Category, Collection, Combo, Review } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Category card — grid entry point. Emoji + scene keeps the grid scannable at
 * a glance on a 360px screen, where eight text links would not be.
 * ------------------------------------------------------------------------ */

export function CategoryCard({
  category,
  count,
  className,
}: {
  category: Category;
  count?: number;
  className?: string;
}) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className={cn(
        "group relative flex flex-col justify-end overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-paper shadow-[var(--shadow-soft)] transition-transform duration-200 ease-[var(--ease-out-soft)] [@media(hover:hover)]:hover:-translate-y-0.5",
        className,
      )}
    >
      <div className="absolute inset-0">
        <Scene
          src={category.heroImage}
          alt=""
          scrim
          className="transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105"
        />
      </div>
      <div className="relative p-4 pt-16 text-white">
        <span aria-hidden="true" className="mb-1 block text-2xl">
          {category.emoji}
        </span>
        <h3 className="text-[1.05rem] leading-tight text-white">{category.shortName}</h3>
        <p className="mt-0.5 text-xs text-white/80">
          {count != null ? `${count} experiences · ` : ""}
          {category.tagline}
        </p>
      </div>
    </Link>
  );
}

/* ---------------------------------------------------------------------------
 * Combo card — Tier C, the take-rate lever. The separate-purchase price is
 * always shown next to the bundle price so the saving is verifiable.
 * ------------------------------------------------------------------------ */

export function ComboCard({
  combo,
  className,
  layout = "grid",
}: {
  combo: Combo;
  className?: string;
  layout?: "grid" | "rail";
}) {
  const saving = combo.separatePrice.inr - combo.bundlePrice.inr;
  return (
    <Card
      as="article"
      className={cn(
        "group flex h-full flex-col overflow-hidden transition-transform duration-200 [@media(hover:hover)]:hover:-translate-y-0.5",
        layout === "rail" && "w-[20rem] sm:w-[22rem]",
        className,
      )}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <Scene src={combo.heroImage} alt="" scrim />
        <div className="absolute left-3 top-3">
          <Badge tone="deal">Save ₹{saving.toLocaleString("en-IN")} per adult</Badge>
        </div>
        <div className="absolute inset-x-3 bottom-3 text-white">
          <p className="text-2xs font-extrabold uppercase tracking-[0.12em] text-dune-200">
            {combo.includedSlugs.length}-activity package
          </p>
          <h3 className="mt-0.5 line-clamp-2 text-[1.05rem] leading-tight text-white">
            {combo.name}
          </h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm leading-snug text-ink-600">{combo.tagline}</p>

        <ul className="space-y-1.5 text-sm text-ink-700">
          {combo.highlights.slice(0, 2).map((h) => (
            <li key={h} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" aria-hidden="true" />
              <span className="leading-snug">{h}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-ink-200 pt-3">
          <div>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-xl font-bold tnum text-ink-900">
                ₹{combo.bundlePrice.inr.toLocaleString("en-IN")}
              </span>
              <span className="text-sm text-ink-400 line-through tnum">
                ₹{combo.separatePrice.inr.toLocaleString("en-IN")}
              </span>
            </p>
            <p className="text-2xs text-ink-500">per adult, all-in · {combo.durationLabel}</p>
          </div>
          <Link
            href={`/combos/${combo.slug}`}
            className="shrink-0 rounded-[var(--radius-control)] bg-sun-500 px-3.5 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_var(--color-sun-700)] transition-colors hover:bg-sun-600"
          >
            See package
          </Link>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Collection card — editorial entry point
 * ------------------------------------------------------------------------ */

export function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link
      href={`/collections/${collection.slug}`}
      className="group relative flex min-h-[13rem] flex-col justify-end overflow-hidden rounded-[var(--radius-tile)] border border-ink-200"
    >
      <div className="absolute inset-0">
        <Scene
          src={collection.heroImage}
          alt=""
          scrim
          className="transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105"
        />
      </div>
      <div className="relative p-5 text-white">
        <p className="text-2xs font-extrabold uppercase tracking-[0.12em] text-dune-200">
          {collection.audience}
        </p>
        <h3 className="mt-1 text-xl text-white">{collection.name}</h3>
        <p className="mt-1 max-w-sm text-sm text-white/80">{collection.tagline}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-white">
          {collection.activitySlugs.length} hand-picked
          <ArrowRight className="h-4 w-4 transition-transform [@media(hover:hover)]:group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

/* ---------------------------------------------------------------------------
 * Review card — verified bookings only
 * ------------------------------------------------------------------------ */

export function ReviewCard({
  review,
  layout = "grid",
  showActivity,
}: {
  review: Review;
  layout?: "grid" | "rail";
  showActivity?: boolean;
}) {
  return (
    <Card
      as="article"
      className={cn(
        "flex h-full flex-col gap-3 p-5",
        layout === "rail" && "w-[19rem] sm:w-[21rem]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sun-100 font-display font-bold text-sun-700"
          >
            {review.author.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-900">{review.author}</p>
            <p className="truncate text-xs text-ink-500">
              {review.city} · {review.travellerType}
            </p>
          </div>
        </div>
        <Rating value={review.rating} showCount={false} size="sm" />
      </div>

      <div>
        <h3 className="text-[0.95rem] leading-snug text-ink-900">{review.title}</h3>
        <p className="mt-1.5 line-clamp-5 text-sm leading-relaxed text-ink-600">
          <Quote className="mr-1 inline h-3.5 w-3.5 -translate-y-0.5 text-ink-300" aria-hidden="true" />
          {review.body}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <span className="inline-flex items-center gap-1 text-2xs font-bold text-[var(--color-success)]">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Verified booking
        </span>
        {review.dietaryMet && (
          <span className="text-2xs font-semibold text-ink-500">· Dietary request met</span>
        )}
        {showActivity && (
          <Link
            href={`/activities/${review.activitySlug}`}
            className="w-full text-xs font-bold text-sun-700 underline underline-offset-2"
          >
            {review.activitySlug.replace(/-/g, " ")}
          </Link>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Small utility card used across landing pages
 * ------------------------------------------------------------------------ */

export function BenefitCard({
  title,
  detail,
  icon,
}: {
  title: string;
  detail: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 bg-paper p-4">
      <span
        aria-hidden="true"
        className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-sun-100 text-sun-600"
      >
        {icon ?? <Users className="h-4.5 w-4.5" />}
      </span>
      <h3 className="text-[0.95rem] leading-snug text-ink-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-600">{detail}</p>
    </div>
  );
}
