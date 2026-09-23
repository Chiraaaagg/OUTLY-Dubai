import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { uuidv7 } from "../lib/ids";
import { maskPhone } from "../domain/phone";

/**
 * Notification + webhook_events persistence for the ops/health views and the
 * WhatsApp webhook. Read models return DTOs with the recipient masked; the
 * full recipient never leaves the service layer for a list view (§13.7).
 */

export type NotificationStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "suppressed";
export type NotificationChannel = "whatsapp" | "email" | "sms" | "push";

export interface NotificationRow {
  id: string;
  event: string;
  channel: NotificationChannel;
  recipientMasked: string;
  inquiryId?: string;
  orderId?: string;
  template?: string;
  status: NotificationStatus;
  suppressedReason?: string;
  providerId?: string;
  providerError?: string;
  attempt: number;
  scheduledFor?: string;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  createdAt: string;
}

export interface DailyStat {
  /** ISO date (UTC) */
  day: string;
  channel: NotificationChannel;
  event: string;
  status: NotificationStatus;
  count: number;
}

function maskRecipient(r: string): string {
  if (r.includes("@")) {
    const [local, domain] = r.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return maskPhone(r);
}

type Row = Prisma.NotificationGetPayload<Record<string, never>>;

function toRow(n: Row): NotificationRow {
  return {
    id: n.id,
    event: n.event,
    channel: n.channel,
    recipientMasked: maskRecipient(n.recipient),
    inquiryId: n.inquiryId ?? undefined,
    orderId: n.orderId ?? undefined,
    template: n.template ?? undefined,
    status: n.status,
    suppressedReason: n.suppressedReason ?? undefined,
    providerId: n.providerId ?? undefined,
    providerError: n.providerError ?? undefined,
    attempt: n.attempt,
    scheduledFor: n.scheduledFor?.toISOString(),
    sentAt: n.sentAt?.toISOString(),
    deliveredAt: n.deliveredAt?.toISOString(),
    failedAt: n.failedAt?.toISOString(),
    createdAt: n.createdAt.toISOString(),
  };
}

export const notificationsRepo = {
  async listForInquiry(inquiryId: string): Promise<NotificationRow[]> {
    const rows = await prisma.notification.findMany({ where: { inquiryId }, orderBy: { createdAt: "asc" } });
    return rows.map(toRow);
  },

  /** Most recent `failed` rows — the health/ops "what is broken" list. */
  async recentFailures(limit = 20): Promise<NotificationRow[]> {
    const rows = await prisma.notification.findMany({
      where: { status: "failed" },
      orderBy: { failedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map(toRow);
  },

  /** sent / delivered / read / failed / suppressed per UTC day, channel and event. */
  async dailyStats(from: Date, to: Date): Promise<DailyStat[]> {
    const rows = await prisma.$queryRaw<{ day: Date; channel: NotificationChannel; event: string; status: NotificationStatus; count: number }[]>`
      SELECT date_trunc('day', created_at) AS day, channel, event, status, count(*)::int AS count
      FROM notifications
      WHERE created_at >= ${from} AND created_at < ${to}
      GROUP BY 1, 2, 3, 4
      ORDER BY 1 ASC, 2, 3, 4
    `;
    return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), channel: r.channel, event: r.event, status: r.status, count: Number(r.count) }));
  },

  /* ------------------------------------------------ delivery receipts */

  /**
   * Applies a provider status callback to every notification row carrying
   * that provider message id. Status only moves forward (sent → delivered →
   * read); a late "delivered" after "read" does not regress the row.
   */
  async applyProviderStatus(providerId: string, status: "sent" | "delivered" | "read" | "failed", at: Date, error?: string): Promise<number> {
    if (status === "failed") {
      const r = await prisma.notification.updateMany({
        where: { providerId, status: { in: ["queued", "sent"] } },
        data: { status: "failed", failedAt: at, providerError: error?.slice(0, 500) },
      });
      return r.count;
    }
    if (status === "sent") {
      const r = await prisma.notification.updateMany({ where: { providerId, status: "queued" }, data: { status: "sent", sentAt: at } });
      return r.count;
    }
    const allowedFrom: NotificationStatus[] = status === "delivered" ? ["queued", "sent"] : ["queued", "sent", "delivered"];
    const r = await prisma.notification.updateMany({
      where: { providerId, status: { in: allowedFrom } },
      data: { status, deliveredAt: at },
    });
    // A read receipt may arrive before any delivered one: make sure deliveredAt is set on those too.
    if (status === "read") {
      await prisma.notification.updateMany({ where: { providerId, deliveredAt: null }, data: { deliveredAt: at } });
    }
    return r.count;
  },

  /* ------------------------------------------------------ webhook_events */

  /**
   * Persists a raw webhook payload. Returns the row id, or null when the same
   * (provider, providerEventId) was already stored — the provider redelivered
   * and the caller must not process it twice.
   */
  async insertWebhookEvent(input: { provider: string; providerEventId: string; eventType?: string; payload: unknown; signatureValid: boolean; processingError?: string }): Promise<string | null> {
    const id = uuidv7();
    try {
      await prisma.webhookEvent.create({
        data: {
          id,
          provider: input.provider,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          payload: input.payload as Prisma.InputJsonValue,
          signatureValid: input.signatureValid,
          processingError: input.processingError,
        },
      });
      return id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    }
  },

  async markWebhookProcessed(id: string, error?: string): Promise<void> {
    await prisma.webhookEvent.update({ where: { id }, data: { processedAt: new Date(), processingError: error?.slice(0, 500) } });
  },
};
