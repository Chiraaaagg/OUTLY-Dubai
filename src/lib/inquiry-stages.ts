import type { InquiryStatus } from "./types";

/**
 * Customer-facing inquiry pipeline — four stages collapsed from the internal
 * nine-state machine (§7.1). Pure, shared by the account list, the dashboard
 * and the guest tracker so the same status can never read differently on two
 * pages. Moved out of `src/app/account/inquiries/page.tsx` unchanged.
 */

export const STAGES: { id: string; label: string; matches: InquiryStatus[] }[] = [
  { id: "received", label: "Received", matches: ["new", "assigned"] },
  { id: "checking", label: "Checking with operator", matches: ["contacted"] },
  { id: "quoted", label: "Options sent", matches: ["quoted", "negotiating"] },
  { id: "pay", label: "Confirm & pay", matches: ["payment_pending", "won"] },
];

export function stageIndex(status: InquiryStatus): number {
  const i = STAGES.findIndex((s) => s.matches.includes(status));
  return i === -1 ? 0 : i;
}

export const CLOSED_STATUSES: InquiryStatus[] = ["won", "lost", "spam"];

export function isClosedStatus(status: InquiryStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

/** Short label for the status pill. Honest: "Closed", never "Cancelled by you". */
export function inquiryStatusLabel(status: InquiryStatus): string {
  if (status === "won") return "Confirmed & paid";
  if (status === "lost" || status === "spam") return "Closed";
  return STAGES[stageIndex(status)].label;
}

export function inquiryStatusTone(status: InquiryStatus): "trust" | "neutral" | "heat" {
  if (status === "won") return "trust";
  if (status === "lost" || status === "spam") return "neutral";
  return "heat";
}
