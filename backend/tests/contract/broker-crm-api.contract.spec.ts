import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  brokerCrmLeadListQuerySchema,
  brokerCrmProposalCreateSchema,
  brokerCrmStatusUpdateSchema
} from "../../../packages/shared/contracts/quote.contracts";

const contract = readFileSync("specs/004-crm-courtier-pro/contracts/broker-crm-api.openapi.yaml", "utf8");

describe("spec 004 broker CRM OpenAPI contract", () => {
  it("declares broker CRM endpoints", () => {
    [
      "/broker/crm/dashboard",
      "/broker/crm/leads",
      "/broker/crm/leads/kanban",
      "/broker/crm/leads/{leadId}",
      "/broker/crm/leads/{leadId}/status",
      "/broker/crm/leads/{leadId}/notes",
      "/broker/crm/leads/{leadId}/tasks",
      "/broker/crm/leads/{leadId}/reminders",
      "/broker/crm/leads/{leadId}/assign",
      "/broker/crm/leads/{leadId}/documents",
      "/broker/crm/leads/{leadId}/proposals",
      "/broker/crm/leads/{leadId}/disputes",
      "/broker/crm/leads/export.csv",
      "/broker/crm/notifications",
      "/broker/crm/ai-foundations"
    ].forEach((path) => expect(contract).toContain(path));
  });

  it("keeps shared CRM schemas controlled", () => {
    expect(brokerCrmLeadListQuerySchema.parse({ status: "qualifie", countryCode: "CI" }).status).toBe("qualifie");
    expect(() => brokerCrmStatusUpdateSchema.parse({ status: "perdu" })).toThrow();
    expect(brokerCrmStatusUpdateSchema.parse({ status: "perdu", reason: "price" }).reason).toBe("price");
    expect(brokerCrmProposalCreateSchema.parse({ reference: "DEVIS-1" }).reference).toBe("DEVIS-1");
  });
});
