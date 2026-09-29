import { describe, expect, it } from "vitest";
import { AI_ASSISTANCE_DISCLAIMER } from "../../../../packages/shared/contracts/ai.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AdminAiService } from "../../../src/modules/ai/admin-ai.service";
import { AiGateway } from "../../../src/modules/ai/core/ai-gateway.service";
import { TemplateAiProvider } from "../../../src/modules/ai/core/ai-provider.port";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import type { RoutingAnomalyDetectorService } from "../../../src/modules/routing/routing-anomaly-detector.service";
import type { AdminDashboardService } from "../../../src/modules/dashboards/admin-dashboard.service";
import type { ComplianceAlertsService } from "../../../src/modules/dashboards/compliance-alerts.service";
import type { ActivationChecklistService } from "../../../src/modules/activation-checklist/activation-checklist.service";
import type { OffersRepository } from "../../../src/modules/offers/offers.repository";
import type { QuoteSubmissionService } from "../../../src/modules/quote-requests/quote-submission.service";
import type { ActorContext } from "../../../src/modules/common/types";

const superAdmin: ActorContext = { actorId: "admin-super", roles: ["super_admin"], mfaVerified: true };

describe("Routing Anomaly AI Insight (admin_platform)", () => {
  async function createAdminAi(flagEnabled = true) {
    const audit = new AuditLogWriter();
    const featureFlags = new FeatureFlagsService(audit);

    if (flagEnabled) {
      await featureFlags.applyCompliancePolicy(
        { key: "ai_routing_anomaly_detection_enabled", scopeType: "global", value: true, reason: "enable anomaly ai" },
        superAdmin,
        { reference: "POLICY-ANOMALY-AI", approvedBy: "compliance" }
      );
    }

    const gateway = new AiGateway({
      audit,
      featureFlags,
      provider: new TemplateAiProvider(),
      fallbackProvider: new TemplateAiProvider(),
      queue: new InMemoryQueue(),
      redis: new InMemoryRedisClient(),
      autoProcess: false
    });

    const mockDetector: Partial<RoutingAnomalyDetectorService> = {
      detectAnomalies: async () => ({
        generatedAt: new Date().toISOString(),
        totalAnomalies: 2,
        criticalCount: 1,
        warningCount: 1,
        anomalies: [
          {
            id: "anom-1",
            type: "unassigned_leads",
            severity: "critical",
            detectedAt: new Date().toISOString(),
            country: "CI",
            product: "auto",
            targetId: "q-123",
            details: "Lead REF-999 bloque: aucun courtier disponible",
            metricValue: 100,
            metricThreshold: 0
          },
          {
            id: "anom-2",
            type: "sla_breach_risk",
            severity: "warning",
            detectedAt: new Date().toISOString(),
            country: "CI",
            product: "auto",
            targetId: "as-456",
            details: "Lead assigne sans action courtier depuis 40 minutes",
            metricValue: 40,
            metricThreshold: 30
          }
        ],
        recommendations: ["Verifier les quotas", "Relancer le courtier"]
      })
    };

    const adminAi = new AdminAiService({
      audit,
      gateway,
      dashboard: {} as unknown as AdminDashboardService,
      complianceAlerts: {} as unknown as ComplianceAlertsService,
      activationChecklist: {} as unknown as ActivationChecklistService,
      offers: {} as unknown as OffersRepository,
      quoteRequests: {} as unknown as QuoteSubmissionService,
      routingAnomalyDetector: mockDetector as RoutingAnomalyDetectorService
    });

    return { adminAi, gateway, audit, featureFlags };
  }

  it("produces consultative routing anomaly insight with disclaimer and pending human validation", async () => {
    const { adminAi, gateway } = await createAdminAi(true);

    const queued = await adminAi.request("routing_anomaly_analysis", {}, superAdmin);
    expect(queued.status).toBe("queued");
    expect(queued.assistType).toBe("routing_anomaly_analysis");
    expect(queued.surface).toBe("admin_platform");

    await gateway.processPending();

    const completed = await adminAi.read(queued.id, superAdmin);
    expect(completed.status).toBe("completed");
    expect(completed.disclaimer).toBe(AI_ASSISTANCE_DISCLAIMER);
    expect(completed.humanValidationStatus).toBe("pending");
    expect(completed.outputText).toContain("Analyse indicative du routage: 2 anomalie(s) detectee(s)");
    expect(completed.outputText).toContain("1 critique(s)");
  });

  it("strictly enforces Zero PII in AI payload and output", async () => {
    const { adminAi, gateway } = await createAdminAi(true);

    const queued = await adminAi.request("routing_anomaly_analysis", {}, superAdmin);
    await gateway.processPending();
    const completed = await adminAi.read(queued.id, superAdmin);
    const serialized = JSON.stringify(completed);

    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain("+225");
    expect(serialized).not.toContain("Koffi");
  });

  it("refuses request with fail-closed behavior when flag is disabled", async () => {
    const { adminAi } = await createAdminAi(false);

    const interaction = await adminAi.request("routing_anomaly_analysis", {}, superAdmin);
    expect(interaction.status).toBe("refused");
    expect(interaction.refusalReason).toContain("disabled");
  });
});
