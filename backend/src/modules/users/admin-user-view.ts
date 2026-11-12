import type { UserAccount } from "./users.repository";

/**
 * What the admin API ever returns about a user. Deliberately an allow-list: never the password hash,
 * the MFA secret or backup codes, reset tokens, failed-login counters or the login IP hash.
 */
export interface AdminUserView {
  id: string;
  email: string;
  phone?: string;
  displayName: string;
  roles: UserAccount["roles"];
  status: UserAccount["status"];
  mfaStatus: UserAccount["mfaStatus"];
  partnerTenantId?: string;
  partnerPlan?: UserAccount["partnerPlan"];
  countryScopes: string[];
  productScopes: string[];
  passwordChangeRequired: boolean;
  lockedAt?: Date;
  lockedReason?: string;
  deletedAt?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminUserView(user: UserAccount): AdminUserView {
  return {
    id: user.id,
    email: user.email,
    ...(user.phone ? { phone: user.phone } : {}),
    displayName: user.displayName,
    roles: [...user.roles],
    status: user.status,
    mfaStatus: user.mfaStatus,
    ...(user.partnerTenantId ? { partnerTenantId: user.partnerTenantId } : {}),
    ...(user.partnerPlan ? { partnerPlan: user.partnerPlan } : {}),
    countryScopes: [...user.countryScopes],
    productScopes: [...user.productScopes],
    passwordChangeRequired: user.passwordChangeRequired,
    ...(user.lockedAt ? { lockedAt: user.lockedAt } : {}),
    ...(user.lockedReason ? { lockedReason: user.lockedReason } : {}),
    ...(user.deletedAt ? { deletedAt: user.deletedAt } : {}),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}
