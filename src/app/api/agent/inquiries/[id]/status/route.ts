import type { NextRequest } from "next/server";
import { inquiryService } from "@/server/services/inquiry.service";
import { assertSameOrigin, handle, json, parseJson, parseWith } from "@/server/lib/http";
import { requireAdmin } from "@/server/lib/guards";
import { idParamSchema, transitionInquirySchema } from "@/server/schemas/inquiry.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/agent/inquiries/:id/status — move along the pipeline (§17 §7.1).
 * `won` is refused here by the service: conversion goes through /convert so an
 * order always exists behind a won inquiry.
 */
export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { actor } = await requireAdmin(req, "inquiries.update");
  const { id } = parseWith(idParamSchema, await ctx.params);
  const body = await parseJson(req, transitionInquirySchema);
  const detail = await inquiryService.transition(actor, id, body.to, { reason: body.reason, note: body.note });
  return json(detail);
});
