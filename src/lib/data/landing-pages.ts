import type { Faq } from "../types";

/**
 * SEO landing page configuration.
 *
 * One reusable template (src/app/(landing)/[...]) populated by these entries.
 * PRD §7 quality gate: every published page must carry genuinely unique, useful
 * content — real prices, real inclusions, a real answer to the query — and at
 * least 400 words of non-boilerplate copy. Thin doorway pages are not published.
 */

export interface LandingPage {
  /** Route path, without the leading slash. Some are top-level (high-intent). */
  slug: string;
  /** Where the page renders: a dedicated top-level route or /lp/[slug]. */
  topLevel: boolean;
  h1: string;
  intentLabel: string;
  heroKicker: string;
  heroSub: string;
  heroImage: string;
  /** 400+ words of unique body copy, rendered as paragraphs. */
  body: string[];
  benefits: { title: string; detail: string }[];
  activitySlugs: string[];
  comboSlugs?: string[];
  /** Comparison module rows — the "which should I pick" table. */
  comparison?: {
    heading: string;
    subhead: string;
    slugs: string[];
    columns: ("price" | "duration" | "pickup" | "confirmation" | "cancellation" | "dietary" | "private")[];
  };
  faqs: Faq[];
  internalLinks: { label: string; href: string }[];
  relatedCategories: string[];
  whatsappPrompt: string;
  meta: { title: string; description: string; keywords: string[] };
}

export const landingPages: LandingPage[] = [
  {
    slug: "dubai-activities-for-indians",
    topLevel: true,
    h1: "Dubai Activities for Indian Travellers",
    intentLabel: "For Indian travellers",
    heroKicker: "Built for how Indians actually book Dubai",
    heroSub:
      "All-in rupee pricing, UPI at checkout, pure-veg and Jain food you can filter for, and a real person on WhatsApp in about eight minutes.",
    heroImage: "skyline-gold",
    body: [
      "Booking Dubai from India usually means choosing between three unsatisfying options. A local travel agent will hold your hand and quote in rupees, but the markup is invisible, the choice is whatever they have a relationship with, and there are no reviews to check. A global booking site will show you three hundred options priced in dirhams, take a foreign card, and have no idea what Jain food is. Or you can wait and book at the hotel desk in Dubai, at a twenty to fifty percent premium, from whichever operator pays the concierge the most.",
      "OUTLY exists because none of those three is good enough. We sell a curated set of Dubai experiences — not a catalogue of everything — priced all-in in rupees, bookable with UPI, and backed by a WhatsApp team that answers in about eight minutes during working hours. The price you see on the activity page is the price your card is charged. There is no service fee added at the last screen, no currency conversion surprise, and no tax line that appears after you have entered your details.",
      "The things Indian families actually ask about are treated as first-class product features rather than notes in a form. Dietary requirements are a filter: pure vegetarian, Jain without onion and garlic, and halal each narrow the results to suppliers who have confirmed it with their kitchen, and the confirmation is printed on your voucher so nobody at the venue can claim they were not told. Suitability is a filter too — a gentle desert safari with no dune bashing is its own bookable variant rather than something you have to negotiate with a driver who is already halfway to Al Lahbab.",
      "Payment works the way it does at home. UPI is the first and largest option at checkout, not an afterthought below the international card fields. Cards, netbanking, wallets and EMI on larger bookings are all supported. If you live in the UAE, prices switch to dirhams automatically and your UAE card works normally — a detail that most India-focused sites get wrong and that matters enormously if you are the family member in Dubai who books everything when relatives visit.",
      "And when self-serve is not the right answer, a human is. Booking fifty thousand rupees of activities for seven people including two children and three grandparents is not a checkout problem, it is a conversation. Tap Ask on WhatsApp from any activity page and the agent already knows which activity you were looking at, which dates you selected, how many people you are, and which dietary filter you applied. They will come back with options, priced in rupees and itemised, and can send you a payment link for exactly what you agreed. It is the same booking engine either way, so your voucher, your account and your cancellation rights are identical whether a person or a form took the order.",
    ],
    benefits: [
      {
        title: "All-in rupee pricing",
        detail:
          "Taxes and booking fees are inside the number you first see. Nothing is added at checkout — if it ever is, that's a defect and we treat it as one.",
      },
      {
        title: "UPI, cards, netbanking, EMI",
        detail:
          "UPI is the primary payment method with the largest tap target, not buried under international card fields.",
      },
      {
        title: "Jain, pure-veg and halal as filters",
        detail:
          "Confirmed with the supplier's kitchen and written onto your voucher, so it can't be denied at the venue.",
      },
      {
        title: "A human in about 8 minutes",
        detail:
          "WhatsApp, not a ticket queue. The agent sees which activity, which dates and how many guests before they reply.",
      },
    ],
    activitySlugs: [
      "evening-desert-safari-veg-jain",
      "burj-khalifa-124-125",
      "dhow-cruise-marina-dinner",
      "abu-dhabi-city-tour-grand-mosque",
      "museum-of-the-future",
      "atlantis-aquaventure",
    ],
    comboSlugs: ["desert-and-dhow-family", "dubai-icons-combo"],
    comparison: {
      heading: "The four most-booked experiences, compared honestly",
      subhead: "Same table you'd build yourself across four browser tabs.",
      slugs: [
        "evening-desert-safari-veg-jain",
        "gentle-desert-safari-seniors",
        "dhow-cruise-marina-dinner",
        "burj-khalifa-124-125",
      ],
      columns: ["price", "duration", "pickup", "dietary", "confirmation", "cancellation"],
    },
    faqs: [
      {
        q: "Can I pay in Indian rupees with UPI?",
        a: "Yes. Every price on OUTLY is quoted all-in in rupees and UPI is the first payment option at checkout, alongside cards, netbanking, wallets and EMI on orders above ₹15,000. If you're in the UAE, prices switch to dirhams and UAE cards work normally.",
      },
      {
        q: "Is pure vegetarian and Jain food genuinely available?",
        a: "On the experiences we mark for it, yes — confirmed with the supplier's kitchen, requested at the time of booking, and printed on your voucher. Jain meals need at least 24 hours' notice because they are cooked to order without onion or garlic.",
      },
      {
        q: "Do you add fees at checkout?",
        a: "No. The price on the activity page includes taxes and booking fees, and it is the amount charged to your card. Optional extras you deliberately add — hotel pickup, a cake, a photographer — are the only things that change the total.",
      },
      {
        q: "What if something goes wrong in Dubai?",
        a: "Every voucher carries an emergency support number that a person answers, plus the supplier's own contact. For pickups, the driver's name, photo and number reach you on WhatsApp the evening before, and you get a live message when they are ten minutes away.",
      },
      {
        q: "Can you help me plan the whole trip?",
        a: "Yes — that's the assisted rail and it's how roughly half our families book. Send your dates, group size and any dietary or mobility needs on WhatsApp, and we'll come back with an itemised itinerary in rupees, usually within the hour during working hours.",
      },
    ],
    internalLinks: [
      { label: "Desert safari with Jain food", href: "/activities/evening-desert-safari-veg-jain" },
      { label: "Pay with UPI", href: "/dubai-activities-with-upi" },
      { label: "Activities with hotel pickup", href: "/dubai-activities-with-hotel-pickup" },
      { label: "Dubai attraction combos", href: "/dubai-attraction-combos" },
      { label: "Dubai with kids", href: "/collections/dubai-with-kids" },
      { label: "Dubai with parents", href: "/collections/senior-friendly" },
    ],
    relatedCategories: ["desert-safari", "dubai-attractions", "family-activities"],
    whatsappPrompt: "Tell us your dates and group — we'll plan the whole trip in rupees.",
    meta: {
      title: "Dubai Activities for Indian Travellers — INR Pricing, UPI, Jain Food",
      description:
        "Book Dubai experiences in rupees with UPI, pure-veg and Jain food filters, hotel pickup and WhatsApp support in 8 minutes. All-in pricing with no fees added at checkout.",
      keywords: [
        "dubai activities for indians",
        "dubai tours in indian rupees",
        "dubai activities upi payment",
      ],
    },
  },
  {
    slug: "dubai-activities-with-upi",
    topLevel: true,
    h1: "Book Dubai Activities with UPI",
    intentLabel: "Pay by UPI",
    heroKicker: "Scan, pay, voucher on WhatsApp",
    heroSub:
      "UPI is the first payment option at OUTLY checkout — GPay, PhonePe, Paytm and any UPI app. No forex markup, no international card required.",
    heroImage: "marina-dusk",
    body: [
      "Most international activity sites treat UPI as an afterthought, if they support it at all. You get a card form built for a European traveller, an international transaction that your bank may decline, a currency conversion you did not choose, and a foreign transaction fee you discover on your statement two days later. For a family booking forty thousand rupees of experiences, that is real money and real friction.",
      "At OUTLY, UPI is the default. It sits at the top of the payment step with the largest tap target, because it is what most of our customers actually use. You scan or enter your UPI ID, approve in your own app, and the booking is confirmed against the rupee amount you already saw — not a dirham amount converted at whatever rate your card issuer felt like applying that day.",
      "The rest of the Indian payment stack is here too. Credit and debit cards from Indian banks, netbanking across the major banks, wallets, and EMI on orders above ₹15,000 — which matters for the family bookings that run past thirty or forty thousand rupees. For orders above ₹25,000 on eligible experiences we also offer a deposit: thirty percent now to hold the booking, the balance seven days before you travel. That is a genuine option, not an upsell, and it exists because a large family booking made eight weeks ahead should not require the entire amount up front.",
      "Payment is handled entirely by a PCI-compliant gateway. Card details never touch our servers, and we do not store them unless you explicitly choose to save a method for faster repeat booking. If a payment fails — and UPI occasionally does, usually a bank timeout rather than anything you did — your booking is preserved exactly as you left it, the failure reason is shown in plain language rather than an error code, and you can retry with a different method or hand the whole thing to a WhatsApp agent who will send you a payment link.",
      "Vouchers arrive the moment payment clears. For instant-confirmation experiences — which is most attraction tickets and many tours — the QR voucher reaches WhatsApp in under a minute, and also lands in your email and your OUTLY account. For experiences that need the operator to confirm, you get a status message within five minutes and the confirmed voucher within two hours, with an automatic escalation to our operations team if that deadline is missed.",
    ],
    benefits: [
      {
        title: "UPI first, not buried",
        detail: "GPay, PhonePe, Paytm and any UPI app, at the top of the payment step.",
      },
      {
        title: "No forex markup",
        detail: "You are charged the exact rupee amount shown on the activity page.",
      },
      {
        title: "EMI above ₹15,000",
        detail: "For the family bookings that run into tens of thousands.",
      },
      {
        title: "30% deposit above ₹25,000",
        detail: "Hold the booking now, pay the balance seven days before travel.",
      },
    ],
    activitySlugs: [
      "evening-desert-safari-veg-jain",
      "dhow-cruise-marina-dinner",
      "burj-khalifa-124-125",
      "atlantis-aquaventure",
      "img-worlds-of-adventure",
      "dubai-city-tour-half-day",
    ],
    faqs: [
      {
        q: "Which UPI apps work?",
        a: "All of them — Google Pay, PhonePe, Paytm, BHIM, Amazon Pay and any bank app that supports UPI. You can pay by scanning a QR or by entering your UPI ID.",
      },
      {
        q: "Is there a fee for using UPI?",
        a: "No. The price you see is the price charged, and UPI carries no surcharge on OUTLY.",
      },
      {
        q: "My UPI payment failed but money left my account. What now?",
        a: "That is almost always a bank-side timeout and the amount is auto-reversed within three to five working days. Your booking is held on our side, and you can either retry or message us on WhatsApp with the UTR number — we will confirm what happened and hold your slot while it resolves.",
      },
      {
        q: "Can I pay in dirhams instead?",
        a: "Yes, if you are in the UAE. Prices switch to AED automatically and UAE cards are supported. AED and INR prices are set independently rather than converted, so neither moves because the other did.",
      },
    ],
    internalLinks: [
      { label: "Dubai activities for Indians", href: "/dubai-activities-for-indians" },
      { label: "Last-minute Dubai activities", href: "/last-minute-dubai-activities" },
      { label: "Desert safari with Jain food", href: "/activities/evening-desert-safari-veg-jain" },
      { label: "How our pricing works", href: "/faq" },
    ],
    relatedCategories: ["dubai-attractions", "desert-safari", "cruises-yachts"],
    whatsappPrompt: "Payment not going through? We'll send you a direct link.",
    meta: {
      title: "Book Dubai Activities with UPI — GPay, PhonePe, Paytm",
      description:
        "Pay for Dubai tours and tickets with UPI. No forex markup, no international card needed. EMI above ₹15,000 and 30% deposits above ₹25,000.",
      keywords: ["dubai activities upi", "book dubai tours with upi", "dubai tickets pay in rupees"],
    },
  },
  {
    slug: "last-minute-dubai-activities",
    topLevel: true,
    h1: "Last-Minute Dubai Activities — Available Today & Tomorrow",
    intentLabel: "Today & tomorrow",
    heroKicker: "Already in Dubai with an empty afternoon?",
    heroSub:
      "Live availability, instant confirmation, and a QR voucher on WhatsApp in under a minute. Everything here can be booked for tonight or tomorrow.",
    heroImage: "skyline-night",
    body: [
      "Half of Dubai's visitors arrive with two days planned and five days booked. By day two the question changes from 'what should we see' to 'what can we actually get tomorrow' — and that is a different problem, because the answer depends on live availability rather than on what a listicle recommends.",
      "Everything on this page is filtered to instant confirmation with real availability in the next forty-eight hours. There is no 'enquire for availability' on these experiences. If the page says a slot is open for tomorrow morning, it is open, because availability is re-checked against the supplier at the moment you pay rather than read from a cache. If something sells out while you are deciding, you will be told before payment, not after.",
      "The voucher matters as much as the booking when you are this close to the date. For instant-confirmation experiences the QR code reaches WhatsApp in under a minute of payment clearing, and it works offline once opened — which is the actual use case, because you will be opening it in a car park with roaming data that has decided to stop working. It is also in your email and your OUTLY account, and you can re-download it from a booking lookup with just the reference and your phone number if you never made an account at all.",
      "Some things genuinely cannot be booked last minute, and we would rather say so than take your money and apologise later. Timed-entry attractions like the Museum of the Future frequently sell out three to four days ahead. Sunset slots at the Burj Khalifa go five to seven days ahead in winter. The private desert camp needs the kitchen to plan a menu. Where a same-day booking is genuinely not possible we show the next three available dates instead of an error, and where it is borderline, message us on WhatsApp — an agent can often call the operator and get a straight answer inside ten minutes.",
      "If you live in the UAE, this page is probably your default. Prices show in dirhams, UAE cards work, and the today/tomorrow filter is applied automatically. The single most common OUTLY booking is an Indian resident in Dubai booking a desert safari for relatives who landed yesterday and have decided they want to see the desert. That takes about ninety seconds on this page.",
    ],
    benefits: [
      {
        title: "Live availability, verified at payment",
        detail: "We re-check the supplier before charging you. No selling a slot that no longer exists.",
      },
      {
        title: "Voucher in under a minute",
        detail: "WhatsApp, email and your account — and it opens offline once you've viewed it.",
      },
      {
        title: "Free cancellation where it exists",
        detail: "Most same-day tickets are still cancellable up to 24 hours ahead. We say which aren't.",
      },
      {
        title: "AED pricing if you're here",
        detail: "UAE cards, dirham prices, and today/tomorrow filtered by default.",
      },
    ],
    activitySlugs: [
      "burj-khalifa-124-125",
      "dhow-cruise-marina-dinner",
      "jet-ski-burj-al-arab",
      "dubai-frame-tickets",
      "aya-universe",
      "evening-desert-safari-veg-jain",
    ],
    faqs: [
      {
        q: "How late can I book for today?",
        a: "It depends on the experience. Attraction tickets are usually bookable up to a couple of hours before the last entry. Desert safaris need to be booked by about 11am for the same afternoon, because the pickup route is planned in advance. The activity page shows the real cutoff for each.",
      },
      {
        q: "Will I definitely get the voucher in time?",
        a: "For instant-confirmation experiences, yes — median delivery is under a minute. If a voucher hasn't reached you within ten minutes, the system resends automatically and an agent is alerted.",
      },
      {
        q: "What if it sells out while I'm paying?",
        a: "Availability is re-verified with the supplier at the moment of payment authorisation. If the slot has gone, the payment is stopped before it completes and you are shown the next three available dates. You are never charged for something you cannot use.",
      },
    ],
    internalLinks: [
      { label: "Dubai attractions", href: "/categories/dubai-attractions" },
      { label: "Desert safaris", href: "/categories/desert-safari" },
      { label: "Pay with UPI", href: "/dubai-activities-with-upi" },
      { label: "Search everything", href: "/search?when=tomorrow" },
    ],
    relatedCategories: ["dubai-attractions", "water-activities", "cruises-yachts"],
    whatsappPrompt: "Need it for tonight? Message us — we'll call the operator directly.",
    meta: {
      title: "Last-Minute Dubai Activities — Book for Today or Tomorrow",
      description:
        "Same-day and next-day Dubai tours and tickets with live availability, instant confirmation and a WhatsApp voucher in under a minute. AED pricing for UAE residents.",
      keywords: [
        "last minute dubai activities",
        "dubai activities today",
        "book dubai tour tomorrow",
      ],
    },
  },
  {
    slug: "dubai-activities-with-hotel-pickup",
    topLevel: true,
    h1: "Dubai Activities with Hotel Pickup",
    intentLabel: "Hotel pickup included",
    heroKicker: "No taxis, no meeting points, no herding seven people",
    heroSub:
      "Door-to-door transfers with the driver's name, photo and number sent to you the evening before — and a live message when they're ten minutes away.",
    heroImage: "city-tour",
    body: [
      "The single most common complaint about Dubai activity bookings is not the activity. It is the pickup. A vague ninety-minute window, no driver contact, a call centre that does not answer, and a family of seven standing in a hotel lobby wondering whether to give up and take two taxis. It happens constantly, and it is entirely preventable.",
      "Everything on this page includes hotel pickup and drop in an air-conditioned vehicle, and every one of them tells you which areas are covered before you pay. Deira, Bur Dubai, Downtown, Business Bay, Dubai Marina, JBR and Al Barsha are included on almost all of them. Palm Jumeirah and the outer suburbs sometimes carry a supplement or a longer journey, and where that is true we state it on the activity page rather than discovering it with you on the day.",
      "The transfer information you actually need arrives the evening before: your driver's name, their photograph, their mobile number and a thirty-minute pickup window. On the day you get a message when they are ten minutes away. If the driver is more than thirty minutes late, the emergency number on your voucher reaches a person who can either dispatch another vehicle or cancel and refund the booking in full — which is the remedy, stated up front, rather than something you have to argue for afterwards.",
      "Group size changes what you should book. Shared transfers put six people in a 4x4 and collect two or three families in sequence, which is fine for a couple and tiresome for a group of seven with two small children. Most experiences here offer a private vehicle upgrade, and for five or more people that upgrade is usually cheaper than booking two shared vehicles — as well as keeping everyone together and letting you choose your own pickup time.",
      "For anyone travelling with parents or a wheelchair user, tell us before you book rather than after. A wheelchair-accessible vehicle can be arranged on most transfers with forty-eight hours' notice, and we will confirm the specific vehicle and the camp or venue's ramp access in writing before you pay. That is a WhatsApp conversation, not a checkbox, because the honest answer varies by supplier and by date.",
    ],
    benefits: [
      {
        title: "Driver details the night before",
        detail: "Name, photo, number and a 30-minute window. Plus a live 10-minutes-away message.",
      },
      {
        title: "Coverage published per activity",
        detail: "You know whether your hotel is included before you pay, not after.",
      },
      {
        title: "Private vehicle upgrades",
        detail: "For groups of five or more, usually cheaper than two shared cars.",
      },
      {
        title: "A stated remedy if pickup fails",
        detail: "Emergency number on the voucher; another vehicle or a full refund.",
      },
    ],
    activitySlugs: [
      "evening-desert-safari-veg-jain",
      "gentle-desert-safari-seniors",
      "abu-dhabi-city-tour-grand-mosque",
      "dubai-city-tour-half-day",
      "hot-air-balloon-sunrise",
      "morning-quad-bike-desert",
    ],
    comparison: {
      heading: "Which pickup-included experience suits your group?",
      subhead: "Pickup coverage, duration and dietary options side by side.",
      slugs: [
        "evening-desert-safari-veg-jain",
        "gentle-desert-safari-seniors",
        "dubai-city-tour-half-day",
        "abu-dhabi-city-tour-grand-mosque",
      ],
      columns: ["price", "duration", "pickup", "dietary", "cancellation"],
    },
    faqs: [
      {
        q: "Which areas are covered?",
        a: "Deira, Bur Dubai, Downtown, Business Bay, Dubai Marina, JBR and Al Barsha on nearly every pickup-included experience. Palm Jumeirah and Al Barsha South are covered on most but add roughly twenty minutes to the journey. Each activity page lists its own zones.",
      },
      {
        q: "How wide is the pickup window?",
        a: "Usually thirty minutes for shared transfers, because the vehicle collects several groups. Private vehicle upgrades give you a fixed time you choose.",
      },
      {
        q: "What if the driver doesn't turn up?",
        a: "Call the emergency number printed on your voucher. If pickup is more than thirty minutes late we either dispatch an alternative vehicle or cancel and refund the booking in full — and the failure is logged against that supplier's reliability score.",
      },
      {
        q: "Can you arrange a wheelchair-accessible vehicle?",
        a: "On most transfers, with forty-eight hours' notice. Message us on WhatsApp before booking and we'll confirm the specific vehicle and the venue's access in writing first.",
      },
    ],
    internalLinks: [
      { label: "Desert safaris", href: "/categories/desert-safari" },
      { label: "Dubai city tours", href: "/categories/dubai-city-tours" },
      { label: "Abu Dhabi day tours", href: "/abu-dhabi-day-tours-from-dubai" },
      { label: "Dubai with parents", href: "/collections/senior-friendly" },
    ],
    relatedCategories: ["desert-safari", "dubai-city-tours", "family-activities"],
    whatsappPrompt: "Not sure your hotel is covered? Send us the name and we'll check.",
    meta: {
      title: "Dubai Activities with Hotel Pickup — Door-to-Door Transfers",
      description:
        "Dubai tours with hotel pickup and drop included. Driver name, photo and number sent the night before. Private vehicle upgrades for groups of five or more.",
      keywords: [
        "dubai activities with hotel pickup",
        "dubai tours with transfers",
        "desert safari with hotel pickup",
      ],
    },
  },
  {
    slug: "dubai-attraction-combos",
    topLevel: true,
    h1: "Dubai Attraction Combos & Bundles",
    intentLabel: "Save with combos",
    heroKicker: "Two or three at once, for less",
    heroSub:
      "Every bundle shows what the same tickets cost bought separately, so you can check the saving instead of taking our word for it.",
    heroImage: "skyline-gold",
    body: [
      "Bundle pricing in travel is frequently dishonest. A 'combo' is advertised with a large percentage saving calculated against a gate price nobody pays, or against a walk-up rate that exists only in July. The number looks impressive and means nothing.",
      "Our combos show two prices: what the bundle costs, and what those exact same experiences cost bought individually on this site today. The saving is the difference between those two numbers, and you can verify it in about thirty seconds by opening the individual activity pages. Where a bundle does not actually save you money — a single park, for instance — we do not sell one.",
      "The savings are real but modest, and that is deliberate. Combining the Burj Khalifa, the Dubai Frame and the Museum of the Future saves about ₹1,280 per adult. The family pack of Aquaventure, the Lost Chambers and IMG Worlds saves ₹2,270 per adult, which for a family of four is close to nine thousand rupees. Pairing the desert safari with a Marina dhow cruise saves ₹790 per adult. Those are the honest numbers.",
      "Bundles also solve a scheduling problem, which is arguably worth more than the discount. Three timed-entry attractions booked separately will happily sell you overlapping slots on the same afternoon; our combos sequence them, and the trip timeline in your cart warns you before checkout if two activities clash. Each ticket still carries its own QR code and its own timed slot, so you can spread them across different days — most bundles are valid for thirty days from your first activity.",
      "You can swap components, but not in self-serve, because the bundle price is calculated from the specific combination. If you want the desert-and-dhow package with the gentle safari instead of the standard one, that is a free swap and you can select it at checkout. If you want something more unusual — the icons combo with Aquaventure instead of the Frame, say — message us on WhatsApp. We will price the alternative combination and it will still usually beat booking each piece separately.",
    ],
    benefits: [
      {
        title: "Separate price shown next to bundle price",
        detail: "The saving is verifiable in thirty seconds, not asserted.",
      },
      {
        title: "Sequenced so nothing clashes",
        detail: "Timed slots are arranged for you, and the cart warns you if two activities overlap.",
      },
      {
        title: "Valid for 30 days",
        detail: "Each ticket keeps its own QR — use them across different days if you prefer.",
      },
      {
        title: "Free swaps where they make sense",
        detail: "Gentle safari instead of standard, at no charge. Ask for anything else on WhatsApp.",
      },
    ],
    activitySlugs: [
      "burj-khalifa-124-125",
      "museum-of-the-future",
      "atlantis-aquaventure",
      "img-worlds-of-adventure",
    ],
    comboSlugs: [
      "dubai-icons-combo",
      "family-fun-pack",
      "desert-and-dhow-family",
      "theme-park-double",
      "abu-dhabi-day-combo",
    ],
    faqs: [
      {
        q: "Are combo savings real?",
        a: "Yes, and they are shown against what the same experiences cost individually on this site today rather than against a gate price nobody pays. You can check it by opening the activity pages.",
      },
      {
        q: "Do we have to use everything on the same day?",
        a: "No. Most bundles are valid for thirty days from your first activity date and each ticket carries its own timed slot and QR code.",
      },
      {
        q: "Can we cancel just one part?",
        a: "Not once the package is confirmed — the price depends on the combination. The whole package can be cancelled under the policy shown on its page, which is usually free up to 24 or 48 hours before the first activity.",
      },
    ],
    internalLinks: [
      { label: "Dubai Icons combo", href: "/combos/dubai-icons-combo" },
      { label: "Family Fun Pack", href: "/combos/family-fun-pack" },
      { label: "Desert + Dhow family pack", href: "/combos/desert-and-dhow-family" },
      { label: "Theme parks", href: "/categories/theme-parks" },
    ],
    relatedCategories: ["dubai-attractions", "theme-parks", "family-activities"],
    whatsappPrompt: "Want a custom bundle? Tell us what you'd like in it.",
    meta: {
      title: "Dubai Attraction Combos — Verifiable Savings on Bundles",
      description:
        "Dubai combo tickets that show the separate-purchase price next to the bundle price. Burj Khalifa, Museum of the Future, Aquaventure, IMG Worlds and more.",
      keywords: ["dubai attraction combo", "dubai combo tickets", "dubai bundle deals"],
    },
  },
  {
    slug: "abu-dhabi-day-tours-from-dubai",
    topLevel: true,
    h1: "Abu Dhabi Day Tours from Dubai",
    intentLabel: "Day trip",
    heroKicker: "One long day, properly organised",
    heroSub:
      "Sheikh Zayed Grand Mosque, Qasr Al Watan and the Corniche, with hotel pickup from Dubai and a Hindi-speaking guide if you want one.",
    heroImage: "mosque-white",
    body: [
      "Abu Dhabi is ninety minutes from central Dubai, which makes it an easy day trip and a poor half-day one. The mosque alone deserves two hours, Qasr Al Watan another ninety minutes, and the drive is three hours of your day in total. Anyone selling you Abu Dhabi plus Ferrari World plus the Louvre in a single day is selling you a coach seat and a series of photographs taken through a window.",
      "The version we sell runs about eleven hours door to door and covers the Sheikh Zayed Grand Mosque with a guide, Qasr Al Watan, the Corniche, Emirates Palace and the Heritage Village, with lunch included and vegetarian options as standard. Pickup is from your Dubai hotel at 07:30 and you are back by around 18:30. It is a long day, and for children under six it is a very long day — the half-day Dubai city tour is the gentler alternative.",
      "The dress code at the mosque is enforced properly and is the thing most visitors get wrong. Everyone needs ankles, wrists and shoulders covered, in something that is neither tight nor sheer. Women also need to cover their hair. Abayas are lent free at the entrance but the queue for them can be long, so carrying your own scarf saves twenty minutes. Photography is permitted in most areas but not during prayer times.",
      "A Hindi-speaking guide is available and should be selected when you book — it is a scheduled guide rather than a request the driver can fulfil on the morning. For families travelling with parents, this changes the day completely: the mosque's history is genuinely interesting and losing it to an English commentary nobody in the back row can follow is a waste of the trip. Tamil and Malayalam guides can sometimes be arranged with a few days' notice; ask on WhatsApp.",
      "Ferrari World is on Yas Island, on the far side of Abu Dhabi from the mosque, and does not fit into the same day as Qasr Al Watan without ruining both. Our Abu Dhabi combo schedules the two across two days for exactly that reason and still saves about ₹1,490 per adult. If you genuinely only have one day and Ferrari World is non-negotiable, message us — we will build a transport plan that gets you both, and we will be honest about what you will miss.",
    ],
    benefits: [
      {
        title: "Hotel pickup from Dubai",
        detail: "07:30 pickup, back around 18:30. Air-conditioned vehicle throughout.",
      },
      {
        title: "Hindi-speaking guide available",
        detail: "Selected at booking, not requested on the morning. Tamil and Malayalam on request.",
      },
      {
        title: "Lunch included, veg as standard",
        detail: "Jain meals arrangeable with 24 hours' notice — ask us before you book.",
      },
      {
        title: "Passport or Emirates ID needed",
        detail: "There are checkpoints on the route. We tell you this before you pay, not on the day.",
      },
    ],
    activitySlugs: ["abu-dhabi-city-tour-grand-mosque", "ferrari-world-abu-dhabi"],
    comboSlugs: ["abu-dhabi-day-combo"],
    faqs: [
      {
        q: "What is the dress code at the Sheikh Zayed Grand Mosque?",
        a: "Ankles, wrists and shoulders covered for everyone, in clothing that is neither tight nor sheer. Women must also cover their hair. Free abayas are available at the entrance but the queue can be long — bring your own scarf if you can.",
      },
      {
        q: "Can we add Ferrari World to the same day?",
        a: "We do not recommend it. Ferrari World is on Yas Island and needs most of a day on its own; combining it with Qasr Al Watan means rushing both. Our combo spreads them across two days and still saves about ₹1,490 per adult.",
      },
      {
        q: "How long is the drive?",
        a: "About ninety minutes each way from central Dubai, so roughly three hours in the car across the day.",
      },
      {
        q: "Do we need our passports?",
        a: "Carry your passport or Emirates ID. There are checkpoints on the Dubai–Abu Dhabi route and identification is occasionally requested.",
      },
    ],
    internalLinks: [
      { label: "Abu Dhabi combo", href: "/combos/abu-dhabi-day-combo" },
      { label: "Ferrari World tickets", href: "/activities/ferrari-world-abu-dhabi" },
      { label: "Dubai city tours", href: "/categories/dubai-city-tours" },
      { label: "Activities with hotel pickup", href: "/dubai-activities-with-hotel-pickup" },
    ],
    relatedCategories: ["dubai-city-tours", "theme-parks", "family-activities"],
    whatsappPrompt: "Only have one day for Abu Dhabi? We'll build the timing around you.",
    meta: {
      title: "Abu Dhabi Day Tours from Dubai — Grand Mosque & Qasr Al Watan",
      description:
        "Full-day Abu Dhabi tours from Dubai with hotel pickup, Sheikh Zayed Grand Mosque, Qasr Al Watan and lunch. Hindi-speaking guide available. All-in rupee pricing.",
      keywords: [
        "abu dhabi day tours from dubai",
        "sheikh zayed grand mosque from dubai",
        "abu dhabi city tour",
      ],
    },
  },

  /* ---- /lp/[slug] template pages — high-intent attraction & audience terms ---- */
  {
    slug: "burj-khalifa-tickets",
    topLevel: false,
    h1: "Burj Khalifa Tickets from India",
    intentLabel: "Burj Khalifa",
    heroKicker: "₹3,690 all-in, voucher on WhatsApp in a minute",
    heroSub:
      "Levels 124 & 125, or SKY on 148. We tell you which slot is genuinely worth paying more for.",
    heroImage: "skyline-gold",
    body: [
      "There are three Burj Khalifa tickets and the difference between them is mostly about crowds and time of day, not height. Levels 124 and 125 are the standard observation decks, and they carry the view that appears in every photograph of Dubai. Level 148 — sold as At the Top SKY — is higher, has a separate lift, a lounge with refreshments and a hosted experience, and about a tenth of the people.",
      "The bigger price lever is the time. 'Prime hours' means roughly 17:30 to 19:00, when you see the city in daylight, at sunset and lit up, all in one visit. It costs about ₹1,800 more per adult on the standard ticket and it sells out five to seven days ahead between November and March. Non-prime slots in the morning or after 21:00 cost less and are considerably quieter; the late evening view is very nearly as good and photographs better for most phone cameras.",
      "Our price is ₹3,690 all-in for the standard non-prime ticket, which includes taxes and the booking fee. Nothing is added at checkout. The equivalent walk-up price at the counter is higher, and prime slots on the day are frequently unavailable at any price during the winter season.",
      "Practically: entry is through The Dubai Mall on the Lower Ground floor, and you should arrive thirty minutes before your slot because security screening is slow, especially around sunset. The lift takes about a minute. There is no enforced time limit on the decks, and most visitors spend forty-five minutes to an hour. The whole route is step-free and wheelchair accessible, including the outdoor terrace on 124, which makes it one of the easier Dubai attractions for travellers with elderly parents.",
      "If you are booking for a group, or combining it with the Dubai Frame and the Museum of the Future, the icons combo saves about ₹1,280 per adult and sequences the three timed slots so they do not collide. And if you want the sunset slot on a specific date that is showing as sold out, message us on WhatsApp — cancellations release slots regularly and an agent can watch for one.",
    ],
    benefits: [
      { title: "₹3,690 all-in", detail: "Taxes and booking fee included. Nothing added at checkout." },
      { title: "Instant WhatsApp voucher", detail: "Median delivery under a minute. Works offline once opened." },
      { title: "Free cancellation to 24h", detail: "Full refund, no questions, up to a day before your slot." },
      { title: "Step-free throughout", detail: "Lift access and wheelchair accessible, including the terrace." },
    ],
    activitySlugs: ["burj-khalifa-124-125", "burj-khalifa-148-sky", "dubai-aquarium-underwater-zoo"],
    comboSlugs: ["dubai-icons-combo"],
    comparison: {
      heading: "124/125 or 148 — which ticket?",
      subhead: "The honest difference between the two.",
      slugs: ["burj-khalifa-124-125", "burj-khalifa-148-sky"],
      columns: ["price", "duration", "confirmation", "cancellation", "private"],
    },
    faqs: [
      {
        q: "How much are Burj Khalifa tickets in Indian rupees?",
        a: "₹3,690 all-in for levels 124 and 125 at non-prime hours, about ₹1,800 more for a sunset slot, and ₹9,450 for level 148 with SKY access. Those are the amounts charged — there is no fee added at checkout.",
      },
      {
        q: "Is level 148 worth the extra?",
        a: "On a busy Friday evening or for a special occasion, yes: a separate lift, seating, refreshments and far fewer people. For an ordinary visit, 124/125 gives you the same view for a third of the price.",
      },
      {
        q: "How far ahead should I book?",
        a: "Sunset slots: five to seven days in winter. Other slots: two to three days is usually comfortable, though the mall counter often has same-day availability at a higher price.",
      },
      {
        q: "Can my parents manage it?",
        a: "Yes. It is lift-access throughout, there is seating on both levels, and the entire route including the outdoor terrace is wheelchair accessible.",
      },
    ],
    internalLinks: [
      { label: "Burj Khalifa attraction guide", href: "/attractions/burj-khalifa" },
      { label: "Dubai Icons combo", href: "/combos/dubai-icons-combo" },
      { label: "Dubai attractions", href: "/categories/dubai-attractions" },
      { label: "Museum of the Future", href: "/activities/museum-of-the-future" },
    ],
    relatedCategories: ["dubai-attractions", "dubai-city-tours", "luxury-experiences"],
    whatsappPrompt: "Sunset slot sold out? We watch for cancellations — ask us.",
    meta: {
      title: "Burj Khalifa Tickets from India — ₹3,690 All-In",
      description:
        "Book Burj Khalifa level 124 & 125 tickets in rupees at ₹3,690 all-in. Instant WhatsApp voucher, free cancellation to 24 hours, level 148 SKY also available.",
      keywords: [
        "burj khalifa tickets",
        "burj khalifa ticket price in india",
        "burj khalifa tickets in rupees",
      ],
    },
  },
  {
    slug: "desert-safari-dubai",
    topLevel: false,
    h1: "Desert Safari Dubai — Booked Properly",
    intentLabel: "Desert safari",
    heroKicker: "From ₹2,990 with hotel pickup and dinner",
    heroSub:
      "Pure-veg and Jain camps, a gentle option with no dune bashing, and driver details sent the night before.",
    heroImage: "dune-sunset",
    body: [
      "The desert safari is the most-booked experience in Dubai and the one that most often disappoints, for three predictable reasons: the pickup, the dune bashing and the food. All three are solvable at the point of booking, and none of them is solvable afterwards.",
      "Pickup first. A safari collects several groups in sequence, so shared transfers carry a thirty-minute window rather than a fixed time. That is normal. What is not normal, and what causes most of the complaints, is having no driver contact and no way to check. Every safari we sell sends you the driver's name, photo, mobile number and window on WhatsApp the evening before, and a live message when they are ten minutes away. If pickup fails by more than thirty minutes, the emergency number on your voucher reaches a person who dispatches another vehicle or refunds you in full.",
      "Dune bashing is the second problem, and it is not a small one. Forty-five minutes of a 4x4 being driven deliberately over dune ridges is genuinely rough. It is unsuitable during pregnancy and for anyone with back, neck or heart conditions, and a great many Indian families are travelling with parents in their seventies for whom it is a bad idea. The answer is not to ask the driver to go gently — it is to book the gentle safari, which is a separate product that drives graded desert tracks, reaches the same camp at the same time, and includes the same dinner and the same shows. Families frequently split across both and meet at the camp.",
      "Food is the third. 'Vegetarian available' can mean a separate live-cooking counter with a dozen dishes, or it can mean paneer at the end of a meat buffet. Jain food — cooked without onion and garlic — cannot be produced on request at the camp on the evening itself; it has to be planned. The camps we mark as Jain-capable cook it to order, it must be requested when you book, and the confirmation is printed on your voucher so it cannot be denied on the night. Our review form asks every guest whether their dietary requirement was actually met, and a negative answer goes to the supplier's scorecard.",
      "On price: ₹2,990 all-in per adult for the standard evening safari with hotel pickup, dinner, camel ride and shows. The gentle version is ₹3,290 because it carries fewer guests per vehicle. A private 4x4 for your own family adds ₹2,400 and for groups of five or more it usually costs less than booking two shared cars. The private desert camp with falconry and a plated four-course dinner is ₹9,900 and is a genuinely different evening rather than the same one with a better table.",
    ],
    benefits: [
      { title: "Jain & pure-veg confirmed in writing", detail: "Requested at booking, cooked to order, printed on your voucher." },
      { title: "Gentle safari with no dune bashing", detail: "A separate bookable product, not a favour to negotiate on the day." },
      { title: "Driver details the night before", detail: "Name, photo, number, window — plus a 10-minutes-away message." },
      { title: "Private vehicle for 5+", detail: "Usually cheaper than two shared cars and keeps everyone together." },
    ],
    activitySlugs: [
      "evening-desert-safari-veg-jain",
      "gentle-desert-safari-seniors",
      "premium-private-desert-camp",
      "morning-quad-bike-desert",
    ],
    comboSlugs: ["desert-and-dhow-family"],
    comparison: {
      heading: "Which desert safari should you book?",
      subhead: "The three that cover almost every family situation.",
      slugs: [
        "evening-desert-safari-veg-jain",
        "gentle-desert-safari-seniors",
        "premium-private-desert-camp",
      ],
      columns: ["price", "duration", "pickup", "dietary", "private", "cancellation"],
    },
    faqs: [
      {
        q: "Is Jain food really available without onion and garlic?",
        a: "At the camps we mark for it, yes — cooked to order rather than pulled from the buffet, requested at booking, and confirmed in writing on your voucher. Twenty-four hours' notice is the reliable minimum.",
      },
      {
        q: "Can elderly parents do a desert safari?",
        a: "Book the gentle safari. No dune bashing at any point, chairs with backs at the camp, and it reaches the same camp at the same time as the standard tour so a family can split across both.",
      },
      {
        q: "What time does it start and finish?",
        a: "Pickup between 14:30 and 15:30, back at your hotel by around 21:45 depending on your area. Total time is about six and a half hours.",
      },
      {
        q: "How many people share a vehicle?",
        a: "Six per 4x4 on the shared option, usually two families. The private vehicle upgrade is ₹2,400 and makes sense from about five people.",
      },
    ],
    internalLinks: [
      { label: "All desert safaris", href: "/categories/desert-safari" },
      { label: "Gentle safari for seniors", href: "/activities/gentle-desert-safari-seniors" },
      { label: "Jain & pure-veg Dubai", href: "/collections/jain-veg-friendly" },
      { label: "Desert + dhow family pack", href: "/combos/desert-and-dhow-family" },
    ],
    relatedCategories: ["desert-safari", "family-activities", "luxury-experiences"],
    whatsappPrompt: "Travelling with parents? Ask us which safari actually suits them.",
    meta: {
      title: "Desert Safari Dubai from ₹2,990 — Veg, Jain & Gentle Options",
      description:
        "Dubai desert safari with hotel pickup, BBQ dinner and shows from ₹2,990 all-in. Pure-veg and Jain camps, plus a gentle safari with no dune bashing for seniors.",
      keywords: [
        "desert safari dubai",
        "desert safari dubai price",
        "desert safari with jain food",
      ],
    },
  },
  {
    slug: "dubai-frame-tickets",
    topLevel: false,
    h1: "Dubai Frame Tickets",
    intentLabel: "Dubai Frame",
    heroKicker: "₹1,690 all-in, about an hour, glass floor included",
    heroSub: "Old Dubai on one side, the new skyline on the other, and the best-value view in the city.",
    heroImage: "frame-gold",
    body: [
      "The Dubai Frame is the most efficient hour in Dubai. A 150-metre gold picture frame standing in Zabeel Park, with the old city on one side and the modern skyline on the other, and a glass-floored walkway across the top that turns opaque as you step off it. It costs ₹1,690 all-in, takes about an hour, and is the single best-value attraction in the city.",
      "It works particularly well as a filler around something else. Unlike the Burj Khalifa or the Museum of the Future, it does not need a booked half-day; it slots neatly before dinner or after a morning city tour. The last slot before sunset is the one to take, when both skylines are lit and the contrast the building was designed to create actually works.",
      "For families it is unusually easy. Lift access throughout, strollers and wheelchairs are no trouble, and the glass floor is a genuine highlight for children while remaining entirely optional for adults who would rather walk along the solid edge. The ground-floor gallery covering Dubai's past, present and imagined future takes fifteen minutes and is better than it needs to be.",
      "Practically: entry is through Zabeel Park Gate 4, and park entry is included in your ticket. Al Jafiliya on the Red Line is the nearest metro at about ten minutes' walk. Taxis from Downtown take fifteen minutes. Tickets are instant confirmation and the QR voucher reaches WhatsApp in under a minute, so this is a comfortable same-day booking even in peak season.",
      "If you are combining it with the Burj Khalifa and the Museum of the Future, the Dubai Icons combo saves about ₹1,280 per adult and sequences all three timed slots so they do not overlap. Children aged 3 to 12 pay ₹990; under-3s are free.",
    ],
    benefits: [
      { title: "₹1,690 all-in", detail: "Including Zabeel Park entry. Children ₹990, under-3s free." },
      { title: "One hour, start to finish", detail: "Fits either side of dinner or a city tour." },
      { title: "Step-free and stroller-friendly", detail: "Lift access throughout, wheelchairs no problem." },
      { title: "Instant voucher", detail: "QR on WhatsApp in under a minute — fine for same-day booking." },
    ],
    activitySlugs: ["dubai-frame-tickets", "museum-of-the-future", "dubai-city-tour-half-day"],
    comboSlugs: ["dubai-icons-combo"],
    faqs: [
      {
        q: "How much are Dubai Frame tickets?",
        a: "₹1,690 all-in for adults and ₹990 for children aged 3–12, including Zabeel Park entry. Under-3s are free. Nothing is added at checkout.",
      },
      {
        q: "How long does a visit take?",
        a: "About an hour including the ground-floor gallery, which makes it one of the few Dubai attractions that does not need a dedicated half-day.",
      },
      {
        q: "Is the glass floor safe for children?",
        a: "Entirely, and it is usually their favourite part. It turns opaque as you step off it. Anyone who would rather not walk on it can use the solid edge.",
      },
    ],
    internalLinks: [
      { label: "Dubai Frame guide", href: "/attractions/dubai-frame" },
      { label: "Dubai attractions", href: "/categories/dubai-attractions" },
      { label: "Dubai Icons combo", href: "/combos/dubai-icons-combo" },
    ],
    relatedCategories: ["dubai-attractions", "family-activities", "dubai-city-tours"],
    whatsappPrompt: "Planning a full day around this? We'll sequence it for you.",
    meta: {
      title: "Dubai Frame Tickets — ₹1,690 All-In with Glass Floor",
      description:
        "Book Dubai Frame tickets in rupees at ₹1,690 all-in including Zabeel Park entry. Instant WhatsApp voucher, glass-floor sky deck, free cancellation to 24 hours.",
      keywords: ["dubai frame tickets", "dubai frame ticket price", "dubai frame booking"],
    },
  },
  {
    slug: "atlantis-aquaventure-tickets",
    topLevel: false,
    h1: "Atlantis Aquaventure Tickets",
    intentLabel: "Aquaventure",
    heroKicker: "₹7,290 all-in — and yes, lockers cost extra at the park",
    heroSub:
      "The largest waterpark in the region. Full-day ticket, towels included, and we tell you what isn't.",
    heroImage: "water-splash",
    body: [
      "Aquaventure at Atlantis The Palm is the largest waterpark in the Middle East and needs an entire day to be worth its ticket. Families who arrive at one in the afternoon consistently report managing about half of it, which is a waste of ₹7,290. Arrive at opening.",
      "The ticket is ₹7,290 all-in for adults, ₹6,190 for children aged 3–11, free for under-3s, and ₹5,490 for guests aged 60 and over — a senior rate that many sites simply do not apply, and that we show on the page rather than at the gate. Towels and lifejackets are included. Lockers are not: they are chargeable at the park at around AED 60, and we state that here because an unexpected charge at the entrance is precisely the kind of thing that sours a family day out.",
      "Swimming ability is not required for most of the park. Lifejackets are free and mandatory in several areas, lifeguards are numerous and attentive, and there are large shallow zones plus a dedicated Splashers area for young children. Height limits apply on the headline slides — around 120cm for most, including the Leap of Faith — so measure your eight-year-old before you build the day around it.",
      "The Lost Chambers Aquarium is a separate attraction at the same resort, and adding it to your Aquaventure ticket costs ₹1,900 against ₹3,190 bought alone. Beyond the saving, it is genuinely useful: 65,000 marine animals in an air-conditioned hall makes an excellent ninety-minute break in the middle of a hot waterpark day, particularly with younger children.",
      "Getting there: the Palm Monorail from Gateway Towers runs directly to the Aquaventure stop and gives you the Palm approach on the way. Taxis take about twenty-five minutes from Dubai Marina and forty from Deira. From May to September, water shoes are worth carrying — the walkways get genuinely hot underfoot.",
    ],
    benefits: [
      { title: "₹7,290 all-in, senior rate ₹5,490", detail: "Applied automatically at 60+. Under-3s free." },
      { title: "Towels included, lockers aren't", detail: "Around AED 60 at the park. Said here, not at the gate." },
      { title: "No swimming required", detail: "Free lifejackets, large shallow zones, lifeguards throughout." },
      { title: "Add the aquarium for ₹1,900", detail: "Saves ₹1,290, and gives you an air-conditioned break." },
    ],
    activitySlugs: ["atlantis-aquaventure", "lost-chambers-aquarium", "jet-ski-burj-al-arab"],
    comboSlugs: ["family-fun-pack"],
    faqs: [
      {
        q: "Is one day enough for Aquaventure?",
        a: "Yes if you arrive at opening. Families with younger children typically cover about two-thirds of the park in a full day.",
      },
      {
        q: "Are lockers included?",
        a: "No — towels are, lockers are not. Expect around AED 60 at the park.",
      },
      {
        q: "Do the children need to know how to swim?",
        a: "No. Lifejackets are free, lifeguards are everywhere and there are extensive shallow areas including a dedicated young children's zone.",
      },
    ],
    internalLinks: [
      { label: "Atlantis attraction guide", href: "/attractions/atlantis-aquaventure" },
      { label: "Water activities", href: "/categories/water-activities" },
      { label: "Family Fun Pack", href: "/combos/family-fun-pack" },
    ],
    relatedCategories: ["water-activities", "family-activities", "theme-parks"],
    whatsappPrompt: "Booking for a big family? Ask us about group rates.",
    meta: {
      title: "Atlantis Aquaventure Tickets — ₹7,290 All-In",
      description:
        "Aquaventure Waterpark tickets in rupees with towels included, senior rates at 60+, and honest information about what costs extra at the park.",
      keywords: ["atlantis aquaventure tickets", "aquaventure waterpark price", "atlantis dubai tickets"],
    },
  },
  {
    slug: "marina-cruise-dubai",
    topLevel: false,
    h1: "Dubai Marina Cruise with Dinner",
    intentLabel: "Marina cruise",
    heroKicker: "₹2,790 all-in for two hours and dinner",
    heroSub:
      "Skyline from the water, a proper vegetarian buffet, and calm enough for anyone prone to seasickness.",
    heroImage: "marina-dusk",
    body: [
      "Dubai looks better from the water than from any observation deck, and a Marina dhow cruise is the cheapest way to find that out. Two hours, dinner included, a live tanoura performance, and the towers of Dubai Marina lit up on both sides of a sheltered waterway that barely moves.",
      "The price is ₹2,790 all-in for adults and ₹1,990 for children aged 3–11, with under-3s free. That includes the cruise, the buffet and the show. Hotel pickup is not included and costs ₹900 for the group if you want it, which is usually cheaper than two taxis from Deira.",
      "The vegetarian question matters here and the answer is good: the veg section is a proper part of the buffet with around a dozen dishes spanning Indian, Arabic and continental, not two token items at the end of a meat spread. Jain meals are possible on the Marina cruise with twenty-four hours' notice — message us on WhatsApp and we will get it confirmed in writing before you pay rather than promising it and hoping.",
      "Marina or Creek is the usual question. Marina gives you the modern skyline, a newer boat and Bluewaters with the Ain Dubai wheel; Creek gives you old Dubai, the souks from the water and a more traditional wooden dhow, at ₹1,990. First-time visitors with families almost always prefer Marina. Travellers who have already done the modern city, or who want the heritage side, prefer Creek.",
      "Practical notes: boarding is from the Marina Walk jetty opposite Dubai Marina Mall from 20:00, and the boat leaves at 20:30 whether or not you have arrived. The upper deck is open-air and best for photographs; the lower deck is air-conditioned and easier with small children or grandparents. The water is sheltered throughout, which makes this the right choice if anyone in your group is prone to seasickness.",
    ],
    benefits: [
      { title: "₹2,790 all-in with dinner", detail: "Children ₹1,990, under-3s free. Add hotel pickup for ₹900." },
      { title: "Real vegetarian buffet", detail: "About a dozen dishes, not two. Jain with 24 hours' notice." },
      { title: "Very calm water", detail: "Sheltered marina route — good for anyone prone to seasickness." },
      { title: "Two decks", detail: "Open-air above for photos, air-conditioned below for children and elders." },
    ],
    activitySlugs: ["dhow-cruise-marina-dinner", "dhow-cruise-creek-heritage", "luxury-yacht-tour-90min"],
    comboSlugs: ["desert-and-dhow-family"],
    comparison: {
      heading: "Marina, Creek or yacht?",
      subhead: "Three very different evenings on the water.",
      slugs: ["dhow-cruise-marina-dinner", "dhow-cruise-creek-heritage", "luxury-yacht-tour-90min"],
      columns: ["price", "duration", "dietary", "private", "cancellation"],
    },
    faqs: [
      {
        q: "What time should we arrive?",
        a: "Boarding opens at 20:00 and the boat sails at 20:30. It does not wait for late arrivals, so aim for 19:50.",
      },
      {
        q: "Is there enough vegetarian food?",
        a: "Yes — a full section with around a dozen dishes. Jain meals need twenty-four hours' notice and we confirm them in writing before you pay.",
      },
      {
        q: "Marina or Creek?",
        a: "Marina for the modern skyline and a newer boat. Creek for old Dubai and a traditional dhow, at ₹800 less per adult.",
      },
    ],
    internalLinks: [
      { label: "Cruises & yachts", href: "/categories/cruises-yachts" },
      { label: "Luxury yacht tour", href: "/activities/luxury-yacht-tour-90min" },
      { label: "Desert + dhow family pack", href: "/combos/desert-and-dhow-family" },
    ],
    relatedCategories: ["cruises-yachts", "family-activities", "luxury-experiences"],
    whatsappPrompt: "Need a Jain meal on board? Ask us and we'll confirm it in writing.",
    meta: {
      title: "Dubai Marina Cruise with Dinner — ₹2,790 All-In",
      description:
        "Two-hour Dubai Marina dhow cruise with buffet dinner and a full vegetarian section from ₹2,790 all-in. Jain meals on request. Calm water, two decks.",
      keywords: ["marina cruise dubai", "dhow cruise dubai marina", "dubai dinner cruise price"],
    },
  },
  {
    slug: "dubai-activities-for-families",
    topLevel: false,
    h1: "Dubai Activities for Families",
    intentLabel: "For families",
    heroKicker: "Plans that work for a six-year-old and a sixty-eight-year-old",
    heroSub:
      "Child and senior pricing shown before checkout, dietary filters that mean something, and pickup you can rely on.",
    heroImage: "family-day",
    body: [
      "A family booking is not a bigger version of a solo booking. It is a different problem, with three constraints that most travel sites ignore entirely: everyone in the group has to be able to enjoy it, everyone has to be able to eat, and everyone has to get there together.",
      "Pricing comes first because it decides everything else. Almost every Dubai supplier prices children aged 3–11 at a reduced rate, infants free, and several apply a senior rate at 60. Those numbers are shown on our activity pages before you reach checkout, so a family of seven can work out a real total in a single look instead of discovering it three screens in. Global Village, to take one example, is free for anyone over 60 — we price them at zero rather than charging you and mentioning it afterwards.",
      "Food is second, and it is the one that ruins trips. 'Vegetarian available' is not enough information when you are travelling with someone who eats Jain. On OUTLY, pure-veg, Jain and halal are filters that narrow the results to suppliers who have confirmed it with their kitchen, the requirement is attached to the booking rather than mentioned to a driver, and it is printed on the voucher so it cannot be denied at the venue.",
      "Third, mobility. A desert safari with forty-five minutes of dune bashing is a poor idea for a seventy-four-year-old with a bad back, and no amount of asking the driver to slow down fixes it. The gentle safari exists as a separate bookable product for exactly this reason. More broadly, the 'senior-friendly' filter selects experiences with limited walking, seating throughout and gentle transfers — and families often split across two versions of the same evening, meeting at the same camp at the same time.",
      "Finally, booking everything at once. Families rarely buy one ticket; they buy an itinerary. Add each activity to your trip and the timeline view arranges them by day and warns you before checkout if two things clash on the same afternoon. If you would rather a person did it, send your dates and group composition on WhatsApp and we will come back with the whole plan, itemised in rupees, usually within the hour.",
    ],
    benefits: [
      { title: "Child, infant and senior rates up front", detail: "All three shown on the activity page, before checkout." },
      { title: "Dietary needs attached to the booking", detail: "Not a note in a form — confirmed and printed on your voucher." },
      { title: "Gentle alternatives that actually exist", detail: "Separate bookable variants, not a request to the driver." },
      { title: "Trip timeline with clash warnings", detail: "Because families book five things, not one." },
    ],
    activitySlugs: [
      "evening-desert-safari-veg-jain",
      "dhow-cruise-marina-dinner",
      "atlantis-aquaventure",
      "dubai-frame-tickets",
      "img-worlds-of-adventure",
      "aya-universe",
    ],
    comboSlugs: ["family-fun-pack", "desert-and-dhow-family"],
    faqs: [
      {
        q: "How many activities can we realistically do per day?",
        a: "One large one, or two small ones. Families who plan three routinely cancel the third — Dubai's distances are longer than a map suggests and afternoon heat is a real constraint from April to October.",
      },
      {
        q: "What suits grandparents?",
        a: "Filter for senior-friendly. The gentle desert safari, dhow cruises, the Dubai Frame, the Museum of the Future and AYA Universe all involve minimal walking with seating throughout.",
      },
      {
        q: "Can we book everything in one conversation?",
        a: "Yes, and about half our families do exactly that. Send dates, group composition and any dietary or mobility needs on WhatsApp; you'll get an itemised rupee itinerary back, usually inside the hour.",
      },
    ],
    internalLinks: [
      { label: "Dubai with kids", href: "/collections/dubai-with-kids" },
      { label: "Dubai with parents", href: "/collections/senior-friendly" },
      { label: "Family activities", href: "/categories/family-activities" },
      { label: "Family Fun Pack", href: "/combos/family-fun-pack" },
    ],
    relatedCategories: ["family-activities", "theme-parks", "desert-safari"],
    whatsappPrompt: "Group of five or more? Send us the ages and we'll plan the week.",
    meta: {
      title: "Dubai Activities for Families — Child & Senior Rates Shown Up Front",
      description:
        "Family-friendly Dubai experiences with child, infant and senior pricing before checkout, Jain and pure-veg filters, gentle alternatives and reliable hotel pickup.",
      keywords: ["dubai activities for families", "dubai with kids", "family tours dubai"],
    },
  },
  {
    slug: "dubai-activities-for-couples",
    topLevel: false,
    h1: "Dubai Activities for Couples",
    intentLabel: "For couples",
    heroKicker: "Private where it matters, timed for the right light",
    heroSub:
      "We say plainly whether an experience is private or shared, and we schedule the ones that depend on golden hour.",
    heroImage: "yacht-deck",
    body: [
      "Two things decide whether a couple's experience in Dubai is worth what it costs: whether it is genuinely private, and whether you are in the right place when the light is good. Both are routinely misrepresented.",
      "'Private' is the worst offender. It can mean a boat you have to yourselves, or it can mean a reserved table in a tent with two hundred other people and a PA system. On every OUTLY page, private versus shared is stated in the attributes strip near the top rather than buried in the inclusions, and where an experience is shared but genuinely small — the twenty-four-guest yacht, for instance — we tell you the guest cap rather than calling it exclusive.",
      "Timing is the second. A 'sunset cruise' that leaves the marina forty minutes after sunset is a common and irritating experience. Our sunset yacht departs at 17:30 specifically so you are off the Burj Al Arab at golden hour, and the desert camp's falconry demonstration is scheduled for the same reason. Where a slot exists purely because it photographs well, we say so.",
      "Occasion arrangements are handled by a person, not a form field. Cake, flowers, private décor, a photographer briefed on where to stand, a specific song at a specific moment, a proposal set up away from the main camp — all of it is arranged over WhatsApp with a coordinator, at no planning fee. It works because someone briefs the crew rather than because a note was attached to a booking record.",
      "The four that consistently work: the private desert camp with falconry and a plated dinner; the sunset yacht for the Burj Al Arab photograph; the twelve-minute helicopter flight, which is short, expensive and talked about for years afterwards; and the sunrise hot air balloon, which requires a 4:30am pickup and repays it completely. Level 148 at the Burj Khalifa is the indoor option when the weather refuses to cooperate.",
    ],
    benefits: [
      { title: "Private vs shared stated at the top", detail: "In the attributes strip, not buried in inclusions." },
      { title: "Timed for golden hour", detail: "Departures set so you're in the right place when the light is." },
      { title: "Occasions arranged by a person", detail: "Cake, décor, photographer, proposals. No planning fee." },
      { title: "Guest caps published", detail: "Where it's shared, we tell you how many. 24, not 200." },
    ],
    activitySlugs: [
      "premium-private-desert-camp",
      "luxury-yacht-tour-90min",
      "helicopter-tour-12min",
      "hot-air-balloon-sunrise",
      "burj-khalifa-148-sky",
      "la-perle-show",
    ],
    comboSlugs: ["honeymoon-signature"],
    faqs: [
      {
        q: "Can you arrange a proposal?",
        a: "Yes, regularly — most often on the private desert camp evening or the sunset yacht. Message the date on WhatsApp and a coordinator briefs the crew, the photographer and the timing. There is no planning fee.",
      },
      {
        q: "Is the yacht actually private?",
        a: "The 90-minute tour is shared with a maximum of 24 guests and we call it shared. A genuinely private charter is priced per boat per hour and quoted on request.",
      },
    ],
    internalLinks: [
      { label: "Honeymoon in Dubai", href: "/collections/dubai-honeymoon" },
      { label: "Luxury experiences", href: "/categories/luxury-experiences" },
      { label: "Honeymoon Signature package", href: "/combos/honeymoon-signature" },
    ],
    relatedCategories: ["luxury-experiences", "cruises-yachts", "desert-safari"],
    whatsappPrompt: "Planning a proposal or an anniversary? Tell us the date.",
    meta: {
      title: "Dubai Activities for Couples — Private Experiences & Honeymoon Ideas",
      description:
        "Couple's experiences in Dubai with private versus shared stated plainly, golden-hour timing and occasion arrangements handled by a coordinator on WhatsApp.",
      keywords: ["dubai activities for couples", "dubai honeymoon activities", "romantic things to do dubai"],
    },
  },
  {
    slug: "luxury-experiences-in-dubai",
    topLevel: false,
    h1: "Luxury Experiences in Dubai",
    intentLabel: "Luxury",
    heroKicker: "A named coordinator, not a contact form",
    heroSub:
      "Private charters, helicopters and desert camps, arranged by someone whose phone number you have.",
    heroImage: "luxury-night",
    body: [
      "At this level, the risk is not the price. It is a supplier who takes a large booking and then handles it casually — a boat that leaves late, a helicopter slot that quietly moves, a camp that seats you next to a party of thirty. Failure costs far more than money when the occasion cannot be repeated.",
      "Every experience in this category is operated by a partner we use repeatedly and monitor on a reliability score covering on-time performance, rejection rate and complaint history. Bookings above ₹1,00,000 and every private charter are assigned a named coordinator with a direct WhatsApp number and a phone number, reachable from the moment you enquire until you are back at your hotel. If your assistant is handling the booking, they deal with the same person throughout.",
      "Charters are quoted rather than listed, and this is deliberate. A yacht is priced per boat per hour, so an honest number depends on the vessel, the date, the duration, the guest count and the catering. Publishing an attractive figure and revising it once you enquire is precisely the behaviour that makes this market unpleasant. Send the details and you will have a firm all-in figure within two hours during working hours.",
      "Documentation is treated as part of the product. GST-compliant invoices with company billing details, itemised inclusions, and written confirmation of anything that has been agreed — dietary arrangements, timings, décor, a particular crew member. Full vegetarian and Jain catering is available on charters and at the private desert camp; it is quoted with the experience rather than added afterwards.",
      "The four experiences that account for most bookings here: the private yacht charter from Dubai Marina, the twelve or twenty-two minute helicopter flight over the Palm and the Burj Al Arab, the private desert camp with falconry and a plated four-course dinner, and the sunrise hot air balloon over the conservation reserve. For anything beyond these — a multi-day itinerary, a private island dinner, a large celebration — use the concierge form and a trip designer will call you.",
    ],
    benefits: [
      { title: "Named coordinator above ₹1,00,000", detail: "Direct WhatsApp and phone, from enquiry to drop-off." },
      { title: "Quoted honestly, within 2 hours", detail: "Charters are per boat per hour. We won't invent a per-person price." },
      { title: "GST invoice with company details", detail: "Invoice-grade documentation as standard." },
      { title: "Jain and pure-veg catering", detail: "Quoted with the experience, not added as an afterthought." },
    ],
    activitySlugs: [
      "private-yacht-charter-sunset",
      "helicopter-tour-12min",
      "premium-private-desert-camp",
      "hot-air-balloon-sunrise",
      "burj-khalifa-148-sky",
    ],
    comboSlugs: ["honeymoon-signature"],
    faqs: [
      {
        q: "Why is there no price on the yacht charter?",
        a: "Because a charter is priced per boat per hour and the honest number depends on the vessel, date, duration and catering. We send a firm all-in figure within two hours rather than publishing a low number that changes on enquiry.",
      },
      {
        q: "Can my assistant handle the booking?",
        a: "Yes. They deal with the same named coordinator throughout, and we issue a GST-compliant invoice with company billing details.",
      },
      {
        q: "How far ahead should I book?",
        a: "Charters and helicopters: a week is comfortable, more over New Year and during Eid. Short notice is often possible — message the coordinator and you will get a straight answer rather than an optimistic one.",
      },
    ],
    internalLinks: [
      { label: "Luxury Dubai collection", href: "/collections/luxury-dubai" },
      { label: "Concierge & private itineraries", href: "/concierge" },
      { label: "Private yacht charter", href: "/activities/private-yacht-charter-sunset" },
    ],
    relatedCategories: ["luxury-experiences", "cruises-yachts", "desert-safari"],
    whatsappPrompt: "Tell us the date and group size — quote within two hours.",
    meta: {
      title: "Luxury Experiences in Dubai — Private Charters & Concierge",
      description:
        "Private yacht charters, helicopter flights and exclusive desert camps in Dubai, each with a named coordinator, honest quotes within two hours and GST invoicing.",
      keywords: ["luxury experiences dubai", "private yacht charter dubai", "dubai concierge"],
    },
  },
];

export const landingBySlug = (slug: string) => landingPages.find((p) => p.slug === slug);
export const topLevelLandingPages = landingPages.filter((p) => p.topLevel);
export const templateLandingPages = landingPages.filter((p) => !p.topLevel);
