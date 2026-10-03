import { afterEach, describe, expect, it } from "vitest";
import type { AdminPartnerApplication, PartnerApplicationConversionResult } from "../../../../packages/shared/contracts/partner-application.contracts";
import type { AdminPartnerDetailView } from "../../../../packages/shared/contracts/partner.contracts";
import { createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { adminPays, call, callJson, compliance, seedOnboardingRuntime, superAdmin, support } from "./partner-admin-http-helpers";

const CONTACT_EMAIL = "awa.kone@candidat.example";

function application(overrides: Record<string, unknown> = {}) {
  return {
    legalName: "Courtier Candidat SARL",
    tradeName: "Candidat",
    countryCode: "CI",
    licenseNumber: "LIC-CAND-051",
    licenseExpiresAt: "2030-06-30",
    licenseIssuingAuthority: "Direction des assurances CI",
    productKeys: ["auto"],
    monthlyCapacity: 40,
    contactName: "Awa Kone",
    contactEmail: CONTACT_EMAIL,
    contactPhone: "+2250102030407",
    desiredPlan: "pro",
    consent: true,
    ...overrides
  };
}

async function submit(harness: RuntimeHttpHarness, overrides: Record<string, unknown> = {}, ip = "203.0.113.51"): Promise<AdminPartnerApplication> {
  const response = await harness.request("/partners/applications", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(application(overrides))
  });
  expect(response.status).toBe(202);
  const { publicReference } = await readJson<{ publicReference: string }>(response);
  const rows = await callJson<AdminPartnerApplication[]>(harness, superAdmin, "GET", "/admin/partners/applications", undefined, 200);
  const row = rows.find((candidate) => candidate.publicReference === publicReference);
  if (!row) throw new Error("submitted application not listed");
  return row;
}

describe("spec 051 admin partner applications runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("reviews then converts an application into a draft partner and a draft licence, once", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const submitted = await submit(harness, { locale: "en" });
    expect(submitted).toMatchObject({ status: "received", locale: "en" });
    // Lists never carry the contact e-mail.
    expect(submitted.contactEmail).toBeUndefined();

    // Detail: full e-mail for the deciding roles, masked for the Admin Pays.
    expect(await callJson<AdminPartnerApplication>(harness, compliance, "GET", `/admin/partners/applications/${submitted.id}`, undefined, 200)).toMatchObject({ contactEmail: CONTACT_EMAIL, contactEmailMasked: false });
    const masked = await callJson<AdminPartnerApplication>(harness, adminPays(seed.country.id), "GET", `/admin/partners/applications/${submitted.id}`, undefined, 200);
    expect(masked.contactEmailMasked).toBe(true);
    expect(masked.contactEmail).not.toBe(CONTACT_EMAIL);
    // Out of scope reads as not found; the static route still wins over `partners/:id`.
    expect((await call(harness, adminPays(seed.senegal.id), "GET", `/admin/partners/applications/${submitted.id}`)).status).toBe(404);
    expect((await call(harness, adminPays(seed.senegal.id), "GET", "/admin/partners/applications")).status).toBe(200);

    const reviewed = await callJson<AdminPartnerApplication>(harness, adminPays(seed.country.id), "POST", `/admin/partners/applications/${submitted.id}/review`, { reason: "dossier pris en charge" }, 200);
    expect(reviewed.status).toBe("under_review");

    // Conversion is compliance only.
    expect((await call(harness, adminPays(seed.country.id), "POST", `/admin/partners/applications/${submitted.id}/convert`, { reason: "conversion tentee par admin pays" })).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "partner_application.decision_refused" }).at(-1)?.reason).toBe("decision_requires_compliance");

    const converted = await callJson<PartnerApplicationConversionResult>(harness, compliance, "POST", `/admin/partners/applications/${submitted.id}/convert`, { reason: "candidature conforme, conversion" }, 201);
    expect(converted.application).toMatchObject({ status: "accepted", partnerTenantId: converted.partnerTenantId });
    expect(converted.application.decidedAt).toBeDefined();

    const partner = await callJson<AdminPartnerDetailView>(harness, superAdmin, "GET", `/admin/partners/${converted.partnerTenantId}`, undefined, 200);
    expect(partner).toMatchObject({
      status: "draft",
      legalName: "Courtier Candidat SARL",
      countryId: seed.country.id,
      plan: "pro",
      primaryEmail: CONTACT_EMAIL,
      adminContactName: "Awa Kone",
      registrationNumber: null
    });
    expect(partner.licenses).toHaveLength(1);
    expect(partner.licenses[0]).toMatchObject({ id: converted.licenseId, status: "draft", licenseNumber: "LIC-CAND-051", issuingAuthority: "Direction des assurances CI", expirationDate: "2030-06-30", productIds: [seed.product.id] });

    expect(harness.runtime.audit.writer.search({ action: "partner_application.converted", targetId: submitted.id })).toHaveLength(1);
    const notified = harness.runtime.audit.writer.search({ action: "partner_application.decision_notified", targetId: submitted.id });
    expect(notified).toHaveLength(1);
    expect(notified[0]?.context).toMatchObject({ decision: "accepted", locale: "en" });

    // A decision is final.
    for (const [path, body] of [["convert", { reason: "seconde conversion" }], ["reject", { rejectionReasonCode: "other", reason: "refus apres conversion" }], ["review", { reason: "nouvelle revue" }]] as const) {
      const response = await call(harness, compliance, "POST", `/admin/partners/applications/${submitted.id}/${path}`, body);
      expect(response.status, path).toBe(409);
      expect(await response.json(), path).toMatchObject({ code: "APPLICATION_ALREADY_DECIDED" });
    }
  });

  it("refuses the conversion when broker onboarding is off for the country", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const submitted = await submit(harness);
    const partnersBefore = (await harness.runtime.partners.service.list()).length;
    await harness.runtime.countries.service.update(seed.country.id, {
      status: seed.country.status,
      flags: { ...(await harness.runtime.countries.service.require(seed.country.id)).flags, country_broker_onboarding_enabled: false },
      reason: "onboarding courtiers ferme"
    }, superAdmin);

    const response = await call(harness, compliance, "POST", `/admin/partners/applications/${submitted.id}/convert`, { reason: "conversion pays ferme" });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "COUNTRY_BROKER_ONBOARDING_DISABLED" });
    expect(await harness.runtime.partners.service.list()).toHaveLength(partnersBefore);
    expect((await callJson<AdminPartnerApplication>(harness, compliance, "GET", `/admin/partners/applications/${submitted.id}`, undefined, 200)).status).toBe("received");
  });

  it("rejects with a closed-list reason, e-mails a neutral decision and keeps support read-only", async () => {
    harness = await createRuntimeHttpHarness();
    await seedOnboardingRuntime(harness);
    const submitted = await submit(harness);
    const partnersBefore = (await harness.runtime.partners.service.list()).length;

    expect((await call(harness, support, "GET", `/admin/partners/applications/${submitted.id}`)).status).toBe(403);
    expect((await call(harness, compliance, "POST", `/admin/partners/applications/${submitted.id}/reject`, { rejectionReasonCode: "not_a_code", reason: "motif invalide" })).status).toBe(400);
    expect((await call(harness, compliance, "POST", `/admin/partners/applications/${submitted.id}/reject`, { reason: "motif absent" })).status).toBe(400);

    const rejected = await callJson<AdminPartnerApplication>(harness, compliance, "POST", `/admin/partners/applications/${submitted.id}/reject`, { rejectionReasonCode: "license_unverifiable", reason: "licence introuvable chez le regulateur" }, 200);
    expect(rejected).toMatchObject({ status: "rejected", rejectionReasonCode: "license_unverifiable", locale: "fr" });
    expect(harness.runtime.audit.writer.search({ action: "partner_application.rejected", targetId: submitted.id })[0]?.context).toMatchObject({ after: { status: "rejected", rejectionReasonCode: "license_unverifiable" } });
    expect(harness.runtime.audit.writer.search({ action: "partner_application.decision_notified", targetId: submitted.id })[0]?.context).toMatchObject({ decision: "rejected", locale: "fr" });
    expect(await harness.runtime.partners.service.list()).toHaveLength(partnersBefore);
  });
});

describe("spec 051 partner application decision e-mail delivery", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("sends the decision in the language of the application and audits a delivery failure without undoing the decision", async () => {
    harness = await createRuntimeHttpHarness();
    await seedOnboardingRuntime(harness);
    const notifications = harness.runtime.publicFormNotifications;
    const sent: Array<Record<string, unknown>> = [];
    notifications.notifyPartnerApplicationDecision = async (context) => {
      sent.push({ ...context });
      return "sent";
    };
    const accepted = await submit(harness, { locale: "en" }, "203.0.113.61");
    await callJson(harness, superAdmin, "POST", `/admin/partners/applications/${accepted.id}/convert`, { reason: "candidature conforme, conversion" }, 201);
    expect(sent).toEqual([{ to: CONTACT_EMAIL, contactName: "Awa Kone", publicReference: accepted.publicReference, decision: "accepted", locale: "en" }]);
    expect(harness.runtime.audit.writer.search({ action: "partner_application.decision_notified", targetId: accepted.id })[0]).toMatchObject({ result: "success" });

    notifications.notifyPartnerApplicationDecision = async () => {
      throw new Error("smtp down");
    };
    const refused = await submit(harness, { licenseNumber: "LIC-CAND-052", contactEmail: "autre@candidat.example" }, "203.0.113.62");
    await callJson(harness, compliance, "POST", `/admin/partners/applications/${refused.id}/reject`, { rejectionReasonCode: "out_of_coverage", reason: "zone non couverte par le pilote" }, 200);
    const failure = harness.runtime.audit.writer.search({ action: "partner_application.decision_notified", targetId: refused.id })[0];
    expect(failure).toMatchObject({ result: "failed", context: { emailStatus: "failed", decision: "rejected" } });
    expect((await callJson<AdminPartnerApplication>(harness, compliance, "GET", `/admin/partners/applications/${refused.id}`, undefined, 200)).status).toBe("rejected");
  });
});
