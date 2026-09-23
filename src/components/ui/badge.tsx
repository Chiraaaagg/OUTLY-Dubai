import type { ReactNode } from "react";
import {
  BadgeCheck,
  CalendarX2,
  Flame,
  Gauge,
  HeartHandshake,
  Leaf,
  ShieldCheck,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Badge system.
 *
 * Colour is meaning, not decoration:
 *   trust   (lagoon)  — instant confirmation, free cancellation, verified
 *   deal    (sunset)  — savings, discounts, price drops
 *   heat    (sun)     — bestseller, selling fast. Truthful only.
 *   diet    (green)   — veg / Jain / halal
 *   neutral (ink)     — category, duration, factual attributes
 *   warn    (amber)   — limited availability, cutoffs
 *
 * Nothing in this file may be rendered from an invented number. Every "selling
 * fast" or "limited" badge is derived from real supplier availability.
 */

type Tone = "trust" | "deal" | "heat" | "diet" | "neutral" | "warn" | "premium";

const TONES: Record<Tone, string> = {
  trust: "bg-lagoon-50 text-lagoon-700 border-lagoon-200",
  deal: "bg-sunset-50 text-sunset-600 border-sunset-200",
  heat: "bg-sun-50 text-sun-700 border-sun-200",
  diet: "bg-[var(--color-success-bg)] text-[var(--color-success)] border-[color-mix(in_oklab,var(--color-success)_28%,white)]",
  neutral: "bg-ink-100 text-ink-700 border-ink-200",
  warn: "bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[color-mix(in_oklab,var(--color-warning)_28%,white)]",
  premium: "bg-ink-900 text-dune-200 border-ink-900",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
  size = "md",
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-2xs" : "px-2.5 py-1 text-xs",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const ICON = "h-3.5 w-3.5 shrink-0";

export const InstantBadge = ({ size }: { size?: "sm" | "md" }) => (
  <Badge tone="trust" size={size} icon={<Zap className={ICON} />}>
    Instant confirmation
  </Badge>
);

export const FreeCancellationBadge = ({
  hours,
  size,
}: {
  hours: number;
  size?: "sm" | "md";
}) =>
  hours > 0 ? (
    <Badge tone="trust" size={size} icon={<CalendarX2 className={ICON} />}>
      Free cancellation · {hours}h
    </Badge>
  ) : (
    <Badge tone="warn" size={size} icon={<CalendarX2 className={ICON} />}>
      Non-refundable
    </Badge>
  );

export const BestsellerBadge = ({ size }: { size?: "sm" | "md" }) => (
  <Badge tone="heat" size={size} icon={<Flame className={ICON} />}>
    Bestseller
  </Badge>
);

/** Demand signal derived from bookings, not an inventory claim — inquiry mode
    cannot assert availability, so this never says "spots left" (pivot §3.7). */
export const SellingFastBadge = ({ size }: { size?: "sm" | "md" }) => (
  <Badge tone="warn" size={size} icon={<Timer className={ICON} />}>
    In demand
  </Badge>
);

/** Inquiry-mode counterpart to InstantBadge: the confirm-first promise. */
export const ConfirmFirstBadge = ({ size }: { size?: "sm" | "md" }) => (
  <Badge tone="trust" size={size} icon={<ShieldCheck className={ICON} />}>
    Confirmed before you pay
  </Badge>
);

export const EditorPickBadge = ({ size }: { size?: "sm" | "md" }) => (
  <Badge tone="premium" size={size} icon={<Sparkles className={ICON} />}>
    OUTLYY pick
  </Badge>
);

export const VegBadge = ({ jain, size }: { jain?: boolean; size?: "sm" | "md" }) => (
  <Badge tone="diet" size={size} icon={<Leaf className={ICON} />}>
    {jain ? "Jain & pure veg" : "Pure veg available"}
  </Badge>
);

export const VerifiedSupplierBadge = ({ size }: { size?: "sm" | "md" }) => (
  <Badge tone="trust" size={size} icon={<ShieldCheck className={ICON} />}>
    Verified supplier
  </Badge>
);

export const SeniorFriendlyBadge = ({ size }: { size?: "sm" | "md" }) => (
  <Badge tone="diet" size={size} icon={<HeartHandshake className={ICON} />}>
    Senior-friendly
  </Badge>
);

export const PrivateBadge = ({ size }: { size?: "sm" | "md" }) => (
  <Badge tone="premium" size={size} icon={<BadgeCheck className={ICON} />}>
    Private
  </Badge>
);

export const SavingsBadge = ({
  percent,
  size,
  className,
}: {
  percent: number;
  size?: "sm" | "md";
  className?: string;
}) => (
  <Badge tone="deal" size={size} className={className} icon={<Gauge className={ICON} />}>
    Save {percent}%
  </Badge>
);

/** Playful hard-edged sticker. Decorative accent only — never the only signal. */
export function Sticker({
  children,
  className,
  tone = "sun",
}: {
  children: ReactNode;
  className?: string;
  tone?: "sun" | "lagoon" | "sunset" | "dune";
}) {
  const bg = {
    sun: "bg-sun-400",
    lagoon: "bg-lagoon-300",
    sunset: "bg-sunset-300",
    dune: "bg-dune-300",
  }[tone];
  return (
    <span
      className={cn(
        "sticker rounded-full px-3 py-1 text-2xs font-extrabold uppercase tracking-wide text-ink-900",
        bg,
        className,
      )}
    >
      {children}
    </span>
  );
}
