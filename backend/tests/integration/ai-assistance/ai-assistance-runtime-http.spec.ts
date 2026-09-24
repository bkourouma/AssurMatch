import { afterEach, describe, expect, it } from "vitest";
import { aiAssistanceStatusSchema, type AIAssistanceStatus } from "../../../../packages/shared/contracts/ai-assistance.contracts";
import { AIAssistanceAuditActions } from "../../../src/modules/ai/ai-assistance-audit-actions";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

describe("AI assistance runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("returns admin AI assistance status without model calls and audits metadata", async () => {
    harness = await createRuntimeHttpHarness();
    const admin = { actorId: "ai-admin", roles: ["ai_admin" as const], mfaVerified: true };
    const response = await harness.request("/admin/ai/assistance", { headers: actorHeaders(admin) });
    expect(response.status).toBe(200);
    const status = aiAssistanceStatusSchema.parse(await readJson<AIAssistanceStatus>(response));
    expect(status).toMatchObject({ surface: "admin_platform", enabled: false, modelCall: false, humanValidationRequired: true, auditPolicy: "metadata_only" });
    expect(status.flags.map((flag) => flag.key)).toEqual(expect.arrayContaining(["ai_broker_assistant_enabled", "ai_summary_enabled", "ai_recommendation_enabled"]));
    expect(harness.runtime.audit.writer.search({ action: AIAssistanceAuditActions.statusRead })[0]?.context).toMatchObject({ modelCall: false, enabled: false });
  });

  it("returns broker CRM AI assistance status for CRM readers", async () => {
    harness = await createRuntimeHttpHarness();
    const broker = {
      actorId: "broker",
      roles: ["broker_owner_pro" as const],
      partnerTenantId: "00000000-0000-4000-8000-000000001001",
      partnerPlan: "pro" as const,
      mfaVerified: true
    };
    const response = await harness.request("/broker/crm/ai-assistance", { headers: actorHeaders(broker) });
    expect(response.status).toBe(200);
    const status = aiAssistanceStatusSchema.parse(await readJson<AIAssistanceStatus>(response));
    expect(status).toMatchObject({ surface: "broker_crm", enabled: false, modelCall: false });
    expect(status.availableAssistTypes).toContain("lead_summary");
  });

  it("refuses non-AI admin role for admin assistance and audits refusal", async () => {
    harness = await createRuntimeHttpHarness();
    const support = { actorId: "support", roles: ["support_admin" as const], mfaVerified: true };
    const response = await harness.request("/admin/ai/assistance", { headers: actorHeaders(support) });
    expect(response.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: AIAssistanceAuditActions.statusRefused })[0]?.reason).toBe("forbidden_role");
  });
});
