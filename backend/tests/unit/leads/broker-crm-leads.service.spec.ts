import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { LeadsModule } from "../../../src/modules/leads/leads.module";

const owner: ActorContext = { actorId: "owner-a", roles: ["broker_owner_pro"], partnerTenantId: "broker-a", partnerPlan: "pro", mfaVerified: true };

describe("BrokerCrmLeadsService", () => {
  it("lists and groups Kanban leads only for the connected tenant", async () => {
    const audit = new AuditLogWriter();
    const module = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit, { brokerCrmEnabled: true });
    const own = await module.assignments.create({ quoteRequestId: "crm-q1", partnerTenantId: "broker-a", assignmentReason: "routing", publicReference: "AM-CRM-1", contact: { displayName: "Ami" } }, owner);
    await module.assignments.create({ quoteRequestId: "crm-q2", partnerTenantId: "broker-b", assignmentReason: "routing", publicReference: "AM-CRM-2" }, { ...owner, partnerTenantId: "broker-b" });
    await module.brokerCrmPipeline.changeStatus(own.id, { status: "qualifie" }, owner);

    expect((await module.brokerCrmController.list(owner, {})).items).toHaveLength(1);
    expect((await module.brokerCrmController.kanban(owner, {})).qualifie).toHaveLength(1);
    expect((await module.brokerCrmController.list(owner, { search: "Ami" })).items[0]?.prospectName).toBe("Ami");
  });
});
