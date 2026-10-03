import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ErrorCodes } from "../../../packages/shared/contracts/error-codes";
import { OFFER_SPONSORSHIP_KEYS, brokerOfferUpdateSchema } from "../../../packages/shared/contracts/offer-content";
import { TENANT_SUSPENDED_MESSAGE, canMutateOffers, canReadOffers } from "../app/lib/broker-permissions";
import {
  OFFER_ERROR_MESSAGES,
  offerBlockerLabel,
  offerCompleteness,
  offerContentFromForm,
  offerWriteErrorMessage
} from "../app/lib/offer-messages";

/** Spec 052 T011: source markers and pure helpers of the broker offer screens (« Mes offres »). */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

const offerFiles = [
  "apps/broker/app/offers/page.tsx",
  "apps/broker/app/offers/new/page.tsx",
  "apps/broker/app/offers/[offerId]/page.tsx",
  "apps/broker/app/offers/offer-forms.tsx",
  "apps/broker/app/lib/offer-actions.ts",
  "apps/broker/app/lib/offer-api.ts",
  "apps/broker/app/lib/offer-messages.ts"
];

const owner = { roles: ["broker_owner_pro"], partnerPlan: "pro" as const, mfaVerified: true };

test("navigation exposes « Mes offres » in the broker shell only", () => {
  const shell = source("apps/broker/app/lib/ui/broker-shell.tsx");
  expect(shell).toContain("{ label: \"Mes offres\", href: \"/offers\"");
  expect(source("apps/admin/app/lib/ui/admin-shell.tsx")).not.toContain("Mes offres");
});

test("the broker client calls the spec 052 broker routes only", () => {
  const api = source("apps/broker/app/lib/offer-api.ts");
  for (const marker of [
    "`/broker/offers${query ? `?${query}` : \"\"}`",
    "`/broker/offers/${encodeURIComponent(offerId)}`",
    "suspended: response.status === 403 && code === PARTNER_SUSPENDED_CODE",
    "response.status === 404"
  ]) {
    expect(api).toContain(marker);
  }
  expect(api).not.toContain("/admin/");
  const actions = source("apps/broker/app/lib/offer-actions.ts");
  for (const marker of [
    "writeBrokerOffer(\"/broker/offers\", \"POST\"",
    "writeBrokerOffer(offerPath(offerId), \"PATCH\"",
    "offerPath(offerId, \"/submit\")",
    "offerPath(offerId, \"/withdraw\"), \"POST\", { reason, target }",
    "offerPath(offerId, \"/renew\")",
    "expectedUpdatedAt"
  ]) {
    expect(actions).toContain(marker);
  }
});

test("owners and managers write; agents, read-only users and suspended partners only read", () => {
  expect(canReadOffers({ roles: ["broker_agent"] })).toBe(true);
  expect(canReadOffers({ roles: ["broker_read_only"] })).toBe(true);
  expect(canMutateOffers(owner)).toBe(true);
  expect(canMutateOffers({ roles: ["broker_manager"] })).toBe(true);
  expect(canMutateOffers({ roles: ["broker_agent"] })).toBe(false);
  expect(canMutateOffers({ roles: ["broker_read_only"] })).toBe(false);
  expect(canMutateOffers({ ...owner, partnerTenantStatus: "suspended", tenantReadOnly: true })).toBe(false);

  const list = source("apps/broker/app/offers/page.tsx");
  expect(list).toContain("actions={canWrite ? <Button href=\"/offers/new\">Nouvelle offre</Button> : null}");
  expect(list).toContain("TENANT_SUSPENDED_MESSAGE");
  const detail = source("apps/broker/app/offers/[offerId]/page.tsx");
  expect(detail).toContain("<TenantWriteGuard readOnly={readOnlyTenant}>");
  expect(detail).toContain("{writer && !withdrawn ? (");
  expect(source("apps/broker/app/offers/new/page.tsx")).toContain("!canMutateOffers(session.profile)");
  expect(offerWriteErrorMessage({ status: 403, code: "PARTNER_SUSPENDED", suspended: true })).toBe(TENANT_SUSPENDED_MESSAGE);
});

test("the list shows status, completeness, expiry and the last refusal reason", () => {
  const list = source("apps/broker/app/offers/page.tsx");
  for (const marker of ["Mes offres", "OFFER_STATUS_LABELS", "Complétude", "Expire dans ${offer.expiresInDays} jours", "Expirée : à renouveler", "Dernier motif", "lastDecisionReason"]) {
    expect(list).toContain(marker);
  }
});

test("the detail keeps the published version read-only and edits the version in progress", () => {
  const detail = source("apps/broker/app/offers/[offerId]/page.tsx");
  for (const marker of ["Version publiée", "Lecture seule", "Version en cours", "EditBrokerOfferForm", "SubmitBrokerOfferForm", "target=\"pending\"", "target=\"offer\"", "RenewBrokerOfferForm", "Motif du dernier refus", "Historique des versions"]) {
    expect(detail).toContain(marker);
  }
  const forms = source("apps/broker/app/offers/offer-forms.tsx");
  for (const marker of ["offerCompleteness", "name=\"scope\"", "name=\"guaranteeLabel\"", "name=\"expectedUpdatedAt\" value={concurrencyToken}", "OFFER_INDICATIVE_DISCLAIMERS"]) {
    expect(forms).toContain(marker);
  }
});

test("no sponsorship field ever reaches the broker portal (FR-013)", () => {
  const files = offerFiles.map(source).join("\n");
  for (const key of OFFER_SPONSORSHIP_KEYS) expect(files).not.toContain(`name="${key}"`);
  const form = new FormData();
  form.set("name", "Auto Essentiel");
  form.set("validFrom", "2026-01-01");
  form.set("validUntil", "2099-12-31");
  form.set("isSponsored", "on");
  form.set("sponsorshipFields", "1");
  const content = offerContentFromForm(form);
  for (const key of OFFER_SPONSORSHIP_KEYS) expect(content).not.toHaveProperty(key);
  // The parsed content is accepted by the strict broker schema as is.
  expect(brokerOfferUpdateSchema.safeParse(content).success).toBe(true);
  expect(offerCompleteness(content).missing).toEqual(["insurerName", "guarantees", "indicativePrice", "sourceOfInformation"]);
});

test("refusals are translated to French, including the uncovered scope", () => {
  expect(offerWriteErrorMessage({ status: 422, code: ErrorCodes.OFFER_SCOPE_NOT_COVERED })).toBe(OFFER_ERROR_MESSAGES.OFFER_SCOPE_NOT_COVERED);
  expect(offerWriteErrorMessage({ status: 422, code: ErrorCodes.OFFER_INCOMPLETE })).toContain("complétude minimale");
  expect(offerWriteErrorMessage({ status: 409, code: ErrorCodes.OFFER_VERSION_CONFLICT })).toContain("Rechargez");
  expect(offerBlockerLabel({ code: "license_not_valid_for_scope" })).toContain("licence valide");
  expect(offerBlockerLabel({ code: "missing_field", field: "sourceOfInformation" })).toContain("Source de l'information");
});

test("broker offer screens avoid regulated wording and keep the indicative mention", () => {
  const files = offerFiles.map(source).join("\n");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance", "meilleure offre", "Meilleure offre"]) {
    expect(files).not.toContain(forbidden);
  }
  expect(files).toContain("Offre indicative : prix à confirmer par le courtier partenaire");
});
