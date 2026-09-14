import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { CollectionCard } from "@/components/commerce/cards";
import { CompareTray } from "@/components/commerce/compare";
import { FloatingWhatsApp, WhatsAppCard } from "@/components/commerce/whatsapp";
import { Accordion } from "@/components/ui/accordion";
import { Breadcrumbs, Prose, SectionHeading } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { activitiesBySlugs } from "@/lib/data/activities";
import { collections, collectionBySlug } from "@/lib/data/collections";

export function generateStaticParams() {
  return collections.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = collectionBySlug(slug);
  if (!c) return { title: "Collection not found" };
  return {
    title: `${c.name} — Curated Dubai Experiences`,
    description: c.narrative.slice(0, 155),
    alternates: { canonical: `/collections/${c.slug}` },
  };
}

/**
 * EDITORIAL COLLECTION (PRD §5.4B)
 *
 * Hand-curated, narrative, image-led. Fewer SKUs, more context. This is the
 * page shape that serves Personas B and C, where credibility and framing
 * convert better than a filtered grid does.
 */
export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = collectionBySlug(slug);
  if (!collection) notFound();

  const items = activitiesBySlugs(collection.activitySlugs);
  const others = collections.filter((c) => c.slug !== collection.slug).slice(0, 3);
  const dark = collection.tone === "premium";

  return (
    <>
      <PageView pageType="collection" props={{ landing_page: collection.slug }} />

      <section className="relative overflow-hidden border-b border-ink-200">
        <div className="absolute inset-0">
          <Scene src={collection.heroImage} alt="" scrim />
          <div aria-hidden="true" className="absolute inset-0 hero-scrim" />
        </div>
        <div className="container-page relative py-14 text-white sm:py-20">
          <Breadcrumbs
            items={[
              { label: "Dubai", href: "/" },
              { label: "Collections", href: "/collections/first-time-dubai" },
              { label: collection.name },
            ]}
            className="mb-4 [&_a]:text-white/70 [&_span]:text-white"
          />
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-dune-300">
            {collection.audience}
          </p>
          <h1 className="max-w-3xl text-[2.1rem] leading-tight text-white sm:text-5xl">
            {collection.name}
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-white/85">{collection.tagline}</p>
        </div>
      </section>

      <section className="container-page py-10">
        <div className="mx-auto max-w-3xl">
          <Prose>
            <p className="text-[1.05rem]">{collection.narrative}</p>
          </Prose>
        </div>
      </section>

      <section className="container-page pb-12" aria-labelledby="picks">
        <SectionHeading
          id="picks"
          kicker={`${items.length} hand-picked`}
          title="In this collection"
          sub="Ordered deliberately — start at the top and work down."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a, i) => (
            <ActivityCard
              key={a.slug}
              activity={a}
              position={i + 1}
              source={`collection_${collection.slug}`}
              showCompare
              showInquiry
            />
          ))}
        </div>
      </section>

      {collection.faqs.length > 0 && (
        <section className="container-page pb-12">
          <div className="mx-auto max-w-3xl">
            <SectionHeading kicker="Before you plan" title="Questions about this collection" />
            <Accordion items={collection.faqs} />
          </div>
        </section>
      )}

      <section className="container-page pb-16">
        <WhatsAppCard
          tone={dark ? "dark" : "light"}
          context={{ intent: dark ? "concierge" : "general", placement: `collection_${collection.slug}` }}
          title={dark ? "Want this planned end to end?" : "Want help picking?"}
          body={
            dark
              ? "A trip designer will build the itinerary around your dates, brief every supplier and stay reachable on WhatsApp and by phone throughout your trip."
              : "Tell us who's travelling — ages, dietary needs, how much walking is realistic — and we'll build the plan and price it in rupees."
          }
        />

        <div className="mt-10">
          <SectionHeading title="Other collections" />
          <div className="grid gap-4 sm:grid-cols-3">
            {others.map((c) => (
              <CollectionCard key={c.slug} collection={c} />
            ))}
          </div>
        </div>

        <nav aria-label="Related links" className="mt-8">
          <ul className="flex flex-wrap gap-2 text-sm">
            {[
              { label: "All experiences", href: "/activities" },
              { label: "Combos & packages", href: "/dubai-attraction-combos" },
              { label: "For Indian travellers", href: "/dubai-activities-for-indians" },
              { label: "Available tomorrow", href: "/last-minute-dubai-activities" },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-block rounded-full border border-ink-300 bg-paper px-3.5 py-2 font-semibold text-ink-700 hover:border-ink-900"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      <CompareTray />
      <FloatingWhatsApp context={{ intent: "general", placement: "collection" }} raised />
    </>
  );
}
