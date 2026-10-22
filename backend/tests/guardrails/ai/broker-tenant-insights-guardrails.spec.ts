import { describe, expect, it } from "vitest";
import type { AiAssistTypeCatalog } from "../../../../packages/shared/contracts/ai.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { AiGateway, type AiGatewayScope } from "../../../src/modules/ai/core/ai-gateway.service";
import { AiGuardrails } from "../../../src/modules/ai/core/ai-guardrails";
import { TemplateAiProvider, type AiProviderPort } from "../../../src/modules/ai/core/ai-provider.port";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import type { ActorContext } from "../../../src/modules/common/types";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";

const TENANT = "00000000-0000-4000-8000-00000000c001";
const compliance: ActorContext = { actorId: "compliance", roles: ["super_admin"], mfaVerified: true };
const owner: ActorContext = { actorId: "owner", roles: ["broker_owner_pro"], partnerTenantId: TENANT, partnerPlan: "enterprise", mfaVerified: true };
const TENANT_INSIGHTS: AiAssistTypeCatalog[] = ["performance_summary", "manager_assistant", "weekly_summary"];

async function gateway(flags: string[]) {
  const audit = new AuditLogWriter();
  const featureFlags = new FeatureFlagsService(audit);
  for (const key of flags) await featureFlags.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "guardrail test" }, compliance, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
  let modelCalls = 0;
  const provider: AiProviderPort = { name: "counting-model", async generate(request) { modelCalls += 1; return new TemplateAiProvider().generate(request); } };
  const instance = new AiGateway({ audit, featureFlags, provider, fallbackProvider: new TemplateAiProvider(), queue: new InMemoryQueue(), redis: new InMemoryRedisClient(), autoProcess: false });
  return { featureFlags, gateway: instance, modelCalls: () => modelCalls };
}

const run = (target: AiGateway, assistType: AiAssistTypeCatalog, scope: AiGatewayScope) =>
  target.run({ assistType, surface: "broker_crm", actor: owner, input: { received: 3 }, target: { type: "PartnerTenant", id: TENANT }, scope, quotaKey: TENANT }, { wait: true });

describe("broker tenant insight guardrails (Constitution V, acceptance criteria 8 and 9)", () => {
  it("never calls the model when the global flag, the partner, the plan or a Starter tenant closes the insight", async () => {
    const closed = await gateway([]);
    for (const assistType of TENANT_INSIGHTS) expect((await run(closed.gateway, assistType, { partnerTenantId: TENANT, plan: "enterprise" })).status).toBe("refused");
    expect(closed.modelCalls()).toBe(0);

    const open = await gateway(["ai_summary_enabled", "ai_broker_assistant_enabled"]);
    for (const assistType of TENANT_INSIGHTS) {
      expect((await run(open.gateway, assistType, { partnerTenantId: TENANT, plan: "starter" })).status).toBe("refused");
      expect((await run(open.gateway, assistType, { partnerTenantId: TENANT })).status).toBe("refused");
    }
    expect((await run(open.gateway, "manager_assistant", { partnerTenantId: TENANT, plan: "pro" })).status).toBe("refused");
    await open.featureFlags.setFlag({ key: "ai_partner_opt_out", scopeType: "partner", scopeId: TENANT, value: true, reason: "opt out" }, compliance);
    for (const assistType of TENANT_INSIGHTS) expect((await run(open.gateway, assistType, { partnerTenantId: TENANT, plan: "enterprise" })).status).toBe("refused");
    expect(open.modelCalls()).toBe(0);
  });

  it("marks every output as assistance and keeps steering insights pending human validation", async () => {
    const open = await gateway(["ai_summary_enabled", "ai_broker_assistant_enabled"]);
    const performance = await run(open.gateway, "performance_summary", { partnerTenantId: TENANT, plan: "pro" });
    const managerAnalysis = await run(open.gateway, "manager_assistant", { partnerTenantId: TENANT, plan: "enterprise" });
    expect(performance.humanValidationStatus).toBe("pending");
    expect(managerAnalysis.humanValidationStatus).toBe("pending");
    for (const record of [performance, managerAnalysis]) expect(open.gateway.toDto(record).disclaimer).toMatch(/Assistance IA/);
    expect(performance.outputText).toMatch(/Assistance IA indicative/);
  });

  it("rejects advice, official recommendation, automatic routing and personal judgement in tenant insights", () => {
    const guardrails = new AiGuardrails();
    for (const assistType of TENANT_INSIGHTS) {
      expect(guardrails.evaluate(assistType, "Nous vous recommandons officiellement ce contrat.").approved).toBe(false);
      expect(guardrails.evaluate(assistType, "Mettez en place une redistribution automatique des leads.").approved).toBe(false);
      expect(guardrails.evaluate(assistType, "Le conseiller C2 est incompétent.").approved).toBe(false);
      expect(guardrails.evaluate(assistType, "Voir https://example.test pour le détail.").approved).toBe(false);
    }
  });
});
