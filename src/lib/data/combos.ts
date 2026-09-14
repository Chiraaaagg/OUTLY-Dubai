import type { AddOn, Combo } from "../types";

/**
 * Tier C combos — the take-rate lever (PRD §1, §5.1 merchandising rule).
 * `separatePrice` is the honest sum of the same SKUs bought individually on
 * this site, so the saving shown is verifiable rather than invented.
 */

const UPGRADE: Record<string, AddOn> = {
  privateVehicle: {
    id: "up-private",
    name: "Private vehicle throughout",
    description: "Your group alone in the car on every transfer in this package.",
    price: { inr: 5400, aed: 233 },
    perPerson: false,
    category: "transfer",
  },
  photographer: {
    id: "up-photographer",
    name: "Photographer for one experience",
    description: "Two hours with a photographer; 40+ edited images within 48 hours.",
    price: { inr: 8900, aed: 385 },
    perPerson: false,
    category: "photo",
  },
  jainAll: {
    id: "up-jain-all",
    name: "Jain meals across the package",
    description: "Every included meal cooked without onion or garlic. No charge.",
    price: { inr: 0, aed: 0 },
    perPerson: true,
    category: "meal",
  },
  airportTransfer: {
    id: "up-airport",
    name: "Airport pickup & drop",
    description: "Meet-and-greet at DXB arrivals, and a return drop for your flight.",
    price: { inr: 4200, aed: 181 },
    perPerson: false,
    category: "transfer",
  },
};

export const combos: Combo[] = [
  {
    slug: "dubai-icons-combo",
    name: "Dubai Icons: Burj Khalifa + Frame + Museum of the Future",
    tagline: "The three that everyone photographs, in one booking",
    heroImage: "skyline-gold",
    tier: "C",
    audience: "everyone",
    includedSlugs: ["burj-khalifa-124-125", "dubai-frame-tickets", "museum-of-the-future"],
    bundlePrice: { inr: 7990, aed: 345 },
    separatePrice: { inr: 9270, aed: 399 },
    durationLabel: "Use across 3 days",
    validity: "Valid for 30 days from your first activity date",
    confirmation: "instant",
    fulfilmentMode: "inquiry",
    highlights: [
      "One booking, three timed slots — we sequence them so nothing clashes",
      "Saves ₹1,280 against booking the same three separately",
      "All three are lift-access and suit grandparents",
      "Each ticket has its own QR — use them on different days if you prefer",
    ],
    upgrades: [UPGRADE.privateVehicle, UPGRADE.airportTransfer],
    cancellationPolicy:
      "Free cancellation of the whole package up to 24 hours before your first activity. Individual tickets can't be cancelled separately once the package is confirmed.",
    faqs: [
      {
        q: "Do we have to use all three on the same day?",
        a: "No, and we would advise against it — the Museum of the Future alone deserves two and a half hours. Each ticket carries its own timed slot and the package is valid for 30 days.",
      },
      {
        q: "Can we swap one out?",
        a: "Not in self-serve, because the bundle price depends on the three. Message us on WhatsApp and we'll price an alternative combination — it usually still beats booking separately.",
      },
    ],
  },
  {
    slug: "desert-and-dhow-family",
    name: "Desert Safari + Marina Dhow Cruise — Family Pack",
    tagline: "Two evenings sorted, with veg and Jain food on both",
    heroImage: "dune-sunset",
    tier: "C",
    audience: "family",
    includedSlugs: ["evening-desert-safari-veg-jain", "dhow-cruise-marina-dinner"],
    bundlePrice: { inr: 4990, aed: 215 },
    separatePrice: { inr: 5780, aed: 249 },
    durationLabel: "Two evenings",
    validity: "Both activities within 14 days of each other",
    confirmation: "instant",
    fulfilmentMode: "inquiry",
    highlights: [
      "Hotel pickup included on the safari; add it to the cruise for ₹900",
      "Pure-veg counter on both; Jain thali at no extra cost on both",
      "Saves ₹790 per adult against separate booking",
      "Swap the standard safari for the gentle one at no charge if you're travelling with parents",
    ],
    upgrades: [UPGRADE.jainAll, UPGRADE.privateVehicle, UPGRADE.photographer],
    cancellationPolicy:
      "Free cancellation up to 24 hours before the first of the two activities. After that the safari becomes non-refundable; the cruise stays refundable until 24 hours before sailing.",
    faqs: [
      {
        q: "Can we do both on the same day?",
        a: "No — the safari returns around 21:45 and the cruise boards at 20:00. Book them on consecutive evenings; the package allows any two dates within 14 days.",
      },
      {
        q: "Can we switch to the gentle safari?",
        a: "Yes, at no extra cost, and you should if anyone in the group is over 65 or has back trouble. Choose it at checkout or tell us on WhatsApp.",
      },
    ],
  },
  {
    slug: "family-fun-pack",
    name: "Family Fun Pack: Aquaventure + Lost Chambers + IMG Worlds",
    tagline: "Three days of children being too tired to argue",
    heroImage: "water-splash",
    tier: "C",
    audience: "family",
    includedSlugs: ["atlantis-aquaventure", "lost-chambers-aquarium", "img-worlds-of-adventure"],
    bundlePrice: { inr: 13900, aed: 600 },
    separatePrice: { inr: 16170, aed: 698 },
    durationLabel: "Three full days",
    validity: "Valid for 30 days from your first activity date",
    confirmation: "instant",
    fulfilmentMode: "inquiry",
    highlights: [
      "Saves ₹2,270 per adult against separate booking",
      "IMG is fully indoors — the reliable plan for a 45°C afternoon",
      "Under-3s free at all three",
      "Senior rate applied automatically at Aquaventure and IMG",
    ],
    upgrades: [UPGRADE.privateVehicle, UPGRADE.airportTransfer],
    cancellationPolicy:
      "Free cancellation up to 48 hours before your first activity. Inside 48 hours the package is non-refundable.",
    faqs: [
      {
        q: "Can we do Aquaventure and Lost Chambers on one day?",
        a: "Yes, and most families do — the aquarium is a good air-conditioned break in the middle of a waterpark day. IMG needs its own day.",
      },
    ],
  },
  {
    slug: "honeymoon-signature",
    name: "Honeymoon Signature: Private Desert Camp + Sunset Yacht + Helicopter",
    tagline: "Three days, three photographs you will actually print",
    heroImage: "camp-luxe",
    tier: "D",
    audience: "couple",
    includedSlugs: [
      "premium-private-desert-camp",
      "luxury-yacht-tour-90min",
      "helicopter-tour-12min",
    ],
    bundlePrice: { inr: 31900, aed: 1378 },
    separatePrice: { inr: 33790, aed: 1459 },
    durationLabel: "Three experiences across your stay",
    validity: "All three within 10 days",
    confirmation: "manual",
    fulfilmentMode: "inquiry",
    highlights: [
      "A named coordinator handles all three bookings and your timings",
      "Private majlis at the desert camp — nobody else at your table",
      "Cake and décor included on the experience of your choice",
      "Jain and pure-veg menus available on the desert dinner at no extra cost",
    ],
    upgrades: [UPGRADE.photographer, UPGRADE.privateVehicle, UPGRADE.airportTransfer],
    cancellationPolicy:
      "Free cancellation up to 72 hours before the first experience. Inside 72 hours, 50% is retained. The helicopter leg is refunded in full if the operator cancels for weather.",
    faqs: [
      {
        q: "Can you arrange a proposal inside this?",
        a: "Yes — most often on the private desert camp evening or the sunset yacht. Tell your coordinator the plan on WhatsApp and they'll brief the crew, the photographer and the timing. There is no planning fee.",
      },
      {
        q: "What if the helicopter is cancelled for weather?",
        a: "You choose: rebook it on another day of your trip, or take a full refund of that leg while keeping the rest of the package. We contact you within two hours of the operator's call.",
      },
    ],
  },
  {
    slug: "abu-dhabi-day-combo",
    name: "Abu Dhabi in a Day: Grand Mosque Tour + Ferrari World",
    tagline: "Two Abu Dhabi headliners without booking two separate trips",
    heroImage: "mosque-white",
    tier: "C",
    audience: "family",
    includedSlugs: ["abu-dhabi-city-tour-grand-mosque", "ferrari-world-abu-dhabi"],
    bundlePrice: { inr: 9990, aed: 431 },
    separatePrice: { inr: 11480, aed: 495 },
    durationLabel: "Two days, or one very long one",
    validity: "Both within 14 days",
    confirmation: "instant",
    fulfilmentMode: "inquiry",
    highlights: [
      "Saves ₹1,490 per adult",
      "We sequence the mosque for the morning and Ferrari World for the following day",
      "Hindi-speaking guide available on the mosque tour",
      "Senior rate applied automatically at Ferrari World",
    ],
    upgrades: [UPGRADE.privateVehicle],
    cancellationPolicy:
      "Free cancellation up to 48 hours before the first activity. Inside 48 hours the tour is non-refundable; the Ferrari World ticket stays refundable until 24 hours before entry.",
    faqs: [
      {
        q: "Can we do both in one day?",
        a: "Technically yes, but it makes for a 14-hour day with children and you will rush the mosque. We schedule them across two days by default; message us if you genuinely need it in one and we'll build the timing.",
      },
    ],
  },
  {
    slug: "theme-park-double",
    name: "Theme Park Double: IMG Worlds + Motiongate",
    tagline: "Two parks, two days, one much smaller bill",
    heroImage: "park-neon",
    tier: "C",
    audience: "family",
    includedSlugs: ["img-worlds-of-adventure", "motiongate-dubai"],
    bundlePrice: { inr: 9490, aed: 409 },
    separatePrice: { inr: 10980, aed: 474 },
    durationLabel: "Two full days",
    validity: "Valid for 30 days from your first park visit",
    confirmation: "instant",
    fulfilmentMode: "inquiry",
    highlights: [
      "Saves ₹1,490 per adult",
      "IMG indoors, Motiongate mostly outdoors — pair them by weather",
      "Motiongate's Smurfs zone is the strongest Dubai option for ages 4–10",
      "Under-3s free at both",
    ],
    upgrades: [UPGRADE.privateVehicle],
    cancellationPolicy:
      "Free cancellation up to 48 hours before your first park visit. Inside 48 hours the package is non-refundable.",
    faqs: [
      {
        q: "Which park should we do first?",
        a: "Motiongate first if the weather is kind, IMG second — it is fully indoors and makes a better backup if the first day is unpleasantly hot.",
      },
    ],
  },
];

export const comboBySlug = (slug: string) => combos.find((c) => c.slug === slug);
