"use client";

import { Info } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { SavingsBadge } from "@/components/ui/badge";
import type { Money, PriceBand } from "@/lib/types";
import { cn, priceIn, savingsPercent } from "@/lib/utils";

/**
 * Price presentation.
 *
 * The most load-bearing component in the product. PRD design principle 2:
 * "Price honesty is the product. No fee, tax, or surcharge may appear after the
 * first price shown. Ever." So every price rendered by this component is
 * all-in, and the "includes all taxes and fees" line is not optional garnish —
 * it is the differentiator against both the local agent and the global OTA.
 *
 * A struck-through comparison price renders only when `compareAt` exists on the
 * SKU, which the catalogue only sets where the higher price is genuinely
 * verifiable (a published gate or walk-up rate). No invented anchors.
 */

export function Price({
  money,
  className,
  size = "md",
}: {
  money: Money;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const { currency } = useApp();
  const sizes = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-[2rem] leading-none",
  }[size];
  return (
    <span className={cn("font-display font-bold tnum text-ink-900", sizes, className)}>
      {priceIn(money, currency)}
    </span>
  );
}

export function PriceBlock({
  band,
  perPerson = true,
  size = "lg",
  showTaxLine = true,
  compact,
  className,
}: {
  band: PriceBand;
  perPerson?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  showTaxLine?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { currency } = useApp();
  const percent = savingsPercent(band.adult, band.compareAt);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {!compact && <span className="text-xs font-semibold text-ink-500">from</span>}
        <Price money={band.adult} size={size} />
        {perPerson && <span className="text-sm font-medium text-ink-500">per adult</span>}
        {band.compareAt && percent && (
          <>
            <span className="text-sm text-ink-400 line-through tnum">
              {priceIn(band.compareAt, currency)}
            </span>
            <SavingsBadge percent={percent} size="sm" />
          </>
        )}
      </div>

      {showTaxLine && (
        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-success)]">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Includes all taxes and fees — nothing added at checkout
        </p>
      )}

      {!compact && (band.child || band.senior || band.infant) && (
        <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-600">
          {band.child && (
            <li className="tnum">
              Child (3–11): <strong className="font-bold">{priceIn(band.child, currency)}</strong>
            </li>
          )}
          {band.senior && band.senior.inr !== band.adult.inr && (
            <li className="tnum">
              Senior (60+): <strong className="font-bold">{priceIn(band.senior, currency)}</strong>
            </li>
          )}
          {band.infant && band.infant.inr === 0 && (
            <li>
              Infant (under 3): <strong className="font-bold">Free</strong>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Card-sized price: no tax line, no pax table — used inside activity cards. */
export function CardPrice({ band }: { band: PriceBand }) {
  const { currency } = useApp();
  const percent = savingsPercent(band.adult, band.compareAt);
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink-500">from</span>
      <span className="font-display text-xl font-bold tnum text-ink-900">
        {priceIn(band.adult, currency)}
      </span>
      {band.compareAt && percent && (
        <span className="text-xs text-ink-400 line-through tnum">
          {priceIn(band.compareAt, currency)}
        </span>
      )}
      <span className="w-full text-2xs font-medium text-ink-500">
        per adult · all-in{percent ? ` · save ${percent}%` : ""}
      </span>
    </div>
  );
}

/** "From ₹X — Request a quote" treatment for Tier D SKUs (AC-ADP-06). */
export function QuotePrice({ from }: { from: Money }) {
  const { currency } = useApp();
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs font-semibold text-ink-500">from</span>
        <span className="font-display text-2xl font-bold tnum text-ink-900">
          {priceIn(from, currency)}
        </span>
      </p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-600">
        Priced per booking, so the honest figure depends on your date, group and route. We send a
        firm all-in quote within two hours.
      </p>
    </div>
  );
}

export function CurrencyToggle({ className }: { className?: string }) {
  const { currency, setCurrency } = useApp();
  return (
    <div
      className={cn("inline-flex rounded-full border border-ink-200 bg-paper p-0.5", className)}
      role="group"
      aria-label="Display currency"
    >
      {(["INR", "AED"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCurrency(c)}
          aria-pressed={currency === c}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
            currency === c ? "bg-ink-900 text-white" : "text-ink-600 hover:text-ink-900",
          )}
        >
          {c === "INR" ? "₹ INR" : "AED"}
        </button>
      ))}
    </div>
  );
}
