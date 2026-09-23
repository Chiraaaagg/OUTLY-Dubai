"use client";

import { useState, useTransition } from "react";
import { Mail, MessageCircle, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InquiryNotificationSummary } from "@/server/services/inquiry.types";
import { resendInquiryNotification } from "@/app/admin/_actions/inquiries";
import { CONSOLE_TZ_LABEL, fmtDateTime } from "./format";

/**
 * Notification log for one inquiry with a per-row "Resend". Recipients arrive
 * already masked from the service — the console never sees a raw phone here.
 */

const STATUS_TONE: Record<InquiryNotificationSummary["status"], string> = {
  queued: "bg-ink-100 text-ink-700",
  sent: "bg-lagoon-50 text-lagoon-700",
  delivered: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  read: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  failed: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
  suppressed: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
};

const EVENT_LABELS: Record<string, string> = {
  inquiry_submitted: "Acknowledgement",
  inquiry_assigned: "Agent assigned",
  inquiry_sla_breach: "Still checking (SLA)",
  inquiry_followup: "Follow-up",
  inquiry_won: "Booking confirmed",
  ops_alert: "Ops alert",
};

function ChannelIcon({ channel }: { channel: InquiryNotificationSummary["channel"] }) {
  const cls = "h-3.5 w-3.5";
  if (channel === "email") return <Mail className={cls} aria-label="Email" />;
  if (channel === "whatsapp") return <MessageCircle className={cls} aria-label="WhatsApp" />;
  return <Smartphone className={cls} aria-label={channel} />;
}

export function NotificationsList({
  inquiryId,
  notifications,
  canResend,
}: {
  inquiryId: string;
  notifications: InquiryNotificationSummary[];
  canResend: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Record<string, { ok: boolean; text: string }>>({});

  if (!notifications.length) return <p className="text-sm text-ink-500">Nothing sent yet.</p>;

  const resend = (notificationId: string) => {
    setBusyId(notificationId);
    startTransition(async () => {
      const r = await resendInquiryNotification({ id: inquiryId, notificationId });
      setOutcome((o) => ({
        ...o,
        [notificationId]: r.ok
          ? { ok: r.data.status === "sent", text: r.data.status === "sent" ? "Resent" : `Resend ${r.data.status}${r.data.error ? `: ${r.data.error}` : ""}` }
          : { ok: false, text: r.message },
      }));
      setBusyId(null);
    });
  };

  return (
    <ul className="divide-y divide-ink-100">
      {notifications.map((n) => {
        const resendable = canResend && (n.channel === "email" || n.channel === "whatsapp");
        const result = outcome[n.id];
        return (
          <li key={n.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 text-sm">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600">
              <ChannelIcon channel={n.channel} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold text-ink-900">{EVENT_LABELS[n.event] ?? n.event}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide", STATUS_TONE[n.status])}>{n.status}</span>
              </p>
              <p className="text-xs text-ink-500 tnum">
                to {n.recipientMasked} · {fmtDateTime(n.sentAt ?? n.failedAt ?? n.createdAt)} {CONSOLE_TZ_LABEL}
              </p>
              {n.suppressedReason && <p className="text-xs text-[var(--color-warning)]">Suppressed: {n.suppressedReason.replace(/_/g, " ")}</p>}
              {n.providerError && <p className="break-words text-xs text-[var(--color-danger)]">Provider: {n.providerError}</p>}
              {result && <p className={cn("text-xs font-semibold", result.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]")}>{result.text}</p>}
            </div>
            {resendable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => resend(n.id)}
                loading={pending && busyId === n.id}
                loadingLabel="Sending"
                disabled={pending}
                aria-label={`Resend ${EVENT_LABELS[n.event] ?? n.event} by ${n.channel}`}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Resend
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
