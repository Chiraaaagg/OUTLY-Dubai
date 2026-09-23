"use client";

import { MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApp } from "@/components/providers/app-provider";
import { emergencyDisplay } from "@/lib/site-config";
import {
  openWhatsApp,
  RESPONSE_SLA,
  SUPPORT_HOURS,
  WHATSAPP_COPY,
  type WhatsAppContext,
} from "@/lib/whatsapp";

/**
 * WhatsApp entry points — Rail B's surface area.
 *
 * PRD §0: "Every page must expose a contextual WhatsApp entry point that passes
 * page context into the conversation. That is not a support widget. It is a
 * conversion surface." Three shapes, used deliberately:
 *
 *   WhatsAppButton  — inline, equal weight to Book now on the ADP.
 *   WhatsAppCard    — a block that sells the assisted rail (homepage, LPs,
 *                     category pages, empty states, error states).
 *   FloatingWhatsApp— persistent, one per page, never covering a primary CTA.
 *
 * The rule we do not break: WhatsApp is offered, never forced. A customer who
 * can self-serve in ninety seconds should not be routed into a conversation.
 */

const brandIcon = <WhatsAppGlyph className="h-[1.15rem] w-[1.15rem] shrink-0" />;

export function WhatsAppButton({
  context,
  size = "md",
  block,
  variant = "whatsapp",
  label,
  className,
}: {
  context: WhatsAppContext;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  variant?: "whatsapp" | "ghost" | "outline";
  label?: string;
  className?: string;
}) {
  const copy = WHATSAPP_COPY[context.intent];
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      block={block}
      className={className}
      onClick={() => openWhatsApp(context)}
    >
      {brandIcon}
      {label ?? copy.label}
    </Button>
  );
}

export function WhatsAppCard({
  context,
  title,
  body,
  className,
  tone = "light",
}: {
  context: WhatsAppContext;
  title?: string;
  body?: string;
  className?: string;
  tone?: "light" | "dark";
}) {
  const copy = WHATSAPP_COPY[context.intent];
  return (
    <div
      className={cn(
        "rounded-[var(--radius-tile)] border p-5 sm:p-6",
        tone === "dark"
          ? "night-wash border-ink-800 text-white"
          : "border-whatsapp/35 bg-[#f4fdf7]",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-whatsapp text-white"
            aria-hidden="true"
          >
            <WhatsAppGlyph className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h3 className={cn("text-lg", tone === "dark" && "text-white")}>
              {title ?? "Not sure? Ask a human."}
            </h3>
            <p
              className={cn(
                "mt-1 max-w-xl text-sm leading-relaxed",
                tone === "dark" ? "text-white/75" : "text-ink-600",
              )}
            >
              {body ??
                `A real person who knows these suppliers answers in about 30 minutes. Tell us your dates, group and any food or mobility needs — we'll confirm availability and come back with options, priced all-in.`}
            </p>
            <p
              className={cn(
                "mt-1.5 text-xs font-semibold",
                tone === "dark" ? "text-dune-300" : "text-ink-500",
              )}
            >
              {RESPONSE_SLA} · {SUPPORT_HOURS}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <Button
            type="button"
            variant={tone === "dark" ? "primary" : "whatsapp"}
            size="lg"
            onClick={() => openWhatsApp(context)}
            className="w-full sm:w-auto"
          >
            {brandIcon}
            {copy.label}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Floating entry point. Sits above the mobile sticky booking bar (bottom-24 on
 * pages that have one, via `raised`) so it never obscures Book now — AC-HP-04
 * requires it visible without scrolling on a 360×640 viewport.
 */
export function FloatingWhatsApp({
  context,
  raised,
}: {
  context: WhatsAppContext;
  /** Page has a mobile sticky booking bar — lift above it below `sm`. */
  raised?: boolean;
}) {
  // The compare tray is fixed at the bottom on every breakpoint; when it is
  // showing, lift the button above it everywhere (audit S07 — the FAB sat on
  // top of the tray's Compare action on desktop).
  const { compare, hydrated } = useApp();
  const trayVisible = hydrated && compare.length > 0;
  return (
    <div
      className={cn(
        "fixed right-4 z-50 transition-[bottom] duration-200 sm:right-6",
        trayVisible
          ? "bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] sm:bottom-[5.5rem]"
          : raised
            ? "bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] sm:bottom-6"
            : "bottom-[calc(env(safe-area-inset-bottom)+1rem)] sm:bottom-6",
      )}
    >
      <button
        type="button"
        onClick={() => openWhatsApp({ ...context, placement: "floating" })}
        className="group flex items-center gap-2.5 rounded-full bg-whatsapp py-3 pl-3.5 pr-4 text-white shadow-[var(--shadow-pop)] transition-transform duration-200 ease-[var(--ease-spring)] hover:scale-[1.03] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
      >
        <WhatsAppGlyph className="h-6 w-6" />
        <span className="hidden text-sm font-bold sm:inline">Chat with us</span>
        <span className="sr-only sm:hidden">Chat with us on WhatsApp</span>
      </button>
    </div>
  );
}

/**
 * Phone escalation — shown for high-value orders and inside 48h of travel.
 * Defaults to the configured emergency line and renders nothing when neither
 * a `number` prop nor `NEXT_PUBLIC_EMERGENCY_PHONE` is set (audit X03).
 */
export function PhoneEscalation({ number = emergencyDisplay() }: { number?: string }) {
  if (!number) return null;
  return (
    <a
      href={`tel:${number.replace(/\s/g, "")}`}
      className="inline-flex items-center gap-2 text-sm font-bold text-ink-800 underline underline-offset-2"
    >
      <Phone className="h-4 w-4" />
      {number}
    </a>
  );
}

export function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24z" />
    </svg>
  );
}
