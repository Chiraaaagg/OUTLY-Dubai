import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { PageView } from "@/components/analytics/page-view";
import { ActivityCard } from "@/components/commerce/activity-card";
import { toCard } from "@/lib/catalog/card";
import { ComboCard } from "@/components/commerce/cards";
import { ComboBooking } from "@/components/commerce/combo-booking";
import { TrustSummary } from "@/components/commerce/trust";
import { FloatingWhatsApp, WhatsAppCard } from "@/components/commerce/whatsapp";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs, Card, SectionHeading } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { getActivitiesBySlugs } from "@/lib/catalog/server";
import { combos, comboBySlug } from "@/lib/data/combos";
import { Amount } from "@/components/commerce/price";

export function generateStaticParams() {
  return combos.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = comboBySlug(slug);
  if (!c) return { title: "Package not found" };
  const saving = c.separatePrice.inr - c.bundlePrice.inr;
  return {
    title: `${c.name} — Save ₹${saving.toLocaleString("en-IN")}`,
    description: `${c.tagline}. ₹${c.bundlePrice.inr.toLocaleString("en-IN")} all-in per adult against ₹${c.separatePrice.inr.toLocaleString("en-IN")} bought separately.`,
    alternates: { canonical: `/combos/${c.slug}` },
  };
}

/**
 * COMBO / PACKAGE PAGE (Tier C — the take-rate lever)
 *
 * The single job: make the saving verifiable. Bundle price and separate-purchase
 * price sit side by side, and every included activity links to its own page so
 * a sceptical customer can check the arithmetic in thirty seconds. A bundle
 * whose saving cannot survive that check should not be sold.
 */
export default async function ComboPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const combo = comboBySlug(slug);
  if (!combo) notFound();

  const included = await getActivitiesBySlugs(combo.includedSlugs);
  // Both stored currencies carry through, so the saving converts like any price.
  const savingMoney = { inr: combo.separatePrice.inr - combo.bundlePrice.inr, aed: combo.separatePrice.aed - combo.bundlePrice.aed };
  const others = combos.filter((c) => c.slug !== combo.slug).slice(0, 3);

  return (
    <>
      <PageView
        pageType="combo"
        props={{ combo_slug: combo.slug, tier: combo.tier, price: combo.bundlePrice.inr }}
      />

      <section className="relative overflow-hidden border-b border-ink-200">
        <div className="absolute inset-0">
          <Scene src={combo.heroImage} alt="" scrim />
          <div aria-hidden="true" className="absolute inset-0 hero-scrim" />
        </div>
        <div className="container-page relative py-12 text-white sm:py-16">
          <Breadcrumbs
            items={[
              { label: "Dubai", href: "/" },
              { label: "Packages", href: "/dubai-attraction-combos" },
              { label: combo.name },
            ]}
            className="mb-4 [&_a]:text-white/70 [&_span]:text-white"
          />
          <Badge tone="deal" className="mb-3">
            Save <Amount money={savingMoney} /> per adult
          </Badge>
          <h1 className="max-w-3xl text-[2rem] leading-tight text-white sm:text-4xl">
            {combo.name}
          </h1>
          <p className="mt-3 max-w-2xl text-[1.02rem] text-white/85">{combo.tagline}</p>
        </div>
      </section>

      <div className="container-page grid grid-safe gap-8 py-10 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="min-w-0">
          {/* The savings proof */}
          <Card className="p-5">
            <h2 className="text-xl">Check the maths yourself</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
              The comparison below is against what these exact experiences cost individually on this
              site today — not against a gate price nobody pays.
            </p>
            <ul className="mt-4 divide-y divide-ink-200">
              {included.map((a) => (
                <li key={a.slug} className="flex items-center justify-between gap-4 py-3">
                  <Link
                    href={`/activities/${a.slug}`}
                    className="flex min-w-0 items-center gap-3 hover:underline"
                  >
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                      <Scene src={a.images[0]} alt="" />
                    </span>
                    <span className="min-w-0 text-sm font-semibold text-ink-900">{a.title}</span>
                  </Link>
                  <span className="shrink-0 text-sm font-bold tnum text-ink-700">
                    <Amount money={a.price.adult} />
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-4 py-3 text-sm">
                <span className="font-bold text-ink-700">Bought separately</span>
                <span className="font-bold tnum text-ink-500 line-through">
                  <Amount money={combo.separatePrice} />
                </span>
              </li>
              <li className="flex items-center justify-between gap-4 py-3">
                <span className="font-display text-lg font-bold text-ink-900">
                  As a package
                </span>
                <span className="font-display text-xl font-bold tnum text-ink-900">
                  <Amount money={combo.bundlePrice} />
                </span>
              </li>
            </ul>
            <p className="mt-2 rounded-[var(--radius-control)] bg-sunset-50 p-3 text-sm font-bold text-sunset-600">
              You save <Amount money={savingMoney} /> per adult
            </p>
          </Card>

          <section className="mt-8" aria-labelledby="whats-in">
            <h2 id="whats-in" className="text-2xl">
              What&apos;s in the package
            </h2>
            <ul className="mt-3 space-y-2">
              {combo.highlights.map((h) => (
                <li key={h} className="flex gap-2.5 text-[0.95rem] leading-relaxed text-ink-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" aria-hidden="true" />
                  {h}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8" aria-labelledby="included">
            <SectionHeading
              id="included"
              kicker={`${included.length} experiences`}
              title="Everything included"
              sub="Each keeps its own timed slot and QR code — use them on different days if you prefer."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {included.map((a, i) => (
                <ActivityCard
                  key={a.slug}
                  activity={toCard(a)}
                  layout="compact"
                  position={i + 1}
                  source={`combo_${combo.slug}`}
                />
              ))}
            </div>
          </section>

          <section className="mt-8 grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-lg">Who this suits</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {combo.audience === "family"
                  ? "Families booking several days at once, including groups with children and grandparents. Child and senior rates are applied automatically where the supplier offers them."
                  : combo.audience === "couple"
                    ? "Couples who want the three experiences that photograph best, coordinated by one person so the timings actually work."
                    : combo.audience === "luxury"
                      ? "Travellers who want the arrangements handled properly, with a named coordinator reachable throughout."
                      : "First-time visitors who want the icons covered without booking four separate things and hoping the slots don't clash."}
              </p>
              <p className="mt-3 text-sm text-ink-600">
                <strong className="font-bold text-ink-900">Validity:</strong> {combo.validity}
              </p>
            </Card>
            <Card className="p-5">
              <h2 className="text-lg">Cancellation</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{combo.cancellationPolicy}</p>
              <p className="mt-3 text-xs text-ink-500">
                Individual activities can&apos;t be cancelled separately once the package is
                confirmed, because the price depends on the combination.
              </p>
            </Card>
          </section>

          {combo.faqs.length > 0 && (
            <section className="mt-8">
              <SectionHeading kicker="Before you book" title="Package questions" />
              <Accordion items={combo.faqs} />
            </section>
          )}

          <WhatsAppCard
            className="mt-8"
            context={{
              intent: "combo",
              comboName: combo.name,
              activityUrl: `https://outlyy.com/combos/${combo.slug}`,
              placement: "combo_body",
            }}
            title="Want to swap something out?"
            body="Bundle prices depend on the specific combination, so swaps aren't possible in self-serve. Tell us what you'd rather have and we'll price the alternative — it usually still beats booking separately."
          />
        </div>

        <aside className="lg:sticky lg:top-28">
          <ComboBooking combo={combo} />
          <Card className="mt-4 p-5">
            <h2 className="mb-3 text-[0.95rem]">Why book this with OUTLYY</h2>
            <TrustSummary />
          </Card>
        </aside>
      </div>

      <section className="container-page pb-16" aria-labelledby="other-packages">
        <SectionHeading
          id="other-packages"
          kicker="More bundles"
          title="Other packages"
          href="/dubai-attraction-combos"
        />
        <div className="grid gap-5 sm:grid-cols-3">
          {others.map((c) => (
            <ComboCard key={c.slug} combo={c} />
          ))}
        </div>
        <Link
          href="/dubai-attraction-combos"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-sun-700 underline underline-offset-2"
        >
          See all Dubai attraction combos
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <FloatingWhatsApp context={{ intent: "combo", comboName: combo.name }} raised />
    </>
  );
}
