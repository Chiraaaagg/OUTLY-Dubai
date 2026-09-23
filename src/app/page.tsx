import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Sparkles } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { toCard } from "@/lib/catalog/card";
import { CategoryCard, CollectionCard, ComboCard } from "@/components/commerce/cards";
import { QuickChips } from "@/components/commerce/quick-chips";
import { HeroSearch } from "@/components/commerce/search-box";
import { HowItWorks } from "@/components/commerce/inquiry-ui";
import { SisterBrandReviews } from "@/components/commerce/sister-reviews";
import {
  SocialProofStrip,
  TrustMarquee,
  WhyOutlyy,
} from "@/components/commerce/trust";
import { FloatingWhatsApp, WhatsAppCard } from "@/components/commerce/whatsapp";
import { Accordion } from "@/components/ui/accordion";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/primitives";
import { Rail, RailItem } from "@/components/ui/rail";
import { Scene } from "@/components/ui/scene";
import { getAvailability, today, tomorrow } from "@/lib/availability";
import { getActivities, getCategories } from "@/lib/catalog/server";
import { collections } from "@/lib/data/collections";
import { combos } from "@/lib/data/combos";
import type { Faq } from "@/lib/types";

export const metadata: Metadata = {
  title: "OUTLYY — Dubai Experiences, One All-In Price",
  description:
    "Curated Dubai activities at one all-in price in your own currency, with pure-veg and Jain food options, hotel pickup and WhatsApp help in about 30 minutes. Instant vouchers, no hidden fees.",
  alternates: { canonical: "/" },
};

/**
 * HOMEPAGE
 *
 * Job (PRD §5.1): establish trust in under 5 seconds, route to intent in
 * under 15.
 *
 * Merchandising rule enforced below: Tier A attraction tickets may appear in
 * the category grid but never in positions 1–8 of a hero rail (AC-HP-05).
 * Hero real estate belongs to Tier B and C — the margin and take-rate tiers.
 */

const HOME_FAQS: Faq[] = [
  {
    q: "Is the price I see the price I pay?",
    a: "Yes. Every price on OUTLYY includes taxes and booking fees, and it is the amount charged to your card or UPI. The only things that change your total are optional extras you deliberately add — hotel pickup, a cake, a photographer.",
  },
  {
    q: "Can I pay with UPI?",
    a: "UPI is the first payment option at checkout — GPay, PhonePe, Paytm or any UPI app — alongside Indian cards, netbanking, wallets and EMI on orders above ₹15,000. If you're in the UAE, prices switch to dirhams and UAE cards work normally.",
  },
  {
    q: "Is pure vegetarian and Jain food actually available?",
    a: "On the experiences marked for it, yes. It is confirmed with the supplier's kitchen, must be requested when you book, and is printed on your voucher so it cannot be denied at the venue. Jain meals need at least 24 hours' notice because they are cooked to order without onion or garlic.",
  },
  {
    q: "Why can't I just book instantly?",
    a: "Because we confirm with the operator before you pay — so you never get a voucher that fails at the gate. You pick what you want, we check availability and the exact price with the supplier, and a named person replies on WhatsApp in about 30 minutes. Only then do you pay, by UPI, card or EMI, through a secure link.",
  },
  {
    q: "How quickly do I get my ticket?",
    a: "Once you've paid, your QR voucher reaches WhatsApp within minutes for most experiences, and also lands in your email and account. The step before that — a human confirming availability — is what takes the 30 minutes, and it is the reason the voucher works when you arrive.",
  },
  {
    q: "What if I'd rather just talk to someone?",
    a: "Tap any WhatsApp button and a real person replies in about 30 minutes during our hours (10am–6pm Gulf Standard Time, Monday to Saturday). They can see which activity and dates you were looking at, and can plan and confirm the whole trip in one conversation — the form is there for people who prefer it, not a toll gate.",
  },
  {
    q: "Can my elderly parents do a desert safari?",
    a: "Book the gentle safari — a separate activity with no dune bashing at any point, chairs with backs at the camp, and the same dinner and shows. It reaches the same camp at the same time as the standard tour, so families frequently split across both.",
  },
];

export const revalidate = 60;

export default async function HomePage() {
  const [activities, categories] = await Promise.all([getActivities(), getCategories()]);
  const activitiesBySlugs = (slugs: string[]) => slugs.map((s) => activities.find((a) => a.slug === s)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const todayKey = today();
  const tomorrowKey = tomorrow();

  // "Available today & tomorrow" — the last-minute and expat rail.
  // Short-notice rail. Availability is only asserted for instant-mode SKUs;
  // for inquiry-mode SKUs the criterion is the operator's confirmation type.
  const lastMinute = activities
    .filter(
      (a) =>
        a.confirmation === "instant" &&
        !a.quoteOnly &&
        (a.fulfilmentMode !== "instant" ||
          getAvailability(a, todayKey).status !== "sold_out" ||
          getAvailability(a, tomorrowKey).status !== "sold_out"),
    )
    .slice(0, 8);

  // Hero rail: Tier B and C only, ordered by demand. AC-HP-05.
  const topExperiences = activities
    .filter((a) => a.tier === "B" || a.tier === "C")
    .sort((a, b) => b.bookedThisMonth - a.bookedThisMonth)
    .slice(0, 8);

  const familyPicks = activitiesBySlugs(
    collections.find((c) => c.slug === "dubai-with-kids")!.activitySlugs,
  ).slice(0, 6);

  const couplePicks = activitiesBySlugs(
    collections.find((c) => c.slug === "dubai-honeymoon")!.activitySlugs,
  ).slice(0, 6);

  const luxuryPicks = activities.filter((a) => a.tier === "D" || a.tier === "C").slice(0, 6);

  const desertPicks = activities.filter((a) => a.categorySlug === "desert-safari");
  const waterPicks = activities.filter((a) => a.categorySlug === "cruises-yachts");

  const countByCategory = (slug: string) =>
    activities.filter((a) => a.categorySlug === slug || a.secondaryCategorySlugs.includes(slug))
      .length;

  return (
    <>
      <PageView pageType="homepage" />

      {/* ------------------------------------------------------------------
        HERO — trust in 5 seconds, intent in 15.
        Primary CTA: Find things to do. Secondary: quick-intent chips.
      ------------------------------------------------------------------ */}
      <section className="sun-wash relative overflow-hidden border-b border-ink-200">
        <div className="container-page relative grid grid-safe gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-16">
          <div className="relative z-10 min-w-0">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-ink-900/10 bg-white/70 px-3 py-1.5 text-xs font-bold text-ink-800 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-sun-600" aria-hidden="true" />
              Curated Dubai experiences · Built for Indian travellers
            </p>

            <h1 className="text-[2.25rem] leading-[1.05] sm:text-5xl lg:text-[3.4rem]">
              Dubai, planned properly.
              <span className="mt-1 block text-sun-600">One all-in price. Confirmed by a human in 30 minutes.</span>
            </h1>

            <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-ink-700">
              All-in prices with nothing added later. Pure-veg and Jain food you can filter for.
              Pick what you like, tell us your dates, and a named person confirms availability with
              the operator before you pay anything.
            </p>

            <div className="mt-6">
              <HeroSearch />
            </div>

            <div className="mt-4">
              <QuickChips />
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-tile)] border border-ink-900/10 shadow-[var(--shadow-pop)]">
              <Scene src="dune-sunset" alt="Sunset over the red dunes outside Dubai" priority />
            </div>
            <div className="absolute -bottom-5 -left-6 w-56 rounded-[var(--radius-card)] border border-ink-200 bg-paper p-3.5 shadow-[var(--shadow-lift)]">
              <p className="text-2xs font-extrabold uppercase tracking-[0.12em] text-ink-400">
                Desert safari · 7 guests
              </p>
              <p className="mt-1 font-display text-xl font-bold tnum text-ink-900">₹20,930</p>
              <p className="text-2xs text-ink-500">
                Indicative, all-in. Jain thali at no extra cost.
              </p>
            </div>
            <div className="absolute -right-4 top-8 w-44 rotate-2 rounded-[var(--radius-card)] border border-ink-200 bg-paper p-3 shadow-[var(--shadow-lift)]">
              <p className="text-2xs font-bold text-[var(--color-success)]">Jyoti replied</p>
              <p className="mt-0.5 text-xs leading-snug text-ink-600">
                WhatsApp · 11 minutes after inquiry
              </p>
            </div>
          </div>
        </div>
      </section>

      <TrustMarquee />

      {/* ------------------------------------------------------------------
        HOW IT WORKS — the inquiry model explained before the first CTA is met
        (pivot §2.1). 21st.dev "How It Works Steps" (@ln-dev7/how-it-works-09).
      ------------------------------------------------------------------ */}
      <section className="container-page pt-10">
        <HowItWorks />
      </section>

      {/* ------------------------------------------------------------------
        SHORT-NOTICE RAIL (was "Available today & tomorrow") — last-minute + expat. Geo-boosted first
        for UAE visitors in production; static order here.
        Primary CTA: card → ADP. Secondary: see all last-minute.
      ------------------------------------------------------------------ */}
      <section className="container-page py-12" aria-labelledby="last-minute">
        <SectionHeading
          id="last-minute"
          kicker="Travelling this week?"
          title="Good at short notice"
          sub="Operators who usually confirm the same day. For tonight or tomorrow, message us on WhatsApp — it's faster than the form."
          href="/last-minute-dubai-activities"
        />
        <Rail ariaLabel="Activities available today and tomorrow">
          {lastMinute.map((a, i) => (
            <RailItem key={a.slug}>
              <ActivityCard activity={toCard(a)} layout="rail" position={i + 1} source="home_last_minute" />
            </RailItem>
          ))}
        </Rail>
      </section>

      {/* ------------------------------------------------------------------
        TOP EXPERIENCES — Tier B/C only (AC-HP-05). The margin engine.
      ------------------------------------------------------------------ */}
      <section className="container-page py-12" aria-labelledby="top-experiences">
        <SectionHeading
          id="top-experiences"
          kicker="Most booked this month"
          title="The experiences Indian families keep coming back for"
          sub="Ranked by what people actually book, not by what pays us most to show you."
          href="/search?sort=popularity"
        />
        <Rail ariaLabel="Most booked experiences">
          {topExperiences.map((a, i) => (
            <RailItem key={a.slug}>
              <ActivityCard
                activity={toCard(a)}
                layout="rail"
                position={i + 1}
                source="home_top"
                showWhatsApp
              />
            </RailItem>
          ))}
        </Rail>
      </section>

      {/* ------------------------------------------------------------------
        COMBOS — Tier C, the take-rate lever.
      ------------------------------------------------------------------ */}
      <section className="bg-shell py-12" aria-labelledby="combos">
        <div className="container-page">
          <SectionHeading
            id="combos"
            kicker="Bundles with verifiable savings"
            title="Save with our Dubai packages"
            sub="Every package shows what the same experiences cost bought separately. Check the maths — that's the point."
            href="/dubai-attraction-combos"
          />
          <Rail ariaLabel="Dubai packages and combos">
            {combos.map((c) => (
              <RailItem key={c.slug}>
                <ComboCard combo={c} layout="rail" />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      {/* ------------------------------------------------------------------
        CATEGORY GRID — the main navigational surface for undecided visitors.
      ------------------------------------------------------------------ */}
      <section className="container-page py-12" aria-labelledby="categories">
        <SectionHeading
          id="categories"
          kicker="Browse by what you feel like"
          title="Every kind of Dubai day"
          sub="Eight categories, curated rather than catalogued. Around 26 experiences in total — the ones we would book ourselves."
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {categories.map((c) => (
            <CategoryCard
              key={c.slug}
              category={c}
              count={countByCategory(c.slug)}
              className="aspect-[4/5] sm:aspect-[5/4]"
            />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------
        DESERT SAFARI FEATURE — highest-margin, highest-anxiety category, so
        it gets an editorial band rather than another rail.
      ------------------------------------------------------------------ */}
      <section className="container-page py-12" aria-labelledby="desert">
        <div className="overflow-hidden rounded-[var(--radius-tile)] border border-ink-200 bg-paper">
          <div className="grid grid-safe lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative min-h-[15rem]">
              <Scene src="dune-sunset" alt="Convoy of 4x4s on the Al Lahbab dunes at sunset" />
            </div>
            <div className="p-6 sm:p-8">
              <Badge tone="heat" className="mb-3">
                Most-booked category
              </Badge>
              <h2 id="desert" className="text-2xl sm:text-3xl">
                The desert safari, done in a way that suits your family
              </h2>
              <p className="mt-3 max-w-xl text-[0.975rem] leading-relaxed text-ink-600">
                Three things decide whether this goes well: the pickup, the dune bashing and the
                food. We&apos;ve made all three bookable decisions rather than things you find out on
                the day. Jain thali at no extra cost. A gentle safari with zero dune bashing for
                grandparents. Driver name, photo and number the evening before.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <ButtonLink href="/lp/desert-safari-dubai">Compare all safaris</ButtonLink>
                <ButtonLink href="/activities/gentle-desert-safari-seniors" variant="outline">
                  See the gentle safari
                </ButtonLink>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {desertPicks.slice(0, 2).map((a, i) => (
                  <ActivityCard key={a.slug} activity={toCard(a)} layout="compact" position={i + 1} source="home_desert" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
        AUDIENCE COLLECTIONS — family / couple / luxury routing.
      ------------------------------------------------------------------ */}
      <section className="container-page py-12" aria-labelledby="collections">
        <SectionHeading
          id="collections"
          kicker="Curated, not filtered"
          title="Who are you travelling with?"
          sub="The same 26 experiences, ordered by what actually works for your group."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {collections
            .filter((c) =>
              ["dubai-with-kids", "dubai-honeymoon", "senior-friendly", "luxury-dubai"].includes(
                c.slug,
              ),
            )
            .map((c) => (
              <CollectionCard key={c.slug} collection={c} />
            ))}
        </div>
      </section>

      {/* FAMILY RAIL */}
      <section className="container-page py-12" aria-labelledby="family">
        <SectionHeading
          id="family"
          kicker="Works for a six-year-old and a sixty-eight-year-old"
          title="Family-friendly favourites"
          sub="Child, infant and senior rates shown before checkout — not discovered at it."
          href="/collections/dubai-with-kids"
        />
        <Rail ariaLabel="Family-friendly activities">
          {familyPicks.map((a, i) => (
            <RailItem key={a.slug}>
              <ActivityCard activity={toCard(a)} layout="rail" position={i + 1} source="home_family" />
            </RailItem>
          ))}
        </Rail>
      </section>

      {/* ------------------------------------------------------------------
        CRUISES & YACHTS band
      ------------------------------------------------------------------ */}
      <section className="bg-ink-900 py-12 text-white" aria-labelledby="water">
        <div className="container-page">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.14em] text-dune-300">
                On the water
              </p>
              <h2 id="water" className="text-2xl text-white sm:text-[1.75rem]">
                Dubai looks better from the water
              </h2>
              <p className="mt-1.5 text-[0.95rem] leading-relaxed text-white/70">
                We say plainly whether a boat is private or shared, and how many guests are on it.
                Twenty-four, not two hundred.
              </p>
            </div>
            <Link
              href="/categories/cruises-yachts"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              All cruises &amp; yachts
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <Rail ariaLabel="Cruises and yacht experiences">
            {waterPicks.map((a, i) => (
              <RailItem key={a.slug}>
                <ActivityCard activity={toCard(a)} layout="rail" position={i + 1} source="home_water" />
              </RailItem>
            ))}
          </Rail>
        </div>
      </section>

      {/* COUPLE + LUXURY */}
      <section className="container-page py-12" aria-labelledby="couples">
        <SectionHeading
          id="couples"
          kicker="For two"
          title="Couple &amp; honeymoon experiences"
          sub="Private where it matters, and timed so you're in the right place at golden hour."
          href="/collections/dubai-honeymoon"
        />
        <Rail ariaLabel="Couple and honeymoon experiences">
          {couplePicks.map((a, i) => (
            <RailItem key={a.slug}>
              <ActivityCard activity={toCard(a)} layout="rail" position={i + 1} source="home_couples" />
            </RailItem>
          ))}
        </Rail>
      </section>

      <section className="container-page py-12" aria-labelledby="luxury">
        <SectionHeading
          id="luxury"
          kicker="Handled by a named person"
          title="Premium &amp; private experiences"
          sub="Charters and helicopters are quoted rather than listed, because an honest number depends on your date and group."
          href="/categories/luxury-experiences"
        />
        <Rail ariaLabel="Luxury experiences">
          {luxuryPicks.map((a, i) => (
            <RailItem key={a.slug}>
              <ActivityCard activity={toCard(a)} layout="rail" position={i + 1} source="home_luxury" />
            </RailItem>
          ))}
        </Rail>
      </section>

      {/* ------------------------------------------------------------------
        SEASONAL MODULE — truthful, dated, and it changes.
      ------------------------------------------------------------------ */}
      <section className="container-page py-12" aria-labelledby="seasonal">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="night-wash relative overflow-hidden rounded-[var(--radius-tile)] p-6 text-white sm:p-8">
            <Badge tone="premium" className="mb-3 border-white/20 bg-white/10 text-dune-200">
              <Clock3 className="h-3.5 w-3.5" /> Season starts October
            </Badge>
            <h2 id="seasonal" className="text-2xl text-white">
              Winter in Dubai — the good months
            </h2>
            <p className="mt-2 max-w-md text-[0.95rem] leading-relaxed text-white/75">
              November to March is when the desert is comfortable, Global Village is open and the
              Miracle Garden is in bloom. It is also when Burj Khalifa sunset slots sell out five to
              seven days ahead, so book those before you fly.
            </p>
            <ButtonLink href="/collections/first-time-dubai" className="mt-5">
              See the first-timer plan
            </ButtonLink>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/dubai-activities-with-upi"
              className="flex flex-col justify-between rounded-[var(--radius-tile)] border border-ink-200 bg-paper p-5 transition-transform [@media(hover:hover)]:hover:-translate-y-0.5"
            >
              <span className="text-2xl" aria-hidden="true">
                ₹
              </span>
              <span>
                <span className="block text-lg font-bold text-ink-900">Pay with UPI</span>
                <span className="mt-1 block text-sm text-ink-600">
                  GPay, PhonePe, Paytm. No forex markup, no international card needed.
                </span>
              </span>
            </Link>
            <Link
              href="/dubai-activities-with-hotel-pickup"
              className="flex flex-col justify-between rounded-[var(--radius-tile)] border border-ink-200 bg-paper p-5 transition-transform [@media(hover:hover)]:hover:-translate-y-0.5"
            >
              <span className="text-2xl" aria-hidden="true">
                🚐
              </span>
              <span>
                <span className="block text-lg font-bold text-ink-900">Hotel pickup included</span>
                <span className="mt-1 block text-sm text-ink-600">
                  Driver name, photo and number the evening before. Live message on the day.
                </span>
              </span>
            </Link>
            <Link
              href="/collections/jain-veg-friendly"
              className="flex flex-col justify-between rounded-[var(--radius-tile)] border border-ink-200 bg-paper p-5 transition-transform [@media(hover:hover)]:hover:-translate-y-0.5"
            >
              <span className="text-2xl" aria-hidden="true">
                🌿
              </span>
              <span>
                <span className="block text-lg font-bold text-ink-900">Jain &amp; pure veg</span>
                <span className="mt-1 block text-sm text-ink-600">
                  Confirmed with the kitchen and printed on your voucher.
                </span>
              </span>
            </Link>
            <Link
              href="/concierge"
              className="flex flex-col justify-between rounded-[var(--radius-tile)] border border-ink-200 bg-paper p-5 transition-transform [@media(hover:hover)]:hover:-translate-y-0.5"
            >
              <span className="text-2xl" aria-hidden="true">
                ✨
              </span>
              <span>
                <span className="block text-lg font-bold text-ink-900">Plan my whole trip</span>
                <span className="mt-1 block text-sm text-ink-600">
                  A trip designer builds the itinerary. Quote in two hours.
                </span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
        SOCIAL PROOF
      ------------------------------------------------------------------ */}
      <section className="bg-shell py-12">
        <div className="container-page">
          <SocialProofStrip className="mb-8" />
          <SisterBrandReviews limit={6} />
        </div>
      </section>

      {/* ------------------------------------------------------------------
        WHY OUTLYY + FAQ + WHATSAPP
      ------------------------------------------------------------------ */}
      <section className="container-page py-12" aria-labelledby="why-outlyy">
        <SectionHeading
          id="why-outlyy"
          kicker="What makes us different"
          title="Four promises, all of them checkable"
          sub="We're not trying to be a better Klook. We're trying to beat the travel agent you'd otherwise use — a human who confirms before you pay, at a price you can see."
        />
        <WhyOutlyy />
      </section>

      <section className="container-page pb-12" aria-labelledby="faq">
        <div className="grid grid-safe gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <SectionHeading
              id="faq"
              kicker="Before you book"
              title="Questions we get asked most"
              sub="If yours isn't here, ask on WhatsApp — a person answers in about 30 minutes."
            />
            <WhatsAppCard
              context={{ intent: "general", placement: "homepage_faq" }}
              className="hidden lg:block"
            />
          </div>
          <Accordion items={HOME_FAQS} />
        </div>
      </section>

      <section className="container-page pb-16 lg:hidden">
        <WhatsAppCard context={{ intent: "general", placement: "homepage_footer" }} />
      </section>

      <FloatingWhatsApp context={{ intent: "general", placement: "homepage" }} />

      {/* Structured data: Organization + the FAQ block above (PRD §7). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                name: "OUTLYY",
                url: "https://outlyy.com",
                description:
                  "Curated Dubai activities at one all-in price, with WhatsApp support and a human confirming every booking before payment.",
                areaServed: ["IN", "AE"],
                contactPoint: {
                  "@type": "ContactPoint",
                  contactType: "customer support",
                  availableLanguage: ["English", "Hindi"],
                  telephone: "+971-4-000-0000",
                },
              },
              {
                "@type": "FAQPage",
                mainEntity: HOME_FAQS.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
            ],
          }),
        }}
      />
    </>
  );
}
