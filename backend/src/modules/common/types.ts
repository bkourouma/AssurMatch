import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

export interface ActorContext {
  actorId?: string;
  roles: AssurMatchRole[];
  mfaVerified?: boolean;
  partnerTenantId?: string;
  countryScopes?: string[];
  productScopes?: string[];
  correlationId?: string;
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
