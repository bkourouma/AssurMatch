import { describe, expect, it } from "vitest";
import { AI_ASSISTANCE_DISCLAIMER, aiLeadScoreSchema } from "../../../../../packages/shared/contracts/ai.contracts";
import { AuditLogWriter } from "../../../../src/modules/audit-logs/audit-log-writer.service";
import { AiAuditActions } from "../../../../src/modules/ai/core/ai-audit-actions";
import { AiGateway, AiQuotaExceededError } from "../../../../src/modules/ai/core/ai-gateway.service";
import { AiGuardrails } from "../../../../src/modules/ai/core/ai-guardrails";
import { TemplateAiProvider, type AiProviderPort } from "../../../../src/modules/ai/core/ai-provider.port";
import { PiiMinimizer } from "../../../../src/modules/ai/core/pii-minimizer";
import { InMemoryQueue } from "../../../../src/modules/common/queues/queues.module";
import { InMemoryRedisClient } from "../../../../src/modules/common/redis/redis.module";
import { FeatureFlagsService } from "../../../../src/modules/feature-flags/feature-flags.module";
import { superAdminActor } from "../../../integration/helpers/enterprise-seed";

function stubProvider(text: string | Error): AiProviderPort {
  return {
    name: "stub",
    async generate() {
      if (text instanceof Error) throw text;
      return { text, model: "stub-model", inputTokens: 10, outputTokens: 5 };
    }
  };
}

async function gatewayWith(provider: AiProviderPort, flags: string[] = ["ai_summary_enabled", "ai_recommendation_enabled", "ai_broker_assistant_enabled", "ai_lead_scoring_enabled"], quotas?: { visitor: number }) {
  const audit = new AuditLogWriter();
  const featureFlags = new FeatureFlagsService(audit);
  for (const key of flags) await featureFlags.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "ai core test" }, superAdminActor, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
  const gateway = new AiGateway({ audit, featureFlags, provider, fallbackProvider: new TemplateAiProvider(), queue: new InMemoryQueue(), redis: new InMemoryRedisClient(), autoProcess: false, quotas });
  return { audit, featureFlags, gateway };
}

describe("PiiMinimizer", () => {
  it("drops identity keys and scrubs emails, phones and long digit runs from free text", () => {
    const { minimized, report } = new PiiMinimizer().minimize({
      email: "ama@example.test",
      contact: { phone: "+2250102030405", displayName: "Ama Kone" },
      need: "Contactez-moi sur ama@example.test ou au 07 01 02 03 04, plaque 12345678",
      answers: { vehicle_use: "prive" }
    });
    expect(JSON.stringify(minimized)).not.toContain("example.test");
    expect(JSON.stringify(minimized)).not.toContain("0102030405");
    expect(JSON.stringify(minimized)).not.toContain("Ama Kone");
    expect((minimized as { answers: { vehicle_use: string } }).answers.vehicle_use).toBe("prive");
    expect(report.droppedKeys).toEqual(expect.arrayContaining(["email", "contact.phone", "contact.displayName"]));
    expect(report.redactedPatterns.email).toBe(1);
    expect(report.redactedPatterns.phone).toBeGreaterThanOrEqual(1);
  });
});

describe("AiGuardrails", () => {
  it("rejects advisory or decision wording and appends the disclaimer", () => {
    const guardrails = new AiGuardrails();
    expect(guardrails.evaluate("visitor_faq", "Nous vous recommandons officiellement ce contrat.").approved).toBe(false);
    expect(guardrails.evaluate("visitor_faq", "Vous devez souscrire maintenant.").approved).toBe(false);
    expect(guardrails.evaluate("visitor_faq", "C'est la meilleure assurance du marche.").approved).toBe(false);
    expect(guardrails.evaluate("relaunch_message", "Voir https://example.test").approved).toBe(false);
    expect(guardrails.evaluate("visitor_faq", "Selon les informations fournies, ce produit pourrait correspondre.").approved).toBe(true);
    expect(guardrails.decorate("Texte")).toContain(AI_ASSISTANCE_DISCLAIMER);
    expect(guardrails.requiresHumanValidation("lead_score")).toBe(true);
    expect(guardrails.requiresHumanValidation("visitor_faq")).toBe(false);
  });
});

describe("TemplateAiProvider", () => {
  it("produces valid structured lead scores and cautious text", async () => {
    const provider = new TemplateAiProvider();
    const score = await provider.generate({ assistType: "lead_score", system: "", user: "", json: true, maxOutputTokens: 100, language: "fr", input: { answers: { a: "1", b: "" }, hasEmail: true, urgency: "urgent" } });
    expect(aiLeadScoreSchema.parse(JSON.parse(score.text)).score).toBeGreaterThan(0);
    const text = await provider.generate({ assistType: "visitor_product_assistant", system: "", user: "", json: false, maxOutputTokens: 100, language: "fr", input: { need: "proteger ma voiture", countryCode: "CI" } });
    expect(new AiGuardrails().evaluate("visitor_product_assistant", text.text).approved).toBe(true);
    expect(text.text).toContain("pourrait correspondre");
  });
});

describe("AiGateway", () => {
  it("refuses without model call when flags are off and audits the reasons", async () => {
    const { audit, gateway } = await gatewayWith(stubProvider("ok"), []);
    const record = await gateway.run({ assistType: "visitor_faq", surface: "visitor", actor: superAdminActor, input: { question: "Quelle assurance ?" }, scope: {}, quotaKey: "ip-1" });
    expect(record.status).toBe("refused");
    expect(record.refusalReason).toBe("ai_disabled");
    expect(audit.search({ action: AiAuditActions.refused })[0]?.context).toMatchObject({ modelCall: false });
    expect(audit.search({ action: AiAuditActions.queued })).toHaveLength(0);
  });

  it("completes with disclaimer, hashes only in audit, and enforces daily quotas", async () => {
    const { audit, gateway } = await gatewayWith(stubProvider("Selon les informations fournies, une assurance auto pourrait correspondre."), undefined, { visitor: 1 });
    const record = await gateway.run({ assistType: "visitor_product_assistant", surface: "visitor", actor: superAdminActor, input: { need: "ma voiture", email: "x@y.test" }, scope: {}, quotaKey: "ip-2" });
    expect(record.status).toBe("completed");
    expect(record.outputText).toContain(AI_ASSISTANCE_DISCLAIMER);
    expect(record.model).toBe("stub-model");
    expect(record.minimizationReport).toMatchObject({ droppedKeys: ["email"] });
    const completed = audit.search({ action: AiAuditActions.completed })[0];
    expect(JSON.stringify(completed)).not.toContain("ma voiture");
    expect(completed?.context).toMatchObject({ modelCall: true, inputTokens: 10 });
    await expect(gateway.run({ assistType: "visitor_product_assistant", surface: "visitor", actor: superAdminActor, input: { need: "encore" }, scope: {}, quotaKey: "ip-2" })).rejects.toBeInstanceOf(AiQuotaExceededError);
  });

  it("withholds guardrail violations and falls back to the template provider on failures", async () => {
    const violating = await gatewayWith(stubProvider("Nous vous recommandons officiellement ce contrat, c'est la meilleure assurance."));
    const refused = await violating.gateway.run({ assistType: "visitor_faq", surface: "visitor", actor: superAdminActor, input: { question: "Laquelle ?" }, scope: {}, quotaKey: "ip-3" });
    expect(refused.status).toBe("refused");
    expect(refused.refusalReason).toContain("guardrail_violation");
    expect(refused.outputText).toBeNull();

    const failing = await gatewayWith(stubProvider(new Error("provider down")));
    const fallback = await failing.gateway.run({ assistType: "visitor_request_summary", surface: "visitor", actor: superAdminActor, input: { productKey: "auto", countryCode: "CI", answers: { vehicle_use: "prive" } }, scope: {}, quotaKey: "ip-4" });
    expect(fallback.status).toBe("completed");
    expect(fallback.fallback).toBe(true);
    expect(fallback.provider).toBe("template");
    expect(failing.audit.search({ action: AiAuditActions.failedFallback })).toHaveLength(1);

    const invalidJson = await gatewayWith(stubProvider("not json at all"));
    const scored = await invalidJson.gateway.run({ assistType: "lead_score", surface: "broker_crm", actor: superAdminActor, input: { answers: { a: "1" }, hasPhone: true, urgency: "normal" }, scope: { plan: "pro" }, quotaKey: "tenant-1" });
    expect(scored.status).toBe("completed");
    expect(scored.fallback).toBe(true);
    expect(scored.humanValidationStatus).toBe("pending");
    expect(aiLeadScoreSchema.parse(scored.outputData).score).toBeGreaterThanOrEqual(0);
  });

  it("applies country, product, partner opt-out and plan gates", async () => {
    const { featureFlags, gateway } = await gatewayWith(stubProvider("ok"));
    expect(gateway.isEnabled("visitor_faq", { countryFlags: { country_ai_enabled: false } }).reasons).toContain("country_ai_disabled");
    expect(gateway.isEnabled("visitor_request_summary", { countryFlags: { country_ai_enabled: true }, productFlags: { product_ai_form_assistant_enabled: false } }).reasons).toContain("product_ai_form_assistant_disabled");
    expect(gateway.isEnabled("lead_summary", { plan: "starter" }).reasons).toContain("plan_starter_excluded");
    expect(gateway.isEnabled("loss_analysis", { plan: "pro" }).reasons).toContain("plan_enterprise_required");
    await featureFlags.setFlag({ key: "ai_partner_opt_out", scopeType: "partner", scopeId: "tenant-x", value: true, reason: "opt out" }, superAdminActor);
    expect(gateway.isEnabled("lead_summary", { partnerTenantId: "tenant-x", plan: "pro" }).reasons).toContain("partner_opted_out");
    expect(gateway.isEnabled("lead_summary", { partnerTenantId: "tenant-y", plan: "pro" }).enabled).toBe(true);
  });
});
