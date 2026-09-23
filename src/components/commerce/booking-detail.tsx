"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Download,
  MessageCircle,
  Phone,
  Plus,
  X,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { ActivityCard } from "@/components/commerce/activity-card";
import { DateStrip } from "@/components/commerce/pickers";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cancelBooking, quoteCancellation, type CancellationQuote } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useCatalog } from "@/lib/catalog/client";
import { emergencyDisplay, emergencyHref, whatsappDisplay } from "@/lib/site-config";
import type { Booking } from "@/lib/types";
import { formatDateLong, paxLabel, priceIn } from "@/lib/utils";

/**
 * BOOKING MANAGEMENT (PRD §5.8)
 *
 * Self-serve cancellation shows the exact refund and the expected credit date
 * *before* the customer confirms (AC-BM-01) — no "submit a request and we'll
 * get back to you". Self-serve date change is offered where the supplier's
 * terms allow, with the fee shown up front.
 *
 * Inside 48 hours of travel, supplier and driver contact plus the emergency
 * number are surfaced prominently (AC-BM-03).
 */
export function BookingDetail({ booking }: { booking: Booking }) {
  const { currency, toast } = useApp();
  const { activities } = useCatalog();
  const wa = whatsappDisplay();
  const emergency = emergencyDisplay();
  const emergencyTel = emergencyHref();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(booking.status === "cancelled");
  const [newDate, setNewDate] = useState(booking.items[0]?.date ?? "");

  const upcoming = booking.status === "confirmed" || booking.status === "supplier_pending";
  const withinFortyEight = upcoming; // MOCK: demo bookings are treated as imminent
  const crossSell = activities.filter((a) => a.tier === "B").slice(0, 3);

  const openCancel = async () => {
    setCancelOpen(true);
    setLoadingQuote(true);
    const q = await quoteCancellation(booking);
    setQuote(q);
    setLoadingQuote(false);
  };

  const confirmCancel = async () => {
    setCancelling(true);
    await cancelBooking(booking.reference);
    setCancelling(false);
    setCancelled(true);
    setCancelOpen(false);
    track("booking_cancelled", {
      booking_reference: booking.reference,
      value: quote?.refundINR,
    });
    toast({
      tone: "success",
      title: "Booking cancelled",
      body: `₹${quote?.refundINR.toLocaleString("en-IN")} will be credited in ${quote?.creditedInDays}.`,
    });
  };

  return (
    <div className="grid grid-safe gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start">
      <div className="min-w-0 space-y-5">
        {cancelled && (
          <Alert tone="info" title="This booking is cancelled">
            Your refund of{" "}
            <strong className="font-bold">
              ₹{(quote?.refundINR ?? booking.total.inr).toLocaleString("en-IN")}
            </strong>{" "}
            has been initiated and will reach your original payment method in 5–7 working days.
            We&apos;ve emailed written confirmation.
          </Alert>
        )}

        {booking.status === "supplier_pending" && (
          <Alert tone="warning" title="Waiting on the operator">
            We&apos;re confirming this with the supplier. You&apos;ll get a WhatsApp message within
            two hours either way — confirmed with your voucher, or with three options if they
            can&apos;t take it. Nothing further is needed from you.
          </Alert>
        )}

        {withinFortyEight && booking.driver && (
          <Card className="border-lagoon-200 bg-lagoon-50 p-5">
            <h2 className="text-lg text-lagoon-700">Your pickup tomorrow</h2>
            <p className="mt-1.5 text-sm text-lagoon-700/90">
              <strong className="font-bold">{booking.driver.name}</strong> · {booking.driver.vehicle}
              <br />
              Pickup window {booking.driver.window} from {booking.traveller.hotel}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`tel:${booking.driver.phone.replace(/\s/g, "")}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-lagoon-600 px-4 text-sm font-bold text-white"
              >
                <Phone className="h-4 w-4" />
                Call driver
              </a>
              <WhatsAppButton
                size="md"
                context={{
                  intent: "booking_support",
                  bookingReference: booking.reference,
                  placement: "booking_driver",
                }}
                label="Driver hasn't arrived"
              />
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl">Booking {booking.reference}</h2>
              <p className="mt-0.5 text-sm text-ink-600">
                Booked {new Date(booking.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                · {booking.rail === "assisted" ? "with a WhatsApp agent" : "self-serve"}
              </p>
            </div>
            <Badge
              tone={
                cancelled
                  ? "neutral"
                  : booking.status === "supplier_pending"
                    ? "warn"
                    : booking.status === "completed"
                      ? "neutral"
                      : "trust"
              }
            >
              {cancelled
                ? "Cancelled"
                : booking.status === "supplier_pending"
                  ? "Awaiting operator"
                  : booking.status === "completed"
                    ? "Completed"
                    : "Confirmed"}
            </Badge>
          </div>

          <ul className="divide-y divide-ink-200">
            {booking.items.map((item) => (
              <li key={item.id} className="flex gap-3 py-3">
                <Link
                  href={`/activities/${item.slug}`}
                  className="h-16 w-20 shrink-0 overflow-hidden rounded-lg"
                >
                  <Scene src={item.image} alt="" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/activities/${item.slug}`}
                    className="text-[0.95rem] font-bold leading-snug text-ink-900 hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-ink-500">
                    {formatDateLong(item.date)} · {item.time}
                  </p>
                  <p className="text-xs text-ink-500">{paxLabel(item.pax)}</p>
                </div>
                <p className="shrink-0 font-bold tnum">{priceIn(item.total, currency)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-3 space-y-1 border-t border-ink-200 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-600">Subtotal</span>
              <span className="tnum">{priceIn(booking.subtotal, currency)}</span>
            </div>
            {booking.discount.inr > 0 && (
              <div className="flex justify-between text-[var(--color-success)]">
                <span>Coupon {booking.couponCode}</span>
                <span className="tnum">−{priceIn(booking.discount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold">
              <span>Paid</span>
              <span className="tnum">{priceIn(booking.total, currency)}</span>
            </div>
            <p className="text-xs text-ink-500">{booking.paymentMethod}</p>
          </div>

          {booking.traveller.specialRequests && (
            <div className="mt-4 rounded-[var(--radius-control)] bg-shell p-3 text-sm">
              <p className="font-bold text-ink-900">Your notes to the operator</p>
              <p className="mt-0.5 text-ink-600">{booking.traveller.specialRequests}</p>
            </div>
          )}
        </Card>

        {/* Actions */}
        {!cancelled && booking.status !== "completed" && (
          <Card className="p-5">
            <h2 className="text-lg">Manage this booking</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <ButtonLink href={`/voucher/${booking.reference}`} variant="outline">
                <Download className="h-[1.15rem] w-[1.15rem]" />
                View voucher
              </ButtonLink>
              <Button variant="outline" onClick={() => setModifyOpen(true)}>
                <CalendarClock className="h-[1.15rem] w-[1.15rem]" />
                Change date
              </Button>
              <WhatsAppButton
                context={{
                  intent: "booking_support",
                  bookingReference: booking.reference,
                  placement: "booking_manage",
                }}
                label="Message us about this"
              />
              <Button variant="danger" onClick={() => void openCancel()}>
                <X className="h-[1.15rem] w-[1.15rem]" />
                Cancel booking
              </Button>
            </div>
            <p className="mt-3 text-xs text-ink-500">
              {booking.items[0]?.freeCancellationHours
                ? `Free cancellation up to ${booking.items[0].freeCancellationHours} hours before your start time. We show the exact refund before you confirm anything.`
                : "This booking is non-refundable, but message us — we can often move a date even when we can't refund."}
            </p>
          </Card>
        )}

        {booking.status === "completed" && !booking.reviewSubmitted && (
          <Card className="p-5">
            <h2 className="text-lg">How was it?</h2>
            <p className="mt-1.5 text-sm text-ink-600">
              Two minutes, and it genuinely changes which suppliers we keep selling. If you asked for
              Jain or veg food, tell us whether it actually arrived.
            </p>
            <ButtonLink href={`/reviews/${booking.reference}`} className="mt-3">
              Write a review
            </ButtonLink>
          </Card>
        )}

        {/* In-trip attach surface */}
        {upcoming && (
          <section>
            <h2 className="mb-1 text-xl">Add to this trip</h2>
            <p className="mb-4 text-sm text-ink-600">
              You&apos;re already going to be in Dubai on these dates. These are what other travellers
              added alongside this booking.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {crossSell.map((a, i) => (
                <ActivityCard
                  key={a.slug}
                  activity={a}
                  layout="compact"
                  position={i + 1}
                  source="booking_attach"
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-28">
        <Card className="p-5">
          <h2 className="text-lg">Who to contact</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                OUTLYY on WhatsApp
              </dt>
              <dd className="font-semibold text-ink-900">
                {wa ? `${wa} · replies in ~8 min` : "Replies in ~8 min"}
              </dd>
            </div>
            {emergency && emergencyTel && (
              <div>
                <dt className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                  24/7 emergency (in Dubai)
                </dt>
                <dd>
                  <a href={emergencyTel} className="font-semibold text-ink-900 underline">
                    {emergency}
                  </a>
                </dd>
              </div>
            )}
            {booking.supplierContact && (
              <div>
                <dt className="text-2xs font-bold uppercase tracking-wide text-ink-500">Operator</dt>
                <dd className="font-semibold text-ink-900">
                  {booking.supplierContact.name}
                  <br />
                  {booking.supplierContact.phone}
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-4">
            <WhatsAppButton
              block
              context={{
                intent: "booking_support",
                bookingReference: booking.reference,
                placement: "booking_sidebar",
              }}
            />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg">Traveller details</h2>
          <p className="mt-2 text-sm text-ink-600">
            {booking.traveller.fullName}
            <br />
            {booking.traveller.email}
            <br />
            {booking.traveller.countryCode} {booking.traveller.phone}
            {booking.traveller.hotel && (
              <>
                <br />
                {booking.traveller.hotel}
              </>
            )}
          </p>
          {booking.traveller.dietary && (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-success)]">
              <Check className="h-4 w-4" />
              {booking.traveller.dietary === "jain"
                ? "Jain meal confirmed with the operator"
                : `${booking.traveller.dietary} meal confirmed`}
            </p>
          )}
        </Card>
      </aside>

      {/* -------------------------------------------------- CANCEL FLOW */}
      <Sheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        description="You'll see the exact refund and when it lands before anything happens."
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCancelOpen(false)}>
              Keep booking
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={cancelling}
              disabled={loadingQuote}
              onClick={() => void confirmCancel()}
            >
              Cancel &amp; refund
            </Button>
          </div>
        }
      >
        {loadingQuote ? (
          <div className="space-y-3">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-20 w-full" />
          </div>
        ) : quote ? (
          <div className="space-y-4">
            <div className="rounded-[var(--radius-control)] bg-shell p-4">
              <p className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                You&apos;ll get back
              </p>
              <p className="font-display text-3xl font-bold tnum text-ink-900">
                ₹{quote.refundINR.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-sm text-ink-600">
                {quote.refundPercent}% of what you paid · credited to your original payment method in{" "}
                {quote.creditedInDays}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-ink-600">{quote.explanation}</p>
            {quote.feeINR > 0 && (
              <Alert tone="warning" title={`Operator retains ₹${quote.feeINR.toLocaleString("en-IN")}`}>
                You&apos;re past the free cancellation window for this experience.
              </Alert>
            )}
            <div className="rounded-[var(--radius-control)] border border-whatsapp/40 bg-[#f4fdf7] p-3.5">
              <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
                <MessageCircle className="h-4 w-4 text-whatsapp" />
                Before you cancel
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                If it&apos;s a date problem rather than a change of mind, we can usually move it
                instead — often at no cost. Takes about five minutes on WhatsApp.
              </p>
              <div className="mt-2.5">
                <WhatsAppButton
                  size="sm"
                  context={{
                    intent: "cancellation",
                    bookingReference: booking.reference,
                    placement: "cancel_sheet",
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <Alert tone="danger" title="We couldn't load your refund amount">
            Don&apos;t cancel blind — message us and we&apos;ll confirm the exact figure before
            anything is processed.
          </Alert>
        )}
      </Sheet>

      {/* -------------------------------------------------- MODIFY FLOW */}
      <Sheet
        open={modifyOpen}
        onClose={() => setModifyOpen(false)}
        title="Change your date"
        description="Subject to availability on the new date."
        footer={
          <Button
            block
            onClick={() => {
              track("booking_modified", {
                booking_reference: booking.reference,
                selected_date: newDate,
              });
              setModifyOpen(false);
              toast({
                tone: "success",
                title: "Date change requested",
                body: "We're confirming with the operator — you'll hear back within two hours.",
              });
            }}
          >
            Request this date
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            Currently booked for{" "}
            <strong className="font-bold text-ink-900">
              {formatDateLong(booking.items[0]?.date ?? "")}
            </strong>
            .
          </p>
          <DateStrip value={newDate} onChange={setNewDate} days={14} />
          <Alert tone="info" title="No change fee on this booking">
            This operator allows one free date change up to 24 hours before travel. If a fee ever
            applies, we show it here before you confirm — never afterwards.
          </Alert>
          <p className="flex items-start gap-2 text-xs text-ink-500">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Date changes need the operator to re-confirm, so this isn&apos;t instant. You&apos;ll get a
            WhatsApp message within two hours.
          </p>
        </div>
      </Sheet>
    </div>
  );
}

/** Small helper used by the account list. */
export function AddActivityCTA() {
  return (
    <ButtonLink href="/search" variant="outline" size="sm">
      <Plus className="h-4 w-4" />
      Add another activity
    </ButtonLink>
  );
}
