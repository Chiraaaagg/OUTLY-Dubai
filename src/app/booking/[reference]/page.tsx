import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageView } from "@/components/analytics/page-view";
import { BookingDetail } from "@/components/commerce/booking-detail";
import { Breadcrumbs } from "@/components/ui/primitives";
import { bookings, bookingByReference } from "@/lib/data/bookings";

export function generateStaticParams() {
  return bookings.map((b) => ({ reference: b.reference }));
}

export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
};

/**
 * Public booking lookup detail (PRD §4.1 /booking/[bookingRef]).
 *
 * Reachable without an account — reference plus the email or phone used to
 * book is enough. Guest checkout would be pointless if managing the booking
 * afterwards required the account we told people they didn't need.
 */
export default async function BookingPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const booking = bookingByReference(reference);
  if (!booking) notFound();

  return (
    <div className="container-page py-6 pb-20">
      <PageView
        pageType="booking_detail"
        props={{ booking_reference: booking.reference, booking_status: booking.status }}
      />
      <Breadcrumbs
        items={[
          { label: "Dubai", href: "/" },
          { label: "My trips", href: "/account/bookings" },
          { label: booking.reference },
        ]}
        className="mb-3"
      />
      <h1 className="mb-6 text-[1.75rem] sm:text-3xl">Manage your booking</h1>
      <BookingDetail booking={booking} />
    </div>
  );
}
