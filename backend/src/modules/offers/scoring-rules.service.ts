import type { ScoringRule, ScoringRuleCreate, ScoringRuleUpdate, ScoringRulesResponse, ScoringWeights } from "../../../../packages/shared/contracts/scoring-rule.contracts";
import { DEFAULT_SCORING_WEIGHTS, scoringRuleCreateSchema, scoringRuleUpdateSchema } from "../../../../packages/shared/contracts/scoring-rule.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService, Country } from "../countries/countries.module";
import type { ProductsService } from "../products/products.module";
import { MemoryScoringRulesRepository, type ScoringRuleRecord, type ScoringRulesRepository } from "./scoring-rules.repository";

export const ScoringAuditActions = {
  ruleCreated: "scoring_rule.created",
  ruleUpdated: "scoring_rule.updated",
  ruleRefused: "scoring_rule.refused"
} as const;

export class ScoringRuleAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Scoring rule access denied: ${reason}`);
    this.name = "ScoringRuleAccessRefusedError";
  }
}

export class ScoringRuleConflictError extends Error {
  constructor(public readonly reason: string) {
    super(`Scoring rule conflict: ${reason}`);
    this.name = "ScoringRuleConflictError";
  }
}

export interface ScoringRulesDeps {
  audit: AuditLogWriter;
  countries: CountriesService;
  products: ProductsService;
  repository?: ScoringRulesRepository;
}

/**
 * Admin-configurable comparator weights (PRD §15). The score stays indicative and explainable;
 * rules only rebalance criteria and never touch eligibility or visibility.
 */
export class ScoringRulesService {
  private readonly repository: ScoringRulesRepository;

  constructor(private readonly deps: ScoringRulesDeps) {
    this.repository = deps.repository ?? new MemoryScoringRulesRepository();
  }

  /** Precedence: (country, product) > (country, all) > (all, product) > (all, all) > PRD defaults. */
  async resolveWeights(countryId: string, productId: string): Promise<ScoringWeights> {
    const rule = await this.repository.findActive(countryId, productId)
      ?? await this.repository.findActive(countryId, null)
      ?? await this.repository.findActive(null, productId)
      ?? await this.repository.findActive(null, null);
    return rule?.weights ?? { ...DEFAULT_SCORING_WEIGHTS };
  }

  async list(actor: ActorContext): Promise<ScoringRulesResponse> {
    this.assertPermission(actor, "offers:read");
    const countries = await this.deps.countries.listAdmin();
    const items = (await this.repository.list())
      .filter((rule) => this.scopeAllows(actor, rule.countryId, countries))
      .map((rule) => this.toDto(rule));
    return { generatedAt: new Date().toISOString(), defaults: { ...DEFAULT_SCORING_WEIGHTS }, items, total: items.length };
  }

  async create(actor: ActorContext, input: ScoringRuleCreate): Promise<ScoringRule> {
    this.assertPermission(actor, "offers:update");
    const parsed = scoringRuleCreateSchema.parse(input);
    const countryId = parsed.countryId ?? null;
    const productId = parsed.productId ?? null;
    const countries = await this.deps.countries.listAdmin();
    if (countryId && !countries.some((country) => country.id === countryId)) throw new Error("Invalid scoring rule: unknown_country");
    if (productId) await this.deps.products.require(productId).catch(() => { throw new Error("Invalid scoring rule: unknown_product"); });
    if (!this.scopeAllows(actor, countryId, countries)) this.refuse(actor, "out_of_scope_country", { countryId, productId });
    if (await this.repository.findActive(countryId, productId)) this.refuse(actor, "duplicate_active_rule", { countryId, productId }, "conflict");
    const now = new Date();
    const record: ScoringRuleRecord = {
      id: crypto.randomUUID(),
      countryId,
      productId,
      weights: parsed.weights,
      status: "active",
      description: parsed.description ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdById: actor.actorId ?? null
    };
    await this.repository.create(record);
    this.deps.audit.write({
      actor,
      action: ScoringAuditActions.ruleCreated,
      targetType: "ScoringRule",
      targetId: record.id,
      scope: { countryId, productId },
      result: "success",
      reason: parsed.reason,
      context: { weights: record.weights, version: record.version }
    });
    return this.toDto(record);
  }

  async update(actor: ActorContext, id: string, input: ScoringRuleUpdate): Promise<ScoringRule> {
    this.assertPermission(actor, "offers:update");
    const parsed = scoringRuleUpdateSchema.parse(input);
    const existing = await this.repository.require(id);
    const countries = await this.deps.countries.listAdmin();
    if (!this.scopeAllows(actor, existing.countryId, countries)) this.refuse(actor, "out_of_scope_country", { countryId: existing.countryId, productId: existing.productId });
    const nextStatus = parsed.status ?? existing.status;
    if (nextStatus === "active" && existing.status !== "active") {
      const active = await this.repository.findActive(existing.countryId, existing.productId);
      if (active && active.id !== id) this.refuse(actor, "duplicate_active_rule", { countryId: existing.countryId, productId: existing.productId }, "conflict");
    }
    const updated = await this.repository.update(id, {
      ...(parsed.weights ? { weights: parsed.weights } : {}),
      status: nextStatus,
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      version: existing.version + 1,
      updatedAt: new Date()
    });
    this.deps.audit.write({
      actor,
      action: ScoringAuditActions.ruleUpdated,
      targetType: "ScoringRule",
      targetId: id,
      scope: { countryId: existing.countryId, productId: existing.productId },
      result: "success",
      reason: parsed.reason,
      context: { weights: updated.weights, status: updated.status, version: updated.version, previousWeights: existing.weights }
    });
    return this.toDto(updated);
  }

  private assertPermission(actor: ActorContext, permission: string): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required", {});
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuse(actor, "forbidden_role", {});
  }

  /** Global rules (no country) need an unscoped admin; scoped Admin Pays may only touch their countries. */
  private scopeAllows(actor: ActorContext, countryId: string | null, countries: Country[]): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (!actor.countryScopes?.length) return true;
    if (!countryId) return false;
    const country = countries.find((candidate) => candidate.id === countryId);
    return actor.countryScopes.includes(countryId) || (country !== undefined && actor.countryScopes.includes(country.isoCode));
  }

  private refuse(actor: ActorContext, reason: string, scope: Record<string, unknown>, kind: "access" | "conflict" = "access"): never {
    this.deps.audit.write({
      actor,
      action: ScoringAuditActions.ruleRefused,
      targetType: "ScoringRule",
      targetId: "access",
      scope: { ...scope, roles: actor.roles },
      result: "refused",
      reason,
      context: {}
    });
    if (kind === "conflict") throw new ScoringRuleConflictError(reason);
    throw new ScoringRuleAccessRefusedError(reason);
  }

  private toDto(rule: ScoringRuleRecord): ScoringRule {
    return {
      id: rule.id,
      countryId: rule.countryId,
      productId: rule.productId,
      weights: rule.weights,
      status: rule.status,
      description: rule.description,
      version: rule.version,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      createdById: rule.createdById
    };
  }
}
