/**
 * WhatsApp conversion surface (PRD §0, §14.2).
 *
 * Rail B is a first-class booking rail, not support. Every entry point passes
 * context — SKU, dates, pax, checkout step, booking reference — so the agent
 * opens the conversation already knowing what the customer is looking at
 * (AC-WA-01). The templates below are the customer-side opening messages; the
 * agent-side templates live in the WhatsApp BSP and are version-controlled
 * there.
 */

import { track } from "./analytics";
import type { PaxCount } from "./types";
import { paxLabel } from "./utils";

export const WHATSAPP_NUMBER = "919000000000"; // MOCK — replace with the BSP number
export const SUPPORT_HOURS = "9am – 11pm IST, every day";
export const RESPONSE_SLA = "Replies in about 30 minutes";

export type WhatsAppIntent =
  | "general"
  | "activity"
  | "combo"
  | "availability"
  | "group"
  | "dietary"
  | "checkout_help"
  | "payment_help"
  | "abandoned_checkout"
  | "booking_support"
  | "cancellation"
  | "modification"
  | "voucher"
  | "concierge"
  | "quote"
  /** Inquiry mode (pivot §2.1): the form's equal-weight alternative, and the
      post-submit follow-up carrying the INQ reference. */
  | "inquiry"
  | "inquiry_followup";

export interface WhatsAppContext {
  intent: WhatsAppIntent;
  activityTitle?: string;
  activityUrl?: string;
  comboName?: string;
  date?: string;
  time?: string;
  pax?: PaxCount;
  bookingReference?: string;
  inquiryReference?: string;
  /** Whole-cart handoff: one line per item. */
  items?: string[];
  checkoutStep?: string;
  question?: string;
  priceLabel?: string;
  /** Free-form label used in analytics to identify the CTA placement. */
  placement?: string;
}

function contextLines(ctx: WhatsAppContext): string[] {
  const lines: string[] = [];
  if (ctx.activityTitle) lines.push(`Activity: ${ctx.activityTitle}`);
  if (ctx.comboName) lines.push(`Package: ${ctx.comboName}`);
  if (ctx.date) lines.push(`Date: ${ctx.date}${ctx.time ? ` · ${ctx.time}` : ""}`);
  if (ctx.pax) lines.push(`Guests: ${paxLabel(ctx.pax)}`);
  if (ctx.priceLabel) lines.push(`Price shown: ${ctx.priceLabel}`);
  if (ctx.bookingReference) lines.push(`Booking: ${ctx.bookingReference}`);
  if (ctx.inquiryReference) lines.push(`Inquiry: ${ctx.inquiryReference}`);
  if (ctx.items?.length) lines.push("Trip:", ...ctx.items.map((i) => `• ${i}`));
  if (ctx.checkoutStep) lines.push(`Checkout step: ${ctx.checkoutStep}`);
  if (ctx.activityUrl) lines.push(`Link: ${ctx.activityUrl}`);
  return lines;
}

const OPENERS: Record<WhatsAppIntent, string> = {
  general: "Hi OUTLY! I'm planning a Dubai trip and could use some help.",
  activity: "Hi OUTLY! I have a question about this activity before I book.",
  combo: "Hi OUTLY! I'd like to know more about this package.",
  availability: "Hi OUTLY! Is this available on my dates?",
  group: "Hi OUTLY! I'm booking for a group and need help picking the right option.",
  dietary:
    "Hi OUTLY! I need to check the food options (veg / Jain / halal) for this activity.",
  checkout_help: "Hi OUTLY! I'm at checkout and need a hand finishing my booking.",
  payment_help: "Hi OUTLY! My payment didn't go through — can you help?",
  abandoned_checkout: "Hi OUTLY! I'd like to finish the booking I started.",
  booking_support: "Hi OUTLY! I need help with an existing booking.",
  cancellation: "Hi OUTLY! I'd like to cancel a booking and check my refund.",
  modification: "Hi OUTLY! I'd like to change the date or guests on my booking.",
  voucher: "Hi OUTLY! Please resend my voucher on WhatsApp.",
  concierge:
    "Hi OUTLY! I'd like a private, fully-arranged Dubai itinerary. Please have someone call me.",
  quote: "Hi OUTLY! Please send me a quote for this experience.",
  inquiry: "Hi OUTLY! Please check availability and price for my trip.",
  inquiry_followup: "Hi OUTLY! Following up on my inquiry.",
};

export function buildWhatsAppMessage(ctx: WhatsAppContext): string {
  const parts = [OPENERS[ctx.intent]];
  const lines = contextLines(ctx);
  if (lines.length) parts.push("", ...lines);
  if (ctx.question) parts.push("", ctx.question);
  return parts.join("\n");
}

export function whatsAppUrl(ctx: WhatsAppContext): string {
  const text = encodeURIComponent(buildWhatsAppMessage(ctx));
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

/** Single place that both opens the chat and logs the conversion event. */
export function openWhatsApp(ctx: WhatsAppContext) {
  track("whatsapp_initiated", {
    whatsapp_context: ctx.intent,
    activity_slug: ctx.activityUrl?.split("/").pop(),
    selected_date: ctx.date,
    guest_count: ctx.pax
      ? ctx.pax.adult + ctx.pax.child + ctx.pax.infant + ctx.pax.senior
      : undefined,
    booking_reference: ctx.bookingReference,
    page_type: ctx.placement,
    rail: "assisted",
  });
  if (typeof window !== "undefined") {
    window.open(whatsAppUrl(ctx), "_blank", "noopener,noreferrer");
  }
}

/**
 * Placement rules — kept in code so the CTA copy stays consistent everywhere.
 * Documented in docs/whatsapp-strategy.md.
 */
export const WHATSAPP_COPY: Record<WhatsAppIntent, { label: string; sub?: string }> = {
  general: { label: "Chat with a Dubai expert", sub: RESPONSE_SLA },
  activity: { label: "Ask on WhatsApp", sub: "Real person, ~30 min" },
  combo: { label: "Ask about this package", sub: RESPONSE_SLA },
  availability: { label: "Check my dates on WhatsApp" },
  group: { label: "Booking for 5+? We'll plan it", sub: "Group pricing on request" },
  dietary: { label: "Check Jain / veg options" },
  checkout_help: { label: "Need help? Chat now", sub: "We can finish this for you" },
  payment_help: { label: "Payment trouble? Message us" },
  abandoned_checkout: { label: "Finish on WhatsApp" },
  booking_support: { label: "Get help with this booking" },
  cancellation: { label: "Talk to us before you cancel" },
  modification: { label: "Change dates on WhatsApp" },
  voucher: { label: "Resend voucher on WhatsApp" },
  concierge: { label: "Speak to a trip designer", sub: "Private itineraries" },
  quote: { label: "Request a quote", sub: "Priced within 2 hours" },
  inquiry: { label: "Send on WhatsApp instead", sub: "Same reply time, no form" },
  inquiry_followup: { label: "Message us on WhatsApp", sub: "Your reference is pre-filled" },
};
