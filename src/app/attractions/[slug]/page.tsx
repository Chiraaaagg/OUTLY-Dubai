import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Compass, Sparkles, Sun } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmFirstNote } from "@/components/commerce/inquiry-ui";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { toCard } from "@/lib/catalog/card";
import { ComboCard } from "@/components/commerce/cards";
import { FloatingWhatsApp, WhatsAppCard } from "@/components/commerce/whatsapp";
import { Accordion } from "@/components/ui/accordion";
import { Breadcrumbs, Card, Prose, SectionHeading } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { getActivitiesBySlugs } from "@/lib/catalog/server";
import { attractions, attractionBySlug } from "@/lib/data/collections";
import { combos } from "@/lib/data/combos";
import { Amount } from "@/components/commerce/price";

export function generateStaticParams() {
  return attractions.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = attractionBySlug(slug);
  if (!a) return { title: "Attraction not found" };
  return {
    title: `${a.name} — Tickets, Prices & Practical Info`,
    description: a.blurb.slice(0, 155),
    alternates: { canonical: `/attractions/${a.slug}` },
  };
}

/**
 * ATTRACTION HUB (PRD §5.4)
 *
 * The Tier A SEO magnet. It ranks for the attraction name, then routes traffic
 * to Tier B/C — which is why at least two internal links to margin-carrying
 * SKUs sit above the fold (AC-CAT-03), here as the ticket cards and the combo
 * band immediately below the practical-info panel.
 */
export default async function AttractionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const attraction = attractionBySlug(slug);
  if (!attraction) notFound();

  const tickets = await getActivitiesBySlugs(attraction.activitySlugs);
  const linkedCombos = combos.filter((c) =>
    c.includedSlugs.some((s) => attraction.activitySlugs.includes(s)),
  );

  return (
    <>
      <PageView pageType="attraction" props={{ landing_page: attraction.slug }} />

      <section className="relative overflow-hidden border-b border-ink-200">
        <div className="absolute inset-0">
          <Scene src={attraction.heroImage} alt="" scrim />
          <div aria-hidden="true" className="absolute inset-0 hero-scrim" />
        </div>
        <div className="container-page relative py-12 text-white sm:py-16">
          <Breadcrumbs
            items={[
              { label: "Dubai", href: "/" },
              { label: "Attractions", href: "/categories/dubai-attractions" },
              { label: attraction.name },
            ]}
            className="mb-4 [&_a]:text-white/70 [&_span]:text-white"
          />
          <h1 className="max-w-3xl text-[2.1rem] leading-tight text-white sm:text-5xl">
            {attraction.name}
          </h1>
          <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-white/85">
            {attraction.blurb}
          </p>
        </div>
      </section>

      {/* Combo routing block — on Tier A hubs the primary CTA is the combo, not a
          lone ticket inquiry (pivot §3.2). Price stays visible; the route changes. */}
      {linkedCombos[0] && (
        <section className="container-page pt-8" aria-labelledby="route-combo">
          <div className="rounded-[var(--radius-tile)] border border-sun-200 bg-sun-50 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-sun-700">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Most families pair this
                </p>
                <h2 id="route-combo" className="mt-1 text-xl sm:text-2xl">
                  Get {attraction.name} priced together with{" "}
                  {linkedCombos[0].name.split(":")[0].replace(/\s*\+.*$/, "")}
                </h2>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-700">
                  One inquiry, one reply, one confirmed price — and{" "}
                  <strong className="font-bold">
                    <Amount money={{ inr: linkedCombos[0].separatePrice.inr - linkedCombos[0].bundlePrice.inr, aed: linkedCombos[0].separatePrice.aed - linkedCombos[0].bundlePrice.aed }} /> per adult
                  </strong>{" "}
                  less than the same things separately. Single tickets are below if that&apos;s all you need.
                </p>
                <ConfirmFirstNote className="mt-2" />
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                <ButtonLink href={`/combos/${linkedCombos[0].slug}`} size="lg">
                  Get this priced with a combo
                </ButtonLink>
                <a href="#tickets" className="text-center text-sm font-bold text-sun-700 underline underline-offset-2">
                  View ticket details
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Tickets — the SEO job of this page; the commercial job is above */}
      <section className="container-page py-10" aria-labelledby="tickets">
        <SectionHeading
          id="tickets"
          kicker="All-in pricing"
          title={`${attraction.name} tickets`}
          sub="Every ticket type we sell for this attraction, with the real difference between them explained."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {tickets.map((a, i) => (
            <ActivityCard
              key={a.slug}
              activity={toCard(a)}
              position={i + 1}
              source={`attraction_${attraction.slug}`}
              showCompare
            />
          ))}
        </div>
      </section>

      {linkedCombos.length > 0 && (
        <section className="container-page pb-10" aria-labelledby="attraction-combos">
          <SectionHeading
            id="attraction-combos"
            kicker="Cheaper together"
            title="Packages that include this"
            sub="The separate-purchase price is shown next to the bundle price."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            {linkedCombos.map((c) => (
              <ComboCard key={c.slug} combo={c} />
            ))}
          </div>
        </section>
      )}

      {/* Practical info */}
      <section className="container-page pb-10" aria-labelledby="practical">
        <SectionHeading id="practical" kicker="Plan the visit" title="Practical information" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-lg">
              <Compass className="h-5 w-5 text-sun-500" aria-hidden="true" />
              The basics
            </h3>
            <dl className="space-y-2.5 text-sm">
              {attraction.practical.map((p) => (
                <div key={p.label}>
                  <dt className="font-bold text-ink-900">{p.label}</dt>
                  <dd className="text-ink-600">{p.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-lg">
              <Sun className="h-5 w-5 text-sun-500" aria-hidden="true" />
              Best time to go
            </h3>
            <Prose className="text-sm">
              <p>{attraction.bestTime}</p>
            </Prose>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-sun-500" aria-hidden="true" />
              Getting there
            </h3>
            <Prose className="text-sm">
              <p>{attraction.gettingThere}</p>
            </Prose>
          </Card>
        </div>
      </section>

      <section className="container-page pb-12">
        <div className="mx-auto max-w-3xl">
          <SectionHeading kicker="Asked constantly" title={`${attraction.name} FAQs`} />
          <Accordion items={attraction.faqs} />
        </div>
      </section>

      <section className="container-page pb-16">
        <WhatsAppCard
          context={{ intent: "availability", placement: `attraction_${attraction.slug}` }}
          title="Sold out on the date you want?"
          body="Cancellations release slots regularly, particularly for timed-entry attractions. Tell us the date and we'll watch for one and message you the moment it opens."
        />

        <nav aria-label="Related" className="mt-8">
          <ul className="flex flex-wrap gap-2 text-sm">
            {attractions
              .filter((a) => a.slug !== attraction.slug)
              .map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/attractions/${a.slug}`}
                    className="inline-block rounded-full border border-ink-300 bg-paper px-3.5 py-2 font-semibold text-ink-700 hover:border-ink-900"
                  >
                    {a.name}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </section>

      <FloatingWhatsApp context={{ intent: "availability", placement: "attraction" }} raised />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: attraction.faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
    </>
  );
}
