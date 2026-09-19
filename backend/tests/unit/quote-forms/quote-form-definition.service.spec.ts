import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { QuoteFormDefinitionService, type ConsentTextReference } from "../../../src/modules/quote-forms/quote-form-definition.service";
import { MemoryQuoteFormDefinitionsRepository } from "../../../src/modules/quote-forms/quote-form-definitions.repository";
import type { ActorContext } from "../../../src/modules/common/types";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

const complianceAdmin: ActorContext = { actorId: "compliance", roles: ["compliance_admin"], mfaVerified: true };
const contentAdmin: ActorContext = { actorId: "content", roles: ["content_admin"], mfaVerified: true };
const supportAdmin: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };

function publishedConsent(id: string): ConsentTextReference {
  return { id, version: "v1", contentHash: "hash", purpose: "lead_transmission", recipientCategory: "courtier_partenaire_eligible", status: "published" };
}

interface Harness {
  service: QuoteFormDefinitionService;
  audit: AuditLogWriter;
  consentTextId: string;
  countryId: string;
  productId: string;
  setConsentTexts(texts: ConsentTextReference[]): void;
}

function harness(options: { sensitiveDataEnabled?: boolean } = {}): Harness {
  const consentTextId = crypto.randomUUID();
  let texts: ConsentTextReference[] = [publishedConsent(consentTextId)];
  const audit = new AuditLogWriter();
  return {
    audit,
    consentTextId,
    countryId: crypto.randomUUID(),
    productId: crypto.randomUUID(),
    setConsentTexts(next) { texts = next; },
    service: new QuoteFormDefinitionService(
      audit,
      () => texts,
      new MemoryQuoteFormDefinitionsRepository(),
      () => options.sensitiveDataEnabled === true
    )
  };
}

function draft(context: Harness, overrides: Record<string, unknown> = {}) {
  return {
    countryId: context.countryId,
    productId: context.productId,
    language: "fr",
    version: "v1",
    status: "draft" as const,
    fields: [{ key: "vehicle_use", label: "Usage", type: "select" as const, required: true, sensitivity: "public" as const, options: ["prive"] }],
    consentTextId: context.consentTextId,
    reason: "test form",
    ...overrides
  };
}

describe("QuoteFormDefinitionService", () => {
  it("exposes only published forms bound to a published lead-transmission consent text", async () => {
    const context = harness();
    const form = await context.service.create(draft(context, { status: "published" }), superAdminActor);

    expect(form.status).toBe("published");
    expect((await context.service.publicForm(context.countryId, context.productId)).formDefinitionId).toBe(form.id);
  });

  it("refuses publication when the consent text is not published, instead of only failing at read time", async () => {
    const context = harness();
    context.setConsentTexts([]);

    await expect(context.service.create(draft(context, { status: "published" }), superAdminActor))
      .rejects.toThrow("the consent text is not published");
    // The draft survives the refusal so a compliance admin can fix the binding and publish it.
    const forms = await context.service.list();
    expect(forms).toHaveLength(1);
    expect(forms[0]?.status).toBe("draft");
  });

  it("still fails closed at read time if a published form's consent text stops being published", async () => {
    const context = harness();
    await context.service.create(draft(context, { status: "published" }), superAdminActor);
    // Second line of defence: the binding is re-verified on every public read.
    context.setConsentTexts([]);

    await expect(context.service.publicForm(context.countryId, context.productId)).rejects.toThrow("Consent text is not available");
  });

  it("refuses to publish a form whose field labels carry forbidden public wording", async () => {
    const context = harness();
    const fields = [{ key: "cta", label: "Souscrire maintenant votre contrat", type: "text" as const, required: true, sensitivity: "public" as const }];

    await expect(context.service.create(draft(context, { status: "published", fields }), superAdminActor))
      .rejects.toThrow("invalid public wording");
  });

  it("gates sensitive fields on the product flag", async () => {
    const closed = harness();
    const fields = [{ key: "health", label: "Antecedents", type: "text" as const, required: true, sensitivity: "sensitive" as const }];
    await expect(closed.service.create(draft(closed, { status: "published", fields }), superAdminActor))
      .rejects.toThrow("sensitive fields are disabled");

    const open = harness({ sensitiveDataEnabled: true });
    const published = await open.service.create(draft(open, { status: "published", fields }), superAdminActor);
    expect(published.status).toBe("published");
  });

  it("publishes a new version and retires the previous one for the same country, product and language", async () => {
    const context = harness();
    const v1 = await context.service.create(draft(context, { status: "published" }), superAdminActor);
    const v2 = await context.service.create(draft(context, { version: "v2", status: "published" }), superAdminActor);

    const forms = await context.service.list();
    expect(forms.filter((form) => form.status === "published")).toHaveLength(1);
    expect((await context.service.require(v1.id)).status).toBe("retired");
    expect((await context.service.require(v2.id)).status).toBe("published");
    expect((await context.service.publicForm(context.countryId, context.productId)).version).toBe("v2");
  });

  it("does not retire a published form of another language or product", async () => {
    const context = harness();
    const french = await context.service.create(draft(context, { status: "published" }), superAdminActor);
    await context.service.create(draft(context, { language: "en", version: "v1-en", status: "published" }), superAdminActor);

    expect((await context.service.require(french.id)).status).toBe("published");
    expect((await context.service.list()).filter((form) => form.status === "published")).toHaveLength(2);
  });

  it("applies the role matrix: compliance admin publishes, content admin cannot, support admin cannot author", async () => {
    const context = harness();
    const published = await context.service.create(draft(context, { status: "published" }), complianceAdmin);
    expect(published.status).toBe("published");

    await expect(context.service.create(draft(context, { version: "v2" }), contentAdmin)).rejects.toThrow("forbidden_role");
    await expect(context.service.create(draft(context, { version: "v3" }), supportAdmin)).rejects.toThrow("forbidden_role");
  });

  it("requires MFA for administration", async () => {
    const context = harness();
    const withoutMfa: ActorContext = { actorId: "compliance", roles: ["compliance_admin"], mfaVerified: false };

    await expect(context.service.create(draft(context), withoutMfa)).rejects.toThrow("mfa_required");
  });

  it("audits every publication refusal with its own reason", async () => {
    const context = harness();
    context.setConsentTexts([]);
    await context.service.create(draft(context, { status: "published" }), superAdminActor).catch(() => undefined);

    const refusals = context.audit.search({ action: "quote_form.publication_refused" });
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.reason).toBe("published_consent_text_missing");
  });
});
