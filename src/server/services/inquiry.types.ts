import type {
  BudgetBand,
  CartItem,
  Currency,
  Dietary,
  FulfilmentMode,
  InquirySource,
  InquiryStatus,
  Money,
  PaxCount,
} from "@/lib/types";

/**
 * Server-side DTOs for the inquiry pipeline. These are what services return
 * and what the console renders — never Prisma models. Money is `Money` in
 * major units here (converted once, in the repository) because everything
 * downstream is display or arithmetic on totals.
 */

export interface AgentPublic {
  id: string;
  name: string;
  initials: string;
  role: string;
  languages: string[];
  shift: "IST" | "GST";
  photoUrl?: string;
  email?: string;
}

export interface InquiryItemDetail {
  id: string;
  kind: "activity" | "combo";
  productId?: string;
  comboId?: string;
  slug: string;
  title: string;
  image?: string;
  tier: string;
  date?: string;
  time?: string;
  variantId?: string;
  variantName?: string;
  pax: PaxCount;
  addOnIds: string[];
  confirmation: "instant" | "manual";
  fulfilmentMode: FulfilmentMode;
  freeCancellationHours: number;
  durationMinutes: number;
  inclusions: string[];
  cancellationPolicy: Record<string, unknown>;
  indicativeUnit: Money;
  indicativeTotal: Money;
  confirmedTotal?: Money;
  availabilityCheckedAt?: string;
  availabilityNote?: string;
  sortOrder: number;
}

export interface InquiryEventDetail {
  id: string;
  kind: "status" | "note" | "assignment" | "contact" | "item" | "system";
  fromStatus?: InquiryStatus;
  toStatus?: InquiryStatus;
  actorType: "customer" | "agent" | "admin" | "system" | "supplier";
  actorId?: string;
  actorName?: string;
  note?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface InquiryNotificationSummary {
  id: string;
  event: string;
  channel: "whatsapp" | "email" | "sms" | "push";
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "suppressed";
  recipientMasked: string;
  sentAt?: string;
  failedAt?: string;
  suppressedReason?: string;
  providerError?: string;
  createdAt: string;
}

export interface InquirySummary {
  id: string;
  reference: string;
  status: InquiryStatus;
  source: InquirySource;
  leadName: string;
  leadPhone: string;
  leadPhoneMasked: string;
  countryCode: string;
  currency: Currency;
  indicativeTotal: Money;
  itemCount: number;
  itemTitles: string[];
  travelDateFrom?: string;
  datesFlexible: boolean;
  guests: number;
  dietary?: Dietary;
  assignedAgent?: AgentPublic;
  slaDueAt?: string;
  slaBreachedAt?: string;
  firstResponseAt?: string;
  lastContactAt?: string;
  nextFollowupAt?: string;
  followupStage: number;
  createdAt: string;
  updatedAt: string;
}

export interface InquiryDetail extends InquirySummary {
  leadEmail?: string;
  whatsappConsent: boolean;
  travelDateTo?: string;
  pax?: PaxCount;
  hotel?: string;
  pickupZone?: string;
  specialRequests?: string;
  budgetBand?: BudgetBand;
  channelPreference?: string;
  assignedAt?: string;
  escalatedAt?: string;
  ackSentAt?: string;
  convertedOrderId?: string;
  convertedOrderReference?: string;
  lostReason?: string;
  lostAt?: string;
  attribution?: Record<string, unknown>;
  spamSignals?: Record<string, unknown>;
  items: InquiryItemDetail[];
  events: InquiryEventDetail[];
  notifications: InquiryNotificationSummary[];
  /** Other inquiries from the same phone — the "customer 360-lite" (§09.3.5). */
  history: InquirySummary[];
}

/** Public submission payload (mirrors src/lib/api SubmitInquiryInput). */
export interface CreateInquiryInput {
  items: CartItem[];
  leadName: string;
  leadPhone: string;
  countryCode: string;
  leadEmail?: string;
  travelDateFrom?: string;
  travelDateTo?: string;
  datesFlexible: boolean;
  pax?: PaxCount;
  hotel?: string;
  dietary?: Dietary;
  specialRequests?: string;
  budgetBand?: BudgetBand;
  currency: Currency;
  source: InquirySource;
  whatsappConsent: boolean;
  honeypot?: string;
  startedAt?: number;
  attribution?: Record<string, unknown>;
  sessionId?: string;
  anonId?: string;
}

export interface CreateInquiryResult {
  id: string;
  reference: string;
  slaDueAt: string;
  agent: AgentPublic;
  outOfHours: boolean;
}

export interface InquiryListFilters {
  status?: InquiryStatus[];
  assignedAgentId?: string | "unassigned" | "me";
  q?: string;
  source?: InquirySource;
  from?: string;
  to?: string;
  slaBreached?: boolean;
  sort?: "newest" | "oldest" | "sla" | "value";
  page?: number;
  pageSize?: number;
}

export interface InquiryListResult {
  items: InquirySummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface QueueCounts {
  new: number;
  assigned: number;
  contacted: number;
  quoted: number;
  negotiating: number;
  payment_pending: number;
  breached: number;
  mine: number;
  unassigned: number;
}
