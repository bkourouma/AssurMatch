import { aiModuleConfigSchema, type AIModuleConfigDto, type AIModuleConfigRecord } from "../../../../packages/shared/contracts/ops.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { ActorContext } from "../common/types";
import { AIAssistanceAccessRefusedError, AIAssistanceService } from "./ai-assistance.service";

export interface AIModuleConfig extends AIModuleConfigRecord {
  id: string;
  modelCallCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class AIService {
  private readonly modules: AIModuleConfig[] = [];

  constructor(private readonly audit: AuditLogWriter) {}

  register(input: AIModuleConfigDto, actor: ActorContext): AIModuleConfig {
    const parsed = aiModuleConfigSchema.parse(input);
    const now = new Date();
    const module: AIModuleConfig = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      modelCallCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.modules.push(module);
    this.audit.write({
      actor,
      action: "ai_module.registered",
      targetType: "AIModuleConfig",
      targetId: module.id,
      result: "success",
      context: { key: module.key, status: module.status }
    });
    return module;
  }

  invoke(moduleId: string): never {
    const module = this.require(moduleId);
    if (module.status === "disabled") {
      this.audit.write({
        action: "ai_module.invocation_blocked",
        targetType: "AIModuleConfig",
        targetId: module.id,
        result: "refused",
        reason: "AI module disabled",
        context: { key: module.key, modelCallCount: module.modelCallCount }
      });
      throw new Error("AI disabled");
    }
    throw new Error("Advanced AI invocation is out of scope for foundation");
  }

  list(): AIModuleConfig[] {
    return [...this.modules];
  }

  configure(id: string, input: AIModuleConfigDto, actor: ActorContext): AIModuleConfig {
    const module = this.require(id);
    if (input.status === "enabled" && input.guardrailStatus !== "approved") {
      throw new Error("AI module requires approved guardrails before enablement");
    }
    Object.assign(module, input, { updatedAt: new Date() });
    this.audit.write({
      actor,
      action: "ai_module.configured",
      targetType: "AIModuleConfig",
      targetId: module.id,
      result: "success",
      ...(input.reason ? { reason: input.reason } : {}),
      context: { key: module.key, status: module.status, guardrailStatus: module.guardrailStatus }
    });
    return module;
  }

  private require(id: string): AIModuleConfig {
    const module = this.modules.find((candidate) => candidate.id === id);
    if (!module) throw new Error(`AI module ${id} not found`);
    return module;
  }
}

export class AIModule {
  readonly service: AIService;
  readonly assistance: AIAssistanceService | undefined;

  constructor(audit = new AuditLogWriter(), featureFlags?: FeatureFlagsService) {
    this.service = new AIService(audit);
    this.assistance = featureFlags ? new AIAssistanceService({ audit, featureFlags }) : undefined;
  }
}

export { AIAssistanceAuditActions } from "./ai-assistance-audit-actions";
export { AIAssistanceAccessRefusedError, AIAssistanceService };
