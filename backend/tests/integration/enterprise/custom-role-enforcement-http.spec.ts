import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { partnerCustomRoleAssignmentSchema, partnerCustomRoleSchema } from "../../../../packages/shared/contracts/enterprise.contracts";
import { aiInteractionSchema } from "../../../../packages/shared/contracts/ai.contracts";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AiAuditActions } from "../../../src/modules/ai/core/ai-audit-actions";
import { QuoteAuditActions } from "../../../src/modules/audit-logs/quote-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { EnterpriseAuditActions } from "../../../src/modules/enterprise/enterprise-audit-actions";
import { brokerUser } from "../broker-self-service/self-service-helpers";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const TENANT = "00000000-0000-4000-8000-0000000064a1";
const OTHER_TENANT = "00000000-0000-4000-8000-0000000064b1";
const STARTER_TENANT = "00000000-0000-4000-8000-0000000064c1";
const json = { "content-type": "application/json" };

const enterprise = (actor: ActorContext): ActorContext => ({ ...actor, partnerPlan: "enterprise" });

async function put(harness: RuntimeHttpHarness, actor: ActorContext, userId: string, body: unknown): Promise<Response> {
  return harness.request(`/broker/enterprise/members/${userId}/custom-role`, { method: "PUT", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify(body) });
}

async function createRole(harness: RuntimeHttpHarness, actor: ActorContext, name: string, permissions: string[]) {
  const response = await harness.request("/broker/enterprise/roles", { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify({ name, permissions, reason: "Restriction interne" }) });
  expect(response.status).toBe(201);
  return partnerCustomRoleSchema.parse(await readJson(response));
}

function get(harness: RuntimeHttpHarness, actor: ActorContext, path: string): Promise<Response> {
  return harness.request(path, { headers: actorHeaders(actor) });
}

describe("spec 064 custom roles are enforced on the next request", () => {
  let harness: RuntimeHttpHarness | undefined;
  const previousCrmFlag = process.env.ASSURMATCH_BROKER_CRM_ENABLED;

  beforeEach(() => {
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = "true";
  });

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    process.env.ASSURMATCH_BROKER_CRM_ENABLED = previousCrmFlag;
  });

  async function setup() {
    harness = await createRuntimeHttpHarness();
    const owner = enterprise(await brokerUser(harness, TENANT, "broker_owner_pro"));
    const manager = enterprise(await brokerUser(harness, TENANT, "broker_manager"));
    const agent = enterprise(await brokerUser(harness, TENANT, "broker_agent"));
    const readOnly = enterprise(await brokerUser(harness, TENANT, "broker_read_only"));
    const otherOwner = enterprise(await brokerUser(harness, OTHER_TENANT, "broker_owner_pro"));
    const otherAgent = enterprise(await brokerUser(harness, OTHER_TENANT, "broker_agent"));
    return { harness, owner, manager, agent, readOnly, otherOwner, otherAgent };
  }

  it("restricts an agent from the request that follows the assignment, audits the refusals and restores access when cleared", async () => {
    const { harness, owner, manager, agent } = await setup();
    const lead = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-064-1", partnerTenantId: TENANT, assignmentReason: "routing", publicReference: "AM-064-1" }, owner);
    await harness.runtime.leads.assignments.updateCrmMetadata(lead.id, { assignedAdvisorId: agent.actorId as string }, owner);

    // Without a custom role the agent behaves as before: assigned CRM lead reads, no export.
    expect((await get(harness, agent, "/broker/crm/leads")).status).toBe(200);
    expect((await get(harness, agent, `/broker/crm/leads/${lead.id}`)).status).toBe(200);
    expect((await get(harness, agent, "/broker/starter/leads")).status).toBe(200);
    expect((await get(harness, agent, "/broker/crm/leads/export.csv")).status).toBe(403);
    const meBefore = await readJson<ActorContext>(await get(harness, agent, "/auth/me"));
    expect(meBefore.customRole).toBeUndefined();
    expect(meBefore.customRolePermissions).toBeUndefined();

    const role = await createRole(harness, owner, "Lecture des leads", ["broker_leads:read"]);
    expect(role.memberIds).toEqual([]);
    const assigned = partnerCustomRoleAssignmentSchema.parse(await readJson(await put(harness, manager, agent.actorId as string, { customRoleId: role.id, reason: "Periode d'essai" })));
    expect(assigned).toEqual({ userId: agent.actorId, customRole: { id: role.id, name: "Lecture des leads" } });

    // The very next request is restricted (the guard cache was invalidated by the assignment).
    const refusedBefore = harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmAccessRefused }).length;
    expect((await get(harness, agent, "/broker/crm/leads")).status).toBe(403);
    expect((await get(harness, agent, `/broker/crm/leads/${lead.id}`)).status).toBe(403);
    expect((await get(harness, agent, "/broker/crm/leads/export.csv")).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmAccessRefused }).length).toBeGreaterThan(refusedBefore);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmAccessRefused }).at(-1)?.reason).toBe("missing_crm_read_permission");
    // What the custom role still grants keeps working.
    expect((await get(harness, agent, "/broker/starter/leads")).status).toBe(200);

    const me = await readJson<ActorContext>(await get(harness, agent, "/auth/me"));
    expect(me.customRole).toEqual({ id: role.id, name: "Lecture des leads" });
    expect(me.customRolePermissions).toEqual(["broker_leads:read"]);

    const assignedAudit = harness.runtime.audit.writer.search({ action: EnterpriseAuditActions.customRoleAssigned });
    expect(assignedAudit).toHaveLength(1);
    expect(assignedAudit[0]).toMatchObject({ targetId: agent.actorId, result: "success", reason: "Periode d'essai", context: { before: null, after: { name: "Lecture des leads" } } });
    // The audit writer masks every identifier of the context (PII rule): the role is traced by its name.
    const listed = await readJson<Array<{ id: string; memberIds: string[] }>>(await get(harness, manager, "/broker/enterprise/roles"));
    expect(listed.find((entry) => entry.id === role.id)?.memberIds).toEqual([agent.actorId]);

    // A member holds at most one custom role: assigning another one moves the member.
    const crmRole = await createRole(harness, owner, "CRM assigne", ["broker_crm:read_assigned", "broker_leads:read"]);
    await put(harness, owner, agent.actorId as string, { customRoleId: crmRole.id, reason: "Nouveau perimetre" });
    const afterMove = await readJson<Array<{ id: string; memberIds: string[] }>>(await get(harness, owner, "/broker/enterprise/roles"));
    expect(afterMove.find((entry) => entry.id === role.id)?.memberIds).toEqual([]);
    expect(afterMove.find((entry) => entry.id === crmRole.id)?.memberIds).toEqual([agent.actorId]);
    expect((await get(harness, agent, "/broker/crm/leads")).status).toBe(200);

    // Clearing the role restores the base role immediately.
    await put(harness, owner, agent.actorId as string, { customRoleId: null, reason: "Fin de la restriction" }).then((response) => expect(response.status).toBe(200));
    expect(harness.runtime.audit.writer.search({ action: EnterpriseAuditActions.customRoleUnassigned })[0]).toMatchObject({ targetId: agent.actorId, context: { before: { name: "CRM assigne" }, after: null } });
    const meCleared = await readJson<ActorContext>(await get(harness, agent, "/auth/me"));
    expect(meCleared.customRole).toBeUndefined();
    expect((await get(harness, agent, "/broker/starter/leads")).status).toBe(200);
  });

  it("applies a role update to its members on the next request and restricts a manager's export", async () => {
    const { harness, owner, manager } = await setup();
    await harness.runtime.leads.assignments.create({ quoteRequestId: "q-064-2", partnerTenantId: TENANT, assignmentReason: "routing", publicReference: "AM-064-2" }, owner);
    expect((await get(harness, manager, "/broker/crm/leads/export.csv")).status).toBe(200);

    const role = await createRole(harness, owner, "Sans export", ["broker_crm:read", "broker_crm:update", "broker_leads:read"]);
    const target = await brokerUser(harness, TENANT, "broker_manager");
    // D2: only an owner targets a manager.
    await put(harness, owner, target.actorId as string, { customRoleId: role.id, reason: "Perimetre sans export" });
    const restricted = enterprise(target);
    expect((await get(harness, restricted, "/broker/crm/leads")).status).toBe(200);
    expect((await get(harness, restricted, "/broker/crm/leads/export.csv")).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmExportRefused }).at(-1)?.reason).toBe("missing_export_permission");

    // The owner extends the role: the member is no longer blocked at the very next request.
    const updated = await harness.request(`/broker/enterprise/roles/${role.id}`, { method: "PATCH", headers: { ...actorHeaders(owner), ...json }, body: JSON.stringify({ permissions: ["broker_crm:read", "broker_crm:export", "broker_leads:read"], reason: "Export autorise" }) });
    expect(updated.status).toBe(200);
    expect((await get(harness, restricted, "/broker/crm/leads/export.csv")).status).toBe(200);
    // And narrows it again.
    await harness.request(`/broker/enterprise/roles/${role.id}`, { method: "PATCH", headers: { ...actorHeaders(owner), ...json }, body: JSON.stringify({ permissions: ["broker_leads:read"], reason: "Retrait du CRM" }) });
    expect((await get(harness, restricted, "/broker/crm/leads")).status).toBe(403);
  });

  it("never lets a custom role grant more than the base role", async () => {
    const { harness, owner, manager, agent, readOnly } = await setup();
    const lead = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-064-3", partnerTenantId: TENANT, assignmentReason: "routing", publicReference: "AM-064-3" }, owner);
    await harness.runtime.leads.assignments.updateCrmMetadata(lead.id, { assignedAdvisorId: agent.actorId as string }, owner);
    const wide = await createRole(harness, owner, "Tout le CRM", ["broker_crm:read", "broker_crm:update", "broker_crm:export", "broker_crm:assign", "broker_leads:read", "broker_leads:update", "broker_leads:export", "notifications:read"]);

    await put(harness, manager, readOnly.actorId as string, { customRoleId: wide.id, reason: "Test elevation" });
    expect((await get(harness, readOnly, "/broker/crm/leads")).status).toBe(200);
    const note = await harness.request(`/broker/crm/leads/${lead.id}/notes`, { method: "POST", headers: { ...actorHeaders(readOnly), ...json }, body: JSON.stringify({ body: "Tentative" }) });
    expect(note.status).toBe(403);
    expect((await get(harness, readOnly, "/broker/crm/leads/export.csv")).status).toBe(403);
    const meReadOnly = await readJson<ActorContext>(await get(harness, readOnly, "/auth/me"));
    expect(meReadOnly.customRolePermissions).toEqual(["broker_crm:read", "broker_leads:read"]);

    await put(harness, manager, agent.actorId as string, { customRoleId: wide.id, reason: "Test elevation" });
    expect((await get(harness, agent, "/broker/crm/leads/export.csv")).status).toBe(403);
    const meAgent = await readJson<ActorContext>(await get(harness, agent, "/auth/me"));
    expect(meAgent.customRolePermissions).toEqual(["broker_leads:read", "broker_leads:update", "notifications:read"]);
  });

  it("applies the restriction to the dashboard, the in-app inbox and the AI assistance status", async () => {
    const { harness, owner, manager, agent } = await setup();
    await harness.runtime.featureFlags.service.setFlag({ key: "broker_dashboard_enabled", scopeType: "global", value: true, reason: "spec 064 dashboard restriction" }, { actorId: "test-admin", roles: ["super_admin"], mfaVerified: true });
    expect((await get(harness, agent, "/broker/dashboard")).status).toBe(200);
    expect((await get(harness, agent, "/broker/notifications/inbox")).status).toBe(200);
    expect((await get(harness, agent, "/broker/crm/ai-assistance")).status).toBe(200);

    const crmOnly = await createRole(harness, owner, "CRM seul", ["broker_crm:read_assigned"]);
    await put(harness, manager, agent.actorId as string, { customRoleId: crmOnly.id, reason: "Perimetre CRM" });
    expect((await get(harness, agent, "/broker/dashboard")).status).toBe(403);
    expect((await get(harness, agent, "/broker/notifications/inbox")).status).toBe(403);
    expect((await get(harness, agent, "/broker/starter/leads")).status).toBe(403);
    expect((await get(harness, agent, "/broker/crm/ai-assistance")).status).toBe(200);
    // Account, offers, team and billing are outside the catalogue: the base role keeps deciding.
    expect((await get(harness, agent, "/broker/team")).status).toBe(200);

    const leadsOnly = await createRole(harness, owner, "Leads seuls", ["broker_leads:read", "notifications:read"]);
    await put(harness, manager, agent.actorId as string, { customRoleId: leadsOnly.id, reason: "Perimetre leads" });
    expect((await get(harness, agent, "/broker/dashboard")).status).toBe(200);
    expect((await get(harness, agent, "/broker/notifications/inbox")).status).toBe(200);
    expect((await get(harness, agent, "/broker/crm/ai-assistance")).status).toBe(403);
  });

  it("only lets an owner assign or clear the custom role of a manager, and keeps the members when a role is updated", async () => {
    const { harness, owner, manager, agent } = await setup();
    const otherManager = enterprise(await brokerUser(harness, TENANT, "broker_manager"));
    const role = await createRole(harness, owner, "Lecture", ["broker_leads:read", "broker_crm:read"]);
    const refusals = () => harness.runtime.audit.writer.search({ action: EnterpriseAuditActions.accessRefused });

    expect((await put(harness, manager, otherManager.actorId as string, { customRoleId: role.id, reason: "Test de garde" })).status).toBe(403);
    expect(refusals().at(-1)?.reason).toBe("owner_required_for_manager_target");
    expect((await put(harness, manager, otherManager.actorId as string, { customRoleId: null, reason: "Test de garde" })).status).toBe(403);
    expect(refusals().at(-1)?.reason).toBe("owner_required_for_manager_target");
    expect((await put(harness, owner, otherManager.actorId as string, { customRoleId: role.id, reason: "Decision du proprietaire" })).status).toBe(200);
    // A manager keeps targeting agents.
    expect((await put(harness, manager, agent.actorId as string, { customRoleId: role.id, reason: "Perimetre agent" })).status).toBe(200);
    // And a manager cannot clear the role of another manager either (the role is still there).
    expect((await put(harness, manager, otherManager.actorId as string, { customRoleId: null, reason: "Test de garde" })).status).toBe(403);
    expect((await readJson<ActorContext>(await get(harness, otherManager, "/auth/me"))).customRole).toBeDefined();

    // Editing the permissions of the role never rewrites its members.
    const updated = await harness.request(`/broker/enterprise/roles/${role.id}`, { method: "PATCH", headers: { ...actorHeaders(owner), ...json }, body: JSON.stringify({ permissions: ["broker_leads:read"], reason: "Perimetre reduit" }) });
    expect(updated.status).toBe(200);
    const stored = partnerCustomRoleSchema.parse(await readJson(updated));
    expect(stored.permissions).toEqual(["broker_leads:read"]);
    expect([...stored.memberIds].sort()).toEqual([agent.actorId, otherManager.actorId].sort());
    const listed = await readJson<Array<{ id: string; memberIds: string[] }>>(await get(harness, owner, "/broker/enterprise/roles"));
    expect(listed.find((entry) => entry.id === role.id)?.memberIds).toHaveLength(2);
  });

  it("closes the notification feeds under a custom role without notifications:read and refuses the validation of a tenant analysis without broker_crm:update", async () => {
    const { harness, owner, manager } = await setup();
    const compliance: ActorContext = { actorId: "compliance", roles: ["super_admin"], mfaVerified: true };
    for (const key of ["ai_broker_assistant_enabled", "ai_lead_scoring_enabled", "ai_duplicate_detection_enabled"]) {
      await harness.runtime.featureFlags.service.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "spec 064 restrictions" }, compliance, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
    }
    const lead = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-064-n", partnerTenantId: TENANT, assignmentReason: "routing", publicReference: "AM-064-N" }, owner);
    const notification = await harness.runtime.leads.brokerStarterNotifications.createLeadAssigned(lead.id);
    expect((await get(harness, manager, "/broker/crm/notifications")).status).toBe(200);
    expect((await get(harness, manager, "/broker/starter/notifications")).status).toBe(200);

    // A tenant-level analysis awaiting a human decision.
    const analysis = aiInteractionSchema.parse(await readJson(await harness.request("/broker/crm/ai/loss-analysis", { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: "{}" })));
    await harness.runtime.aiGateway.processPending();

    const restricted = await brokerUser(harness, TENANT, "broker_manager");
    const noNotifications = await createRole(harness, owner, "Sans notifications", ["broker_leads:read", "broker_crm:read"]);
    await put(harness, owner, restricted.actorId as string, { customRoleId: noNotifications.id, reason: "Perimetre sans notifications" });
    const member = enterprise(restricted);
    expect((await get(harness, member, "/broker/crm/notifications")).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmAccessRefused }).at(-1)?.reason).toBe("custom_role_restricted");
    expect((await get(harness, member, "/broker/starter/notifications")).status).toBe(403);
    const markRead = await harness.request(`/broker/starter/notifications/${notification.id}/read`, { method: "POST", headers: actorHeaders(member) });
    expect(markRead.status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerStarterNotificationViewed }).at(-1)).toMatchObject({ result: "refused", reason: "custom_role_restricted" });
    // The unrestricted manager still reads and marks them.
    expect((await harness.request(`/broker/starter/notifications/${notification.id}/read`, { method: "POST", headers: actorHeaders(manager) })).status).toBe(201);

    // The human validation of a PartnerTenant analysis needs broker_crm:update after the custom role too.
    const decision = { method: "POST", body: JSON.stringify({ decision: "approved" }) };
    expect((await harness.request(`/broker/crm/ai/interactions/${analysis.id}/validation`, { ...decision, headers: { ...actorHeaders(member), ...json } })).status).toBe(403);
    expect((await harness.request(`/broker/crm/ai/interactions/${analysis.id}/validation`, { ...decision, headers: { ...actorHeaders(manager), ...json } })).status).toBe(201);
  });

  it("refuses and audits assignments to oneself, an owner, another tenant's user or another tenant's role", async () => {
    const { harness, owner, manager, agent, otherOwner, otherAgent } = await setup();
    const role = await createRole(harness, owner, "Lecture", ["broker_leads:read"]);
    const otherRole = await createRole(harness, otherOwner, "Autre cabinet", ["broker_leads:read"]);
    const refusals = () => harness.runtime.audit.writer.search({ action: EnterpriseAuditActions.accessRefused });
    const body = { customRoleId: role.id, reason: "Test de garde" };

    expect((await put(harness, manager, manager.actorId as string, body)).status).toBe(403);
    expect(refusals().at(-1)?.reason).toBe("self_assignment");
    expect((await put(harness, manager, owner.actorId as string, body)).status).toBe(403);
    expect(refusals().at(-1)?.reason).toBe("owner_protected");
    expect((await put(harness, owner, owner.actorId as string, body)).status).toBe(403);

    // A user of another tenant answers exactly like an unknown one.
    const crossTenant = await put(harness, manager, otherAgent.actorId as string, body);
    const unknown = await put(harness, manager, "00000000-0000-4000-8000-000000000999", body);
    expect(crossTenant.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(JSON.stringify(await crossTenant.json()).replace(/correlationId":"[^"]+"/, "")).toBe(JSON.stringify(await unknown.json()).replace(/correlationId":"[^"]+"/, ""));
    expect(refusals().at(-1)?.reason).toBe("member_not_found");

    // A role of another tenant is not found; the member keeps no role.
    expect((await put(harness, manager, agent.actorId as string, { customRoleId: otherRole.id, reason: "Test de garde" })).status).toBe(404);
    expect(refusals().at(-1)?.reason).toBe("custom_role_not_found");
    expect((await put(harness, manager, agent.actorId as string, { customRoleId: "00000000-0000-4000-8000-000000000998", reason: "Test de garde" })).status).toBe(404);
    expect((await readJson<ActorContext>(await get(harness, agent, "/auth/me"))).customRole).toBeUndefined();
    expect(await readJson<Array<{ memberIds: string[] }>>(await get(harness, otherOwner, "/broker/enterprise/roles"))).toEqual([expect.objectContaining({ memberIds: [] })]);

    // Invalid payloads.
    expect((await put(harness, manager, agent.actorId as string, { customRoleId: "not-a-uuid", reason: "Test de garde" })).status).toBe(400);
    expect((await put(harness, manager, agent.actorId as string, { customRoleId: role.id })).status).toBe(400);
    expect((await harness.request("/broker/enterprise/members/not-a-uuid/custom-role", { method: "PUT", headers: { ...actorHeaders(manager), ...json }, body: JSON.stringify(body) })).status).toBe(400);
    expect(harness.runtime.audit.writer.search({ action: EnterpriseAuditActions.customRoleAssigned })).toHaveLength(0);
  });

  it("requires the Enterprise plan, team write permission, MFA and a writable tenant", async () => {
    const { harness, owner, manager, agent } = await setup();
    const role = await createRole(harness, owner, "Lecture", ["broker_leads:read"]);
    const body = { customRoleId: role.id, reason: "Test de garde" };
    const refusals = () => harness.runtime.audit.writer.search({ action: EnterpriseAuditActions.accessRefused });

    expect((await put(harness, { ...manager, partnerPlan: "pro" }, agent.actorId as string, body)).status).toBe(403);
    expect(refusals().at(-1)?.reason).toBe("plan_enterprise_required");
    expect((await put(harness, agent, agent.actorId as string, body)).status).toBe(403);
    expect(refusals().at(-1)?.reason).toBe("team_write_permission_required");
    expect((await put(harness, enterprise(await brokerUser(harness, TENANT, "broker_read_only")), agent.actorId as string, body)).status).toBe(403);
    expect((await put(harness, { ...manager, mfaVerified: false }, agent.actorId as string, body)).status).toBe(403);
    expect((await harness.request(`/broker/enterprise/members/${agent.actorId}/custom-role`, { method: "PUT", headers: json, body: JSON.stringify(body) })).status).toBe(401);
    expect((await get(harness, agent, "/auth/me")).status).toBe(200);
    expect((await readJson<ActorContext>(await get(harness, agent, "/auth/me"))).customRole).toBeUndefined();
  });

  it("exports the Starter and CRM lists with a requested and a completed audit and neutralised cells", async () => {
    harness = await createRuntimeHttpHarness();
    const starter: ActorContext = await brokerUser(harness, STARTER_TENANT, "broker_owner_starter");
    const starterOwner: ActorContext = { ...starter, partnerPlan: "starter" };
    const pro: ActorContext = { ...(await brokerUser(harness, TENANT, "broker_owner_pro")), partnerPlan: "pro" };
    await harness.runtime.leads.assignments.create({ quoteRequestId: "q-064-s", partnerTenantId: STARTER_TENANT, assignmentReason: "routing", publicReference: "=HYPERLINK(1)", contact: { email: "ama@example.test", phone: "+2250102030405" } }, starterOwner);
    await harness.runtime.leads.assignments.create({ quoteRequestId: "q-064-c", partnerTenantId: TENANT, assignmentReason: "routing", publicReference: "+AM-064-C", contact: { email: "kone@example.test" } }, pro);

    const starterCsv = await get(harness, starterOwner, "/broker/starter/leads/export.csv?maxRows=10");
    expect(starterCsv.status).toBe(200);
    const starterBody = await starterCsv.text();
    expect(starterBody).toContain(`"'=HYPERLINK(1)"`);
    expect(starterBody).not.toMatch(/example\.test|ama@|2250102030405/);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerStarterExportRequested })).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerStarterExportCompleted })[0]?.context).toMatchObject({ rowCount: 1 });

    const crmCsv = await get(harness, pro, "/broker/crm/leads/export.csv?maxRows=10&search=kone");
    expect(crmCsv.status).toBe(200);
    const crmBody = await crmCsv.text();
    expect(crmBody).toContain(`"'+AM-064-C"`);
    expect(crmBody).not.toMatch(/example\.test/);
    const requested = harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmExportRequested });
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatchObject({ result: "success", scope: { partnerTenantId: TENANT } });
    expect(JSON.stringify(requested[0])).not.toMatch(/kone/);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmExportCompleted })).toHaveLength(1);

    // An agent has no export permission: refused and audited, nothing requested.
    const agent = await brokerUser(harness, TENANT, "broker_agent");
    expect((await get(harness, { ...agent, partnerPlan: "pro" }, "/broker/crm/leads/export.csv")).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmExportRequested })).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: QuoteAuditActions.brokerCrmExportRefused })).toHaveLength(1);
  });

  it("lists the loss analyses of the tenant only (newest first), empty for a fresh tenant", async () => {
    const { harness, owner, otherOwner, readOnly, agent } = await setup();
    const compliance: ActorContext = { actorId: "compliance", roles: ["super_admin"], mfaVerified: true };
    for (const key of ["ai_broker_assistant_enabled", "ai_lead_scoring_enabled", "ai_duplicate_detection_enabled"]) {
      await harness.runtime.featureFlags.service.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "spec 064 loss analysis list" }, compliance, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
    }
    const listPath = "/broker/crm/ai/loss-analysis";
    expect(await readJson<unknown[]>(await get(harness, owner, listPath))).toEqual([]);
    expect(await readJson<unknown[]>(await get(harness, otherOwner, listPath))).toEqual([]);

    const first = aiInteractionSchema.parse(await readJson(await harness.request(listPath, { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: "{}" })));
    await harness.runtime.aiGateway.processPending();
    const second = aiInteractionSchema.parse(await readJson(await harness.request(listPath, { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: "{}" })));
    await harness.runtime.aiGateway.processPending();
    // Another tenant's analysis and a lead-level interaction never appear.
    await harness.request(listPath, { method: "POST", headers: { ...actorHeaders(otherOwner), ...json }, body: "{}" });
    await harness.runtime.aiGateway.processPending();

    const listed = (await readJson<unknown[]>(await get(harness, owner, listPath))).map((item) => aiInteractionSchema.parse(item));
    expect(listed.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(listed.every((item) => item.assistType === "loss_analysis" && item.surface === "broker_crm" && item.status === "completed")).toBe(true);
    expect(listed.every((item) => item.humanValidationStatus === "pending" || item.humanValidationStatus === "not_required")).toBe(true);
    expect(JSON.stringify(listed)).not.toMatch(/example\.test|@/);
    const otherList = (await readJson<unknown[]>(await get(harness, otherOwner, listPath))).map((item) => aiInteractionSchema.parse(item));
    expect(otherList).toHaveLength(1);
    expect(otherList.map((item) => item.id)).not.toContain(first.id);
    expect(harness.runtime.audit.writer.search({ action: AiAuditActions.read }).some((entry) => entry.targetId === "loss_analysis_list")).toBe(true);

    // Tenant-wide aggregates: readers with the sensitive search read them, an assigned-only agent does not; the route is not shadowed by a parameter.
    expect((await get(harness, readOnly, listPath)).status).toBe(200);
    expect((await get(harness, agent, listPath)).status).toBe(403);
    expect((await get(harness, { ...owner, partnerPlan: "pro" }, listPath)).status).toBe(403);
    expect((await harness.request(listPath)).status).toBe(401);
    const starterOwner: ActorContext = { ...(await brokerUser(harness, TENANT, "broker_owner_starter")), partnerPlan: "starter" };
    expect((await get(harness, starterOwner, listPath)).status).toBe(403);
    const asRole = (role: AssurMatchRole): ActorContext => ({ actorId: "x", roles: [role], partnerTenantId: TENANT, partnerPlan: "enterprise", mfaVerified: true });
    expect((await get(harness, asRole("finance_admin"), listPath)).status).toBe(403);
  });
});
