import type { AIAssistanceStatus, AIAssistanceSurface, AIAssistType } from "../../../../packages/shared/contracts/ai-assistance.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import { AIAssistanceAuditActions } from "./ai-assistance-audit-actions";

export class AIAssistanceAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`AI assistance access denied: ${reason}`);
    this.name = "AIAssistanceAccessRefusedError";
  }
}

export interface AIAssistanceDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
}

export class AIAssistanceService {
  constructor(private readonly deps: AIAssistanceDeps) {}

  status(actor: ActorContext, surface: AIAssistanceSurface): AIAssistanceStatus {
    this.assertAccess(actor, surface);
    const flagKeys = surface === "broker_crm"
      ? ["ai_broker_assistant_enabled", "ai_summary_enabled"]
      : ["ai_broker_assistant_enabled", "ai_summary_enabled", "ai_recommendation_enabled"];
    const flags = flagKeys.map((key) => ({ key, value: this.deps.featureFlags.isEnabled(key), required: true }));
    const status: AIAssistanceStatus = {
      generatedAt: new Date().toISOString(),
      surface,
      enabled: false,
      modelCall: false,
      humanValidationRequired: true,
      auditPolicy: "metadata_only",
      availableAssistTypes: this.assistTypes(surface),
      flags,
      guardrails: {
        centralAiModuleOnly: true,
        piiMinimized: true,
        outputIsAdvisory: true,
        noAutomatedDecision: true
      },
      message: "Assistance IA exposee en statut seulement: aucun appel modele, aucune decision automatisee, validation humaine obligatoire."
    };
    this.deps.audit.write({
      actor,
      action: AIAssistanceAuditActions.statusRead,
      targetType: "AIAssistance",
      targetId: surface,
      scope: { surface, partnerTenantId: actor.partnerTenantId ?? null },
      result: "success",
      context: { modelCall: false, enabled: false, flags }
    });
    return status;
  }

  private assistTypes(surface: AIAssistanceSurface): AIAssistType[] {
    return surface === "broker_crm"
      ? ["lead_summary", "next_action", "relaunch_message", "loss_analysis"]
      : ["admin_risk_triage", "activation_gap_summary"];
  }

  private assertAccess(actor: ActorContext, surface: AIAssistanceSurface): void {
    if (actor.mfaVerified !== true) this.refuse(actor, surface, "mfa_required");
    if (surface === "broker_crm") {
      if (!actor.partnerTenantId) this.refuse(actor, surface, "missing_broker_tenant");
      if (!actor.roles.some((role) => roleHasPermission(role, "broker_crm:read") || roleHasPermission(role, "broker_crm:read_assigned") || roleHasPermission(role, "broker_crm:*"))) {
        this.refuse(actor, surface, "missing_crm_read_permission");
      }
      return;
    }
    if (!actor.roles.some((role) => roleHasPermission(role, "ai:read") || role === "super_admin" || role === "compliance_admin")) {
      this.refuse(actor, surface, "forbidden_role");
    }
  }

  private refuse(actor: ActorContext, surface: AIAssistanceSurface, reason: string): never {
    this.deps.audit.write({
      actor,
      action: AIAssistanceAuditActions.statusRefused,
      targetType: "AIAssistance",
      targetId: surface,
      scope: { roles: actor.roles, partnerTenantId: actor.partnerTenantId ?? null },
      result: "refused",
      reason,
      context: { modelCall: false }
    });
    throw new AIAssistanceAccessRefusedError(reason);
  }
}
