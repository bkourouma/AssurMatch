import { describe, expect, it } from "vitest";
import { AI_ASSISTANCE_DISCLAIMER, aiAssistTypes, brokerAiPriorityScoresSchema, brokerAssistTypes, brokerManagerAnalysisSchema } from "../../../../packages/shared/contracts/ai.contracts";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { BrokerAiService, boundAggregates, type BrokerAiPartnerProfile } from "../../../src/modules/ai/broker-ai.service";
import { AiAuditActions } from "../../../src/modules/ai/core/ai-audit-actions";
import { AiGateway } from "../../../src/modules/ai/core/ai-gateway.service";
import { AiGuardrails } from "../../../src/modules/ai/core/ai-guardrails";
import { TemplateAiProvider, type AiGenerateRequest, type AiProviderPort } from "../../../src/modules/ai/core/ai-provider.port";
import { InMemoryQueue } from "../../../src/modules/common/queues/queues.module";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import type { ActorContext } from "../../../src/modules/common/types";
import type { CountriesService } from "../../../src/modules/countries/countries.module";
import { GLOBAL_FEATURE_FLAG_DEFAULTS } from "../../../src/modules/feature-flags/default-flags";
import { FeatureFlagsService } from "../../../src/modules/feature-flags/feature-flags.module";
import { isSensitiveFeatureFlagKey } from "../../../src/modules/feature-flags/sensitive-feature-flag-policy";
import { BrokerCrmAccessPolicy } from "../../../src/modules/leads/broker-crm-access-policy";
import { BrokerCrmExportPolicy } from "../../../src/modules/leads/broker-crm-export-policy";
import { BrokerCrmHistoryService } from "../../../src/modules/leads/broker-crm-history.service";
import { BrokerCrmLeadsService } from "../../../src/modules/leads/broker-crm-leads.service";
import { LeadAssignmentService } from "../../../src/modules/leads/lead-assignment.service";
import type { ProductsService } from "../../../src/modules/products/products.module";

const TENANT_A = "00000000-0000-4000-8000-00000000a001";
const TENANT_B = "00000000-0000-4000-8000-00000000b001";
const AGENT_1 = "11111111-1111-4111-8111-111111111111";
const AGENT_2 = "22222222-2222-4222-8222-222222222222";
const compliance: ActorContext = { actorId: "compliance", roles: ["super_admin"], mfaVerified: true };
const enterpriseOwner: ActorContext = { actorId: "owner-a", roles: ["broker_owner_pro"], partnerTenantId: TENANT_A, partnerPlan: "enterprise", mfaVerified: true };
const proOwner: ActorContext = { ...enterpriseOwner, actorId: "owner-a-pro", partnerPlan: "pro" };
const manager: ActorContext = { actorId: "manager-a", roles: ["broker_manager"], partnerTenantId: TENANT_A, partnerPlan: "enterprise", mfaVerified: true };
const agent: ActorContext = { actorId: AGENT_1, roles: ["broker_agent"], partnerTenantId: TENANT_A, partnerPlan: "enterprise", mfaVerified: true };
const readOnly: ActorContext = { actorId: "ro-a", roles: ["broker_read_only"], partnerTenantId: TENANT_A, partnerPlan: "enterprise", mfaVerified: true };
const starter: ActorContext = { actorId: "starter-a", roles: ["broker_owner_starter"], partnerTenantId: TENANT_A, partnerPlan: "starter", mfaVerified: true };
const otherOwner: ActorContext = { actorId: "owner-b", roles: ["broker_owner_pro"], partnerTenantId: TENANT_B, partnerPlan: "enterprise", mfaVerified: true };

const ALL_AI_FLAGS = ["ai_summary_enabled", "ai_broker_assistant_enabled", "ai_lead_scoring_enabled"];
const PII_MARKERS = ["Ama", "Kone", "example.test", "0102030405", "AM-A-", AGENT_1, AGENT_2];

interface WorldOptions {
  flags?: string[];
  providerText?: string;
  countryAi?: boolean;
  productScoring?: boolean;
  profiles?: Record<string, BrokerAiPartnerProfile>;
  withProfiles?: boolean;
  performanceInput?: (actor: ActorContext, query: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

async function world(options: WorldOptions = {}) {
  const audit = new AuditLogWriter();
  const featureFlags = new FeatureFlagsService(audit);
  for (const key of options.flags ?? ALL_AI_FLAGS) {
    await featureFlags.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "broker ai insights test" }, compliance, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
  }
  const calls: AiGenerateRequest[] = [];
  const template = new TemplateAiProvider();
  const provider: AiProviderPort = {
    name: "recording-model",
    async generate(request) {
      calls.push(request);
      return options.providerText === undefined ? template.generate(request) : { text: options.providerText, model: "stub-model" };
    }
  };
  const gateway = new AiGateway({ audit, featureFlags, provider, fallbackProvider: template, queue: new InMemoryQueue(), redis: new InMemoryRedisClient(), autoProcess: false });
  const assignments = new LeadAssignmentService(audit);
  const access = new BrokerCrmAccessPolicy(audit, { brokerCrmEnabled: true });
  const crmLeads = new BrokerCrmLeadsService(assignments, access, new BrokerCrmHistoryService(), audit, new BrokerCrmExportPolicy(access, audit));
  const countries = { findByIsoCode: async (code: string) => ({ id: `country-${code}`, flags: { country_ai_enabled: options.countryAi ?? true } }) } as unknown as CountriesService;
  const products = { findByKey: async (key: string) => ({ id: `product-${key}`, flags: { product_ai_scoring_enabled: options.productScoring ?? true } }) } as unknown as ProductsService;
  const profiles = options.profiles ?? { [TENANT_A]: { plan: "pro", status: "active" } };
  const service = new BrokerAiService({
    audit, gateway, featureFlags, crmLeads, assignments, access, countries, products,
    ...(options.withProfiles === false ? {} : { partnerProfile: async (id: string) => profiles[id] }),
    ...(options.performanceInput ? { performanceInput: options.performanceInput } : {})
  });

  const lead = async (tenant: string, ref: string, advisorId: string | undefined, crmStatus?: "gagne" | "perdu" | "nouveau" | "qualifie") => {
    const created = await assignments.create({
      quoteRequestId: `q-${ref}`,
      partnerTenantId: tenant,
      assignmentReason: "routing",
      publicReference: ref,
      countryCode: "CI",
      productKey: "auto",
      contact: { displayName: "Ama Kone", email: "ama.kone@example.test", phone: "+2250102030405" },
      answers: { vehicle_use: "prive", note: "Appelez Ama Kone au 0102030405" }
    }, compliance);
    if (advisorId || crmStatus) await assignments.updateCrmMetadata(created.id, { ...(crmStatus ? { crmStatus } : {}), ...(advisorId ? { assignedAdvisorId: advisorId } : {}) }, compliance);
    return created;
  };
  const leadA1 = await lead(TENANT_A, "AM-A-1", AGENT_1, "gagne");
  const leadA2 = await lead(TENANT_A, "AM-A-2", AGENT_2, "perdu");
  const leadA3 = await lead(TENANT_A, "AM-A-3", AGENT_2, "qualifie");
  const leadA4 = await lead(TENANT_A, "AM-A-4", undefined);
  const leadB1 = await lead(TENANT_B, "AM-B-1", undefined);

  /** A stored lead score (as produced through the CRM route), optionally validated by a human. */
  const score = async (leadId: string, tenant: string, decision?: "approved" | "rejected") => {
    const record = await gateway.run({ assistType: "lead_score", surface: "broker_crm", actor: compliance, input: { answers: { a: "1" }, hasPhone: true, urgency: "urgent" }, target: { type: "LeadAssignment", id: leadId }, scope: { partnerTenantId: tenant, plan: "pro" }, quotaKey: tenant }, { wait: true });
    return decision ? gateway.validate(record.id, decision, compliance) : record;
  };

  const promptText = () => calls.map((call) => `${call.system}\n${call.user}`).join("\n");
  return { audit, featureFlags, gateway, service, calls, promptText, score, leads: { leadA1, leadA2, leadA3, leadA4, leadB1 } };
}

describe("broker AI performance summary (DASH-B-009)", () => {
  it("makes no model call while ai_summary_enabled is closed and audits the refusal", async () => {
    const { service, calls, audit } = await world({ flags: [] });
    const refused = await service.performanceSummary(enterpriseOwner, {});
    expect(refused).toMatchObject({ status: "refused", refusalReason: "ai_disabled" });
    expect(calls).toHaveLength(0);
    expect(audit.search({ action: AiAuditActions.refused }).at(-1)?.context).toMatchObject({ modelCall: false, reasons: ["ai_summary_enabled_off"] });
  });

  it("summarises tenant aggregates only, decorated and pending human validation", async () => {
    const { service, gateway, calls, promptText } = await world();
    const queued = await service.performanceSummary(proOwner, { windowDays: 30 });
    expect(queued.status).toBe("queued");
    expect(await gateway.processPending()).toBe(1);
    const [done] = await service.listPerformanceSummaries(proOwner);
    expect(done?.status).toBe("completed");
    expect(done?.humanValidationStatus).toBe("pending");
    expect(done?.outputText).toContain(AI_ASSISTANCE_DISCLAIMER);
    expect(done?.outputText).toContain("4 lead(s) reçu(s)");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toMatchObject({ received: 4, won: 1, lost: 1, conversionRate: 25 });
    for (const marker of PII_MARKERS) expect(promptText()).not.toContain(marker);
  });

  it("bounds the dashboard port output to numeric aggregates and codes", async () => {
    const { service, gateway, calls, promptText } = await world({
      performanceInput: async () => ({ kpis: { received: 12, wonRate: 0.4567 }, advisorName: "Ama Kone", topLead: { email: "ama@example.test", status: "gagne" }, note: "Appeler au 0102030405", ["Ama Kone"]: 3 })
    });
    await service.performanceSummary(enterpriseOwner, {});
    await gateway.processPending();
    expect(calls[0]?.input.dashboard).toEqual({ kpis: { received: 12, wonRate: 0.46 }, topLead: { status: "gagne" } });
    for (const marker of PII_MARKERS) expect(promptText()).not.toContain(marker);
  });

  it("refuses Starter, unknown plans, assigned-only agents and opted-out partners without any model call", async () => {
    const { service, gateway, featureFlags, calls } = await world();
    await expect(service.performanceSummary(starter, {})).rejects.toThrow(/denied/);
    expect(gateway.isEnabled("performance_summary", { partnerTenantId: TENANT_A, plan: "starter" }).reasons).toContain("plan_starter_excluded");
    expect(gateway.isEnabled("performance_summary", { partnerTenantId: TENANT_A }).reasons).toContain("plan_required");
    await expect(service.performanceSummary(agent, {})).rejects.toThrow(/denied/);
    await expect(service.listPerformanceSummaries(agent)).rejects.toThrow(/denied/);
    await featureFlags.setFlag({ key: "ai_partner_opt_out", scopeType: "partner", scopeId: TENANT_A, value: true, reason: "le cabinet refuse l'IA" }, compliance);
    expect(await service.performanceSummary(enterpriseOwner, {})).toMatchObject({ status: "refused", refusalReason: "ai_disabled" });
    expect(calls).toHaveLength(0);
  });

  it("keeps summaries inside their tenant and behind tenant-wide roles; validation needs CRM update rights", async () => {
    const { service, gateway } = await world();
    const queued = await service.performanceSummary(enterpriseOwner, {});
    await gateway.processPending();
    expect(await service.listPerformanceSummaries(otherOwner)).toEqual([]);
    await expect(service.read(queued.id, otherOwner)).rejects.toThrow("AI interaction not found");
    await expect(service.read(queued.id, agent)).rejects.toThrow("AI interaction not found");
    expect((await service.read(queued.id, manager)).id).toBe(queued.id);
    await expect(service.validate(queued.id, { decision: "approved" }, readOnly)).rejects.toThrow(/denied/);
    expect((await service.validate(queued.id, { decision: "approved" }, enterpriseOwner)).humanValidationStatus).toBe("approved");
  });

  it("refuses validation of a tenant insight to an assigned-only agent who cannot read it, even with broker_crm:update", async () => {
    const { service, gateway } = await world();
    const queued = await service.performanceSummary(enterpriseOwner, {});
    await gateway.processPending();
    // Assigned-only scope (read_assigned) combined with a custom role granting broker_crm:update.
    const assignedOnlyUpdater: ActorContext = { ...agent, roles: ["broker_agent", "broker_manager"], customRolePermissions: ["broker_crm:read_assigned", "broker_crm:update"] };
    await expect(service.read(queued.id, assignedOnlyUpdater)).rejects.toThrow("AI interaction not found");
    await expect(service.validate(queued.id, { decision: "approved" }, assignedOnlyUpdater)).rejects.toThrow("AI interaction not found");
    expect((await gateway.find(queued.id))?.humanValidationStatus).toBe("pending");
    expect((await service.validate(queued.id, { decision: "approved" }, manager)).humanValidationStatus).toBe("approved");
  });

  it("withholds a steering text that decides routing, judges a person or advises a contract", async () => {
    const { service, gateway } = await world({ providerText: "Il faut licencier C2 et activer une reaffectation automatique des leads." });
    const queued = await service.performanceSummary(enterpriseOwner, {});
    await gateway.processPending();
    const stored = await gateway.find(queued.id);
    expect(stored?.status).toBe("refused");
    expect(stored?.outputText).toBeNull();
    expect(stored?.refusalReason).toContain("personnel_decision");
  });
});

describe("broker AI manager assistant (PRD 10.2)", () => {
  it("is Enterprise only: a Pro tenant gets a refused interaction and no model call", async () => {
    const { service, calls, audit } = await world();
    expect(await service.managerAssistant(proOwner, {})).toMatchObject({ status: "refused", advisorLabels: { C1: AGENT_2, C2: AGENT_1 } });
    expect(audit.search({ action: AiAuditActions.refused }).at(-1)?.context).toMatchObject({ modelCall: false, reasons: ["plan_enterprise_required"] });
    await expect(service.listManagerAnalyses(proOwner)).rejects.toThrow(/denied/);
    expect(calls).toHaveLength(0);
  });

  it("requires ai_broker_assistant_enabled", async () => {
    const { service, calls } = await world({ flags: ["ai_summary_enabled"] });
    expect((await service.managerAssistant(enterpriseOwner, {})).status).toBe("refused");
    expect(calls).toHaveLength(0);
  });

  it("sends per-advisor aggregates under neutral labels and returns the label map to the manager only", async () => {
    const { service, gateway, calls, promptText } = await world();
    const queued = brokerManagerAnalysisSchema.parse(await service.managerAssistant(manager, {}));
    expect(queued.advisorLabels).toEqual({ C1: AGENT_2, C2: AGENT_1 });
    await gateway.processPending();
    const [done] = await service.listManagerAnalyses(enterpriseOwner);
    expect(done).toMatchObject({ id: queued.id, status: "completed", humanValidationStatus: "pending", advisorLabels: { C1: AGENT_2 } });
    expect(done?.outputText).toContain("C1");
    expect(calls[0]?.input).toMatchObject({ advisorsCount: 2, unassignedOpen: 1, advisors: [{ label: "C1", openLeads: 1 }, { label: "C2", openLeads: 0 }] });
    for (const marker of PII_MARKERS) expect(promptText()).not.toContain(marker);
    await expect(service.managerAssistant(agent, {})).rejects.toThrow(/denied/);
    expect(await service.listManagerAnalyses(otherOwner)).toEqual([]);
  });
});

describe("tenant insight guardrails", () => {
  const guardrails = new AiGuardrails();
  it("rejects routing decisions, personnel decisions, judgements and contract advice; weekly text stays descriptive", () => {
    expect(guardrails.evaluate("manager_assistant", "Activez le routage automatique vers C1.").reasons).toContain("forbidden_pattern:automatic_routing");
    expect(guardrails.evaluate("manager_assistant", "C2 est un mauvais conseiller, une sanction s'impose.").approved).toBe(false);
    expect(guardrails.evaluate("performance_summary", "Proposez le contrat auto tous risques a chaque prospect.").reasons).toContain("forbidden_pattern:insurance_advice");
    expect(guardrails.evaluate("performance_summary", "C'est la meilleure offre du cabinet.").approved).toBe(false);
    expect(guardrails.evaluate("weekly_summary", "Nous vous recommandons de relancer vos leads.").reasons).toContain("forbidden_pattern:advice_not_allowed");
    expect(guardrails.evaluate("weekly_summary", "Cette semaine : 3 lead(s) reçu(s), 1 gagné(s).").approved).toBe(true);
    expect(guardrails.evaluate("manager_assistant", "Piste à valider par le manager : examiner la répartition entre C1 et C2.").approved).toBe(true);
    expect(guardrails.requiresHumanValidation("performance_summary")).toBe(true);
    expect(guardrails.requiresHumanValidation("manager_assistant")).toBe(true);
    expect(guardrails.requiresHumanValidation("weekly_summary")).toBe(false);
  });
});

describe("CRM-015 priority scores", () => {
  it("returns only completed, human-approved scores of the caller's perimeter, without model call", async () => {
    const { service, score, calls, leads, audit } = await world();
    await score(leads.leadA1.id, TENANT_A, "approved");
    await score(leads.leadA2.id, TENANT_A);
    await score(leads.leadA3.id, TENANT_A, "rejected");
    await score(leads.leadB1.id, TENANT_B, "approved");
    const modelCallsBefore = calls.length;

    const owner = brokerAiPriorityScoresSchema.parse(await service.priorityScores(enterpriseOwner));
    expect(owner.enabled).toBe(true);
    expect(Object.keys(owner.scores)).toEqual([leads.leadA1.id]);
    expect(owner.scores[leads.leadA1.id]).toMatchObject({ level: "high" });
    expect(audit.search({ action: AiAuditActions.read }).at(-1)).toMatchObject({ targetId: "priority_scores", context: { count: 1, modelCall: false } });

    // An assigned-only agent sees its own leads only (AGENT_1 owns lead A1).
    expect(Object.keys((await service.priorityScores(agent)).scores)).toEqual([leads.leadA1.id]);
    expect(Object.keys((await service.priorityScores({ ...agent, actorId: AGENT_2 })).scores)).toEqual([]);
    // Another tenant never sees them.
    expect(Object.keys((await service.priorityScores(otherOwner)).scores)).toEqual([leads.leadB1.id]);
    expect(await service.priorityScoreMap(TENANT_B, [leads.leadA1.id], "pro")).toEqual(new Map());
    expect([...(await service.priorityScoreMap(TENANT_A, [leads.leadA1.id, leads.leadB1.id], "pro")).keys()]).toEqual([leads.leadA1.id]);
    expect(await service.priorityScoreMapFor(agent)).toEqual(new Map([[leads.leadA1.id, owner.scores[leads.leadA1.id]?.score]]));
    expect(calls).toHaveLength(modelCallsBefore);
  });

  it("hides a score once a newer lead_score is pending validation", async () => {
    const { service, score, leads } = await world();
    await score(leads.leadA1.id, TENANT_A, "approved");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await score(leads.leadA1.id, TENANT_A);
    expect((await service.priorityScores(enterpriseOwner)).scores).toEqual({});
  });

  it("answers enabled:false with no score when scoring is closed (flag, opt-out, Starter) and drops closed products", async () => {
    const closed = await world({ flags: ["ai_summary_enabled"] });
    expect(await closed.service.priorityScores(enterpriseOwner)).toEqual({ enabled: false, scores: {} });
    expect(await closed.service.priorityScoreMapFor(enterpriseOwner)).toEqual(new Map());

    const optedOut = await world();
    await optedOut.score(optedOut.leads.leadA1.id, TENANT_A, "approved");
    await optedOut.featureFlags.setFlag({ key: "ai_partner_opt_out", scopeType: "partner", scopeId: TENANT_A, value: true, reason: "opt out" }, compliance);
    expect(await optedOut.service.priorityScores(enterpriseOwner)).toEqual({ enabled: false, scores: {} });
    expect(await optedOut.service.priorityScores(starter)).toEqual({ enabled: false, scores: {} });
    expect(await optedOut.service.priorityScoreMap(TENANT_A, [optedOut.leads.leadA1.id], undefined)).toEqual(new Map());

    const productOff = await world({ productScoring: false });
    await productOff.score(productOff.leads.leadA1.id, TENANT_A, "approved");
    expect(await productOff.service.priorityScores(enterpriseOwner)).toEqual({ enabled: true, scores: {} });
  });
});

describe("weekly AI summary for the scheduled alerts", () => {
  const stats = { received: 3, accepted: 2, won: 1, lost: 0, contactedCount: 2, overdueTasks: 1 };

  it("ships the weekly flag closed and admin-toggleable", () => {
    expect(GLOBAL_FEATURE_FLAG_DEFAULTS.broker_weekly_ai_summary_enabled).toBe(false);
    expect(isSensitiveFeatureFlagKey("broker_weekly_ai_summary_enabled")).toBe(false);
  });

  it("returns undefined without any model call when a gate is closed", async () => {
    const closedWeekly = await world({ flags: ["ai_summary_enabled"] });
    expect(await closedWeekly.service.weeklySummaryText(TENANT_A, stats)).toBeUndefined();

    const closedSummary = await world({ flags: ["broker_weekly_ai_summary_enabled"] });
    expect(await closedSummary.service.weeklySummaryText(TENANT_A, stats)).toBeUndefined();

    const starterTenant = await world({ flags: ["ai_summary_enabled", "broker_weekly_ai_summary_enabled"], profiles: { [TENANT_A]: { plan: "starter", status: "active" } } });
    expect(await starterTenant.service.weeklySummaryText(TENANT_A, stats)).toBeUndefined();

    const suspended = await world({ flags: ["ai_summary_enabled", "broker_weekly_ai_summary_enabled"], profiles: { [TENANT_A]: { plan: "pro", status: "suspended" } } });
    expect(await suspended.service.weeklySummaryText(TENANT_A, stats)).toBeUndefined();

    const noProfile = await world({ flags: ["ai_summary_enabled", "broker_weekly_ai_summary_enabled"], withProfiles: false });
    expect(await noProfile.service.weeklySummaryText(TENANT_A, stats)).toBeUndefined();

    const optedOut = await world({ flags: ["ai_summary_enabled", "broker_weekly_ai_summary_enabled"] });
    await optedOut.featureFlags.setFlag({ key: "ai_partner_opt_out", scopeType: "partner", scopeId: TENANT_A, value: true, reason: "opt out" }, compliance);
    expect(await optedOut.service.weeklySummaryText(TENANT_A, stats)).toBeUndefined();

    const partnerOff = await world({ flags: ["ai_summary_enabled", "broker_weekly_ai_summary_enabled"] });
    await partnerOff.featureFlags.setFlag({ key: "broker_weekly_ai_summary_enabled", scopeType: "partner", scopeId: TENANT_A, value: false, reason: "partner off" }, compliance);
    expect(await partnerOff.service.weeklySummaryText(TENANT_A, stats)).toBeUndefined();

    for (const closed of [closedWeekly, closedSummary, starterTenant, suspended, noProfile, optedOut, partnerOff]) expect(closed.calls).toHaveLength(0);
  });

  it("composes a descriptive, marked text from bounded counters with a system actor of the tenant", async () => {
    const { service, calls, promptText, gateway, audit } = await world({ flags: ["ai_summary_enabled", "broker_weekly_ai_summary_enabled"] });
    const text = await service.weeklySummaryText(TENANT_A, { ...stats, email: "ama@example.test", advisorName: "Ama Kone", note: "Appeler au 0102030405" });
    expect(text).toContain("3 lead(s) reçu(s)");
    expect(text).toContain(AI_ASSISTANCE_DISCLAIMER);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toEqual(stats);
    for (const marker of PII_MARKERS) expect(promptText()).not.toContain(marker);
    const [record] = (await gateway.listForTarget("PartnerTenant", TENANT_A)).filter((entry) => entry.assistType === "weekly_summary");
    expect(record).toMatchObject({ status: "completed", humanValidationStatus: "not_required", partnerTenantId: TENANT_A, actorId: "system:scheduled-alerts" });
    expect(audit.search({ action: AiAuditActions.completed }).at(-1)?.scope).toMatchObject({ assistType: "weekly_summary", partnerTenantId: TENANT_A });
  });

  it("falls back (undefined) when the model writes advice instead of describing the week", async () => {
    const { service, calls } = await world({ flags: ["ai_summary_enabled", "broker_weekly_ai_summary_enabled"], providerText: "Nous vous suggérons de relancer vos 3 leads." });
    expect(await service.weeklySummaryText(TENANT_A, stats)).toBeUndefined();
    expect(calls).toHaveLength(1);
  });
});

describe("boundAggregates", () => {
  it("keeps numbers, booleans, codes and ISO dates; drops free text, identities, digit runs and depth", () => {
    expect(boundAggregates({
      total: 4,
      ratio: 0.12345,
      ok: true,
      status: "devis_envoye",
      since: "2026-10-01T00:00:00.000Z",
      label: "Cabinet Kone",
      phone: 2250102030405,
      code: "0102030405",
      contactName: "kone",
      deep: { a: { b: { c: { d: 1 } } } },
      list: [1, "gagne", "Ama"]
    })).toEqual({ total: 4, ratio: 0.12, ok: true, status: "devis_envoye", since: "2026-10-01T00:00:00.000Z", list: [1, "gagne"] });
    expect(boundAggregates("not an object")).toEqual({});
  });

  it("accepts ISO country / currency codes and product slugs under their own keys only", () => {
    expect(boundAggregates({
      countryCode: "CI",
      currency: "XOF",
      productKey: "assurance-auto",
      byProduct: [{ product: "sante-groupe", received: 3 }],
      note: "ABC",
      contactName: "KONE",
      label: "jean-dupont-8",
      productFree: "Assurance Auto",
      source: "site-web",
      phoneLike: "assurance-0102030405"
    })).toEqual({
      countryCode: "CI",
      currency: "XOF",
      productKey: "assurance-auto",
      byProduct: [{ product: "sante-groupe", received: 3 }],
      source: "site-web"
    });
    expect(boundAggregates({ countryCode: "Cote d'Ivoire", currency: "XOFX", productKey: "Auto Plus", product: "a@b.c" })).toEqual({});
  });
});

describe("system assist types", () => {
  it("keeps weekly_summary in the gateway catalogue but out of the broker UI assist types", () => {
    expect(aiAssistTypes).toContain("weekly_summary");
    expect(brokerAssistTypes).not.toContain("weekly_summary");
  });
});
