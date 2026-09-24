import { afterEach, describe, expect, it } from "vitest";
import { aiInteractionSchema } from "../../../../packages/shared/contracts/ai.contracts";
import { AiAuditActions } from "../../../src/modules/ai/core/ai-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const aiAdmin: ActorContext = { actorId: "ai-admin", roles: ["ai_admin"], mfaVerified: true };
const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };

async function enableAdminAi(harness: RuntimeHttpHarness) {
  await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "ai_summary_enabled", scopeType: "global", value: true, reason: "admin ai runtime test" }, superAdmin, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
}

describe("admin AI insights runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("produces aggregate insights that require an explicit human validation", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await enableAdminAi(harness);

    expect((await readJson<{ enabled: boolean }>(await harness.request("/admin/ai/assistance", { headers: actorHeaders(aiAdmin) }))).enabled).toBe(true);

    const triage = aiInteractionSchema.parse(await readJson(await harness.request("/admin/ai/insights/admin_risk_triage", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: "{}" })));
    expect(triage.status).toBe("queued");
    await harness.runtime.aiGateway.processPending();
    const triageDone = aiInteractionSchema.parse(await readJson(await harness.request(`/admin/ai/insights/${triage.id}`, { headers: actorHeaders(aiAdmin) })));
    expect(triageDone.status).toBe("completed");
    expect(triageDone.outputText).toContain("Triage indicatif");
    expect(triageDone.outputText).toContain(triageDone.disclaimer);
    expect(triageDone.humanValidationStatus).toBe("pending");

    const report = aiInteractionSchema.parse(await readJson(await harness.request("/admin/ai/insights/activity_report", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: "{}" })));
    await harness.runtime.aiGateway.processPending();
    expect(aiInteractionSchema.parse(await readJson(await harness.request(`/admin/ai/insights/${report.id}`, { headers: actorHeaders(superAdmin) }))).outputText).toContain("Rapport d'activite");

    const offerInsight = aiInteractionSchema.parse(await readJson(await harness.request("/admin/ai/insights/offer_consistency_check", { method: "POST", headers: { ...actorHeaders(aiAdmin), ...json }, body: JSON.stringify({ offerId: seed.offer.id }) })));
    await harness.runtime.aiGateway.processPending();
    const offerDone = aiInteractionSchema.parse(await readJson(await harness.request(`/admin/ai/insights/${offerInsight.id}`, { headers: actorHeaders(aiAdmin) })));
    expect(offerDone.status).toBe("completed");
    expect(offerDone.outputText).toContain("Verification indicative de l'offre");

    const validated = aiInteractionSchema.parse(await readJson(await harness.request(`/admin/ai/insights/${triage.id}/validation`, { method: "POST", headers: { ...actorHeaders(aiAdmin), ...json }, body: JSON.stringify({ decision: "approved" }) })));
    expect(validated.humanValidationStatus).toBe("approved");
    expect(harness.runtime.audit.writer.search({ action: AiAuditActions.validated })[0]?.context).toMatchObject({ decision: "approved", modelCall: false });

    const listed = await readJson<Array<{ id: string }>>(await harness.request("/admin/ai/insights", { headers: actorHeaders(aiAdmin) }));
    expect(listed.map((item) => item.id)).toEqual(expect.arrayContaining([triage.id, offerInsight.id]));
    expect((await harness.request("/admin/ai/insights/offer_consistency_check", { method: "POST", headers: { ...actorHeaders(aiAdmin), ...json }, body: "{}" })).status).toBe(400);
  });

  it("never escalates privileges through AI and refuses non-AI roles or a closed flag", async () => {
    harness = await createRuntimeHttpHarness();
    await enableAdminAi(harness);

    // The AI capability alone does not unlock dashboard-scoped data.
    expect((await harness.request("/admin/ai/insights/admin_risk_triage", { method: "POST", headers: { ...actorHeaders(aiAdmin), ...json }, body: "{}" })).status).toBe(403);
    expect((await harness.request("/admin/ai/insights", { headers: actorHeaders(support) })).status).toBe(403);
    expect((await harness.request("/admin/ai/insights/activity_report", { method: "POST", headers: { ...actorHeaders(support), ...json }, body: "{}" })).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: AiAuditActions.refused }).some((entry) => entry.reason === "forbidden_role")).toBe(true);

    await harness.runtime.featureFlags.service.applyCompliancePolicy({ key: "ai_summary_enabled", scopeType: "global", value: false, reason: "close ai" }, superAdmin, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
    const refused = aiInteractionSchema.parse(await readJson(await harness.request("/admin/ai/insights/activity_report", { method: "POST", headers: { ...actorHeaders(superAdmin), ...json }, body: "{}" })));
    expect(refused).toMatchObject({ status: "refused", refusalReason: "ai_disabled", outputText: null });
    expect(harness.runtime.audit.writer.search({ action: AiAuditActions.refused }).at(-1)?.context).toMatchObject({ modelCall: false });
  });
});
