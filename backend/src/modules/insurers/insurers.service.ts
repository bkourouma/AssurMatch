import type { ZodType } from "zod";
import {
  insurerCreateSchema,
  insurerListQuerySchema,
  insurerRetireSchema,
  insurerUpdateSchema,
  type AdminInsurerView,
  type InsurerChoice,
  type InsurerListQuery
} from "../../../../packages/shared/contracts/insurer.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { insurerConflict, insurerForbidden, insurerInvalid, insurerNotFound } from "./insurer-errors";
import type { InsurerRecord, InsurersRepository } from "./insurers.repository";

export const InsurerAuditActions = {
  created: "insurer.created",
  updated: "insurer.updated",
  retired: "insurer.retired",
  accessRefused: "insurer.access_refused",
  actionRefused: "insurer.action_refused"
} as const;

/** What the offers module needs to link an offer to an insurer (`OfferIntegrations.insurer`). */
export interface InsurerLookup {
  id: string;
  name: string;
  countryId: string;
  status: string;
}

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw insurerInvalid(`Validation failed: ${result.error.issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message)).join("; ")}`);
  }
  return result.data;
}

export function toAdminInsurerView(insurer: InsurerRecord): AdminInsurerView {
  return {
    id: insurer.id,
    countryId: insurer.countryId,
    name: insurer.name,
    code: insurer.code,
    ...(insurer.approvalNumber ? { approvalNumber: insurer.approvalNumber } : {}),
    status: insurer.status,
    concurrencyToken: insurer.updatedAt.toISOString(),
    createdAt: insurer.createdAt.toISOString(),
    updatedAt: insurer.updatedAt.toISOString()
  };
}

/**
 * Spec 070 (PRD section 8): insurer referential. Reading uses `offers:read`, writing `offers:update`
 * (the existing matrix) with the country scope of the offers. A suspended or retired insurer can no
 * longer be chosen for a new offer or version (checked by the offers module through `resolve`), but
 * the offers already linked keep their `insurerId`. Every write and every refusal is audited; the
 * audit context carries no personal data.
 */
export class InsurersService {
  constructor(private readonly repository: InsurersRepository, private readonly audit: AuditLogWriter) {}

  canRead(actor: ActorContext): boolean {
    return actor.roles.some((role) => roleHasPermission(role, "offers:read"));
  }

  canWrite(actor: ActorContext): boolean {
    return actor.roles.some((role) => roleHasPermission(role, "offers:update"));
  }

  inCountryScope(actor: ActorContext, countryId: string): boolean {
    if (actor.roles.includes("super_admin") || actor.roles.includes("compliance_admin")) return true;
    return !actor.countryScopes?.length || actor.countryScopes.includes(countryId);
  }

  async list(query: unknown, actor: ActorContext): Promise<AdminInsurerView[]> {
    this.requireAccess(actor, this.canRead(actor), undefined, "list", "forbidden_role");
    const parsed: InsurerListQuery = parse(insurerListQuerySchema, query);
    const rows = await this.repository.list({ countryId: parsed.countryId, status: parsed.status });
    return rows.filter((insurer) => this.inCountryScope(actor, insurer.countryId)).map(toAdminInsurerView);
  }

  async get(id: string, actor: ActorContext): Promise<AdminInsurerView> {
    this.requireAccess(actor, this.canRead(actor), undefined, "detail", "forbidden_role");
    return toAdminInsurerView(await this.requireInScope(id, actor, "detail"));
  }

  async create(input: unknown, actor: ActorContext): Promise<AdminInsurerView> {
    this.requireAccess(actor, this.canWrite(actor), undefined, "create", "forbidden_role");
    const parsed = parse(insurerCreateSchema, input);
    this.requireAccess(actor, this.inCountryScope(actor, parsed.countryId), undefined, "create", "out_of_scope_country", { countryId: parsed.countryId });
    if (await this.repository.findByCode(parsed.countryId, parsed.code)) {
      this.refused(actor, undefined, parsed.countryId, "create", "insurer_code_taken", { code: parsed.code });
      throw insurerConflict("Insurer conflict: this code is already used in this country");
    }
    const now = new Date();
    const approvalNumber = parsed.approvalNumber?.trim();
    const insurer = await this.repository.create({
      id: crypto.randomUUID(),
      countryId: parsed.countryId,
      name: parsed.name,
      code: parsed.code,
      ...(approvalNumber ? { approvalNumber } : {}),
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    });
    this.audit.write({
      actor,
      action: InsurerAuditActions.created,
      targetType: "Insurer",
      targetId: insurer.id,
      scope: { countryId: insurer.countryId },
      result: "success",
      reason: parsed.reason,
      context: { before: null, after: { name: insurer.name, code: insurer.code, status: insurer.status } }
    });
    return toAdminInsurerView(insurer);
  }

  /** The code and the country are immutable; a retired insurer is final. */
  async update(id: string, input: unknown, actor: ActorContext): Promise<AdminInsurerView> {
    this.requireAccess(actor, this.canWrite(actor), undefined, "update", "forbidden_role");
    const insurer = await this.requireInScope(id, actor, "update");
    const parsed = parse(insurerUpdateSchema, input);
    if (new Date(parsed.expectedUpdatedAt).getTime() !== insurer.updatedAt.getTime()) {
      this.refused(actor, insurer, insurer.countryId, "update", "update_conflict");
      throw insurerConflict("Insurer update conflict: the insurer changed since it was loaded; reload and retry");
    }
    if (insurer.status === "retired") {
      this.refused(actor, insurer, insurer.countryId, "update", "insurer_retired");
      throw insurerConflict("Insurer transition invalid: a retired insurer cannot change");
    }
    const approvalNumber = parsed.approvalNumber?.trim();
    const saved = await this.repository.update(insurer.id, {
      name: parsed.name,
      approvalNumber: approvalNumber || undefined,
      status: parsed.status,
      updatedAt: new Date()
    });
    this.audit.write({
      actor,
      action: parsed.status === "retired" ? InsurerAuditActions.retired : InsurerAuditActions.updated,
      targetType: "Insurer",
      targetId: saved.id,
      scope: { countryId: saved.countryId },
      result: "success",
      reason: parsed.reason,
      context: {
        before: { name: insurer.name, status: insurer.status, approvalNumber: insurer.approvalNumber ?? null },
        after: { name: saved.name, status: saved.status, approvalNumber: saved.approvalNumber ?? null }
      }
    });
    return toAdminInsurerView(saved);
  }

  /** Retires the insurer: it can no longer be chosen; linked offers keep their link. */
  async retire(id: string, input: unknown, actor: ActorContext): Promise<AdminInsurerView> {
    this.requireAccess(actor, this.canWrite(actor), undefined, "retire", "forbidden_role");
    const insurer = await this.requireInScope(id, actor, "retire");
    const parsed = parse(insurerRetireSchema, input);
    if (insurer.status === "retired") {
      this.refused(actor, insurer, insurer.countryId, "retire", "insurer_already_retired");
      throw insurerConflict("Insurer transition invalid: the insurer is already retired");
    }
    const saved = await this.repository.update(insurer.id, { status: "retired", updatedAt: new Date() });
    this.audit.write({
      actor,
      action: InsurerAuditActions.retired,
      targetType: "Insurer",
      targetId: saved.id,
      scope: { countryId: saved.countryId },
      result: "success",
      reason: parsed.reason,
      context: { before: { status: insurer.status }, after: { status: "retired" } }
    });
    return toAdminInsurerView(saved);
  }

  /**
   * Active insurers of a country for the offer form: admins (country scope) and brokers who can
   * read their offers. A broker only receives the light view.
   */
  async listChoices(countryId: string, actor: ActorContext): Promise<InsurerChoice[]> {
    const isBroker = actor.roles.some((role) => role.startsWith("broker_")) && Boolean(actor.partnerTenantId) && actor.roles.some((role) => roleHasPermission(role, "broker_offers:read"));
    const isAdmin = this.canRead(actor) && this.inCountryScope(actor, countryId);
    this.requireAccess(actor, isBroker || isAdmin, undefined, "choices", "forbidden_role", { countryId });
    const rows = await this.repository.list({ countryId, status: "active" });
    return rows.map((insurer) => ({ id: insurer.id, name: insurer.name, code: insurer.code, countryId: insurer.countryId }));
  }

  /** `OfferIntegrations.insurer`: the insurer an offer wants to link to, whatever its status. */
  async resolve(insurerId: string): Promise<InsurerLookup | undefined> {
    const insurer = await this.repository.find(insurerId);
    return insurer ? { id: insurer.id, name: insurer.name, countryId: insurer.countryId, status: insurer.status } : undefined;
  }

  private async requireInScope(id: string, actor: ActorContext, operation: string): Promise<InsurerRecord> {
    const insurer = await this.repository.find(id);
    if (!insurer) {
      this.refused(actor, undefined, undefined, operation, "insurer_not_found", { insurerId: id });
      throw insurerNotFound();
    }
    this.requireAccess(actor, this.inCountryScope(actor, insurer.countryId), insurer, operation, "out_of_scope_country");
    return insurer;
  }

  private refused(actor: ActorContext, insurer: InsurerRecord | undefined, countryId: string | undefined, operation: string, refusal: string, context: Record<string, unknown> = {}): void {
    this.audit.write({
      actor,
      action: InsurerAuditActions.actionRefused,
      targetType: "Insurer",
      targetId: insurer?.id ?? "new",
      scope: countryId ? { countryId } : {},
      result: "refused",
      reason: refusal,
      context: { operation, ...context }
    });
  }

  private requireAccess(actor: ActorContext, allowed: boolean, insurer: InsurerRecord | undefined, operation: string, refusal: string, context: Record<string, unknown> = {}): void {
    if (allowed) return;
    this.audit.write({
      actor,
      action: InsurerAuditActions.accessRefused,
      targetType: "Insurer",
      targetId: insurer?.id ?? "insurers",
      scope: insurer ? { countryId: insurer.countryId } : {},
      result: "refused",
      reason: refusal,
      context: { operation, roles: actor.roles, ...context }
    });
    throw insurerForbidden();
  }
}
