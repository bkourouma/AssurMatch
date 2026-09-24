import {
  RETENTION_PREVIEW_TTL_HOURS,
  retentionBatchApproveRequestSchema,
  retentionErasurePreviewRequestSchema,
  retentionPolicyUpsertSchema,
  retentionPreviewRequestSchema,
  type RetentionBatch,
  type RetentionBatchApproveRequest,
  type RetentionBatchCount,
  type RetentionBatchListResponse,
  type RetentionCategory,
  type RetentionErasurePreviewRequest,
  type RetentionPoliciesResponse,
  type RetentionPolicyUpsert,
  type RetentionPreviewRequest,
  type RetentionSubjectKind
} from "../../../../packages/shared/contracts/data-retention.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { AnonymizationService, type EligibleTargets } from "./anonymization.service";
import { DataRetentionAuditActions } from "./data-retention-audit-actions";
import type { AnonymizationBatchRecord, DataRetentionRepository, RetentionCounts, RetentionTargets } from "./data-retention.repository";
import { ErasureLookupService } from "./erasure-lookup.service";
import { RetentionEligibilityService } from "./retention-eligibility.service";
import { assertRetentionDays, ERASURE_CATEGORIES, RETENTION_CATEGORIES, resolveRetentionPolicy, type RetentionPolicyRecord } from "./retention-policies";

const HOUR_MS = 60 * 60 * 1000;
const BATCH_LIST_LIMIT = 50;
const PURGE_FLAG = "retention_purge_enabled";

/** 403: missing MFA or permission. */
export class RetentionAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Retention access denied: ${reason}`);
    this.name = "RetentionAccessRefusedError";
  }
}

/** 422: executing a batch while `retention_purge_enabled` is off. */
export class RetentionPurgeDisabledError extends Error {
  constructor() {
    super(`Retention purge is disabled by the ${PURGE_FLAG} feature flag`);
    this.name = "RetentionPurgeDisabledError";
  }
}

/** 409: the batch is expired, already executed or refused. */
export class RetentionBatchConflictError extends Error {
  constructor(public readonly reason: string) {
    super(`Retention batch conflict: ${reason}`);
    this.name = "RetentionBatchConflictError";
  }
}

/** 404 */
export class RetentionBatchNotFoundError extends Error {
  constructor() {
    super("Retention batch not found");
    this.name = "RetentionBatchNotFoundError";
  }
}

export interface DataRetentionServiceDeps {
  audit: AuditLogWriter;
  repository: DataRetentionRepository;
  eligibility: RetentionEligibilityService;
  erasure: ErasureLookupService;
  anonymization: AnonymizationService;
  featureFlags: { isEnabled(key: string): boolean };
  /** Throws when the country does not exist (`CountriesService.require`). */
  requireCountry(countryId: string): Promise<unknown>;
  clock?: () => Date;
}

/**
 * Spec 046 facade: policies (FR-002/003), retention and erasure previews (FR-004/005), approval
 * (FR-006) and batch reads (FR-007). Every call requires MFA and `retention:read` or `retention:*`,
 * and every refusal is audited before being thrown (FR-011).
 */
export class DataRetentionService {
  constructor(private readonly deps: DataRetentionServiceDeps) {}

  async getPolicies(actor: ActorContext, countryId?: string): Promise<RetentionPoliciesResponse> {
    this.assertAccess(actor, "read", "RetentionPolicy");
    if (countryId) await this.deps.requireCountry(countryId);
    return this.policiesResponse(await this.deps.repository.listPolicies(), countryId);
  }

  async upsertPolicy(input: RetentionPolicyUpsert, actor: ActorContext): Promise<RetentionPoliciesResponse> {
    this.assertAccess(actor, "write", "RetentionPolicy");
    const parsed = retentionPolicyUpsertSchema.parse(input);
    const countryId = parsed.countryId ?? null;
    if (countryId) await this.deps.requireCountry(countryId);
    const policies = await this.deps.repository.listPolicies();
    const before = resolveRetentionPolicy(parsed.category, countryId, policies);
    const existing = policies.find((policy) => policy.countryId === countryId && policy.category === parsed.category);
    const now = this.now();
    let savedId = existing?.id ?? null;
    if (parsed.retentionDays === null) {
      await this.deps.repository.deletePolicy(countryId, parsed.category);
    } else {
      assertRetentionDays(parsed.retentionDays);
      const saved = await this.deps.repository.upsertPolicy({
        id: existing?.id ?? crypto.randomUUID(),
        countryId,
        category: parsed.category,
        retentionDays: parsed.retentionDays,
        reason: parsed.reason,
        updatedById: actor.actorId ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
      savedId = saved.id;
    }
    const after = await this.deps.repository.listPolicies();
    const next = resolveRetentionPolicy(parsed.category, countryId, after);
    this.deps.audit.write({
      actor,
      action: DataRetentionAuditActions.policyChanged,
      targetType: "RetentionPolicy",
      targetId: savedId ?? `${countryId ?? "global"}:${parsed.category}`,
      scope: { countryId, category: parsed.category },
      result: "success",
      reason: parsed.reason,
      context: {
        previous: { override: existing?.retentionDays ?? null, effective: before.retentionDays, source: before.source },
        next: { override: parsed.retentionDays, effective: next.retentionDays, source: next.source }
      }
    });
    return this.policiesResponse(after, countryId ?? undefined);
  }

  async previewRetention(input: RetentionPreviewRequest, actor: ActorContext): Promise<RetentionBatch> {
    this.assertAccess(actor, "write", "AnonymizationBatch");
    const parsed = retentionPreviewRequestSchema.parse(input);
    if (parsed.countryId) await this.deps.requireCountry(parsed.countryId);
    const categories = parsed.categories ? [...new Set(parsed.categories)] : [...RETENTION_CATEGORIES];
    const now = this.now();
    const result = await this.deps.eligibility.compute({ categories, countryId: parsed.countryId, policies: await this.deps.repository.listPolicies(), now });
    const counts: RetentionCounts = {};
    for (const category of categories) {
      const count = result.counts[category];
      counts[category] = { selected: count?.selected ?? 0, anonymized: 0, skipped: 0, failed: 0, moreRemaining: count?.moreRemaining ?? false };
    }
    return this.createPreview({ kind: "retention", countryId: parsed.countryId ?? null, categories, erasureLookup: null, reason: parsed.reason, targets: result.targets, counts, now }, actor);
  }

  async previewErasure(input: RetentionErasurePreviewRequest, actor: ActorContext): Promise<RetentionBatch> {
    this.assertAccess(actor, "write", "AnonymizationBatch");
    const parsed = retentionErasurePreviewRequestSchema.parse(input);
    const targets = await this.deps.erasure.resolve(parsed.email !== undefined ? { email: parsed.email } : { publicReference: parsed.publicReference ?? "" });
    const counts: RetentionCounts = {};
    for (const [kind, ids] of Object.entries(targets) as Array<[RetentionSubjectKind, string[]]>) {
      counts[kind] = { selected: ids.length, anonymized: 0, skipped: 0, failed: 0, moreRemaining: false };
    }
    return this.createPreview({
      kind: "erasure",
      countryId: null,
      categories: [...ERASURE_CATEGORIES],
      erasureLookup: parsed.email !== undefined ? "email" : "public_reference",
      reason: parsed.reason,
      targets,
      counts,
      now: this.now()
    }, actor);
  }

  async approve(batchId: string, input: RetentionBatchApproveRequest, actor: ActorContext): Promise<RetentionBatch> {
    this.assertAccess(actor, "write", "AnonymizationBatch");
    const parsed = retentionBatchApproveRequestSchema.parse(input);
    const batch = await this.deps.repository.findBatch(batchId);
    if (!batch) throw new RetentionBatchNotFoundError();
    const now = this.now();
    if (batch.status !== "previewed") this.refuseBatch(batch, actor, `batch_${batch.status}`, new RetentionBatchConflictError(`batch_${batch.status}`));
    if (batch.previewExpiresAt <= now) {
      await this.deps.repository.updateBatch(batch.id, { status: "expired" });
      this.refuseBatch(batch, actor, "batch_expired", new RetentionBatchConflictError("batch_expired"));
    }
    if (!this.deps.featureFlags.isEnabled(PURGE_FLAG)) {
      await this.deps.repository.updateBatch(batch.id, { status: "refused", approvedById: actor.actorId ?? null, approvalReason: parsed.reason });
      this.refuseBatch(batch, actor, "retention_purge_disabled", new RetentionPurgeDisabledError());
    }
    if (!await this.deps.repository.claimForApproval(batch.id, actor.actorId ?? null, parsed.reason, now)) {
      this.refuseBatch(batch, actor, "batch_already_approved", new RetentionBatchConflictError("batch_already_approved"));
    }
    this.deps.audit.write({
      actor,
      action: DataRetentionAuditActions.batchApproved,
      targetType: "AnonymizationBatch",
      targetId: batch.id,
      scope: { kind: batch.kind, countryId: batch.countryId },
      result: "success",
      reason: parsed.reason,
      context: { requestedById: batch.requestedById, sameActorAsRequester: batch.requestedById !== null && batch.requestedById === (actor.actorId ?? null) }
    });

    const counts = await this.deps.anonymization.execute(batch, await this.stillEligible(batch, now), actor, now);
    const executed = await this.deps.repository.updateBatch(batch.id, { status: "executed", counts, executedAt: this.now() });
    this.deps.audit.write({
      actor,
      action: DataRetentionAuditActions.batchExecuted,
      targetType: "AnonymizationBatch",
      targetId: batch.id,
      scope: { kind: batch.kind, countryId: batch.countryId },
      result: "success",
      context: { counts: this.auditCounts(counts) }
    });
    return this.toDto(executed, now);
  }

  async listBatches(actor: ActorContext): Promise<RetentionBatchListResponse> {
    this.assertAccess(actor, "read", "AnonymizationBatch");
    const now = this.now();
    return {
      purgeEnabled: this.deps.featureFlags.isEnabled(PURGE_FLAG),
      items: (await this.deps.repository.listBatches(BATCH_LIST_LIMIT)).map((batch) => this.toDto(batch, now))
    };
  }

  async getBatch(batchId: string, actor: ActorContext): Promise<RetentionBatch> {
    this.assertAccess(actor, "read", "AnonymizationBatch");
    const batch = await this.deps.repository.findBatch(batchId);
    if (!batch) throw new RetentionBatchNotFoundError();
    return this.toDto(batch, this.now());
  }

  private async createPreview(input: {
    kind: AnonymizationBatchRecord["kind"];
    countryId: string | null;
    categories: RetentionCategory[];
    erasureLookup: AnonymizationBatchRecord["erasureLookup"];
    reason: string;
    targets: RetentionTargets;
    counts: RetentionCounts;
    now: Date;
  }, actor: ActorContext): Promise<RetentionBatch> {
    const batch = await this.deps.repository.createBatch({
      id: crypto.randomUUID(),
      kind: input.kind,
      status: "previewed",
      countryId: input.countryId,
      categories: input.categories,
      erasureLookup: input.erasureLookup,
      reason: input.reason,
      requestedById: actor.actorId ?? null,
      approvedById: null,
      approvalReason: null,
      targets: input.targets,
      counts: input.counts,
      previewExpiresAt: new Date(input.now.getTime() + RETENTION_PREVIEW_TTL_HOURS * HOUR_MS),
      approvedAt: null,
      executedAt: null,
      createdAt: input.now,
      updatedAt: input.now
    });
    // Counts and the lookup kind only: never the e-mail, the reference looked up or a fingerprint.
    this.deps.audit.write({
      actor,
      action: DataRetentionAuditActions.batchPreviewed,
      targetType: "AnonymizationBatch",
      targetId: batch.id,
      scope: { kind: batch.kind, countryId: batch.countryId },
      result: "success",
      reason: input.reason,
      context: { categories: batch.categories, erasureLookup: batch.erasureLookup, counts: this.auditCounts(batch.counts), purgeEnabled: this.deps.featureFlags.isEnabled(PURGE_FLAG) }
    });
    return this.toDto(batch, input.now);
  }

  /** D2: a retention batch re-checks each frozen row against today's policies; an erasure batch only skips rows anonymized since. */
  private async stillEligible(batch: AnonymizationBatchRecord, now: Date): Promise<EligibleTargets> {
    const eligible: EligibleTargets = {};
    if (batch.kind === "erasure") {
      for (const category of ERASURE_CATEGORIES) {
        const ids = batch.targets[category] ?? [];
        if (ids.length > 0) eligible[category] = await this.deps.eligibility.stillPresent(category, ids, now);
      }
      return eligible;
    }
    const policies = await this.deps.repository.listPolicies();
    for (const category of batch.categories) {
      eligible[category] = await this.deps.eligibility.stillEligible(category, batch.targets[category] ?? [], { countryId: batch.countryId ?? undefined, policies, now });
    }
    return eligible;
  }

  private policiesResponse(policies: readonly RetentionPolicyRecord[], countryId?: string): RetentionPoliciesResponse {
    return {
      countryId: countryId ?? null,
      purgeEnabled: this.deps.featureFlags.isEnabled(PURGE_FLAG),
      items: RETENTION_CATEGORIES.map((category) => {
        const effective = resolveRetentionPolicy(category, countryId ?? null, policies);
        const override = effective.countryOverride ?? effective.globalOverride;
        return {
          category,
          retentionDays: effective.retentionDays,
          source: effective.source,
          anchor: effective.anchor,
          defaultRetentionDays: effective.defaultRetentionDays,
          globalRetentionDays: effective.globalOverride?.retentionDays ?? null,
          countryRetentionDays: effective.countryOverride?.retentionDays ?? null,
          overrideReason: override?.reason ?? null,
          overrideUpdatedAt: override?.updatedAt.toISOString() ?? null
        };
      })
    };
  }

  private toDto(batch: AnonymizationBatchRecord, now: Date): RetentionBatch {
    const counts: RetentionBatchCount[] = (Object.entries(batch.counts) as Array<[RetentionSubjectKind, NonNullable<RetentionCounts[RetentionSubjectKind]>]>)
      .map(([subject, count]) => ({ subject, ...count }));
    return {
      id: batch.id,
      kind: batch.kind,
      // A preview past its 24 h window reads as expired even before an approval attempt persists it.
      status: batch.status === "previewed" && batch.previewExpiresAt <= now ? "expired" : batch.status,
      countryId: batch.countryId,
      categories: batch.categories,
      erasureLookup: batch.erasureLookup,
      reason: batch.reason,
      requestedById: batch.requestedById,
      approvedById: batch.approvedById,
      approvalReason: batch.approvalReason,
      counts,
      totalSelected: counts.reduce((sum, count) => sum + count.selected, 0),
      moreRemaining: counts.some((count) => count.moreRemaining),
      previewExpiresAt: batch.previewExpiresAt.toISOString(),
      approvedAt: batch.approvedAt?.toISOString() ?? null,
      executedAt: batch.executedAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString()
    };
  }

  private auditCounts(counts: RetentionCounts): Record<string, unknown> {
    return Object.fromEntries(Object.entries(counts).map(([kind, count]) => [kind, { ...count }]));
  }

  private assertAccess(actor: ActorContext, mode: "read" | "write", targetType: string): void {
    if (actor.mfaVerified !== true) this.refuseAccess(actor, "mfa_required", targetType);
    const permission = mode === "write" ? "retention:*" : "retention:read";
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuseAccess(actor, "forbidden_role", targetType);
  }

  private refuseAccess(actor: ActorContext, reason: string, targetType: string): never {
    this.deps.audit.write({
      actor,
      action: DataRetentionAuditActions.accessRefused,
      targetType,
      targetId: "retention",
      scope: { roles: actor.roles },
      result: "refused",
      reason
    });
    throw new RetentionAccessRefusedError(reason);
  }

  private refuseBatch(batch: AnonymizationBatchRecord, actor: ActorContext, reason: string, error: Error): never {
    this.deps.audit.write({
      actor,
      action: DataRetentionAuditActions.batchRefused,
      targetType: "AnonymizationBatch",
      targetId: batch.id,
      scope: { kind: batch.kind, countryId: batch.countryId },
      result: "refused",
      reason,
      context: { status: batch.status, purgeEnabled: this.deps.featureFlags.isEnabled(PURGE_FLAG) }
    });
    throw error;
  }

  private now(): Date {
    return this.deps.clock ? this.deps.clock() : new Date();
  }
}
