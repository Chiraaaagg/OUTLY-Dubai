import type { ReactNode } from "react";
import { ArrowRightLeft, Bot, MessageSquare, Phone, StickyNote, Tag, UserRound } from "lucide-react";
import type { InquiryEventDetail } from "@/server/services/inquiry.types";
import { STATUS_LABELS } from "@/server/domain/inquiry-state";
import { cn } from "@/lib/utils";
import { RelativeTime } from "./sla-countdown";
import { CONSOLE_TZ_LABEL, fmtDateTime } from "./format";

/**
 * Merged activity timeline: status changes, assignments, notes, contacts,
 * item updates and system entries, newest first. Server-rendered; only the
 * relative timestamps are client components. Every note is customer- or
 * agent-typed text and is rendered as text — React escapes it.
 */

const ICONS: Record<InquiryEventDetail["kind"], ReactNode> = {
  status: <Tag className="h-3.5 w-3.5" />,
  note: <StickyNote className="h-3.5 w-3.5" />,
  assignment: <ArrowRightLeft className="h-3.5 w-3.5" />,
  contact: <Phone className="h-3.5 w-3.5" />,
  item: <MessageSquare className="h-3.5 w-3.5" />,
  system: <Bot className="h-3.5 w-3.5" />,
};

function headline(e: InquiryEventDetail, agentNames: Record<string, string>): string {
  const who = e.actorName ?? (e.actorType === "system" ? "System" : e.actorType === "customer" ? "Customer" : "Someone");
  switch (e.kind) {
    case "status":
      if (e.fromStatus && e.toStatus) return `${who} moved ${STATUS_LABELS[e.fromStatus]} → ${STATUS_LABELS[e.toStatus]}`;
      if (e.toStatus) return `${who} set status to ${STATUS_LABELS[e.toStatus]}`;
      return `${who} changed status`;
    case "assignment": {
      const agentId = typeof e.meta?.agentId === "string" ? e.meta.agentId : undefined;
      const name = agentId ? (agentNames[agentId] ?? "an agent") : "an agent";
      const previous = typeof e.meta?.previousAgentId === "string" ? e.meta.previousAgentId : undefined;
      return previous ? `${who} reassigned to ${name}` : `${who} assigned to ${name}`;
    }
    case "note":
      return `${who} added a note`;
    case "contact":
      return `${who} logged a customer contact`;
    case "item": {
      const parts: string[] = [];
      if (e.meta?.confirmedTotal === null) parts.push("cleared the confirmed price");
      else if (e.meta?.confirmedTotal) parts.push("confirmed a price");
      if (e.meta?.availabilityChecked) parts.push("checked availability");
      if (typeof e.meta?.availabilityNote === "string") parts.push("updated the availability note");
      const tail = parts.length ? parts.join(", ") : "updated an item";
      return `${who} ${tail}${e.meta?.toleranceExceeded ? " — above tolerance" : ""}`;
    }
    default:
      return e.note ?? `${who}: system event`;
  }
}

export function Timeline({
  events,
  serverNow,
  agentNames = {},
  className,
}: {
  events: InquiryEventDetail[];
  serverNow: number;
  agentNames?: Record<string, string>;
  className?: string;
}) {
  const sorted = [...events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (!sorted.length) {
    return <p className={cn("text-sm text-ink-500", className)}>Nothing has happened yet.</p>;
  }
  return (
    <ol className={cn("space-y-3", className)} aria-label="Inquiry activity">
      {sorted.map((e) => {
        const isSystem = e.kind === "system";
        const showNote = e.note && e.kind !== "system";
        return (
          <li key={e.id} className="flex gap-2.5">
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                e.kind === "note" ? "bg-dune-100 text-ink-800" : isSystem ? "bg-ink-100 text-ink-500" : "bg-lagoon-50 text-lagoon-700",
              )}
              aria-hidden="true"
            >
              {ICONS[e.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className={cn("font-semibold", isSystem ? "text-ink-600" : "text-ink-900")}>{headline(e, agentNames)}</span>
                <RelativeTime iso={e.createdAt} serverNow={serverNow} className="text-xs text-ink-500" />
              </p>
              {showNote && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">{e.note}</p>}
              {e.kind === "system" && typeof e.meta?.dueAt === "string" ? (
                <p className="mt-0.5 text-xs text-ink-500">Was due {fmtDateTime(e.meta.dueAt)} {CONSOLE_TZ_LABEL}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
