import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { ActorContext } from "../common/types";
import { FeatureFlagCacheService } from "./feature-flag-cache.service";
import { MemoryFeatureFlagRepository, type FeatureFlagRepository } from "./feature-flag-repository";
import type { FlagRecord } from "./feature-flag-precedence.service";
import { evaluateFeatureFlagMutation, featureFlagMutationRefusedAction } from "./sensitive-feature-flag-policy";

export interface FeatureFlag extends FlagRecord {
  id: string;
  reason: string;
  changedAt: Date;
  changedById?: string;
  cacheVersion: number;
}

export interface FeatureFlagHistory {
  id: string;
  featureFlagId: string;
  previousValue: boolean;
  nextValue: boolean;
  reason: string;
  changedAt: Date;
}

export interface FeatureFlagMutationOptions {
  allowSensitiveDisable?: boolean;
}

export class FeatureFlagsService {
  private readonly flags: FeatureFlag[] = [];
  private readonly history: FeatureFlagHistory[] = [];

  constructor(
    private readonly audit: AuditLogWriter,
    private readonly cache?: FeatureFlagCacheService,
    private readonly repository: FeatureFlagRepository = new MemoryFeatureFlagRepository()
  ) {
    assertRuntimeRepository(this.repository.mode, "FeatureFlagRepository");
  }

  list(): FeatureFlag[] {
    return [...this.flags];
  }

  async hydrateFromRepository(): Promise<void> {
    const persisted = await this.repository.list();
    this.flags.splice(0, this.flags.length, ...persisted);
  }

  isEnabled(key: string, scopeType: FeatureFlag["scopeType"] = "global", scopeId?: string): boolean {
    return this.flags.find((flag) => flag.key === key && flag.scopeType === scopeType && flag.scopeId === scopeId)?.value ?? false;
  }

  async setFlag(input: Omit<FeatureFlag, "id" | "changedAt" | "cacheVersion">, actor: ActorContext, options: FeatureFlagMutationOptions = {}): Promise<FeatureFlag> {
    const existing = this.flags.find((flag) => flag.key === input.key && flag.scopeType === input.scopeType && flag.scopeId === input.scopeId);
    const mutationDecision = evaluateFeatureFlagMutation({
      key: input.key,
      scopeType: input.scopeType,
      ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      value: input.value,
      ...(options.allowSensitiveDisable ? { allowSensitiveDisable: true } : {})
    });
    if (!mutationDecision.allowed) {
      this.audit.write({
        actor,
        action: featureFlagMutationRefusedAction,
        targetType: "FeatureFlag",
        targetId: existing?.id ?? `${input.scopeType}:${input.scopeId ?? "global"}:${input.key}`,
        scope: { scopeType: input.scopeType, scopeId: input.scopeId },
        result: "refused",
        reason: mutationDecision.reason,
        context: {
          key: input.key,
          previousValue: existing?.value ?? false,
          requestedValue: input.value,
          policy: mutationDecision.policy
        }
      });
      throw new Error(mutationDecision.message);
    }
    return this.persist(input, actor, existing, "feature_flag.changed", {});
  }

  /**
   * Explicit compliance-policy path for sensitive flags (AI, regulated modules, billing, messaging).
   * Never exposed over HTTP: it is reserved for compliance-approved operations (ops scripts, seeds,
   * tests) and records the policy reference in the audit trail. Callers without a policy reference
   * are refused exactly like a regular mutation.
   */
  async applyCompliancePolicy(
    input: Omit<FeatureFlag, "id" | "changedAt" | "cacheVersion">,
    actor: ActorContext,
    policy: { reference: string; approvedBy: string }
  ): Promise<FeatureFlag> {
    const reference = policy.reference.trim();
    const approvedBy = policy.approvedBy.trim();
    if (!reference || !approvedBy) {
      throw new Error(`Forbidden feature flag mutation: ${input.key} requires explicit compliance policy approval`);
    }
    const existing = this.flags.find((flag) => flag.key === input.key && flag.scopeType === input.scopeType && flag.scopeId === input.scopeId);
    return this.persist(input, actor, existing, "feature_flag.policy_applied", { policyReference: reference, policyApprovedBy: approvedBy });
  }

  private async persist(
    input: Omit<FeatureFlag, "id" | "changedAt" | "cacheVersion">,
    actor: ActorContext,
    existing: FeatureFlag | undefined,
    auditAction: string,
    auditContext: Record<string, unknown>
  ): Promise<FeatureFlag> {
    const flag: FeatureFlag = existing ?? {
      id: crypto.randomUUID(),
      key: input.key,
      scopeType: input.scopeType,
      ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      value: false,
      reason: input.reason,
      changedAt: new Date(),
      cacheVersion: 0
    };
    const previousValue = flag.value;
    flag.value = input.value;
    flag.reason = input.reason;
    if (actor.actorId) flag.changedById = actor.actorId;
    flag.changedAt = new Date();
    flag.cacheVersion += 1;
    if (!existing) this.flags.push(flag);
    this.history.push({
      id: crypto.randomUUID(),
      featureFlagId: flag.id,
      previousValue,
      nextValue: flag.value,
      reason: flag.reason,
      changedAt: flag.changedAt
    });
    const history = this.history.at(-1);
    if (history) await this.repository.upsert(flag, history);
    await this.cache?.put(flag);
    this.audit.write({
      actor,
      action: auditAction,
      targetType: "FeatureFlag",
      targetId: flag.id,
      scope: { scopeType: flag.scopeType, scopeId: flag.scopeId },
      result: "success",
      reason: flag.reason,
      context: { key: flag.key, previousValue, nextValue: flag.value, ...auditContext }
    });
    return flag;
  }

  historyFor(featureFlagId: string): FeatureFlagHistory[] {
    return this.history.filter((entry) => entry.featureFlagId === featureFlagId);
  }
}

export class FeatureFlagsModule {
  readonly service: FeatureFlagsService;

  constructor(audit = new AuditLogWriter(), cache?: FeatureFlagCacheService, repository?: FeatureFlagRepository) {
    this.service = new FeatureFlagsService(audit, cache, repository);
  }
}
