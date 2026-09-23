import type { NextRequest } from "next/server";
import { notificationService } from "@/server/services/notification.service";
import { assertSameOrigin, handle, json, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { idParamSchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/agent/notifications/:id/resend — re-dispatch an ack or follow-up (email/WhatsApp only). Audited by the service. */
export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "notifications.resend");
  const { id } = parseWith(idParamSchema, await ctx.params);
  const result = await notificationService.resend(actor, id);
  return json(result);
});
