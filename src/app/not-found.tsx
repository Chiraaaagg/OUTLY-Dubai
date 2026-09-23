import Link from "next/link";
import { Compass, Search } from "lucide-react";
import { ActivityCard } from "@/components/commerce/activity-card";
import { toCard } from "@/lib/catalog/card";
import { WhatsAppCard } from "@/components/commerce/whatsapp";
import { ButtonLink } from "@/components/ui/button";
import { Scene } from "@/components/ui/scene";
import { getActivities, getCategories } from "@/lib/catalog/server";

/**
 * 404
 *
 * A dead end is a lost booking, so this page is built as a recovery surface
 * rather than an apology: search, the four most-booked experiences, every
 * category, and a human. Structure adapted from the 21st.dev "Not Found 06"
 * pattern (21st.dev/@shadcnui-blocks/components/not-found-06), which pairs the
 * message with a grid of real destinations instead of a single Home button.
 */
export default async function NotFound() {
  const [activities, categories] = await Promise.all([getActivities(), getCategories()]);
  const popular = activities
    .filter((a) => a.badges.bestseller)
    .slice(0, 4);

  return (
    <div className="container-page py-12 pb-20">
      <div className="mx-auto max-w-3xl text-center">
        {/* Brand 404 illustration, not a stock desert photo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/outlyy-404.svg"
          alt=""
          width={480}
          height={220}
          className="mx-auto mb-6 h-auto w-full max-w-[480px]"
        />
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-sun-600">
          Error 404
        </p>
        <h1 className="mt-2 text-[2rem] leading-tight sm:text-4xl">
          This page has wandered off into the desert
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[1.02rem] leading-relaxed text-ink-600">
          The link is broken or the page has moved. Nothing has gone wrong with any booking you
          have — your voucher is still in WhatsApp, your email and your account.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/search" size="lg">
            <Search className="h-[1.15rem] w-[1.15rem]" />
            Search experiences
          </ButtonLink>
          <ButtonLink href="/manage-booking" variant="outline" size="lg">
            Find my booking
          </ButtonLink>
        </div>
      </div>

      <section className="mt-12" aria-labelledby="popular-404">
        <h2 id="popular-404" className="mb-4 text-center text-xl">
          Or start with what people book most
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {popular.map((a, i) => (
            <ActivityCard
              key={a.slug}
              activity={toCard(a)}
              layout="compact"
              position={i + 1}
              source="404"
            />
          ))}
        </div>
      </section>

      <nav aria-label="All categories" className="mt-10 text-center">
        <h2 className="mb-3 flex items-center justify-center gap-2 text-lg">
          <Compass className="h-5 w-5 text-sun-500" aria-hidden="true" />
          Browse by category
        </h2>
        <ul className="flex flex-wrap justify-center gap-2">
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
      </nav>

      <div className="mx-auto mt-10 max-w-3xl">
        <WhatsAppCard
          context={{ intent: "general", placement: "404" }}
          title="Looking for something specific?"
          body="Tell us what you were trying to find and we'll send you the right link — or just book it for you."
        />
      </div>
    </div>
  );
}
