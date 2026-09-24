import { createHash } from "node:crypto";
import type { AiAssistTypeCatalog, AiInteraction, AiSurface } from "../../../../../packages/shared/contracts/ai.contracts";
import { AI_ASSISTANCE_DISCLAIMER, aiLeadClassificationSchema, aiLeadScoreSchema } from "../../../../../packages/shared/contracts/ai.contracts";
import type { AuditLogWriter } from "../../audit-logs/audit-log-writer.service";
import type { QueuePort } from "../../common/queues/queues.module";
import type { RedisClientPort } from "../../common/redis/redis.module";
import type { ActorContext } from "../../common/types";
import type { FeatureFlagsService } from "../../feature-flags/feature-flags.module";
import { AiAuditActions } from "./ai-audit-actions";
import { AiGuardrails } from "./ai-guardrails";
import { MemoryAiInteractionsRepository, type AiInteractionRecord, type AiInteractionsRepository } from "./ai-interactions.repository";
import { AiPromptLibrary } from "./ai-prompts";
import type { AiProviderPort } from "./ai-provider.port";
import { PiiMinimizer } from "./pii-minimizer";

export type PartnerPlan = "starter" | "pro" | "enterprise";

export interface AiGatewayScope {
  countryId?: string | undefined;
  countryFlags?: Partial<Record<string, boolean>> | undefined;
  productId?: string | undefined;
  productFlags?: Partial<Record<string, boolean>> | undefined;
  partnerTenantId?: string | undefined;
  plan?: PartnerPlan | undefined;
}

export interface AiGatewayRequest {
  assistType: AiAssistTypeCatalog;
  surface: AiSurface;
  actor: ActorContext;
  input: Record<string, unknown>;
  language?: "fr" | "en" | undefined;
  target?: { type: string; id: string } | undefined;
  scope: AiGatewayScope;
  /** Quota bucket owner: hashed visitor IP, partner tenant id or admin actor id. */
  quotaKey: string;
}

export interface AiGatewayDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  provider: AiProviderPort;
  fallbackProvider: AiProviderPort;
  queue: QueuePort;
  redis: RedisClientPort;
  repository?: AiInteractionsRepository | undefined;
  /** Process queued interactions right after the response (runtime); tests call processPending(). */
  autoProcess?: boolean | undefined;
  quotas?: Partial<Record<AiSurface, number>> | undefined;
}

export class AiAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`AI assistance access denied: ${reason}`);
    this.name = "AiAccessRefusedError";
  }
}

export class AiQuotaExceededError extends Error {
  constructor() {
    super("Rate limit exceeded for AI assistance quota");
    this.name = "AiQuotaExceededError";
  }
}

const GLOBAL_FLAG_BY_ASSIST: Record<AiAssistTypeCatalog, string> = {
  visitor_product_assistant: "ai_recommendation_enabled",
  visitor_faq: "ai_recommendation_enabled",
  visitor_request_summary: "ai_summary_enabled",
  visitor_form_help: "ai_summary_enabled",
  visitor_consistency_check: "ai_summary_enabled",
  lead_summary: "ai_broker_assistant_enabled",
  next_action: "ai_broker_assistant_enabled",
  relaunch_message: "ai_broker_assistant_enabled",
  loss_analysis: "ai_broker_assistant_enabled",
  lead_score: "ai_lead_scoring_enabled",
  lead_classification: "ai_lead_scoring_enabled",
  duplicate_hint: "ai_duplicate_detection_enabled",
  admin_risk_triage: "ai_summary_enabled",
  activation_gap_summary: "ai_summary_enabled",
  offer_consistency_check: "ai_summary_enabled",
  activity_report: "ai_summary_enabled",
  suspicious_leads: "ai_summary_enabled"
};

const ENTERPRISE_ONLY: ReadonlySet<AiAssistTypeCatalog> = new Set(["loss_analysis"]);
const JSON_SCHEMAS: Partial<Record<AiAssistTypeCatalog, (value: unknown) => unknown>> = {
  lead_score: (value) => aiLeadScoreSchema.parse(value),
  lead_classification: (value) => aiLeadClassificationSchema.parse(value)
};
const DEFAULT_QUOTAS: Record<AiSurface, number> = { visitor: 40, broker_crm: 200, admin_platform: 300 };
const ASSISTANCE_LABEL = "Assistance IA d'aide a la comprehension";
export const AI_PARTNER_OPT_OUT_FLAG = "ai_partner_opt_out";

/**
 * The single entry point for every model call (Constitution V). Flags -> quota -> minimisation ->
 * prompt -> provider (with deterministic fallback) -> guardrails -> persistence -> audit. Prompt and
 * output text never reach the audit log; the interaction row keeps hashes and the visible output.
 */
export class AiGateway {
  private readonly repository: AiInteractionsRepository;
  private readonly minimizer = new PiiMinimizer();
  private readonly guardrails = new AiGuardrails();
  private readonly prompts = new AiPromptLibrary();

  constructor(private readonly deps: AiGatewayDeps) {
    this.repository = deps.repository ?? new MemoryAiInteractionsRepository();
  }

  /** Whether an assist type could run for the given scope (used by status endpoints and UIs). */
  isEnabled(assistType: AiAssistTypeCatalog, scope: AiGatewayScope): { enabled: boolean; reasons: string[] } {
    const reasons: string[] = [];
    if (!this.deps.featureFlags.isEnabled(GLOBAL_FLAG_BY_ASSIST[assistType])) reasons.push(`${GLOBAL_FLAG_BY_ASSIST[assistType]}_off`);
    if (scope.countryFlags && scope.countryFlags.country_ai_enabled !== true) reasons.push("country_ai_disabled");
    if (scope.productFlags && assistType.startsWith("visitor_") && scope.productFlags.product_ai_form_assistant_enabled !== true) reasons.push("product_ai_form_assistant_disabled");
    if (scope.productFlags && (assistType === "lead_score" || assistType === "lead_classification") && scope.productFlags.product_ai_scoring_enabled !== true) reasons.push("product_ai_scoring_disabled");
    if (scope.partnerTenantId && this.deps.featureFlags.isEnabled(AI_PARTNER_OPT_OUT_FLAG, "partner", scope.partnerTenantId)) reasons.push("partner_opted_out");
    if (scope.plan === "starter") reasons.push("plan_starter_excluded");
    if (ENTERPRISE_ONLY.has(assistType) && scope.plan !== "enterprise" && scope.plan !== undefined) reasons.push("plan_enterprise_required");
    return { enabled: reasons.length === 0, reasons };
  }

  providerName(): string {
    return this.deps.provider.name;
  }

  async run(request: AiGatewayRequest, options: { wait: boolean } = { wait: true }): Promise<AiInteractionRecord> {
    const access = this.isEnabled(request.assistType, request.scope);
    const { minimized, report } = this.minimizer.minimize(request.input);
    const now = new Date();
    const record: AiInteractionRecord = {
      id: crypto.randomUUID(),
      moduleConfigId: request.assistType,
      actorId: request.actor.actorId ?? null,
      scope: { minimizedInput: minimized, language: request.language ?? "fr", plan: request.scope.plan ?? null },
      minimizedInputReference: this.hash(JSON.stringify(minimized)),
      outputReference: "pending",
      guardrailResult: "pending",
      humanValidationStatus: this.guardrails.requiresHumanValidation(request.assistType) ? "pending" : "not_required",
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      assistType: request.assistType,
      surface: request.surface,
      status: "queued",
      provider: this.deps.provider.name,
      model: null,
      fallback: false,
      promptHash: null,
      outputHash: null,
      outputText: null,
      outputData: null,
      refusalReason: null,
      minimizationReport: { ...report },
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
      targetType: request.target?.type ?? null,
      targetId: request.target?.id ?? null,
      partnerTenantId: request.scope.partnerTenantId ?? null,
      countryId: request.scope.countryId ?? null,
      productId: request.scope.productId ?? null,
      correlationId: request.actor.correlationId ?? null,
      completedAt: null
    };
    if (!access.enabled) {
      record.status = "refused";
      record.refusalReason = "ai_disabled";
      record.guardrailResult = "not_evaluated";
      record.outputReference = "refused";
      record.completedAt = now;
      await this.repository.create(record);
      this.audit(record, request.actor, AiAuditActions.refused, "refused", { modelCall: false, reasons: access.reasons });
      return record;
    }
    if (!await this.withinQuota(request)) {
      this.audit(record, request.actor, AiAuditActions.quotaExceeded, "refused", { modelCall: false });
      throw new AiQuotaExceededError();
    }
    await this.repository.create(record);
    this.audit(record, request.actor, AiAuditActions.queued, "success", { modelCall: false, minimization: report });
    const job = this.deps.queue.add("ai-assist", `ai_${request.assistType}`, record.id, request.actor.correlationId);
    if (options.wait) return this.execute(record.id, request.actor, job.id);
    if (this.deps.autoProcess !== false) setImmediate(() => void this.execute(record.id, request.actor, job.id).catch(() => undefined));
    return record;
  }

  async execute(interactionId: string, actor: ActorContext, jobId?: string): Promise<AiInteractionRecord> {
    const record = await this.repository.find(interactionId);
    if (!record || record.status !== "queued") return record ?? this.missing(interactionId);
    if (jobId) this.deps.queue.transition(jobId, "active");
    const minimizedInput = (record.scope.minimizedInput ?? {}) as Record<string, unknown>;
    const language: "fr" | "en" = record.scope.language === "en" ? "en" : "fr";
    const prompt = this.prompts.build(record.assistType, minimizedInput, language);
    const started = Date.now();
    let generated: { text: string; model: string; inputTokens?: number | undefined; outputTokens?: number | undefined };
    let fallback = false;
    let provider = this.deps.provider.name;
    const generateRequest = { assistType: record.assistType, system: prompt.system, user: prompt.user, json: prompt.json, maxOutputTokens: prompt.maxOutputTokens, input: minimizedInput, language };
    try {
      generated = await this.deps.provider.generate(generateRequest);
    } catch (error) {
      fallback = true;
      provider = this.deps.fallbackProvider.name;
      generated = await this.deps.fallbackProvider.generate(generateRequest);
      this.audit(record, actor, AiAuditActions.failedFallback, "failed", { modelCall: true, reason: error instanceof Error ? error.message.slice(0, 160) : "provider_error" });
    }
    let outputData: unknown = null;
    let outputText: string | null = generated.text;
    if (prompt.json) {
      const parsed = this.parseStructured(record.assistType, generated.text);
      if (!parsed.ok) {
        fallback = true;
        provider = this.deps.fallbackProvider.name;
        generated = await this.deps.fallbackProvider.generate(generateRequest);
        const retry = this.parseStructured(record.assistType, generated.text);
        outputData = retry.ok ? retry.value : null;
      } else {
        outputData = parsed.value;
      }
      outputText = outputData ? this.describeStructured(outputData) : null;
    }
    const verdict = this.guardrails.evaluate(record.assistType, outputText ?? "");
    const latencyMs = Date.now() - started;
    const finished = new Date();
    if (!verdict.approved) {
      const refused = await this.repository.update(record.id, {
        status: "refused",
        refusalReason: `guardrail_violation:${verdict.reasons.join("|")}`.slice(0, 200),
        guardrailResult: "rejected",
        outputReference: "withheld",
        outputText: null,
        outputData: null,
        provider,
        model: generated.model,
        fallback,
        promptHash: this.hash(prompt.system + prompt.user),
        outputHash: this.hash(generated.text),
        inputTokens: generated.inputTokens ?? null,
        outputTokens: generated.outputTokens ?? null,
        latencyMs,
        completedAt: finished,
        updatedAt: finished
      });
      if (jobId) this.deps.queue.transition(jobId, "completed");
      this.audit(refused, actor, AiAuditActions.refused, "refused", { modelCall: !fallback, reasons: verdict.reasons, latencyMs });
      return refused;
    }
    const decorated = outputText ? this.guardrails.decorate(outputText) : null;
    const completed = await this.repository.update(record.id, {
      status: "completed",
      guardrailResult: "approved",
      outputReference: this.hash(decorated ?? JSON.stringify(outputData)),
      outputText: decorated,
      outputData,
      provider,
      model: generated.model,
      fallback,
      promptHash: this.hash(prompt.system + prompt.user),
      outputHash: this.hash(generated.text),
      inputTokens: generated.inputTokens ?? null,
      outputTokens: generated.outputTokens ?? null,
      latencyMs,
      completedAt: finished,
      updatedAt: finished
    });
    if (jobId) this.deps.queue.transition(jobId, "completed");
    this.audit(completed, actor, AiAuditActions.completed, "success", { modelCall: !fallback, fallback, latencyMs, inputTokens: completed.inputTokens, outputTokens: completed.outputTokens, humanValidationStatus: completed.humanValidationStatus });
    return completed;
  }

  async processPending(limit = 50): Promise<number> {
    const queued = await this.repository.listQueued(limit);
    for (const record of queued) await this.execute(record.id, { actorId: record.actorId ?? undefined, roles: ["super_admin"], mfaVerified: true } as ActorContext);
    return queued.length;
  }

  async find(id: string): Promise<AiInteractionRecord | undefined> {
    return this.repository.find(id);
  }

  async listForTarget(targetType: string, targetId: string): Promise<AiInteractionRecord[]> {
    return this.repository.listForTarget(targetType, targetId);
  }

  async listForSurface(surface: AiSurface, limit = 50): Promise<AiInteractionRecord[]> {
    return this.repository.listForSurface(surface, limit);
  }

  /** Human validation of a sensitive suggestion (Constitution V); the decision is audited. */
  async validate(id: string, decision: "approved" | "rejected", actor: ActorContext): Promise<AiInteractionRecord> {
    const record = await this.repository.find(id);
    if (!record) return this.missing(id);
    const updated = await this.repository.update(id, { humanValidationStatus: decision, updatedAt: new Date() });
    this.audit(updated, actor, AiAuditActions.validated, "success", { decision, modelCall: false });
    return updated;
  }

  toDto(record: AiInteractionRecord): AiInteraction {
    return {
      id: record.id,
      assistType: record.assistType,
      surface: record.surface,
      status: record.status,
      provider: record.provider,
      model: record.model,
      fallback: record.fallback,
      outputText: record.outputText,
      outputData: record.outputData ?? null,
      guardrailResult: record.guardrailResult,
      humanValidationStatus: record.humanValidationStatus,
      refusalReason: record.refusalReason,
      disclaimer: AI_ASSISTANCE_DISCLAIMER,
      assistanceLabel: ASSISTANCE_LABEL,
      createdAt: record.createdAt.toISOString(),
      completedAt: record.completedAt ? record.completedAt.toISOString() : null
    };
  }

  private async withinQuota(request: AiGatewayRequest): Promise<boolean> {
    const limit = this.deps.quotas?.[request.surface] ?? DEFAULT_QUOTAS[request.surface];
    const day = new Date().toISOString().slice(0, 10);
    const count = await this.deps.redis.incr(`ai:quota:${request.surface}:${this.hash(request.quotaKey)}:${day}`, 86_400);
    return count <= limit;
  }

  private parseStructured(assistType: AiAssistTypeCatalog, text: string): { ok: true; value: unknown } | { ok: false } {
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      const candidate = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text) as unknown;
      const validator = JSON_SCHEMAS[assistType];
      return { ok: true, value: validator ? validator(candidate) : candidate };
    } catch {
      return { ok: false };
    }
  }

  private describeStructured(value: unknown): string {
    const record = value as Record<string, unknown>;
    if (typeof record.score === "number" && Array.isArray(record.factors)) {
      const factors = (record.factors as Array<{ explanation?: string }>).map((factor) => factor.explanation).filter(Boolean).join("; ");
      return `Score indicatif ${record.score}/100 (${String(record.level)}). Facteurs: ${factors}.`;
    }
    return Object.entries(record).map(([key, entry]) => `${key}: ${typeof entry === "string" ? entry : JSON.stringify(entry)}`).join("; ");
  }

  private audit(record: AiInteractionRecord, actor: ActorContext, action: string, result: "success" | "refused" | "failed", context: Record<string, unknown>): void {
    this.deps.audit.write({
      actor,
      action,
      targetType: "AIInteraction",
      targetId: record.id,
      scope: { surface: record.surface, assistType: record.assistType, partnerTenantId: record.partnerTenantId, countryId: record.countryId, productId: record.productId, targetType: record.targetType, targetId: record.targetId },
      result,
      ...(record.refusalReason ? { reason: record.refusalReason } : {}),
      context: { provider: record.provider, model: record.model, promptHash: record.promptHash, outputHash: record.outputHash, ...context }
    });
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 32);
  }

  private missing(id: string): never {
    throw new Error(`AI interaction ${id} not found`);
  }
}
