"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { WhatsAppButton } from "./whatsapp";
import { cn } from "@/lib/utils";

/**
 * Sticky mobile CTA for landing and category pages.
 *
 * Appears after the first scroll so it never competes with the hero CTA, and
 * carries both rails: the self-serve jump into the activity list, and the
 * assisted rail for anyone who has read two screens and still isn't sure.
 * Hidden on desktop, where the page CTAs are always reachable.
 */
export function StickyLandingCTA({
  label,
  href,
  whatsappPlacement,
}: {
  label: string;
  href: string;
  whatsappPlacement: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-paper/97 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-sticky)] backdrop-blur transition-transform duration-200 lg:hidden",
        visible ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="flex items-center gap-2.5">
        <p className="min-w-0 flex-1 text-sm font-bold leading-tight text-ink-900">{label}</p>
        <WhatsAppButton
          size="md"
          label="Ask"
          context={{ intent: "general", placement: whatsappPlacement }}
        />
        <ButtonLink href={href} size="md">
          Check availability
        </ButtonLink>
      </div>
    </div>
  );
}
