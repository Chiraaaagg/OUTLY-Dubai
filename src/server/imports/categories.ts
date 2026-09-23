import { slugify } from "./parsers";

/**
 * Category resolution for imports. Supplier exports use their own taxonomy
 * ("desert-safari-tours", "dhow-cruise", "Water Parks"); the storefront has
 * eight functional categories. A row's category is resolved, in order:
 *
 *   1. exact slug of a live category
 *   2. exact match on a live category's name / short name (slugified)
 *   3. a curated alias table of common supplier category names
 *   4. keyword rules on the category text, then on the activity title
 *
 * Anything resolved by 2–4 is reported as a warning so the preview shows
 * the mapping; anything unresolved stays an error listing the valid slugs.
 */

export interface KnownCategory {
  slug: string;
  name: string;
  shortName: string;
}

const ALIASES: Record<string, string> = {
  // attractions
  "burj-khalifa-tickets": "dubai-attractions",
  "burj-khalifa": "dubai-attractions",
  "burj-al-arab-tours": "dubai-attractions",
  "atlantis-hotel-tours": "dubai-attractions",
  "culture-and-attractions": "dubai-attractions",
  attractions: "dubai-attractions",
  "attraction-tickets": "dubai-attractions",
  tickets: "dubai-attractions",
  museums: "dubai-attractions",
  "museums-and-galleries": "dubai-attractions",
  "observation-decks": "dubai-attractions",
  "aquarium": "dubai-attractions",
  // desert
  "desert-safari-tours": "desert-safari",
  "desert-safaris": "desert-safari",
  "desert": "desert-safari",
  "camel-and-horse-riding": "desert-safari",
  "camel-riding": "desert-safari",
  "quad-biking": "desert-safari",
  "dune-buggy": "desert-safari",
  // theme parks
  "theme-park": "theme-parks",
  "theme-parks-tickets": "theme-parks",
  "water-parks": "theme-parks",
  "water-park": "theme-parks",
  "amusement-parks": "theme-parks",
  "fun-and-games": "theme-parks",
  "indoor-activities": "theme-parks",
  // cruises
  "dhow-cruise": "cruises-yachts",
  "dhow-cruises": "cruises-yachts",
  "cruise-and-boat-tours": "cruises-yachts",
  cruises: "cruises-yachts",
  "boat-tours": "cruises-yachts",
  "yacht-charter": "cruises-yachts",
  "yacht-tours": "cruises-yachts",
  yachts: "cruises-yachts",
  // water
  "water-sports": "water-activities",
  "watersports": "water-activities",
  "diving": "water-activities",
  "scuba-diving": "water-activities",
  "jet-ski": "water-activities",
  "kayaking": "water-activities",
  // family
  "family": "family-activities",
  "family-fun": "family-activities",
  "kids-activities": "family-activities",
  "nature-and-wildlife": "family-activities",
  "zoos-and-aquariums": "family-activities",
  "gardens": "family-activities",
  // luxury
  "helicopter-tours": "luxury-experiences",
  "helicopter": "luxury-experiences",
  "hot-air-balloon": "luxury-experiences",
  "limousine-tours": "luxury-experiences",
  "premium-tours": "luxury-experiences",
  "luxury": "luxury-experiences",
  "luxury-tours": "luxury-experiences",
  "skydiving": "luxury-experiences",
  "private-tours": "luxury-experiences",
  "fine-dining": "luxury-experiences",
  // city tours
  "city-tours": "dubai-city-tours",
  "city-tour": "dubai-city-tours",
  "sightseeing-tours": "dubai-city-tours",
  "sightseeing": "dubai-city-tours",
  "hop-on-hop-off-bus-dubai": "dubai-city-tours",
  "hop-on-hop-off": "dubai-city-tours",
  "bus-tours": "dubai-city-tours",
  "day-trips": "dubai-city-tours",
  "abu-dhabi-tours": "dubai-city-tours",
  "walking-tours": "dubai-city-tours",
  "food-tours": "dubai-city-tours",
  "airport-transfers": "dubai-city-tours",
  transfers: "dubai-city-tours",
};

const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/desert|dune|safari|camel|quad|buggy|sandboard/, "desert-safari"],
  [/dhow|cruise|yacht|boat|marina sail|catamaran/, "cruises-yachts"],
  [/water ?park|theme ?park|aquaventure|motiongate|img world|legoland|ferrari world|warner|amusement|arcade|trampoline/, "theme-parks"],
  [/scuba|dive|diving|snorkel|jet ?ski|kayak|paddle|flyboard|parasail|surf|swim|water ?sport/, "water-activities"],
  [/helicopter|balloon|skydiv|limousine|limo|private jet|seaplane|luxury|vip|butler/, "luxury-experiences"],
  [/burj|frame|museum|aquarium|garden|global village|view|observation|ticket|zoo|attraction/, "dubai-attractions"],
  [/city tour|sightseeing|hop[- ]on|bus tour|abu dhabi|day trip|walking|heritage|old dubai|transfer|airport/, "dubai-city-tours"],
  [/kids?|child|family|zoo|farm|wildlife|play/, "family-activities"],
];

export interface CategoryResolution {
  slug: string | null;
  how: "exact" | "name" | "alias" | "keyword" | "title" | "none";
}

export function resolveCategory(rawCategory: string, title: string, known: KnownCategory[]): CategoryResolution {
  const slug = slugify(rawCategory);
  if (!slug) return { slug: null, how: "none" };
  const bySlug = new Set(known.map((k) => k.slug));
  if (bySlug.has(slug)) return { slug, how: "exact" };
  const byName = known.find((k) => slugify(k.name) === slug || slugify(k.shortName) === slug);
  if (byName) return { slug: byName.slug, how: "name" };
  const alias = ALIASES[slug];
  if (alias && bySlug.has(alias)) return { slug: alias, how: "alias" };
  const text = rawCategory.toLowerCase();
  for (const [re, target] of CATEGORY_KEYWORDS) if (re.test(text) && bySlug.has(target)) return { slug: target, how: "keyword" };
  const t = title.toLowerCase();
  for (const [re, target] of CATEGORY_KEYWORDS) if (re.test(t) && bySlug.has(target)) return { slug: target, how: "title" };
  return { slug: null, how: "none" };
}
