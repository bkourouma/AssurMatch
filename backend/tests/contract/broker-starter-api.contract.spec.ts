import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  brokerStarterLeadActionRequestSchema,
  brokerStarterLeadListQuerySchema,
  brokerStarterPlanCapabilitiesSchema
} from "../../../packages/shared/contracts/quote.contracts";

const contract = readFileSync("specs/003-portail-starter-courtier/contracts/broker-starter-api.openapi.yaml", "utf8");

describe("spec 003 broker Starter OpenAPI contract", () => {
  it("declares all broker Starter endpoints", async () => {
    [
      "/broker/starter/dashboard",
      "/broker/starter/leads",
      "/broker/starter/leads/{leadId}",
      "/broker/starter/leads/{leadId}/accept",
      "/broker/starter/leads/{leadId}/reject",
      "/broker/starter/leads/{leadId}/dispute",
      "/broker/starter/leads/{leadId}/history",
      "/broker/starter/notifications",
      "/broker/starter/notifications/{notificationId}/read",
      "/broker/starter/leads/export.csv",
      "/broker/starter/plan-capabilities"
    ].forEach((path) => expect(contract).toContain(path));
  });

  it("keeps rejection and dispute reasons allowlisted in shared schemas", async () => {
    expect(brokerStarterLeadActionRequestSchema.parse({ reason: "duplicate" }).reason).toBe("duplicate");
    expect(() => brokerStarterLeadActionRequestSchema.parse({ reason: "freeform" })).toThrow();
    expect(brokerStarterLeadListQuerySchema.parse({ countryCode: "CI", page: 1 }).countryCode).toBe("CI");
    expect(brokerStarterPlanCapabilitiesSchema.parse({ plan: "starter", allowed: ["lead_list"], blocked: ["crm_kanban"] }).blocked).toContain("crm_kanban");
  });
});
