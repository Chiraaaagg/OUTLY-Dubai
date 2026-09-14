"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabs with roving-tabindex keyboard support (Left/Right/Home/End), per the
 * WAI-ARIA tabs pattern. Used on the ADP (Overview / Inclusions / Itinerary /
 * Reviews) and in the account area.
 */
export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
  content: ReactNode;
}

export function Tabs({
  items,
  initial,
  className,
  onChange,
}: {
  items: TabItem[];
  initial?: string;
  className?: string;
  onChange?: (id: string) => void;
}) {
  const [active, setActive] = useState(initial ?? items[0]?.id);
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const select = (id: string) => {
    setActive(id);
    onChange?.(id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = items.findIndex((i) => i.id === active);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    select(items[next].id);
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  };

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={onKeyDown}
        className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto border-b border-ink-200 px-4 sm:mx-0 sm:px-0"
      >
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-bold transition-colors",
                selected
                  ? "border-sun-500 text-ink-900"
                  : "border-transparent text-ink-500 hover:text-ink-800",
              )}
            >
              {item.label}
              {item.badge != null && (
                <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-2xs tnum text-ink-600">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== active}
          tabIndex={0}
        >
          {item.id === active && item.content}
        </div>
      ))}
    </div>
  );
}
