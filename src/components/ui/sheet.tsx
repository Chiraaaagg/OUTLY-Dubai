"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sheet — one component behind every overlay in the product.
 *
 * On mobile it is a bottom sheet (thumb-reachable, PRD §6); on ≥sm it becomes a
 * centred dialog or a right drawer depending on `variant`. Filters, sort, the
 * guest selector, the date picker, cancellation confirmation and the compare
 * tray all use it, so focus management and scroll locking are solved once.
 *
 * Accessibility: role=dialog + aria-modal, focus moves to the panel on open and
 * returns to the trigger on close, Escape closes, Tab is trapped, and the
 * background is inert to pointer events.
 */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "sheet",
  className,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** sheet = bottom on mobile / centred on desktop. drawer = right side. */
  variant?: "sheet" | "drawer" | "dialog";
  className?: string;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKey, true);
    // Move focus into the panel without stealing it from an autofocus target.
    const t = window.setTimeout(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panelRef.current;
      target?.focus();
    }, 20);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handleKey, true);
      window.clearTimeout(t);
      restoreTo.current?.focus?.();
    };
  }, [open, handleKey]);

  if (!open) return null;

  const panelClass =
    variant === "drawer"
      ? "ml-auto h-full w-full max-w-md rounded-l-[var(--radius-tile)] sm:rounded-l-[var(--radius-tile)]"
      : variant === "dialog"
        ? "m-auto w-full max-w-lg rounded-[var(--radius-tile)]"
        : "mt-auto w-full rounded-t-[var(--radius-tile)] sm:m-auto sm:max-w-lg sm:rounded-[var(--radius-tile)]";

  return (
    <div className="fixed inset-0 z-[70] flex" role="presentation">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-ink-900/45 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? "sheet-title"}
        aria-describedby={description ? "sheet-desc" : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92vh] flex-col bg-paper shadow-[var(--shadow-pop)] outline-none animate-[pop-in_0.24s_var(--ease-out-soft)]",
          panelClass,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={labelledBy ?? "sheet-title"} className="text-lg">
              {title}
            </h2>
            {description && (
              <p id="sheet-desc" className="mt-0.5 text-sm text-ink-600">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer && (
          <div className="border-t border-ink-200 bg-paper px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
