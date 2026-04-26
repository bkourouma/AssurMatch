import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerCrmAccessPolicy } from "../../../src/modules/leads/broker-crm-access-policy";
import type { LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";

const owner: ActorContext = { actorId: "owner-a", roles: ["broker_owner_pro"], partnerTenantId: "broker-a", partnerPlan: "pro", mfaVerified: true };
const assignment: LeadAssignmentRecord = {
  id: "lead-a",
  quoteRequestId: "quote-a",
  partnerTenantId: "broker-a",
  status: "assigned",
  assignedAt: new Date("2026-04-26T00:00:00.000Z"),
  assignmentReason: "routing",
  createdAt: new Date("2026-04-26T00:00:00.000Z"),
  updatedAt: new Date("2026-04-26T00:00:00.000Z")
};

describe("BrokerCrmAccessPolicy", () => {
  it("refuses CRM when the flag is absent false or not resolved", () => {
    const audit = new AuditLogWriter();
    expect(() => new BrokerCrmAccessPolicy(audit).assertCrmAccess(owner)).toThrow("Broker CRM access denied");
    expect(() => new BrokerCrmAccessPolicy(audit, { brokerCrmEnabled: false }).assertCrmAccess(owner)).toThrow("Broker CRM access denied");
    expect(() => new BrokerCrmAccessPolicy(audit, {}).assertCrmAccess(owner)).toThrow("Broker CRM access denied");
    expect(audit.search({ action: "broker_crm.access_refused", result: "refused" })).toHaveLength(3);
  });

  it("allows CRM only when flag is true and plan is Pro or Enterprise", () => {
    const policy = new BrokerCrmAccessPolicy(new AuditLogWriter(), { brokerCrmEnabled: true });
    const actorWithoutPlan: ActorContext = { actorId: "owner-no-plan", roles: ["broker_owner_pro"], partnerTenantId: "broker-a", mfaVerified: true };

    expect(() => policy.assertLeadRead(owner, assignment)).not.toThrow();
    expect(() => policy.assertLeadRead({ ...owner, partnerPlan: "enterprise" }, assignment)).not.toThrow();
    expect(() => policy.assertCrmAccess(actorWithoutPlan)).toThrow("Broker CRM access denied");
    expect(() => policy.assertCrmAccess({ ...owner, partnerPlan: "starter" })).toThrow("Broker CRM access denied");
  });

  it("refuses every Starter tenant broker role even when CRM permissions exist", () => {
    const policy = new BrokerCrmAccessPolicy(new AuditLogWriter(), { brokerCrmEnabled: true });

    expect(() => policy.assertCrmAccess({ ...owner, roles: ["broker_owner_starter"], partnerPlan: "starter" })).toThrow("Broker CRM access denied");
    expect(() => policy.assertCrmAccess({ ...owner, roles: ["broker_manager"], partnerPlan: "starter" })).toThrow("Broker CRM access denied");
    expect(() => policy.assertCrmAccess({ ...owner, roles: ["broker_agent"], partnerPlan: "starter" })).toThrow("Broker CRM access denied");
    expect(() => policy.assertCrmAccess({ ...owner, roles: ["broker_read_only"], partnerPlan: "starter" })).toThrow("Broker CRM access denied");
  });

  it("limits agents to assigned leads and blocks read-only mutations", () => {
    const audit = new AuditLogWriter();
    const policy = new BrokerCrmAccessPolicy(audit, { brokerCrmEnabled: true });
    const agent: ActorContext = { actorId: "agent-a", roles: ["broker_agent"], partnerTenantId: "broker-a", partnerPlan: "pro", mfaVerified: true };

    expect(() => policy.assertLeadRead(agent, { ...assignment, assignedAdvisorId: "agent-a" })).not.toThrow();
    expect(() => policy.assertLeadRead(agent, { ...assignment, assignedAdvisorId: "agent-b" })).toThrow("Broker CRM access denied");
    expect(() => policy.assertMutation({ ...owner, roles: ["broker_read_only"] }, assignment)).toThrow("Broker CRM access denied");
    expect(() => policy.assertLeadRead({ ...owner, roles: ["broker_manager"] }, assignment)).not.toThrow();
    expect(() => policy.assertLeadRead({ ...owner, roles: ["broker_read_only"] }, assignment)).not.toThrow();
  });
});
