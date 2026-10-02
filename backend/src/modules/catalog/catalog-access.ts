import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext, ScopedResource } from "../common/types";
import { catalogForbidden } from "./catalog-errors";

export interface CatalogRefusal {
  action: string;
  targetType: string;
  targetId: string;
  scope?: Record<string, unknown>;
  /** Machine readable refusal reason stored on the AuditLog. */
  refusal: string;
  /** Free text reason the admin typed, kept as context. */
  requestReason?: string | undefined;
  context?: Record<string, unknown>;
}

/**
 * Spec 050 R12: the RBAC matrix is reused without being widened. The few role rules the spec adds
 * (public activation and manual review reserved to compliance, read access for compliance, global
 * objects reserved to unscoped admins) are checked by explicit role here. Every refusal is audited.
 */
export class CatalogAccess {
  private readonly rbac = new RbacGuard();

  constructor(private readonly audit: AuditLogWriter) {}

  /** Compliance Admin or Super Admin: approves public openings and manual review removal. */
  isCompliance(actor: ActorContext): boolean {
    return actor.roles.includes("compliance_admin") || actor.roles.includes("super_admin");
  }

  /** Country, product (global) and regime objects span every country: a country scoped admin cannot change them. */
  isUnscoped(actor: ActorContext): boolean {
    return actor.roles.includes("super_admin") || !actor.countryScopes?.length;
  }

  can(actor: ActorContext, permission: string, resource: ScopedResource = {}): boolean {
    return this.rbac.can(actor, permission, resource);
  }

  /**
   * Catalogue reads. Compliance needs the countries and products to approve an opening and to write
   * consent texts; it reads them by explicit role, without gaining any `countries:*` permission.
   */
  canRead(actor: ActorContext, permission: "countries:read" | "products:read", resource: ScopedResource = {}): boolean {
    return this.rbac.can(actor, permission, resource) || actor.roles.includes("compliance_admin");
  }

  /** Whether a country falls inside the actor's scope (super admin and unscoped actors see every country). */
  inCountryScope(actor: ActorContext, countryId: string): boolean {
    if (actor.roles.includes("super_admin") || actor.roles.includes("compliance_admin")) return true;
    return !actor.countryScopes?.length || actor.countryScopes.includes(countryId);
  }

  require(actor: ActorContext, allowed: boolean, refusal: CatalogRefusal, message = "RBAC denied"): void {
    if (allowed) return;
    this.refuse(actor, refusal);
    throw catalogForbidden(message);
  }

  refuse(actor: ActorContext, refusal: CatalogRefusal): void {
    this.audit.write({
      actor,
      action: refusal.action,
      targetType: refusal.targetType,
      targetId: refusal.targetId,
      scope: refusal.scope ?? {},
      result: "refused",
      reason: refusal.refusal,
      context: { ...(refusal.requestReason ? { requestReason: refusal.requestReason } : {}), ...(refusal.context ?? {}) }
    });
  }
}
