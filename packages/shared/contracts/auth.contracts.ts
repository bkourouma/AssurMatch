import { z } from "zod";
import { e164PhoneSchema, emailSchema, nonEmptyStringSchema, reasonSchema, scopeSchema, uuidSchema } from "../validation/common.schemas";

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(12)
});

export const mfaVerifyRequestSchema = z.object({
  challengeId: nonEmptyStringSchema,
  code: z.string().min(6).max(10)
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
export type UserCreateDto = z.input<typeof userCreateSchema>;
export type UserCreateRecord = z.output<typeof userCreateSchema>;
