import "server-only";
import { z, type ZodType } from "zod";
import { settingsRepo } from "../repositories/settings.repo";
import { env } from "../lib/env";
import { DEFAULT_SLA, type SlaConfig } from "../domain/sla";
import type { Actor } from "../lib/actor";
import { requirePermission } from "../lib/actor";
import { audit } from "../lib/audit";
import { parseWith } from "../lib/http";

/**
 * Typed access to the settings that Inquiry Mode reads at runtime. Defaults
 * come from env so a fresh database behaves; the seed writes the same values
 * so the admin panel shows them.
 */

export const SETTING_KEYS = {
  sla: "sla",
  routing: "routing",
  followup: "followup",
  pricing: "pricing",
} as const;

export const slaSchema = z.object({
  responseMinutes: z.number().int().min(5).max(24 * 60),
  businessStart: z.string().regex(/^\d{2}:\d{2}$/),
  businessEnd: z.string().regex(/^\d{2}:\d{2}$/),
  /** 0 = Sunday … 6 = Saturday. Stored rows written before this field existed default to every day. */
  businessDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  timeZone: z.string().min(3),
  escalationMinutes: z.number().int().min(5).max(24 * 60),
});

export const routingSchema = z.object({
  premiumThresholdInr: z.number().int().min(0),
  groupThresholdPax: z.number().int().min(1),
  maxConcurrentDefault: z.number().int().min(1).max(100),
});

export const followupSchema = z.object({
  ladderHours: z.array(z.number().positive()).min(1).max(6),
  /** After the last rung, mark lost with `no_response` */
  autoLostAfterHours: z.number().positive(),
});

export const pricingSchema = z.object({
  /** Confirmed > indicative by more than this → agent must explain + customer re-consents (§17 Q4) */
  tolerancePercent: z.number().min(0).max(100),
});

export type RoutingConfig = z.infer<typeof routingSchema>;
export type FollowupConfig = z.infer<typeof followupSchema>;
export type PricingConfig = z.infer<typeof pricingSchema>;

/** "1,2,3,4,5,6" → [1,2,3,4,5,6]; anything unusable falls back to the Mon–Sat default. */
function parseBusinessDays(raw: string): number[] {
  const days = [...new Set(raw.split(",").map((d) => Number.parseInt(d.trim(), 10)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  return days.length ? days : DEFAULT_SLA.businessDays;
}

export function envDefaults() {
  const e = env();
  const sla: SlaConfig = {
    responseMinutes: e.SLA_INQUIRY_RESPONSE_MINUTES || DEFAULT_SLA.responseMinutes,
    businessStart: e.SLA_BUSINESS_HOURS_START,
    businessEnd: e.SLA_BUSINESS_HOURS_END,
    businessDays: parseBusinessDays(e.SLA_BUSINESS_DAYS),
    timeZone: e.SLA_TIMEZONE,
    escalationMinutes: e.SLA_ESCALATION_MINUTES || DEFAULT_SLA.escalationMinutes,
  };
  const routing: RoutingConfig = {
    premiumThresholdInr: e.ROUTING_PREMIUM_THRESHOLD_INR,
    groupThresholdPax: e.ROUTING_GROUP_THRESHOLD_PAX,
    maxConcurrentDefault: e.AGENT_MAX_CONCURRENT_INQUIRIES,
  };
  const ladder = e.followupLadderHours.length ? e.followupLadderHours : [2, 24, 72];
  const followup: FollowupConfig = {
    ladderHours: ladder.length > 3 ? ladder.slice(0, -1) : ladder,
    autoLostAfterHours: ladder.length > 3 ? ladder[ladder.length - 1] : 168,
  };
  const pricing: PricingConfig = { tolerancePercent: e.PRICE_TOLERANCE_PERCENT };
  return { sla, routing, followup, pricing };
}

export const settingsService = {
  async sla(): Promise<SlaConfig> {
    const raw = await settingsRepo.get<unknown>(SETTING_KEYS.sla, envDefaults().sla);
    const r = slaSchema.safeParse(raw);
    return r.success ? r.data : envDefaults().sla;
  },
  async routing(): Promise<RoutingConfig> {
    const r = routingSchema.safeParse(await settingsRepo.get<unknown>(SETTING_KEYS.routing, envDefaults().routing));
    return r.success ? r.data : envDefaults().routing;
  },
  async followup(): Promise<FollowupConfig> {
    const r = followupSchema.safeParse(await settingsRepo.get<unknown>(SETTING_KEYS.followup, envDefaults().followup));
    return r.success ? r.data : envDefaults().followup;
  },
  async pricing(): Promise<PricingConfig> {
    const r = pricingSchema.safeParse(await settingsRepo.get<unknown>(SETTING_KEYS.pricing, envDefaults().pricing));
    return r.success ? r.data : envDefaults().pricing;
  },

  async all() {
    const [sla, routing, followup, pricing] = await Promise.all([
      settingsService.sla(),
      settingsService.routing(),
      settingsService.followup(),
      settingsService.pricing(),
    ]);
    return { sla, routing, followup, pricing };
  },

  async update(actor: Actor, key: keyof typeof SETTING_KEYS, value: unknown) {
    requirePermission(actor, "settings.edit");
    const schema =
      key === "sla" ? slaSchema : key === "routing" ? routingSchema : key === "followup" ? followupSchema : pricingSchema;
    const parsed = parseWith(schema as ZodType<unknown>, value);
    const before = await settingsRepo.get<unknown>(SETTING_KEYS[key], null);
    await settingsRepo.set(SETTING_KEYS[key], parsed, actor.id);
    await audit(actor, "settings.update", { type: "setting", id: SETTING_KEYS[key] }, { before, after: parsed });
    return parsed;
  },
};
