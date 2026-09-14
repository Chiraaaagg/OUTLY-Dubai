import type { FulfilmentMode } from "./types";

/**
 * CTA copy by fulfilment mode (pivot plan §4).
 *
 * One conditional, one place. The secondary CTA ("Ask on WhatsApp") is
 * identical in both modes so instant and inquiry SKUs render side by side in
 * the same result set without looking inconsistent (§4.4).
 *
 *  "Check availability & price" was chosen over "Enquire" / "Get a quote" /
 *  "Request booking" because it names the next step, implies speed, and is
 *  literally accurate — the confirm-first story only works if the CTA tells
 *  the truth (§4.3).
 */
export function ctaFor(mode: FulfilmentMode, opts: { quoteOnly?: boolean } = {}) {
  if (opts.quoteOnly) {
    return {
      primary: "Request a quote",
      primaryShort: "Get a quote",
      route: "/concierge",
      microcopy: "Free to ask · quote within 2 hours",
      cardAction: "View details",
    };
  }
  if (mode === "instant") {
    return {
      primary: "Book now",
      primaryShort: "Book now",
      route: "/checkout",
      microcopy: "Instant confirmation · voucher in under a minute",
      cardAction: "View & book",
    };
  }
  return {
    primary: "Check availability & price",
    primaryShort: "Check availability",
    route: "/inquiry",
    microcopy: "Free to ask · reply in ~30 min",
    cardAction: "View details",
  };
}

export const RESPONSE_PROMISE = "Human reply in 30 minutes";
export const RESPONSE_PROMISE_SHORT = "Reply in ~30 min";
