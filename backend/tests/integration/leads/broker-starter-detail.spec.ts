import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { LeadsModule } from "../../../src/modules/leads/leads.module";

const actor: ActorContext = { actorId: "owner-a", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", mfaVerified: true };

describe("broker Starter lead detail", () => {
  it("marks first authorized detail read as seen and refuses cross-tenant reads", () => {
    const audit = new AuditLogWriter();
    const leads = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit);
    const assignment = leads.assignments.create({
      quoteRequestId: "q1",
      partnerTenantId: "broker-a",
      assignmentReason: "routing",
      contact: { email: "client@example.com" },
      answers: { usage: "private" }
    }, actor);

    const first = leads.brokerStarterController.detail(assignment.id, actor);
    const second = leads.brokerStarterController.detail(assignment.id, actor);

    expect(first.seen).toBe(true);
    expect(second.history.filter((event) => event.eventType === "viewed")).toHaveLength(1);
    expect(() => leads.brokerStarterController.detail(assignment.id, { ...actor, partnerTenantId: "broker-b" })).toThrow("Lead access denied");
    expect(audit.search({ action: "broker_starter.lead_detail_viewed", result: "success" })).toHaveLength(2);
    expect(audit.search({ action: "broker_starter.cross_tenant_refused", result: "refused" })).toHaveLength(1);
  });
});
