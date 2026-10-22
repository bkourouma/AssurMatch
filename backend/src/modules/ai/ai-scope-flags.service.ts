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
  sensitiveProductRequiresException: "SENSITIVE_PRODUCT_AI_REQUIRES_EXCEPTION",
  activationViaOpsOnly: "ACTIVATION_VIA_OPS_ONLY"
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
 * flags (HTTP: disable only; activation: operations command). The catalogue toggles refuse these keys by design; this service writes the source read by
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

  /**
   * HTTP path (spec 074, supervisor decision pending the owner's arbitration on a derogation to
   * specs 035 and 050): DISABLE only. Any activation request is refused and audited with
   * `ACTIVATION_VIA_OPS_ONLY`; activation goes through `activateViaOps` (npm run ops:apply-flag-policy).
   */
  async apply(actor: ActorContext, input: AiScopeFlagChangeInput): Promise<AiScopeFlagChangeResult> {
    const dto = aiScopeFlagChangeSchema.parse(input);
    const refuse = this.refuser(actor, dto);

    if (!actor.mfaVerified) refuse(AiScopeFlagErrorCodes.mfaRequired, "MFA is required to change an AI flag");
    if (dto.value) refuse(AiScopeFlagErrorCodes.activationViaOpsOnly, "ACTIVATION_VIA_OPS_ONLY: AI flag activation is not available over HTTP, use the audited operations command (npm run ops:apply-flag-policy)");
    if (!actor.roles.some((role) => role === "super_admin" || role === "compliance_admin" || role === "ai_admin")) refuse(AiScopeFlagErrorCodes.rbacDenied, "RBAC denied");

    if (dto.scopeType === "country") {
      if (!this.countryVisible(actor, dto.scopeId)) refuse(AiScopeFlagErrorCodes.rbacDenied, "Country outside the actor scope");
    } else if (!this.productVisible(actor, dto.scopeId)) {
      refuse(AiScopeFlagErrorCodes.rbacDenied, "Product outside the actor scope");
    }
    return this.write(actor, dto, RAPID_DISABLE_REFERENCE, actor.actorId || "admin");
  }

  /**
   * Operations path (never routed over HTTP): the compliance activation of a per-country or
   * per-product AI flag, called by `npm run ops:apply-flag-policy` with a policy reference and an
   * approver. A highly sensitive product still refuses AI activation (spec 074 FR-003).
   */
  async activateViaOps(actor: ActorContext, input: AiScopeFlagChangeInput): Promise<AiScopeFlagChangeResult> {
    const dto = aiScopeFlagChangeSchema.parse(input);
    const refuse = this.refuser(actor, dto);
    if (!actor.mfaVerified) refuse(AiScopeFlagErrorCodes.mfaRequired, "MFA is required to change an AI flag");
    if (!actor.roles.some((role) => role === "super_admin" || role === "compliance_admin")) refuse(AiScopeFlagErrorCodes.rbacDenied, "AI flag activation is reserved to compliance");
    const reference = dto.reference?.trim();
    const approvedBy = dto.approvedBy?.trim();
    if (dto.value && (!reference || !approvedBy)) refuse(AiScopeFlagErrorCodes.policyReferenceRequired, "AI flag activation requires a policy reference and an approver");
    if (dto.scopeType === "country") {
      if (!this.countryVisible(actor, dto.scopeId)) refuse(AiScopeFlagErrorCodes.rbacDenied, "Country outside the actor scope");
    } else if (dto.value && (actor.productScopes?.length || actor.countryScopes?.length)) {
      refuse(AiScopeFlagErrorCodes.rbacDenied, "A scoped actor cannot activate a global product AI flag");
    } else if (!this.productVisible(actor, dto.scopeId)) {
      refuse(AiScopeFlagErrorCodes.rbacDenied, "Product outside the actor scope");
    }
    return this.write(actor, dto, reference || RAPID_DISABLE_REFERENCE, approvedBy || actor.actorId || "admin");
  }

  private refuser(actor: ActorContext, dto: AiScopeFlagChangeDto) {
    return (code: string, message: string, status: "forbidden" | "unprocessable" = "forbidden"): never => {
      this.auditRefusal(actor, dto, code);
      if (status === "unprocessable") throw catalogUnprocessable(code, message);
      throw catalogForbidden(message, code);
    };
  }

  private async write(
    actor: ActorContext,
    dto: AiScopeFlagChangeDto,
    reference: string,
    approvedBy: string
  ): Promise<AiScopeFlagChangeResult> {
    const refuse = this.refuser(actor, dto);
    const { scopeType, scopeId, key, value, reason } = dto;
    // Existence is checked through the catalogue services (not found -> 404).
    const target = scopeType === "country" ? await this.deps.countries.require(scopeId) : await this.deps.products.require(scopeId);
    if (scopeType === "product" && value && (target as { sensitivity?: string }).sensitivity === "highly_sensitive") {
      refuse(AiScopeFlagErrorCodes.sensitiveProductRequiresException, "SENSITIVE_PRODUCT_AI_REQUIRES_EXCEPTION: AI cannot be activated on a highly sensitive product without a dedicated exception", "unprocessable");
    }

    const flags = target.flags as unknown as Record<string, boolean | undefined>;
    const previousValue = flags[key] === true;
    if (previousValue === value) return { scopeType, scopeId, key, previousValue, value, appliedAt: new Date().toISOString() };

    const writeScopeFlag = (next: boolean) =>
      scopeType === "country"
        ? this.deps.countries.writeFlag(scopeId, key as "country_ai_enabled", next)
        : this.deps.products.writeFlag(scopeId, key as "product_ai_scoring_enabled" | "product_ai_form_assistant_enabled", next);

    await writeScopeFlag(value);
    let row;
    try {
      row = await this.deps.featureFlags.applyCompliancePolicy({ key, scopeType, scopeId, value, reason }, actor, { reference, approvedBy });
    } catch (error) {
      // Never leave a changed flag without its audit trail: restore the previous value.
      await writeScopeFlag(previousValue).catch(() => undefined);
      throw error;
    }
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
    return !actor.countryScopes?.length || actor.countryScopes.includes(countryId);
  }

  private productVisible(actor: ActorContext, productId: string): boolean {
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
