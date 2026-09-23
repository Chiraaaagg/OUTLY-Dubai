import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { toCard } from "@/lib/catalog/card";
import { CompareTray } from "@/components/commerce/compare";
import { ActiveFilterPills, FilterSidebar, FilterToolbar } from "@/components/commerce/filters";
import { FloatingWhatsApp, WhatsAppCard } from "@/components/commerce/whatsapp";
import { Accordion } from "@/components/ui/accordion";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Breadcrumbs, Card, EmptyState, Prose, SectionHeading } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { getActivities, getActivitiesBySlugs, getCategories, getCategoryBySlug } from "@/lib/catalog/server";
import { searchActivities } from "@/lib/search";
import type { Dietary, SearchFilters, SortKey, Suitability } from "@/lib/types";
import { Suspense } from "react";

export const revalidate = 60;

export async function generateStaticParams() {
  return (await getCategories()).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  return {
    title: `${category.name} — All-In Pricing`,
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
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  const [allActivities, allCategories] = await Promise.all([getActivities(), getCategories()]);

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

  const result = searchActivities(filters, allActivities);
  const featured = await getActivitiesBySlugs(category.featuredSlugs);
  const related = category.relatedSlugs
    .map((s) => allCategories.find((c) => c.slug === s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  /** Two-column reading layout on lg only when the copy is long enough to need it. */
  const longIntro = category.intro.length >= 900;

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

      {/*
       * Catalogue area (audit S06): the sticky filter sidebar starts at the top
       * of this grid, and the curated picks live in the right column above the
       * full list — Tier B/C first, catalogue second, without pushing the
       * filters below the fold.
       */}
      <div className="container-page grid grid-safe gap-8 py-10 lg:grid-cols-[17rem_1fr]">
        <Suspense fallback={<div className="hidden lg:block" />}>
          <FilterSidebar resultCount={result.total} />
        </Suspense>

        <div className="min-w-0">
          {featured.length > 0 && (
            <section className="mb-10" aria-labelledby="top-picks">
              <SectionHeading
                id="top-picks"
                kicker="Our picks"
                title={`The ${category.shortName.toLowerCase()} we'd book ourselves`}
                sub="Curated first, catalogue second. These are the ones we send our own families on."
              />
              {/* 2 × 2 of compact cards on lg — visible, stable, never dominant. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {featured.map((a, i) => (
                  <ActivityCard
                    key={a.slug}
                    activity={toCard(a)}
                    layout="compact"
                    position={i + 1}
                    source="category_featured"
                    showCompare
                    showInquiry
                  />
                ))}
              </div>
            </section>
          )}

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
                  activity={toCard(a)}
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
                  <ActivityCard key={a.slug} activity={toCard(a)} position={i + 1} source="category_relaxed" />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
          illustration="filters"
              title="Nothing matches those filters here"
              body="Try removing a filter, or ask us — we can often arrange something that isn't in the public catalogue."
              action={<ButtonLink href={`/categories/${category.slug}`}>Clear filters</ButtonLink>}
            />
          )}
        </div>
      </div>

      {/* SEO body copy — unique, useful, ≥300 words (AC-CAT-01). Audit S05: same
          heading + paper surface treatment as the FAQ block below it. */}
      <section className="container-page pb-10" aria-labelledby="about">
        <div className={longIntro ? undefined : "mx-auto max-w-3xl"}>
          <SectionHeading id="about" kicker="About" title={`About ${category.name.toLowerCase()}`} />
          <Card className="p-5 sm:p-6">
            <Prose className={longIntro ? "lg:columns-2 lg:gap-10" : undefined}>
              <p>{category.intro}</p>
            </Prose>
          </Card>
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
                  { "@type": "ListItem", position: 1, name: "Dubai", item: "https://outlyy.com/" },
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
