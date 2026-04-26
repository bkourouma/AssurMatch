import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { LeadsModule } from "../../../src/modules/leads/leads.module";

const actor: ActorContext = { actorId: "owner-a", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };

describe("broker Starter lead list", () => {
  it("lists only assigned leads for the connected broker tenant", () => {
    const audit = new AuditLogWriter();
    const leads = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit);

    leads.assignments.create({ quoteRequestId: "q1", partnerTenantId: "broker-a", assignmentReason: "routing", productKey: "auto", countryCode: "CI" }, actor);
    leads.assignments.create({ quoteRequestId: "q2", partnerTenantId: "broker-b", assignmentReason: "routing", productKey: "sante", countryCode: "CI" }, { ...actor, partnerTenantId: "broker-b" });

    const page = leads.brokerStarterController.list(actor, { productKey: "auto" });

    expect(page.total).toBe(1);
    expect(page.items[0]?.productKey).toBe("auto");
    expect(audit.search({ action: "broker_starter.lead_list_viewed", result: "success" })).toHaveLength(1);
  });
});
