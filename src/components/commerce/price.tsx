import { Info } from "lucide-react";
import { SavingsBadge } from "@/components/ui/badge";
import { allDisplays, type DisplayCurrency } from "@/lib/currency";
import type { Money, PriceBand } from "@/lib/types";
import { cn, savingsPercent } from "@/lib/utils";

/**
 * Price presentation.
 *
 * The most load-bearing component in the product. PRD design principle 2:
 * "Price honesty is the product. No fee, tax, or surcharge may appear after the
 * first price shown. Ever." So every price rendered by this component is
 * all-in, and the "includes all taxes and fees" line is not optional garnish —
 * it is the differentiator against both the local agent and the global OTA.
 *
 * ## Why every price renders three times
 *
 * These pages are statically prerendered (`revalidate = 60`), so the server
 * has no visitor to render for. Reading the currency from React state instead
 * would mean the HTML ships one currency and JavaScript swaps it after
 * hydration — a visible flash and a layout shift on the single most important
 * number on the page.
 *
 * So `Money` is rendered in all three currencies and CSS shows one, keyed off
 * `data-ccy` on `<html>` which is set before the first paint. That makes these
 * plain Server Components: no `useApp()`, no client bundle, no hydration cost,
 * and the price is correct in the very first byte. The extra markup is about
 * 30 bytes per price before compression.
 *
 * A struck-through comparison price renders only when `compareAt` exists on the
 * SKU, which the catalogue only sets where the higher price is genuinely
 * verifiable (a published gate or walk-up rate). No invented anchors.
 */

const CLASS_FOR: Record<DisplayCurrency, string> = {
  INR: "ccy-v ccy-inr",
  AED: "ccy-v ccy-aed",
  USD: "ccy-v ccy-usd",
};

/**
 * One amount, in every currency, with CSS deciding which is visible.
 * `tnum` keeps the digits monospaced so swapping currency cannot reflow a row.
 */
export function Amount({ money, className }: { money: Money; className?: string }) {
  const shown = allDisplays(money);
  return (
    <span className={cn("ccy tnum", className)}>
      <span className={CLASS_FOR.INR}>{shown.INR}</span>
      <span className={CLASS_FOR.AED}>{shown.AED}</span>
      <span className={CLASS_FOR.USD}>{shown.USD}</span>
    </span>
  );
}

export function Price({
  money,
  className,
  size = "md",
}: {
  money: Money;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-[2rem] leading-none",
  }[size];
  return <Amount money={money} className={cn("font-display font-bold text-ink-900", sizes, className)} />;
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
  const percent = savingsPercent(band.adult, band.compareAt);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {!compact && <span className="text-xs font-semibold text-ink-500">from</span>}
        <Price money={band.adult} size={size} />
        {perPerson && <span className="text-sm font-medium text-ink-500">per adult</span>}
        {band.compareAt && percent && (
          <>
            <Amount money={band.compareAt} className="text-sm text-ink-400 line-through" />
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
            <li>
              Child (3–11): <Amount money={band.child} className="font-bold" />
            </li>
          )}
          {band.senior && band.senior.inr !== band.adult.inr && (
            <li>
              Senior (60+): <Amount money={band.senior} className="font-bold" />
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
  const percent = savingsPercent(band.adult, band.compareAt);
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink-500">from</span>
      <Amount money={band.adult} className="font-display text-xl font-bold text-ink-900" />
      {band.compareAt && percent && <Amount money={band.compareAt} className="text-xs text-ink-400 line-through" />}
      <span className="w-full text-2xs font-medium text-ink-500">
        per adult · all-in{percent ? ` · save ${percent}%` : ""}
      </span>
    </div>
  );
}

/** "From ₹X — Request a quote" treatment for Tier D SKUs (AC-ADP-06). */
export function QuotePrice({ from }: { from: Money }) {
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs font-semibold text-ink-500">from</span>
        <Amount money={from} className="font-display text-2xl font-bold text-ink-900" />
      </p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-600">
        Priced per booking, so the honest figure depends on your date, group and route. We send a
        firm all-in quote within two hours.
      </p>
    </div>
  );
}

export { CurrencyToggle } from "./currency-toggle";
