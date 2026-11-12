import { describe, expect, it } from "vitest";
import { findConsentContentIssues } from "../../../../packages/shared/contracts/consent-content";
import { insurerCreateSchema } from "../../../../packages/shared/contracts/insurer.contracts";
import { findOfferContentForbiddenWording, offerContentSchema } from "../../../../packages/shared/contracts/offer-content";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { ConsentService, MemoryConsentRecordsRepository } from "../../../src/modules/consent/consent.module";
import { parseOfferInput } from "../../../src/modules/offers/offer-admin.service";
import { OfferPublicationPolicy } from "../../../src/modules/offers/offer-publication-policy";
import { OffersModule } from "../../../src/modules/offers/offers.module";
import { QuoteFormDefinitionService, type ConsentTextReference } from "../../../src/modules/quote-forms/quote-form-definition.service";
import { MemoryQuoteFormDefinitionsRepository } from "../../../src/modules/quote-forms/quote-form-definitions.repository";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

/** H8: the regulated wording is blocked whatever the accent, case, spacing, separator or language. */
const BLOCKED = ["contrat validé", "CONTRAT VALIDÉ", "contrat   validé", "Contrat-validé", "valid contract", "VALID CONTRACT"];
const ALLOWED = ["invalid contract", "contrat à valider"];

const countryId = "00000000-0000-4000-8000-0000000054c1";
const productId = "00000000-0000-4000-8000-0000000054a1";
const partnerTenantId = "00000000-0000-4000-8000-0000000054b1";
const preparer: ActorContext = { actorId: "content", roles: ["content_admin"], mfaVerified: true };
const compliance: ActorContext = { actorId: "compliance", roles: ["compliance_admin"], mfaVerified: true };
const base = { name: "Auto Essentiel", validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2030-01-01T00:00:00.000Z" };

function offerPayload(overrides: Record<string, unknown> = {}) {
  return {
    countryId,
    productId,
    partnerTenantId,
    name: "Auto Essentiel",
    insurerName: "NSIA",
    guarantees: [{ key: "rc", label: "Responsabilite civile", included: true }],
    indicativePriceMin: 10000,
    currency: "XOF",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2030-01-01T00:00:00.000Z",
    sourceOfInformation: "Fiche produit",
    reason: "Preparation de l'offre",
    ...overrides
  };
}

describe("consent content wording (H8)", () => {
  const consent = (text: string) => `Je consens a la transmission a {{brokerName}}. ${text}. AssurMatch assure le role technique.`;
  it.each(BLOCKED)("blocks %j", (text) => {
    expect(findConsentContentIssues({ purpose: "lead_transmission", content: consent(text) }).map((issue) => issue.code)).toContain("forbidden_wording");
  });
  it.each(ALLOWED)("does not block %j", (text) => {
    expect(findConsentContentIssues({ purpose: "lead_transmission", content: consent(text) })).toEqual([]);
  });

  it("refuses to publish with CONSENT_TEXT_INVALID and names the wording in details", async () => {
    const service = new ConsentService(new AuditLogWriter(), new MemoryConsentRecordsRepository());
    const text = await service.createText({
      purpose: "lead_transmission", countryId, channel: "public_web", recipientCategory: "courtier_partenaire_agree",
      language: "fr", version: "v1", contentHash: "x", content: consent("Contrat validé")
    }, superAdminActor);
    await expect(service.publishText(text.id, superAdminActor)).rejects.toMatchObject({
      status: 422,
      response: { code: "CONSENT_TEXT_INVALID", details: { wording: ["contrat valide"] } }
    });
  });
});

describe("offer content wording (H8)", () => {
  it.each(BLOCKED)("blocks %j on every text field of the offer contract", (text) => {
    for (const field of ["name", "shortDescription", "exclusionsSummary", "sourceOfInformation", "insurerName"]) {
      expect(offerContentSchema.safeParse({ ...base, [field]: `Avec ${text} pour vous` }).success, `${field}: ${text}`).toBe(false);
    }
    expect(offerContentSchema.safeParse({ ...base, guarantees: [{ key: "x", label: "RC", detail: text, included: true }] }).success).toBe(false);
    expect(offerContentSchema.safeParse({ ...base, publicDisclaimers: ["offre indicative", text] }).success).toBe(false);
  });
  it.each(ALLOWED)("does not block %j", (text) => {
    expect(offerContentSchema.safeParse({ ...base, shortDescription: `Avec ${text} pour vous` }).success).toBe(true);
  });
  it("never assembles a phrase across two fields", () => {
    expect(findOfferContentForbiddenWording({ name: "Un contrat", shortDescription: "valide jusqu'au 31 décembre" })).toEqual([]);
  });

  it("raises a typed 422 FORBIDDEN_WORDING naming the expression instead of a muted 400", () => {
    let error: unknown;
    try { parseOfferInput(offerContentSchema, { ...base, shortDescription: "Avec ce contrat validé, vous êtes couvert" }); } catch (caught) { error = caught; }
    expect(error).toMatchObject({
      status: 422,
      response: { code: "FORBIDDEN_WORDING", message: "Forbidden regulated wording: contrat valide", details: { wording: ["contrat valide"] } }
    });
  });

  it("keeps a plain 400 VALIDATION_FAILED for other refusals", () => {
    expect(() => parseOfferInput(offerContentSchema, { ...base, validUntil: base.validFrom })).toThrowError(/validUntil must be after validFrom/);
    let error: unknown;
    try { parseOfferInput(offerContentSchema, { ...base, validUntil: base.validFrom }); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ status: 400, response: { code: "VALIDATION_FAILED" } });
  });

  it("blocks a stored version at submission, validation and public exposure", async () => {
    const offers = new OffersModule(new AuditLogWriter(), undefined, undefined, { partnerEligibility: async () => ({ eligible: true, reasons: [] }) });
    const created = await offers.adminService.create(offerPayload(), preparer);
    const draft = (await offers.repository.listVersions(created.id)).find((version) => version.status === "draft");
    expect(draft).toBeDefined();

    // A draft saved with the expression (before the rule existed) cannot be submitted.
    await offers.repository.updateVersion(draft!.id, { shortDescription: "Avec ce contrat validé, vous êtes couvert" });
    await expect(offers.adminService.submit(created.id, "Soumission", preparer)).rejects.toMatchObject({
      status: 422,
      response: { code: "FORBIDDEN_WORDING", details: { wording: ["contrat valide"] } }
    });

    // A submitted version altered in storage cannot be validated and published.
    await offers.repository.updateVersion(draft!.id, { shortDescription: "Texte neutre" });
    await offers.adminService.submit(created.id, "Soumission", preparer);
    await offers.repository.updateVersion(draft!.id, { shortDescription: "CONTRAT VALIDÉ" });
    await expect(offers.adminService.validate(created.id, { reason: "Validation conformite" }, compliance)).rejects.toMatchObject({
      status: 422,
      response: { code: "FORBIDDEN_WORDING", details: { wording: ["contrat valide"] } }
    });
    expect((await offers.repository.require(created.id)).validationStatus).not.toBe("validated");

    // Once clean, the same version is published.
    await offers.repository.updateVersion(draft!.id, { shortDescription: "Texte neutre" });
    await expect(offers.adminService.validate(created.id, { reason: "Validation conformite" }, compliance)).resolves.toMatchObject({ validationStatus: "validated" });
  });

  it("keeps a published offer that carries the expression out of the public catalogue", async () => {
    const offers = new OffersModule(new AuditLogWriter(), undefined, undefined, { partnerEligibility: async () => ({ eligible: true, reasons: [] }) });
    const created = await offers.adminService.create(offerPayload(), preparer);
    await offers.adminService.submit(created.id, "Soumission", preparer);
    const published = await offers.adminService.validate(created.id, { reason: "Validation conformite" }, compliance);
    const policy = new OfferPublicationPolicy();
    expect(policy.evaluate(published).reasons).not.toContain("forbidden_wording");
    expect(policy.evaluate({ ...published, shortDescription: "Contrat-validé" }).reasons).toContain("forbidden_wording");
  });
});

describe("insurer wording (H8)", () => {
  it.each(BLOCKED)("blocks %j", (text) => {
    const result = insurerCreateSchema.safeParse({ countryId: crypto.randomUUID(), name: `Assureur ${text}`, code: "assureur", reason: "creation assureur" });
    expect(result.success).toBe(false);
  });
});

describe("quote form wording (H8)", () => {
  function harness() {
    const consentTextId = crypto.randomUUID();
    const texts: ConsentTextReference[] = [{ id: consentTextId, version: "v1", contentHash: "hash", purpose: "lead_transmission", recipientCategory: "courtier_partenaire_eligible", status: "published" }];
    const service = new QuoteFormDefinitionService(new AuditLogWriter(), () => texts, new MemoryQuoteFormDefinitionsRepository(), () => false);
    const draft = (fields: unknown[]) => ({
      countryId: crypto.randomUUID(), productId: crypto.randomUUID(), language: "fr", version: "v1", status: "published" as const,
      fields: fields as never, consentTextId, reason: "test form"
    });
    return { service, draft };
  }
  const field = (label: string, options?: string[]) => ({ key: "k", label, type: "select" as const, required: true, sensitivity: "public" as const, ...(options ? { options } : {}) });

  it.each(BLOCKED)("refuses to publish a label %j with 422 FORBIDDEN_WORDING", async (text) => {
    const { service, draft } = harness();
    await expect(service.create(draft([field(`Votre ${text}`)]), superAdminActor)).rejects.toMatchObject({
      status: 422,
      response: { code: "FORBIDDEN_WORDING", details: { wording: [expect.stringMatching(/valid/)] } }
    });
  });
  it("also checks the choices of a select, and names the expression in the message", async () => {
    const { service, draft } = harness();
    await expect(service.create(draft([field("Usage", ["prive", "Contrat validé"])]), superAdminActor)).rejects.toMatchObject({
      status: 422,
      response: { code: "FORBIDDEN_WORDING", message: expect.stringContaining("contrat valide") }
    });
  });
  it.each(ALLOWED)("publishes a label %j", async (text) => {
    const { service, draft } = harness();
    await expect(service.create(draft([field(`Votre ${text}`)]), superAdminActor)).resolves.toMatchObject({ status: "published" });
  });
});
