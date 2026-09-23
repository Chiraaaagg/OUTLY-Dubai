"use client";

import { useApp } from "@/components/providers/app-provider";
import { CURRENCY_LABELS, DISPLAY_CURRENCIES } from "@/lib/currency";
import { cn } from "@/lib/utils";

/**
 * Manual currency override.
 *
 * Geo picks the default; this exists because geo is a guess — an Indian
 * traveller already in Dubai, an expat paying from a UK card, anyone on a VPN.
 * The choice is written to `outlyy_ccy` and wins over geo from then on,
 * because the middleware only stamps the cookie when it is missing.
 *
 * Symbols only. A flag is a country, not a currency: most people paying in
 * dollars are not American, and the dirham's flag would be wrong for the
 * Indian expat it mostly serves. No emoji flags, no banknotes.
 */
export function CurrencyToggle({ className }: { className?: string }) {
  const { currency, setCurrency } = useApp();
  return (
    <div
      className={cn("inline-flex rounded-full border border-ink-200 bg-paper p-0.5", className)}
      role="group"
      aria-label="Display currency"
    >
      {DISPLAY_CURRENCIES.map((c) => (
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
          {CURRENCY_LABELS[c]}
        </button>
      ))}
    </div>
  );
}
