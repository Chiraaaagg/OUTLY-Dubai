"use client";

import { useEffect } from "react";
import { track, type EventProps } from "@/lib/analytics";

/**
 * Fires `page_view` (or `landing_page_view`) once per navigation.
 *
 * Client-side only by design — this is the deduplication partner to the
 * server-side event that is the source of truth (PRD §8). Both carry the same
 * `page_type` and identifiers so the two can be reconciled within 2%
 * (AC-AN-02).
 */
export function PageView({
  pageType,
  landing,
  props,
}: {
  pageType: string;
  landing?: boolean;
  props?: EventProps;
}) {
  useEffect(() => {
    track(landing ? "landing_page_view" : "page_view", { page_type: pageType, ...props });
    // Intentionally fires once per mount; route changes remount this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
