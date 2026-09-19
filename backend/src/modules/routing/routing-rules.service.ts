import type {
  RoutingRule,
  RoutingRuleCreate,
  RoutingRuleHistoryEntry,
  RoutingRuleHistoryResponse,
  RoutingRuleUpdate,
  RoutingRulesResponse
} from "../../../../packages/shared/contracts/routing-rule.contracts";
import { routingRuleCreateSchema, routingRuleUpdateSchema } from "../../../../packages/shared/contracts/routing-rule.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService, Country } from "../countries/countries.module";
import type { PartnersService } from "../partners/partners.module";
import type { ProductsService } from "../products/products.module";
import { RoutingAuditActions } from "./routing-audit-actions";
import { MemoryRoutingRulesRepository, type RoutingRuleHistoryRecord, type RoutingRuleRecord, type RoutingRulesRepository } from "./routing-rules.repository";

export class RoutingRuleAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Routing rule access denied: ${reason}`);
    this.name = "RoutingRuleAccessRefusedError";
  }
}

export class RoutingRuleValidationError extends Error {
  constructor(public readonly reason: string) {
    super(`Invalid routing rule: ${reason}`);
    this.name = "RoutingRuleValidationError";
  }
}

export class RoutingRuleConflictError extends Error {
  constructor(public readonly reason: string) {
    super(`Routing rule conflict: ${reason}`);
    this.name = "RoutingRuleConflictError";
  }
}

export interface RoutingRulesDeps {
  audit: AuditLogWriter;
  countries: CountriesService;
  products: ProductsService;
  partners: PartnersService;
  repository?: RoutingRulesRepository;
}

/**
 * Admin-authored routing rules (Constitution VII: configurable and audited rules). The service
 * only stores how eligible partners are ranked; eligibility itself stays in the leads policies.
 */
export class RoutingRulesService {
  private readonly repository: RoutingRulesRepository;

  constructor(private readonly deps: RoutingRulesDeps) {
    this.repository = deps.repository ?? new MemoryRoutingRulesRepository();
  }

  /** Most specific active rule wins: (country, product) before (country, all products). */
  async resolveForQuote(countryId: string, productId: string): Promise<RoutingRuleRecord | undefined> {
    return await this.repository.findActive(countryId, productId) ?? await this.repository.findActive(countryId, null);
  }

  async list(actor: ActorContext): Promise<RoutingRulesResponse> {
    this.assertPermission(actor, "routing_rules:read");
    const countries = await this.deps.countries.listAdmin();
    const items = (await this.repository.list())
      .filter((rule) => this.scopeAllows(actor, countries.find((country) => country.id === rule.countryId)))
      .map((rule) => this.toDto(rule));
    return { generatedAt: new Date().toISOString(), items, total: items.length };
  }

  async create(actor: ActorContext, input: RoutingRuleCreate): Promise<RoutingRule> {
    this.assertPermission(actor, "routing_rules:update");
    const parsed = routingRuleCreateSchema.parse(input);
    const country = await this.requireCountry(actor, parsed.countryId, parsed.productId ?? null);
    if (parsed.productId) await this.deps.products.require(parsed.productId);
    const productId = parsed.productId ?? null;
    const candidate = {
      mode: parsed.mode,
      priorities: parsed.priorities,
      exclusivePartnerTenantId: parsed.exclusivePartnerTenantId ?? null
    };
    await this.validateModeInputs(candidate);
    if (await this.repository.findActive(country.id, productId)) {
      this.refuse(actor, "duplicate_active_rule", { countryId: country.id, productId }, "conflict");
    }
    const now = new Date();
    const record: RoutingRuleRecord = {
      id: crypto.randomUUID(),
      countryId: country.id,
      productId,
      mode: parsed.mode,
      maxRecipients: parsed.maxRecipients,
      status: "active",
      priorities: parsed.priorities,
      exclusivePartnerTenantId: candidate.exclusivePartnerTenantId,
      description: parsed.description ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdById: actor.actorId ?? null
    };
    await this.repository.create(record, this.historyEntry(record.id, "created", null, this.snapshot(record), parsed.reason, actor));
    this.deps.audit.write({
      actor,
      action: RoutingAuditActions.ruleCreated,
      targetType: "RoutingRule",
      targetId: record.id,
      scope: { countryId: record.countryId, productId: record.productId },
      result: "success",
      reason: parsed.reason,
      context: { mode: record.mode, status: record.status, version: record.version }
    });
    return this.toDto(record);
  }

  async update(actor: ActorContext, id: string, input: RoutingRuleUpdate): Promise<RoutingRule> {
    this.assertPermission(actor, "routing_rules:update");
    const parsed = routingRuleUpdateSchema.parse(input);
    const existing = await this.repository.require(id);
    await this.requireCountry(actor, existing.countryId, existing.productId);
    const next = {
      mode: parsed.mode ?? existing.mode,
      maxRecipients: parsed.maxRecipients ?? existing.maxRecipients,
      status: parsed.status ?? existing.status,
      priorities: parsed.priorities ?? existing.priorities,
      exclusivePartnerTenantId: parsed.exclusivePartnerTenantId === undefined ? existing.exclusivePartnerTenantId : parsed.exclusivePartnerTenantId,
      description: parsed.description === undefined ? existing.description : parsed.description
    };
    await this.validateModeInputs(next);
    if (next.status === "active" && existing.status !== "active") {
      const active = await this.repository.findActive(existing.countryId, existing.productId);
      if (active && active.id !== existing.id) this.refuse(actor, "duplicate_active_rule", { countryId: existing.countryId, productId: existing.productId }, "conflict");
    }
    const previous = this.snapshot(existing);
    const update: Partial<RoutingRuleRecord> = { ...next, version: existing.version + 1, updatedAt: new Date() };
    const updated = await this.repository.update(id, update, this.historyEntry(id, "updated", previous, this.snapshot({ ...existing, ...update }), parsed.reason, actor));
    this.deps.audit.write({
      actor,
      action: RoutingAuditActions.ruleUpdated,
      targetType: "RoutingRule",
      targetId: id,
      scope: { countryId: existing.countryId, productId: existing.productId },
      result: "success",
      reason: parsed.reason,
      context: { mode: updated.mode, status: updated.status, version: updated.version }
    });
    return this.toDto(updated);
  }

  async history(actor: ActorContext, id: string): Promise<RoutingRuleHistoryResponse> {
    this.assertPermission(actor, "routing_rules:read");
    const rule = await this.repository.require(id);
    await this.requireCountry(actor, rule.countryId, rule.productId);
    const items = (await this.repository.historyFor(id)).map((entry) => this.toHistoryDto(entry));
    return { generatedAt: new Date().toISOString(), items, total: items.length };
  }

  private async validateModeInputs(rule: { mode: RoutingRuleRecord["mode"]; priorities: RoutingRuleRecord["priorities"]; exclusivePartnerTenantId: string | null }): Promise<void> {
    if (rule.mode === "priority" && rule.priorities.length === 0) throw new RoutingRuleValidationError("priorities_required");
    if (rule.mode === "exclusive" && !rule.exclusivePartnerTenantId) throw new RoutingRuleValidationError("exclusive_partner_required");
    const partnerIds = new Set(rule.priorities.map((entry) => entry.partnerTenantId));
    if (rule.exclusivePartnerTenantId) partnerIds.add(rule.exclusivePartnerTenantId);
    for (const partnerTenantId of partnerIds) {
      await this.deps.partners.require(partnerTenantId).catch(() => {
        throw new RoutingRuleValidationError("unknown_partner");
      });
    }
  }

  private async requireCountry(actor: ActorContext, countryId: string, productId: string | null): Promise<Country> {
    const country = await this.deps.countries.require(countryId).catch(() => {
      throw new RoutingRuleValidationError("unknown_country");
    });
    if (!this.scopeAllows(actor, country)) this.refuse(actor, "out_of_scope_country", { countryId, productId });
    return country;
  }

  private assertPermission(actor: ActorContext, permission: string): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required", {});
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuse(actor, "forbidden_role", {});
  }

  /** Admin Pays scopes are stored as country ids; ISO codes are tolerated for seeded actors. */
  private scopeAllows(actor: ActorContext, country: Country | undefined): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (!actor.countryScopes?.length) return true;
    if (!country) return false;
    return actor.countryScopes.includes(country.id) || actor.countryScopes.includes(country.isoCode);
  }

  private refuse(actor: ActorContext, reason: string, scope: Record<string, unknown>, kind: "access" | "conflict" = "access"): never {
    this.deps.audit.write({
      actor,
      action: RoutingAuditActions.ruleRefused,
      targetType: "RoutingRule",
      targetId: "access",
      scope: { ...scope, roles: actor.roles },
      result: "refused",
      reason,
      context: {}
    });
    if (kind === "conflict") throw new RoutingRuleConflictError(reason);
    throw new RoutingRuleAccessRefusedError(reason);
  }

  private historyEntry(routingRuleId: string, changeType: "created" | "updated", previousValue: unknown, nextValue: unknown, reason: string, actor: ActorContext): RoutingRuleHistoryRecord {
    return {
      id: crypto.randomUUID(),
      routingRuleId,
      changeType,
      previousValue,
      nextValue,
      reason,
      changedById: actor.actorId ?? null,
      changedAt: new Date()
    };
  }

  private snapshot(rule: RoutingRuleRecord): Record<string, unknown> {
    return {
      mode: rule.mode,
      maxRecipients: rule.maxRecipients,
      status: rule.status,
      priorities: rule.priorities,
      exclusivePartnerTenantId: rule.exclusivePartnerTenantId,
      description: rule.description,
      version: rule.version
    };
  }

  private toDto(rule: RoutingRuleRecord): RoutingRule {
    return {
      id: rule.id,
      countryId: rule.countryId,
      productId: rule.productId ?? null,
      mode: rule.mode,
      maxRecipients: rule.maxRecipients,
      status: rule.status,
      priorities: rule.priorities,
      exclusivePartnerTenantId: rule.exclusivePartnerTenantId ?? null,
      description: rule.description ?? null,
      version: rule.version,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      createdById: rule.createdById ?? null
    };
  }

  private toHistoryDto(entry: RoutingRuleHistoryRecord): RoutingRuleHistoryEntry {
    return {
      id: entry.id,
      routingRuleId: entry.routingRuleId,
      changeType: entry.changeType,
      previousValue: entry.previousValue ?? null,
      nextValue: entry.nextValue ?? null,
      reason: entry.reason,
      changedById: entry.changedById ?? null,
      changedAt: entry.changedAt.toISOString()
    };
  }
}
