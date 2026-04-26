import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { LeadsModule } from "../../../src/modules/leads/leads.module";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";

const owner: ActorContext = { actorId: "owner-a", roles: ["broker_owner_pro"], partnerTenantId: "broker-a", partnerPlan: "pro", mfaVerified: true };

describe("broker CRM flows", () => {
  it("keeps list detail status and activity tenant-isolated and audited", () => {
    const audit = new AuditLogWriter();
    const module = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit, { brokerCrmEnabled: true });
    const own = module.assignments.create({ quoteRequestId: "flow-q1", partnerTenantId: "broker-a", assignmentReason: "routing", publicReference: "AM-FLOW-1" }, owner);
    const other = module.assignments.create({ quoteRequestId: "flow-q2", partnerTenantId: "broker-b", assignmentReason: "routing", publicReference: "AM-FLOW-2" }, { ...owner, partnerTenantId: "broker-b" });

    expect(module.brokerCrmController.list(owner, {}).items.map((lead) => lead.publicReference)).toEqual(["AM-FLOW-1"]);
    expect(() => module.brokerCrmController.detail(other.id, owner)).toThrow("Broker CRM access denied");
    module.brokerCrmController.changeStatus(own.id, { status: "contacte" }, owner);
    module.brokerCrmController.addNote(own.id, { body: "Contact realise" }, owner);

    expect(module.brokerCrmController.detail(own.id, owner).history.map((event) => event.eventType)).toContain("status_changed");
    expect(audit.search({ action: "broker_crm.access_refused", result: "refused" })).toHaveLength(1);
  });
});
