import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { CompareTray } from "@/components/commerce/compare";
import { ActiveFilterPills, FilterSidebar, FilterToolbar } from "@/components/commerce/filters";
import { FloatingWhatsApp, WhatsAppCard } from "@/components/commerce/whatsapp";
import { Accordion } from "@/components/ui/accordion";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Breadcrumbs, EmptyState, Prose, SectionHeading } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { categories, categoryBySlug } from "@/lib/data/categories";
import { activitiesBySlugs } from "@/lib/data/activities";
import { searchActivities } from "@/lib/search";
import type { Dietary, SearchFilters, SortKey, Suitability } from "@/lib/types";
import { Suspense } from "react";

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  return {
    title: `${category.name} — All-In Rupee Pricing`,
    description: category.intro.slice(0, 155),
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

/**
 * CATEGORY PAGE (functional type — PRD §5.4A)
 *
 * A filtered search with SEO content wrapped around it: unique H1, 300–600
 * words of genuinely useful intro copy, curated top SKUs, an FAQ block and
 * internal links to related categories and attractions (AC-CAT-01).
 *
 * Rendered server-side and crawlable without JavaScript (AC-CAT-02) — the
 * filter components are the only client code and they merely write to the URL.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = categoryBySlug(slug);
  if (!category) notFound();

  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const list = (k: string) => (get(k) ?? "").split(",").filter(Boolean);

  const filters: SearchFilters = {
    category: category.slug,
    when: get("when") as SearchFilters["when"],
    maxPrice: get("maxPrice") ? Number(get("maxPrice")) : undefined,
    dietary: list("dietary") as Dietary[],
    suitability: list("suitability") as Suitability[],
    privateOnly: get("privateOnly") === "1",
    pickup: get("pickup") === "1",
    instant: get("instant") === "1",
    freeCancellation: get("freeCancellation") === "1",
    duration: get("duration") as SearchFilters["duration"],
    rating: get("rating") ? Number(get("rating")) : undefined,
    sort: (get("sort") as SortKey) ?? "recommended",
  };

  const result = searchActivities(filters);
  const featured = activitiesBySlugs(category.featuredSlugs);
  const related = category.relatedSlugs
    .map(categoryBySlug)
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <>
      <PageView
        pageType="category"
        props={{ activity_category: category.slug, result_count: result.total }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-ink-200">
        <div className="absolute inset-0">
          <Scene src={category.heroImage} alt="" scrim />
          <div aria-hidden="true" className="absolute inset-0 hero-scrim" />
        </div>
        <div className="container-page relative py-10 text-white sm:py-14">
          <Breadcrumbs
            items={[{ label: "Dubai", href: "/" }, { label: category.shortName }]}
            className="mb-3 [&_a]:text-white/70 [&_span]:text-white"
          />
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-dune-300">
            {category.tagline}
          </p>
          <h1 className="max-w-3xl text-[2rem] leading-tight text-white sm:text-4xl">
            {category.name}
          </h1>
          <p className="mt-3 max-w-2xl text-[0.975rem] leading-relaxed text-white/85">
            {category.intro.split(". ").slice(0, 2).join(". ")}.
          </p>
        </div>
      </section>

      {/* Curated top picks — Tier B/C first, before the raw grid */}
      <section className="container-page py-10" aria-labelledby="top-picks">
        <SectionHeading
          id="top-picks"
          kicker="Our picks"
          title={`The ${category.shortName.toLowerCase()} we'd book ourselves`}
          sub="Curated first, catalogue second. These are the ones we send our own families on."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {featured.map((a, i) => (
            <ActivityCard
              key={a.slug}
              activity={a}
              position={i + 1}
              source="category_featured"
              showCompare
              showInquiry
            />
          ))}
        </div>
      </section>

      {/* Full filtered list */}
      <div className="container-page grid gap-8 pb-12 lg:grid-cols-[17rem_1fr]">
        <Suspense fallback={<div className="hidden lg:block" />}>
          <FilterSidebar resultCount={result.total} />
        </Suspense>

        <div className="min-w-0">
          <h2 className="mb-4 text-2xl">
            All {category.shortName.toLowerCase()} ({result.total})
          </h2>

          <Suspense fallback={null}>
            <FilterToolbar resultCount={result.total} />
            <ActiveFilterPills />
          </Suspense>

          {result.activities.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {result.activities.map((a, i) => (
                <ActivityCard
                  key={a.slug}
                  activity={a}
                  position={i + 1}
                  source="category_grid"
                  showCompare
                  showInquiry
                />
              ))}
            </div>
          ) : result.relaxed ? (
            <div>
              <Alert tone="info" title="No exact matches in this category" className="mb-5">
                {result.relaxed.message}
              </Alert>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {result.relaxed.activities.map((a, i) => (
                  <ActivityCard key={a.slug} activity={a} position={i + 1} source="category_relaxed" />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Nothing matches those filters here"
              body="Try removing a filter, or ask us — we can often arrange something that isn't in the public catalogue."
              action={<ButtonLink href={`/categories/${category.slug}`}>Clear filters</ButtonLink>}
            />
          )}
        </div>
      </div>

      {/* SEO body copy — unique, useful, ≥300 words (AC-CAT-01) */}
      <section className="container-page pb-10" aria-labelledby="about">
        <div className="mx-auto max-w-3xl">
          <h2 id="about" className="text-2xl">
            About {category.name.toLowerCase()}
          </h2>
          <Prose className="mt-3">
            <p>{category.intro}</p>
          </Prose>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-page pb-10" aria-labelledby="cat-faq">
        <div className="mx-auto max-w-3xl">
          <SectionHeading id="cat-faq" kicker="Good to know" title="Common questions" />
          <Accordion items={category.faqs} />
        </div>
      </section>

      {/* WhatsApp + internal links */}
      <section className="container-page pb-16">
        <WhatsAppCard
          context={{ intent: "general", placement: `category_${category.slug}` }}
          title={`Not sure which ${category.shortName.toLowerCase()} to pick?`}
          body="Tell us who's coming — ages, dietary needs, mobility — and we'll tell you honestly which one suits your group, then book it for you if you'd like."
        />

        <nav aria-label="Related categories" className="mt-8">
          <h2 className="mb-3 text-lg">Related categories</h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/categories/${c.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-paper px-3.5 py-2 text-sm font-semibold text-ink-700 hover:border-ink-900"
                >
                  <span aria-hidden="true">{c.emoji}</span>
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/dubai-attraction-combos"
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-paper px-3.5 py-2 text-sm font-semibold text-ink-700 hover:border-ink-900"
              >
                💰 Combos &amp; packages
              </Link>
            </li>
          </ul>
        </nav>
      </section>

      <CompareTray />
      <FloatingWhatsApp context={{ intent: "general", placement: "category" }} raised />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "FAQPage",
                mainEntity: category.faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Dubai", item: "https://outly.in/" },
                  { "@type": "ListItem", position: 2, name: category.name },
                ],
              },
            ],
          }),
        }}
      />
    </>
  );
}
