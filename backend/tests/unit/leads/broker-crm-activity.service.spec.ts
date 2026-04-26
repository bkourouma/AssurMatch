import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { LeadsModule } from "../../../src/modules/leads/leads.module";

const manager: ActorContext = {
  actorId: "manager-a",
  roles: ["broker_manager"],
  partnerTenantId: "broker-a",
  partnerPlan: "pro",
  mfaVerified: true,
  brokerUserTenantIds: {
    "agent-a": "broker-a",
    "agent-b": "broker-b"
  }
};

describe("BrokerCrmActivityService", () => {
  it("creates internal activities and enforces same-tenant advisor assignment", () => {
    const audit = new AuditLogWriter();
    const module = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit, { brokerCrmEnabled: true });
    const lead = module.assignments.create({ quoteRequestId: "activity-q1", partnerTenantId: "broker-a", assignmentReason: "routing" }, manager);

    expect(module.brokerCrmController.addNote(lead.id, { body: "Relance prevue" }, manager).body).toBe("Relance prevue");
    expect(module.brokerCrmController.addTask(lead.id, { title: "Appeler prospect" }, manager).title).toBe("Appeler prospect");
    expect(module.brokerCrmController.addTask(lead.id, { title: "Relancer", assigneeId: "agent-a" }, manager).assigneeId).toBe("agent-a");
    expect(module.brokerCrmController.addReminder(lead.id, { remindAt: "2026-04-27T10:00:00.000Z" }, manager).remindAt).toContain("2026-04-27");
    expect(module.brokerCrmController.addReminder(lead.id, { remindAt: "2026-04-27T10:00:00.000Z", assigneeId: "agent-a" }, manager).assigneeId).toBe("agent-a");
    expect(() => module.brokerCrmController.addTask(lead.id, { title: "Fuite", assigneeId: "agent-b" }, manager)).toThrow("Broker CRM access denied");
    expect(() => module.brokerCrmController.addReminder(lead.id, { remindAt: "2026-04-27T10:00:00.000Z", assigneeId: "agent-b" }, manager)).toThrow("Broker CRM access denied");
    expect(module.brokerCrmController.assignAdvisor(lead.id, { advisorId: "agent-a", advisorPartnerTenantId: "broker-a" }, manager).assignedAdvisorId).toBe("agent-a");
    expect(() => module.brokerCrmController.assignAdvisor(lead.id, { advisorId: "agent-b", advisorPartnerTenantId: "broker-b" }, manager)).toThrow("Broker CRM access denied");
    expect(audit.search({ action: "broker_crm.access_refused", result: "refused" }).filter((entry) => entry.reason === "assignee_cross_tenant_or_unresolved")).toHaveLength(2);
  });

  it("stores internal documents, non-contractual proposals and disputes", () => {
    const audit = new AuditLogWriter();
    const module = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit, { brokerCrmEnabled: true });
    const lead = module.assignments.create({ quoteRequestId: "activity-q2", partnerTenantId: "broker-a", assignmentReason: "routing" }, manager);

    expect(module.brokerCrmController.addDocument(lead.id, { label: "Piece interne", storageKey: "crm/internal.pdf" }, manager).visibility).toBe("internal");
    expect(module.brokerCrmController.addProposal(lead.id, { reference: "DEVIS-1", amountIndicative: 1000 }, manager).nonContractual).toBe(true);
    expect(module.brokerCrmController.addDispute(lead.id, { reason: "invalid_lead" }, manager).status).toBe("opened");
    expect(module.brokerCrmController.detail(lead.id, manager).proposals[0]?.reference).toBe("DEVIS-1");
  });
});
