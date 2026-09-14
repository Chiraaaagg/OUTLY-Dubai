import type { Attraction, Collection } from "../types";

/**
 * Editorial collections (PRD §5.4 type B) — hand-curated, narrative, image-led.
 * Fewer SKUs, more context. These serve Personas B and C, where credibility and
 * framing convert better than a filtered grid.
 */
export const collections: Collection[] = [
  {
    slug: "dubai-with-kids",
    name: "Dubai with Kids",
    audience: "Families with children aged 3–14",
    tagline: "Plans that survive a six-year-old and a grandparent on the same day",
    tone: "warm",
    heroImage: "family-day",
    narrative:
      "The hard part of Dubai with children isn't finding things to do — it's finding things that work for everyone in the group at once. A theme park that thrills a twelve-year-old will bore a four-year-old and exhaust a grandparent. So this list is ordered by how well each experience holds a mixed group: short indoor attractions first, then the half-day outings, then the full-day parks that need a rested family and an early start. Every one has child pricing shown before checkout, and the ones with a vegetarian food problem have been left out entirely.",
    activitySlugs: [
      "dubai-frame-tickets",
      "aya-universe",
      "dubai-aquarium-underwater-zoo",
      "dhow-cruise-marina-dinner",
      "evening-desert-safari-veg-jain",
      "atlantis-aquaventure",
      "img-worlds-of-adventure",
      "global-village",
    ],
    faqs: [
      {
        q: "What's a realistic number of activities per day with young children?",
        a: "One big thing, or two small ones. Families who plan three end up cancelling the third. Dubai's distances are longer than they look on a map and afternoon heat is a real constraint from April to October.",
      },
      {
        q: "Which of these need a full day?",
        a: "Aquaventure, IMG Worlds and Motiongate. Everything else on this list fits comfortably into a half day.",
      },
    ],
  },
  {
    slug: "dubai-honeymoon",
    name: "Honeymoon in Dubai",
    audience: "Couples, newly-weds and anniversary trips",
    tagline: "Private where it matters, and photographed properly",
    tone: "premium",
    heroImage: "camp-luxe",
    narrative:
      "Two things decide whether a honeymoon experience is worth its price in Dubai: whether it is genuinely private, and whether the light is right when you arrive. Both are easy to get wrong. A 'private' desert camp can mean a reserved table in a shared tent; a 'sunset' cruise can leave the marina forty minutes after the sun has gone. Everything in this collection states which it is, plainly, and the timings are set so you're in the right place at golden hour. Occasion add-ons — cake, décor, a photographer, a proposal setup — are arranged by a coordinator on WhatsApp rather than left as a note in a booking form.",
    activitySlugs: [
      "premium-private-desert-camp",
      "luxury-yacht-tour-90min",
      "helicopter-tour-12min",
      "hot-air-balloon-sunrise",
      "burj-khalifa-148-sky",
      "la-perle-show",
    ],
    faqs: [
      {
        q: "Can you arrange a surprise proposal?",
        a: "Yes, and we do it often. The private desert camp and the sunset yacht are the two that work best. Message us with the date and we brief the crew, the photographer and the timing — no planning fee.",
      },
      {
        q: "Is 'private' actually private?",
        a: "Where we say private, you have the vehicle, the boat or the majlis to yourselves. Where an experience is shared but small — the 24-guest yacht, for instance — we call it shared and tell you the guest cap.",
      },
    ],
  },
  {
    slug: "jain-veg-friendly",
    name: "Jain & Pure Veg Friendly Dubai",
    audience: "Travellers with strict vegetarian or Jain dietary needs",
    tagline: "Checked with the kitchen, confirmed on your voucher",
    tone: "warm",
    heroImage: "camp-night",
    narrative:
      "'Vegetarian available' means very little on its own. It can mean a separate live-cooking counter with a dozen dishes, or it can mean paneer curry at the end of a meat buffet. And Jain food — cooked without onion and garlic — is not something a camp can produce because you asked the driver on the way there. Everything in this collection has been checked directly with the kitchen. Where we say Jain is available, it is cooked to order, it must be requested at booking, and the confirmation is printed on your voucher so nobody at the venue can claim they weren't told.",
    activitySlugs: [
      "evening-desert-safari-veg-jain",
      "gentle-desert-safari-seniors",
      "dhow-cruise-marina-dinner",
      "old-dubai-souk-walking-tour",
      "premium-private-desert-camp",
      "global-village",
    ],
    faqs: [
      {
        q: "What happens if the Jain meal isn't provided?",
        a: "Message the emergency number on your voucher immediately. We contact the supplier there and then, and if the meal genuinely wasn't provided as confirmed we refund the meal portion of the booking. The failure is also logged against that supplier's reliability score, which affects whether we keep selling them.",
      },
      {
        q: "Is Jain food available at short notice?",
        a: "Usually not on the same day — the kitchen cooks it to order. Twenty-four hours is the reliable minimum. If you're booking for tomorrow, message us on WhatsApp and we'll tell you honestly whether the camp can do it rather than take the booking and hope.",
      },
    ],
  },
  {
    slug: "luxury-dubai",
    name: "Luxury Dubai",
    audience: "Premium travellers and private groups",
    tagline: "Arranged by a named person who answers the phone",
    tone: "premium",
    heroImage: "luxury-night",
    narrative:
      "At this end of the market the risk is not overpaying — it is a supplier who takes the booking and then handles it casually. Every experience here is operated by a partner we use repeatedly and monitor on a reliability score. Bookings above ₹1,00,000 and all private charters are assigned a named coordinator with a direct WhatsApp number and a phone number, from the moment you enquire until you are back at your hotel. Charters are quoted rather than listed, because the honest number depends on your date, your group and your route.",
    activitySlugs: [
      "private-yacht-charter-sunset",
      "helicopter-tour-12min",
      "premium-private-desert-camp",
      "hot-air-balloon-sunrise",
      "burj-khalifa-148-sky",
      "luxury-yacht-tour-90min",
    ],
    faqs: [
      {
        q: "Can an assistant book on my behalf?",
        a: "Yes. Give us the traveller names and we handle the rest with the assistant directly, including a GST-compliant invoice with company billing details.",
      },
    ],
  },
  {
    slug: "first-time-dubai",
    name: "First Time in Dubai",
    audience: "First-time visitors with three to five days",
    tagline: "The eight things worth doing before you plan anything clever",
    tone: "playful",
    heroImage: "skyline-gold",
    narrative:
      "If this is your first trip, resist the urge to build an elaborate itinerary. Dubai rewards a simple one: get your bearings with a city tour on day one, do the desert on day two, spend an evening on the water, and use the rest for whatever caught your eye while you were here. This collection is that plan, in order. Book the Burj Khalifa and the Museum of the Future early — both are timed-entry and both sell out several days ahead through the winter.",
    activitySlugs: [
      "dubai-city-tour-half-day",
      "burj-khalifa-124-125",
      "evening-desert-safari-veg-jain",
      "dhow-cruise-marina-dinner",
      "museum-of-the-future",
      "dubai-frame-tickets",
      "old-dubai-souk-walking-tour",
      "abu-dhabi-city-tour-grand-mosque",
    ],
    faqs: [
      {
        q: "How many days do we need?",
        a: "Four full days covers this list comfortably. Three works if you skip Abu Dhabi. Five lets you add a theme park or a beach day without rushing.",
      },
      {
        q: "What should we book before we fly?",
        a: "The Burj Khalifa, the Museum of the Future and the desert safari. All three are capacity-limited and the good slots go first, especially between November and March.",
      },
    ],
  },
  {
    slug: "senior-friendly",
    name: "Dubai with Parents",
    audience: "Groups travelling with parents and grandparents",
    tagline: "Little walking, seats throughout, nothing that jolts",
    tone: "warm",
    heroImage: "dune-calm",
    narrative:
      "Travelling with parents changes what a good day looks like. Distance between activities matters more than the activities themselves; so does whether there is somewhere to sit, whether the transfer is gentle, and whether the food is something they will actually eat. This collection selects for exactly that. Nothing here involves dune bashing, long queues without seating, or more than two kilometres of walking.",
    activitySlugs: [
      "gentle-desert-safari-seniors",
      "dhow-cruise-marina-dinner",
      "dubai-frame-tickets",
      "museum-of-the-future",
      "aya-universe",
      "dubai-city-tour-half-day",
    ],
    faqs: [
      {
        q: "Are wheelchairs manageable?",
        a: "At the Dubai Frame, the Museum of the Future, AYA Universe and on the city tour, yes — all step-free. The gentle desert safari can take a wheelchair user with 48 hours' notice; message us and we get the camp's ramp access confirmed in writing before you pay.",
      },
    ],
  },
  {
    slug: "adventure-dubai",
    name: "Adventure in Dubai",
    audience: "Younger travellers and thrill-seekers",
    tagline: "The fast, loud and slightly terrifying end of the catalogue",
    tone: "playful",
    heroImage: "quad-dust",
    narrative:
      "Dubai does adrenaline unusually well, largely because it has the space and the money to do it safely. Quad bikes on real dunes, jet skis on open water, the fastest rollercoaster on the planet, and a balloon that lifts off before sunrise. Age and height limits are stated on every page here, because being turned away at the gate after a 90-minute drive is a bad morning.",
    activitySlugs: [
      "morning-quad-bike-desert",
      "jet-ski-burj-al-arab",
      "ferrari-world-abu-dhabi",
      "hot-air-balloon-sunrise",
      "helicopter-tour-12min",
    ],
    faqs: [
      {
        q: "What are the age limits?",
        a: "Quad bikes and jet skis: 16+ to drive, younger children can ride as passengers. Formula Rossa at Ferrari World: 130cm minimum. Hot air balloon: 5+ and able to stand for an hour.",
      },
    ],
  },
  {
    slug: "budget-dubai",
    name: "Dubai Under ₹3,000",
    audience: "Budget-conscious travellers and large groups",
    tagline: "Good days out that don't need a big budget",
    tone: "playful",
    heroImage: "night-market",
    narrative:
      "Dubai has a reputation for being expensive, which is true of hotels and largely untrue of things to do. Global Village costs less than a cinema ticket in Mumbai. The Creek dhow cruise feeds you for under two thousand rupees. This is the list for a family watching the total, or for a group of seven where every rupee is multiplied by seven.",
    activitySlugs: [
      "global-village",
      "dubai-frame-tickets",
      "miracle-garden",
      "dhow-cruise-creek-heritage",
      "old-dubai-souk-walking-tour",
      "lost-chambers-aquarium",
    ],
    faqs: [
      {
        q: "Do group discounts exist?",
        a: "On most suppliers, from about eight people. It isn't automatic in self-serve — send us the group size on WhatsApp and we'll come back with a group price, usually within the hour.",
      },
    ],
  },
];

export const collectionBySlug = (slug: string) => collections.find((c) => c.slug === slug);

/**
 * Attraction hubs (PRD §5.4) — the Tier A SEO magnet. They rank, then route
 * traffic to the Tier B/C SKUs that carry the margin (AC-CAT-03).
 */
export const attractions: Attraction[] = [
  {
    slug: "burj-khalifa",
    name: "Burj Khalifa",
    blurb:
      "At 828 metres it is still the tallest building in the world, and the observation decks on levels 124, 125 and 148 are the reason most first-time visitors come to Downtown Dubai at all. Which ticket you need depends almost entirely on what time you go.",
    heroImage: "skyline-gold",
    practical: [
      { label: "Location", value: "Downtown Dubai, entrance inside The Dubai Mall (Lower Ground)" },
      { label: "Opening hours", value: "09:00 – 23:00 daily, last entry 22:15" },
      { label: "Time needed", value: "90 minutes including security and the queue" },
      { label: "Nearest metro", value: "Burj Khalifa / Dubai Mall (Red Line), then a 10-minute walk" },
      { label: "Accessibility", value: "Step-free and wheelchair accessible throughout, including level 124's terrace" },
    ],
    bestTime:
      "The 17:30–19:00 sunset window is the most beautiful and the most expensive, and it sells out five to seven days ahead between November and March. Late evening slots after 21:00 are half-empty and considerably cheaper for a near-identical night view.",
    gettingThere:
      "The Red Line metro drops you at Dubai Mall station, from which a covered link bridge takes about ten minutes on foot. Taxis from Deira take 20–30 minutes and from Marina 25–40, longer on Friday evenings. Parking at the mall is free but chaotic after 6pm.",
    activitySlugs: ["burj-khalifa-124-125", "burj-khalifa-148-sky", "dubai-aquarium-underwater-zoo"],
    faqs: [
      {
        q: "How much are Burj Khalifa tickets from India?",
        a: "Level 124/125 non-prime entry is ₹3,690 all-in on OUTLY, including taxes and booking fees. Sunset slots add about ₹1,800. Level 148 with SKY access is ₹9,450. Those are the amounts you pay — nothing is added at checkout.",
      },
      {
        q: "Is level 148 worth it?",
        a: "For a special occasion or a busy weekend evening, yes: a separate lift, a lounge, refreshments and far fewer people. For a standard visit, levels 124/125 give you the view that's in every photograph for a third of the price.",
      },
      {
        q: "Can I buy tickets on the day?",
        a: "Sometimes, at a higher gate price, and rarely for sunset slots in winter. Booking two to five days ahead is both cheaper and safer.",
      },
    ],
  },
  {
    slug: "atlantis-aquaventure",
    name: "Atlantis Aquaventure & The Lost Chambers",
    blurb:
      "The largest waterpark in the Middle East sits at the tip of the Palm, with a 65,000-animal aquarium attached to it. Together they are a comfortable two-day plan, or one very full day if your family is the energetic sort.",
    heroImage: "water-splash",
    practical: [
      { label: "Location", value: "Atlantis The Palm, Palm Jumeirah" },
      { label: "Opening hours", value: "10:00 – 18:00 (waterpark), 10:00 – 22:00 (aquarium)" },
      { label: "Time needed", value: "A full day for the waterpark; 90 minutes for the aquarium" },
      { label: "Getting there", value: "Palm Monorail to Atlantis Aquaventure station, or a 25-minute taxi from Marina" },
      { label: "Height limits", value: "Most headline slides need 120cm; Leap of Faith needs 120cm and confidence" },
    ],
    bestTime:
      "Arrive at opening. The queues on the headline slides double after 12:30, and the walkways get genuinely hot underfoot between May and September — water shoes help more than you'd think.",
    gettingThere:
      "The Palm Monorail from Gateway Towers is the pleasant way in and gives you the Palm view on the approach. Taxis take 25 minutes from Dubai Marina and 40 from Deira. Aquaventure has its own paid parking.",
    activitySlugs: ["atlantis-aquaventure", "lost-chambers-aquarium", "jet-ski-burj-al-arab"],
    faqs: [
      {
        q: "Are lockers included?",
        a: "No — towels are included, lockers are chargeable at the park (around AED 60). We say so here rather than letting you discover it at the gate.",
      },
      {
        q: "Is the combo ticket worth it?",
        a: "Yes if you want both. Adding The Lost Chambers to an Aquaventure ticket costs ₹1,900 against ₹3,190 separately, and the aquarium doubles as an air-conditioned break in the middle of the day.",
      },
    ],
  },
  {
    slug: "dubai-frame",
    name: "Dubai Frame",
    blurb:
      "A 150-metre gold picture frame in Zabeel Park, with old Dubai on one side and the new skyline on the other, and a glass floor between them. Short, cheap, and unexpectedly one of the most memorable hours in the city.",
    heroImage: "frame-gold",
    practical: [
      { label: "Location", value: "Zabeel Park, Gate 4" },
      { label: "Opening hours", value: "09:00 – 21:00 daily" },
      { label: "Time needed", value: "About one hour" },
      { label: "Nearest metro", value: "Al Jafiliya (Red Line), then a 10-minute walk" },
      { label: "Accessibility", value: "Lift access throughout; strollers and wheelchairs fine" },
    ],
    bestTime:
      "The last slot before sunset, when both skylines are lit and the glass floor photographs well. Mornings are the quietest.",
    gettingThere:
      "Al Jafiliya metro on the Red Line, then a ten-minute walk through Zabeel Park. Taxis from Downtown take about 15 minutes.",
    activitySlugs: ["dubai-frame-tickets", "dubai-city-tour-half-day", "museum-of-the-future"],
    faqs: [
      {
        q: "Is the glass floor frightening?",
        a: "It goes opaque as you step off it, which most people find more disorienting than the view down. Children love it. Anyone who would rather not can simply walk along the solid edge.",
      },
    ],
  },
  {
    slug: "museum-of-the-future",
    name: "Museum of the Future",
    blurb:
      "The silver torus on Sheikh Zayed Road is the most photographed new building in Dubai, and unusually for an Instagram landmark, the inside is better than the outside. Five floors of immersive exhibits, and a children's floor that genuinely holds attention.",
    heroImage: "museum-torus",
    practical: [
      { label: "Location", value: "Sheikh Zayed Road, Trade Centre area" },
      { label: "Opening hours", value: "10:00 – 18:00, last entry 16:30" },
      { label: "Time needed", value: "Two to two and a half hours" },
      { label: "Nearest metro", value: "Emirates Towers (Red Line), connected by footbridge" },
      { label: "Accessibility", value: "Fully step-free with lifts to every floor" },
    ],
    bestTime:
      "Weekday mornings. Slots sell out three to four days ahead year-round and considerably further in peak season, so book before you fly.",
    gettingThere:
      "Emirates Towers metro station connects directly by footbridge — the easiest arrival of any Dubai attraction. Taxi from Downtown is under ten minutes.",
    activitySlugs: ["museum-of-the-future", "burj-khalifa-124-125", "aya-universe"],
    faqs: [
      {
        q: "How far ahead should I book?",
        a: "Three to four days minimum, more in December and January. This is the attraction most likely to be sold out on the day you want.",
      },
    ],
  },
  {
    slug: "ferrari-world",
    name: "Ferrari World Abu Dhabi",
    blurb:
      "Home to Formula Rossa, the fastest rollercoaster in the world at 240km/h, and a mostly indoor park that makes a good pairing with an Abu Dhabi day trip from Dubai.",
    heroImage: "park-neon",
    practical: [
      { label: "Location", value: "Yas Island, Abu Dhabi" },
      { label: "Opening hours", value: "11:00 – 20:00, varies by season" },
      { label: "Time needed", value: "A full day" },
      { label: "From Dubai", value: "About 90 minutes by road" },
      { label: "Height limits", value: "Formula Rossa 130cm; several family rides from 100cm" },
    ],
    bestTime:
      "Weekdays. Yas Island fills up on Friday and Saturday, and Formula Rossa's queue can pass 60 minutes.",
    gettingThere:
      "Ninety minutes from central Dubai by road. There is no practical public transport option — book transfers or pair it with a guided Abu Dhabi day trip.",
    activitySlugs: ["ferrari-world-abu-dhabi", "abu-dhabi-city-tour-grand-mosque"],
    faqs: [
      {
        q: "Can we combine it with the Grand Mosque in one day?",
        a: "It makes for a 14-hour day and you will rush the mosque. Our Abu Dhabi combo schedules them across two days by default for exactly that reason.",
      },
    ],
  },
  {
    slug: "img-worlds",
    name: "IMG Worlds of Adventure",
    blurb:
      "The largest indoor theme park on earth, with Marvel and Cartoon Network zones under one very large air-conditioned roof. The most dependable plan in Dubai on a punishing summer afternoon.",
    heroImage: "park-neon",
    practical: [
      { label: "Location", value: "City of Arabia, Sheikh Mohammed Bin Zayed Road" },
      { label: "Opening hours", value: "11:00 – 21:00, later on weekends" },
      { label: "Time needed", value: "Six to seven hours" },
      { label: "Getting there", value: "30 minutes by taxi from Downtown; no metro link" },
      { label: "Height limits", value: "130cm for most Marvel and Lost Valley rides" },
    ],
    bestTime:
      "Weekday afternoons, and any day when the outdoor temperature makes an outdoor park unthinkable.",
    gettingThere:
      "No metro. Taxi from Downtown takes about 30 minutes; there is free parking if you're driving.",
    activitySlugs: ["img-worlds-of-adventure", "motiongate-dubai", "global-village"],
    faqs: [
      {
        q: "Is it suitable for young children?",
        a: "Partly. The Cartoon Network zone works well for 4–9, but most headline rides need 130cm, so an under-eight will be limited to about a third of the park. Motiongate is the better choice for that age.",
      },
    ],
  },
];

export const attractionBySlug = (slug: string) => attractions.find((a) => a.slug === slug);
