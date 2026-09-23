import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Check,
  Clock,
  MapPin,
  Minus,
  Smartphone,
  Users,
  Utensils,
  Zap,
} from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { toCard } from "@/lib/catalog/card";
import { ComboCard } from "@/components/commerce/cards";
import { BookingWidget, StickyBookingBar } from "@/components/commerce/booking-widget";
import { Gallery } from "@/components/commerce/gallery";
import { PriceBlock } from "@/components/commerce/price";
import { IndicativePriceNote } from "@/components/commerce/inquiry-ui";
import { SisterBrandReviews } from "@/components/commerce/sister-reviews";
import { TrustSummary } from "@/components/commerce/trust";
import { FloatingWhatsApp, WhatsAppCard } from "@/components/commerce/whatsapp";
import { Accordion } from "@/components/ui/accordion";
import {
  Badge,
  BestsellerBadge,
  ConfirmFirstBadge,
  FreeCancellationBadge,
  InstantBadge,
  PrivateBadge,
  SeniorFriendlyBadge,
  VegBadge,
  VerifiedSupplierBadge,
} from "@/components/ui/badge";
import { Breadcrumbs, Card, Rating, SectionHeading } from "@/components/ui/primitives";
import { Rail, RailItem } from "@/components/ui/rail";
import { getActivities, getActivityBySlug, getActivitiesBySlugs, getCategoryBySlug } from "@/lib/catalog/server";
import { combos } from "@/lib/data/combos";
import { formatDuration } from "@/lib/utils";

export const revalidate = 60;

export async function generateStaticParams() {
  return (await getActivities()).map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const activity = await getActivityBySlug(slug);
  if (!activity) return { title: "Activity not found" };
  return {
    title: activity.seo.title,
    description: activity.seo.description,
    keywords: activity.seo.keywords,
    alternates: { canonical: `/activities/${activity.slug}` },
    openGraph: {
      title: activity.seo.title,
      description: activity.seo.description,
      type: "website",
    },
  };
}

/**
 * ACTIVITY DETAIL PAGE (ADP)
 *
 * The most important page in the product. It has to do two jobs at once:
 * convert a self-serve buyer, and equip a comparison shopper who has three
 * competitor tabs open. That second job is why the inclusions/exclusions table
 * is exhaustive, why the cancellation policy is written in plain English near
 * the top, and why pickup coverage and meal details are on the page rather
 * than in a PDF after payment.
 *
 * Order is deliberate: everything needed to decide sits above the fold on
 * desktop and within two scrolls on mobile — what it is, who it's for, what's
 * included, the total, availability, cancellation terms, how to book, how to
 * get help.
 */
export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { slug } = await params;
  const { date } = await searchParams;
  const activity = await getActivityBySlug(slug);
  if (!activity) notFound();

  const category = await getCategoryBySlug(activity.categorySlug);
  const relatedAll = await getActivitiesBySlugs(activity.relatedSlugs);
  const related = relatedAll.slice(0, 4);
  const linkedCombos = combos.filter((c) => activity.comboSlugs.includes(c.slug));
  const frequentlyBooked = relatedAll.slice(0, 2);

  const attributes = [
    { icon: Clock, label: formatDuration(activity.durationMinutes) },
    {
      icon: Users,
      label: activity.isPrivate ? "Private experience" : "Shared experience",
    },
    {
      icon: MapPin,
      label: activity.pickupIncluded ? "Hotel pickup included" : "Meet at the venue",
    },
    {
      icon: Smartphone,
      label:
        activity.fulfilmentMode === "instant"
          ? activity.mobileVoucher
            ? "Mobile voucher"
            : "Printed ticket"
          : "Reply in ~30 min",
    },
  ];

  return (
    <>
      <PageView
        pageType="adp"
        props={{
          activity_slug: activity.slug,
          activity_category: activity.categorySlug,
          tier: activity.tier,
          price: activity.price.adult.inr,
          currency: "INR",
        }}
      />

      <div className="container-page pt-4">
        <Breadcrumbs
          items={[
            { label: "Dubai", href: "/" },
            { label: category?.shortName ?? "Activities", href: `/categories/${activity.categorySlug}` },
            { label: activity.title },
          ]}
          className="mb-3"
        />
      </div>

      {/* Gallery */}
      <div className="container-page">
        <Gallery
          images={activity.images}
          alt={activity.imageAlt}
          video={activity.video}
          badge={activity.badges.bestseller ? <BestsellerBadge /> : undefined}
        />
      </div>

      <div className="container-page grid grid-safe gap-8 py-6 lg:grid-cols-[1.55fr_1fr] lg:items-start">
        {/* ------------------------------------------------------------- MAIN */}
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight sm:text-[2.1rem]">{activity.title}</h1>
          <p className="mt-2 text-[1.02rem] leading-relaxed text-ink-600">{activity.subtitle}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-1 text-sm text-ink-600">
              <MapPin className="h-4 w-4 text-ink-400" aria-hidden="true" />
              {activity.location}
            </span>
          </div>

          {/* Key attributes strip — everything that decides the purchase,
              visible without scrolling (AC-ADP-04). */}
          <ul className="mt-5 grid grid-cols-2 gap-3 rounded-[var(--radius-card)] border border-ink-200 bg-paper p-4 sm:grid-cols-4">
            {attributes.map((a) => (
              <li key={a.label} className="flex items-start gap-2 text-sm text-ink-700">
                <a.icon className="mt-0.5 h-4 w-4 shrink-0 text-sun-500" aria-hidden="true" />
                <span className="leading-snug">{a.label}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-2">
            {activity.fulfilmentMode === "instant" ? (
              activity.confirmation === "instant" ? (
                <InstantBadge />
              ) : (
                <Badge tone="warn" icon={<Clock className="h-3.5 w-3.5" />}>
                  Operator confirms within 2 hours
                </Badge>
              )
            ) : (
              <ConfirmFirstBadge />
            )}
            <FreeCancellationBadge hours={activity.freeCancellationHours} />
            {activity.dietary.includes("jain") && <VegBadge jain />}
            {activity.suitability.includes("seniors") && <SeniorFriendlyBadge />}
            {activity.isPrivate && <PrivateBadge />}
            <VerifiedSupplierBadge />
          </div>

          {/* Mobile price + booking entry */}
          <div className="mt-6 lg:hidden">
            <PriceBlock band={activity.price} size="xl" />
            {activity.fulfilmentMode !== "instant" && <IndicativePriceNote className="mt-2" />}
          </div>

          {/* Meal & dietary — Persona A converts here */}
          {activity.mealNote && (
            <Card className="mt-6 border-[color-mix(in_oklab,var(--color-success)_25%,white)] bg-[var(--color-success-bg)]/60 p-5">
              <h2 className="flex items-center gap-2 text-lg">
                <Utensils className="h-5 w-5 text-[var(--color-success)]" aria-hidden="true" />
                Food &amp; dietary
              </h2>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-700">{activity.mealNote}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {activity.dietary.map((d) => (
                  <Badge key={d} tone="diet" size="sm">
                    {d === "non-veg" ? "Non-veg" : d === "jain" ? "Jain (no onion/garlic)" : d === "veg" ? "Pure vegetarian" : "Halal"}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Inclusions / exclusions — the anti-agent weapon */}
          <section className="mt-8" aria-labelledby="inclusions">
            <h2 id="inclusions" className="text-2xl">
              What&apos;s included — and what isn&apos;t
            </h2>
            <p className="mt-1.5 text-sm text-ink-600">
              Written out in full so you can compare this against any other listing without opening
              a PDF.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-3 text-[1.02rem] text-[var(--color-success)]">Included</h3>
                <ul className="space-y-2">
                  {activity.inclusions.map((i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-700">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]"
                        aria-hidden="true"
                      />
                      {i}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 text-[1.02rem] text-ink-500">Not included</h3>
                <ul className="space-y-2">
                  {activity.exclusions.map((i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-600">
                      <Minus className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                      {i}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </section>

          {/* Itinerary */}
          {activity.itinerary.length > 0 && (
            <section className="mt-8" aria-labelledby="itinerary">
              <h2 id="itinerary" className="text-2xl">
                How the day runs
              </h2>
              <ol className="mt-4 space-y-0">
                {activity.itinerary.map((stop, i) => (
                  <li key={stop.title} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sun-100 font-display text-sm font-bold text-sun-700">
                        {i + 1}
                      </span>
                      {i < activity.itinerary.length - 1 && (
                        <span aria-hidden="true" className="my-1 w-0.5 flex-1 bg-ink-200" />
                      )}
                    </div>
                    <div className="pb-6">
                      <p className="text-2xs font-extrabold uppercase tracking-[0.1em] text-ink-400">
                        {stop.time}
                        {stop.durationMin ? ` · ${formatDuration(stop.durationMin)}` : ""}
                      </p>
                      <h3 className="mt-0.5 text-[1.02rem] leading-snug">{stop.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-600">{stop.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Pickup & meeting point */}
          <section className="mt-8" aria-labelledby="meeting">
            <h2 id="meeting" className="text-2xl">
              {activity.pickupIncluded ? "Pickup & transfers" : "Where to meet"}
            </h2>
            <Card className="mt-4 p-5">
              <p className="text-sm leading-relaxed text-ink-700">
                <strong className="font-bold text-ink-900">Meeting point:</strong>{" "}
                {activity.meetingPoint}
              </p>
              {activity.pickupIncluded && (
                <>
                  <p className="mt-3 text-sm font-bold text-ink-900">Pickup areas covered</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {activity.pickupZones.map((z) => (
                      <span
                        key={z}
                        className="rounded-full border border-ink-200 bg-shell px-2.5 py-1 text-xs font-semibold text-ink-700"
                      >
                        {z}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 rounded-[var(--radius-control)] bg-lagoon-50 p-3 text-sm leading-relaxed text-lagoon-700">
                    <strong className="font-bold">If the driver is late:</strong> your voucher carries
                    an emergency number a person answers. Past 30 minutes we dispatch another vehicle
                    or refund the booking in full — and the failure goes on that supplier&apos;s
                    scorecard.
                  </p>
                </>
              )}
            </Card>
          </section>

          {/* Important info + cancellation, in plain language */}
          <section className="mt-8 grid gap-4 sm:grid-cols-2" aria-labelledby="important">
            <Card className="p-5">
              <h2 id="important" className="text-lg">
                Before you book
              </h2>
              <ul className="mt-3 space-y-2">
                {activity.importantInfo.map((i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-700">
                    <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sun-500" />
                    {i}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h2 className="text-lg">Cancellation policy</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                {activity.cancellationPolicy}
              </p>
              <p className="mt-3 text-xs text-ink-500">
                You can cancel yourself from{" "}
                <Link href="/manage-booking" className="font-bold text-sun-700 underline">
                  Manage booking
                </Link>{" "}
                — the exact refund amount and credit date are shown before you confirm.
              </p>
            </Card>
          </section>

          {/* Frequently booked together — cross-sell, placed after the decision
              content so it adds relevance rather than distracting from it. */}
          {frequentlyBooked.length > 0 && (
            <section className="mt-8" aria-labelledby="together">
              <SectionHeading
                id="together"
                kicker="Adds up well"
                title="Frequently booked together"
                sub="Families who booked this usually add one of these on another day."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {frequentlyBooked.map((a, i) => (
                  <ActivityCard
                    key={a.slug}
                    activity={toCard(a)}
                    layout="compact"
                    position={i + 1}
                    source="adp_cross_sell"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Combo upsell */}
          {linkedCombos.length > 0 && (
            <section className="mt-8" aria-labelledby="combo-upsell">
              <SectionHeading
                id="combo-upsell"
                kicker="Bundle and save"
                title="Save by booking this as a package"
                sub="The separate-purchase price is shown next to the bundle price, so you can check the saving."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {linkedCombos.map((c) => (
                  <ComboCard key={c.slug} combo={c} />
                ))}
              </div>
            </section>
          )}

          {/* OUTLYY has no reviews of its own yet, so the group's are shown and labelled. */}
          <SisterBrandReviews className="mt-10" limit={3} />

          {/* FAQ */}
          {activity.faqs.length > 0 && (
            <section className="mt-10" aria-labelledby="faq">
              <SectionHeading
                id="faq"
                kicker="Asked before every booking"
                title="Questions about this experience"
              />
              <Accordion items={activity.faqs} />
            </section>
          )}

          <WhatsAppCard
            className="mt-8"
            context={{
              intent: "activity",
              activityTitle: activity.title,
              activityUrl: `https://outlyy.com/activities/${activity.slug}`,
              placement: "adp_body",
            }}
            title="Still deciding? Ask before you commit to anything."
            body="Group of seven? Travelling with parents? Need Jain food confirmed in writing? Message us and a real person will tell you honestly whether this is the right choice — and book it for you if it is."
          />
        </div>

        {/* ---------------------------------------------------------- SIDEBAR */}
        <aside className="lg:sticky lg:top-28" id="book">
          <div className="hidden lg:block">
            <PriceBlock band={activity.price} size="xl" className="mb-4" />
          </div>
          <BookingWidget activity={activity} initialDate={date} />
          <Card className="mt-4 p-5">
            <h2 className="mb-3 text-[0.95rem]">Why book this with OUTLYY</h2>
            <TrustSummary />
          </Card>
        </aside>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="container-page pb-16" aria-labelledby="related">
          <SectionHeading
            id="related"
            kicker="You might also like"
            title="Similar experiences"
            href={`/categories/${activity.categorySlug}`}
          />
          <Rail ariaLabel="Similar experiences">
            {related.map((a, i) => (
              <RailItem key={a.slug}>
                <ActivityCard activity={toCard(a)} layout="rail" position={i + 1} source="adp_related" />
              </RailItem>
            ))}
          </Rail>
        </section>
      )}

      <StickyBookingBar activity={activity} />
      <FloatingWhatsApp context={{ intent: "activity", activityTitle: activity.title }} raised />

      {/* Structured data: Product + AggregateRating + FAQ + Breadcrumbs (AC-ADP-07) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Product",
                name: activity.title,
                description: activity.subtitle,
                brand: { "@type": "Brand", name: "OUTLYY" },
                offers: {
                  "@type": "Offer",
                  price: activity.price.adult.inr,
                  priceCurrency: "INR",
                  availability: "https://schema.org/InStock",
                  url: `https://outlyy.com/activities/${activity.slug}`,
                },
              },
              ...(activity.faqs.length
                ? [
                    {
                      "@type": "FAQPage",
                      mainEntity: activity.faqs.map((f) => ({
                        "@type": "Question",
                        name: f.q,
                        acceptedAnswer: { "@type": "Answer", text: f.a },
                      })),
                    },
                  ]
                : []),
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Dubai", item: "https://outlyy.com/" },
                  {
                    "@type": "ListItem",
                    position: 2,
                    name: category?.name ?? "Activities",
                    item: `https://outlyy.com/categories/${activity.categorySlug}`,
                  },
                  { "@type": "ListItem", position: 3, name: activity.title },
                ],
              },
            ],
          }),
        }}
      />
    </>
  );
}
