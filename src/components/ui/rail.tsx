"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rail — the horizontal carousel used by every merchandising row.
 *
 * Scroll-snap on a native scroll container rather than a JS carousel: it works
 * with touch, trackpad, keyboard and screen readers for free, degrades to a
 * plain scrolling list without JS, and adds no bundle weight. Arrows appear
 * only on hover-capable pointers and only when there is somewhere to scroll.
 */
export function Rail({
  children,
  className,
  itemClassName,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  itemClassName?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ atStart: true, atEnd: false, scrollable: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const scrollable = el.scrollWidth > el.clientWidth + 8;
      setState({
        scrollable,
        atStart: el.scrollLeft <= 4,
        atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={ref}
        className={cn("rail -mx-4 px-4 sm:mx-0 sm:px-0", itemClassName)}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
      >
        {children}
      </div>

      {state.scrollable && (
        <div className="pointer-events-none absolute inset-y-0 -left-3 -right-3 hidden items-center justify-between [@media(hover:hover)]:flex">
          <RailButton dir="left" onClick={() => nudge(-1)} disabled={state.atStart} />
          <RailButton dir="right" onClick={() => nudge(1)} disabled={state.atEnd} />
        </div>
      )}
    </div>
  );
}

function RailButton({
  dir,
  onClick,
  disabled,
}: {
  dir: "left" | "right";
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
      className={cn(
        "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 bg-paper text-ink-800 shadow-[var(--shadow-lift)] transition-opacity",
        disabled && "pointer-events-none opacity-0",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function RailItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("rail-item", className)}>{children}</div>;
}
