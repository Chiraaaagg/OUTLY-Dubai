"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bug, Loader2, Sparkles } from "lucide-react";
import { ActivityCard } from "@/components/commerce/activity-card";
import { ComboCard, ReviewCard, CategoryCard, BenefitCard } from "@/components/commerce/cards";
import { PriceBlock, QuotePrice, CurrencyToggle } from "@/components/commerce/price";
import { TrustMarquee, TrustSummary, WhyOutly, PaymentMethods } from "@/components/commerce/trust";
import { WhatsAppButton, WhatsAppCard } from "@/components/commerce/whatsapp";
import { VoucherCode } from "@/components/commerce/voucher";
import { AgentCard, ConfirmFirstNote, HowItWorks, IndicativePriceNote, NextSteps, ResponsePromise } from "@/components/commerce/inquiry-ui";
import { agents } from "@/lib/inquiry";
import { DateStrip, GuestSelector, TimeSlots } from "@/components/commerce/pickers";
import { Accordion } from "@/components/ui/accordion";
import {
  Badge,
  BestsellerBadge,
  EditorPickBadge,
  FreeCancellationBadge,
  InstantBadge,
  PrivateBadge,
  SavingsBadge,
  SellingFastBadge,
  SeniorFriendlyBadge,
  Sticker,
  VegBadge,
  VerifiedSupplierBadge,
} from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  ActivityCardSkeleton,
  Alert,
  Breadcrumbs,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Rating,
  SectionHeading,
  Skeleton,
  Stat,
} from "@/components/ui/primitives";
import { Rail, RailItem } from "@/components/ui/rail";
import { Scene, sceneKeys } from "@/components/ui/scene";
import { Sheet } from "@/components/ui/sheet";
import { Tabs } from "@/components/ui/tabs";
import { useApp } from "@/components/providers/app-provider";
import { recentEvents } from "@/lib/analytics";
import { SCENARIOS } from "@/lib/api/client";
import { activities } from "@/lib/data/activities";
import { categories } from "@/lib/data/categories";
import { combos } from "@/lib/data/combos";
import { reviews } from "@/lib/data/reviews";
import { EMPTY_PAX, toDateKey } from "@/lib/utils";
import type { PaxCount } from "@/lib/types";

/**
 * DESIGN SYSTEM & STATE GALLERY
 *
 * Two audiences: a designer checking that tokens and components are coherent,
 * and a reviewer who needs to see every loading / empty / error / pending state
 * without having to break a real API to get there.
 *
 * The scenario switcher at the top drives the whole app: pick one and every
 * async call in the product behaves that way (see src/lib/api/client.ts).
 * The colour and type panels follow the 21st.dev "Color Palette" branding-card
 * pattern (21st.dev/@ravikatiyar162/components/color-palette), rebuilt on our
 * own tokens.
 */

const COLOURS: { group: string; note: string; tokens: { name: string; value: string }[] }[] = [
  {
    group: "Ink",
    note: "Text, surfaces at the dark end, premium sections. Never pure black — pure black on a warm ground reads harsh.",
    tokens: [
      { name: "ink-900", value: "#14101f" },
      { name: "ink-800", value: "#241b3a" },
      { name: "ink-700", value: "#3b3054" },
      { name: "ink-600", value: "#574a71" },
      { name: "ink-500", value: "#7a6e93" },
      { name: "ink-300", value: "#cdc6d8" },
      { name: "ink-200", value: "#e6e1ee" },
      { name: "ink-100", value: "#f2eff7" },
    ],
  },
  {
    group: "Sun (primary)",
    note: "Dubai sunshine and Indian marigold. Reserved for the primary action — one per view.",
    tokens: [
      { name: "sun-500", value: "#ff6a13" },
      { name: "sun-600", value: "#e85403" },
      { name: "sun-700", value: "#bd4102" },
      { name: "sun-100", value: "#ffe6d1" },
      { name: "sun-50", value: "#fff5ec" },
    ],
  },
  {
    group: "Lagoon",
    note: "Marina water. Trust signals — instant confirmation, free cancellation, security.",
    tokens: [
      { name: "lagoon-500", value: "#00a6a0" },
      { name: "lagoon-600", value: "#008783" },
      { name: "lagoon-200", value: "#8fe4dc" },
      { name: "lagoon-50", value: "#eafaf8" },
    ],
  },
  {
    group: "Sunset",
    note: "Savings and deals only. Never used for errors — a discount and a failure must not share a colour.",
    tokens: [
      { name: "sunset-500", value: "#f02e63" },
      { name: "sunset-400", value: "#ff4d7e" },
      { name: "sunset-100", value: "#ffdbe4" },
      { name: "sunset-50", value: "#fff0f4" },
    ],
  },
  {
    group: "Dune & surfaces",
    note: "Warm neutrals. The whole product sits on sand, not white.",
    tokens: [
      { name: "dune-400", value: "#f7b73f" },
      { name: "dune-200", value: "#fde2ac" },
      { name: "sand (page)", value: "#fff8f0" },
      { name: "shell", value: "#fdf3e7" },
      { name: "paper", value: "#ffffff" },
    ],
  },
  {
    group: "Semantic & channel",
    note: "WhatsApp green is a channel colour, reserved exclusively for WhatsApp affordances.",
    tokens: [
      { name: "success", value: "#0e9f6e" },
      { name: "warning", value: "#b45309" },
      { name: "danger", value: "#dc2626" },
      { name: "info", value: "#2563eb" },
      { name: "whatsapp", value: "#25d366" },
    ],
  },
];

export default function DesignSystemPage() {
  const { toast } = useApp();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pax, setPax] = useState<PaxCount>(EMPTY_PAX);
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [time, setTime] = useState("10:00");
  const [events, setEvents] = useState<{ name: string; at: number }[]>([]);

  useEffect(() => {
    const t = window.setInterval(() => setEvents(recentEvents().slice(-12).reverse()), 1200);
    return () => window.clearInterval(t);
  }, []);

  const sample = activities[7];
  const scenario =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("mock") ?? "ok"
      : "ok";

  return (
    <div className="container-page py-6 pb-20">
      <Breadcrumbs items={[{ label: "Dubai", href: "/" }, { label: "Design system" }]} className="mb-3" />
      <h1 className="text-[2rem] sm:text-4xl">OUTLY design system</h1>
      <p className="mt-2 max-w-2xl text-[1.02rem] leading-relaxed text-ink-600">
        Tokens, components and every interaction state in one place. Playful but not childish;
        vibrant but disciplined. Decoration never competes with price, availability, the booking
        button or WhatsApp.
      </p>

      {/* ---------------------------------------------------- SCENARIOS */}
      <Card className="mt-6 p-5">
        <h2 className="flex items-center gap-2 text-xl">
          <Bug className="h-5 w-5 text-sun-500" aria-hidden="true" />
          State switcher
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
          Append <code className="rounded bg-ink-100 px-1 font-mono text-xs">?mock=</code> to any URL
          in the product and every async call behaves that way. This is how the error, timeout,
          sold-out, price-changed and payment-failure states are reviewable without breaking a real
          service. Currently: <strong className="font-bold text-ink-900">{scenario}</strong>.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <li key={s.id}>
              <Link
                href={`/inquiry?mock=${s.id}`}
                className="inline-block rounded-full border border-ink-300 bg-paper px-3 py-1.5 text-xs font-semibold text-ink-700 hover:border-ink-900"
                title={s.describes}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-500">
          Try <code className="font-mono">/inquiry?mock=error</code> or{" "}
          <code className="font-mono">/activities/{sample.slug}?mock=slow</code>. Payment scenarios
          apply only to instant-mode carts, which reach <code className="font-mono">/checkout</code>.
        </p>
      </Card>

      {/* ---------------------------------------------------- BRAND */}
      <Section title="Brand direction" kicker="Personality">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card className="sun-wash p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-sun-700">
              Voice
            </p>
            <p className="mt-2 text-[1.05rem] leading-relaxed text-ink-800">
              Direct, warm and specific. We say &ldquo;Jain thali, cooked to order, no onion or
              garlic&rdquo; rather than &ldquo;dietary options available&rdquo;. We state the
              downside before the customer finds it. We never use exclamation marks to manufacture
              excitement the product hasn&apos;t earned.
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-ink-700">
              <li>
                <strong className="font-bold">Playful but not childish</strong> — stickers and
                illustration in the chrome, never in the price block.
              </li>
              <li>
                <strong className="font-bold">Vibrant but controlled</strong> — one primary colour,
                used for one job.
              </li>
              <li>
                <strong className="font-bold">Premium but approachable</strong> — deep plum for
                luxury, sand for everything else.
              </li>
            </ul>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-400">
              Type scale
            </p>
            <p className="mt-3 font-display text-4xl font-extrabold leading-none">Bricolage</p>
            <p className="mt-1 text-sm text-ink-500">Display · 600/700/800 · headings only</p>
            <p className="mt-5 text-2xl font-bold">Plus Jakarta Sans</p>
            <p className="mt-1 text-sm text-ink-500">
              Body · wide apertures, reads well at 14px on mid-range Android
            </p>
            <div className="mt-5 space-y-1.5">
              <p className="font-display text-3xl font-bold">Heading 1 — 2rem/3.4rem</p>
              <p className="font-display text-2xl font-bold">Heading 2 — 1.75rem</p>
              <p className="text-[1.02rem] font-bold">Heading 3 — 1.02rem</p>
              <p className="text-[0.95rem] text-ink-600">Body — 0.95rem, line-height 1.75</p>
              <p className="text-xs text-ink-500">Caption — 0.75rem</p>
              <p className="text-2xs font-bold uppercase tracking-[0.12em] text-ink-400">
                Kicker — 0.6875rem
              </p>
              <p className="tnum text-lg font-bold">₹2,990 · tabular numerals for all prices</p>
            </div>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------- COLOUR */}
      <Section title="Colour" kicker="Tokens">
        <div className="space-y-5">
          {COLOURS.map((group) => (
            <div key={group.group}>
              <h3 className="text-[1.02rem]">{group.group}</h3>
              <p className="mt-0.5 max-w-2xl text-sm text-ink-600">{group.note}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {group.tokens.map((t) => (
                  <div key={t.name} className="w-32">
                    <div
                      className="h-14 w-full rounded-xl border border-ink-200"
                      style={{ background: t.value }}
                    />
                    <p className="mt-1 text-2xs font-bold text-ink-900">{t.name}</p>
                    <p className="font-mono text-2xs uppercase text-ink-500">{t.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------- SCENES */}
      <Section
        title="Illustration"
        kicker="Media"
        sub="Every activity image is a deterministic SVG scene: ~2KB, no network request, no broken images, and distinct from every competitor's stock photography. Real photography drops in by passing an http URL instead of a scene key."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {sceneKeys.map((key) => (
            <div key={key}>
              <div className="aspect-[4/3] overflow-hidden rounded-xl border border-ink-200">
                <Scene src={key} alt="" />
              </div>
              <p className="mt-1 font-mono text-2xs text-ink-500">{key}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------- BUTTONS */}
      <Section title="Buttons" kicker="Actions" sub="Strict hierarchy — a page never has two things competing to be primary.">
        <div className="space-y-4">
          <Row label="Variants">
            <Button>Book now</Button>
            <WhatsAppButton context={{ intent: "activity" }} />
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Cancel booking</Button>
          </Row>
          <Row label="Sizes">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large (44px+)</Button>
          </Row>
          <Row label="States">
            <Button loading loadingLabel="Confirming…">
              Book now
            </Button>
            <Button disabled>Sold out</Button>
            <ButtonLink href="#buttons">As a link</ButtonLink>
          </Row>
        </div>
      </Section>

      {/* ---------------------------------------------------- BADGES */}
      <Section title="Badges" kicker="Signals" sub="Colour is meaning. Nothing here may render from an invented number — every urgency badge is derived from real supplier availability.">
        <Row label="Trust">
          <InstantBadge />
          <FreeCancellationBadge hours={24} />
          <FreeCancellationBadge hours={0} />
          <VerifiedSupplierBadge />
        </Row>
        <Row label="Merchandising">
          <BestsellerBadge />
          <SellingFastBadge />
          <EditorPickBadge />
          <SavingsBadge percent={29} />
        </Row>
        <Row label="Suitability">
          <VegBadge />
          <VegBadge jain />
          <SeniorFriendlyBadge />
          <PrivateBadge />
        </Row>
        <Row label="Generic + sticker">
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="warn">Limited availability</Badge>
          <Badge tone="premium">Premium</Badge>
          <Sticker>New</Sticker>
          <Sticker tone="lagoon">Save ₹1,280</Sticker>
        </Row>
      </Section>

      {/* ---------------------------------------------------- PRICE */}
      <Section title="Price" kicker="The load-bearing component" sub="Price honesty is the product. The all-in tax line is not garnish — it is the differentiator against both the agent and the OTA.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <PriceBlock band={sample.price} />
          </Card>
          <Card className="p-5">
            <PriceBlock band={activities[0].price} size="xl" />
          </Card>
          <Card className="p-5">
            <QuotePrice from={{ inr: 34000, aed: 1470 }} />
            <div className="mt-4">
              <CurrencyToggle />
            </div>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------- CARDS */}
      <Section title="Cards" kicker="Inventory">
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-bold text-ink-700">Activity card — grid, rail, compact, row</p>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <ActivityCard activity={sample} showCompare showWhatsApp source="design_system" />
              <ActivityCard activity={activities[0]} layout="compact" source="design_system" />
              <ActivityCard
                activity={activities[12]}
                unavailable
                unavailableReason="Sold out on your dates"
                source="design_system"
              />
            </div>
            <div className="mt-4 max-w-md">
              <ActivityCard activity={activities[2]} layout="row" source="design_system" />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-ink-700">Rail (scroll-snap, keyboard-navigable)</p>
            <Rail ariaLabel="Design system rail">
              {activities.slice(0, 6).map((a) => (
                <RailItem key={a.slug}>
                  <ActivityCard activity={a} layout="rail" source="design_system" />
                </RailItem>
              ))}
            </Rail>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <CategoryCard category={categories[1]} count={4} className="aspect-[5/4]" />
            <ComboCard combo={combos[1]} />
            <ReviewCard review={reviews[0]} />
            <BenefitCard title="All-in rupee pricing" detail="Nothing added at checkout, ever." />
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------- SELECTORS */}
      <Section title="Selectors" kicker="Booking inputs" sub="Bottom sheets on mobile, inline on desktop. All targets ≥44px.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <p className="mb-2 text-sm font-bold text-ink-900">Date strip</p>
            <DateStrip value={date} onChange={setDate} />
            <p className="mb-2 mt-5 text-sm font-bold text-ink-900">Time slots</p>
            <TimeSlots
              slots={[
                { time: "09:00", status: "available" },
                { time: "12:00", status: "limited", spotsLeft: 3 },
                { time: "15:00", status: "sold_out" },
                { time: "18:30", status: "available" },
              ]}
              value={time}
              onChange={setTime}
            />
          </Card>
          <Card className="p-5">
            <p className="mb-2 text-sm font-bold text-ink-900">Guest selector</p>
            <GuestSelector value={pax} onChange={setPax} />
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------- OVERLAYS */}
      <Section title="Overlays & navigation" kicker="Structure">
        <Row label="Overlays">
          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            Open bottom sheet
          </Button>
          <Button variant="outline" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast({
                tone: "success",
                title: "Added to your trip",
                body: "Evening Desert Safari · Sat, 14 Sept",
                action: { label: "View trip", href: "/cart" },
              })
            }
          >
            Fire a toast
          </Button>
          <Button
            variant="outline"
            onClick={() => toast({ tone: "error", title: "Payment declined", body: "Nothing was charged." })}
          >
            Error toast
          </Button>
        </Row>

        <div className="mt-5">
          <Tabs
            items={[
              {
                id: "overview",
                label: "Overview",
                content: <p className="text-sm text-ink-600">Tab panels use the WAI-ARIA tabs pattern with roving tabindex — arrow keys, Home and End all work.</p>,
              },
              {
                id: "faq",
                label: "Accordion",
                badge: 2,
                content: (
                  <Accordion
                    items={[
                      { q: "Is the price I see the price I pay?", a: "Yes — taxes and booking fees are inside every number on the site." },
                      { q: "Is Jain food genuinely available?", a: "On the camps we mark for it: cooked to order, requested at booking, printed on your voucher." },
                    ]}
                  />
                ),
              },
              {
                id: "trust",
                label: "Trust",
                content: (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card className="p-5">
                      <TrustSummary />
                    </Card>
                    <Card className="p-5">
                      <PaymentMethods />
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <Stat value="18,400+" label="Travellers booked" />
                        <Stat value="4.7/5" label="Verified rating" />
                        <Stat value="47s" label="Median voucher" />
                      </div>
                    </Card>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="mt-5">
          <TrustMarquee />
        </div>
      </Section>

      {/* ---------------------------------------------------- STATES */}
      <Section
        title="States"
        kicker="Every list implements four"
        sub="Loading, empty, error and success. A screen that only handles the happy path is not finished."
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-bold text-ink-700">Loading — skeleton matches the real layout exactly (CLS &lt; 0.1)</p>
            <div className="grid gap-5 sm:grid-cols-3">
              <ActivityCardSkeleton />
              <ActivityCardSkeleton />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex items-center gap-2 pt-2 text-sm text-ink-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking live availability…
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <EmptyState
              title="Nothing matched that search"
              body="We keep a deliberately small catalogue, so some searches come up empty. Tell us what you're after and we'll almost certainly arrange it."
              action={<Button size="sm">Browse everything</Button>}
            />
            <ErrorState
              body="The operator's system didn't respond. Nothing has been charged — try again, or ask us and we'll confirm your date directly."
              onRetry={() => toast({ tone: "info", title: "Retrying…" })}
              action={<WhatsAppButton size="sm" context={{ intent: "availability" }} />}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Alert tone="success" title="Booking confirmed">
              Your voucher is on its way to WhatsApp and email.
            </Alert>
            <Alert tone="info" title="Awaiting operator confirmation">
              You&apos;ll get a status message within five minutes and the confirmed voucher within
              two hours.
            </Alert>
            <Alert tone="warning" title="The price changed while you were booking">
              Was ₹9,900, now ₹10,494. You have not been charged — confirm to continue.
            </Alert>
            <Alert tone="danger" title="That payment didn't go through">
              Nothing has been charged and your trip is exactly as you left it.
            </Alert>
          </div>

          <Divider label="Voucher" />
          <Card className="ticket-edge flex flex-wrap items-center gap-6 p-6">
            <VoucherCode reference="OUT-482913" />
            <div>
              <p className="text-2xs font-bold uppercase tracking-wide text-ink-500">
                Booking reference
              </p>
              <p className="font-display text-2xl font-bold tnum">OUT-482913</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <InstantBadge size="sm" />
                <Badge tone="diet" size="sm">
                  Jain meal confirmed
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------- INQUIRY MODE */}
      <Section
        title="Inquiry mode"
        kicker="Rail B promoted to primary"
        sub="Every element traces back to one sentence: we confirm with the operator before you pay. Sources: 21st.dev How It Works Steps (@ln-dev7/how-it-works-09), Vertical Timeline (@ln-dev7/how-it-works-02), Profile Card (@waleedkibhen/profile-card), Support Ticket Form (@cnippet-dev/v-textarea-10), Contact 01 (@shadcnspace/contact-01)."
      >
        <div className="space-y-5">
          <HowItWorks compact cta={false} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <p className="mb-2 text-sm font-bold text-ink-700">Objection lines beside the CTA</p>
              <ConfirmFirstNote />
              <ResponsePromise className="mt-2" />
              <IndicativePriceNote className="mt-2" />
              <div className="mt-4 flex flex-wrap gap-2">
                <ConfirmFirstBadgeDemo />
              </div>
            </Card>
            <Card className="p-5">
              <p className="mb-2 text-sm font-bold text-ink-700">Named agent + concrete deadline</p>
              <AgentCard agent={agents[0]} deadline={new Date(Date.now() + 30 * 60000)} />
              <p className="mb-2 mt-4 text-sm font-bold text-ink-700">What happens next</p>
              <NextSteps agentName="Jyoti" deadline={new Date(Date.now() + 30 * 60000)} />
            </Card>
          </div>
          <p className="text-xs text-ink-500">
            Try the live flow: <code className="font-mono">/inquiry</code>,{" "}
            <code className="font-mono">/inquiry?mock=error</code>,{" "}
            <code className="font-mono">/inquiry/confirmation?ref=INQ-204817</code>,{" "}
            <code className="font-mono">/account/inquiries</code>.
          </p>
        </div>
      </Section>

      {/* ---------------------------------------------------- WHATSAPP */}
      <Section
        title="WhatsApp surfaces"
        kicker="Rail B"
        sub="A conversion surface, not a support widget — and offered, never forced."
      >
        <Row label="Inline">
          <WhatsAppButton context={{ intent: "activity" }} />
          <WhatsAppButton context={{ intent: "group" }} />
          <WhatsAppButton context={{ intent: "dietary" }} />
          <WhatsAppButton context={{ intent: "checkout_help" }} />
          <WhatsAppButton context={{ intent: "quote" }} />
        </Row>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <WhatsAppCard context={{ intent: "general", placement: "design_system" }} />
          <WhatsAppCard
            tone="dark"
            context={{ intent: "concierge", placement: "design_system" }}
            title="Want this planned end to end?"
            body="A trip designer builds the itinerary, briefs every supplier and stays reachable throughout your trip."
          />
        </div>
      </Section>

      <Section title="Trust modules" kicker="Credibility">
        <WhyOutly />
      </Section>

      {/* ---------------------------------------------------- ANALYTICS */}
      <Section
        title="Analytics inspector"
        kicker="Instrumentation"
        sub="A live tail of the client-side event buffer. Server-side is the source of truth; this exists to make events assertable in review and in tests."
      >
        <Card className="p-5">
          {events.length === 0 ? (
            <p className="text-sm text-ink-600">
              No events yet — interact with something above and they&apos;ll appear here.
            </p>
          ) : (
            <ul className="space-y-1 font-mono text-xs">
              {events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex justify-between gap-4 border-b border-ink-100 py-1">
                  <span className="font-bold text-ink-900">{e.name}</span>
                  <span className="text-ink-500">
                    {new Date(e.at).toLocaleTimeString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-500">
            Also available in the console as{" "}
            <code className="font-mono">window.__outlyEvents</code>.
          </p>
        </Card>
      </Section>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Bottom sheet"
        description="Bottom sheet on mobile, centred dialog from sm upwards."
        footer={
          <Button block onClick={() => setSheetOpen(false)}>
            Done
          </Button>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600">
          Focus moves into the panel on open and returns to the trigger on close, Escape closes,
          Tab is trapped, and the background scroll is locked. Used by filters, sort, the guest
          selector, the calendar and the cancellation flow — solved once.
        </p>
      </Sheet>

      <Sheet
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variant="drawer"
        title="Drawer"
        description="Right-side variant, same primitive."
      >
        <p className="text-sm text-ink-600">Used for filters on tablet and desktop.</p>
      </Sheet>
    </div>
  );
}

function ConfirmFirstBadgeDemo() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-lagoon-200 bg-lagoon-50 px-2.5 py-1 text-xs font-semibold text-lagoon-700">
      Confirmed before you pay
    </span>
  );
}

function Section({
  title,
  kicker,
  sub,
  children,
}: {
  title: string;
  kicker: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <SectionHeading kicker={kicker} title={title} sub={sub} />
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-2 text-sm font-bold text-ink-700">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
