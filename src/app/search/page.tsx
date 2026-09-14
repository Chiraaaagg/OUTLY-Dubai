import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { CompareTray } from "@/components/commerce/compare";
import {
  ActiveFilterPills,
  FilterSidebar,
  FilterToolbar,
} from "@/components/commerce/filters";
import { FloatingWhatsApp, WhatsAppCard } from "@/components/commerce/whatsapp";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Breadcrumbs, EmptyState } from "@/components/ui/primitives";
import { categories } from "@/lib/data/categories";
import { PAGE_SIZE, searchActivities } from "@/lib/search";
import type { Dietary, SearchFilters, SortKey, Suitability } from "@/lib/types";

export const metadata: Metadata = {
  title: "Search Dubai Experiences",
  description:
    "Search 26 curated Dubai experiences by date, price, dietary needs, suitability and booking convenience. All-in rupee pricing with instant WhatsApp vouchers.",
  robots: { index: false, follow: true },
};

/**
 * SEARCH RESULTS
 *
 * Filter state lives entirely in the URL, so results render server-side, are
 * shareable, and survive the back button (AC-SRCH-02). The client components
 * here only write to the URL; they never hold result state.
 *
 * AC-SRCH-01 is implemented in `searchActivities`: an over-constrained filter
 * set never produces a bare empty state — it returns near-matches with the
 * relaxed constraint named.
 */
function parse(sp: Record<string, string | string[] | undefined>): SearchFilters {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const list = (k: string) => (get(k) ?? "").split(",").filter(Boolean);

  return {
    q: get("q"),
    category: get("category"),
    date: get("date"),
    when: get("when") as SearchFilters["when"],
    maxPrice: get("maxPrice") ? Number(get("maxPrice")) : undefined,
    minPrice: get("minPrice") ? Number(get("minPrice")) : undefined,
    dietary: list("dietary") as Dietary[],
    suitability: list("suitability") as Suitability[],
    privateOnly: get("privateOnly") === "1",
    pickup: get("pickup") === "1",
    instant: get("instant") === "1",
    freeCancellation: get("freeCancellation") === "1",
    duration: get("duration") as SearchFilters["duration"],
    rating: get("rating") ? Number(get("rating")) : undefined,
    sort: (get("sort") as SortKey) ?? "recommended",
    page: get("page") ? Number(get("page")) : 1,
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parse(sp);
  const result = searchActivities(filters);

  const page = filters.page ?? 1;
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = result.activities.slice(start, start + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const heading = filters.q
    ? `“${filters.q}” in Dubai`
    : filters.category
      ? categories.find((c) => c.slug === filters.category)?.name ?? "Dubai experiences"
      : "All Dubai experiences";

  const qs = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      v == null ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]],
    ),
  );

  return (
    <>
      <PageView
        pageType="search"
        props={{
          filters: JSON.stringify(filters),
          result_count: result.total,
          has_dietary_filter: Boolean(filters.dietary?.length),
          sort: filters.sort,
        }}
      />

      <div className="container-page py-6">
        <Breadcrumbs items={[{ label: "Dubai", href: "/" }, { label: "Search" }]} className="mb-3" />
        <h1 className="text-[1.75rem] sm:text-3xl">{heading}</h1>
        <p className="mt-1.5 text-[0.95rem] text-ink-600">
          {result.total} {result.total === 1 ? "experience" : "experiences"} · all-in rupee pricing ·
          confirmed with the operator before you pay
        </p>
      </div>

      <div className="container-page grid gap-8 pb-16 lg:grid-cols-[17rem_1fr]">
        <Suspense fallback={<div className="hidden lg:block" />}>
          <FilterSidebar resultCount={result.total} />
        </Suspense>

        <div className="min-w-0">
          <Suspense fallback={null}>
            <FilterToolbar resultCount={result.total} />
            <ActiveFilterPills />
          </Suspense>

          {/* Results */}
          {pageItems.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {pageItems.map((a, i) => (
                  <ActivityCard
                    key={a.slug}
                    activity={a}
                    position={start + i + 1}
                    source="search"
                    showCompare
                    showInquiry
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <nav
                  aria-label="Search result pages"
                  className="mt-8 flex items-center justify-center gap-2"
                >
                  {Array.from({ length: totalPages }, (_, i) => {
                    const p = i + 1;
                    const params = new URLSearchParams(qs);
                    params.set("page", String(p));
                    return (
                      <Link
                        key={p}
                        href={`/search?${params.toString()}`}
                        aria-current={p === page ? "page" : undefined}
                        className={
                          p === page
                            ? "flex h-11 min-w-11 items-center justify-center rounded-full bg-ink-900 px-3 font-bold text-white"
                            : "flex h-11 min-w-11 items-center justify-center rounded-full border border-ink-300 px-3 font-semibold text-ink-700 hover:border-ink-900"
                        }
                      >
                        {p}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </>
          )}

          {/* AC-SRCH-01 — near matches instead of a dead end */}
          {pageItems.length === 0 && result.relaxed && (
            <div>
              <Alert
                tone="info"
                title="No exact matches — but these are close"
                className="mb-5"
                icon={<SearchX className="h-4.5 w-4.5" />}
              >
                {result.relaxed.message}
              </Alert>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {result.relaxed.activities.map((a, i) => (
                  <ActivityCard
                    key={a.slug}
                    activity={a}
                    position={i + 1}
                    source="search_relaxed"
                    showCompare
                  />
                ))}
              </div>
            </div>
          )}

          {/* True empty state — only reachable when nothing at all matches */}
          {pageItems.length === 0 && !result.relaxed && (
            <EmptyState
              icon={<SearchX className="h-6 w-6" />}
              title="Nothing matched that search"
              body="We keep a deliberately small catalogue — around 26 experiences we'd book ourselves — so some searches come up empty. Tell us what you're after on WhatsApp and we'll almost certainly be able to arrange it."
              action={<ButtonLink href="/search">Browse everything</ButtonLink>}
              secondary={
                <ButtonLink href="/categories/desert-safari" variant="outline">
                  Popular: desert safaris
                </ButtonLink>
              }
            />
          )}

          <WhatsAppCard
            className="mt-10"
            context={{
              intent: "general",
              question: filters.q ? `I searched for: ${filters.q}` : undefined,
              placement: "search_results",
            }}
            title="Can't find the right thing?"
            body="Send us your dates, group size and what you're hoping to do. We'll come back with three options, priced in rupees, usually within the hour."
          />

          {/* Internal linking — keeps crawl paths short and helps undecided users */}
          <section className="mt-10" aria-labelledby="browse-more">
            <h2 id="browse-more" className="mb-3 text-lg">
              Browse by category
            </h2>
            <ul className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/categories/${c.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-paper px-3.5 py-2 text-sm font-semibold text-ink-700 hover:border-ink-900"
                  >
                    <span aria-hidden="true">{c.emoji}</span>
                    {c.shortName}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <CompareTray />
      <FloatingWhatsApp context={{ intent: "general", placement: "search" }} raised />
    </>
  );
}
