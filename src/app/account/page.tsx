import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Heart, Inbox, LifeBuoy, Ticket } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { WhatsAppCard } from "@/components/commerce/whatsapp";
import { ButtonLink } from "@/components/ui/button";
import { Card, SectionHeading } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { Badge } from "@/components/ui/badge";
import { activities } from "@/lib/data/activities";
import { demoUser, upcomingBookings } from "@/lib/data/bookings";
import { openInquiries } from "@/lib/data/inquiries";
import { AgentCard } from "@/components/commerce/inquiry-ui";
import { WhatsAppButton } from "@/components/commerce/whatsapp";
import { formatDateLong, parseDateKey, priceIn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/**
 * ACCOUNT DASHBOARD (PRD §5.9)
 *
 * Upcoming trip first with a countdown, then quick actions. A returning
 * customer's most common intent is "where's my voucher" or "what time is my
 * pickup" — both are one tap from here.
 */
export default function AccountPage() {
  const next = upcomingBookings[0];
  const nextDate = next?.items[0]?.date;
  const daysAway = nextDate
    ? Math.max(
        0,
        Math.round((parseDateKey(nextDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      )
    : null;

  const recommended = activities.filter((a) => a.tier === "B" || a.tier === "C").slice(0, 3);

  return (
    <>
      <PageView pageType="account_dashboard" props={{ user_segment: demoUser.segment }} />

      {/* Open inquiry first — in inquiry mode this is the live thing (pivot §2.1). */}
      {openInquiries[0] && (
        <Card className="mb-6 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="heat">Inquiry in progress</Badge>
            <span className="text-xs font-bold tnum text-ink-500">{openInquiries[0].reference}</span>
          </div>
          <h2 className="mt-2 text-xl leading-snug">
            {openInquiries[0].items[0]?.title ?? "Trip planning request"}
            {openInquiries[0].items.length > 1 && (
              <span className="font-sans text-sm font-semibold text-ink-500">
                {" "}
                + {openInquiries[0].items.length - 1} more
              </span>
            )}
          </h2>
          {openInquiries[0].agent && (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <AgentCard agent={openInquiries[0].agent} className="flex-1 border-0 bg-shell p-3" />
              <WhatsAppButton
                size="md"
                context={{
                  intent: "inquiry_followup",
                  inquiryReference: openInquiries[0].reference,
                  placement: "account_dashboard",
                }}
                label={`Message ${openInquiries[0].agent.name.split(" ")[0]}`}
              />
            </div>
          )}
          <ButtonLink href="/account/inquiries" variant="ghost" size="sm" className="mt-3">
            All inquiries
          </ButtonLink>
        </Card>
      )}

      {next && (
        <Card className="mb-6 overflow-hidden">
          <div className="grid sm:grid-cols-[0.8fr_1.2fr]">
            <div className="relative min-h-[10rem]">
              <Scene src={next.items[0].image} alt="" />
            </div>
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={next.status === "supplier_pending" ? "warn" : "trust"}>
                  {next.status === "supplier_pending" ? "Awaiting operator" : "Confirmed"}
                </Badge>
                {daysAway !== null && (
                  <span className="text-xs font-bold text-sun-600">
                    {daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `In ${daysAway} days`}
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-xl leading-snug">{next.items[0].title}</h2>
              <p className="mt-1 text-sm text-ink-600">
                {formatDateLong(next.items[0].date)} · {next.items[0].time}
              </p>
              {next.driver && (
                <p className="mt-2 rounded-[var(--radius-control)] bg-lagoon-50 p-2.5 text-sm text-lagoon-700">
                  Driver {next.driver.name} · {next.driver.phone} · pickup {next.driver.window}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href={`/voucher/${next.reference}`} size="sm">
                  <Ticket className="h-4 w-4" />
                  View voucher
                </ButtonLink>
                <ButtonLink href={`/booking/${next.reference}`} variant="outline" size="sm">
                  Manage booking
                </ButtonLink>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Inbox, label: "My inquiries", sub: `${openInquiries.length} open`, href: "/account/inquiries" },
          { icon: CalendarDays, label: "My trips", sub: `${upcomingBookings.length} upcoming`, href: "/account/bookings" },
          { icon: Heart, label: "Saved activities", sub: "Your shortlist", href: "/account/saved" },
          { icon: LifeBuoy, label: "Help", sub: "WhatsApp in ~30 min", href: "/support" },
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

      {/* Referral / credits card removed — loyalty is V2 (pivot §2.1). Route retained. */}

      <section className="mt-8">
        <SectionHeading
          kicker="Based on what you've booked"
          title="You might like these next"
          href="/search"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {recommended.map((a, i) => (
            <ActivityCard
              key={a.slug}
              activity={a}
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
