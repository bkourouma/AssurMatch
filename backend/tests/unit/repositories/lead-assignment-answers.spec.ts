import { describe, expect, it } from "vitest";
import { BillableLeadPolicy } from "../../../src/modules/billing/billable-lead-policy";
import { PrismaLeadAssignmentsRepository } from "../../../src/modules/leads/lead-assignments.repository";
import type { PrismaService } from "../../../src/modules/common/prisma/prisma.service";

function repositoryWithPayload(payload: Record<string, unknown>): PrismaLeadAssignmentsRepository {
  const client = {
    leadAssignment: { findMany: async () => [{ id: "a-1", quoteRequestId: "q-1", partnerTenantId: "p-1", status: "closed", assignedAt: new Date("2026-10-08T12:00:00Z"), assignmentReason: "routing", recipientCount: 1 }] },
    quoteRequest: { findMany: async () => [{ id: "q-1", publicReference: "QR-1", countryId: "c-1", productId: "pr-1", prospectId: "ps-1", consentRecordId: "cr-1", payload }] },
    country: { findMany: async () => [{ id: "c-1", isoCode: "CI" }] },
    product: { findMany: async () => [{ id: "pr-1", key: "auto" }] },
    prospect: { findMany: async () => [{ id: "ps-1", displayName: "Mariam", emailNormalized: "mariam@visitor.test", phoneNormalized: "+2250102030405" }] },
    brokerCrmLeadState: { findMany: async () => [] }
  };
  return new PrismaLeadAssignmentsRepository({ requireRuntimeClient: () => client } as unknown as PrismaService);
}

describe("lead assignment answers read from the quote payload", () => {
  it("reads the flat answers a submitted quote request stores", async () => {
    const [assignment] = await repositoryWithPayload({ city: "Abidjan", vehicle_use: "prive" }).list();
    expect(assignment?.answers).toEqual({ city: "Abidjan", vehicle_use: "prive" });
  });

  it("still reads answers wrapped in `answers` and never treats a contact block as answers", async () => {
    const wrapped = await repositoryWithPayload({ answers: { city: "Abidjan" }, contact: { email: "x@y.test" } }).list();
    expect(wrapped[0]?.answers).toEqual({ city: "Abidjan" });
    const contactOnly = await repositoryWithPayload({ contact: { email: "x@y.test" } }).list();
    expect(contactOnly[0]?.answers).toEqual({});
  });

  it("makes a closed lead with answers billable (minimum information criterion)", async () => {
    const [assignment] = await repositoryWithPayload({ city: "Abidjan" }).list();
    const publicCountry = { isoCode: "CI", status: "public", flags: { country_quote_enabled: true } };
    const publicProduct = { key: "auto", status: "public", flags: { product_quote_enabled: true } };
    const evaluation = new BillableLeadPolicy().evaluate(assignment!, {
      countries: new Map([["CI", publicCountry as never]]),
      products: new Map([["auto", publicProduct as never]]),
      creditedDisputeLeadIds: new Set()
    });
    expect(evaluation).toMatchObject({ billable: true, failedCriteria: [] });
  });
});
