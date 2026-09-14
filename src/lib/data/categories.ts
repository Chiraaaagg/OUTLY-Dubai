import type { Category } from "../types";

/**
 * Eight functional categories. Slugs are SEO-owned and permanent (PRD §4.2) —
 * renaming one requires a 301 and product sign-off.
 */
export const categories: Category[] = [
  {
    slug: "dubai-attractions",
    name: "Dubai Attractions & Tickets",
    shortName: "Attractions",
    emoji: "🏙️",
    tagline: "The icons, skip the queue",
    intro:
      "Every Dubai first-timer's list starts here: Burj Khalifa, the Dubai Frame, the Museum of the Future, the Dubai Aquarium. We publish the all-in rupee price for each of them, including the taxes and booking fees that other sites add at the last screen. Tickets arrive on WhatsApp as a scannable mobile voucher, usually inside a minute, so you can book from the taxi on the way over. Where a timed slot matters — and at Burj Khalifa it matters a great deal — we tell you which slot is genuinely worth the extra money instead of quietly upselling you to the priciest one.",
    heroImage: "skyline-gold",
    featuredSlugs: [
      "burj-khalifa-124-125",
      "museum-of-the-future",
      "dubai-frame-tickets",
      "dubai-aquarium-underwater-zoo",
    ],
    relatedSlugs: ["dubai-city-tours", "theme-parks", "family-activities"],
    faqs: [
      {
        q: "Which Burj Khalifa floor should I book?",
        a: "Levels 124 and 125 are enough for most visitors and are the best value. Level 148 (the Sky lounge) buys you a smaller crowd, a lounge, refreshments and a separate lift — worth it on a busy evening or a special occasion, not otherwise. Sunset slots cost more everywhere and sell out 5–7 days ahead in winter.",
      },
      {
        q: "Are these tickets the same as buying at the gate?",
        a: "Yes — same entry, same access. The difference is the price and the queue. Gate prices at Burj Khalifa and Aquaventure are higher during peak hours, and prime slots are frequently sold out on the day.",
      },
      {
        q: "How fast do I get my ticket?",
        a: "Every attraction ticket on this page is instant confirmation. Your mobile voucher lands on WhatsApp and email within about a minute of payment, and it stays available offline in your account.",
      },
      {
        q: "Can I cancel if my plans change?",
        a: "Most attraction tickets are free to cancel up to 24 hours before your slot; a few dated tickets are non-refundable. The exact rule for each ticket is shown on its own page before you pay — never in a PDF afterwards.",
      },
    ],
  },
  {
    slug: "desert-safari",
    name: "Dubai Desert Safaris",
    shortName: "Desert safari",
    emoji: "🐪",
    tagline: "Dunes, dinner and the bit everyone photographs",
    intro:
      "The desert safari is the single most-booked experience by Indian families in Dubai — and the one most likely to go wrong. The complaints are always the same: a pickup that never arrived, dune bashing that terrified an elderly parent, and a 'vegetarian' buffet that turned out to be paneer and nothing else. So we filter for what actually decides it. Pure-veg and Jain camps (no onion, no garlic) are a filter, not a footnote. Gentle safaris that skip dune bashing entirely are their own variant, clearly labelled, for travellers with parents, back trouble or motion sickness. Pickup zones are published per SKU so you know before you pay whether your hotel is covered.",
    heroImage: "dune-sunset",
    featuredSlugs: [
      "evening-desert-safari-veg-jain",
      "gentle-desert-safari-seniors",
      "premium-private-desert-camp",
      "morning-quad-bike-desert",
    ],
    relatedSlugs: ["family-activities", "luxury-experiences", "dubai-city-tours"],
    faqs: [
      {
        q: "Is pure vegetarian and Jain food genuinely available?",
        a: "On the camps we mark 'Jain available', yes — cooked without onion and garlic and served separately from the main buffet. It must be requested at booking, not on the day, because the camp cooks it to order. We confirm it in writing on your voucher, and our review form asks every guest whether the dietary requirement was actually met.",
      },
      {
        q: "My parents can't handle dune bashing. What do we do?",
        a: "Book a gentle safari. It runs the same camp, the same dinner and the same shows, and replaces the dune drive with a scenic desert route. It is a separate variant on each safari page — you don't have to negotiate it with the driver on the day.",
      },
      {
        q: "How does hotel pickup work?",
        a: "You give us your hotel or building name at checkout. Pickup windows run roughly 14:30–15:30 for evening safaris; the driver's name and number reach you on WhatsApp the evening before. Deira, Bur Dubai, Downtown, Marina, JBR and Business Bay are included on most safaris; Palm Jumeirah and Al Barsha South sometimes carry a small supplement, which we show before you pay.",
      },
      {
        q: "What should we wear and carry?",
        a: "Comfortable clothes and closed shoes; a light jacket between November and February, as desert evenings drop to about 15°C. Carry a small bag only — camps have limited storage. If anyone in your group is pregnant or has back or heart trouble, choose the gentle safari.",
      },
    ],
  },
  {
    slug: "theme-parks",
    name: "Dubai Theme Parks",
    shortName: "Theme parks",
    emoji: "🎢",
    tagline: "One long day, many very happy children",
    intro:
      "IMG Worlds, Motiongate, Global Village, AYA Universe — Dubai's parks are mostly indoors or air-conditioned, which is exactly why they work as a summer plan when the temperature makes anything outdoors unpleasant. The maths matters here: a family of four visiting two parks usually saves ₹4,000–₹7,000 on a combo rather than separate tickets, and transfers can cost more than the ticket if you leave them to a taxi meter. We show the combo saving next to the single-park price so the comparison is honest, and we mark which parks realistically need a full day and which fit into a half.",
    heroImage: "park-neon",
    featuredSlugs: [
      "img-worlds-of-adventure",
      "motiongate-dubai",
      "global-village",
      "aya-universe",
    ],
    relatedSlugs: ["family-activities", "water-activities", "dubai-attractions"],
    faqs: [
      {
        q: "Which park suits younger children?",
        a: "Motiongate's Smurfs and Dreamworks zones suit ages 4–10 best. IMG Worlds is stronger for 10+ because most of its headline rides carry a height limit around 130cm. AYA Universe is fully indoor, gentle, walkable in around 90 minutes and works for all ages including grandparents.",
      },
      {
        q: "Is a combo ticket actually cheaper?",
        a: "For two or more parks, yes — and we show the separate-purchase total next to the bundle price so you can check the saving yourself. For a single park it isn't, and we won't pretend otherwise.",
      },
      {
        q: "Is there vegetarian food inside the parks?",
        a: "Yes. All the major Dubai parks have vegetarian counters, and several have Indian food courts. Jain food is not reliably available inside parks — if that matters, eat before you go.",
      },
    ],
  },
  {
    slug: "cruises-yachts",
    name: "Dubai Cruises & Yachts",
    shortName: "Cruises & yachts",
    emoji: "🛥️",
    tagline: "The skyline, from the water, at golden hour",
    intro:
      "Dubai looks better from the water than from any observation deck, and this is where the price difference between 'shared' and 'private' is largest — and most often hidden. We label it plainly. A dhow dinner cruise in Marina is a relaxed shared evening with a buffet and a show for a couple of thousand rupees a head. A yacht is a different product: fewer people, open deck, and a photo set your friends will ask about. Private charters are priced per boat per hour, not per person, so we quote them that way rather than fabricating a per-person figure that only works if you fill every seat.",
    heroImage: "marina-dusk",
    featuredSlugs: [
      "dhow-cruise-marina-dinner",
      "luxury-yacht-tour-90min",
      "private-yacht-charter-sunset",
      "dhow-cruise-creek-heritage",
    ],
    relatedSlugs: ["luxury-experiences", "water-activities", "dubai-attractions"],
    faqs: [
      {
        q: "What's the real difference between a dhow cruise and a yacht?",
        a: "A dhow is a shared wooden vessel with a buffet dinner, live entertainment and usually 100–200 guests. A yacht is smaller and quieter, has open deck space and a sound system, and costs three to eight times more per person. Choose the dhow for a family dinner; choose the yacht for a couple's evening or a photo you actually want.",
      },
      {
        q: "Is pure vegetarian food available on the cruise?",
        a: "Every dhow cruise we sell serves a vegetarian buffet section as standard. Jain meals need 24 hours' notice and are available on the Marina cruise only — ask us on WhatsApp and we'll get it confirmed in writing before you pay.",
      },
      {
        q: "Do I get seasick?",
        a: "Marina and Creek cruises stay in sheltered water and are very calm. Open-sea yacht routes past the Burj Al Arab can be choppier between December and February; take a tablet an hour before if you're prone to it.",
      },
    ],
  },
  {
    slug: "water-activities",
    name: "Dubai Water Activities",
    shortName: "Water",
    emoji: "🌊",
    tagline: "Waterparks, jet skis and the Arabian Gulf",
    intro:
      "Aquaventure at Atlantis is the biggest waterpark in the region and needs a full day; jet skis off Marina buy you the Burj Al Arab photograph in half an hour. Between May and September the water is warm enough to be a relief rather than a shock, which makes this the one category that works better in summer than in winter. We flag height limits, swimming ability requirements and what's covered by the price — lockers and towels are the two charges that most often appear at the gate elsewhere, so we state them up front.",
    heroImage: "water-splash",
    featuredSlugs: [
      "atlantis-aquaventure",
      "jet-ski-burj-al-arab",
      "lost-chambers-aquarium",
      "dubai-aquarium-underwater-zoo",
    ],
    relatedSlugs: ["family-activities", "theme-parks", "cruises-yachts"],
    faqs: [
      {
        q: "Do we need to know swimming?",
        a: "Not for Aquaventure's main areas — lifejackets are free and lifeguards are everywhere. Jet skis don't require swimming either; a lifejacket is mandatory and included. Only the deep-water snorkelling add-ons expect confident swimmers.",
      },
      {
        q: "Are lockers and towels included?",
        a: "At Aquaventure, towels are included and lockers are chargeable at the park. We say so here because being surprised at the gate for AED 60 is exactly the kind of thing that ruins a day out.",
      },
    ],
  },
  {
    slug: "family-activities",
    name: "Dubai Family Activities",
    shortName: "Family",
    emoji: "👨‍👩‍👧‍👦",
    tagline: "Works for a six-year-old and a sixty-eight-year-old",
    intro:
      "Booking for a family is a different problem from booking for yourself. You need one plan that a child, a parent and a grandparent can all enjoy, food that everyone can eat, and a pickup that doesn't require herding seven people into two taxis. Everything in this category has been checked against those three questions. Child and senior pricing is shown before checkout, not discovered at it. Where an experience genuinely doesn't suit an older traveller, we say so on the page rather than letting you find out at a dune.",
    heroImage: "family-day",
    featuredSlugs: [
      "evening-desert-safari-veg-jain",
      "dhow-cruise-marina-dinner",
      "atlantis-aquaventure",
      "dubai-frame-tickets",
    ],
    relatedSlugs: ["theme-parks", "dubai-attractions", "desert-safari"],
    faqs: [
      {
        q: "How is child pricing decided?",
        a: "Almost every Dubai supplier prices children 3–11 at a reduced rate and infants under 3 free. We show all three rates on the activity page before you reach checkout, so a family of seven can work out the real total in one look.",
      },
      {
        q: "Which activities suit grandparents?",
        a: "Filter for 'Senior-friendly'. It selects experiences with little walking, seating available throughout, and no rough transfers — the gentle desert safari, dhow cruises, the Dubai Frame, the Museum of the Future and city tours all qualify.",
      },
      {
        q: "Can we book everything in one go?",
        a: "Yes, and most families do. Add each activity to your trip and the timeline view will warn you if two of them clash on the same afternoon. If you'd rather have a person do it, send us the dates on WhatsApp and we'll build the whole itinerary and price it in one message.",
      },
    ],
  },
  {
    slug: "luxury-experiences",
    name: "Luxury Experiences in Dubai",
    shortName: "Luxury",
    emoji: "✨",
    tagline: "Private, arranged properly, no queues",
    intro:
      "At this end of the market the question is never price — it is whether the thing will be handled properly. A private yacht with a crew that knows the route. A helicopter slot that actually departs on time. A desert camp where you are the only party. Every experience here is operated by a supplier we have used repeatedly, and each booking is assigned a named coordinator who is reachable on WhatsApp and on the phone from the moment you pay until the moment you land back at your hotel. Charters and bespoke itineraries are quoted rather than listed, because an honest number depends on your date, your group and your route.",
    heroImage: "luxury-night",
    featuredSlugs: [
      "private-yacht-charter-sunset",
      "helicopter-tour-12min",
      "hot-air-balloon-sunrise",
      "premium-private-desert-camp",
    ],
    relatedSlugs: ["cruises-yachts", "desert-safari", "dubai-city-tours"],
    faqs: [
      {
        q: "Why do some experiences show 'Request a quote' instead of a price?",
        a: "Because a real charter price depends on the date, the duration, the number of guests and the route. We would rather send you an accurate figure within two hours than publish a low number that changes once you enquire.",
      },
      {
        q: "Do I get a single point of contact?",
        a: "Yes. Every booking above ₹1,00,000 and every private charter is assigned a named coordinator with a direct WhatsApp and phone number, from confirmation through to the end of your trip.",
      },
      {
        q: "Can you handle a proposal or an anniversary?",
        a: "Regularly. Cake, flowers, private decoration, a photographer, a specific song at a specific moment — all of it can be arranged. Message us on WhatsApp with the date and we'll plan it around your booking.",
      },
    ],
  },
  {
    slug: "dubai-city-tours",
    name: "Dubai City Tours & Day Trips",
    shortName: "City tours",
    emoji: "🚌",
    tagline: "Get your bearings on day one",
    intro:
      "A guided half-day is the most useful thing a first-time visitor can do on their first morning: you see the old Creek, the souks, Jumeirah and Downtown in one loop, and you leave knowing which parts of the city you want to go back to. From Dubai, Abu Dhabi is an easy day trip — the Sheikh Zayed Grand Mosque and Ferrari World in a single run — provided you leave early and dress appropriately. Our tours run in English and Hindi, and the Hindi-speaking guide is a filter on the page rather than a request you have to make and hope for.",
    heroImage: "city-tour",
    featuredSlugs: [
      "dubai-city-tour-half-day",
      "abu-dhabi-city-tour-grand-mosque",
      "old-dubai-souk-walking-tour",
      "dubai-frame-tickets",
    ],
    relatedSlugs: ["dubai-attractions", "family-activities", "desert-safari"],
    faqs: [
      {
        q: "Is a Hindi-speaking guide available?",
        a: "On the half-day Dubai city tour and the Abu Dhabi day trip, yes — select it when you book. It is a scheduled guide, not an on-the-day request, so it needs to be chosen at least 24 hours ahead.",
      },
      {
        q: "What's the dress code for the Sheikh Zayed Grand Mosque?",
        a: "Ankles, wrists and shoulders covered for everyone; women also need to cover their hair. Nothing tight or sheer. Abayas are lent free at the mosque entrance but queues can be long — carrying your own scarf is faster.",
      },
      {
        q: "How long is the Abu Dhabi day trip?",
        a: "About 11 hours door to door, with roughly three hours in the car in total. It is a long day for very young children; the Dubai city tour at four hours is the gentler option.",
      },
    ],
  },
];

export const categoryBySlug = (slug: string) => categories.find((c) => c.slug === slug);
