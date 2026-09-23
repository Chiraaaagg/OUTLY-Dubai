/**
 * Image manifest — real photography for every catalogue entity.
 *
 * Every activity, combo, category, collection, attraction hub and landing
 * page has an entry keyed `<kind>:<slug>`. Each entry carries:
 *
 *  - `photos`  — hand-curated Pexels photo ids, in display order. These are
 *                served straight from the Pexels image CDN (no API key needed)
 *                and are the relevance guarantee: a Burj Khalifa ticket shows
 *                the Burj Khalifa, a Museum of the Future ticket shows the
 *                Museum of the Future. Curated 19 Sep 2026 from pexels.com.
 *  - `queries` — Pexels search phrases, tried in order, used for any index
 *                the curated list does not cover once `PEXELS_API_KEY` is set.
 *                Results are cached server-side (see image.service.ts).
 *  - `fallback` — the illustrated scene key rendered only when neither a
 *                curated id nor a cached search result exists.
 *  - `manual`  — true where Pexels has no photography of the exact venue and
 *                the closest honest match is used (listed in the completion
 *                report as needing a supplier/own photo).
 *
 * Refs in the catalogue data look like `img:activity:burj-khalifa-124-125:0`
 * (kind, slug, index). Bare scene keys ("dune-sunset") remain valid and map
 * through `SCENE_PHOTOS`, so nothing that still carries a scene key — an old
 * cart in localStorage, a booking fixture — ever renders a placeholder.
 *
 * Pure module: no imports, safe in client and server bundles.
 */

export type ImageKind = "activity" | "combo" | "category" | "collection" | "attraction" | "landing" | "scene";

export interface ImageSpec {
  photos: number[];
  queries: string[];
  fallback: string;
  manual?: boolean;
}

export interface ImageRef {
  kind: ImageKind;
  slug: string;
  index: number;
}

const REF_PREFIX = "img:";

export function imageRef(kind: ImageKind, slug: string, index = 0): string {
  return `${REF_PREFIX}${kind}:${slug}:${index}`;
}

export function parseImageRef(src: string): ImageRef | null {
  if (!src.startsWith(REF_PREFIX)) return null;
  const [kind, slug, index] = src.slice(REF_PREFIX.length).split(":");
  if (!kind || !slug) return null;
  return { kind: kind as ImageKind, slug, index: Number.parseInt(index ?? "0", 10) || 0 };
}

/* ------------------------------------------------------------------ scenes */

/**
 * Scene-key safety net. Each illustrated scene maps to one photo of the
 * same subject so legacy keys still render photography.
 */
export const SCENE_PHOTOS: Record<string, ImageSpec> = {
  "skyline-gold": { photos: [18341554, 34025535], queries: ["dubai skyline sunset burj khalifa"], fallback: "skyline-gold" },
  "skyline-night": { photos: [13256066, 1381722], queries: ["dubai skyline night"], fallback: "skyline-night" },
  "dune-sunset": { photos: [2417260, 12565188], queries: ["desert safari dubai sunset"], fallback: "dune-sunset" },
  "dune-calm": { photos: [28718301, 16098267], queries: ["dubai desert dunes calm"], fallback: "dune-calm" },
  "camp-night": { photos: [11181888], queries: ["desert camp night dubai"], fallback: "camp-night" },
  "camp-luxe": { photos: [11181888, 29631286], queries: ["luxury desert camp dubai"], fallback: "camp-luxe" },
  "camel-caravan": { photos: [4857559, 7817185], queries: ["camel caravan dubai desert"], fallback: "camel-caravan" },
  "quad-dust": { photos: [20734774, 20734801], queries: ["quad bike dubai desert"], fallback: "quad-dust" },
  "balloon-dawn": { photos: [4857564, 13812188], queries: ["hot air balloon dubai desert dawn"], fallback: "balloon-dawn" },
  "marina-dusk": { photos: [29561720, 30554306], queries: ["dubai marina sunset"], fallback: "marina-dusk" },
  "dhow-lights": { photos: [12369779, 27522502], queries: ["dhow cruise dubai night"], fallback: "dhow-lights" },
  "yacht-deck": { photos: [17963445, 36070167], queries: ["yacht dubai marina"], fallback: "yacht-deck" },
  "jetski-spray": { photos: [10915941, 11669348], queries: ["jet ski dubai"], fallback: "jetski-spray" },
  "water-splash": { photos: [4957436, 4957462], queries: ["waterpark dubai"], fallback: "water-splash" },
  "aquarium-blue": { photos: [5733725, 7792241], queries: ["dubai aquarium"], fallback: "aquarium-blue" },
  "park-neon": { photos: [6924885, 18845381], queries: ["amusement park dubai"], fallback: "park-neon", manual: true },
  "aya-glow": { photos: [12389879, 5610117], queries: ["immersive light art exhibition dubai"], fallback: "aya-glow", manual: true },
  "stage-blue": { photos: [18899647, 18886433], queries: ["acrobat water show"], fallback: "stage-blue", manual: true },
  "night-market": { photos: [28515826, 36169813], queries: ["dubai souk market"], fallback: "night-market" },
  "garden-bloom": { photos: [36871362, 15131322], queries: ["dubai miracle garden"], fallback: "garden-bloom" },
  "frame-gold": { photos: [35138838, 18221322], queries: ["dubai frame"], fallback: "frame-gold" },
  "museum-torus": { photos: [18889488, 13693608], queries: ["museum of the future dubai"], fallback: "museum-torus" },
  "mosque-white": { photos: [32119558, 34029394], queries: ["sheikh zayed grand mosque"], fallback: "mosque-white" },
  "city-tour": { photos: [36151739, 31592802], queries: ["dubai city tour"], fallback: "city-tour" },
  "family-day": { photos: [39157971, 20734787], queries: ["family dubai vacation"], fallback: "family-day" },
  "luxury-night": { photos: [17865575, 460683], queries: ["burj al arab sunset"], fallback: "luxury-night" },
  "heli-sky": { photos: [33687806, 11603533], queries: ["helicopter dubai aerial"], fallback: "heli-sky" },
};

/* ---------------------------------------------------------------- entities */

const A = (photos: number[], queries: string[], fallback: string, manual = false): ImageSpec => ({ photos, queries, fallback, manual });

export const IMAGE_MANIFEST: Record<string, ImageSpec> = {
  /* Activities ------------------------------------------------------------ */
  "activity:burj-khalifa-124-125": A([19741511, 36909898, 12099895], ["burj khalifa", "burj khalifa view from top"], "skyline-gold"),
  "activity:burj-khalifa-148-sky": A([36909905, 36909907, 34025535], ["burj khalifa at the top", "burj khalifa"], "skyline-night"),
  "activity:dubai-frame-tickets": A([35138838, 18221322, 12404154], ["dubai frame"], "frame-gold"),
  "activity:museum-of-the-future": A([18889488, 13693608, 29555577], ["museum of the future dubai"], "museum-torus"),
  "activity:dubai-aquarium-underwater-zoo": A([5733725, 7792241, 29008996], ["dubai aquarium underwater zoo", "dubai aquarium"], "aquarium-blue"),
  "activity:global-village": A([37433432, 37433440, 37485056], ["global village dubai"], "park-neon"),
  "activity:miracle-garden": A([36871362, 15131322, 33663906], ["dubai miracle garden"], "garden-bloom"),
  "activity:evening-desert-safari-veg-jain": A([2417260, 11181888, 7817185], ["desert safari dubai", "dune bashing dubai"], "dune-sunset"),
  "activity:gentle-desert-safari-seniors": A([16098267, 28718301, 7817185], ["camel ride dubai desert sunset", "dubai desert dunes"], "dune-calm"),
  "activity:premium-private-desert-camp": A([11181888, 29631286, 28718316], ["luxury desert camp dubai night", "desert glamping dubai"], "camp-luxe"),
  "activity:morning-quad-bike-desert": A([20734774, 20734801, 20734773], ["quad bike desert dubai"], "quad-dust"),
  "activity:dhow-cruise-marina-dinner": A([12369779, 29561720, 19709725], ["dhow cruise dubai marina"], "marina-dusk"),
  "activity:dhow-cruise-creek-heritage": A([27522502, 16681182, 15573798], ["dubai creek dhow"], "dhow-lights"),
  "activity:luxury-yacht-tour-90min": A([17963445, 36070167, 28350360], ["yacht dubai marina"], "yacht-deck"),
  "activity:atlantis-aquaventure": A([4957436, 8319463, 4957462], ["atlantis aquaventure waterpark dubai", "waterpark dubai"], "water-splash"),
  "activity:lost-chambers-aquarium": A([35155692, 7792241, 1917831], ["atlantis aquarium dubai", "atlantis the palm dubai"], "aquarium-blue"),
  "activity:jet-ski-burj-al-arab": A([10915941, 11669348, 19790158], ["jet ski dubai burj al arab"], "jetski-spray"),
  "activity:img-worlds-of-adventure": A([6924885, 36287839, 10807092], ["img worlds of adventure dubai", "indoor theme park dubai"], "park-neon", true),
  "activity:motiongate-dubai": A([18845381, 36287839, 10807092], ["motiongate dubai", "dubai parks and resorts"], "park-neon", true),
  "activity:aya-universe": A([12389879, 5610117, 18283224], ["aya universe dubai", "immersive light exhibition dubai"], "aya-glow", true),
  "activity:dubai-city-tour-half-day": A([36151739, 18669679, 5075798], ["dubai city tour bus", "dubai sightseeing"], "city-tour"),
  "activity:old-dubai-souk-walking-tour": A([28515826, 36169813, 16412108], ["dubai spice souk", "dubai gold souk"], "night-market"),
  "activity:abu-dhabi-city-tour-grand-mosque": A([32119558, 34029394, 39583568], ["sheikh zayed grand mosque"], "mosque-white"),
  "activity:ferrari-world-abu-dhabi": A([36329344, 7058845, 13793244], ["ferrari world abu dhabi", "yas island abu dhabi"], "park-neon", true),
  "activity:la-perle-show": A([18899647, 18886433, 37071005], ["la perle dubai", "aqua theatre acrobat show"], "stage-blue", true),
  "activity:private-yacht-charter-sunset": A([36070167, 17963445, 19790158], ["private yacht dubai sunset", "yacht dubai marina"], "yacht-deck"),
  "activity:helicopter-tour-12min": A([33687806, 28720826, 11603533], ["helicopter dubai palm jumeirah", "aerial burj al arab"], "heli-sky"),
  "activity:hot-air-balloon-sunrise": A([4857564, 13812188, 14992647], ["hot air balloon dubai desert"], "balloon-dawn"),

  /* Combos ---------------------------------------------------------------- */
  "combo:dubai-icons-combo": A([36813102, 18889488, 35138838], ["dubai skyline sunset burj khalifa"], "skyline-gold"),
  "combo:desert-and-dhow-family": A([2417260, 12369779], ["desert safari dubai", "dhow cruise dubai marina"], "dune-sunset"),
  "combo:family-fun-pack": A([39034294, 4957436], ["family dubai vacation atlantis"], "water-splash"),
  "combo:honeymoon-signature": A([18555149, 1446512], ["couple dubai romantic"], "camp-luxe"),
  "combo:abu-dhabi-day-combo": A([34029394, 36329344], ["sheikh zayed grand mosque", "ferrari world abu dhabi"], "mosque-white"),
  "combo:theme-park-double": A([18845381, 6924885], ["dubai parks and resorts", "theme park dubai"], "park-neon", true),

  /* Categories ------------------------------------------------------------ */
  "category:dubai-attractions": A([19741511], ["dubai attractions burj khalifa"], "skyline-gold"),
  "category:desert-safari": A([12565188], ["desert safari dubai"], "dune-sunset"),
  "category:theme-parks": A([6924885], ["theme park dubai"], "park-neon", true),
  "category:cruises-yachts": A([36070167], ["yacht dubai marina"], "marina-dusk"),
  "category:water-activities": A([10915941], ["jet ski dubai", "waterpark dubai"], "water-splash"),
  "category:family-activities": A([39157971], ["family dubai vacation"], "family-day"),
  "category:luxury-experiences": A([17865575], ["burj al arab sunset", "luxury dubai"], "luxury-night"),
  "category:dubai-city-tours": A([36151739], ["dubai city tour"], "city-tour"),

  /* Collections ----------------------------------------------------------- */
  "collection:dubai-with-kids": A([20734787], ["family dubai kids"], "family-day"),
  "collection:dubai-honeymoon": A([1446512], ["couple dubai desert romantic"], "camp-luxe"),
  "collection:jain-veg-friendly": A([35008222], ["indian vegetarian thali"], "camp-night"),
  "collection:luxury-dubai": A([460683], ["burj al arab dusk"], "luxury-night"),
  "collection:first-time-dubai": A([34025535], ["dubai skyline burj khalifa sunrise"], "skyline-gold"),
  "collection:senior-friendly": A([7817185], ["camel ride dubai sunset"], "dune-calm"),
  "collection:adventure-dubai": A([20734774], ["quad bike dubai desert"], "quad-dust"),
  "collection:budget-dubai": A([31146786], ["dubai creek abra"], "night-market"),

  /* Attraction hubs (live in collections.ts) ------------------------------ */
  "attraction:burj-khalifa": A([19741511, 12099895], ["burj khalifa"], "skyline-gold"),
  "attraction:atlantis-aquaventure": A([8319463, 4957436], ["atlantis the palm dubai"], "water-splash"),
  "attraction:dubai-frame": A([35138838, 18221322], ["dubai frame"], "frame-gold"),
  "attraction:museum-of-the-future": A([18889488, 13693608], ["museum of the future dubai"], "museum-torus"),
  "attraction:ferrari-world": A([36329344, 7058845], ["ferrari world abu dhabi"], "park-neon", true),
  "attraction:img-worlds": A([6924885, 36287839], ["img worlds of adventure dubai"], "park-neon", true),

  /* Landing pages --------------------------------------------------------- */
  "landing:dubai-activities-for-indians": A([18341554], ["dubai skyline sunset"], "skyline-gold"),
  "landing:dubai-activities-with-upi": A([30554306], ["dubai marina night"], "marina-dusk"),
  "landing:last-minute-dubai-activities": A([13256066], ["dubai skyline night"], "skyline-night"),
  "landing:dubai-activities-with-hotel-pickup": A([14750462], ["dubai hotel taxi"], "city-tour"),
  "landing:dubai-attraction-combos": A([36813102], ["dubai skyline sunset"], "skyline-gold"),
  "landing:abu-dhabi-day-tours-from-dubai": A([32119558], ["sheikh zayed grand mosque"], "mosque-white"),
  "landing:burj-khalifa-tickets": A([19741511], ["burj khalifa"], "skyline-gold"),
  "landing:desert-safari-dubai": A([12565188], ["desert safari dubai"], "dune-sunset"),
  "landing:dubai-frame-tickets": A([35138838], ["dubai frame"], "frame-gold"),
  "landing:atlantis-aquaventure-tickets": A([4957436], ["atlantis aquaventure waterpark"], "water-splash"),
  "landing:marina-cruise-dubai": A([12369779], ["dhow cruise dubai marina"], "marina-dusk"),
  "landing:dubai-activities-for-families": A([39157971], ["family dubai vacation"], "family-day"),
  "landing:dubai-activities-for-couples": A([18555149], ["couple dubai romantic"], "camp-luxe"),
  "landing:luxury-experiences-in-dubai": A([17865575], ["burj al arab sunset"], "luxury-night"),
};

/** Resolve a ref (or bare scene key) to its spec. */
export function imageSpecFor(src: string): { spec: ImageSpec; ref: ImageRef } | null {
  const ref = parseImageRef(src);
  if (ref) {
    if (ref.kind === "scene") {
      const spec = SCENE_PHOTOS[ref.slug];
      return spec ? { spec, ref } : null;
    }
    const spec = IMAGE_MANIFEST[`${ref.kind}:${ref.slug}`];
    return spec ? { spec, ref } : null;
  }
  const spec = SCENE_PHOTOS[src];
  return spec ? { spec, ref: { kind: "scene", slug: src, index: 0 } } : null;
}

/** Entries that use a closest-match photo because Pexels has none of the exact venue. */
export function manualMappingEntries(): string[] {
  return Object.entries(IMAGE_MANIFEST)
    .filter(([, s]) => s.manual)
    .map(([k]) => k);
}

/* --------------------------------------------------------------- CDN urls */

/** Card/hero frame ratio (matches the illustrated 400×260 scene viewBox). */
export const FRAME_RATIO = 0.65;
export const SRCSET_WIDTHS = [480, 800, 1200, 1600] as const;

/** A few Pexels originals are PNG; the CDN path must match the original extension. */
export const PNG_PHOTOS: ReadonlySet<number> = new Set<number>([]);

/** Pexels image CDN URL — no API key required; `fit=crop` keeps every frame the same ratio. */
export function pexelsCdnUrl(photoId: number, width: number, ext: "jpeg" | "png" = PNG_PHOTOS.has(photoId) ? "png" : "jpeg"): string {
  const h = Math.round(width * FRAME_RATIO);
  return `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.${ext}?auto=compress&cs=tinysrgb&fit=crop&w=${width}&h=${h}`;
}
