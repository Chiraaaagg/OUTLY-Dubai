import "server-only";
import { z } from "zod";
import { ROLE_CODES } from "../lib/permissions";
import { SETTING_KEYS } from "../services/settings.service";

/**
 * Request schemas for the admin panel — shared by the JSON routes under
 * `src/app/api/admin/**` and the Server Actions under `src/app/admin/_actions`.
 * Every object schema is `.strict()` so unknown keys are rejected (§12.13).
 * Settings values are validated again inside `settingsService.update`; the
 * schemas here only shape the transport.
 */

const uuid = z.string().uuid();
const trimmed = (max: number) => z.string().trim().min(1).max(max);
const csvList = z.array(z.string().trim().min(1).max(40)).max(20);

export const roleCodeSchema = z.enum(ROLE_CODES);

/* -------------------------------------------------------------- users */

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    fullName: trimmed(120),
    /** Omit to have the service generate a one-time password. */
    password: z.string().min(12).max(200).optional(),
    roles: z.array(roleCodeSchema).min(1).max(ROLE_CODES.length),
    whatsappDisplayName: z.string().trim().max(60).optional(),
    shift: z.enum(["IST", "GST"]).optional(),
    languages: csvList.optional(),
    skills: csvList.optional(),
    title: z.string().trim().max(80).optional(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    fullName: trimmed(120).optional(),
    status: z.enum(["active", "suspended"]).optional(),
    roles: z.array(roleCodeSchema).min(1).max(ROLE_CODES.length).optional(),
    whatsappDisplayName: z.string().trim().max(60).optional(),
    photoUrl: z
      .string()
      .trim()
      .url()
      .max(500)
      .refine((u) => /^https:\/\//i.test(u), "Use an https:// URL")
      .optional(),
    shift: z.enum(["IST", "GST"]).optional(),
    languages: csvList.optional(),
    skills: csvList.optional(),
    title: z.string().trim().max(80).optional(),
    maxConcurrent: z.number().int().min(1).max(100).optional(),
    availabilityStatus: z.enum(["available", "busy", "away", "offline"]).optional(),
  })
  .strict();

export const resetCredentialsSchema = z.object({ resetTotp: z.boolean().optional() }).strict();

export const userIdSchema = uuid;

/* ----------------------------------------------------------- settings */

export const settingKeySchema = z.enum(Object.keys(SETTING_KEYS) as [keyof typeof SETTING_KEYS, ...(keyof typeof SETTING_KEYS)[]]);

/** PUT /api/admin/settings — `value` is validated by the service's per-key schema. */
export const updateSettingSchema = z
  .object({
    key: settingKeySchema,
    value: z.record(z.string(), z.unknown()),
  })
  .strict();

/* -------------------------------------------------------------- audit */

const isoDate = z.string().trim().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

export const auditQuerySchema = z
  .object({
    action: z.string().trim().max(80).optional(),
    entity: z.string().trim().max(60).optional(),
    entityId: z.string().trim().max(80).optional(),
    /** Admin user id. The UI page also accepts an email and resolves it before querying. */
    actor: uuid.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export type AuditQuery = z.infer<typeof auditQuerySchema>;

/* ----------------------------------------------------------- products */

export const fulfilmentModeSchema = z
  .object({
    kind: z.enum(["product", "combo"]),
    mode: z.enum(["inquiry", "instant"]),
    reason: z.string().trim().min(8, "Give a reason of at least 8 characters").max(500),
  })
  .strict();

export const productIdSchema = uuid;
