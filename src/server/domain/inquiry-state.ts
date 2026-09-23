import type { InquiryStatus } from "@/lib/types";

/**
 * Inquiry status pipeline (§17 §7.1) as data. `inquiry.service` is the only
 * place that applies a transition; this file says which are legal.
 *
 *   new ──► assigned ──► contacted ──► quoted ──► negotiating ──► payment_pending ──► won
 *    │          │            │            │            │                │
 *    └──► spam  └────────────┴────────────┴────────────┴────────────────┴──► lost
 */

export const TRANSITIONS: Record<InquiryStatus, InquiryStatus[]> = {
  new: ["assigned", "contacted", "spam", "lost"],
  assigned: ["assigned", "contacted", "spam", "lost"],
  contacted: ["quoted", "negotiating", "lost", "spam", "assigned"],
  quoted: ["negotiating", "payment_pending", "won", "lost", "quoted"],
  negotiating: ["quoted", "payment_pending", "won", "lost"],
  payment_pending: ["won", "lost", "negotiating", "payment_pending"],
  // Terminal — `lost` may be reopened by a lead when a customer comes back.
  won: [],
  lost: ["contacted", "assigned"],
  spam: ["new"],
};

export const TERMINAL: ReadonlySet<InquiryStatus> = new Set(["won", "lost", "spam"]);
export const OPEN_STATUSES: InquiryStatus[] = ["new", "assigned", "contacted", "quoted", "negotiating", "payment_pending"];

/** Statuses that mean an agent has replied — sets `first_response_at` on first entry. */
export const CONTACTED_OR_LATER: ReadonlySet<InquiryStatus> = new Set([
  "contacted",
  "quoted",
  "negotiating",
  "payment_pending",
  "won",
]);

export function canTransition(from: InquiryStatus, to: InquiryStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const LOST_REASONS = [
  "no_response",
  "price",
  "dates_unavailable",
  "booked_elsewhere",
  "not_travelling",
  "duplicate",
  "payment_expired",
  "other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  no_response: "No response after follow-ups",
  price: "Price",
  dates_unavailable: "Dates not available",
  booked_elsewhere: "Booked elsewhere",
  not_travelling: "No longer travelling",
  duplicate: "Duplicate inquiry",
  payment_expired: "Payment link expired",
  other: "Other",
};

export const STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "New",
  assigned: "Assigned",
  contacted: "Contacted",
  quoted: "Quoted",
  negotiating: "Negotiating",
  payment_pending: "Payment pending",
  won: "Won",
  lost: "Lost",
  spam: "Spam",
};

/** Customer-facing 4-stage track (src/app/account/inquiries): kept in sync here. */
export function customerStage(status: InquiryStatus): 0 | 1 | 2 | 3 {
  switch (status) {
    case "new":
    case "assigned":
      return 0;
    case "contacted":
      return 1;
    case "quoted":
    case "negotiating":
      return 2;
    default:
      return 3;
  }
}
