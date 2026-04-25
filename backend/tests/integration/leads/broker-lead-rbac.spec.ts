import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("broker lead tenant isolation", () => {
  it("allows only the assigned broker tenant to read a lead", async () => {
    const seed = seedComparatorQuote();
    await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);
    const assignment = seed.app.leads.assignments.list()[0];
    if (!assignment) throw new Error("Expected lead assignment");

    const assignedActor: ActorContext = { roles: ["broker_agent"], partnerTenantId: seed.partnerTenantId, correlationId: "broker-ok" };
    const otherActor: ActorContext = { roles: ["broker_agent"], partnerTenantId: crypto.randomUUID(), correlationId: "broker-no" };

    expect(seed.app.leads.brokerController.detail(assignment.id, assignedActor).id).toBe(assignment.id);
    expect(() => seed.app.leads.brokerController.detail(assignment.id, otherActor)).toThrow("Lead access denied");
  });
});
