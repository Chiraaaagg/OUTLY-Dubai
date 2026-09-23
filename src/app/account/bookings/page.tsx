import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { toDateKey } from "@/lib/utils";
import { customerService } from "@/server/services/customer.service";
import { OrderRow, orderFirstDate } from "../_components/order-row";
import { requireCustomer } from "../_lib/session";

export const metadata: Metadata = {
  title: "My trips",
  robots: { index: false, follow: false },
};

/**
 * MY TRIPS (customer-auth contract §4)
 *
 * Paid orders linked to the signed-in phone. Reference, status, items and
 * total — and a WhatsApp follow-up with the reference pre-filled, because
 * there is no self-serve order page in inquiry mode (`/booking/[reference]`
 * is a retained fixture surface and cannot render these). Upcoming first,
 * then past and cancelled.
 */
export default async function BookingsPage() {
  const session = await requireCustomer("/account/bookings");
  const orders = await customerService.listOrders(session);
  const today = toDateKey(new Date());

  const isPast = (o: (typeof orders)[number]) => {
    if (o.status === "cancelled" || o.status === "completed") return true;
    const d = orderFirstDate(o);
    return Boolean(d && d < today);
  };
  const upcoming = orders
    .filter((o) => !isPast(o))
    .sort((a, b) => (orderFirstDate(a) ?? "9999").localeCompare(orderFirstDate(b) ?? "9999"));
  const past = orders
    .filter(isPast)
    .sort((a, b) => (orderFirstDate(b) ?? "").localeCompare(orderFirstDate(a) ?? ""));

  return (
    <>
      <PageView pageType="account_bookings" />

      <section aria-labelledby="upcoming">
        <h2 id="upcoming" className="mb-4 text-2xl">
          Upcoming
        </h2>
        {upcoming.length ? (
          <ul className="space-y-4">
            {upcoming.map((o) => (
              <li key={o.reference}>
                <OrderRow order={o} placement="account_bookings" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
          illustration="bookings"
            icon={<CalendarDays className="h-6 w-6" />}
            title="No trips booked yet"
            body="A trip lands here once an inquiry is confirmed and paid. Until then, everything you've asked us about is under My inquiries."
            action={<ButtonLink href="/account/inquiries">See my inquiries</ButtonLink>}
            secondary={
              <ButtonLink href="/search" variant="outline">
                Browse experiences
              </ButtonLink>
            }
          />
        )}
      </section>

      <section className="mt-10" aria-labelledby="past">
        <h2 id="past" className="mb-4 text-2xl">
          Past trips
        </h2>
        {past.length ? (
          <ul className="space-y-4">
            {past.map((o) => (
              <li key={o.reference}>
                <OrderRow order={o} placement="account_bookings" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-600">Nothing here yet.</p>
        )}
      </section>

      <p className="mt-8 text-sm text-ink-600">
        Paid with a different number? Trips are linked to the phone you sign in with. Message us
        on WhatsApp with the reference and we&apos;ll move it across, or{" "}
        <Link href="/manage-booking" className="font-bold text-sun-700 underline underline-offset-2">
          look it up by reference
        </Link>
        .
      </p>
    </>
  );
}
