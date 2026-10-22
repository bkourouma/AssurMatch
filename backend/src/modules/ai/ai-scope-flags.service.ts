import {
  AI_GLOBAL_FLAG_KEYS,
  AI_SCOPE_FLAG_KEYS,
  aiScopeFlagChangeSchema,
  type AiScopeFlagChangeDto,
  type AiScopeFlagChangeInput,
  type AiScopeFlagChangeResult,
  type AiScopeFlagsOverview,
  type AiScopeType
} from "../../../../packages/shared/contracts/ai-scope-flags.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { CatalogErrorCodes, catalogForbidden, catalogUnprocessable } from "../catalog/catalog-errors";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import { featureFlagMutationRefusedAction } from "../feature-flags/sensitive-feature-flag-policy";
import type { ProductsService } from "../products/products.module";

export const AiScopeFlagErrorCodes = {
  mfaRequired: "MFA_REQUIRED",
  rbacDenied: CatalogErrorCodes.rbacDenied,
  policyReferenceRequired: "POLICY_REFERENCE_REQUIRED",
  sensitiveProductRequiresException: "SENSITIVE_PRODUCT_AI_REQUIRES_EXCEPTION"
} as const;

const HISTORY_LIMIT = 30;
const RAPID_DISABLE_REFERENCE = "rapid-disable";

export interface AiScopeFlagPolicyDeps {
  audit: AuditLogWriter;
  countries: CountriesService;
  products: ProductsService;
  featureFlags: FeatureFlagsService;
  /** Called after every successful change so cached public reads drop at once. */
  onChanged?: () => Promise<void> | void;
  /** Overrides the global AI flags listed by `overview` (defaults to the six platform AI flags). */
  globalAiFlagKeys?: readonly string[];
}

/**
 * Lot 7 / spec 074: the audited and protected path that changes the per-country and per-product AI
 * flags. The catalogue toggles refuse these keys by design; this service writes the source read by
 * the public journey, then records the change through the compliance-policy path of the flags
 * service (audit `feature_flag.policy_applied`). Every refusal is audited (`feature_flag.change_refused`).
 */
export class AiScopeFlagPolicyService {
  constructor(private readonly deps: AiScopeFlagPolicyDeps) {}

  async overview(actor: ActorContext): Promise<AiScopeFlagsOverview> {
    this.assertReadable(actor);
    const { featureFlags } = this.deps;
    const countries = (await this.deps.countries.listAdmin()).filter((country) => this.countryVisible(actor, country.id));
    const products = (await this.deps.products.listAdmin()).filter((product) => this.productVisible(actor, product.id));
    const countryIds = new Set(countries.map((country) => country.id));
    const productIds = new Set(products.map((product) => product.id));
    const history = featureFlags
      .list()
      .filter((flag) => (AI_SCOPE_FLAG_KEYS as readonly string[]).includes(flag.key))
      .filter((flag) => (flag.scopeType === "country" && flag.scopeId && countryIds.has(flag.scopeId)) || (flag.scopeType === "product" && flag.scopeId && productIds.has(flag.scopeId)))
      .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
      .slice(0, HISTORY_LIMIT)
      .map((flag) => ({
        key: flag.key,
        scopeType: flag.scopeType as AiScopeType,
        scopeId: flag.scopeId as string,
        value: flag.value,
        reason: flag.reason,
        changedAt: flag.changedAt.toISOString()
      }));
    return {
      generatedAt: new Date().toISOString(),
      globalFlags: (this.deps.globalAiFlagKeys ?? AI_GLOBAL_FLAG_KEYS).map((key) => ({ key, value: featureFlags.isEnabled(key) })),
      countries: countries.map((country) => ({
        id: country.id,
        code: country.isoCode,
        name: country.name,
        flags: { country_ai_enabled: country.flags.country_ai_enabled === true }
      })),
      products: products.map((product) => ({
        id: product.id,
        key: product.key,
        name: product.name,
        sensitivity: product.sensitivity,
        flags: {
          product_ai_scoring_enabled: product.flags.product_ai_scoring_enabled === true,
          product_ai_form_assistant_enabled: product.flags.product_ai_form_assistant_enabled === true
        }
      })),
      history
    };
  }

  async apply(actor: ActorContext, input: AiScopeFlagChangeInput): Promise<AiScopeFlagChangeResult> {
    const dto = aiScopeFlagChangeSchema.parse(input);
    const { scopeType, scopeId, key, value } = dto;
    const reason = dto.reason;
    const refuse = (code: string, message: string, status: "forbidden" | "unprocessable" = "forbidden"): never => {
      this.auditRefusal(actor, dto, code);
      if (status === "unprocessable") throw catalogUnprocessable(code, message);
      throw catalogForbidden(message, code);
    };

    if (!actor.mfaVerified) refuse(AiScopeFlagErrorCodes.mfaRequired, "MFA is required to change an AI flag");

    const isCompliance = actor.roles.includes("super_admin") || actor.roles.includes("compliance_admin");
    const canDisable = isCompliance || actor.roles.includes("ai_admin");
    if (value ? !isCompliance : !canDisable) {
      refuse(AiScopeFlagErrorCodes.rbacDenied, value ? "AI flag activation is reserved to compliance" : "RBAC denied");
    }

    const reference = dto.reference?.trim();
    const approvedBy = dto.approvedBy?.trim();
    if (value && (!reference || !approvedBy)) {
      refuse(AiScopeFlagErrorCodes.policyReferenceRequired, "AI flag activation requires a policy reference and an approver");
    }

    if (scopeType === "country") {
      if (!this.countryVisible(actor, scopeId)) refuse(AiScopeFlagErrorCodes.rbacDenied, "Country outside the actor scope");
    } else if (value) {
      // A product flag reaches every country: a restricted actor cannot activate it.
      if (actor.productScopes?.length || actor.countryScopes?.length) refuse(AiScopeFlagErrorCodes.rbacDenied, "A scoped actor cannot activate a global product AI flag");
    } else if (!this.productVisible(actor, scopeId)) {
      refuse(AiScopeFlagErrorCodes.rbacDenied, "Product outside the actor scope");
    }

    // Existence is checked through the catalogue services (not found -> 404).
    const target = scopeType === "country" ? await this.deps.countries.require(scopeId) : await this.deps.products.require(scopeId);
    if (scopeType === "product" && value && (target as { sensitivity?: string }).sensitivity === "highly_sensitive") {
      refuse(AiScopeFlagErrorCodes.sensitiveProductRequiresException, "AI cannot be activated on a highly sensitive product without a dedicated exception", "unprocessable");
    }

    const flags = target.flags as unknown as Record<string, boolean | undefined>;
    const previousValue = flags[key] === true;
    if (previousValue === value) return { scopeType, scopeId, key, previousValue, value, appliedAt: new Date().toISOString() };

    if (scopeType === "country") await this.deps.countries.writeFlag(scopeId, key as "country_ai_enabled", value);
    else await this.deps.products.writeFlag(scopeId, key as "product_ai_scoring_enabled" | "product_ai_form_assistant_enabled", value);

    const row = await this.deps.featureFlags.applyCompliancePolicy(
      { key, scopeType, scopeId, value, reason },
      actor,
      { reference: reference || RAPID_DISABLE_REFERENCE, approvedBy: approvedBy || actor.actorId || "admin" }
    );
    await this.deps.onChanged?.();
    return { scopeType, scopeId, key, previousValue, value, appliedAt: row.changedAt.toISOString() };
  }

  private assertReadable(actor: ActorContext): void {
    const deny = (code: string, message: string): never => {
      this.deps.audit.write({
        actor,
        action: featureFlagMutationRefusedAction,
        targetType: "AiScopeFlags",
        targetId: "overview",
        result: "refused",
        reason: code,
        context: { operation: "read" }
      });
      throw catalogForbidden(message, code);
    };
    if (!actor.mfaVerified) deny(AiScopeFlagErrorCodes.mfaRequired, "MFA is required to read AI flags");
    const allowed = actor.roles.some((role) => role === "compliance_admin" || roleHasPermission(role, "ai:read") || roleHasPermission(role, "feature_flags:read"));
    if (!allowed) deny(AiScopeFlagErrorCodes.rbacDenied, "RBAC denied");
  }

  private countryVisible(actor: ActorContext, countryId: string): boolean {
    if (actor.roles.includes("super_admin") || actor.roles.includes("compliance_admin")) return true;
    return !actor.countryScopes?.length || actor.countryScopes.includes(countryId);
  }

  private productVisible(actor: ActorContext, productId: string): boolean {
    if (actor.roles.includes("super_admin") || actor.roles.includes("compliance_admin")) return true;
    return !actor.productScopes?.length || actor.productScopes.includes(productId);
  }

  private auditRefusal(actor: ActorContext, dto: AiScopeFlagChangeDto, code: string): void {
    this.deps.audit.write({
      actor,
      action: featureFlagMutationRefusedAction,
      targetType: "FeatureFlag",
      targetId: `${dto.scopeType}:${dto.scopeId}:${dto.key}`,
      scope: { scopeType: dto.scopeType, scopeId: dto.scopeId },
      result: "refused",
      reason: code,
      context: { key: dto.key, requestedValue: dto.value, scopeType: dto.scopeType }
    });
  }
}
