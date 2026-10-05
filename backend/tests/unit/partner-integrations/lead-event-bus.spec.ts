import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { LeadsModule } from "../../../src/modules/leads/leads.module";
import { PartnerLicensesService } from "../../../src/modules/partner-licenses/partner-licenses.module";
import { PartnerWebhookEventPublisher } from "../../../src/modules/partner-integrations/partner-webhook-event-publisher";
import { PartnersService } from "../../../src/modules/partners/partners.module";

const starter: ActorContext = { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: "broker-a", partnerPlan: "starter", mfaVerified: true };

function bus() {
  const observed: string[] = [];
  const forwarded: string[] = [];
  const publisher = new PartnerWebhookEventPublisher({
    audit: new AuditLogWriter(),
    integrations: { prepareWebhookDelivery: async (input) => { forwarded.push(input.eventType); } },
    onEvent: async (eventType) => { observed.push(eventType); }
  });
  return { publisher, observed, forwarded };
}

describe("lead event bus (spec 054 R6)", () => {
  it("delivers internal lead events to subscribers but never to partner webhooks", async () => {
    const { publisher, observed, forwarded } = bus();
    for (const eventType of ["lead.assigned", "lead.status_changed", "lead.accepted", "lead.rejected", "lead.reassigned"] as const) {
      await publisher.publish(eventType, "broker-a", { leadAssignmentId: "a-1" });
    }
    expect(observed).toEqual(["lead.assigned", "lead.status_changed", "lead.accepted", "lead.rejected", "lead.reassigned"]);
    expect(forwarded).toEqual(["lead.assigned", "lead.status_changed"]);
  });

  it("publishes lead.accepted and lead.rejected from the Starter actions", async () => {
    const { publisher, observed } = bus();
    const audit = new AuditLogWriter();
    const leads = new LeadsModule(new PartnersService(audit), new PartnerLicensesService(audit), audit, undefined, {}, { events: publisher });
    const first = await leads.assignments.create({ quoteRequestId: "q-1", partnerTenantId: "broker-a", assignmentReason: "routing" }, starter);
    const second = await leads.assignments.create({ quoteRequestId: "q-2", partnerTenantId: "broker-a", assignmentReason: "routing" }, starter);
    await leads.brokerStarterActions.accept(first.id, starter);
    await leads.brokerStarterActions.reject(second.id, { reason: "wrong_scope" }, starter);
    expect(observed).toEqual(["lead.assigned", "lead.assigned", "lead.accepted", "lead.rejected"]);
  });
});
