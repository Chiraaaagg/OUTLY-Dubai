import "server-only";
import { z } from "zod";
import { OTP_LENGTH } from "../domain/otp";

/**
 * Request schemas for `/api/auth/*` and `/api/me/*` (impl/customer-auth-contract.md §3).
 * Every object schema is `.strict()` so unknown keys are rejected at the edge
 * (§19 §0 Validation). Messages are written for the customer; raw input is
 * never echoed back.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DIETARY_OPTIONS = ["veg", "jain", "halal", "non-veg"] as const;

/* ------------------------------------------------------------------ auth */

export const requestOtpSchema = z
  .object({
    phone: z.string().trim().min(5, "Check the WhatsApp number").max(24, "Check the WhatsApp number"),
    countryCode: z.string().trim().regex(/^\+?\d{1,4}$/, "Check the country code"),
  })
  .strict();

export const verifyOtpSchema = z
  .object({
    challengeId: z.string().regex(UUID_RE, "Request a new code"),
    code: z
      .string()
      .trim()
      .min(OTP_LENGTH, `Enter all ${OTP_LENGTH} digits.`)
      .max(OTP_LENGTH + 4, `Enter the ${OTP_LENGTH}-digit code.`),
  })
  .strict();

/**
 * MSG91 widget sign-in. The token is an opaque signed string from the provider;
 * we bound its length so a multi-megabyte body cannot reach the verify call,
 * and validate nothing else here — only MSG91 can say whether it is genuine.
 *
 * Note what is absent: there is no `phone` field, and there must never be one.
 * The verified number comes back from MSG91, so accepting one here would let a
 * caller pair a token they legitimately hold with an account they do not.
 */
export const verifyWidgetSchema = z
  .object({
    accessToken: z.string().trim().min(16, "Please try again.").max(4096, "Please try again."),
  })
  .strict();

/* -------------------------------------------------------------------- me */

/** Empty string means "clear this field"; absent means "leave it alone". */
const clearable = (max: number) => z.union([z.literal(""), z.string().trim().min(1).max(max)]).optional();

export const updateProfileSchema = z
  .object({
    fullName: clearable(120),
    email: z.union([z.literal(""), z.string().trim().max(200).email("That doesn't look like an email address.")]).optional(),
    dietary: z.union([z.literal(""), z.enum(DIETARY_OPTIONS)]).optional(),
    hotel: clearable(200),
    preferredCurrency: z.enum(["INR", "AED"]).optional(),
  })
  .strict();

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;

export const preferencesSchema = z
  .object({
    whatsappTransactional: z.boolean(),
    whatsappMarketing: z.boolean(),
    email: z.boolean(),
  })
  .strict();

export type PreferencesBody = z.infer<typeof preferencesSchema>;

export const deletionRequestSchema = z
  .object({
    reason: z.string().trim().max(500, "Keep the reason under 500 characters.").optional(),
  })
  .strict();
