"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { DateStrip, GuestSelector } from "./pickers";
import { PaymentMethods } from "./trust";
import { WhatsAppButton } from "./whatsapp";
import { track } from "@/lib/analytics";
import { PRICE_LOCK_MINUTES } from "@/lib/pricing";
import { ctaFor } from "@/lib/cta";
import { ConfirmFirstNote, IndicativePriceNote, ResponsePromise } from "./inquiry-ui";
import type { Combo, PaxCount } from "@/lib/types";
import { EMPTY_PAX, formatDateKey, paxBillable, priceIn, scaleMoney, toDateKey } from "@/lib/utils";

/**
 * Combo booking panel.
 *
 * Simpler than the ADP widget by design: a package has one price, one start
 * date and no per-activity variants — the individual timed slots are sequenced
 * by us after purchase. What it must not lose is the savings proof, which is
 * the entire reason a combo converts.
 */
export function ComboBooking({ combo }: { combo: Combo }) {
  const router = useRouter();
  const { currency, addToCart, toast } = useApp();
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [pax, setPax] = useState<PaxCount>(EMPTY_PAX);
  const [upgradeIds, setUpgradeIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inquiryMode = combo.fulfilmentMode !== "instant";
  const cta = ctaFor(combo.fulfilmentMode);

  const billable = paxBillable(pax);
  const base = scaleMoney(combo.bundlePrice, billable);
  const upgrades = combo.upgrades.filter((u) => upgradeIds.includes(u.id));
  const upgradeTotal = upgrades.reduce(
    (sum, u) => ({
      inr: sum.inr + (u.perPerson ? u.price.inr * billable : u.price.inr),
      aed: sum.aed + (u.perPerson ? u.price.aed * billable : u.price.aed),
    }),
    { inr: 0, aed: 0 },
  );
  const total = { inr: base.inr + upgradeTotal.inr, aed: base.aed + upgradeTotal.aed };
  const savings = scaleMoney(
    {
      inr: combo.separatePrice.inr - combo.bundlePrice.inr,
      aed: combo.separatePrice.aed - combo.bundlePrice.aed,
    },
    billable,
  );

  const book = () => {
    setSubmitting(true);
    addToCart({
      id: `combo-${combo.slug}-${date}`,
      kind: "combo",
      slug: combo.slug,
      title: combo.name,
      image: combo.heroImage,
      date,
      time: "We'll sequence your slots",
      pax,
      addOnIds: upgradeIds,
      unit: combo.bundlePrice,
      total,
      confirmation: combo.confirmation,
      fulfilmentMode: combo.fulfilmentMode,
      freeCancellationHours: 48,
      durationMinutes: 0,
    });
    track(inquiryMode ? "inquiry_item_added" : "checkout_started", {
      combo_slug: combo.slug,
      tier: combo.tier,
      value: total.inr,
      currency: "INR",
      rail: inquiryMode ? "assisted" : "self_serve",
      fulfilment_mode: combo.fulfilmentMode,
    });
    toast({
      tone: "success",
      title: inquiryMode ? "Package added to your inquiry" : "Package added to your trip",
      body: `${combo.name} · from ${formatDateKey(date)}`,
      action: { label: "View trip", href: "/cart" },
    });
    router.push(cta.route);
  };

  return (
    <div className="rounded-[var(--radius-tile)] border border-ink-200 bg-paper shadow-[var(--shadow-lift)]">
      <div className="border-b border-ink-200 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-400">
          {inquiryMode ? "Indicative package total" : "Package total"} for {billable}{" "}
          {billable === 1 ? "guest" : "guests"}
        </p>
        <p className="font-display text-3xl font-bold tnum text-ink-900">
          {priceIn(total, currency)}
        </p>
        <p className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
          <span className="text-ink-400 line-through tnum">
            {priceIn(scaleMoney(combo.separatePrice, billable), currency)} bought separately
          </span>
          <span className="rounded-full bg-sunset-50 px-2 py-0.5 text-xs font-bold text-sunset-600">
            You save {priceIn(savings, currency)}
          </span>
        </p>
        <p className="mt-1 text-xs font-semibold text-[var(--color-success)]">
          All taxes and fees included
        </p>
        {inquiryMode && <IndicativePriceNote className="mt-2" />}
      </div>

      <div className="space-y-5 p-5">
        <div>
          <p className="mb-2 text-sm font-bold text-ink-900">First activity date</p>
          <DateStrip value={date} onChange={setDate} />
          <p className="mt-2 text-xs text-ink-500">{combo.validity}</p>
        </div>

        <div>
          <p className="mb-1 text-sm font-bold text-ink-900">Guests</p>
          <GuestSelector value={pax} onChange={setPax} />
        </div>

        {combo.upgrades.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-ink-900">Upgrades</legend>
            <div className="space-y-2">
              {combo.upgrades.map((u) => {
                const checked = upgradeIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-ink-200 p-3 hover:border-ink-400"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setUpgradeIds((prev) =>
                          prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id],
                        )
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 rounded accent-ink-900"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-ink-900">{u.name}</span>
                        <span className="text-sm font-bold tnum text-ink-700">
                          {u.price.inr === 0 ? "Free" : `+${priceIn(u.price, currency)}`}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-600">
                        {u.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="space-y-2">
          <Button block size="lg" loading={submitting} onClick={book}>
            {inquiryMode ? "Check availability & price" : "Book this package"}
          </Button>
          <WhatsAppButton
            block
            size="lg"
            context={{
              intent: "combo",
              comboName: combo.name,
              activityUrl: `https://outly.in/combos/${combo.slug}`,
              date: formatDateKey(date),
              pax,
              priceLabel: priceIn(total, currency),
              placement: "combo_widget",
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
          <p className="flex gap-1.5">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
            {combo.cancellationPolicy}
          </p>
          <PaymentMethods className="pt-1" />
        </div>
      </div>
    </div>
  );
}
