import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../lib/db";
import { uuidv7 } from "../lib/ids";

/**
 * `consents` is append-only; current state is the latest row per subject,
 * channel and purpose (§05.3.1). Re-checked at send time (§08.7).
 */

export async function latestConsent(q: {
  recipient: string;
  channel: "whatsapp" | "email" | "sms" | "push";
  purpose: "transactional" | "marketing" | "recovery";
}) {
  const isEmail = q.recipient.includes("@");
  return prisma.consent.findFirst({
    where: {
      channel: q.channel,
      purpose: q.purpose,
      ...(isEmail ? { email: q.recipient.toLowerCase() } : { phoneE164: q.recipient }),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function recordConsent(
  input: {
    phoneE164?: string;
    email?: string;
    channel: "whatsapp" | "email" | "sms" | "push";
    purpose: "transactional" | "marketing" | "recovery";
    granted: boolean;
    source: string;
    evidence?: Record<string, unknown>;
  },
  tx: Tx | typeof prisma = prisma,
) {
  return tx.consent.create({
    data: {
      id: uuidv7(),
      phoneE164: input.phoneE164,
      email: input.email?.toLowerCase(),
      channel: input.channel,
      purpose: input.purpose,
      granted: input.granted,
      source: input.source,
      evidence: input.evidence as Prisma.InputJsonValue | undefined,
    },
  });
}
