/**
 * Trust & legal page content.
 *
 * Written against the verified company facts recorded in
 * `docs/legal-compliance-audit.md` (H P D Tourism L.L.C, Dubai DET licence
 * 843819, tour-operator activity, TRN 100598421400003, principal/merchant of
 * record, VAT-inclusive AED pricing, per-activity cancellation terms, the
 * website in Vercel bom1 (Mumbai) with the database still in the United
 * States, staff in the UAE and India).
 *
 * Still NOT lawyer-reviewed. These are the product's plain-language drafts in
 * the style the PRD demands; counsel qualified in the UAE (PDPL, Consumer
 * Protection Law 15/2020, DET tourism rules) and India (DPDP Act 2023,
 * Consumer Protection Act 2019) must review them before launch. Every company
 * identifier comes from `siteConfig`, so an unset value renders nothing rather
 * than a placeholder.
 */

import { entityLine, siteConfig } from "@/lib/site-config";

export interface LegalPage {
  slug: string;
  title: string;
  intro: string;
  updated: string;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
}

const UPDATED = "22 September 2026";

const company = siteConfig.legalName ?? "the company operating OUTLYY";
const identity = entityLine() ?? "";
const address = siteConfig.registeredAddress;
const supportEmail = siteConfig.supportEmail;
const grievance = siteConfig.grievanceName && siteConfig.grievanceEmail ? `${siteConfig.grievanceName} (${siteConfig.grievanceEmail})` : undefined;
const trn = siteConfig.vatTrn;

/** "…, Office 1202, …" appended only when the address is configured. */
const atAddress = address ? ` Registered office: ${address}.` : "";

export const legalPages: Record<string, LegalPage> = {
  "cancellation-policy": {
    slug: "cancellation-policy",
    title: "Cancellation & refund policy",
    updated: UPDATED,
    intro:
      "Each experience carries its own cancellation terms, set by the operator who runs it. The terms that apply to you are the ones shown on the listing and repeated in your confirmation — this page explains how they work and how to use them.",
    sections: [
      {
        heading: "The policy on your listing is the policy that applies",
        paragraphs: [
          "Cancellation windows differ by experience: some are free to cancel up to 24 or 48 hours before, some are non-refundable from the moment the operator confirms, and a few are refundable only if the operator cancels. Every listing states its own window before you enquire, and we repeat it in writing when we confirm your booking.",
          "If the listing and your written confirmation ever disagree, the written confirmation wins — it is the document that reflects what the operator actually confirmed for your date.",
        ],
      },
      {
        heading: "How to cancel",
        paragraphs: [
          `Message us on WhatsApp${siteConfig.whatsappNumber ? "" : ""} or email ${supportEmail ?? "our support address"} with your reference number. A cancellation is effective from the moment we receive it, not from when we reply, and we send written confirmation of the outcome.`,
          `Requests sent outside our hours (${siteConfig.supportHours}) are timestamped on arrival, so a message sent at 11pm the night before a free-cancellation deadline counts as sent at 11pm.`,
        ],
      },
      {
        heading: "When you get your money back",
        paragraphs: [
          "Where the listing's terms give you a refund, we return the amount to the original payment method. Bank and card processing times are outside our control; the money usually appears within five to ten working days of us releasing it.",
          "Where the listing's terms do not give you a refund, we will still ask the operator on your behalf. Some operators allow a date change instead of a refund, and we will always try that before telling you no.",
        ],
      },
      {
        heading: "If we or the operator cancel",
        paragraphs: [
          "If an experience cannot run — weather, safety, mechanical failure, an operator shortfall — you choose between a full refund of what you paid us and a rebooking on another date at the same price, even if that date is priced higher.",
          "We tell you as soon as we know. We do not hold a cancellation back in the hope that it resolves itself.",
        ],
      },
      {
        heading: "If something goes wrong on the day",
        paragraphs: [
          `Contact us immediately, while the problem is still fixable — on WhatsApp during our hours (${siteConfig.supportHours})${siteConfig.emergencyPhone ? ", or on the emergency number printed on your confirmation at any time" : ""}. Tell us what happened and, where you can, send a photograph.`,
          "What we can put right depends on the operator's terms and on what actually happened; we will tell you honestly what is recoverable and what is not, and we pursue the operator ourselves rather than asking you to do it.",
        ],
      },
      {
        heading: "Your statutory rights",
        paragraphs: [
          "Nothing in this policy removes rights you have under the UAE Consumer Protection Law (Federal Law 15 of 2020) or under the consumer law of your own country of residence.",
        ],
      },
    ],
  },

  "price-guarantee": {
    slug: "price-guarantee",
    title: "How our prices work",
    updated: UPDATED,
    intro:
      "Prices shown on the site are indicative until an agent confirms availability and the final price with the operator. This page explains exactly what the number on a listing means.",
    sections: [
      {
        heading: "Indicative until confirmed",
        paragraphs: [
          "We do not take payment on this website. You send an enquiry, we check the date and the exact price with the operator, and we come back to you in writing with the confirmed price before anything is payable. The listing price is our best current information, not a quotation.",
          "If the confirmed price is higher than the listing price, you are free to walk away — you owe nothing until you accept a written confirmation.",
        ],
      },
      {
        heading: "What the price includes",
        paragraphs: [
          `Prices are quoted inclusive of UAE VAT${trn ? ` (TRN ${trn})` : ""} and of the taxes and fees the operator charges. Optional extras — transfers, upgrades, add-ons — are priced separately and are never added silently.`,
          "Where an experience is priced per person, the listing says so; where it is priced per vehicle, boat or group, the listing says that instead.",
        ],
      },
      {
        heading: "Rupee prices and currency",
        paragraphs: [
          "Indian rupee amounts are shown as a convenience conversion of the dirham price at a recent rate. The contract and any payment are in UAE dirhams unless we tell you otherwise in writing, and your bank's exchange rate and any foreign-transaction fee it charges are outside our control.",
        ],
      },
      {
        heading: "What we will not do",
        paragraphs: [
          "We do not add booking fees, service fees or card surcharges after a confirmed price. We do not quote a lead-in price that no real date can be booked at. If we cannot honour a price we quoted in writing, we say so and you are released from the booking.",
        ],
      },
    ],
  },

  terms: {
    slug: "terms",
    title: "Terms of service",
    updated: UPDATED,
    intro: `${identity || `These terms are between you and ${company}.`} They cover how enquiries, confirmations and bookings work.`,
    sections: [
      {
        heading: "Who you are contracting with",
        paragraphs: [
          `${company}${siteConfig.dubaiLicence ? `, licensed as a tour operator by the Dubai Department of Economy and Tourism under licence ${siteConfig.dubaiLicence}` : ""}, trades as OUTLYY and is the company you contract with.${atAddress}${trn ? ` VAT registration (TRN) ${trn}.` : ""}`,
          "We sell the experiences on this site in our own name. Individual activities are delivered on the ground by licensed operators we contract with; we remain responsible to you for the booking itself, for the accuracy of what we told you, and for supporting you before, during and after.",
        ],
      },
      {
        heading: "Enquiries, confirmations and bookings",
        paragraphs: [
          "Sending an enquiry does not create a booking and does not oblige you to pay anything. We check the date and price with the operator and reply with a written confirmation — normally within about 30 minutes during our working hours.",
          `A booking exists only when you accept that written confirmation and we receive payment. Payment is made to ${company}; we are the merchant of record for your booking.`,
          `Our working hours are ${siteConfig.supportHours}. Enquiries that arrive outside those hours are answered when we next open.`,
        ],
      },
      {
        heading: "Prices, taxes and currency",
        paragraphs: [
          `Listing prices are indicative until confirmed in writing, and are inclusive of UAE VAT${trn ? "" : " where VAT applies"}. Rupee amounts are a convenience conversion; the contract currency is UAE dirhams unless stated otherwise in writing.`,
          "Optional extras are priced separately and shown before you accept. We do not add fees after a confirmed price.",
        ],
      },
      {
        heading: "Cancellations and changes",
        paragraphs: [
          "Each experience carries the operator's own cancellation terms, shown on the listing and repeated in your confirmation. Those terms govern your booking; our cancellation policy page explains how to use them and what we do when an experience is cancelled by us or by the operator.",
        ],
      },
      {
        heading: "Your responsibilities",
        paragraphs: [
          "Give us accurate traveller details, a working phone number, and any dietary, medical, mobility or age-related requirement at the time of enquiry rather than on the day. Several experiences cannot accommodate a requirement disclosed at the meeting point.",
          "Arrive at the stated time and place. Operators do not wait, and a missed departure is generally not refundable.",
        ],
        bullets: [
          "Carry valid photo identification; several venues and all Abu Dhabi routes require it",
          "Follow the operator's safety instructions — they may refuse participation on safety grounds",
          "Tell us immediately if something goes wrong, while it is still fixable",
          "You are responsible for your own visas, insurance and fitness to take part",
        ],
      },
      {
        heading: "Content, reviews and intellectual property",
        paragraphs: [
          `The OUTLYY name, the site design, the written descriptions and the arrangement of this catalogue belong to ${company}. Photographs are either licensed stock, supplied by the operator, or our own; third-party names and logos belong to their owners and their appearance here does not imply endorsement.`,
          "Where we publish reviews of a sister brand in our group, they are labelled as such and linked to their original source. We do not publish invented reviews and we do not represent another business's reviews as our own.",
          "You may not copy, scrape or republish our catalogue, prices or descriptions without written permission.",
        ],
      },
      {
        heading: "Liability",
        paragraphs: [
          "Our liability for a booking is limited to the amount you paid for that booking, except where the law does not permit such a limit — including death or personal injury caused by our negligence, fraud, and rights you have under the UAE Consumer Protection Law or under the consumer law of your country of residence.",
          "We are not liable for losses caused by events outside our reasonable control — weather, road closures, government action, operator failure that we could not reasonably have foreseen — though our cancellation policy describes what we refund in those situations regardless of fault.",
        ],
      },
      {
        heading: "Governing law",
        paragraphs: [
          "These terms are governed by the laws of the United Arab Emirates as applied in the Emirate of Dubai, and the courts of Dubai have jurisdiction. This does not deprive you of the protection of mandatory consumer law in your country of residence.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [
          [supportEmail ? `Email ${supportEmail}.` : undefined, siteConfig.whatsappNumber ? "WhatsApp using the button on any page." : undefined, address ? `Post: ${address}.` : undefined].filter(Boolean).join(" ") ||
            "Use the contact page.",
        ],
      },
    ],
  },

  privacy: {
    slug: "privacy",
    title: "Privacy policy",
    updated: UPDATED,
    intro:
      "What we collect, why we collect it, who else sees it, where it is stored, how long we keep it, and how to make us delete it. Written to be read.",
    sections: [
      {
        heading: "Who is responsible for your data",
        paragraphs: [
          `${company} — trading as OUTLYY — decides how and why your personal data is used, which makes us the controller.${atAddress}`,
          grievance
            ? `Questions, requests and complaints about your data go to ${grievance}. They are our data-protection and grievance contact for the purposes of the UAE Personal Data Protection Law and India's Digital Personal Data Protection Act 2023, and they answer within 30 days.`
            : "Questions, requests and complaints about your data go to our support address.",
        ],
      },
      {
        heading: "What we collect",
        paragraphs: [
          "When you send an enquiry: your name, phone number, email address, travel dates, number and type of travellers, hotel or pickup area, any dietary preference, any special request you type, your budget band, and the experiences you were looking at.",
          "When you sign in: your phone number and the one-time code we send you, plus the profile and preferences you choose to save.",
          "Automatically: pages viewed, searches and filters used, the approximate country your request came from, a shortened one-way fingerprint of your IP address, your browser's user-agent string, and the identifiers described in our cookie policy — including the advertising click identifiers (for example from Google or Meta) that were attached to the link you arrived on.",
        ],
        bullets: [
          "We do not collect card or bank details on this site — no payment is taken here",
          "We do not ask for passport or Emirates ID details unless a specific operator requires them for your booking, and then only for that booking",
          "We do not knowingly collect data about children; traveller counts by age band are not the same as a child's identity",
        ],
      },
      {
        heading: "Why we use it, and on what basis",
        paragraphs: [
          "To answer your enquiry, check availability with the operator, confirm your booking, send confirmations and trip messages, and support you when something goes wrong. This is necessary to take steps at your request and to perform our contract with you.",
          "To meet tax and accounting obligations — UAE VAT records in particular — which is a legal obligation.",
          "To keep the site secure, prevent spam and abuse, and measure how well the product works. This is our legitimate interest, balanced against your privacy: security data is minimised and analytics identifiers are not used to build a profile for sale.",
          "To send marketing messages, and to message you on WhatsApp — both only with your consent, which you can withdraw at any time without affecting the service you have already booked.",
        ],
      },
      {
        heading: "Dietary, medical and accessibility information",
        paragraphs: [
          "A dietary preference or a medical or mobility note can reveal something sensitive about you. We ask for it only so the operator can act on it, we pass it only to the operator delivering your experience, and we use it for nothing else. If you would rather not type it here, tell us on WhatsApp or leave it out and we will ask the operator generically.",
        ],
      },
      {
        heading: "Who else sees your data",
        paragraphs: [
          "The operator delivering your experience receives what they need to deliver it: traveller names, counts, pickup point, date and time, and any requirement you told us about.",
          "The companies that run our technology see data only as part of running it, under contract, and may not use it for their own purposes.",
        ],
        bullets: [
          "Vercel — website and application hosting (Mumbai, India region)",
          "Neon — database hosting (United States, Ohio region)",
          "Resend — transactional email delivery",
          "MSG91 — delivery of sign-in codes by SMS",
          "Google — website analytics (Google Analytics 4), only where you have accepted measurement cookies",
          "Pexels — stock photography shown on the site (no personal data is sent to them)",
          "Our WhatsApp messaging provider, named here before we switch WhatsApp messaging on",
          "Payment providers, named here before we begin taking payment on this site",
        ],
      },
      {
        heading: "Where your data is stored, and who reaches it",
        paragraphs: [
          "Our website runs in Mumbai, India, and our database is hosted in the United States. That means your data is transferred outside the UAE and, for European visitors, outside the EEA. We rely on our contracts with those providers — which include the standard data-protection terms they publish — to keep the same protections travelling with the data.",
          "Our staff in the United Arab Emirates and in India access customer data to answer enquiries and deliver bookings. Access requires an individual account with two-factor authentication, is limited to what a role needs, and every action on a customer record is written to an audit log.",
        ],
      },
      {
        heading: "WhatsApp, email and marketing",
        paragraphs: [
          "Messages about an enquiry or a booking you made — confirmations, day-of details, changes — are service messages, sent because you asked us for something.",
          "Marketing messages are separate and require you to opt in. Replying STOP, or turning the setting off in your account, ends them; we action it immediately and it does not affect your existing bookings.",
          "WhatsApp messages are carried by Meta's WhatsApp Business Platform. Meta processes them under its own terms; we send the minimum needed to answer you.",
          "We do not sell your phone number, email address or any other personal data.",
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          "Enquiries that never became bookings, and anything we classified as spam: 24 months, then deleted.",
          "Bookings, invoices and payment records: seven years, because tax and accounting law requires it. If you ask us to delete your data before then, we remove the personal details and keep the financial record with your identity stripped out.",
          "Message logs and analytics events: 24 months. Records of the consents you gave: for as long as you could raise a complaint about a message we sent. Our internal audit log is kept as the security record.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          "You can ask us for a copy of everything we hold about you, correct it, ask us to delete it, object to us using it for marketing or analytics, or ask us to restrict how we use it. Signed-in customers can export their data and request deletion from Profile settings; everyone else can ask us by email.",
          grievance
            ? `Send requests to ${grievance}. We answer within 30 days. If you are not satisfied, you may complain to the UAE Data Office, or — if you are in India — to the Data Protection Board of India, or to your local data-protection authority.`
            : "Send requests to our support address. We answer within 30 days.",
          "A deletion request removes your personal details from our systems. Financial records required by law are retained with your identity replaced by an irreversible marker, and entries in our append-only audit and consent logs are kept because they are the evidence that we handled your data correctly.",
        ],
      },
      {
        heading: "Security",
        paragraphs: [
          "Data is encrypted in transit and at rest. Staff accounts require two-factor authentication and are rate-limited and locked after repeated failures. Sensitive fields are masked from staff who do not need them, IP addresses are stored only as a one-way hash, and every change to a customer record is written to an immutable audit log.",
          "No system is perfect. If a breach affects your data and is likely to put you at risk, we will tell you and the relevant regulator, as the law requires.",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: ["Our cookie policy explains every cookie and identifier we set, and how to refuse the non-essential ones."],
      },
      {
        heading: "Changes",
        paragraphs: [
          `We update this policy when what we do changes. The date at the top is the last change. Material changes are announced on the site before they take effect.${supportEmail ? ` Questions: ${supportEmail}.` : ""}`,
        ],
      },
    ],
  },

  cookies: {
    slug: "cookies",
    title: "Cookie policy",
    updated: UPDATED,
    intro: "Every cookie and browser identifier this site sets, what it is for, how long it lasts, and how to refuse the ones that are not essential.",
    sections: [
      {
        heading: "Strictly necessary",
        paragraphs: ["These make the site work. They cannot be switched off and they are not used for advertising."],
        bullets: [
          "outlyy_customer_session — keeps you signed in after a one-time code; expires with the session",
          "outlyy_customer — a flag that tells the site to show account links; no personal data",
          "outlyy_admin_session, outlyy_admin_pending — staff sign-in only, 8 hours",
          "outlyy_consent — the cookie choice you made on this banner, so we do not ask again; 6 months",
          "Local storage: your cart, saved list, comparison tray, recent searches and currency choice — stored in your browser, never sent to us except when you submit an enquiry",
        ],
      },
      {
        heading: "Measurement and attribution",
        paragraphs: [
          "These tell us which pages lead to enquiries so we can fix the ones that do not. Most are first-party — set by this site — and we do not sell what any of them record.",
          "One is not ours: we use Google Analytics 4, so if you accept measurement, Google receives your IP address (truncated before storage), the pages you view and a random device identifier. Google acts as our processor for this and is in the United States, so the transfer note in our privacy policy applies. Advertising personalisation and data sharing with Google Ads stay switched off unless you also accept the advertising category.",
          "None of them are set until you agree. Before you choose, and if you choose no, they are not written at all and no analytics event leaves your browser — the site simply does not measure you. Measurement and advertising attribution can be accepted separately.",
        ],
        bullets: [
          "outlyy_sid — groups your page views into one visit; 30 minutes",
          "outlyy_aid — a random identifier that lets us count returning visits; 1 year",
          "outlyy_attr — remembers how you first reached us (search, ad, referral) including advertising click identifiers such as gclid or fbclid; 1 year",
          "_ga, _ga_<id> — set by Google Analytics to count visits and distinguish one device from another; up to 2 years. These are Google's cookies, not ours, and are the only third-party cookies on this site.",
        ],
      },
      {
        heading: "Advertising",
        paragraphs: [
          "We load no advertising pixels — no Meta Pixel, no Google Ads remarketing tag. The only advertising-adjacent signal is Google Analytics' own advertising features, and those are held off by Google Consent Mode unless you accept the advertising category. Accept measurement only and Google is told, in its own protocol, that advertising storage is denied.",
          "If we ever add a real advertising pixel it will be listed here by name before it loads, and it will load only after you agree.",
        ],
      },
      {
        heading: "How to refuse or change your mind",
        paragraphs: [
          "The banner on your first visit has Reject all next to Accept all, and a Choose option for picking one category and not the other. Refusing changes nothing about what you can see or do here.",
          "To change the decision later, use the Cookie settings link at the bottom of any page. Withdrawing consent deletes the cookies in the category you turned off straight away, without a page reload.",
          "Your browser also offers a blanket block on cookies; the strictly necessary ones above are then unavailable and sign-in will not work.",
        ],
      },
    ],
  },

  "data-rights": {
    slug: "data-rights",
    title: "Your data rights & how to complain",
    updated: UPDATED,
    intro: "How to see your data, correct it, delete it, stop messages, and escalate if we get it wrong.",
    sections: [
      {
        heading: "Who to contact",
        paragraphs: [
          grievance
            ? `${grievance} handles data-protection requests and grievances for ${company}. This is the Grievance Officer contact required by India's Digital Personal Data Protection Act 2023 and the data-protection contact required by the UAE Personal Data Protection Law.${atAddress}`
            : `Requests go to ${supportEmail ?? "our support address"}.${atAddress}`,
        ],
      },
      {
        heading: "What you can ask for",
        paragraphs: ["Any of the following, free of charge, by email or from your account:"],
        bullets: [
          "A copy of the personal data we hold about you (signed-in customers can export it instantly from Profile settings)",
          "Correction of anything wrong",
          "Deletion of your personal data — we anonymise financial records we must keep by law",
          "An end to marketing messages, or to WhatsApp messaging",
          "An explanation of how we used your data, and objection to analytics",
        ],
      },
      {
        heading: "How long we take",
        paragraphs: [
          "We acknowledge a request as soon as we see it and complete it within 30 days. If a request is complex and needs longer, we tell you why and when it will be done.",
          "We may ask you to confirm the phone number or email on the account before we act, so that nobody else can request your data.",
        ],
      },
      {
        heading: "If you are not satisfied",
        paragraphs: [
          "Tell us first — most problems are a misunderstanding we can fix the same day. If you are still unhappy, you can complain to the UAE Data Office; if you are in India, to the Data Protection Board of India; if you are in the EEA or the UK, to your national data-protection authority.",
          "Consumer complaints about a booking (rather than about data) can be raised with the Dubai Department of Economy and Tourism after you have given us a chance to put it right.",
        ],
      },
    ],
  },

  disclaimer: {
    slug: "disclaimer",
    title: "Disclaimer",
    updated: UPDATED,
    intro: "What the information on this site is, and what it is not.",
    sections: [
      {
        heading: "Experiences are delivered by licensed operators",
        paragraphs: [
          `${company} sells these experiences in its own name and remains responsible to you for your booking. The activity itself — the vehicle, the vessel, the guide, the venue — is delivered by a licensed operator, and their on-site safety rules and conduct are theirs. We tell you who is operating an experience when we confirm it.`,
        ],
      },
      {
        heading: "Prices and availability are indicative",
        paragraphs: [
          "Listing prices and availability are our best current information, gathered from operators. They are not a quotation. The price and the date become binding only in the written confirmation we send you.",
        ],
      },
      {
        heading: "Descriptions, photographs and third-party names",
        paragraphs: [
          "Descriptions are written from operator material and our own checks. Photographs are licensed stock, supplied by the operator, or our own, and are illustrative of the experience rather than of a specific departure, vehicle or seat.",
          "Third-party names, venue names and logos are the property of their owners. Their appearance here identifies the place or the operator and does not imply a partnership or endorsement unless we say so in writing.",
        ],
      },
      {
        heading: "Travel, health and documents",
        paragraphs: [
          "You are responsible for your visas, travel insurance, and your fitness to take part in an activity. Where an experience carries an age, height, weight, pregnancy or medical restriction, it is stated on the listing — please read it before you book.",
          "Nothing on this site is medical, legal, immigration or financial advice.",
        ],
      },
    ],
  },

  about: {
    slug: "about",
    title: "Why OUTLYY exists",
    updated: UPDATED,
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
          "We show all-in prices, inclusive of VAT, and confirm the exact price with the operator before anything is payable. We treat dietary and accessibility needs as filters and confirm them in writing with the operator. We publish pickup coverage before you commit. And we keep a person on WhatsApp during our working hours, because a large family booking is a conversation, not a checkout.",
          "We also keep the catalogue deliberately small and curated, from operators we contract with directly. A traveller with three hundred options and no way to tell them apart books nothing.",
        ],
      },
      {
        heading: "How we make money",
        paragraphs: [
          "A margin on what we sell, built into the confirmed price. We do not charge booking fees, we do not take a cut of your cancellation, and we do not sell your data.",
        ],
      },
      {
        heading: "Who we are",
        paragraphs: [
          [
            identity || undefined,
            address ? `Registered office: ${address}.` : undefined,
            trn ? `VAT registration (TRN) ${trn}.` : undefined,
            `Support runs ${siteConfig.supportHours}.`,
          ]
            .filter(Boolean)
            .join(" "),
        ],
      },
    ],
  },
};
