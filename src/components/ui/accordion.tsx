"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Faq } from "@/lib/types";

/**
 * Accordion / FAQ.
 *
 * Native <details>/<summary> was considered and rejected: we need controlled
 * open state for analytics and for the "expand all" affordance, and Safari's
 * default disclosure triangle fights the design. This implementation keeps the
 * semantics that matter — button + aria-expanded + aria-controls, panel content
 * always in the DOM so it is crawlable for FAQPage structured data (PRD §7).
 */

export function Accordion({
  items,
  defaultOpen = 0,
  className,
  onToggle,
}: {
  items: Faq[];
  /** Index open on first render, or -1 for all closed. */
  defaultOpen?: number;
  className?: string;
  onToggle?: (question: string, open: boolean) => void;
}) {
  const [open, setOpen] = useState<number>(defaultOpen);
  const baseId = useId();

  return (
    <div className={cn("divide-y divide-ink-200 overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-paper", className)}>
      {items.map((item, i) => {
        const isOpen = open === i;
        const panelId = `${baseId}-panel-${i}`;
        const buttonId = `${baseId}-button-${i}`;
        return (
          <div key={item.q}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => {
                  const next = isOpen ? -1 : i;
                  setOpen(next);
                  onToggle?.(item.q, next === i);
                }}
                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-[0.975rem] font-bold text-ink-900 transition-colors hover:bg-shell/70 sm:px-5"
              >
                <span>{item.q}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "h-5 w-5 shrink-0 text-ink-500 transition-transform duration-200",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="px-4 pb-4 text-[0.95rem] leading-relaxed text-ink-600 sm:px-5"
            >
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
