import { afterEach, describe, expect, it } from "vitest";
import { aiInteractionSchema, aiLeadScoreSchema, brokerAiOptOutStatusSchema } from "../../../../packages/shared/contracts/ai.contracts";
import { AiAuditActions } from "../../../src/modules/ai/core/ai-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const TENANT_A = "00000000-0000-4000-8000-00000000a001";
const TENANT_B = "00000000-0000-4000-8000-00000000b001";
const owner: ActorContext = { actorId: "owner-a", roles: ["broker_owner_pro"], partnerTenantId: TENANT_A, partnerPlan: "pro", mfaVerified: true };
const readOnly: ActorContext = { actorId: "ro-a", roles: ["broker_read_only"], partnerTenantId: TENANT_A, partnerPlan: "pro", mfaVerified: true };
const otherOwner: ActorContext = { actorId: "owner-b", roles: ["broker_owner_pro"], partnerTenantId: TENANT_B, partnerPlan: "pro", mfaVerified: true };
const enterprise: ActorContext = { actorId: "owner-e", roles: ["broker_owner_pro"], partnerTenantId: TENANT_B, partnerPlan: "enterprise", mfaVerified: true };
const compliance: ActorContext = { actorId: "compliance", roles: ["super_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };

async function enableBrokerAi(harness: RuntimeHttpHarness) {
  for (const key of ["ai_broker_assistant_enabled", "ai_lead_scoring_enabled", "ai_duplicate_detection_enabled"]) {
    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "broker ai runtime test" }, compliance, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
  }
}

describe("broker CRM AI assistance runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  it("produces tenant-bound suggestions, validates scores by a human and isolates tenants", async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    await enableBrokerAi(harness);
    const lead = await harness.runtime.leads.assignments.create({
      quoteRequestId: "q-ai-1",
      partnerTenantId: TENANT_A,
      assignmentReason: "routing",
      publicReference: "AM-AI-1",
      countryCode: "CI",
      productKey: "auto",
      contact: { displayName: "Ama Kone", email: "ama.kone@example.test", phone: "+2250102030405" },
      answers: { vehicle_use: "prive", vehicle_year: "2019", parking: "" }
    }, owner);
    await harness.runtime.leads.assignments.create({
      quoteRequestId: "q-ai-2",
      partnerTenantId: TENANT_A,
      assignmentReason: "routing",
      publicReference: "AM-AI-2",
      countryCode: "CI",
      productKey: "auto",
      contact: { email: "AMA.KONE@example.test", phone: "01 02 03 04 05" },
      answers: { vehicle_use: "pro" }
    }, owner);

    const queued = await harness.request(`/broker/crm/leads/${lead.id}/ai/lead_summary`, { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: "{}" });
    expect(queued.status).toBe(201);
    const summary = aiInteractionSchema.parse(await readJson(queued));
    expect(summary.status).toBe("queued");
    expect(await harness.runtime.aiGateway.processPending()).toBe(1);

    const listed = await readJson<Array<{ id: string; status: string; outputText: string | null }>>(await harness.request(`/broker/crm/leads/${lead.id}/ai`, { headers: actorHeaders(readOnly) }));
    expect(listed).toHaveLength(1);
    expect(listed[0]?.status).toBe("completed");
    expect(listed[0]?.outputText).toContain("parking");
    expect(listed[0]?.outputText).toContain(summary.disclaimer);
    expect(listed[0]?.outputText).not.toContain("Ama");
    const completedAudit = harness.runtime.audit.writer.search({ action: AiAuditActions.completed })[0];
    expect(JSON.stringify(completedAudit)).not.toContain("example.test");
    expect(completedAudit?.scope).toMatchObject({ partnerTenantId: TENANT_A, targetId: lead.id });

    expect((await harness.request(`/broker/crm/ai/interactions/${summary.id}`, { headers: actorHeaders(otherOwner) })).status).toBe(404);
    expect((await harness.request(`/broker/crm/leads/${lead.id}/ai/relaunch_message`, { method: "POST", headers: { ...actorHeaders(readOnly), ...json }, body: "{}" })).status).toBe(403);

    const scoreResponse = await harness.request(`/broker/crm/leads/${lead.id}/ai/lead_score`, { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: "{}" });
    const score = aiInteractionSchema.parse(await readJson(scoreResponse));
    await harness.runtime.aiGateway.processPending();
    const scored = aiInteractionSchema.parse(await readJson(await harness.request(`/broker/crm/ai/interactions/${score.id}`, { headers: actorHeaders(owner) })));
    expect(scored.status).toBe("completed");
    expect(scored.humanValidationStatus).toBe("pending");
    expect(aiLeadScoreSchema.parse(scored.outputData).score).toBeGreaterThan(0);
    expect((await harness.request(`/broker/crm/ai/interactions/${score.id}/validation`, { method: "POST", headers: { ...actorHeaders(readOnly), ...json }, body: JSON.stringify({ decision: "approved" }) })).status).toBe(403);
    const validated = aiInteractionSchema.parse(await readJson(await harness.request(`/broker/crm/ai/interactions/${score.id}/validation`, { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: JSON.stringify({ decision: "approved" }) })));
    expect(validated.humanValidationStatus).toBe("approved");
    expect(harness.runtime.audit.writer.search({ action: AiAuditActions.validated })[0]?.context).toMatchObject({ decision: "approved", modelCall: false });

    const dup = aiInteractionSchema.parse(await readJson(await harness.request(`/broker/crm/leads/${lead.id}/ai/duplicate_hint`, { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: "{}" })));
    await harness.runtime.aiGateway.processPending();
    const dupDone = aiInteractionSchema.parse(await readJson(await harness.request(`/broker/crm/ai/interactions/${dup.id}`, { headers: actorHeaders(owner) })));
    expect(dupDone.outputText).toContain("1 demande(s) similaire(s)");

    expect((await harness.request(`/broker/crm/leads/${lead.id}/ai/not_a_type`, { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: "{}" })).status).toBe(400);
  });

  it("honours partner opt-out, plan gates for loss analysis and Starter CRM denial", async () => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
    harness = await createRuntimeHttpHarness();
    await enableBrokerAi(harness);
    const lead = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-ai-3", partnerTenantId: TENANT_A, assignmentReason: "routing", publicReference: "AM-AI-3", countryCode: "CI", productKey: "auto" }, owner);

    expect((await harness.request("/broker/crm/ai/opt-out", { method: "PUT", headers: { ...actorHeaders(readOnly), ...json }, body: JSON.stringify({ optOut: true, reason: "test" }) })).status).toBe(403);
    const optedOut = brokerAiOptOutStatusSchema.parse(await readJson(await harness.request("/broker/crm/ai/opt-out", { method: "PUT", headers: { ...actorHeaders(owner), ...json }, body: JSON.stringify({ optOut: true, reason: "Le cabinet refuse l'IA" }) })));
    expect(optedOut).toMatchObject({ partnerTenantId: TENANT_A, optedOut: true });
    expect(harness.runtime.audit.writer.search({ action: AiAuditActions.partnerOptOutChanged })).toHaveLength(1);
    const refused = aiInteractionSchema.parse(await readJson(await harness.request(`/broker/crm/leads/${lead.id}/ai/lead_summary`, { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: "{}" })));
    expect(refused).toMatchObject({ status: "refused", refusalReason: "ai_disabled" });
    expect((await readJson<{ enabled: boolean }>(await harness.request("/broker/crm/ai-assistance", { headers: actorHeaders(owner) }))).enabled).toBe(false);

    const proLoss = aiInteractionSchema.parse(await readJson(await harness.request("/broker/crm/ai/loss-analysis", { method: "POST", headers: { ...actorHeaders(otherOwner), ...json }, body: "{}" })));
    expect(proLoss.status).toBe("refused");
    expect(harness.runtime.audit.writer.search({ action: AiAuditActions.refused }).at(-1)?.context).toMatchObject({ reasons: ["plan_enterprise_required"] });
    const enterpriseLoss = aiInteractionSchema.parse(await readJson(await harness.request("/broker/crm/ai/loss-analysis", { method: "POST", headers: { ...actorHeaders(enterprise), ...json }, body: "{}" })));
    expect(enterpriseLoss.status).toBe("queued");
    await harness.runtime.aiGateway.processPending();
    const lossDone = aiInteractionSchema.parse(await readJson(await harness.request(`/broker/crm/ai/interactions/${enterpriseLoss.id}`, { headers: actorHeaders(enterprise) })));
    expect(lossDone.status).toBe("completed");
    expect(lossDone.outputText).toContain("0 lead(s) perdus");

    const starter: ActorContext = { actorId: "starter", roles: ["broker_owner_starter"], partnerTenantId: TENANT_A, partnerPlan: "starter", mfaVerified: true };
    expect((await harness.request(`/broker/crm/leads/${lead.id}/ai/lead_summary`, { method: "POST", headers: { ...actorHeaders(starter), ...json }, body: "{}" })).status).toBe(403);
  });
});
