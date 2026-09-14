"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, Send, Sparkles, Trash2 } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { ActivityCard } from "@/components/commerce/activity-card";
import { WhatsAppButton, WhatsAppCard } from "@/components/commerce/whatsapp";
import { ConfirmFirstNote, IndicativePriceNote, ResponsePromise } from "@/components/commerce/inquiry-ui";
import { cartRequiresInquiry } from "@/lib/pricing";
import { Alert, Breadcrumbs, Card, EmptyState, SectionHeading } from "@/components/ui/primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { Scene } from "@/components/ui/scene";
import { Badge } from "@/components/ui/badge";
import { activities, activityBySlug } from "@/lib/data/activities";
import type { CartItem } from "@/lib/types";
import { formatDateKey, formatDateLong, formatDuration, paxLabel, priceIn } from "@/lib/utils";

/**
 * INQUIRY CART / TRIP BUILDER (PRD §5.5 → pivot plan §2.1 Cart row)
 *
 * Not a standard e-commerce cart. Persona A is buying an itinerary, not a
 * ticket — so this is a chronological trip timeline with time-conflict
 * detection (AC-CART-01) and at least one relevant upsell (AC-CART-02).
 *
 * Inquiry Mode changes three things and keeps the rest:
 *  - prices are labelled indicative; the 20-minute price-lock timer is gone
 *    because nothing is being locked (it returns for all-instant carts);
 *  - the CTA is "Send inquiry" → /inquiry, or "Continue to checkout" when
 *    every item is instant-mode (cartRequiresInquiry — the mixed-cart rule);
 *  - the whole trip can be handed to WhatsApp in one tap.
 * Cart shape is unchanged, so it feeds either path.
 */
export default function CartPage() {
  const { cart, removeFromCart, cartTotalINR, currency, priceLockMinutes, hydrated } = useApp();
  const inquiry = cartRequiresInquiry(cart);
  const nextHref = inquiry ? "/inquiry" : "/checkout";
  const nextLabel = inquiry ? "Send inquiry" : "Continue to checkout";
  const totalMoney = { inr: cartTotalINR, aed: Math.round(cartTotalINR / 23.2) };

  const byDate = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    [...cart]
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .forEach((item) => {
        map.set(item.date, [...(map.get(item.date) ?? []), item]);
      });
    return [...map.entries()];
  }, [cart]);

  // AC-CART-01 — two activities starting within the same window on one date.
  const conflicts = useMemo(() => {
    const out: string[] = [];
    byDate.forEach(([date, items]) => {
      if (items.length < 2) return;
      const hours = items.map((i) => parseInt(i.time.slice(0, 2), 10)).filter((n) => !Number.isNaN(n));
      for (let i = 0; i < hours.length; i++) {
        for (let j = i + 1; j < hours.length; j++) {
          if (Math.abs(hours[i] - hours[j]) < 4) {
            out.push(
              `${items[i].title} and ${items[j].title} both start around ${items[i].time} on ${formatDateLong(date)}.`,
            );
          }
        }
      }
    });
    return out;
  }, [byDate]);

  // AC-CART-02 — a relevant upsell whenever there is something in the cart.
  const suggestions = useMemo(() => {
    if (!cart.length) return [];
    const inCart = new Set(cart.map((i) => i.slug));
    const related = cart
      .flatMap((i) => activityBySlug(i.slug)?.relatedSlugs ?? [])
      .filter((s) => !inCart.has(s));
    const unique = [...new Set(related)];
    return unique
      .map(activityBySlug)
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .slice(0, 3);
  }, [cart]);

  const fallbackSuggestions = activities.filter((a) => a.tier === "B").slice(0, 3);

  if (!hydrated) {
    return (
      <div className="container-page py-10">
        <div className="skeleton h-64 w-full rounded-[var(--radius-tile)]" />
      </div>
    );
  }

  return (
    <div className="container-page py-6 pb-28 lg:pb-16">
      <Breadcrumbs items={[{ label: "Dubai", href: "/" }, { label: "Your trip" }]} className="mb-3" />
      <h1 className="text-[1.75rem] sm:text-3xl">Your Dubai trip</h1>
      <p className="mt-1.5 text-[0.95rem] text-ink-600">
        Everything you&apos;ve picked, laid out day by day so you can see whether it works — then
        one message and we confirm the lot.
      </p>

      {cart.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="Your trip is empty"
          body="Add a few experiences and they'll appear here as a day-by-day timeline — then one inquiry covers all of them."
          action={<ButtonLink href="/search">Browse experiences</ButtonLink>}
          secondary={
            <ButtonLink href="/collections/first-time-dubai" variant="outline">
              See the first-timer plan
            </ButtonLink>
          }
        />
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start">
          <div className="min-w-0">
            {/* Price-lock timer is instant-mode only — in inquiry mode nothing is
                being locked, and a timer would be manufactured urgency (§3.7). */}
            {!inquiry && priceLockMinutes !== null && (
              <Alert
                tone={priceLockMinutes > 5 ? "info" : "warning"}
                className="mb-5"
                title={
                  priceLockMinutes > 0
                    ? `Your prices are held for ${priceLockMinutes} more minutes`
                    : "Price hold expired"
                }
              >
                {priceLockMinutes > 0
                  ? "If an operator raises a rate while you're deciding, we'll show you the old and new price and ask before charging anything."
                  : "We'll re-check prices at checkout. If anything has changed you'll see both figures and can decide then — nothing is charged automatically."}
              </Alert>
            )}

            {conflicts.length > 0 && (
              <Alert
                tone="warning"
                title="Two activities clash"
                className="mb-5"
                icon={<AlertTriangle className="h-4.5 w-4.5" />}
              >
                <ul className="list-disc space-y-1 pl-4">
                  {conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  Move one to another day, or{" "}
                  <Link href="/support" className="font-bold underline">
                    ask us to rearrange it
                  </Link>{" "}
                  — most suppliers allow a date change before confirmation.
                </p>
              </Alert>
            )}

            {byDate.map(([date, items]) => (
              <section key={date} className="mb-8" aria-labelledby={`day-${date}`}>
                <h2
                  id={`day-${date}`}
                  className="mb-3 flex items-center gap-2 text-lg"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sun-100 font-display text-sm font-bold text-sun-700">
                    {items.length}
                  </span>
                  {formatDateLong(date)}
                </h2>
                <ol className="space-y-3">
                  {items.map((item) => (
                    <li key={item.id}>
                      <Card className="flex gap-4 p-4">
                        <Link
                          href={`/${item.kind === "combo" ? "combos" : "activities"}/${item.slug}`}
                          className="h-20 w-24 shrink-0 overflow-hidden rounded-xl"
                        >
                          <Scene src={item.image} alt="" />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Link
                                href={`/${item.kind === "combo" ? "combos" : "activities"}/${item.slug}`}
                                className="text-[0.975rem] font-bold leading-snug text-ink-900 hover:underline"
                              >
                                {item.title}
                              </Link>
                              <p className="mt-0.5 text-xs text-ink-500">
                                {item.time}
                                {item.durationMinutes
                                  ? ` · ${formatDuration(item.durationMinutes)}`
                                  : ""}
                                {item.variantName ? ` · ${item.variantName}` : ""}
                              </p>
                              <p className="mt-0.5 text-xs text-ink-500">{paxLabel(item.pax)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.id)}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-[var(--color-danger)]"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Remove {item.title}</span>
                            </button>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-1.5">
                              {item.fulfilmentMode === "instant" ? (
                                <Badge tone="trust" size="sm">
                                  Instant confirmation
                                </Badge>
                              ) : (
                                <Badge tone="trust" size="sm">
                                  Confirmed before you pay
                                </Badge>
                              )}
                              {item.freeCancellationHours > 0 && (
                                <Badge tone="trust" size="sm">
                                  Free cancellation · {item.freeCancellationHours}h
                                </Badge>
                              )}
                            </div>
                            <p className="font-display text-lg font-bold tnum text-ink-900">
                              {priceIn(item.total, currency)}
                            </p>
                          </div>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ol>
              </section>
            ))}

            <section aria-labelledby="add-more">
              <SectionHeading
                id="add-more"
                kicker="Goes well with what you've picked"
                title="Add to the same inquiry"
                sub="Priced together is usually cheaper. Chosen from what other travellers paired with these — not from what pays us most."
              />
              <div className="grid gap-4 sm:grid-cols-3">
                {(suggestions.length ? suggestions : fallbackSuggestions).map((a, i) => (
                  <ActivityCard
                    key={a.slug}
                    activity={a}
                    layout="compact"
                    position={i + 1}
                    source="cart_upsell"
                  />
                ))}
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-28">
            <Card className="p-5">
              <h2 className="text-lg">Trip summary</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {cart.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span className="min-w-0 text-ink-600">
                      <span className="line-clamp-1">{item.title}</span>
                      <span className="block text-2xs text-ink-500">{paxLabel(item.pax)}</span>
                    </span>
                    <span className="shrink-0 font-semibold tnum">
                      {priceIn(item.total, currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-ink-200 pt-3">
                <span className="font-bold">{inquiry ? "Indicative total" : "Total"}</span>
                <span className="font-display text-xl font-bold tnum">{priceIn(totalMoney, currency)}</span>
              </div>
              <p className="mt-1 text-xs font-semibold text-[var(--color-success)]">
                All taxes and fees included — nothing added later
              </p>
              {inquiry && <IndicativePriceNote className="mt-2" />}

              <ButtonLink href={nextHref} block size="lg" className="mt-4">
                {inquiry && <Send className="h-[1.15rem] w-[1.15rem]" />}
                {nextLabel}
              </ButtonLink>
              {inquiry && (
                <>
                  <WhatsAppButton
                    block
                    size="lg"
                    className="mt-2"
                    label="Price this trip on WhatsApp"
                    context={{
                      intent: "inquiry",
                      items: cart.map((c) => `${c.title} · ${formatDateKey(c.date)} · ${paxLabel(c.pax)}`),
                      priceLabel: priceIn(totalMoney, currency),
                      placement: "cart",
                    }}
                  />
                  <ResponsePromise className="mt-3 justify-center" />
                  <ConfirmFirstNote className="mt-1 justify-center text-center" />
                </>
              )}
              <Button
                variant="ghost"
                block
                size="sm"
                className="mt-1.5"
                onClick={() => window.history.back()}
              >
                Keep browsing
              </Button>
            </Card>

            {!inquiry && (
              <WhatsAppCard
                className="mt-4"
                context={{
                  intent: "group",
                  question: `My trip: ${cart.map((c) => c.title).join(" / ")}`,
                  placement: "cart",
                }}
                title="Want us to check this plan?"
                body="Send it over and we'll tell you if the timings work, whether the pickups clash, and if a package would be cheaper."
              />
            )}
          </aside>
        </div>
      )}

      {/* Sticky mobile CTA: item count + indicative total + primary (pivot §4.2). */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-paper/97 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-sticky)] backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-semibold text-ink-500">
                {cart.length} {cart.length === 1 ? "activity" : "activities"} · {inquiry ? "indicative" : "total"}
              </p>
              <p className="font-display text-lg font-bold leading-tight tnum text-ink-900">
                {priceIn(totalMoney, currency)}
              </p>
            </div>
            <ButtonLink href={nextHref} size="md">
              {nextLabel}
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}
