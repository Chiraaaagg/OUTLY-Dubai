"use client";

import Link from "next/link";
import { Clock, Heart, MapPin, Plus, Users } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import {
  BestsellerBadge,
  EditorPickBadge,
  FreeCancellationBadge,
  InstantBadge,
  PrivateBadge,
  SellingFastBadge,
  SeniorFriendlyBadge,
  VegBadge,
} from "@/components/ui/badge";
import { Scene } from "@/components/ui/scene";
import { Rating } from "@/components/ui/primitives";
import { CardPrice } from "./price";
import { WhatsAppButton } from "./whatsapp";
import { track } from "@/lib/analytics";
import { ctaFor } from "@/lib/cta";
import { toCartItem } from "@/lib/pricing";
import type { CardActivity } from "@/lib/catalog/card";
import { addDays, cn, EMPTY_PAX, formatDuration, toDateKey } from "@/lib/utils";

/**
 * ActivityCard — used on the homepage rails, category grids, search results,
 * SEO landing pages, recommendation carousels, cross-sells and account pages.
 *
 * Card anatomy adapted from the 21st.dev "Product Card" pattern
 * (21st.dev/@educalvolpz/components/product-card), with three deliberate
 * departures for this product:
 *
 *  1. No hover-only affordances. That pattern reveals the wishlist button on
 *     hover; on the 80%+ mobile traffic this product expects, hover does not
 *     exist. Ours is always visible and 44px.
 *  2. Motion is CSS, not motion/react. A spring library is not worth its bytes
 *     against an LCP < 2.5s budget on mid-range Android (PRD §15).
 *  3. Trust attributes outrank aesthetics. Instant confirmation, free
 *     cancellation, pickup and dietary options are on the card because they are
 *     what decides the click for this audience — not a nicety below the fold.
 *
 * Inquiry Mode (pivot §2.1, §4.2): the card's primary action is "View details"
 * and a secondary "Add to inquiry" appears on search/category surfaces. The
 * instant-confirmation badge renders only for SKUs whose fulfilmentMode is
 * "instant" — it would be false on everything else.
 */

type Layout = "grid" | "rail" | "compact" | "row";

export function ActivityCard({
  activity,
  layout = "grid",
  position,
  source,
  showCompare,
  showWhatsApp,
  showInquiry,
  className,
  unavailable,
  unavailableReason,
}: {
  activity: CardActivity;
  layout?: Layout;
  position?: number;
  /** Where the card was rendered — flows into analytics as `source`. */
  source?: string;
  showCompare?: boolean;
  showWhatsApp?: boolean;
  /** Secondary "Add to inquiry" action — the card-level inquiry capture. */
  showInquiry?: boolean;
  className?: string;
  unavailable?: boolean;
  unavailableReason?: string;
}) {
  const { isSaved, toggleWishlist, compare, toggleCompare, addToCart, cart, toast } = useApp();
  const saved = isSaved(activity.slug);
  const inCompare = compare.includes(activity.slug);
  const inCart = cart.some((i) => i.slug === activity.slug);
  const href = `/activities/${activity.slug}`;
  const cta = ctaFor(activity.fulfilmentMode, { quoteOnly: activity.quoteOnly });
  const isInstant = activity.fulfilmentMode === "instant";

  /** One-tap inquiry capture with sensible defaults; details refine on /inquiry. */
  const addToInquiry = () => {
    const item = toCartItem(activity, {
      date: addDays(toDateKey(new Date()), 1),
      time: activity.timeSlots[0] ?? "Flexible",
      pax: EMPTY_PAX,
    });
    addToCart(item);
    track("inquiry_item_added", {
      activity_slug: activity.slug,
      tier: activity.tier,
      value: item.total.inr,
      currency: "INR",
      page_type: source,
      fulfilment_mode: activity.fulfilmentMode,
    });
    toast({
      tone: "success",
      title: "Added to your inquiry",
      body: "Dates and guests can be set on the next step.",
      action: { label: "Check availability & price", href: "/inquiry" },
    });
  };

  const onOpen = () => {
    track("activity_card_viewed", {
      activity_slug: activity.slug,
      activity_category: activity.categorySlug,
      tier: activity.tier,
      price: activity.price.adult.inr,
      position,
      traffic_source: source,
    });
  };

  if (layout === "row") {
    return (
      <article
        className={cn(
          "flex gap-3.5 rounded-[var(--radius-card)] border border-ink-200 bg-paper p-3",
          className,
        )}
      >
        <Link
          href={href}
          onClick={onOpen}
          className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl sm:w-28"
        >
          <Scene src={activity.images[0]} alt={activity.imageAlt} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={href} onClick={onOpen} className="block">
            <h3 className="line-clamp-2 text-[0.95rem] font-bold leading-snug text-ink-900">
              {activity.title}
            </h3>
          </Link>
          <div className="mt-2">
            <CardPrice band={activity.price} />
          </div>
        </div>
      </article>
    );
  }

  const compactCard = layout === "compact";

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-paper shadow-[var(--shadow-soft)] transition-[box-shadow,transform] duration-200 ease-[var(--ease-out-soft)]",
        "[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[var(--shadow-lift)]",
        layout === "rail" && "w-[17rem] sm:w-[19rem]",
        unavailable && "opacity-70",
        className,
      )}
    >
      <div className={cn("relative overflow-hidden", compactCard ? "aspect-[16/9]" : "aspect-[4/3]")}>
        <Link href={href} onClick={onOpen} tabIndex={-1} aria-hidden="true" className="block h-full">
          <Scene
            src={activity.images[0]}
            alt={activity.imageAlt}
            className="transition-transform duration-500 ease-[var(--ease-out-soft)] [@media(hover:hover)]:group-hover:scale-[1.04]"
          />
        </Link>

        {/* Merchandising badges — top-left, max two, truth-derived only. */}
        <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {activity.badges.bestseller && <BestsellerBadge size="sm" />}
          {!activity.badges.bestseller && activity.badges.editorPick && <EditorPickBadge size="sm" />}
          {activity.badges.sellingFast && <SellingFastBadge size="sm" />}
        </div>

        {/* Wishlist: always visible, 44px target. Never hover-gated. */}
        <button
          type="button"
          onClick={() => toggleWishlist(activity.slug)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${activity.title} from saved` : `Save ${activity.title}`}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-paper/85 text-ink-700 backdrop-blur-sm transition-colors hover:bg-paper hover:text-sunset-500"
        >
          <Heart className={cn("h-5 w-5", saved && "fill-sunset-500 text-sunset-500")} />
        </button>

        {unavailable && (
          <div className="absolute inset-0 flex items-end bg-ink-900/45 p-3">
            <p className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-ink-900">
              {unavailableReason ?? "Sold out on your dates"}
            </p>
          </div>
        )}
      </div>

      <div className={cn("flex flex-1 flex-col gap-2.5", compactCard ? "p-3.5" : "p-4")}>
        <span className="text-2xs font-extrabold uppercase tracking-[0.1em] text-sun-600">
          {activity.categorySlug.replace(/-/g, " ")}
        </span>

        <Link href={href} onClick={onOpen} className="rounded">
          <h3
            className={cn(
              "font-display font-bold leading-snug text-ink-900",
              compactCard ? "line-clamp-2 text-[0.95rem]" : "line-clamp-2 text-[1.05rem]",
            )}
          >
            {activity.title}
          </h3>
        </Link>

        {!compactCard && (
          <p className="line-clamp-2 text-sm leading-snug text-ink-600">{activity.subtitle}</p>
        )}

        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600">
          <li className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
            {formatDuration(activity.durationMinutes)}
          </li>
          <li className="flex min-w-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
            <span className="truncate">
              {activity.pickupIncluded ? "Hotel pickup included" : activity.location.split("·")[0].trim()}
            </span>
          </li>
        </ul>

        <div className="flex flex-wrap gap-1.5">
          {isInstant && <InstantBadge size="sm" />}
          {!compactCard && <FreeCancellationBadge hours={activity.freeCancellationHours} size="sm" />}
          {!compactCard && activity.dietary.includes("jain") && (
            <VegBadge jain size="sm" />
          )}
          {!compactCard && activity.suitability.includes("seniors") && !activity.dietary.includes("jain") && (
            <SeniorFriendlyBadge size="sm" />
          )}
          {!compactCard && activity.isPrivate && <PrivateBadge size="sm" />}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          <CardPrice band={activity.price} />
          <Link
            href={href}
            onClick={onOpen}
            className="shrink-0 rounded-[var(--radius-control)] bg-sun-500 px-3.5 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_var(--color-sun-700)] transition-colors hover:bg-sun-600"
          >
            {cta.cardAction}
          </Link>
        </div>

        {(showCompare || showWhatsApp || showInquiry) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 pt-2.5">
            {showInquiry && !activity.quoteOnly && !isInstant && (
              <button
                type="button"
                onClick={addToInquiry}
                disabled={inCart}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-ink-300 px-3 text-xs font-bold text-ink-800 transition-colors hover:border-ink-900 disabled:cursor-default disabled:border-[var(--color-success)] disabled:text-[var(--color-success)]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {inCart ? "In your inquiry" : "Add to inquiry"}
              </button>
            )}
            {showCompare && (
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-600">
                <input
                  type="checkbox"
                  checked={inCompare}
                  onChange={() => toggleCompare(activity.slug)}
                  className="h-4 w-4 rounded border-ink-300 accent-ink-900"
                />
                Compare
              </label>
            )}
            {showWhatsApp && (
              <WhatsAppButton
                size="sm"
                variant="ghost"
                label="Ask about this"
                className="text-xs"
                context={{
                  intent: "activity",
                  activityTitle: activity.title,
                  activityUrl: `https://outlyy.com${href}`,
                  placement: source ?? "activity_card",
                }}
              />
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Sold-out / unavailable variant used by search when a date filter excludes a SKU. */
export function UnavailableActivityCard({
  activity,
  reason,
  nextDates,
}: {
  activity: CardActivity;
  reason: string;
  nextDates?: string[];
}) {
  return (
    <div className="relative">
      <ActivityCard activity={activity} unavailable unavailableReason={reason} />
      {nextDates?.length ? (
        <p className="mt-2 text-xs text-ink-600">
          Next available:{" "}
          <Link
            href={`/activities/${activity.slug}?date=${nextDates[0]}`}
            className="font-bold text-sun-700 underline underline-offset-2"
          >
            {nextDates.slice(0, 3).join(" · ")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
