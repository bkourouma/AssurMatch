import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { seedComparatorQuote, validQuotePayload } from "../helpers/comparator-quote-seed";
import { superAdminActor } from "../helpers/enterprise-seed";

describe("no broker available routing", () => {
  it("creates no assignment and no broker notification when no broker is eligible", async () => {
    const seed = await seedComparatorQuote();
    await seed.app.partners.service.update(seed.partnerTenantId, { capacityStatus: "blocked", reason: "capacity closed" }, superAdminActor);

    await seed.app.quoteRequests.publicController.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);

    expect(await seed.app.leads.assignments.list()).toHaveLength(0);
    expect((await seed.app.notifications.service.list()).filter((notification) => notification.type === "broker_lead_assigned")).toHaveLength(0);
  });
});
