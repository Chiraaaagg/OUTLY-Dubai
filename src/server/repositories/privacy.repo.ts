import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, TX_OPTIONS } from "../lib/db";

/**
 * DPDP deletion requests — §05.8 applied to inquiry PII.
 *
 * "Anonymise, do not delete." Orders, payments, audit rows and consent rows
 * are financial / legal records and survive; the PII inside inquiries, orders
 * and guests for the requesting phone number is replaced with a
 * `[deleted-<token>]` marker so joins and money columns stay intact. The
 * token is random and is recorded ONLY in the audit row, so the mapping
 * (token -> original identity) exists nowhere.
 *
 * Deliberately NOT touched here:
 *   - inquiry_events / audit_logs / consents — append-only by trigger. Notes
 *     may contain PII; that is handled by the retention job (impl/database.md)
 *     and, for an explicit request, by ops review, not by a blind rewrite.
 *   - notifications.recipient — already sent; masked at read time. Pending
 *     (queued) rows for the number are cancelled so nothing further goes out.
 *   - analytics_events — hold ip_hash only, never the number.
 *
 * Service wiring (permission check, request logging, customer confirmation)
 * is the Admin agent's follow-up; this repository is the single write path.
 */

export interface AnonymiseResult {
  token: string;
  inquiries: number;
  orders: number;
  guests: number;
  notificationsCancelled: number;
  suppressed: boolean;
}

export async function anonymiseByPhone(phoneE164: string, actorId: string): Promise<AnonymiseResult> {
  const token = randomBytes(6).toString("hex");
  const marker = `[deleted-${token}]`;

  return prisma.$transaction(async (tx) => {
    const [inquiryIds, orderIds, guestIds] = await Promise.all([
      tx.inquiry.findMany({ where: { leadPhone: phoneE164 }, select: { id: true } }),
      tx.order.findMany({ where: { leadPhone: phoneE164 }, select: { id: true } }),
      tx.guest.findMany({ where: { phoneE164 }, select: { id: true } }),
    ]);

    const inquiries = await tx.inquiry.updateMany({
      where: { leadPhone: phoneE164 },
      data: {
        leadName: marker,
        leadEmail: null,
        leadPhone: marker,
        hotel: null,
        specialRequests: null,
        // fbclid / fbc / fbp / gclid are device identifiers — gone with the person.
        attribution: Prisma.DbNull,
        userAgent: null,
        ipHash: null,
        sessionId: null,
        anonId: null,
      },
    });

    const orders = await tx.order.updateMany({
      where: { leadPhone: phoneE164 },
      data: { leadName: marker, leadEmail: null, leadPhone: marker, hotel: null, specialRequests: null },
    });
    if (orderIds.length) {
      // Keep source / medium / campaign (aggregate reporting); drop the click identifiers.
      await tx.orderAttribution.updateMany({
        where: { orderId: { in: orderIds.map((o) => o.id) } },
        data: { fbclid: null, fbc: null, fbp: null, gclid: null },
      });
    }

    const guests = await tx.guest.updateMany({
      where: { phoneE164 },
      data: { fullName: marker, email: null, phoneE164: marker },
    });

    // Cancel anything still queued for this number (phone or email recipients
    // of the affected inquiries); sent rows are history and stay as they are.
    const notifications = await tx.notification.updateMany({
      where: {
        status: "queued",
        OR: [{ recipient: phoneE164 }, { inquiryId: { in: inquiryIds.map((i) => i.id) } }],
      },
      data: { status: "suppressed", suppressedReason: "deletion_request" },
    });

    // The number must not be contacted again, even if they submit a new form.
    const existing = await tx.suppressedPhone.findUnique({ where: { phoneE164 } });
    if (!existing) {
      await tx.suppressedPhone.create({ data: { phoneE164, reason: "deletion_request", addedBy: actorId } });
    }

    await tx.auditLog.create({
      data: {
        actorType: "admin",
        actorId,
        action: "privacy.anonymise",
        entityType: "phone",
        // The phone itself is not stored in the audit row: the token is the only key.
        entityId: marker,
        after: {
          token,
          inquiryIds: inquiryIds.map((i) => i.id),
          orderIds: orderIds.map((o) => o.id),
          guestIds: guestIds.map((g) => g.id),
          notificationsCancelled: notifications.count,
        },
        reason: "DPDP deletion request",
      },
    });

    return {
      token,
      inquiries: inquiries.count,
      orders: orders.count,
      guests: guests.count,
      notificationsCancelled: notifications.count,
      suppressed: !existing,
    };
  }, TX_OPTIONS);
}
