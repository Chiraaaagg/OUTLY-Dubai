/**
 * Trust & legal page content.
 *
 * NOT legal advice and not lawyer-reviewed. These are product-written drafts in
 * the plain-language style the PRD demands ("cancellation policy in plain
 * language — not legalese"). PRD §16 requires legal review before launch,
 * particularly for DPDP Act compliance and the GST/TCS treatment — flagged in
 * docs/known-limitations.md.
 */

export interface LegalPage {
  slug: string;
  title: string;
  intro: string;
  updated: string;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
}

export const legalPages: Record<string, LegalPage> = {
  "cancellation-policy": {
    slug: "cancellation-policy",
    title: "Cancellation & refund policy",
    updated: "1 September 2026",
    intro:
      "Written the way we would explain it on the phone. The specific rule for any experience is always shown on its own page before you pay, and again on your voucher — this page is the general framework behind those rules.",
    sections: [
      {
        heading: "The general rule",
        paragraphs: [
          "Most experiences on OUTLY can be cancelled free of charge up to 24 hours before your start time, with the full amount refunded. Some carry a 48-hour window because the operator commits resources earlier — private camps, charters and helicopter flights are the usual examples. A small number of timed-entry tickets are non-refundable once issued.",
          "Whichever applies to what you are booking is stated on the activity page above the Book button, not buried in a terms document. If the page and this policy ever disagree, the activity page wins.",
        ],
      },
      {
        heading: "How to cancel",
        paragraphs: [
          "From Manage booking, using your reference and the phone or email you booked with. You will see the exact refund amount and the expected credit date before you confirm anything. There is no form to submit and nobody to wait for.",
          "If you would rather talk to someone, message us on WhatsApp. We will often suggest moving the date instead — for a date problem rather than a change of mind, that usually costs nothing and keeps the experience.",
        ],
      },
      {
        heading: "When you get your money back",
        paragraphs: [
          "We initiate eligible refunds within 24 hours of cancellation and send written confirmation. The money reaches your original payment method in 5–7 working days depending on your bank. UPI refunds are usually faster; credit cards are usually slower.",
          "If you paid a 30% deposit and cancel within the free window, the deposit is refunded in full. If you cancel after the free window, the deposit covers the operator's charge and the balance is not collected.",
        ],
      },
      {
        heading: "If we or the operator cancel",
        paragraphs: [
          "If an operator cannot honour a confirmed booking, you get three options within two hours: an alternative experience of equal value, an alternative date, or a full refund. You choose. We do not offer credit in place of a refund.",
          "Weather cancellations on balloon and helicopter flights are refunded in full or rebooked at your choice, decided by you rather than by us. The operator's call is usually made the evening before or at the launch site.",
        ],
      },
      {
        heading: "If something goes wrong on the day",
        paragraphs: [
          "Call the emergency number on your voucher before you leave the venue — it is answered 24/7 by a person. If a pickup is more than 30 minutes late we either dispatch another vehicle or refund the booking in full. If a confirmed dietary requirement was not provided, we refund the meal portion of the booking and log it against the supplier.",
          "We can only put things right if we hear about them while they are happening or shortly after. Complaints raised weeks later are much harder to resolve with an operator, though we will still try.",
        ],
      },
    ],
  },

  "price-guarantee": {
    slug: "price-guarantee",
    title: "Our price promise",
    updated: "1 September 2026",
    intro:
      "Two commitments, both checkable. The first is about honesty; the second is about value. We take the first far more seriously than the second.",
    sections: [
      {
        heading: "1. No fee, tax or surcharge appears after the first price you see",
        paragraphs: [
          "Every price on OUTLY includes taxes and booking fees. The number on the activity card is the number on the activity page, which is the number at checkout, which is the number charged to your card or UPI. The only things that change your total are optional extras you deliberately add.",
          "If a charge ever appears that was not visible when you first saw the price, that is a defect on our side. Tell us and we refund the difference without argument — no investigation, no waiting.",
        ],
      },
      {
        heading: "2. If you find it cheaper, tell us",
        paragraphs: [
          "If you find the same experience, same operator, same inclusions, same date, bookable in rupees at a lower all-in price within 24 hours of booking with us, send us the link. We will match it or refund the difference.",
          "The qualifiers matter and we would rather state them than surprise you: it has to be the same operator and the same inclusions, and the comparison price has to be genuinely bookable at the time you show it to us — not a cached listing or a price that requires a currency conversion you would not actually get.",
        ],
      },
      {
        heading: "What we will not do",
        paragraphs: [
          "We do not run fake discounts. A struck-through comparison price appears only where the higher figure is a real, published gate or walk-up rate that a person could actually pay — never an invented anchor.",
          "We do not run countdown timers on prices that are not genuinely time-limited, and we do not display 'only 2 left' unless the operator's live inventory says so. Manufactured urgency works once, and then it costs you every repeat booking.",
        ],
      },
    ],
  },

  terms: {
    slug: "terms",
    title: "Terms of use",
    updated: "1 September 2026",
    intro:
      "OUTLY Travel Technologies Pvt. Ltd. acts as a booking agent between you and the experience operator. These terms cover how that works.",
    sections: [
      {
        heading: "What we are",
        paragraphs: [
          "We contract with licensed Dubai and Abu Dhabi tour operators and sell their experiences to you. The operator delivers the experience and is responsible for its safety and conduct; we are responsible for the accuracy of what we told you, for your booking and payment, and for supporting you before, during and after.",
          "Where an experience is delivered poorly, we will pursue the operator on your behalf and, in the cases described in our cancellation policy, refund you directly rather than waiting for them.",
        ],
      },
      {
        heading: "Booking and payment",
        paragraphs: [
          "A booking is confirmed when payment is received and, for experiences requiring operator confirmation, when that operator confirms — within two hours. Until then your payment is held and fully refundable.",
          "Prices are all-inclusive as described in our price promise. Payment is processed by a PCI-DSS compliant gateway; card details never reach our servers.",
        ],
      },
      {
        heading: "Your responsibilities",
        paragraphs: [
          "Give us accurate traveller details, a working phone number, and any dietary, medical or mobility requirement at the time of booking rather than on the day. Several of the experiences we sell cannot accommodate a requirement disclosed at the meeting point.",
          "Arrive at the stated time. Operators do not wait, and a missed departure is not refundable.",
        ],
        bullets: [
          "Carry valid photo ID; some venues and all Abu Dhabi routes require it",
          "Follow operator safety instructions — they can refuse participation on safety grounds",
          "Tell us immediately if something goes wrong, while it is still fixable",
        ],
      },
      {
        heading: "Reviews",
        paragraphs: [
          "Only customers with a completed booking can review, and reviews are moderated within 24 hours. We publish negative reviews. We remove reviews that identify individuals, contain abuse, or are not about the experience booked — and we tell the author why.",
        ],
      },
      {
        heading: "Liability",
        paragraphs: [
          "Our liability is limited to the value of the booking. We are not liable for losses arising from operator conduct outside our control, weather, or events beyond reasonable anticipation — though our cancellation policy describes what we do refund in those situations regardless of liability.",
          "Nothing here limits rights you have under Indian consumer law.",
        ],
      },
    ],
  },

  privacy: {
    slug: "privacy",
    title: "Privacy policy",
    updated: "1 September 2026",
    intro:
      "What we collect, why, and how to get rid of it. Written to be readable; the DPDP Act compliance detail is in the sections below rather than in a separate document.",
    sections: [
      {
        heading: "What we collect",
        paragraphs: [
          "Booking details: name, email, phone, hotel or pickup location, traveller counts, and any dietary, accessibility or medical requirement you tell us. We collect passport or Emirates ID details only where a specific operator requires them, and only for that booking.",
          "Usage data: pages viewed, searches, filters applied and bookings made, tied to your session. We use this to improve the product and to measure advertising — not to build a profile for resale.",
        ],
      },
      {
        heading: "Why we collect it",
        paragraphs: [
          "To make and deliver your booking, to pass your requirements to the operator, to send your voucher and trip messages, to support you when something goes wrong, and to meet tax and accounting obligations.",
          "Dietary and accessibility information is shared with the specific operator delivering your experience, because that is the only way it gets acted on. It is not used for anything else.",
        ],
      },
      {
        heading: "WhatsApp and marketing",
        paragraphs: [
          "Transactional messages — confirmations, vouchers, driver details, day-of updates — are sent because you made a booking. Marketing messages require a separate opt-in, and a single reply of STOP turns them off within 60 seconds across every flow.",
          "We do not sell your phone number or email to anyone.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          "You can export everything we hold about you, correct it, or ask us to delete it, from Profile settings or by messaging us. We action deletion requests within statutory timelines.",
          "Bookings and invoices from the last seven years are retained for tax and legal reasons even after a deletion request. We would rather tell you that than quietly keep them.",
        ],
      },
      {
        heading: "Security",
        paragraphs: [
          "Personal data is encrypted at rest and in transit. Card data never touches our servers — payments are handled by a PCI-DSS compliant gateway. Admin access requires multi-factor authentication and every state-changing action is written to an immutable audit log.",
        ],
      },
    ],
  },

  about: {
    slug: "about",
    title: "Why OUTLY exists",
    updated: "1 September 2026",
    intro:
      "We are not trying to build a better Klook. We are trying to beat the travel agent you would otherwise use — on trust, not just on price.",
    sections: [
      {
        heading: "The problem",
        paragraphs: [
          "An Indian family booking Dubai activities today picks between three unsatisfying options. A local agent who is trusted and reachable, but marks up opaquely and offers whatever they have a relationship with. A global booking site that quotes in dirhams, takes a foreign card, has no Hindi support and no idea what Jain food is. Or the hotel desk on arrival, at a twenty to fifty percent premium.",
          "All three produce the same complaints: hidden fees, pickups that never arrive, food that does not match what was promised, and nobody to call when it goes wrong.",
        ],
      },
      {
        heading: "What we do differently",
        paragraphs: [
          "We publish all-in rupee prices and never add anything at checkout. We treat dietary and accessibility needs as filters and confirm them in writing with the supplier's kitchen. We publish pickup coverage before you pay and send the driver's name and number the night before. And we keep a person on WhatsApp who answers in about eight minutes, because a fifty-thousand-rupee family booking is a conversation, not a checkout.",
          "We also keep the catalogue deliberately small. Around twenty-six experiences, from a handful of operators we score monthly on punctuality, rejection rate and complaints. A traveller with three hundred options and no way to tell them apart books nothing.",
        ],
      },
      {
        heading: "How we make money",
        paragraphs: [
          "A margin on what we sell, built into the published price. We do not charge booking fees, we do not take a cut of your cancellation, and we do not sell your data. Where a bundle saves you money we show the separate-purchase price next to it so you can check the arithmetic yourself.",
        ],
      },
      {
        heading: "Where we are",
        paragraphs: [
          "OUTLY Travel Technologies Pvt. Ltd. — Mumbai, India and Business Bay, Dubai. GSTIN 07AABCO1234A1Z5. Support runs 9am–11pm IST every day, with a 24/7 emergency line for anyone currently in Dubai.",
        ],
      },
    ],
  },
};
