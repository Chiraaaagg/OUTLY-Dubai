import {
  CalendarCheck2,
  Leaf,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  Tag,
  Truck,
} from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils";

/**
 * Trust modules.
 *
 * Every claim here maps to something the product actually does, because the
 * competitor we are beating is the customer's local travel agent, whose
 * advantage is trust. Vague reassurance ("book with confidence") is worth
 * nothing against that; specific, checkable promises are worth a great deal.
 */

const DIFFERENTIATORS = [
  {
    icon: Tag,
    title: "The price you see is the price you pay",
    body: "Taxes and booking fees are already inside every number on this site. If anything is ever added at checkout, that's a defect and we treat it as one.",
  },
  {
    icon: Leaf,
    title: "Jain and pure-veg, confirmed in writing",
    body: "Not a note in a form. We confirm it with the supplier's kitchen and print it on your voucher, so it can't be denied at the camp.",
  },
  {
    icon: MessageCircle,
    title: "A real person confirms before you pay",
    body: "Tell us your dates. A named specialist checks availability with the operator and replies on WhatsApp in about 30 minutes with the exact price. Nothing is charged until you say yes.",
  },
  {
    icon: CalendarCheck2,
    title: "Free cancellation, stated plainly",
    body: "Every activity says exactly when free cancellation ends, in plain language. Where a ticket is non-refundable, we say that too — before you pay.",
  },
];

export function WhyOutlyy({ className }: { className?: string }) {
  return (
    <section className={cn("", className)} aria-labelledby="why-outlyy">
      <div className="grid gap-4 sm:grid-cols-2">
        {DIFFERENTIATORS.map((d) => (
          <div
            key={d.title}
            className="flex gap-4 rounded-[var(--radius-card)] border border-ink-200 bg-paper p-5"
          >
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sun-100 text-sun-600"
            >
              <d.icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-[1.02rem] leading-snug text-ink-900">{d.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{d.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const MARQUEE_ITEMS = [
  { icon: Tag, label: "All-in pricing" },
  { icon: Smartphone, label: "UPI · GPay · PhonePe · Paytm" },
  { icon: MessageCircle, label: "Human reply in 30 minutes" },
  { icon: Leaf, label: "Jain & pure-veg filters" },
  { icon: Truck, label: "Hotel pickup with driver details" },
  { icon: ShieldCheck, label: "Operator confirms before you pay" },
  { icon: CalendarCheck2, label: "Free cancellation where available" },
  { icon: ReceiptText, label: "GST invoice on every booking" },
];

/**
 * Infinite trust marquee. Adapted from the 21st.dev "Testimonial Marquee"
 * pattern (21st.dev/@componentry/components/testimonial-marquee) — reimplemented
 * as a CSS keyframe translation with the track duplicated once, which avoids a
 * JS animation loop entirely. It is `aria-hidden` and duplicated content is
 * hidden from assistive tech; the same claims appear as real text in WhyOutlyy.
 */
export function TrustMarquee({ className }: { className?: string }) {
  const track = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div
      className={cn(
        "overflow-hidden border-y border-ink-200 bg-shell py-3",
        "[mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]",
        className,
      )}
    >
      <div className="flex w-max animate-[marquee_34s_linear_infinite] gap-8 motion-reduce:animate-none">
        {track.map((item, i) => (
          <span
            key={`${item.label}-${i}`}
            aria-hidden={i >= MARQUEE_ITEMS.length || undefined}
            className="flex shrink-0 items-center gap-2 text-sm font-semibold text-ink-700"
          >
            <item.icon className="h-4 w-4 text-sun-500" aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Facts about how OUTLYY works, not invented performance numbers.
 *
 * This used to render "18,400+ Indian travellers booked" and "4.7/5 from
 * 6,120 verified reviews" for a company that had never taken a booking.
 * Everything here is either structural (how the model works) or a promise we
 * publish and can be held to — nothing claims a track record we do not have.
 */
export function SocialProofStrip({ className }: { className?: string }) {
  const items = [
    { value: "Nothing", label: "Charged before a human confirms your booking" },
    { value: "30 min", label: `Reply promise, ${siteConfig.supportHours}` },
    { value: "All-in", label: "One price, in your currency, with nothing added at checkout" },
    { value: "Jain · veg", label: "Filters and meal requests confirmed in writing" },
  ];
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 rounded-[var(--radius-tile)] border border-ink-200 bg-paper p-5 sm:grid-cols-4",
        className,
      )}
    >
      {items.map((i) => (
        <div key={i.label} className="text-center">
          <p className="font-display text-2xl font-bold tnum text-ink-900">{i.value}</p>
          <p className="mt-0.5 text-xs leading-snug text-ink-600">{i.label}</p>
        </div>
      ))}
    </div>
  );
}

/** Compact trust row for the ADP sidebar and checkout. */
export function TrustSummary({ className }: { className?: string }) {
  const items = [
    { icon: ShieldCheck, label: "Operator confirms availability before you pay" },
    { icon: Tag, label: "All-in price — nothing added at checkout" },
    { icon: MessageCircle, label: "Confirmed with the operator before you pay" },
    { icon: Smartphone, label: "Named specialist replies in ~30 min" },
  ];
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-start gap-2.5 text-sm text-ink-700">
          <i.icon className="mt-0.5 h-4 w-4 shrink-0 text-lagoon-500" aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Payment methods, ordered the way this audience uses them. */
export function PaymentMethods({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {["UPI", "GPay", "PhonePe", "Paytm", "Visa", "Mastercard", "RuPay", "Netbanking", "EMI"].map(
        (m) => (
          <span
            key={m}
            className="rounded border border-ink-200 bg-paper px-2 py-1 text-2xs font-semibold text-ink-600"
          >
            {m}
          </span>
        ),
      )}
    </div>
  );
}
