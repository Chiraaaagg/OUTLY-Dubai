/**
 * OUTLYY domain model.
 *
 * One `Activity` type normalises all three supply sources described in PRD §11
 * (direct contracted, Rayna API, official trade portals). The storefront never
 * knows where a SKU came from — `supplier.source` exists for ops/analytics only.
 */

export type Tier = "A" | "B" | "C" | "D" | "E";

export type SupplySource = "direct" | "rayna" | "portal";

export type ConfirmationType = "instant" | "manual";

/**
 * Per-product fulfilment mode — the single most important field in the
 * Inquiry Mode pivot (docs/backend/17-inquiry-mode-pivot.md §6.4).
 *
 *   inquiry → CTA "Check availability & price", no availability call, cart
 *             terminates in POST /inquiries. The default, and permanent for
 *             most Tier B/C/D supply.
 *   instant → CTA "Book now", live availability, self-serve checkout. Flipped
 *             per SKU when a supplier API (Rathin) passes validation.
 *
 * Never a site-wide flag: a mixed catalogue must render coherently.
 */
export type FulfilmentMode = "inquiry" | "instant";

export type Dietary = "veg" | "jain" | "halal" | "non-veg";

export type Suitability =
  | "kids"
  | "seniors"
  | "wheelchair"
  | "infant"
  | "couples"
  | "groups";

export type Currency = "INR" | "AED";

export type PaxType = "adult" | "child" | "infant" | "senior";

export type ActivityStatus =
  | "available"
  | "limited"
  | "sold_out"
  | "unavailable"
  | "quote_only";

export interface Money {
  /** All-in price. PRD price-honesty principle: nothing is added after this. */
  inr: number;
  aed: number;
}

export interface PriceBand {
  adult: Money;
  child?: Money;
  infant?: Money;
  senior?: Money;
  /** Genuinely verifiable comparison price (gate/walk-up). Optional by design. */
  compareAt?: Money;
}

export interface Variant {
  id: string;
  name: string;
  blurb: string;
  /** Delta against the base adult price, in INR/AED. May be negative. */
  delta: Money;
  highlights: string[];
  isPrivate: boolean;
  soldOut?: boolean;
  recommended?: boolean;
  /** e.g. "Gentle safari — no dune bashing" for Persona A's senior parents. */
  accessibilityNote?: string;
}

export interface AddOn {
  id: string;
  name: string;
  description: string;
  price: Money;
  perPerson: boolean;
  /** Upsell surfaces this in checkout; cross-sells live in `relatedSlugs`. */
  category: "transfer" | "meal" | "photo" | "occasion" | "access" | "comfort";
}

export interface ItineraryStop {
  time: string;
  title: string;
  detail: string;
  durationMin?: number;
}

export interface Faq {
  q: string;
  a: string;
}

/**
 * A Google review of **Holiday Planner**, the sister company in the same
 * group. Deliberately has no `activitySlug`, no `id` and no `verified` flag:
 * it can never be attached to an OUTLYY listing, counted into a rating, or
 * presented as a review of something OUTLYY sold. See `data/sister-reviews.ts`.
 */
export interface SisterReview {
  /** First name + surname initial. Full names are stripped by the generator. */
  author: string;
  /** Which Holiday Planner office the review was left for. */
  branch: string;
  rating: number;
  /** Approximate "YYYY-MM" — Google only exposes a relative date. */
  month: string;
  body: string;
}

export interface Supplier {
  id: string;
  name: string;
  source: SupplySource;
  /** 0–100 reliability score (PRD §9.6). Drives ranking, never shown publicly. */
  reliability: number;
  verifiedSince: string;
}

export interface Activity {
  id: string;
  slug: string;
  title: string;
  /** Short benefit-led line used on cards and in search snippets. */
  subtitle: string;
  tier: Tier;
  categorySlug: string;
  secondaryCategorySlugs: string[];
  attractionSlug?: string;
  collectionSlugs: string[];

  images: string[];
  imageAlt: string;
  video?: string;

  rating: number;
  reviewCount: number;
  bookedThisMonth: number;

  durationMinutes: number;
  isPrivate: boolean;
  pickupIncluded: boolean;
  pickupZones: string[];
  confirmation: ConfirmationType;
  fulfilmentMode: FulfilmentMode;
  /** Hours before start when free cancellation stops. 0 = non-refundable. */
  freeCancellationHours: number;
  mobileVoucher: boolean;

  dietary: Dietary[];
  suitability: Suitability[];

  location: string;
  meetingPoint: string;
  timeSlots: string[];

  price: PriceBand;
  /** Tier D SKUs carry no public price — CTA becomes "Request a quote". */
  quoteOnly?: boolean;

  inclusions: string[];
  exclusions: string[];
  itinerary: ItineraryStop[];
  importantInfo: string[];
  cancellationPolicy: string;
  mealNote?: string;

  variants: Variant[];
  addOns: AddOn[];
  faqs: Faq[];

  relatedSlugs: string[];
  comboSlugs: string[];
  supplier: Supplier;

  badges: {
    bestseller?: boolean;
    newlyAdded?: boolean;
    editorPick?: boolean;
    sellingFast?: boolean;
  };

  seo: { title: string; description: string; keywords: string[] };
}

export interface Category {
  slug: string;
  name: string;
  shortName: string;
  emoji: string;
  tagline: string;
  intro: string;
  heroImage: string;
  faqs: Faq[];
  relatedSlugs: string[];
  featuredSlugs: string[];
}

export interface Collection {
  slug: string;
  name: string;
  audience: string;
  tagline: string;
  narrative: string;
  heroImage: string;
  activitySlugs: string[];
  faqs: Faq[];
  tone: "warm" | "premium" | "playful";
}

export interface Attraction {
  slug: string;
  name: string;
  blurb: string;
  heroImage: string;
  practical: { label: string; value: string }[];
  bestTime: string;
  gettingThere: string;
  activitySlugs: string[];
  faqs: Faq[];
}

export interface Combo {
  slug: string;
  name: string;
  tagline: string;
  heroImage: string;
  tier: Tier;
  audience: "family" | "couple" | "luxury" | "everyone";
  includedSlugs: string[];
  bundlePrice: Money;
  /** Sum of the same SKUs bought separately — the savings proof. */
  separatePrice: Money;
  durationLabel: string;
  validity: string;
  highlights: string[];
  upgrades: AddOn[];
  cancellationPolicy: string;
  faqs: Faq[];
  confirmation: ConfirmationType;
  fulfilmentMode: FulfilmentMode;
}

/* ----------------------------------------------------------------------------
 * Cart, order and booking
 * ------------------------------------------------------------------------- */

export interface PaxCount {
  adult: number;
  child: number;
  infant: number;
  senior: number;
}

export interface CartItem {
  id: string;
  kind: "activity" | "combo";
  slug: string;
  title: string;
  image: string;
  date: string;
  time: string;
  variantId?: string;
  variantName?: string;
  pax: PaxCount;
  addOnIds: string[];
  unit: Money;
  total: Money;
  confirmation: ConfirmationType;
  fulfilmentMode: FulfilmentMode;
  freeCancellationHours: number;
  durationMinutes: number;
}

export type OrderStatus =
  | "pending_payment"
  | "payment_failed"
  | "supplier_pending"
  | "confirmed"
  | "cancelled"
  | "completed";

export type Rail = "self_serve" | "assisted";

export interface Traveller {
  fullName: string;
  email: string;
  phone: string;
  countryCode: string;
  hotel?: string;
  pickupZone?: string;
  dietary?: Dietary;
  specialRequests?: string;
}

export interface Booking {
  reference: string;
  status: OrderStatus;
  rail: Rail;
  createdAt: string;
  items: CartItem[];
  traveller: Traveller;
  currency: Currency;
  subtotal: Money;
  discount: Money;
  total: Money;
  paymentMethod: string;
  couponCode?: string;
  supplierContact?: { name: string; phone: string };
  driver?: { name: string; phone: string; vehicle: string; window: string };
  voucherReady: boolean;
  reviewSubmitted?: boolean;
}

/* ----------------------------------------------------------------------------
 * Inquiry — the site's terminal event in inquiry mode.
 *
 * `InquiryItem` deliberately mirrors `CartItem` / order_items column-for-column
 * (pivot plan §6.2): converting a won inquiry to an order is a field copy, not
 * a translation. The one semantic difference is that totals are *indicative*.
 * ------------------------------------------------------------------------- */

export type InquiryStatus =
  | "new"
  | "assigned"
  | "contacted"
  | "quoted"
  | "negotiating"
  | "payment_pending"
  | "won"
  | "lost"
  | "spam";

export type InquirySource =
  | "inquiry_form"
  | "whatsapp"
  | "concierge"
  | "contact_form"
  | "quote_request"
  | "agent_created"
  | "abandoned_cart";

export type BudgetBand = "under_25k" | "25k_60k" | "60k_150k" | "150k_plus" | "unsure";

export interface InquiryItem extends Omit<CartItem, "total" | "unit"> {
  indicativeUnit: Money;
  indicativeTotal: Money;
  /** Filled by the agent during the conversation. */
  confirmedTotal?: Money;
  availabilityNote?: string;
}

export interface Agent {
  id: string;
  name: string;
  /** Initials avatar until real photos exist (pivot §3.5 asks for a real photo). */
  initials: string;
  role: string;
  languages: string[];
  shift: "IST" | "GST";
  /** Set when the agent has a real photo (`admin_users.photo_url`); the UI falls back to initials. */
  photoUrl?: string;
}

export interface Inquiry {
  reference: string;
  status: InquiryStatus;
  source: InquirySource;
  createdAt: string;
  /** Business-hours-adjusted concrete deadline (pivot §3.9 rule 1). */
  slaDueAt: string;
  firstResponseAt?: string;
  agent?: Agent;

  leadName: string;
  leadPhone: string;
  leadEmail?: string;
  countryCode: string;

  travelDateFrom?: string;
  travelDateTo?: string;
  datesFlexible: boolean;
  pax?: PaxCount;
  hotel?: string;
  dietary?: Dietary;
  specialRequests?: string;
  budgetBand?: BudgetBand;

  currency: Currency;
  indicativeTotal: Money;
  items: InquiryItem[];

  convertedBookingReference?: string;
  lostReason?: string;
}

/* ----------------------------------------------------------------------------
 * Search
 * ------------------------------------------------------------------------- */

export interface SearchFilters {
  q?: string;
  category?: string;
  date?: string;
  when?: "today" | "tomorrow" | "any";
  minPrice?: number;
  maxPrice?: number;
  dietary?: Dietary[];
  suitability?: Suitability[];
  privateOnly?: boolean;
  pickup?: boolean;
  instant?: boolean;
  freeCancellation?: boolean;
  duration?: "short" | "half" | "full" | "any";
  rating?: number;
  sort?: SortKey;
  page?: number;
}

export type SortKey =
  | "recommended"
  | "price_asc"
  | "price_desc"
  | "rating"
  | "popularity"
  | "duration";

export interface SearchResult {
  activities: Activity[];
  total: number;
  /** Populated only when the exact filter set returned nothing (AC-SRCH-01). */
  relaxed?: { message: string; activities: Activity[] };
  appliedFilters: SearchFilters;
}

export type LoadState = "idle" | "loading" | "success" | "empty" | "error";
