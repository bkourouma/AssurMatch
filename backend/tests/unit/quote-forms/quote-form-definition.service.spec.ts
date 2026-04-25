import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { QuoteFormDefinitionService } from "../../../src/modules/quote-forms/quote-form-definition.service";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("QuoteFormDefinitionService", () => {
  it("exposes only published forms bound to a published lead-transmission consent text", () => {
    const consentTextId = crypto.randomUUID();
    const service = new QuoteFormDefinitionService(new AuditLogWriter(), () => [{
      id: consentTextId,
      version: "v1",
      contentHash: "hash",
      purpose: "lead_transmission",
      recipientCategory: "courtier_partenaire_eligible",
      status: "published"
    }]);
    const countryId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const form = service.create({
      countryId,
      productId,
      language: "fr",
      version: "v1",
      status: "published",
      fields: [{ key: "vehicle_use", label: "Usage", type: "select", required: true, sensitivity: "public", options: ["prive"] }],
      consentTextId,
      reason: "test form"
    }, superAdminActor);

    expect(service.publicForm(countryId, productId).formDefinitionId).toBe(form.id);
  });

  it("fails closed when consent text is not published", () => {
    const service = new QuoteFormDefinitionService(new AuditLogWriter(), () => []);
    const countryId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    service.create({
      countryId,
      productId,
      language: "fr",
      version: "v1",
      status: "published",
      fields: [{ key: "risk", label: "Risque", type: "text", required: true, sensitivity: "public" }],
      consentTextId: crypto.randomUUID(),
      reason: "test form"
    }, superAdminActor);

    expect(() => service.publicForm(countryId, productId)).toThrow("Consent text is not available");
  });
});
