"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { InquiryForm } from "@/components/commerce/inquiry-form";
import { IndicativePriceNote } from "@/components/commerce/inquiry-ui";
import { TrustSummary } from "@/components/commerce/trust";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Scene } from "@/components/ui/scene";
import { siteConfig } from "@/lib/site-config";
import { formatDateKey, paxLabel, priceIn } from "@/lib/utils";

/**
 * INQUIRY PAGE — replaces checkout as the cart's terminal step in inquiry mode.
 *
 * Layout adapted from 21st.dev "Contact 01 — Project Inquiry Form"
 * (@shadcnspace/contact-01): a 12-column grid with the form beside contact
 * details and trust signals, so credibility sits in the same viewport as the
 * ask. Column split inverted (form 7 / trust 5) because here the form is the
 * primary object, not the contact details. Zero new dependencies.
 *
 * /checkout is not deleted — it is gated by `cartRequiresInquiry` and returns
 * for instant-mode carts (pivot §2.2, §8.1 item 5).
 */
export default function InquiryPage() {
  const { cart, currency, hydrated } = useApp();
  const total = cart.reduce(
    (sum, i) => ({ inr: sum.inr + i.total.inr, aed: sum.aed + i.total.aed }),
    { inr: 0, aed: 0 },
  );

  if (!hydrated) {
    return (
      <div className="container-page py-10">
        <Skeleton className="h-96 w-full rounded-[var(--radius-tile)]" />
      </div>
    );
  }

  return (
    <div className="container-page py-6 pb-24">
      <Breadcrumbs
        items={[
          { label: "Dubai", href: "/" },
          { label: "Your trip", href: "/cart" },
          { label: "Check availability & price" },
        ]}
        className="mb-3"
      />

      <div className="mb-6 max-w-2xl">
        <h1 className="text-[1.75rem] sm:text-3xl">Check availability &amp; price</h1>
        <p className="mt-1.5 hidden text-[0.95rem] leading-relaxed text-ink-600 sm:block">
          Two fields and thirty seconds. A named person confirms with the operator and replies on
          WhatsApp in about 30 minutes — with the exact price. Nothing is charged until you say yes.
        </p>
      </div>

      {cart.length === 0 ? (
        <div className="grid grid-safe gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <Card className="p-5 sm:p-6">
            <p className="mb-4 flex items-center gap-2 rounded-[var(--radius-control)] bg-shell p-3 text-sm text-ink-700">
              <Sparkles className="h-4 w-4 shrink-0 text-sun-500" aria-hidden="true" />
              Nothing picked yet? That&apos;s fine — tell us your dates and group and we&apos;ll
              suggest a plan.
            </p>
            <InquiryForm items={[]} />
          </Card>
          <Sidebar />
        </div>
      ) : (
        <div className="grid grid-safe gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <Card className="p-5 sm:p-6">
            <InquiryForm items={cart} />
          </Card>

          <aside className="space-y-4 lg:sticky lg:top-28">
            <Card className="p-5">
              <h2 className="text-lg">Your trip</h2>
              <ul className="mt-3 divide-y divide-ink-200">
                {cart.map((item) => (
                  <li key={item.id} className="flex gap-3 py-3">
                    <span className="h-14 w-16 shrink-0 overflow-hidden rounded-lg">
                      <Scene src={item.image} alt="" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-bold leading-snug text-ink-900">
                        {item.title}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatDateKey(item.date)} · {paxLabel(item.pax)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tnum">{priceIn(item.total, currency)}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-baseline justify-between border-t border-ink-200 pt-3">
                <span className="text-sm font-bold">Indicative total</span>
                <span className="font-display text-xl font-bold tnum">{priceIn(total, currency)}</span>
              </div>
              <IndicativePriceNote className="mt-2" />
              <Link
                href="/cart"
                className="mt-3 inline-block text-xs font-bold text-sun-700 underline underline-offset-2"
              >
                Edit trip
              </Link>
            </Card>
            <Sidebar compact />
          </aside>
        </div>
      )}

      {cart.length === 0 && (
        <div className="mt-8">
          <EmptyState
          illustration="cart"
            title="Or start from the catalogue"
            body="Add one or more experiences and they'll appear here, pre-filled with your dates and guests."
            action={<ButtonLink href="/search">Browse experiences</ButtonLink>}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Shift coverage shown instead of named agents (audit X04): the names were
 * mock data, and a real specialist is only assigned once the inquiry exists.
 */
const SHIFTS: { initials: string; name: string; sub: string }[] = [
  { initials: "AE", name: "Dubai desk", sub: siteConfig.supportHours },
];

function Sidebar({ compact }: { compact?: boolean }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-lg">Who replies</h2>
        <p className="mt-1 text-sm text-ink-600">
          A real person on the OUTLYY team, {siteConfig.supportHours}. Send it whenever suits you —
          anything that arrives after we close is answered when we open. A named specialist is
          assigned the moment you send.
        </p>
        <div className="mt-3 space-y-2">
          {SHIFTS.map((s) => (
            <div
              key={s.name}
              className={`flex items-center gap-3.5 rounded-[var(--radius-card)] border border-ink-200 bg-paper ${compact ? "p-3" : "p-4"}`}
            >
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sun-100 font-display text-base font-bold text-sun-700 ring-2 ring-sun-200"
              >
                {s.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.95rem] font-bold leading-tight text-ink-900">{s.name}</p>
                <p className="text-xs text-ink-600 tnum">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-[0.95rem]">Why ask OUTLYY</h2>
        <TrustSummary />
      </Card>
    </div>
  );
}
