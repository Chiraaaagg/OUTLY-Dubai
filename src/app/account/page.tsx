import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Heart, Inbox, LifeBuoy } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { toCard } from "@/lib/catalog/card";
import { CustomerInquiryCard } from "@/components/commerce/inquiry-ui";
import { WhatsAppCard } from "@/components/commerce/whatsapp";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, SectionHeading } from "@/components/ui/primitives";
import { getActivities } from "@/lib/catalog/server";
import { isClosedStatus } from "@/lib/inquiry-stages";
import { toDateKey } from "@/lib/utils";
import { customerService } from "@/server/services/customer.service";
import { OrderRow, orderFirstDate } from "./_components/order-row";
import { requireCustomer } from "./_lib/session";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/**
 * ACCOUNT DASHBOARD (customer-auth contract §4)
 *
 * Real data only: the open inquiry with its agent and WhatsApp follow-up
 * first (in inquiry mode that is the live thing), then the next paid trip
 * if there is one, then the four places a returning customer goes. Empty
 * states say what they mean — a first-time visitor sees "nothing yet", not a
 * demo.
 */
export default async function AccountPage() {
  const session = await requireCustomer("/account");
  const [inquiries, orders] = await Promise.all([
    customerService.listInquiries(session),
    customerService.listOrders(session),
  ]);

  const open = inquiries.filter((i) => !isClosedStatus(i.status));
  const today = toDateKey(new Date());
  const upcoming = orders
    .filter((o) => o.status !== "cancelled" && o.status !== "completed")
    .filter((o) => {
      const d = orderFirstDate(o);
      return !d || d >= today;
    })
    .sort((a, b) => (orderFirstDate(a) ?? "9999").localeCompare(orderFirstDate(b) ?? "9999"));

  const nextInquiry = open[0];
  const nextTrip = upcoming[0];
  const recommended = (await getActivities()).filter((a) => a.tier === "B" || a.tier === "C").slice(0, 3);

  return (
    <>
      <PageView pageType="account_dashboard" />

      <section aria-labelledby="dash-inquiry" className="mb-6">
        <h2 id="dash-inquiry" className="sr-only">
          Current inquiry
        </h2>
        {nextInquiry ? (
          <>
            <CustomerInquiryCard inquiry={nextInquiry} placement="account_dashboard" />
            {open.length > 1 && (
              <ButtonLink href="/account/inquiries" variant="ghost" size="sm" className="mt-2">
                All {open.length} open inquiries
              </ButtonLink>
            )}
          </>
        ) : (
          <EmptyState
          illustration="inquiries"
            icon={<Inbox className="h-6 w-6" />}
            title="No open inquiries"
            body="Ask us to check availability and price on anything — it appears here with who's handling it and when they'll reply."
            action={<ButtonLink href="/search">Browse experiences</ButtonLink>}
          />
        )}
      </section>

      {nextTrip && (
        <section aria-labelledby="dash-trip" className="mb-6">
          <h2 id="dash-trip" className="mb-3 text-xl">
            Next trip
          </h2>
          <OrderRow order={nextTrip} placement="account_dashboard" />
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Inbox,
            label: "My inquiries",
            sub: open.length === 1 ? "1 open" : `${open.length} open`,
            href: "/account/inquiries",
          },
          {
            icon: CalendarDays,
            label: "My trips",
            sub: upcoming.length ? `${upcoming.length} upcoming` : "Nothing booked yet",
            href: "/account/bookings",
          },
          { icon: Heart, label: "Saved activities", sub: "Your shortlist", href: "/account/saved" },
          { icon: LifeBuoy, label: "Help", sub: "WhatsApp, reply in ~30 min", href: "/support" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-[var(--radius-card)] border border-ink-200 bg-paper p-4 transition-transform [@media(hover:hover)]:hover:-translate-y-0.5"
          >
            <item.icon className="mb-2 h-5 w-5 text-sun-500" aria-hidden="true" />
            <p className="font-bold text-ink-900">{item.label}</p>
            <p className="text-sm text-ink-600">{item.sub}</p>
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <SectionHeading kicker="Popular with our customers" title="Worth a look" href="/search" />
        <div className="grid gap-4 sm:grid-cols-3">
          {recommended.map((a, i) => (
            <ActivityCard
              key={a.slug}
              activity={toCard(a)}
              layout="compact"
              position={i + 1}
              source="account_recommendations"
            />
          ))}
        </div>
      </section>

      <WhatsAppCard
        className="mt-8"
        context={{ intent: "general", placement: "account_dashboard" }}
        title="Planning another trip?"
        body="Tell us the dates and we'll put together an itinerary and confirm it with the operators before you pay anything."
      />
    </>
  );
}
