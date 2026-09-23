import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { toCard } from "@/lib/catalog/card";
import { BenefitCard, ComboCard } from "@/components/commerce/cards";
import { ComparisonTable } from "@/components/commerce/compare";
import { CompareTray } from "@/components/commerce/compare";
import { StickyLandingCTA } from "@/components/commerce/sticky-cta";
import { ConfirmFirstNote, ResponsePromise } from "@/components/commerce/inquiry-ui";
import { SisterBrandReviews } from "@/components/commerce/sister-reviews";
import { SocialProofStrip, WhyOutlyy } from "@/components/commerce/trust";
import { FloatingWhatsApp, WhatsAppCard } from "@/components/commerce/whatsapp";
import { Accordion } from "@/components/ui/accordion";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs, Prose, SectionHeading } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { getActivitiesBySlugs, getCategories } from "@/lib/catalog/server";
import { combos } from "@/lib/data/combos";
import { Rail, RailItem } from "@/components/ui/rail";
import type { LandingPage } from "@/lib/data/landing-pages";

/**
 * SEO LANDING PAGE TEMPLATE
 *
 * One layout, driven entirely by config in src/lib/data/landing-pages.ts. Every
 * instance carries page-specific messaging, activities, FAQs, metadata and CTAs
 * — the module order is shared, the content never is.
 *
 * PRD §7 quality gate: 400+ words of genuinely unique, useful copy per page,
 * with real prices, real inclusions and a real answer to the search query.
 * Thin templated doorway pages get penalised and waste the entire SEO spend, so
 * `body` is required config rather than an optional field.
 *
 * Module order is conversion-ordered, not aesthetically ordered:
 *   hero (answers the query) → benefits (why us) → activities (the goods)
 *   → comparison (the decision) → proof → FAQs (objections) → internal links
 */
export async function LandingPageView({ page }: { page: LandingPage }) {
  const activities = await getActivitiesBySlugs(page.activitySlugs);
  const comparison = page.comparison ? await getActivitiesBySlugs(page.comparison.slugs) : [];
  const pageCombos = combos.filter((c) => page.comboSlugs?.includes(c.slug));
  const allCategories = await getCategories();
  const related = page.relatedCategories
    .map((s) => allCategories.find((c) => c.slug === s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const cheapest = activities.reduce(
    (min, a) => Math.min(min, a.price.adult.inr),
    Number.POSITIVE_INFINITY,
  );

  return (
    <>
      <PageView pageType="landing" landing props={{ landing_page: page.slug }} />

      {/* HERO — must answer the search query in the first screen */}
      <section className="relative overflow-hidden border-b border-ink-200">
        <div className="absolute inset-0">
          <Scene src={page.heroImage} alt="" scrim />
          <div aria-hidden="true" className="absolute inset-0 hero-scrim" />
        </div>
        <div className="container-page relative py-12 text-white sm:py-16">
          <Breadcrumbs
            items={[{ label: "Dubai", href: "/" }, { label: page.intentLabel }]}
            className="mb-4 [&_a]:text-white/70 [&_span]:text-white"
          />
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-dune-300">
            {page.heroKicker}
          </p>
          <h1 className="max-w-3xl text-[2.1rem] leading-tight text-white sm:text-5xl">{page.h1}</h1>
          <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-white/85">
            {page.heroSub}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="#experiences" size="lg">
              Check availability &amp; price
              {Number.isFinite(cheapest) && ` · from ₹${cheapest.toLocaleString("en-IN")}`}
            </ButtonLink>
            <ButtonLink href="#faq" variant="outline" size="lg" className="bg-white/10 text-white">
              Read the FAQs
            </ButtonLink>
          </div>
          {/* Confirm-first explainer above the fold (pivot §2.1 SEO row). */}
          <div className="mt-4 max-w-xl rounded-[var(--radius-control)] bg-white/10 p-3 text-white backdrop-blur">
            <ConfirmFirstNote className="text-white/90 [&_svg]:text-lagoon-300" />
            <ResponsePromise className="mt-1 text-white/90 [&_svg]:text-dune-300" />
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="container-page py-10" aria-labelledby="benefits">
        <SectionHeading
          id="benefits"
          kicker="Why book this with OUTLYY"
          title="Four things we do differently"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {page.benefits.map((b) => (
            <BenefitCard key={b.title} title={b.title} detail={b.detail} icon={<Check className="h-4.5 w-4.5" />} />
          ))}
        </div>
      </section>

      {/* FEATURED ACTIVITIES */}
      <section className="container-page pb-10" id="experiences" aria-labelledby="experiences-h">
        <SectionHeading
          id="experiences-h"
          kicker="All-in pricing"
          title="Recommended experiences"
          sub="Curated rather than catalogued — these are the ones we'd book ourselves."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {activities.map((a, i) => (
            <ActivityCard
              key={a.slug}
              activity={toCard(a)}
              position={i + 1}
              source={`landing_${page.slug}`}
              showCompare
              showInquiry
            />
          ))}
        </div>
      </section>

      {/* COMPARISON MODULE — the decision aid */}
      {comparison.length > 0 && page.comparison && (
        <section className="container-page pb-10">
          <ComparisonTable
            activities={comparison}
            columns={page.comparison.columns}
            heading={page.comparison.heading}
            subhead={page.comparison.subhead}
          />
        </section>
      )}

      {/* COMBOS */}
      {pageCombos.length > 0 && (
        <section className="container-page pb-10" aria-labelledby="lp-combos">
          <SectionHeading
            id="lp-combos"
            kicker="Cheaper together"
            title="Packages worth considering"
            sub="Each shows the separate-purchase price next to the bundle price."
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pageCombos.map((c) => (
              <ComboCard key={c.slug} combo={c} />
            ))}
          </div>
        </section>
      )}

      {/* BODY COPY — the unique 400+ words the quality gate requires */}
      <section className="bg-shell py-12" aria-labelledby="detail">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <h2 id="detail" className="text-2xl sm:text-3xl">
              {page.h1}: what you need to know
            </h2>
            <Prose className="mt-4">
              {page.body.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </Prose>
          </div>
        </div>
      </section>

      {/* TRUST + PROOF */}
      <section className="container-page py-12">
        <SocialProofStrip className="mb-8" />
        <SisterBrandReviews limit={3} />
        <div className="mt-8">
          <WhyOutlyy />
        </div>
      </section>

      {/* FAQ */}
      <section className="container-page pb-12" id="faq" aria-labelledby="faq-h">
        <div className="mx-auto max-w-3xl">
          <SectionHeading id="faq-h" kicker="Objections, answered" title="Frequently asked" />
          <Accordion items={page.faqs} />
        </div>
      </section>

      {/* WHATSAPP */}
      <section className="container-page pb-12">
        <WhatsAppCard
          context={{ intent: "general", placement: `landing_${page.slug}` }}
          title={page.whatsappPrompt}
          body="A real person replies in about 30 minutes during our hours (10am–6pm Gulf Standard Time, Monday to Saturday), and can book the whole thing for you with a payment link if you'd rather not use the website."
        />
      </section>

      {/* INTERNAL LINKS */}
      <section className="container-page pb-20" aria-labelledby="explore">
        <h2 id="explore" className="mb-4 text-xl">
          Keep exploring
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <nav aria-label="Related pages">
            <h3 className="mb-2 text-sm font-bold text-ink-900">Related pages</h3>
            <ul className="space-y-2">
              {page.internalLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-sun-700 underline underline-offset-2"
                  >
                    {l.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Related categories">
            <h3 className="mb-2 text-sm font-bold text-ink-900">Related categories</h3>
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
            </ul>
          </nav>
        </div>
      </section>

      <StickyLandingCTA
        label={
          Number.isFinite(cheapest)
            ? `From ₹${cheapest.toLocaleString("en-IN")} · reply in ~30 min`
            : "All-in pricing · reply in ~30 min"
        }
        href="#experiences"
        whatsappPlacement={`landing_${page.slug}`}
      />
      <CompareTray />
      <FloatingWhatsApp context={{ intent: "general", placement: `landing_${page.slug}` }} raised />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "FAQPage",
                mainEntity: page.faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
              {
                "@type": "ItemList",
                itemListElement: activities.map((a, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  url: `https://outlyy.com/activities/${a.slug}`,
                  name: a.title,
                })),
              },
            ],
          }),
        }}
      />
    </>
  );
}
