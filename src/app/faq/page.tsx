import type { Metadata } from "next";
import { PageView } from "@/components/analytics/page-view";
import { WhatsAppCard } from "@/components/commerce/whatsapp";
import { Accordion } from "@/components/ui/accordion";
import { Breadcrumbs, SectionHeading } from "@/components/ui/primitives";
import type { Faq } from "@/lib/types";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "How OUTLY pricing, UPI payments, Jain and pure-veg food, hotel pickup, vouchers, cancellations and refunds work — answered plainly.",
  alternates: { canonical: "/faq" },
};

const SECTIONS: { id: string; title: string; kicker: string; faqs: Faq[] }[] = [
  {
    id: "inquiry",
    kicker: "How it works",
    title: "Checking availability & price",
    faqs: [
      {
        q: "Why can't I just book instantly?",
        a: "Because we confirm with the operator before you pay — so you never get a voucher that fails at the gate. Wrong tickets, rejected vouchers and 'sold out' after payment are the most common complaints on the big booking sites. We take the 30 minutes to avoid them, and nothing is charged until availability is confirmed.",
      },
      {
        q: "How fast will I hear back?",
        a: "A named specialist replies on WhatsApp within 30 minutes between 9am and 11pm IST — the confirmation page and your acknowledgement message both show the exact time, not a vague 'soon'. Out of hours, your inquiry is queued for the first shift and the time shown adjusts to the real one.",
      },
      {
        q: "Does the price change?",
        a: "The price on the site is the all-in price we expect to confirm, and it is right the large majority of the time. If the operator's rate has moved — peak dates, a supplement for your pickup area — we tell you the old and new figure and why, before you pay anything. We never quietly quote higher.",
      },
      {
        q: "How do I pay?",
        a: "Once you've said yes to the confirmed price, we send a secure Razorpay payment link in the same WhatsApp thread. UPI, cards, netbanking, wallets and EMI on larger amounts; UAE cards for residents. Your voucher follows once payment clears.",
      },
    ],
  },
  {
    id: "pricing",
    kicker: "Money",
    title: "Pricing & fees",
    faqs: [
      {
        q: "Is the price I see really the price I pay?",
        a: "Yes. Every price on OUTLY includes taxes and booking fees, and it is the amount charged. The only things that change your total are optional extras you deliberately add — hotel pickup, a cake, a photographer. If a fee ever appears that wasn't on the activity page, that is a defect on our side and we refund the difference without argument.",
      },
      {
        q: "Why are your prices sometimes higher than the gate price?",
        a: "Occasionally they are, and we won't pretend otherwise. Where a gate price is genuinely lower we don't show a struck-through comparison. What you get instead is a guaranteed slot, a voucher in rupees, free cancellation where it exists, and someone to call if the operator lets you down.",
      },
      {
        q: "Do you show prices in AED?",
        a: "Yes — visitors in the UAE see dirham prices automatically, and you can switch currency in the header. AED and INR prices are set independently rather than converted, so changing one never silently changes the other.",
      },
      {
        q: "What is TCS and will I be charged it?",
        a: "Tax Collected at Source applies to certain overseas travel purchases made from India. Where it applies we show it as a clearly labelled line before payment, with a help link explaining that it is refundable against your income tax return. It is never hidden inside another number.",
      },
    ],
  },
  {
    id: "payments",
    kicker: "Paying",
    title: "Payments",
    faqs: [
      {
        q: "Which payment methods do you accept?",
        a: "UPI (GPay, PhonePe, Paytm or any UPI app), Indian credit and debit cards, netbanking, wallets, and EMI on orders above ₹15,000. UAE residents can pay in AED with a UAE card. UPI is first in the list because it's what most of our customers use.",
      },
      {
        q: "My UPI payment failed but the money left my account.",
        a: "That is almost always a bank-side timeout, and the amount auto-reverses within 3–5 working days. Your booking is held on our side in the meantime. Message us with the UTR number and we'll confirm exactly what happened and hold your slot while it resolves.",
      },
      {
        q: "Can I pay a deposit instead of the full amount?",
        a: "On orders above ₹25,000 for eligible experiences, yes — 30% now and the balance seven days before you travel. Your booking is confirmed either way, and we remind you on WhatsApp before the balance is due.",
      },
      {
        q: "Do you store my card details?",
        a: "No. Payments are handled entirely by a PCI-DSS compliant gateway. Card numbers never reach our servers. If you choose to save a method for faster repeat booking, the gateway holds a token, not the card.",
      },
    ],
  },
  {
    id: "food",
    kicker: "Eating",
    title: "Food & dietary requirements",
    faqs: [
      {
        q: "Is Jain food genuinely available?",
        a: "On the experiences marked for it, yes — cooked to order without onion or garlic, served separately from the main buffet. It must be requested when you book, because the kitchen plans it in advance; 24 hours is the reliable minimum. The confirmation is printed on your voucher so it cannot be denied at the venue.",
      },
      {
        q: "What if my dietary requirement isn't met on the day?",
        a: "Message the emergency number on your voucher immediately, while you're still at the venue. We contact the supplier there and then. If the meal genuinely wasn't provided as confirmed, we refund the meal portion of your booking, and the failure is logged against that supplier's reliability score — which affects whether we keep selling them.",
      },
      {
        q: "Is 'vegetarian available' the same everywhere?",
        a: "No, and that's why we describe it specifically on each page. On some camps it's a separate live-cooking counter with a dozen dishes; on others it's a smaller selection. Where a supplier's vegetarian offering is thin, we say so rather than letting you find out at dinner.",
      },
    ],
  },
  {
    id: "pickup",
    kicker: "Getting there",
    title: "Hotel pickup & transfers",
    faqs: [
      {
        q: "How does hotel pickup work?",
        a: "You give us your hotel or building name at checkout. Shared transfers carry a 30-minute pickup window because the vehicle collects several groups. Your driver's name, photo, number and window reach you on WhatsApp the evening before, and you get a live message when they're ten minutes away.",
      },
      {
        q: "What if the driver doesn't turn up?",
        a: "Call the emergency number on your voucher. If pickup is more than 30 minutes late we either dispatch an alternative vehicle or cancel and refund the booking in full. That's the stated remedy, not something you have to negotiate afterwards.",
      },
      {
        q: "Is my hotel covered?",
        a: "Each activity page lists its own pickup zones. Deira, Bur Dubai, Downtown, Business Bay, Dubai Marina, JBR and Al Barsha are covered on nearly all of them. Palm Jumeirah and outer areas are usually covered but add journey time, and occasionally a supplement — which we show before you pay.",
      },
      {
        q: "Can you arrange a wheelchair-accessible vehicle?",
        a: "On most transfers, with 48 hours' notice. Message us before booking and we'll confirm the specific vehicle and the venue's access in writing first, rather than taking the booking and hoping.",
      },
    ],
  },
  {
    id: "vouchers",
    kicker: "Your ticket",
    title: "Vouchers & confirmation",
    faqs: [
      {
        q: "How quickly do I get my voucher?",
        a: "For instant-confirmation experiences, under a minute at the median — on WhatsApp, by email and in your account. If it hasn't arrived within ten minutes the system resends automatically and alerts an agent.",
      },
      {
        q: "What does 'operator confirms within 2 hours' mean?",
        a: "Some experiences — private camps, charters, helicopters — need the operator to confirm the slot rather than selling from live inventory. You get a status message within five minutes and the confirmed voucher within two hours. If they can't take it, you get three options — an alternative experience, an alternative date, or a full refund — within two hours, without chasing us.",
      },
      {
        q: "Will my voucher work without internet?",
        a: "Yes, once you've opened it. It stays available offline, which matters because you'll often be opening it in a car park on roaming data.",
      },
    ],
  },
  {
    id: "cancellations",
    kicker: "Changing plans",
    title: "Cancellations & refunds",
    faqs: [
      {
        q: "How do I cancel?",
        a: "From Manage booking, using your reference and the phone or email you booked with. You'll see the exact refund amount and the expected credit date before you confirm anything. No form, no waiting for someone to get back to you.",
      },
      {
        q: "How long do refunds take?",
        a: "We initiate them within 24 hours of an eligible cancellation and send written confirmation. The money reaches your original payment method in 5–7 working days, depending on your bank.",
      },
      {
        q: "Can I change the date instead?",
        a: "Usually, and often for free. Most operators allow one date change up to 24 hours before travel. Where a fee applies we show it before you confirm. Date changes need the operator to re-confirm, so allow up to two hours.",
      },
    ],
  },
];

/**
 * FAQ — the objection-handling page.
 *
 * Grouped by the six things that actually stop an Indian traveller from
 * booking. Every answer is written to be usable as-is by a WhatsApp agent,
 * which keeps the site and the humans saying the same thing.
 */
export default function FaqPage() {
  return (
    <div className="container-page py-6 pb-20">
      <PageView pageType="faq" />
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs items={[{ label: "Dubai", href: "/" }, { label: "FAQ" }]} className="mb-3" />
        <h1 className="text-[1.75rem] sm:text-3xl">Frequently asked questions</h1>
        <p className="mt-1.5 text-[0.95rem] text-ink-600">
          Plain answers to the six things people actually ask before booking Dubai from India.
        </p>

        <nav aria-label="FAQ sections" className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-ink-300 bg-paper px-3.5 py-2 text-sm font-semibold text-ink-700 hover:border-ink-900"
            >
              {s.title}
            </a>
          ))}
        </nav>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="mt-10 scroll-mt-32">
            <SectionHeading kicker={s.kicker} title={s.title} />
            <Accordion items={s.faqs} defaultOpen={-1} />
          </section>
        ))}

        <WhatsAppCard
          className="mt-10"
          context={{ intent: "general", placement: "faq" }}
          title="Still not answered?"
          body="Ask us directly. A real person replies in about eight minutes between 9am and 11pm IST — and if the answer is 'no, that won't work for your group', they'll say so."
        />
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: SECTIONS.flatMap((s) =>
              s.faqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            ),
          }),
        }}
      />
    </div>
  );
}
