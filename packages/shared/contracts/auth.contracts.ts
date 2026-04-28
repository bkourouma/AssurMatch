import { z } from "zod";
import { e164PhoneSchema, emailSchema, nonEmptyStringSchema, reasonSchema, scopeSchema, uuidSchema } from "../validation/common.schemas";

export const passwordSchema = z.string().min(12).max(512);

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema
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
  kind: z.enum(["totp", "backup"]).default("totp")
});

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

export const userUpdateSchema = userCreateSchema.partial().extend({
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
