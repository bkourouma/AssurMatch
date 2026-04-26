import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { LeadsModule } from "../../../src/modules/leads/leads.module";

const manager: ActorContext = { actorId: "manager-a", roles: ["broker_manager"], partnerTenantId: "broker-a", partnerPlan: "pro", mfaVerified: true };

describe("BrokerCrmExportPolicy", () => {
  it("exports scoped CSV for permitted roles and refuses agents", async () => {
    const audit = new AuditLogWriter();
    const module = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit, { brokerCrmEnabled: true });
    await module.assignments.create({ quoteRequestId: "export-q1", partnerTenantId: "broker-a", assignmentReason: "routing", publicReference: "AM-EXPORT-1" }, manager);

    expect(await module.brokerCrmController.exportCsv(manager, {})).toContain("AM-EXPORT-1");
    await expect(module.brokerCrmController.exportCsv({ ...manager, roles: ["broker_agent"], actorId: "agent-a" }, {})).rejects.toThrow("CRM export denied");
    expect(audit.search({ action: "broker_crm.export_refused", result: "refused" })).toHaveLength(1);
  });
});
