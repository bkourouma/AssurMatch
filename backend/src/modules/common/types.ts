import type { PartnerStatus } from "../../../../packages/shared/contracts/partner.contracts";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

export interface ActorContext {
  actorId?: string;
  roles: AssurMatchRole[];
  mfaVerified?: boolean;
  partnerTenantId?: string;
  partnerPlan?: "starter" | "pro" | "enterprise";
  brokerUserTenantIds?: Record<string, string>;
  countryScopes?: string[];
  productScopes?: string[];
  correlationId?: string;
  /** Spec 051 R12: status of the actor's partner, resolved per request by the auth guard. */
  partnerTenantStatus?: PartnerStatus;
  /** Spec 051 R12: the actor's partner is suspended; broker write routes refuse with PARTNER_SUSPENDED. */
  tenantReadOnly?: boolean;
  /**
   * Spec 064: the custom role of a broker member, resolved per request by the auth guard. Never read
   * from, nor written to, a token or a header: the stored role is the only source.
   */
  customRole?: { id: string; name: string };
  /**
   * Spec 064: effective permissions of the member (base role intersected with the custom role,
   * limited to the custom permission catalogue). Present only while a custom role restricts the
   * member; absent means "no restriction beyond the base role".
   */
  customRolePermissions?: string[];
}

export interface ScopedResource {
  countryId?: string;
  productId?: string;
  partnerTenantId?: string;
  plan?: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type AuditResult = "success" | "refused" | "failed";

export interface AuditEntry {
  id: string;
  actorId?: string;
  action: string;
  targetType: string;
  targetId: string;
  scope: Record<string, unknown>;
  result: AuditResult;
  reason?: string;
  context: Record<string, unknown>;
  correlationId?: string;
  occurredAt: Date;
  retentionUntil: Date;
}
