import { afterEach, describe, expect, it } from "vitest";
import type { AdminConsentTextView, ConsentTextTemplate } from "../../../../packages/shared/contracts/compliance.contracts";
import { consentContentHash } from "../../../../packages/shared/contracts/consent-content";
import type { AdminQuoteFormDefinitionView } from "../../../../packages/shared/contracts/quote.contracts";
import { auditEntries, call, complianceAdmin, countryAdmin, superAdmin, supportAdmin } from "../catalog/catalog-http-helpers";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

type ErrorBody = { code: string; message: string; blockers?: Array<{ control: string; evidence: string }> };

const COMPLIANT = "Vos coordonnees ({{contactFields}}) seront transmises a {{brokerName}} pour {{countryName}} et {{productName}}. AssurMatch est une plateforme technique; elle n'est ni courtier ni assureur.";

function draft(countryId: string, productId: string, overrides: Record<string, unknown> = {}) {
  return {
    purpose: "lead_transmission",
    countryId,
    productId,
    channel: "public_web",
    recipientCategory: "courtier_partenaire_agree",
    language: "fr",
    version: "v2",
    content: COMPLIANT,
    reason: "nouvelle version conformite",
    ...overrides
  };
}

describe("admin consent texts over HTTP (spec 050 US3)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("creates a draft with a server computed hash and refuses a duplicate version", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    // A caller supplied hash is not part of the contract: it is stripped and recomputed.
    const created = await call<AdminConsentTextView>(harness, complianceAdmin, "POST", "/admin/consent-texts", { ...draft(seed.country.id, seed.product.id), contentHash: "forged" });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.content).toBe(COMPLIANT);
    expect(created.body.contentHash).toBe(consentContentHash(COMPLIANT));
    expect(created.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(auditEntries(harness, "consent_text.created", "success").at(-1)?.reason).toBe("nouvelle version conformite");

    const duplicate = await call<ErrorBody>(harness, complianceAdmin, "POST", "/admin/consent-texts", draft(seed.country.id, seed.product.id));
    expect(duplicate.status).toBe(409);
    expect(auditEntries(harness, "consent_text.create_refused", "refused").map((entry) => entry.reason)).toContain("duplicate_version");

    const unauthorised = await call(harness, countryAdmin(seed.country.id), "POST", "/admin/consent-texts", draft(seed.country.id, seed.product.id, { version: "v3" }));
    expect(unauthorised.status).toBe(403);
    expect(auditEntries(harness, "consent_text.create_refused", "refused").map((entry) => entry.reason)).toContain("rbac_denied");
  });

  it("refuses to publish forbidden wording, a missing recipient or technical role, and hash-only texts (422 CONSENT_TEXT_INVALID)", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const create = async (version: string, content: string) =>
      (await call<AdminConsentTextView>(harness!, complianceAdmin, "POST", "/admin/consent-texts", draft(seed.country.id, seed.product.id, { version, content }))).body;

    const forbidden = await create("v-forbidden", `${COMPLIANT} Souscrire maintenant.`);
    const noRecipient = await create("v-recipient", "Vos coordonnees seront transmises a un courtier. AssurMatch est une plateforme technique.");
    const noRole = await create("v-role", "Vos coordonnees seront transmises a {{brokerName}}.");

    for (const [text, control] of [[forbidden, "forbidden_wording"], [noRecipient, "recipient_variable_missing"], [noRole, "technical_role_missing"]] as const) {
      const refused = await call<ErrorBody>(harness, complianceAdmin, "POST", `/admin/consent-texts/${text.id}/publish`, { reason: "publication conformite" });
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe("CONSENT_TEXT_INVALID");
      expect(refused.body.blockers?.map((blocker) => blocker.control)).toContain(control);
    }

    // The fixture text of the seed has real content; a legacy hash-only text cannot go through the route.
    const legacy = await harness.runtime.consent.service.createText({
      purpose: "lead_transmission", countryId: seed.country.id, channel: "public_web", recipientCategory: "courtier_partenaire_agree",
      language: "fr", version: "legacy", status: "draft", contentHash: "legacy-hash"
    }, superAdmin);
    const legacyRefused = await call<ErrorBody>(harness, superAdmin, "POST", `/admin/consent-texts/${legacy.id}/publish`, { reason: "publication conformite" });
    expect(legacyRefused.status).toBe(422);
    expect(legacyRefused.body.blockers?.map((blocker) => blocker.control)).toEqual(["content_missing"]);

    expect(auditEntries(harness, "consent_text.publication_refused", "refused")).toHaveLength(4);
    const listed = await call<AdminConsentTextView[]>(harness, complianceAdmin, "GET", `/admin/consent-texts?countryId=${seed.country.id}&status=draft`);
    expect(listed.body).toHaveLength(4);
  });

  it("publishes, flags superseded versions and forms, keeps published texts immutable and retires", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const v2 = (await call<AdminConsentTextView>(harness, complianceAdmin, "POST", "/admin/consent-texts", draft(seed.country.id, seed.product.id))).body;

    const byCountryAdmin = await call<ErrorBody>(harness, countryAdmin(seed.country.id), "POST", `/admin/consent-texts/${v2.id}/publish`, { reason: "publication par admin pays" });
    expect(byCountryAdmin.status).toBe(403);
    expect(auditEntries(harness, "consent_text.publication_refused", "refused").at(-1)?.reason).toBe("rbac_denied");

    const published = await call<AdminConsentTextView>(harness, complianceAdmin, "POST", `/admin/consent-texts/${v2.id}/publish`, { reason: "publication conformite" });
    expect(published.status).toBe(200);
    expect(published.body.status).toBe("published");
    expect(published.body.publishedAt).not.toBeNull();
    expect(auditEntries(harness, "consent_text.published", "success").at(-1)?.reason).toBe("publication conformite");

    // Publication is idempotent and there is no edit route: a published text never changes.
    const again = await call<AdminConsentTextView>(harness, complianceAdmin, "POST", `/admin/consent-texts/${v2.id}/publish`, { reason: "publication conformite" });
    expect(again.body.publishedAt).toBe(published.body.publishedAt);
    const edit = await call(harness, complianceAdmin, "PATCH", `/admin/consent-texts/${v2.id}`, { content: "autre texte", reason: "modification texte" });
    expect(edit.status).toBe(404);
    expect(() => harness!.runtime.consent.service.updatePublishedText()).toThrow("immutable");

    const v1 = await call<AdminConsentTextView>(harness, complianceAdmin, "GET", `/admin/consent-texts/${seed.consentText.id}`);
    expect(v1.body.supersededBy).toBe(v2.id);
    const forms = await call<AdminQuoteFormDefinitionView[]>(harness, complianceAdmin, "GET", `/admin/quote-form-definitions?countryId=${seed.country.id}`);
    expect(forms.body.find((form) => form.id === seed.form.id)?.consentSuperseded).toBe(true);

    const preview = await call<AdminConsentTextView>(harness, complianceAdmin, "GET", `/admin/consent-texts/${v2.id}?preview=1`);
    expect(preview.body.preview).toContain("Cote d'Ivoire");
    expect(preview.body.preview).toContain("Assurance auto");
    expect(preview.body.preview).toContain("le courtier partenaire agréé auquel votre demande sera attribuée");
    expect(preview.body.preview).not.toContain("{{");

    const retired = await call<AdminConsentTextView>(harness, complianceAdmin, "POST", `/admin/consent-texts/${seed.consentText.id}/retire`, { reason: "retrait ancienne version" });
    expect(retired.status).toBe(200);
    expect(retired.body.status).toBe("retired");
    expect(retired.body.retiredAt).not.toBeNull();
    expect(auditEntries(harness, "consent_text.retired", "success").at(-1)?.reason).toBe("retrait ancienne version");
    const republish = await call(harness, complianceAdmin, "POST", `/admin/consent-texts/${seed.consentText.id}/publish`, { reason: "republication interdite" });
    expect(republish.status).toBe(409);

    // The published form still points at the retired text: quote readiness is blocked again.
    const checklist = await call<{ sections: Array<{ key: string; controls: Array<{ key: string; status: string }> }> }>(harness, complianceAdmin, "GET", "/admin/activation-checklist?country=CI");
    const quote = checklist.body.sections.find((section) => section.key === `quote:${seed.country.id}:${seed.product.id}`);
    expect(quote?.controls.find((control) => control.key === "published_consent_text")?.status).toBe("blocked");
  });

  it("serves the reference templates and keeps the support admin out", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    const templates = await call<ConsentTextTemplate[]>(harness, complianceAdmin, "GET", "/admin/consent-texts/templates");
    expect(templates.status).toBe(200);
    expect(templates.body.map((template) => template.language).sort()).toEqual(["en", "fr"]);
    expect(templates.body.every((template) => template.bodyTemplate.includes("{{brokerName}}") && template.bodyTemplate.includes("AssurMatch"))).toBe(true);

    expect((await call(harness, supportAdmin, "GET", "/admin/consent-texts")).status).toBe(403);
    expect((await call(harness, supportAdmin, "GET", "/admin/consent-texts/templates")).status).toBe(403);
    const unauthenticated = await harness.request("/admin/consent-texts");
    expect(unauthenticated.status).toBe(401);
  });
});
