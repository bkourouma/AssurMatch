import { z } from "zod";
import { e164PhoneSchema, emailSchema, nonEmptyStringSchema, reasonSchema, scopeSchema, uuidSchema } from "../validation/common.schemas";
import { toPatchSchema } from "../validation/patch.schemas";

export const passwordSchema = z.string().min(12).max(512);

/** Spec 063: trusted-device token kept by the app in an httpOnly cookie (256-bit random, base64url). */
export const trustedDeviceTokenSchema = z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/);
/** Spec 063: coarse user-agent label shown in the device list (never an identifier). */
export const trustedDeviceLabelSchema = z.string().trim().max(120);
export const TRUSTED_DEVICE_TTL_DAYS = 30;
export const TRUSTED_DEVICE_MAX_ACTIVE = 10;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  /** Spec 063: presented by the app when the browser holds a trusted-device cookie. */
  trustedDeviceToken: trustedDeviceTokenSchema.optional()
});

export const activateRequestSchema = z.object({
  token: nonEmptyStringSchema,
  password: passwordSchema
});

export const passwordChangeRequestSchema = z.object({
  oldPassword: passwordSchema,
  newPassword: passwordSchema
});

export const passwordResetRequestSchema = z.object({
  token: nonEmptyStringSchema,
  newPassword: passwordSchema
});

export const mfaVerifyRequestSchema = z.object({
  challengeId: nonEmptyStringSchema.optional(),
  code: z.string().min(6).max(10),
  kind: z.enum(["totp", "backup"]).default("totp"),
  /** Spec 063: trust this device for 30 days after a valid code. */
  trustDevice: z.boolean().default(false),
  deviceLabel: trustedDeviceLabelSchema.optional()
});

export const trustedDeviceSummarySchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string()
});
export type TrustedDeviceSummary = z.output<typeof trustedDeviceSummarySchema>;

export const mfaEnrollResponseSchema = z.object({
  secret: nonEmptyStringSchema,
  otpauthUri: nonEmptyStringSchema,
  backupCodes: z.array(nonEmptyStringSchema).length(8)
});

export const userCreateSchema = z.object({
  id: uuidSchema.optional(),
  email: emailSchema,
  phone: e164PhoneSchema.optional(),
  displayName: nonEmptyStringSchema,
  roles: z.array(nonEmptyStringSchema).min(1),
  partnerTenantId: uuidSchema.optional(),
  scopes: scopeSchema
});

export const userUpdateSchema = toPatchSchema(userCreateSchema).omit({ id: true }).extend({
  scopes: toPatchSchema(scopeSchema.unwrap()).optional(),
  status: z.enum(["invited", "active", "suspended", "locked", "deleted"]).optional(),
  reason: reasonSchema
});

export const userRolesUpdateSchema = z.object({
  roles: z.array(nonEmptyStringSchema).min(1),
  reason: reasonSchema
});

export type LoginRequest = z.input<typeof loginRequestSchema>;
export type ActivateRequest = z.input<typeof activateRequestSchema>;
export type PasswordChangeRequest = z.input<typeof passwordChangeRequestSchema>;
export type PasswordResetRequest = z.input<typeof passwordResetRequestSchema>;
export type MfaVerifyRequest = z.input<typeof mfaVerifyRequestSchema>;
export type MfaEnrollResponse = z.output<typeof mfaEnrollResponseSchema>;
export type UserCreateDto = z.input<typeof userCreateSchema>;
export type UserCreateRecord = z.output<typeof userCreateSchema>;
