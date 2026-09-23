import "server-only";
import { Prisma, type InquiryStatus as DbInquiryStatus } from "@prisma/client";
import { prisma, type Tx } from "../lib/db";
import { minorToMoney } from "../lib/money";
import { formatReference } from "../lib/ids";
import { maskPhone } from "../domain/phone";
import type { PaxCount } from "@/lib/types";
import type {
  AgentPublic,
  InquiryDetail,
  InquiryEventDetail,
  InquiryItemDetail,
  InquiryListFilters,
  InquiryListResult,
  InquiryNotificationSummary,
  InquirySummary,
  QueueCounts,
} from "../services/inquiry.types";

/**
 * Inquiry persistence. Maps Prisma rows → DTOs; money → major units here and
 * nowhere else. Ownership filters (agent sees own unless view_all) are
 * applied here so a caller cannot forget them (§13.3).
 */

const agentSelect = {
  id: true,
  fullName: true,
  whatsappDisplayName: true,
  photoUrl: true,
  email: true,
  availability: { select: { title: true, languages: true, shift: true } },
} as const;

type AgentRow = Prisma.AdminUserGetPayload<{ select: typeof agentSelect }>;

export function toAgentPublic(a: AgentRow | null | undefined): AgentPublic | undefined {
  if (!a) return undefined;
  const name = a.whatsappDisplayName?.includes(" ") ? a.whatsappDisplayName : a.fullName;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return {
    id: a.id,
    name,
    initials,
    role: a.availability?.title ?? "Dubai trip specialist",
    languages: a.availability?.languages ?? [],
    shift: a.availability?.shift === "GST" ? "GST" : "IST",
    photoUrl: a.photoUrl ?? undefined,
    email: a.email,
  };
}

const summaryInclude = {
  assignedAgent: { select: agentSelect },
  items: { select: { titleSnapshot: true }, orderBy: { sortOrder: "asc" as const } },
} as const;

type SummaryRow = Prisma.InquiryGetPayload<{ include: typeof summaryInclude }>;

const dateKey = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : undefined);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

function guestsOf(pax: unknown): number {
  const p = (pax ?? {}) as Partial<PaxCount>;
  return (p.adult ?? 0) + (p.child ?? 0) + (p.infant ?? 0) + (p.senior ?? 0);
}

export function toSummary(r: SummaryRow): InquirySummary {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    source: r.source,
    leadName: r.leadName,
    leadPhone: r.leadPhone,
    leadPhoneMasked: maskPhone(r.leadPhone),
    countryCode: r.countryCode,
    currency: r.currency,
    indicativeTotal: minorToMoney(r.indicativeTotalInr, r.indicativeTotalAed),
    itemCount: r.items.length,
    itemTitles: r.items.map((i) => i.titleSnapshot),
    travelDateFrom: dateKey(r.travelDateFrom),
    datesFlexible: r.datesFlexible,
    guests: guestsOf(r.pax),
    dietary: (r.dietary as InquirySummary["dietary"]) ?? undefined,
    assignedAgent: toAgentPublic(r.assignedAgent),
    slaDueAt: iso(r.slaDueAt),
    slaBreachedAt: iso(r.slaBreachedAt),
    firstResponseAt: iso(r.firstResponseAt),
    lastContactAt: iso(r.lastContactAt),
    nextFollowupAt: iso(r.nextFollowupAt),
    followupStage: r.followupStage,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const detailInclude = {
  ...summaryInclude,
  items: { orderBy: { sortOrder: "asc" as const } },
  events: { orderBy: { createdAt: "asc" as const } },
  notifications: { orderBy: { createdAt: "asc" as const } },
  convertedOrder: { select: { id: true, reference: true } },
} as const;

type DetailRow = Prisma.InquiryGetPayload<{ include: typeof detailInclude }>;

function toItem(i: DetailRow["items"][number]): InquiryItemDetail {
  return {
    id: i.id,
    kind: i.kindSnapshot === "combo" ? "combo" : "activity",
    productId: i.productId ?? undefined,
    comboId: i.comboId ?? undefined,
    slug: i.slugSnapshot,
    title: i.titleSnapshot,
    image: i.imageSnapshot ?? undefined,
    tier: i.tierSnapshot,
    date: dateKey(i.serviceDate),
    time: i.timeslot ?? undefined,
    variantId: i.variantCode ?? undefined,
    variantName: i.variantNameSnapshot ?? undefined,
    pax: (i.pax as unknown as PaxCount) ?? { adult: 0, child: 0, infant: 0, senior: 0 },
    addOnIds: (i.addons as string[]) ?? [],
    confirmation: i.confirmationSnapshot,
    fulfilmentMode: i.fulfilmentModeSnapshot,
    freeCancellationHours: i.freeCancellationHoursSnapshot,
    durationMinutes: i.durationMinutesSnapshot,
    inclusions: i.inclusionsSnapshot ?? [],
    cancellationPolicy: (i.cancellationPolicySnapshot as Record<string, unknown> | null) ?? {},
    indicativeUnit: minorToMoney(i.indicativeUnitInr, i.indicativeUnitAed),
    indicativeTotal: minorToMoney(i.indicativeTotalInr, i.indicativeTotalAed),
    confirmedTotal:
      i.confirmedTotalInr !== null && i.confirmedTotalInr !== undefined
        ? minorToMoney(i.confirmedTotalInr, i.confirmedTotalAed ?? 0n)
        : undefined,
    availabilityCheckedAt: iso(i.availabilityCheckedAt),
    availabilityNote: i.availabilityNote ?? undefined,
    sortOrder: i.sortOrder,
  };
}

function toEvent(e: DetailRow["events"][number], names: Map<string, string>): InquiryEventDetail {
  return {
    id: e.id.toString(),
    kind: e.kind,
    fromStatus: e.fromStatus ?? undefined,
    toStatus: e.toStatus ?? undefined,
    actorType: e.actorType,
    actorId: e.actorId ?? undefined,
    actorName: e.actorId ? names.get(e.actorId) : undefined,
    note: e.note ?? undefined,
    meta: (e.meta as Record<string, unknown> | null) ?? undefined,
    createdAt: e.createdAt.toISOString(),
  };
}

function toNotification(n: DetailRow["notifications"][number]): InquiryNotificationSummary {
  const masked =
    n.channel === "email"
      ? n.recipient.replace(/^(.).*(@.*)$/, "$1•••$2")
      : n.recipient.startsWith("+")
        ? maskPhone(n.recipient)
        : n.recipient;
  return {
    id: n.id,
    event: n.event,
    channel: n.channel,
    status: n.status,
    recipientMasked: masked,
    sentAt: iso(n.sentAt),
    failedAt: iso(n.failedAt),
    suppressedReason: n.suppressedReason ?? undefined,
    providerError: n.providerError ?? undefined,
    createdAt: n.createdAt.toISOString(),
  };
}

export const inquiryRepo = {
  async nextReference(tx: Tx | typeof prisma = prisma): Promise<string> {
    const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('inquiry_ref_seq') AS n`;
    return formatReference("INQ", rows[0].n);
  },

  async findById(id: string): Promise<InquiryDetail | null> {
    const r = await prisma.inquiry.findUnique({ where: { id }, include: detailInclude });
    return r ? inquiryRepo.hydrate(r) : null;
  },

  async findByReference(reference: string): Promise<InquiryDetail | null> {
    const r = await prisma.inquiry.findUnique({ where: { reference }, include: detailInclude });
    return r ? inquiryRepo.hydrate(r) : null;
  },

  /** Customer lookup: reference AND phone must both match (§17 §9 #4). */
  async findForCustomer(reference: string, leadPhoneE164: string): Promise<InquiryDetail | null> {
    const r = await prisma.inquiry.findFirst({ where: { reference, leadPhone: leadPhoneE164 }, include: detailInclude });
    return r ? inquiryRepo.hydrate(r) : null;
  },

  /**
   * Signed-in customer's inquiries (impl/customer-auth-contract.md §3): linked by
   * verified identity OR made with the verified phone; `spam` never shown.
   * Newest first. Hydrated so the service can apply `toCustomerView`.
   */
  async listForCustomer(customerId: string, leadPhoneE164: string): Promise<InquiryDetail[]> {
    const rows = await prisma.inquiry.findMany({
      where: { OR: [{ customerId }, { leadPhone: leadPhoneE164 }], status: { not: "spam" } },
      include: detailInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Promise.all(rows.map((r) => inquiryRepo.hydrate(r)));
  },

  async hydrate(r: DetailRow): Promise<InquiryDetail> {
    const actorIds = [...new Set(r.events.map((e) => e.actorId).filter((x): x is string => Boolean(x)))];
    const actors = actorIds.length
      ? await prisma.adminUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
      : [];
    const names = new Map(actors.map((a) => [a.id, a.fullName]));
    const history = await prisma.inquiry.findMany({
      where: { leadPhone: r.leadPhone, id: { not: r.id } },
      include: summaryInclude,
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return {
      ...toSummary(r as unknown as SummaryRow),
      itemCount: r.items.length,
      itemTitles: r.items.map((i) => i.titleSnapshot),
      leadEmail: r.leadEmail ?? undefined,
      whatsappConsent: r.whatsappConsent,
      travelDateTo: dateKey(r.travelDateTo),
      pax: (r.pax as unknown as PaxCount | null) ?? undefined,
      hotel: r.hotel ?? undefined,
      pickupZone: r.pickupZone ?? undefined,
      specialRequests: r.specialRequests ?? undefined,
      budgetBand: (r.budgetBand as InquiryDetail["budgetBand"]) ?? undefined,
      channelPreference: r.channelPreference ?? undefined,
      assignedAt: iso(r.assignedAt),
      escalatedAt: iso(r.escalatedAt),
      ackSentAt: iso(r.ackSentAt),
      convertedOrderId: r.convertedOrderId ?? undefined,
      convertedOrderReference: r.convertedOrder?.reference,
      lostReason: r.lostReason ?? undefined,
      lostAt: iso(r.lostAt),
      attribution: (r.attribution as Record<string, unknown> | null) ?? undefined,
      spamSignals: (r.spamSignals as Record<string, unknown> | null) ?? undefined,
      items: r.items.map(toItem),
      events: r.events.map((e) => toEvent(e, names)),
      notifications: r.notifications.map(toNotification),
      history: history.map(toSummary),
    };
  },

  async list(filters: InquiryListFilters, scope: { agentId?: string; viewAll: boolean }): Promise<InquiryListResult> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
    const where: Prisma.InquiryWhereInput = {};

    if (!scope.viewAll) where.assignedAgentId = scope.agentId ?? "__none__";
    else if (filters.assignedAgentId === "unassigned") where.assignedAgentId = null;
    else if (filters.assignedAgentId === "me") where.assignedAgentId = scope.agentId ?? "__none__";
    else if (filters.assignedAgentId) where.assignedAgentId = filters.assignedAgentId;

    if (filters.status?.length) where.status = { in: filters.status as DbInquiryStatus[] };
    if (filters.source) where.source = filters.source;
    if (filters.slaBreached) where.slaBreachedAt = { not: null };
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      };
    }
    if (filters.q) {
      const q = filters.q.trim();
      const digits = q.replace(/\D/g, "");
      where.OR = [
        { reference: { contains: q.toUpperCase() } },
        { leadName: { contains: q, mode: "insensitive" } },
        { leadEmail: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 4 ? [{ leadPhone: { contains: digits } }] : []),
        { items: { some: { titleSnapshot: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const orderBy: Prisma.InquiryOrderByWithRelationInput[] =
      filters.sort === "oldest"
        ? [{ createdAt: "asc" }]
        : filters.sort === "sla"
          ? [{ slaDueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]
          : filters.sort === "value"
            ? [{ indicativeTotalInr: "desc" }, { createdAt: "desc" }]
            : [{ createdAt: "desc" }];

    const [rows, total] = await Promise.all([
      prisma.inquiry.findMany({ where, include: summaryInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.inquiry.count({ where }),
    ]);
    return { items: rows.map(toSummary), total, page, pageSize };
  },

  async queueCounts(agentId?: string): Promise<QueueCounts> {
    const open: DbInquiryStatus[] = ["new", "assigned", "contacted", "quoted", "negotiating", "payment_pending"];
    const [groups, breached, mine, unassigned] = await Promise.all([
      prisma.inquiry.groupBy({ by: ["status"], where: { status: { in: open } }, _count: { _all: true } }),
      prisma.inquiry.count({ where: { status: { in: ["new", "assigned"] }, slaBreachedAt: { not: null } } }),
      agentId ? prisma.inquiry.count({ where: { assignedAgentId: agentId, status: { in: open } } }) : Promise.resolve(0),
      prisma.inquiry.count({ where: { assignedAgentId: null, status: { in: ["new"] } } }),
    ]);
    const c = (s: DbInquiryStatus) => groups.find((g) => g.status === s)?._count._all ?? 0;
    return {
      new: c("new"),
      assigned: c("assigned"),
      contacted: c("contacted"),
      quoted: c("quoted"),
      negotiating: c("negotiating"),
      payment_pending: c("payment_pending"),
      breached,
      mine,
      unassigned,
    };
  },

  async previousAgentForPhone(leadPhoneE164: string): Promise<string | undefined> {
    const r = await prisma.inquiry.findFirst({
      where: { leadPhone: leadPhoneE164, assignedAgentId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { assignedAgentId: true },
    });
    return r?.assignedAgentId ?? undefined;
  },

  async isSuppressed(phoneE164: string): Promise<boolean> {
    const r = await prisma.suppressedPhone.findUnique({ where: { phoneE164 } });
    return Boolean(r);
  },

  /** Rows the sweep job acts on (§17 §7.2 ladder, §7.5 breach). */
  async dueForSla(now: Date) {
    return prisma.inquiry.findMany({
      where: { status: { in: ["new", "assigned"] }, slaDueAt: { lt: now }, slaBreachedAt: null },
      select: { id: true, reference: true, assignedAgentId: true, slaDueAt: true },
      take: 200,
    });
  },

  async dueForFollowup(now: Date) {
    return prisma.inquiry.findMany({
      where: { status: { in: ["contacted", "quoted", "negotiating", "payment_pending"] }, nextFollowupAt: { lt: now } },
      select: { id: true, reference: true, followupStage: true, lastContactAt: true, status: true },
      take: 200,
    });
  },
};
