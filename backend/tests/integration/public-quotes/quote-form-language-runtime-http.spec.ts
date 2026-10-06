import { afterEach, describe, expect, it } from "vitest";
import type { AdminConsentTextView } from "../../../../packages/shared/contracts/compliance.contracts";
import type { AdminQuoteFormDefinitionView, PublicQuoteFormResponse } from "../../../../packages/shared/contracts/quote.contracts";
import { call, complianceAdmin } from "../catalog/catalog-http-helpers";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

type ErrorBody = { code: string; message: string; availableLanguages?: string[] };

const EN_CONSENT = "By checking this box, your contact details ({{contactFields}}) are transmitted to {{brokerName}} for {{countryName}} and {{productName}}. AssurMatch is a technical platform; it is neither a broker nor an insurer.";

async function publishEnglishJourney(harness: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>) {
  const consent = (await call<AdminConsentTextView>(harness, complianceAdmin, "POST", "/admin/consent-texts", {
    purpose: "lead_transmission",
    countryId: seed.country.id,
    channel: "public_web",
    recipientCategory: "courtier_partenaire_agree",
    language: "en",
    version: "en-v1",
    content: EN_CONSENT,
    reason: "english consent text"
  })).body;
  expect((await call(harness, complianceAdmin, "POST", `/admin/consent-texts/${consent.id}/publish`, { reason: "english consent publication" })).status).toBe(200);
  const form = (await call<AdminQuoteFormDefinitionView>(harness, complianceAdmin, "POST", "/admin/quote-form-definitions", {
    countryId: seed.country.id,
    productId: seed.product.id,
    language: "en",
    version: "en-v1",
    fields: [{ key: "vehicle_use", label: "Vehicle use", type: "select", required: true, sensitivity: "public", options: ["private"] }],
    consentTextId: consent.id,
    reason: "english quote form"
  })).body;
  expect((await call(harness, complianceAdmin, "POST", `/admin/quote-form-definitions/${form.id}/publish`, { reason: "english form publication" })).status).toBe(201);
  return { consent, form };
}

function quotePayload(seed: Awaited<ReturnType<typeof seedPublicRuntime>>, form: { formDefinitionId: string; consent: { consentTextId: string; version: string; contentHash: string } }, overrides: Record<string, unknown> = {}) {
  return {
    countryCode: "CI",
    productKey: "auto",
    formDefinitionId: form.formDefinitionId,
    contact: { displayName: "Visitor", email: "visitor.en@example.com", phone: "07 00 00 00 00" },
    answers: { vehicle_use: "private" },
    consent: { accepted: true, consentTextId: form.consent.consentTextId, version: form.consent.version, contentHash: form.consent.contentHash },
    ipAddress: "203.0.113.20",
    sessionId: "language-session",
    ...overrides
  };
}

async function post(harness: RuntimeHttpHarness, body: unknown) {
  const response = await harness.request("/quote-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("public quote form languages (spec 050 R6/R7/R8)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("serves the resolved consent and the generic fields, and answers 404 without falling back to another language", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    const fr = await harness.request("/countries/CI/products/auto/quote-form?language=fr");
    expect(fr.status).toBe(200);
    const form = await fr.json() as PublicQuoteFormResponse;
    expect(form.language).toBe("fr");
    expect(form.phoneRule).toBeNull();
    expect(form.consent.language).toBe("fr");
    expect(form.consent.content).toContain("le courtier partenaire agréé auquel votre demande sera attribuée");
    expect(form.consent.content).toContain("Cote d'Ivoire");
    expect(form.consent.content).toContain("Assurance auto");
    expect(form.consent.content).not.toContain("{{");
    expect(form.fields.map((field) => field.key)).toEqual(["vehicle_use", "city", "contact_preference", "desired_timing", "budget", "preferred_language", "source"]);
    expect(form.fields.find((field) => field.key === "city")?.label).toBe("Ville");

    const en = await harness.request("/countries/CI/products/auto/quote-form?language=en");
    expect(en.status).toBe(404);
    const body = await en.json() as ErrorBody;
    expect(body.code).toBe("QUOTE_FORM_LANGUAGE_UNAVAILABLE");
    expect(body.availableLanguages).toEqual(["fr"]);
  });

  it("serves the EN form, validates the EN consent and the country phone rule, and stores the language", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await harness.runtime.countries.service.update(seed.country.id, { phoneDialCode: "+225", phoneNationalLengths: [10], reason: "regle telephone CI" }, seed.admin);
    const { form } = await publishEnglishJourney(harness, seed);

    const response = await harness.request("/countries/CI/products/auto/quote-form?language=en");
    expect(response.status).toBe(200);
    const en = await response.json() as PublicQuoteFormResponse;
    expect(en.formDefinitionId).toBe(form.id);
    expect(en.language).toBe("en");
    expect(en.phoneRule).toEqual({ dialCode: "+225", nationalLengths: [10] });
    expect(en.consent.content).toContain("the licensed partner broker your request will be assigned to");
    expect(en.fields.find((field) => field.key === "city")?.label).toBe("City");

    // The EN consent submitted as a FR request does not match the FR form.
    const mismatch = await post(harness, quotePayload(seed, en, { language: "fr" }));
    expect(mismatch.status).toBe(422);

    const badPhone = await post(harness, quotePayload(seed, en, { language: "en", contact: { email: "visitor.en@example.com", phone: "0700 0000" } }));
    expect(badPhone.status).toBe(400);
    expect(badPhone.body.message).toBe("Phone is invalid for country");

    const accepted = await post(harness, quotePayload(seed, en, { language: "en" }));
    expect(accepted.status).toBe(201);
    const [quote] = await harness.runtime.quoteRequests.submissions.list();
    expect(quote?.language).toBe("en");
    const [prospect] = await harness.runtime.prospects.service.list();
    expect(prospect?.phoneNormalized).toBe("+2250700000000");
  });

  it("refuses to publish a form whose consent text is of another language", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const form = (await call<AdminQuoteFormDefinitionView>(harness, complianceAdmin, "POST", "/admin/quote-form-definitions", {
      countryId: seed.country.id,
      productId: seed.product.id,
      language: "en",
      version: "en-v1",
      fields: [{ key: "vehicle_use", label: "Vehicle use", type: "select", required: true, sensitivity: "public", options: ["private"] }],
      consentTextId: seed.consentText.id,
      reason: "english form with french consent"
    })).body;
    const refused = await call<ErrorBody>(harness, complianceAdmin, "POST", `/admin/quote-form-definitions/${form.id}/publish`, { reason: "english form publication" });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe("CONSENT_TEXT_INVALID");
    expect(refused.body.message).toContain("consent text language does not match");
  });
});
