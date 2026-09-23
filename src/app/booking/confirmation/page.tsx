"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Gift,
  MapPin,
  MessageCircle,
  Star,
} from "lucide-react";
import { ActivityCard } from "@/components/commerce/activity-card";
import { WhatsAppButton, WhatsAppCard } from "@/components/commerce/whatsapp";
import { useApp } from "@/components/providers/app-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Card, Skeleton } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { track } from "@/lib/analytics";
import { useCatalog } from "@/lib/catalog/client";
import { resendVoucher } from "@/lib/api";
import type { CartItem, Traveller } from "@/lib/types";
import { formatDateLong, paxLabel } from "@/lib/utils";
import { Amount } from "@/components/commerce/price";

interface StoredOrder {
  reference: string;
  status: "confirmed" | "supplier_pending";
  voucherEtaMinutes: number;
  items: CartItem[];
  traveller: Traveller;
  total: { inr: number; aed: number };
  method: string;
}

/**
 * BOOKING CONFIRMATION
 *
 * Two states, both first-class:
 *   confirmed        → voucher is on its way, median under a minute
 *   supplier_pending → the operator has to confirm; we say so, give a deadline,
 *                      and state what happens if they can't (PRD §5.7)
 *
 * The job of this page is to make the next action obvious. That is not
 * "continue shopping" — it is: save your voucher, add it to your calendar, and
 * know who to call.
 */
export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="container-page py-10"><Skeleton className="h-96 w-full rounded-[var(--radius-tile)]" /></div>}>
      <ConfirmationInner />
    </Suspense>
  );
}

function ConfirmationInner() {
  const params = useSearchParams();
  const { activities } = useCatalog();
  const { toast } = useApp();
  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [sending, setSending] = useState(false);

  const reference = params.get("ref") ?? "OUT-000000";
  const status = (params.get("status") as StoredOrder["status"]) ?? "confirmed";
  const eta = Number(params.get("eta") ?? 1);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("outlyy.lastOrder");
      if (raw) setOrder(JSON.parse(raw) as StoredOrder);
    } catch {
      /* the page still works from URL params alone */
    }
    track("page_view", { page_type: "confirmation", booking_reference: reference, booking_status: status });
  }, [reference, status]);

  const pending = status === "supplier_pending";
  const crossSell = activities.filter((a) => a.tier === "B").slice(0, 3);

  return (
    <div className="container-page py-8 pb-20">
      <div className="mx-auto max-w-3xl">
        {/* Hero state */}
        <div
          className={
            pending
              ? "rounded-[var(--radius-tile)] border border-[color-mix(in_oklab,var(--color-warning)_30%,white)] bg-[var(--color-warning-bg)] p-6 text-center sm:p-8"
              : "rounded-[var(--radius-tile)] border border-[color-mix(in_oklab,var(--color-success)_30%,white)] bg-[var(--color-success-bg)] p-6 text-center sm:p-8"
          }
        >
          <span
            aria-hidden="true"
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white"
          >
            {pending ? (
              <Clock className="h-7 w-7 text-[var(--color-warning)]" />
            ) : (
              <CheckCircle2 className="h-7 w-7 text-[var(--color-success)]" />
            )}
          </span>
          <h1 className="text-[1.75rem] sm:text-3xl">
            {pending ? "Payment received — confirming with the operator" : "You're booked."}
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-[0.975rem] leading-relaxed text-ink-700">
            {pending
              ? `This experience needs the operator to confirm. We'll message you within ${eta} minutes with the confirmed voucher. If they can't take it, you'll get three options — an alternative experience, an alternative date, or a full refund — within two hours, without chasing us.`
              : `Your QR voucher is on its way to WhatsApp and email — usually inside a minute. It also lives in your account and works offline once you've opened it.`}
          </p>

          <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-ink-200 bg-white px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Booking</span>
            <span className="font-display text-lg font-bold tnum text-ink-900">{reference}</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(reference);
                toast({ tone: "success", title: "Reference copied" });
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100"
            >
              <Copy className="h-4 w-4" />
              <span className="sr-only">Copy booking reference</span>
            </button>
          </div>
        </div>

        {/* Next actions — the obvious thing to do next */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <ButtonLink href={`/voucher/${reference}`} size="lg" block>
            <Download className="h-[1.15rem] w-[1.15rem]" />
            {pending ? "See booking status" : "View & download voucher"}
          </ButtonLink>
          <Button
            variant="whatsapp"
            size="lg"
            block
            loading={sending}
            onClick={async () => {
              setSending(true);
              await resendVoucher(reference, "whatsapp");
              setSending(false);
              track("voucher_sent_whatsapp", { booking_reference: reference });
              toast({
                tone: "success",
                title: "Sent to WhatsApp",
                body: "Check your messages — it should arrive within a few seconds.",
              });
            }}
          >
            <MessageCircle className="h-[1.15rem] w-[1.15rem]" />
            Send voucher to WhatsApp
          </Button>
        </div>

        {/* Booking detail */}
        <Card className="mt-6 p-5">
          <h2 className="text-xl">Your booking</h2>
          {order ? (
            <>
              <ul className="mt-3 divide-y divide-ink-200">
                {order.items.map((item) => (
                  <li key={item.id} className="flex gap-3 py-3">
                    <span className="h-16 w-20 shrink-0 overflow-hidden rounded-lg">
                      <Scene src={item.image} alt="" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.95rem] font-bold leading-snug text-ink-900">
                        {item.title}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatDateLong(item.date)} · {item.time}
                      </p>
                      <p className="text-xs text-ink-500">{paxLabel(item.pax)}</p>
                    </div>
                    <Amount money={item.total} className="shrink-0 font-bold" />
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-ink-200 pt-3 font-bold">
                <span>Paid</span>
                <Amount money={order.total} />
              </div>
              <p className="mt-1 text-xs text-ink-500">
                Paid by {order.method.toUpperCase()} · GST invoice emailed to {order.traveller.email}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-600">
              Your booking details are in your voucher and in{" "}
              <Link href="/account/bookings" className="font-bold text-sun-700 underline">
                My trips
              </Link>
              .
            </p>
          )}
        </Card>

        {/* Practical next steps */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-2 flex items-center gap-2 text-lg">
              <CalendarPlus className="h-5 w-5 text-sun-500" aria-hidden="true" />
              Before you go
            </h2>
            <ul className="space-y-2 text-sm text-ink-600">
              <li>Add it to your calendar so the timing doesn&apos;t catch you out.</li>
              <li>
                For pickup-included activities, your driver&apos;s name, photo and number arrive on
                WhatsApp the evening before.
              </li>
              <li>We&apos;ll message you two days before with anything you need to carry.</li>
            </ul>
            <Button variant="outline" size="sm" className="mt-3">
              <CalendarPlus className="h-4 w-4" />
              Add to calendar
            </Button>
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5 text-sun-500" aria-hidden="true" />
              If something goes wrong
            </h2>
            <p className="text-sm leading-relaxed text-ink-600">
              Your confirmation carries our contact details and the operator&apos;s own. Message us
              as soon as something looks wrong — while it is still fixable — and we take it up with
              the operator for you under the terms shown on your booking.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href="/manage-booking" variant="outline" size="sm">
                Manage booking
              </ButtonLink>
              <WhatsAppButton
                size="sm"
                context={{
                  intent: "booking_support",
                  bookingReference: reference,
                  placement: "confirmation",
                }}
              />
            </div>
          </Card>
        </div>

        {pending && (
          <Alert tone="info" className="mt-6" title="What happens in the next two hours">
            We contact the operator immediately. You&apos;ll get a WhatsApp message either way —
            confirmed with your voucher, or with three options if they can&apos;t take it. If it
            isn&apos;t resolved at two hours, it escalates automatically to our operations team.
            Nothing further is needed from you.
          </Alert>
        )}

        {/* Account creation — offered after payment, never before (AC-CO-01) */}
        <Card className="mt-6 p-5">
          <h2 className="text-lg">Save this to an account?</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
            One tap using the details you&apos;ve already given. It keeps your vouchers in one
            place, saves your traveller details for next time, and lets you cancel or change dates
            yourself. Entirely optional — your booking works without it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href="/signup" size="sm">
              Create my account
            </ButtonLink>
            <ButtonLink href="/manage-booking" variant="ghost" size="sm">
              No thanks — find my booking by reference
            </ButtonLink>
          </div>
        </Card>

        {/* Post-booking merchandising — relevant, and clearly secondary */}
        <section className="mt-8">
          <h2 className="mb-1 text-xl">Complete your trip</h2>
          <p className="mb-4 text-sm text-ink-600">
            Most travellers add one of these on another day. No rush — you can book any of them from
            Dubai, and we&apos;ll message you if something you looked at is about to sell out.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {crossSell.map((a, i) => (
              <ActivityCard
                key={a.slug}
                activity={a}
                layout="compact"
                position={i + 1}
                source="confirmation_cross_sell"
              />
            ))}
          </div>
        </section>

        {/* Referral + review setup */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-2 flex items-center gap-2 text-lg">
              <Gift className="h-5 w-5 text-sunset-500" aria-hidden="true" />
              Give ₹500, get ₹500
            </h2>
            <p className="text-sm leading-relaxed text-ink-600">
              Share your code and a friend gets ₹500 off their first booking. You get ₹500 in credit
              once they&apos;ve actually travelled.
            </p>
            <ButtonLink href="/contact" variant="outline" size="sm" className="mt-3">
              Ask about referral credit
            </ButtonLink>
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 flex items-center gap-2 text-lg">
              <Star className="h-5 w-5 text-dune-400" aria-hidden="true" />
              We&apos;ll ask how it went
            </h2>
            <p className="text-sm leading-relaxed text-ink-600">
              Two days after your activity we&apos;ll send one short WhatsApp message. If you asked
              for Jain or veg food, we ask specifically whether it was provided — and a &ldquo;no&rdquo;
              goes straight to that supplier&apos;s scorecard.
            </p>
          </Card>
        </div>

        <WhatsAppCard
          className="mt-8"
          context={{ intent: "booking_support", bookingReference: reference, placement: "confirmation_footer" }}
          title="Questions between now and then?"
          body="Message us any time. We keep your booking, supplier contact and driver details in one view, so you never have to explain your booking twice."
        />
      </div>
    </div>
  );
}
