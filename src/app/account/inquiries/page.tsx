import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, MessageCircle } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { AgentCard } from "@/components/commerce/inquiry-ui";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { closedInquiries, openInquiries } from "@/lib/data/inquiries";
import type { Inquiry, InquiryStatus } from "@/lib/types";
import { cn, formatDateKey, paxLabel, priceIn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My inquiries",
  robots: { index: false, follow: false },
};

/**
 * MY INQUIRIES (pivot §2.1 Account row)
 *
 * Status pipeline rendered as a progress track — adapted from 21st.dev
 * "Order History" (@kavikatiyar/order-history): a horizontal set of stages
 * from placed to delivered with the current one highlighted. Customer-facing
 * stages are collapsed to four; the internal nine-state pipeline (§7.1) is an
 * ops concern.
 */
const STAGES: { id: string; label: string; matches: InquiryStatus[] }[] = [
  { id: "received", label: "Received", matches: ["new", "assigned"] },
  { id: "checking", label: "Checking with operator", matches: ["contacted"] },
  { id: "quoted", label: "Options sent", matches: ["quoted", "negotiating"] },
  { id: "pay", label: "Confirm & pay", matches: ["payment_pending", "won"] },
];

function stageIndex(status: InquiryStatus) {
  const i = STAGES.findIndex((s) => s.matches.includes(status));
  return i === -1 ? 0 : i;
}

export default function InquiriesPage() {
  return (
    <>
      <PageView pageType="account_inquiries" />

      <section aria-labelledby="open">
        <h2 id="open" className="mb-4 text-2xl">
          Open inquiries
        </h2>
        {openInquiries.length ? (
          <ul className="space-y-4">
            {openInquiries.map((i) => (
              <li key={i.reference}>
                <InquiryRow inquiry={i} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="No open inquiries"
            body="When you ask us to check availability and price, it appears here with who's handling it and when they'll reply."
            action={<ButtonLink href="/search">Browse experiences</ButtonLink>}
          />
        )}
      </section>

      <section className="mt-10" aria-labelledby="closed">
        <h2 id="closed" className="mb-4 text-2xl">
          Completed
        </h2>
        {closedInquiries.length ? (
          <ul className="space-y-4">
            {closedInquiries.map((i) => (
              <li key={i.reference}>
                <InquiryRow inquiry={i} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-600">Nothing here yet.</p>
        )}
      </section>

      <p className="mt-8 text-sm text-ink-600">
        Once an inquiry is confirmed and paid, the booking appears under{" "}
        <Link href="/account/bookings" className="font-bold text-sun-700 underline underline-offset-2">
          My trips
        </Link>{" "}
        with its voucher.
      </p>
    </>
  );
}

function InquiryRow({ inquiry }: { inquiry: Inquiry }) {
  const current = stageIndex(inquiry.status);
  const closed = ["won", "lost", "spam"].includes(inquiry.status);
  const first = inquiry.items[0];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={inquiry.status === "won" ? "trust" : inquiry.status === "lost" ? "neutral" : "heat"}
              size="sm"
            >
              {inquiry.status === "won"
                ? "Confirmed & paid"
                : inquiry.status === "lost"
                  ? "Closed"
                  : STAGES[current].label}
            </Badge>
            <span className="text-xs font-bold tnum text-ink-500">{inquiry.reference}</span>
            <span className="text-xs text-ink-500">
              · {inquiry.datesFlexible ? "dates flexible" : inquiry.travelDateFrom ? formatDateKey(inquiry.travelDateFrom) : ""}
              {inquiry.pax ? ` · ${paxLabel(inquiry.pax)}` : ""}
            </span>
          </div>
          <h3 className="mt-1.5 text-[1.02rem] leading-snug text-ink-900">
            {first
              ? `${first.title}${inquiry.items.length > 1 ? ` + ${inquiry.items.length - 1} more` : ""}`
              : "Trip planning request"}
          </h3>
          <p className="mt-0.5 text-sm text-ink-600">
            Indicative {priceIn(inquiry.indicativeTotal, inquiry.currency)}
            {inquiry.convertedBookingReference && (
              <>
                {" "}
                · booking{" "}
                <Link
                  href={`/booking/${inquiry.convertedBookingReference}`}
                  className="font-bold text-sun-700 underline underline-offset-2"
                >
                  {inquiry.convertedBookingReference}
                </Link>
              </>
            )}
          </p>
        </div>
        {first && (
          <span className="hidden h-16 w-20 shrink-0 overflow-hidden rounded-lg sm:block">
            <Scene src={first.image} alt="" />
          </span>
        )}
      </div>

      {/* Progress track */}
      {!closed && (
        <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="Inquiry progress">
          {STAGES.map((s, i) => (
            <li key={s.id} className="min-w-0">
              <span
                aria-hidden="true"
                className={cn(
                  "block h-1.5 rounded-full",
                  i <= current ? "bg-[var(--color-success)]" : "bg-ink-200",
                )}
              />
              <span
                className={cn(
                  "mt-1.5 block truncate text-2xs font-bold",
                  i === current ? "text-ink-900" : i < current ? "text-[var(--color-success)]" : "text-ink-400",
                )}
                aria-current={i === current ? "step" : undefined}
              >
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      )}

      {inquiry.agent && !closed && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <AgentCard agent={inquiry.agent} className="flex-1 border-0 bg-shell p-3" />
          <WhatsAppButton
            size="md"
            context={{
              intent: "inquiry_followup",
              inquiryReference: inquiry.reference,
              placement: "account_inquiries",
            }}
            label={`Message ${inquiry.agent.name.split(" ")[0]}`}
          />
        </div>
      )}

      {inquiry.items.some((i) => i.availabilityNote) && (
        <ul className="mt-4 space-y-1.5 rounded-[var(--radius-control)] bg-[var(--color-success-bg)]/60 p-3 text-sm text-ink-700">
          {inquiry.items
            .filter((i) => i.availabilityNote)
            .map((i) => (
              <li key={i.id} className="flex gap-2">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" aria-hidden="true" />
                <span>
                  <strong className="font-bold">{i.title}:</strong> {i.availabilityNote}
                </span>
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}
