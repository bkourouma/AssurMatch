import { roleHasPermission, type AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { ADMIN_OPERATIONS_AUDIT_ACTIONS } from "../audit-logs/admin-operations-audit-actions";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";

/** The admin roles that operate quote requests and lead assignments (unchanged since spec 014). */
export const OPERATIONS_ROLES = new Set<AssurMatchRole>(["super_admin", "admin_pays", "compliance_admin", "support_admin"]);
/** Audit-log readers: the set `GET /admin/audit-logs` has always allowed. */
export const AUDIT_READER_ROLES = new Set<AssurMatchRole>(["super_admin", "compliance_admin", "support_admin"]);
/** Audit-log export is narrower than reading: compliance and super admin only. */
export const AUDIT_EXPORT_ROLES = new Set<AssurMatchRole>(["super_admin", "compliance_admin"]);

/** The message matches the HTTP error filter's `denied` pattern, so callers receive a 403. */
export class AdminOperationsAccessError extends Error {
  constructor(public readonly reason: string) {
    super(`Admin operations access denied: ${reason}`);
    this.name = "AdminOperationsAccessError";
  }
}

export interface AccessRequirement {
  /** At least one of the actor's roles must be in this set. */
  roles: Set<AssurMatchRole>;
  /** And at least one role must carry one of these permissions (any-of). Empty means roles only. */
  permissions?: string[];
}

export interface ScopeTarget {
  countryId?: string | undefined;
  countryCode?: string | undefined;
  productId?: string | undefined;
  productKey?: string | undefined;
}

/** RBAC, MFA and country/product scope shared by every spec 056 console. */
export class AdminOperationsAccess {
  constructor(private readonly audit: AuditLogWriter) {}

  assert(actor: ActorContext, requirement: AccessRequirement, target: { type: string; id: string }, refusedAction: string = ADMIN_OPERATIONS_AUDIT_ACTIONS.accessRefused): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required", target, refusedAction);
    if (!actor.roles.some((role) => requirement.roles.has(role))) this.refuse(actor, "forbidden_role", target, refusedAction);
    const permissions = requirement.permissions ?? [];
    if (permissions.length > 0 && !actor.roles.some((role) => permissions.some((permission) => roleHasPermission(role, permission)))) {
      this.refuse(actor, "missing_permission", target, refusedAction);
    }
  }

  hasPermission(actor: ActorContext, permission: string): boolean {
    return actor.roles.some((role) => roleHasPermission(role, permission));
  }

  /**
   * Same rule as `ManualRoutingService`: super admin sees everything, an actor without scopes is not
   * restricted, otherwise the country (id or ISO code) and, when product scopes exist, the product
   * (id or key) must be listed.
   */
  inScope(actor: ActorContext, target: ScopeTarget): boolean {
    if (actor.roles.includes("super_admin")) return true;
    const countryScopes = actor.countryScopes ?? [];
    if (countryScopes.length > 0) {
      const matches = [target.countryId, target.countryCode].some((value) => value !== undefined && countryScopes.includes(value));
      if (!matches) return false;
    }
    const productScopes = actor.productScopes ?? [];
    if (productScopes.length > 0) {
      const matches = [target.productId, target.productKey].some((value) => value !== undefined && productScopes.includes(value));
      if (!matches) return false;
    }
    return true;
  }

  assertInScope(actor: ActorContext, target: ScopeTarget, auditTarget: { type: string; id: string }, refusedAction: string = ADMIN_OPERATIONS_AUDIT_ACTIONS.accessRefused): void {
    if (!this.inScope(actor, target)) this.refuse(actor, "out_of_scope", auditTarget, refusedAction);
  }

  /** Support admins work the inbox without needing the visitor's identity: contact and answers are masked. */
  masksPii(actor: ActorContext): boolean {
    return !actor.roles.some((role) => role === "super_admin" || role === "admin_pays" || role === "compliance_admin");
  }

  refuse(actor: ActorContext, reason: string, target: { type: string; id: string }, action: string = ADMIN_OPERATIONS_AUDIT_ACTIONS.accessRefused): never {
    this.audit.write({
      actor,
      action,
      targetType: target.type,
      targetId: target.id,
      scope: { roles: actor.roles },
      result: "refused",
      reason,
      context: {}
    });
    throw new AdminOperationsAccessError(reason);
  }
}

export function maskEmail(value: string | undefined | null): string | null {
  if (!value) return null;
  const [local = "", domain = ""] = value.split("@");
  const [host = "", ...rest] = domain.split(".");
  return `${local.slice(0, 1)}***@${host.slice(0, 1)}***${rest.length > 0 ? `.${rest[rest.length - 1]}` : ""}`;
}

export function maskPhone(value: string | undefined | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\s+/g, "");
  return `${digits.slice(0, 4)}${"*".repeat(Math.max(digits.length - 6, 2))}${digits.slice(-2)}`;
}

export function maskAnswers(answers: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(answers).map((key) => [key, "[masque]"]));
}

/** `YYYY-MM-DD` filters are whole days: `from` starts at 00:00 UTC, `to` ends at 23:59:59.999 UTC. */
export function parseDateFilter(value: string | undefined, bound: "from" | "to"): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${bound === "from" ? "00:00:00.000" : "23:59:59.999"}Z`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function withinPeriod(value: Date, from: Date | undefined, to: Date | undefined): boolean {
  const time = value.getTime();
  if (from && time < from.getTime()) return false;
  if (to && time > to.getTime()) return false;
  return true;
}

export function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; total: number; page: number; pageSize: number } {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

export function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
