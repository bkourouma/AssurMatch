import type { AdminAccreditationDocumentView, AdminPartnerContractView, AdminPartnerDetailView, AdminPartnerLicenseView } from "../../../../packages/shared/contracts/partner.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { MINIMAL_PDF } from "../helpers/partner-onboarding-seed";
import { actorHeaders, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

export const superAdmin: ActorContext = { actorId: "00000000-0000-4000-8000-0000000051a0", roles: ["super_admin"], mfaVerified: true };
export const compliance: ActorContext = { actorId: "00000000-0000-4000-8000-0000000051a1", roles: ["compliance_admin"], mfaVerified: true };
export const support: ActorContext = { actorId: "00000000-0000-4000-8000-0000000051a2", roles: ["support_admin"], mfaVerified: true };
export function adminPays(countryId: string): ActorContext {
  return { actorId: "00000000-0000-4000-8000-0000000051a3", roles: ["admin_pays"], countryScopes: [countryId], mfaVerified: true };
}

export async function call(harness: RuntimeHttpHarness, actor: ActorContext, method: string, path: string, body?: unknown): Promise<Response> {
  return harness.request(path, {
    method,
    headers: { ...actorHeaders(actor), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

export async function callJson<T>(harness: RuntimeHttpHarness, actor: ActorContext, method: string, path: string, body?: unknown, expectedStatus?: number): Promise<T> {
  const response = await call(harness, actor, method, path, body);
  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new Error(`${method} ${path}: expected ${expectedStatus}, got ${response.status} ${await response.text()}`);
  }
  return readJson<T>(response);
}

export async function uploadDocument(
  harness: RuntimeHttpHarness,
  actor: ActorContext,
  partnerId: string,
  fields: { documentType: string; licenseId?: string; reason?: string },
  file: { bytes: Buffer; mimeType?: string; fileName?: string } = { bytes: MINIMAL_PDF }
): Promise<Response> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.mimeType ?? "application/pdf" }), file.fileName ?? "agrement.pdf");
  form.append("documentType", fields.documentType);
  if (fields.licenseId) form.append("licenseId", fields.licenseId);
  form.append("reason", fields.reason ?? "upload accreditation proof");
  return harness.request(`/admin/partners/${partnerId}/documents`, { method: "POST", headers: actorHeaders(actor), body: form });
}

/** Public runtime seed (CI + auto) with broker onboarding open in CI, plus a second country (SN). */
export async function seedOnboardingRuntime(harness: RuntimeHttpHarness) {
  const seed = await seedPublicRuntime(harness.runtime);
  await harness.runtime.countries.service.update(seed.country.id, {
    status: seed.country.status,
    flags: { ...(await harness.runtime.countries.service.require(seed.country.id)).flags, country_broker_onboarding_enabled: true },
    reason: "open broker onboarding for spec 051 tests"
  }, superAdmin);
  const senegal = await harness.runtime.countries.service.create({
    isoCode: "SN",
    name: "Senegal",
    currency: "XOF",
    languages: ["fr"],
    timezone: "Africa/Dakar",
    regulatoryFamily: "cima",
    regulatoryRegimeId: "00000000-0000-4000-8000-000000000011"
  }, superAdmin);
  return { ...seed, senegal };
}

let counter = 0;

export function partnerPayload(countryId: string, overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    legalName: `Courtier Test CI ${counter}`,
    tradeName: `Courtier ${counter}`,
    countryId,
    city: "Abidjan",
    registrationNumber: `CI-ABJ-2026-B-${1000 + counter}`,
    primaryEmail: `contact${counter}@courtier.example`,
    primaryWhatsApp: "+2250102030405",
    adminContactName: "Awa Admin",
    adminContactEmail: `admin${counter}@courtier.example`,
    adminContactPhone: "+2250102030406",
    commercialContactName: "Koffi Commercial",
    commercialContactEmail: `sales${counter}@courtier.example`,
    commercialContactPhone: "+2250102030407",
    partnerInsurers: ["Assureur A", "Assureur B"],
    plan: "pro",
    quotaMonthlyLeads: 25,
    slaTargetMinutes: 60,
    reason: "creation du courtier pour le pilote",
    ...overrides
  };
}

export async function createPartner(harness: RuntimeHttpHarness, actor: ActorContext, countryId: string, overrides: Record<string, unknown> = {}): Promise<AdminPartnerDetailView> {
  return callJson<AdminPartnerDetailView>(harness, actor, "POST", "/admin/partners", partnerPayload(countryId, overrides), 201);
}

export async function createLicense(harness: RuntimeHttpHarness, actor: ActorContext, partnerId: string, countryId: string, productIds: string[], overrides: Record<string, unknown> = {}): Promise<AdminPartnerLicenseView> {
  return callJson<AdminPartnerLicenseView>(harness, actor, "POST", `/admin/partners/${partnerId}/licenses`, {
    licenseNumber: `LIC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    issuingAuthority: "Direction des assurances",
    countryId,
    productIds,
    effectiveDate: "2026-01-01",
    expirationDate: "2030-01-01",
    reason: "licence declaree par le courtier",
    ...overrides
  }, 201);
}

/** Uploads a clean proof attached to the licence and accepts it (compliance). */
export async function acceptedProof(harness: RuntimeHttpHarness, partnerId: string, licenseId: string): Promise<AdminAccreditationDocumentView> {
  const uploaded = await readJson<AdminAccreditationDocumentView>(await uploadDocument(harness, superAdmin, partnerId, { documentType: "license", licenseId }));
  return callJson<AdminAccreditationDocumentView>(harness, compliance, "POST", `/admin/partners/${partnerId}/documents/${uploaded.id}/review`, { decision: "accepted", reason: "preuve conforme verifiee" }, 200);
}

export async function recordContract(harness: RuntimeHttpHarness, partnerId: string, version = "v1"): Promise<AdminPartnerContractView> {
  const signed = await readJson<AdminAccreditationDocumentView>(await uploadDocument(harness, superAdmin, partnerId, { documentType: "partnership_contract" }, { bytes: MINIMAL_PDF, fileName: "contrat.pdf" }));
  return callJson<AdminPartnerContractView>(harness, superAdmin, "POST", `/admin/partners/${partnerId}/contracts`, {
    version, signedAt: "2026-02-01", signatoryName: "Signataire Courtier", documentId: signed.id, reason: "contrat signe hors plateforme"
  }, 201);
}

export async function inviteOwner(harness: RuntimeHttpHarness, partnerId: string) {
  return harness.runtime.users.service.create({
    email: `owner-${partnerId.slice(0, 8)}@courtier.example`,
    displayName: "Owner Courtier",
    roles: ["broker_owner_pro"],
    partnerTenantId: partnerId,
    scopes: { countryIds: [], productIds: [] }
  }, superAdmin);
}

/**
 * A partner in `pending_compliance` meeting every activation condition: valid licence with an
 * accepted proof, country and product authorizations, invited owner, recorded contract.
 */
export async function prepareActivatablePartner(harness: RuntimeHttpHarness, countryId: string, productId: string) {
  const partner = await createPartner(harness, superAdmin, countryId);
  const license = await createLicense(harness, superAdmin, partner.id, countryId, [productId]);
  await acceptedProof(harness, partner.id, license.id);
  await callJson(harness, compliance, "POST", `/admin/partners/${partner.id}/licenses/${license.id}/validate`, { reason: "licence verifiee aupres du regulateur" }, 200);
  await callJson(harness, superAdmin, "POST", `/admin/partners/${partner.id}/authorizations/countries`, { countryId, reason: "couverture pays du pilote" }, 201);
  await callJson(harness, superAdmin, "POST", `/admin/partners/${partner.id}/authorizations/products`, { productId, reason: "couverture produit du pilote" }, 201);
  await inviteOwner(harness, partner.id);
  await recordContract(harness, partner.id);
  await callJson(harness, superAdmin, "POST", `/admin/partners/${partner.id}/status`, { status: "pending_compliance", reason: "dossier complet a verifier" }, 200);
  return { partner, license };
}
