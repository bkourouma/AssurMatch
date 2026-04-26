import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { LeadsModule } from "../../../src/modules/leads/leads.module";

const owner: ActorContext = { actorId: "owner-a", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };
const agent: ActorContext = { actorId: "agent-a", roles: ["broker_agent"], partnerTenantId: "broker-a", mfaVerified: true };

describe("broker Starter export", () => {
  it("exports scoped CSV only when export permission exists", async () => {
    const audit = new AuditLogWriter();
    const leads = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit);
    await leads.assignments.create({ quoteRequestId: "q1", partnerTenantId: "broker-a", assignmentReason: "routing", publicReference: "AM-1" }, owner);
    await leads.assignments.create({ quoteRequestId: "q2", partnerTenantId: "broker-b", assignmentReason: "routing", publicReference: "AM-2" }, { ...owner, partnerTenantId: "broker-b" });

    const csv = await leads.brokerStarterController.exportCsv(owner, { maxRows: 10 });

    expect(csv).toContain("AM-1");
    expect(csv).not.toContain("AM-2");
    await expect(leads.brokerStarterController.exportCsv(agent, { maxRows: 10 })).rejects.toThrow("Lead export denied");
    expect(audit.search({ action: "broker_starter.export_refused", result: "refused" })).toHaveLength(1);
  });
});
