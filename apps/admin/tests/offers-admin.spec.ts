import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ErrorCodes } from "../../../packages/shared/contracts/error-codes";
import { OFFER_COMPLETENESS_REQUIRED } from "../../../packages/shared/contracts/offer-content";
import {
  COMPLETENESS_CHECKLIST,
  OFFER_BLOCKER_LABELS,
  OFFER_ERROR_MESSAGES,
  canDecideOffer,
  canPrepareOffer,
  canSubmitOffer,
  offerBlockerLabel,
  offerCompleteness,
  offerContentFromForm,
  offerWriteErrorMessage
} from "../app/lib/offer-messages";

/** Spec 052 T010: source markers and pure helpers of the admin offer screens. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

const offerFiles = [
  "apps/admin/app/offers/page.tsx",
  "apps/admin/app/offers/new/page.tsx",
  "apps/admin/app/offers/[offerId]/page.tsx",
  "apps/admin/app/offers/offer-forms.tsx",
  "apps/admin/app/lib/offer-actions.ts",
  "apps/admin/app/lib/offer-messages.ts"
];

test("the admin API client calls the spec 052 offer routes and keeps the offer blockers", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  for (const marker of [
    "`/admin/offers${query ? `?${query}` : \"\"}`",
    "params.set(\"queue\", filters.queue)",
    "params.set(\"expiringWithinDays\"",
    "params.set(\"sponsored\"",
    "params.set(\"partnerTenantId\"",
    "writeAdminResult<AdminOfferDetailView>(\"/admin/offers\", \"POST\", input)",
    "writeAdminResult<AdminOfferDetailView>(offerPath(offerId), \"PATCH\", input)",
    "offerPath(offerId, `/${action}`), \"POST\", { reason }",
    "offerBlockers"
  ]) {
    expect(api).toContain(marker);
  }
});

test("the offer list exposes the FR-010 filters, the validation queue, completeness and expiry", () => {
  const page = source("apps/admin/app/offers/page.tsx");
  for (const marker of [
    "Offres indicatives",
    "readAdminOfferList",
    "name=\"countryId\"",
    "name=\"productId\"",
    "name=\"partnerTenantId\"",
    "name=\"status\"",
    "name=\"sponsored\"",
    "name=\"expiring\"",
    "/offers?queue=submitted",
    "À valider",
    "Complétude",
    "Expire dans",
    "Sponsorisé"
  ]) {
    expect(page).toContain(marker);
  }
});

test("the offer page shows published vs pending, the diff, the history and compliance-only decisions", () => {
  const page = source("apps/admin/app/offers/[offerId]/page.tsx");
  for (const marker of [
    "Version publiée",
    "Version en cours",
    "offer.diff",
    "Historique des versions",
    "canDecide && pending?.status === \"submitted\" ? <OfferDecisionForm offerId={offer.id} action=\"reject\" />",
    "action=\"validate\"",
    "action=\"suspend\"",
    "action=\"submit\"",
    "EditOfferForm",
    "concurrencyToken"
  ]) {
    expect(page).toContain(marker);
  }
  const forms = source("apps/admin/app/offers/offer-forms.tsx");
  for (const marker of [
    "Motif (audite)",
    "ConfirmDialog",
    "data-compliance-only",
    "name=\"guaranteeLabel\"",
    "name=\"guaranteeKey\"",
    "name=\"guaranteeIncluded\"",
    "name=\"guaranteeDetail\"",
    "name=\"requiredDocuments\"",
    "name=\"publicDisclaimers\"",
    "OFFER_INDICATIVE_DISCLAIMERS",
    "Sponsorisation (admin uniquement)",
    "name=\"isSponsored\"",
    "name=\"sponsorLabel\"",
    "name=\"displayPriority\"",
    "name=\"expectedUpdatedAt\" value={offer.concurrencyToken}",
    "offerCompleteness"
  ]) {
    expect(forms).toContain(marker);
  }
});

test("only compliance validates, rejects and suspends; preparers create and edit (FR-011, R4)", () => {
  expect(canDecideOffer(["compliance_admin"])).toBe(true);
  expect(canDecideOffer(["super_admin"])).toBe(true);
  expect(canDecideOffer(["admin_pays"])).toBe(false);
  expect(canDecideOffer(["content_admin"])).toBe(false);
  expect(canPrepareOffer(["admin_pays"])).toBe(true);
  expect(canPrepareOffer(["content_admin"])).toBe(true);
  expect(canPrepareOffer(["compliance_admin"])).toBe(false);
  expect(canPrepareOffer(["support_admin"])).toBe(false);
  expect(canSubmitOffer(["compliance_admin"])).toBe(true);
  expect(canSubmitOffer(["finance_admin"])).toBe(false);
});

test("offer refusals and blockers are translated to French", () => {
  for (const code of [
    ErrorCodes.OFFER_SCOPE_NOT_COVERED,
    ErrorCodes.OFFER_INCOMPLETE,
    ErrorCodes.OFFER_VALIDATION_BLOCKED,
    ErrorCodes.OFFER_VERSION_CONFLICT,
    ErrorCodes.OFFER_TRANSITION_INVALID
  ]) {
    expect(OFFER_ERROR_MESSAGES[code]).toBeTruthy();
    expect(offerWriteErrorMessage({ status: 422, code })).toBe(OFFER_ERROR_MESSAGES[code]);
  }
  for (const code of ["missing_field", "offer_expired", "dates_invalid", "indicative_disclaimer_missing", "price_range_invalid", "partner_missing", "partner_not_active", "license_not_valid_for_scope"]) {
    expect(OFFER_BLOCKER_LABELS[code]).toBeTruthy();
  }
  expect(offerBlockerLabel({ code: "missing_field", field: "insurerName" })).toBe("Champ obligatoire manquant : Assureur porteur");
  expect(offerWriteErrorMessage({ status: 400, code: "VALIDATION_FAILED", message: "Validation failed: Forbidden regulated wording: souscrire maintenant" }))
    .toContain("souscrire maintenant");
});

test("the form parsing feeds the shared completeness (live checklist = API rule)", () => {
  expect(COMPLETENESS_CHECKLIST.map((item) => item.field)).toEqual([...OFFER_COMPLETENESS_REQUIRED]);
  const form = new FormData();
  form.set("name", "Auto Essentiel");
  form.set("insurerName", "Assureur CI");
  form.append("guaranteeLabel", "Responsabilité civile");
  form.append("guaranteeKey", "");
  form.append("guaranteeIncluded", "true");
  form.append("guaranteeDetail", "");
  form.set("indicativePriceMin", "45000");
  form.set("validFrom", "2026-01-01");
  form.set("validUntil", "2099-12-31");
  form.set("sourceOfInformation", "Grille tarifaire 2026");
  form.set("publicDisclaimers", "offre indicative\nprix a confirmer par le courtier partenaire");
  const content = offerContentFromForm(form);
  expect(content.guarantees).toEqual([{ key: "responsabilite_civile", label: "Responsabilité civile", included: true }]);
  expect(content.validUntil).toBe("2099-12-31T23:59:59.000Z");
  expect(content).not.toHaveProperty("isSponsored");
  expect(offerCompleteness(content).complete).toBe(true);
  form.delete("insurerName");
  expect(offerCompleteness(offerContentFromForm(form)).missing).toEqual(["insurerName"]);
  form.set("sponsorshipFields", "1");
  form.set("isSponsored", "on");
  expect(offerContentFromForm(form).isSponsored).toBe(true);
});

test("offer screens avoid regulated wording and never call an offer the best one", () => {
  const files = offerFiles.map(source).join("\n");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance", "meilleure offre", "Meilleure offre"]) {
    expect(files).not.toContain(forbidden);
  }
  expect(files).toContain("offre indicative");
});
