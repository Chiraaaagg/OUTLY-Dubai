import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Download, Star } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { pastBookings, upcomingBookings } from "@/lib/data/bookings";
import type { Booking } from "@/lib/types";
import { formatDateLong, paxLabel } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My trips",
  robots: { index: false, follow: false },
};

/**
 * MY TRIPS — grouped by trip rather than by order (PRD §5.9), because a family
 * that booked five activities across two orders thinks of it as one Dubai trip.
 */
export default function BookingsPage() {
  return (
    <>
      <PageView pageType="account_bookings" />

      <section aria-labelledby="upcoming">
        <h2 id="upcoming" className="mb-4 text-2xl">
          Upcoming
        </h2>
        {upcomingBookings.length ? (
          <ul className="space-y-4">
            {upcomingBookings.map((b) => (
              <li key={b.reference}>
                <BookingRow booking={b} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title="No trips booked yet"
            body="When you book something it'll appear here with your voucher, your driver details and everything you need on the day."
            action={<ButtonLink href="/search">Browse experiences</ButtonLink>}
          />
        )}
      </section>

      <section className="mt-10" aria-labelledby="past">
        <h2 id="past" className="mb-4 text-2xl">
          Past trips
        </h2>
        {pastBookings.length ? (
          <ul className="space-y-4">
            {pastBookings.map((b) => (
              <li key={b.reference}>
                <BookingRow booking={b} past />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-600">Nothing here yet.</p>
        )}
      </section>

      <p className="mt-8 text-sm text-ink-600">
        Booked as a guest?{" "}
        <Link href="/manage-booking" className="font-bold text-sun-700 underline underline-offset-2">
          Find that booking by reference
        </Link>{" "}
        — we&apos;ll link it to this account automatically if the phone or email matches.
      </p>
    </>
  );
}

function BookingRow({ booking, past }: { booking: Booking; past?: boolean }) {
  const item = booking.items[0];
  const extra = booking.items.length - 1;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href={`/booking/${booking.reference}`}
          className="h-24 w-full shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-32"
        >
          <Scene src={item.image} alt="" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                booking.status === "confirmed"
                  ? "trust"
                  : booking.status === "supplier_pending"
                    ? "warn"
                    : "neutral"
              }
              size="sm"
            >
              {booking.status === "supplier_pending"
                ? "Awaiting operator"
                : booking.status.replace(/_/g, " ")}
            </Badge>
            <span className="text-xs font-bold tnum text-ink-500">{booking.reference}</span>
          </div>

          <Link href={`/booking/${booking.reference}`} className="mt-1 block">
            <h3 className="text-[1.02rem] leading-snug text-ink-900 hover:underline">
              {item.title}
              {extra > 0 && (
                <span className="font-sans text-sm font-semibold text-ink-500">
                  {" "}
                  + {extra} more
                </span>
              )}
            </h3>
          </Link>
          <p className="mt-0.5 text-sm text-ink-600">
            {formatDateLong(item.date)} · {item.time} · {paxLabel(item.pax)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          {past ? (
            booking.status === "completed" && !booking.reviewSubmitted ? (
              <ButtonLink href={`/reviews/${booking.reference}`} size="sm">
                <Star className="h-4 w-4" />
                Write a review
              </ButtonLink>
            ) : (
              <ButtonLink href={`/booking/${booking.reference}`} variant="outline" size="sm">
                View details
              </ButtonLink>
            )
          ) : (
            <>
              <ButtonLink href={`/voucher/${booking.reference}`} size="sm">
                <Download className="h-4 w-4" />
                Voucher
              </ButtonLink>
              <ButtonLink href={`/booking/${booking.reference}`} variant="outline" size="sm">
                Manage
              </ButtonLink>
              <WhatsAppButton
                size="sm"
                variant="ghost"
                label="Get help"
                context={{
                  intent: "booking_support",
                  bookingReference: booking.reference,
                  placement: "account_bookings",
                }}
              />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
