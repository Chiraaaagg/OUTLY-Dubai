"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, Check, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/primitives";
import { DatePickerSheet, DateStrip, GuestSelector, TimeSlots } from "./pickers";
import { PaymentMethods } from "./trust";
import { WhatsAppButton } from "./whatsapp";
import { ConfirmFirstNote, IndicativePriceNote, ResponsePromise } from "./inquiry-ui";
import { checkAvailability, ApiError, type AvailabilityResponse } from "@/lib/api";
import { track } from "@/lib/analytics";
import { getAvailability } from "@/lib/availability";
import { ctaFor } from "@/lib/cta";
import { computeBreakdown, toCartItem, variantById, PRICE_LOCK_MINUTES } from "@/lib/pricing";
import type { Activity, PaxCount } from "@/lib/types";
import { EMPTY_PAX, cn, formatDateKey, paxBillable, priceIn, toDateKey } from "@/lib/utils";

/**
 * BookingWidget — the ADP's conversion engine, now mode-aware.
 *
 * `activity.fulfilmentMode` decides one thing (pivot plan §2.1, §4.4):
 *
 *   inquiry → no availability call, price labelled indicative, primary CTA
 *             "Check availability & price" → cart → /inquiry. No "spots left",
 *             no price-lock timer, no instant-confirmation claim.
 *   instant → the original behaviour: live availability, "Book now" → /checkout.
 *
 * Both rails keep equal weight in both modes: "Ask on WhatsApp" is identical,
 * so a mixed catalogue renders coherently. The instant path is gated, not
 * deleted — flipping a SKU brings it back with no code change (§8.1 item 5).
 *
 * The two objection-handling lines beside the CTA ("why can't I just book",
 * "how long will this take") come straight from §3.4.
 */
export function BookingWidget({
  activity,
  className,
  compact,
  initialDate,
}: {
  activity: Activity;
  className?: string;
  compact?: boolean;
  initialDate?: string;
}) {
  const router = useRouter();
  const { currency, addToCart, toast } = useApp();
  const inquiryMode = activity.fulfilmentMode !== "instant";
  const cta = ctaFor(activity.fulfilmentMode, { quoteOnly: activity.quoteOnly });

  const [date, setDate] = useState(initialDate ?? toDateKey(new Date()));
  const [time, setTime] = useState<string | undefined>(activity.timeSlots[0]);
  const [pax, setPax] = useState<PaxCount>(EMPTY_PAX);
  const [variantId, setVariantId] = useState(
    variantById(activity)?.id ?? activity.variants[0]?.id,
  );
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [dateOpen, setDateOpen] = useState(false);

  // Live availability — instant mode only. In inquiry mode the state starts
  // "ready" and the operator is asked by a human after submission.
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    inquiryMode ? "ready" : "loading",
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (inquiryMode) return;
    setState("loading");
    setError(null);
    try {
      const res = await checkAvailability(activity.slug, date);
      setAvailability(res);
      setState("ready");
      if (res.slots.length && !res.slots.some((s) => s.time === time && s.status !== "sold_out")) {
        setTime(res.slots.find((s) => s.status !== "sold_out")?.time);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e : null);
      setState("error");
      track("error_shown", { page_type: "adp", failure_reason: "availability" });
    }
    // `time` intentionally excluded — it is corrected inside, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.slug, date, inquiryMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const breakdown = computeBreakdown(activity, pax, variantId, addOnIds);
  const variant = variantById(activity, variantId);
  const soldOut = !inquiryMode && availability?.status === "sold_out";

  const proceed = async () => {
    setSubmitting(true);
    const item = toCartItem(activity, {
      date,
      time: time ?? activity.timeSlots[0] ?? "Flexible",
      pax,
      variantId,
      addOnIds,
    });
    addToCart(item);

    if (inquiryMode) {
      track("inquiry_item_added", {
        activity_slug: activity.slug,
        tier: activity.tier,
        value: item.total.inr,
        currency: "INR",
        selected_date: date,
        fulfilment_mode: "inquiry",
      });
    } else {
      track("checkout_started", {
        activity_slug: activity.slug,
        tier: activity.tier,
        value: item.total.inr,
        currency: "INR",
        selected_date: date,
        rail: "self_serve",
        fulfilment_mode: "instant",
      });
    }
    toast({
      tone: "success",
      title: inquiryMode ? "Added to your inquiry" : "Added to your trip",
      body: `${activity.title} · ${formatDateKey(date)}`,
      action: { label: "View trip", href: "/cart" },
    });
    router.push(cta.route);
  };

  /* Tier D — quote only (AC-ADP-06). Unchanged by the pivot. */
  if (activity.quoteOnly) {
    return (
      <div
        className={cn(
          "rounded-[var(--radius-tile)] border border-ink-200 bg-paper p-5 shadow-[var(--shadow-lift)]",
          className,
        )}
      >
        <p className="text-xs font-bold uppercase tracking-wide text-ink-400">From</p>
        <p className="font-display text-3xl font-bold tnum text-ink-900">
          {priceIn(activity.price.adult, currency)}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          Priced per booking, not per person — so the honest number depends on your date, group and
          route. Send us the details and you&apos;ll have a firm all-in quote within two hours during
          working hours.
        </p>
        <div className="mt-4 space-y-2">
          <Button block size="lg" onClick={() => router.push(`/concierge?sku=${activity.slug}`)}>
            Request a quote
          </Button>
          <WhatsAppButton
            block
            size="lg"
            context={{
              intent: "concierge",
              activityTitle: activity.title,
              activityUrl: `https://outly.in/activities/${activity.slug}`,
              placement: "adp_quote",
            }}
            label="Speak to a trip designer"
          />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
          <ShieldCheck className="h-3.5 w-3.5 text-lagoon-500" />
          A named coordinator handles the booking end to end.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-tile)] border border-ink-200 bg-paper shadow-[var(--shadow-lift)]",
        className,
      )}
    >
      <div className="border-b border-ink-200 p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-400">
              {inquiryMode ? "Indicative total" : paxBillable(pax) > 1 ? "Total for your group" : "Total"}
              {paxBillable(pax) > 1 && inquiryMode ? ` · ${paxBillable(pax)} guests` : ""}
            </p>
            {state === "loading" ? (
              <Skeleton className="mt-1 h-9 w-32" />
            ) : (
              <p className="font-display text-3xl font-bold tnum text-ink-900">
                {priceIn(breakdown.total, currency)}
              </p>
            )}
            <p className="mt-0.5 text-xs font-semibold text-[var(--color-success)]">
              All taxes and fees included
            </p>
          </div>
          {breakdown.savings && breakdown.savings.inr > 0 && (
            <div className="rounded-[var(--radius-control)] bg-sunset-50 px-3 py-2 text-right">
              <p className="text-2xs font-bold uppercase tracking-wide text-sunset-600">You save</p>
              <p className="font-display text-lg font-bold tnum text-sunset-600">
                {priceIn(breakdown.savings, currency)}
              </p>
            </div>
          )}
        </div>
        {inquiryMode && <IndicativePriceNote className="mt-2" />}
      </div>

      <div className="space-y-5 p-5">
        {/* Variants */}
        {activity.variants.length > 1 && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-ink-900">Choose your option</legend>
            <div className="space-y-2">
              {activity.variants.map((v) => {
                const selected = v.id === variantId;
                return (
                  <label
                    key={v.id}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-[var(--radius-control)] border p-3 transition-colors",
                      selected ? "border-ink-900 bg-shell" : "border-ink-200 hover:border-ink-400",
                      v.soldOut && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="variant"
                      value={v.id}
                      checked={selected}
                      disabled={v.soldOut}
                      onChange={() => {
                        setVariantId(v.id);
                        track("variant_selected", {
                          activity_slug: activity.slug,
                          filters: v.name,
                        });
                      }}
                      className="mt-1 h-4 w-4 shrink-0 accent-ink-900"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-ink-900">{v.name}</span>
                        <span className="text-sm font-bold tnum text-ink-700">
                          {v.delta.inr === 0
                            ? "Included"
                            : `+${priceIn(v.delta, currency)}${v.isPrivate ? "" : " pp"}`}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-600">
                        {v.blurb}
                      </span>
                      {v.accessibilityNote && (
                        <span className="mt-1 block text-xs font-semibold text-[var(--color-success)]">
                          {v.accessibilityNote}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Date — availability marks only in instant mode; inquiry mode never
            asserts availability it hasn't checked. */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-ink-900">
              {inquiryMode ? "Preferred date" : "Pick a date"}
            </p>
            <button
              type="button"
              onClick={() => setDateOpen(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-sun-700 underline underline-offset-2"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Open calendar
            </button>
          </div>
          <DateStrip
            value={date}
            onChange={setDate}
            statusFor={inquiryMode ? undefined : (d) => getAvailability(activity, d).status}
          />
          {inquiryMode && (
            <p className="mt-2 text-xs text-ink-500">
              Not fixed yet? Pick your best guess — you can mark dates flexible on the next step.
            </p>
          )}
        </div>

        {/* ---- Instant mode only: live availability states -------------- */}
        {!inquiryMode && state === "loading" && (
          <div className="space-y-2" aria-live="polite" aria-busy="true">
            <Skeleton className="h-4 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24 rounded-full" />
              <Skeleton className="h-10 w-24 rounded-full" />
              <Skeleton className="h-10 w-24 rounded-full" />
            </div>
          </div>
        )}

        {!inquiryMode && state === "error" && (
          <Alert
            tone="warning"
            title="We couldn't check live availability"
            icon={<AlertTriangle className="h-4.5 w-4.5" />}
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void load()}>
                  <RefreshCw className="h-4 w-4" /> Try again
                </Button>
                <WhatsAppButton
                  size="sm"
                  context={{
                    intent: "availability",
                    activityTitle: activity.title,
                    date: formatDateKey(date),
                    placement: "adp_availability_error",
                  }}
                />
              </div>
            }
          >
            {error?.recovery ??
              "The operator's system didn't respond. Nothing has been charged — try again, or ask us and we'll confirm your date directly."}
          </Alert>
        )}

        {!inquiryMode && state === "ready" && soldOut && (
          <Alert tone="warning" title={`Sold out on ${formatDateKey(date)}`}>
            <p>Here are the next available dates:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {availability?.nextDates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDate(d)}
                  className="rounded-full border border-ink-900/20 bg-white px-3 py-1.5 text-xs font-bold text-ink-900 hover:border-ink-900"
                >
                  {formatDateKey(d)}
                </button>
              ))}
            </div>
          </Alert>
        )}

        {!inquiryMode && state === "ready" && !soldOut && availability?.slots.length ? (
          <div>
            <p className="mb-2 text-sm font-bold text-ink-900">
              {activity.pickupIncluded ? "Pickup time" : "Start time"}
            </p>
            <TimeSlots slots={availability.slots} value={time} onChange={setTime} />
            {availability.status === "limited" && availability.spotsLeft && (
              <p className="mt-2 text-xs font-bold text-[var(--color-warning)]">
                Only {availability.spotsLeft} spots left for this date — this is the operator&apos;s
                live count, not a countdown.
              </p>
            )}
          </div>
        ) : null}

        {/* ---- Inquiry mode: preferred time, no availability claims ---- */}
        {inquiryMode && activity.timeSlots.length > 1 && (
          <div>
            <p className="mb-2 text-sm font-bold text-ink-900">
              {activity.pickupIncluded ? "Preferred pickup time" : "Preferred start time"}
            </p>
            <TimeSlots
              slots={activity.timeSlots.map((t) => ({ time: t, status: "available" }))}
              value={time}
              onChange={setTime}
            />
          </div>
        )}

        {/* Guests */}
        <div>
          <p className="mb-1 text-sm font-bold text-ink-900">Guests</p>
          <GuestSelector value={pax} onChange={setPax} />
        </div>

        {/* Add-ons */}
        {activity.addOns.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-ink-900">
              {inquiryMode ? "Interested in adding" : "Add to your booking"}
            </legend>
            <div className="space-y-2">
              {activity.addOns.map((a) => {
                const checked = addOnIds.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border p-3 transition-colors",
                      checked ? "border-ink-900 bg-shell" : "border-ink-200 hover:border-ink-400",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setAddOnIds((prev) =>
                          prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id],
                        )
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 rounded accent-ink-900"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-ink-900">{a.name}</span>
                        <span className="text-sm font-bold tnum text-ink-700">
                          {a.price.inr === 0 ? "Free" : `+${priceIn(a.price, currency)}`}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-600">
                        {a.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Breakdown */}
        {!compact && (
          <div className="rounded-[var(--radius-control)] bg-shell p-3.5">
            <ul className="space-y-1.5 text-sm">
              {breakdown.lines.map((line, i) => (
                <li key={`${line.label}-${i}`} className="flex justify-between gap-3">
                  <span className="text-ink-600">
                    {line.label}
                    {line.detail && (
                      <span className="block text-2xs text-ink-500">{line.detail}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold tnum text-ink-900">
                    {line.amount.inr === 0 ? "Free" : priceIn(line.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2.5 flex justify-between border-t border-ink-200 pt-2.5 text-[0.95rem] font-bold">
              <span>{inquiryMode ? "Indicative total" : "Total"}</span>
              <span className="tnum">{priceIn(breakdown.total, currency)}</span>
            </div>
          </div>
        )}

        {/* CTAs — both rails, equal weight, in both modes */}
        <div className="space-y-2">
          <Button
            block
            size="lg"
            loading={submitting}
            loadingLabel={inquiryMode ? "Adding…" : "Holding your spot…"}
            disabled={soldOut || state === "error"}
            onClick={proceed}
          >
            {soldOut ? "Sold out on this date" : cta.primary}
          </Button>
          <WhatsAppButton
            block
            size="lg"
            context={{
              intent: paxBillable(pax) >= 5 ? "group" : "activity",
              activityTitle: `${activity.title}${variant ? ` — ${variant.name}` : ""}`,
              activityUrl: `https://outly.in/activities/${activity.slug}`,
              date: formatDateKey(date),
              time,
              pax,
              priceLabel: priceIn(breakdown.total, currency),
              placement: "adp_widget",
            }}
          />
        </div>

        <div className="space-y-2 text-xs text-ink-600">
          {inquiryMode ? (
            <>
              <ResponsePromise />
              <ConfirmFirstNote />
            </>
          ) : (
            <p className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 shrink-0 text-lagoon-500" />
              Price held for {PRICE_LOCK_MINUTES} minutes once you start booking.
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
            {activity.freeCancellationHours > 0
              ? `Free cancellation up to ${activity.freeCancellationHours} hours before you go.`
              : "This booking is non-refundable once confirmed."}
          </p>
          <div className="pt-1">
            <p className="mb-1 text-2xs font-bold uppercase tracking-wide text-ink-400">
              {inquiryMode ? "When you pay" : "Pay with"}
            </p>
            <PaymentMethods />
          </div>
        </div>
      </div>

      <DatePickerSheet
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        value={date}
        onChange={setDate}
        statusFor={inquiryMode ? undefined : (d) => getAvailability(activity, d).status}
      />
    </div>
  );
}

/**
 * Sticky mobile bar. Content changes with mode (pivot §2.1 Mobile row: the
 * interaction model is already right; only the copy changes).
 */
export function StickyBookingBar({ activity }: { activity: Activity }) {
  const { currency } = useApp();
  const [visible, setVisible] = useState(false);
  const cta = ctaFor(activity.fulfilmentMode, { quoteOnly: activity.quoteOnly });

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-paper/97 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-sticky)] backdrop-blur transition-transform duration-200 lg:hidden",
        visible ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xs font-semibold text-ink-500">
            {activity.quoteOnly ? "From" : "From, all-in"}
          </p>
          <p className="font-display text-lg font-bold leading-tight tnum text-ink-900">
            {priceIn(activity.price.adult, currency)}
            <span className="ml-1 text-2xs font-medium text-ink-500">per adult</span>
          </p>
        </div>
        <WhatsAppButton
          size="md"
          label="Ask"
          context={{
            intent: "activity",
            activityTitle: activity.title,
            activityUrl: `https://outly.in/activities/${activity.slug}`,
            placement: "sticky_bar",
          }}
        />
        <Button
          size="md"
          onClick={() => {
            document.getElementById("book")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {cta.primaryShort}
        </Button>
      </div>
    </div>
  );
}
