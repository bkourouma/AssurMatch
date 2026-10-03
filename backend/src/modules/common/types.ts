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
