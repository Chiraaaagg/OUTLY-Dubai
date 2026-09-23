import type { InquiryStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/server/domain/inquiry-state";
import { StatusPill as BasePill, type PillTone } from "@/app/admin/_components/ui";
import { AgentFrame } from "@/components/ui/brand";
import { cn } from "@/lib/utils";

/**
 * Inquiry-status pill built on the Admin agent's generic `StatusPill`
 * (`_components/ui.tsx`). Colour is meaning: accent/warning mean "the clock is
 * running on us", info means "we have replied", success means money moved,
 * neutral/danger mean closed.
 */
const TONES: Record<InquiryStatus, PillTone> = {
  new: "accent",
  assigned: "warning",
  contacted: "info",
  quoted: "info",
  negotiating: "neutral",
  payment_pending: "info",
  won: "success",
  lost: "neutral",
  spam: "danger",
};

export function StatusPill({ status, size = "md", className }: { status: InquiryStatus; size?: "sm" | "md"; className?: string }) {
  return (
    <BasePill tone={TONES[status]} className={cn(size === "md" && "px-2.5 py-1 text-xs", className)}>
      {STATUS_LABELS[status]}
    </BasePill>
  );
}

/** Two-letter initials disc used for the assigned agent in the queue and header. */
export function AgentAvatar({ initials, name, size = "md", className }: { initials?: string; name?: string; size?: "sm" | "md"; className?: string }) {
  if (!initials) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-dashed border-ink-300 text-ink-400",
          size === "sm" ? "h-7 w-7 text-2xs" : "h-9 w-9 text-xs",
          className,
        )}
        title="Unassigned"
        aria-label="Unassigned"
      >
        —
      </span>
    );
  }
  return (
    <AgentFrame size={size === "sm" ? 28 : 36} status="online" className={cn("text-ink-900", className)} title={name}>
      <span
        className={cn(
          "flex h-full w-full items-center justify-center rounded-full bg-ink-900 font-bold text-dune-200",
          size === "sm" ? "text-[0.5rem]" : "text-2xs",
        )}
        aria-label={name}
      >
        {initials}
      </span>
    </AgentFrame>
  );
}
