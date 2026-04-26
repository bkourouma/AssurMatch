import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { LeadsModule } from "../../../src/modules/leads/leads.module";

const actor: ActorContext = { actorId: "owner-a", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };

describe("broker Starter actions", () => {
  it("audits accept reject and dispute actions with required reasons", async () => {
    const audit = new AuditLogWriter();
    const leads = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit);
    const accepted = await leads.assignments.create({ quoteRequestId: "q1", partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);
    const rejected = await leads.assignments.create({ quoteRequestId: "q2", partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);
    const disputed = await leads.assignments.create({ quoteRequestId: "q3", partnerTenantId: "broker-a", assignmentReason: "routing" }, actor);

    expect((await leads.brokerStarterController.accept(accepted.id, actor)).status).toBe("accepted");
    expect(() => leads.brokerStarterController.reject(rejected.id, {}, actor)).toThrow("Reason is required");
    expect((await leads.brokerStarterController.reject(rejected.id, { reason: "duplicate" }, actor)).status).toBe("rejected");
    expect((await leads.brokerStarterController.dispute(disputed.id, { reason: "compliance_concern" }, actor)).status).toBe("disputed");
    expect((await leads.brokerStarterController.history(disputed.id, actor)).map((event) => event.eventType)).toContain("disputed");
    expect(audit.search({ action: "broker_starter.lead_accepted", result: "success" })).toHaveLength(1);
    expect(audit.search({ action: "broker_starter.lead_rejected", result: "success" })).toHaveLength(1);
    expect(audit.search({ action: "broker_starter.lead_disputed", result: "success" })).toHaveLength(1);
  });
});
