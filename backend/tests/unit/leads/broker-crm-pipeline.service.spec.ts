import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { LeadsModule } from "../../../src/modules/leads/leads.module";

const owner: ActorContext = { actorId: "owner-a", roles: ["broker_owner_pro"], partnerTenantId: "broker-a", partnerPlan: "pro", mfaVerified: true };

describe("BrokerCrmPipelineService", () => {
  it("requires controlled reasons for loss-like statuses and writes history", async () => {
    const audit = new AuditLogWriter();
    const module = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit, { brokerCrmEnabled: true });
    const lead = await module.assignments.create({ quoteRequestId: "pipeline-q1", partnerTenantId: "broker-a", assignmentReason: "routing" }, owner);

    await expect(module.brokerCrmController.changeStatus(lead.id, { status: "perdu" }, owner)).rejects.toThrow();
    expect((await module.brokerCrmController.changeStatus(lead.id, { status: "perdu", reason: "price" }, owner)).crmStatus).toBe("perdu");
    expect((await module.brokerCrmHistory.forLead(lead.id))[0]?.nextStatus).toBe("perdu");
    expect(audit.search({ action: "broker_crm.status_changed", result: "success" })).toHaveLength(1);
  });
});
