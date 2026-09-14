import type { Metadata } from "next";
import Link from "next/link";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { CompareTray } from "@/components/commerce/compare";
import { FloatingWhatsApp, WhatsAppCard } from "@/components/commerce/whatsapp";
import { Breadcrumbs, Prose, SectionHeading } from "@/components/ui/primitives";
import { activities } from "@/lib/data/activities";
import { categories } from "@/lib/data/categories";

export const metadata: Metadata = {
  title: "All Dubai Experiences — The Full OUTLY Catalogue",
  description:
    "Every Dubai experience we sell, in one list. Around 26 curated activities with all-in rupee pricing, dietary filters and instant WhatsApp vouchers.",
  alternates: { canonical: "/activities" },
};

/**
 * FULL CATALOGUE
 *
 * Deliberately modest in size, and the copy says so. PRD design principle 1:
 * "Certainty over selection. A traveller with 300 options and no confidence
 * buys nothing." A short, honest catalogue is a positioning statement against
 * the OTAs, not a limitation to apologise for.
 */
export default function ActivitiesIndexPage() {
  const grouped = categories.map((c) => ({
    category: c,
    items: activities.filter((a) => a.categorySlug === c.slug),
  }));

  return (
    <>
      <PageView pageType="activities_index" props={{ result_count: activities.length }} />

      <div className="container-page py-6">
        <Breadcrumbs
          items={[{ label: "Dubai", href: "/" }, { label: "All experiences" }]}
          className="mb-3"
        />
        <h1 className="text-[1.75rem] sm:text-3xl">Every experience we sell</h1>
        <div className="mt-3 max-w-3xl">
          <Prose>
            <p>
              There are {activities.length} of them. That is a deliberate number, not a temporary
              one. A traveller looking at three hundred options with no way to tell them apart
              books nothing — so we contract a small set of suppliers, check them ourselves, score
              them monthly on on-time performance and complaints, and drop the ones that slip.
              Everything here is something we would put our own family on.
            </p>
            <p>
              If what you want isn&apos;t listed, it usually still exists — private charters, larger
              group arrangements and unusual requests are quoted rather than published. Ask on
              WhatsApp and you&apos;ll get an honest answer, including &ldquo;no, not on those
              dates&rdquo; when that&apos;s the truth.
            </p>
          </Prose>
        </div>

        <nav aria-label="Jump to category" className="mt-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <a
              key={c.slug}
              href={`#${c.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-paper px-3.5 py-2 text-sm font-semibold text-ink-700 hover:border-ink-900"
            >
              <span aria-hidden="true">{c.emoji}</span>
              {c.shortName}
            </a>
          ))}
        </nav>
      </div>

      <div className="container-page pb-16">
        {grouped.map(({ category, items }) =>
          items.length ? (
            <section key={category.slug} id={category.slug} className="mb-12 scroll-mt-32">
              <SectionHeading
                kicker={category.tagline}
                title={category.name}
                sub={`${items.length} ${items.length === 1 ? "experience" : "experiences"}`}
                href={`/categories/${category.slug}`}
                hrefLabel="Category page"
              />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((a, i) => (
                  <ActivityCard
                    key={a.slug}
                    activity={a}
                    position={i + 1}
                    source="activities_index"
                    showCompare
                    showInquiry
                  />
                ))}
              </div>
            </section>
          ) : null,
        )}

        <WhatsAppCard
          context={{ intent: "general", placement: "activities_index" }}
          title="Not seeing what you had in mind?"
          body="Private charters, group arrangements and unusual requests aren't all published. Tell us what you're after and we'll tell you honestly whether we can do it."
        />

        <p className="mt-8 text-sm text-ink-600">
          Prefer to filter?{" "}
          <Link href="/search" className="font-bold text-sun-700 underline underline-offset-2">
            Use search
          </Link>{" "}
          for dates, dietary needs, pickup and price.
        </p>
      </div>

      <CompareTray />
      <FloatingWhatsApp context={{ intent: "general", placement: "activities_index" }} raised />
    </>
  );
}
