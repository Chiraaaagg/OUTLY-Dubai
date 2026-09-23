import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, TX_OPTIONS, type Tx } from "../lib/db";
import { uuidv7, formatReference } from "../lib/ids";
import type { Actor } from "../lib/actor";
import { requirePermission } from "../lib/actor";
import { audit } from "../lib/audit";
import { Errors } from "../lib/errors";
import type { Currency, PaxCount } from "@/lib/types";

/**
 * Order service — DORMANT → ACTIVE on win (§17 §5.1).
 *
 * THE single architectural rule (§09.2, §17 §6.5 item 3): every order — an
 * agent converting a won inquiry today, self-serve checkout for instant SKUs
 * later — is created by `orderService.createOrder(input, actor)`. There is no
 * second path. The input is the `order_items` shape; `inquiry.convertToOrder`
 * builds it by column copy from `inquiry_items`.
 *
 * What is deliberately NOT here yet (all FUTURE per §17 §5.1, all additive):
 *  - gateway payment intents / webhooks (payments are recorded manually)
 *  - supplier fulfilment (SupplierPort → supplier_bookings)
 *  - vouchers, refunds, cancellation engine, coupons, tax lines
 */

export interface CreateOrderItemInput {
  productId?: string;
  comboId?: string;
  variantCode?: string;
  mappingId?: string;
  titleSnapshot: string;
  tierSnapshot: string;
  slugSnapshot: string;
  kindSnapshot: "activity" | "combo";
  imageSnapshot?: string;
  variantNameSnapshot?: string;
  inclusionsSnapshot?: string[];
  cancellationPolicySnapshot?: Record<string, unknown>;
  confirmationSnapshot: "instant" | "manual";
  fulfilmentModeSnapshot: "inquiry" | "instant";
  freeCancellationHoursSnapshot: number;
  durationMinutesSnapshot: number;
  serviceDate: string; // YYYY-MM-DD (Asia/Dubai local date)
  timeslot?: string;
  pax: PaxCount;
  addons: string[];
  unitInr: bigint;
  unitAed: bigint;
  totalInr: bigint;
  totalAed: bigint;
  netCostAed?: bigint;
}

export interface CreateOrderInput {
  rail: "self_serve" | "assisted";
  currency: Currency;
  paymentCollection: "gateway" | "manual_link" | "bank_transfer";
  sourceInquiryId?: string;
  idempotencyKey?: string;
  traveller: {
    fullName: string;
    phoneE164: string;
    email?: string;
    hotel?: string;
    pickupZone?: string;
    dietary?: string;
    specialRequests?: string;
  };
  items: CreateOrderItemInput[];
  attribution?: {
    firstSource?: string; firstMedium?: string; firstCampaign?: string; firstTouchAt?: Date;
    lastSource?: string; lastMedium?: string; lastCampaign?: string; lastTouchAt?: Date;
    fbclid?: string; fbc?: string; fbp?: string; gclid?: string; waConversationId?: string;
  };
  /** Initial status. Agent conversion after a paid link → `paid`; gateway flow → `pending_payment`. */
  initialStatus?: "pending_payment" | "paid";
  paidAt?: Date;
}

export interface CreateOrderResult {
  id: string;
  reference: string;
  status: string;
  totalInr: bigint;
  totalAed: bigint;
}

async function nextOrderReference(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_ref_seq') AS n`;
  return formatReference("OUT", rows[0].n);
}

export const orderService = {
  async createOrder(input: CreateOrderInput, actor: Actor, tx?: Tx): Promise<CreateOrderResult> {
    requirePermission(actor, "orders.create");
    if (!input.items.length) throw Errors.validation({ items: "An order needs at least one item" });

    if (input.idempotencyKey) {
      const existing = await prisma.order.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return { id: existing.id, reference: existing.reference, status: existing.status, totalInr: existing.totalInr, totalAed: existing.totalAed };
    }

    const subtotalInr = input.items.reduce((s, i) => s + i.totalInr, 0n);
    const subtotalAed = input.items.reduce((s, i) => s + i.totalAed, 0n);
    const netCostAed = input.items.reduce((s, i) => s + (i.netCostAed ?? 0n), 0n);

    const run = async (t: Tx): Promise<CreateOrderResult> => {
      const guest = await t.guest.create({
        data: { id: uuidv7(), phoneE164: input.traveller.phoneE164, email: input.traveller.email?.toLowerCase(), fullName: input.traveller.fullName },
      });
      const id = uuidv7();
      const reference = await nextOrderReference(t);
      const status = input.initialStatus ?? "pending_payment";
      const order = await t.order.create({
        data: {
          id,
          reference,
          status,
          rail: input.rail,
          guestId: guest.id,
          createdByAgent: actor.type === "agent" || actor.type === "admin" ? actor.id : undefined,
          sourceInquiryId: input.sourceInquiryId,
          paymentCollection: input.paymentCollection,
          currency: input.currency,
          subtotalInr,
          subtotalAed,
          totalInr: subtotalInr,
          totalAed: subtotalAed,
          netCostAed,
          leadName: input.traveller.fullName,
          leadEmail: input.traveller.email?.toLowerCase(),
          leadPhone: input.traveller.phoneE164,
          hotel: input.traveller.hotel,
          pickupZone: input.traveller.pickupZone,
          dietary: input.traveller.dietary,
          specialRequests: input.traveller.specialRequests,
          idempotencyKey: input.idempotencyKey,
          paidAt: status === "paid" ? (input.paidAt ?? new Date()) : undefined,
          items: {
            create: input.items.map((i, idx) => ({
              id: uuidv7(),
              productId: i.productId,
              comboId: i.comboId,
              variantCode: i.variantCode,
              mappingId: i.mappingId,
              titleSnapshot: i.titleSnapshot,
              tierSnapshot: i.tierSnapshot,
              slugSnapshot: i.slugSnapshot,
              kindSnapshot: i.kindSnapshot,
              imageSnapshot: i.imageSnapshot,
              variantNameSnapshot: i.variantNameSnapshot,
              inclusionsSnapshot: i.inclusionsSnapshot ?? [],
              cancellationPolicySnapshot: (i.cancellationPolicySnapshot ?? {}) as Prisma.InputJsonValue,
              confirmationSnapshot: i.confirmationSnapshot,
              fulfilmentModeSnapshot: i.fulfilmentModeSnapshot,
              freeCancellationHoursSnapshot: i.freeCancellationHoursSnapshot,
              durationMinutesSnapshot: i.durationMinutesSnapshot,
              serviceDate: new Date(`${i.serviceDate}T00:00:00Z`),
              timeslot: i.timeslot,
              pax: i.pax as unknown as Prisma.InputJsonValue,
              addons: i.addons as unknown as Prisma.InputJsonValue,
              unitInr: i.unitInr,
              unitAed: i.unitAed,
              totalInr: i.totalInr,
              totalAed: i.totalAed,
              netCostAed: i.netCostAed ?? 0n,
              status: idx >= 0 ? "pending" : "pending",
            })),
          },
          attribution: input.attribution
            ? { create: { ...input.attribution } }
            : undefined,
        },
      });
      await audit(actor, "order.create", { type: "order", id }, { after: { reference, rail: input.rail, status, totalInr: subtotalInr.toString(), sourceInquiryId: input.sourceInquiryId } }, t);
      return { id: order.id, reference, status, totalInr: order.totalInr, totalAed: order.totalAed };
    };

    return tx ? run(tx) : prisma.$transaction(run, TX_OPTIONS);
  },

  /**
   * Manual payment recording (§17 §5.1 "payments rows created manually by the
   * agent for reconciliation"). A gateway webhook (FUTURE) writes the same row.
   */
  async recordManualPayment(
    actor: Actor,
    orderId: string,
    input: { amountMinor: bigint; currency: Currency; method?: string; paymentLinkId?: string; paymentLinkUrl?: string; gatewayPaymentId?: string; capturedAt?: Date },
    tx?: Tx,
  ) {
    requirePermission(actor, "payments.record");
    const run = async (t: Tx) => {
      const payment = await t.payment.create({
        data: {
          id: uuidv7(),
          orderId,
          gateway: "razorpay",
          gatewayPaymentId: input.gatewayPaymentId,
          paymentLinkId: input.paymentLinkId,
          paymentLinkUrl: input.paymentLinkUrl,
          method: input.method,
          amountMinor: input.amountMinor,
          currency: input.currency,
          status: "captured",
          recordedBy: actor.id,
          capturedAt: input.capturedAt ?? new Date(),
        },
      });
      await t.order.update({ where: { id: orderId }, data: { status: "paid", paidAt: input.capturedAt ?? new Date() } });
      await audit(actor, "payment.record_manual", { type: "order", id: orderId }, { after: { paymentId: payment.id, amountMinor: input.amountMinor.toString(), currency: input.currency } }, t);
      return payment;
    };
    return tx ? run(tx) : prisma.$transaction(run, TX_OPTIONS);
  },

  async getByReference(actor: Actor, reference: string) {
    requirePermission(actor, "orders.view_all");
    const o = await prisma.order.findUnique({ where: { reference }, include: { items: true, payments: true, attribution: true, fromInquiry: { select: { reference: true, id: true } } } });
    if (!o) throw Errors.notFound("Order");
    return o;
  },
};
