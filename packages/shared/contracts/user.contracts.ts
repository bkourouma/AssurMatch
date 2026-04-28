import { z } from "zod";
import { AssurMatchRoles } from "../rbac/assurmatch-role-matrix";
import { e164PhoneSchema, emailSchema, nonEmptyStringSchema, paginationQuerySchema, reasonSchema, scopeSchema, uuidSchema } from "../validation/common.schemas";

export const userStatusSchema = z.enum(["invited", "active", "suspended", "locked", "deleted"]);
export const userMfaStatusSchema = z.enum(["not_enrolled", "required", "enrolled", "verified"]);
export const assurMatchRoleSchema = z.enum(AssurMatchRoles);

export const adminUserCreateRequestSchema = z.object({
  email: emailSchema,
  displayName: nonEmptyStringSchema,
  phone: e164PhoneSchema.optional(),
  roles: z.array(assurMatchRoleSchema).min(1),
  partnerTenantId: uuidSchema.optional().nullable(),
  scopes: scopeSchema,
  reason: reasonSchema
});

export const adminUserUpdateRequestSchema = z.object({
  displayName: nonEmptyStringSchema.optional(),
  phone: e164PhoneSchema.optional(),
  scopes: scopeSchema.optional(),
  reason: reasonSchema
});

export const adminUserRoleUpdateRequestSchema = z.object({
  roles: z.array(assurMatchRoleSchema).min(1),
  reason: reasonSchema
});

export const adminUserActionRequestSchema = z.object({
  reason: reasonSchema
});

export const adminUsersListQuerySchema = paginationQuerySchema.extend({
  role: assurMatchRoleSchema.optional(),
  status: userStatusSchema.optional()
});

export const userListItemSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  displayName: nonEmptyStringSchema,
  phone: e164PhoneSchema.optional(),
  roles: z.array(assurMatchRoleSchema),
  partnerTenantId: uuidSchema.optional().nullable(),
  countryScopes: z.array(uuidSchema),
  productScopes: z.array(uuidSchema),
  status: userStatusSchema,
  mfaStatus: userMfaStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAt: z.date().optional().nullable(),
  passwordChangedAt: z.date().optional().nullable(),
  lockedAt: z.date().optional().nullable(),
  deletedAt: z.date().optional().nullable()
});

export const userDetailSchema = userListItemSchema.extend({
  failedLoginCount: z.number().int().min(0),
  passwordChangeRequired: z.boolean(),
  lockedReason: z.string().optional().nullable()
});

export type AdminUserCreateRequest = z.input<typeof adminUserCreateRequestSchema>;
export type AdminUserUpdateRequest = z.input<typeof adminUserUpdateRequestSchema>;
export type AdminUserRoleUpdateRequest = z.input<typeof adminUserRoleUpdateRequestSchema>;
export type AdminUserActionRequest = z.input<typeof adminUserActionRequestSchema>;
export type AdminUsersListQuery = z.input<typeof adminUsersListQuerySchema>;
export type UserListItem = z.output<typeof userListItemSchema>;
export type UserDetail = z.output<typeof userDetailSchema>;
