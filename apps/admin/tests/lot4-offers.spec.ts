import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { offerTypeSchema } from "../../../packages/shared/contracts/offer-content";
import { OFFER_AI_SUMMARY_LABEL } from "../../../packages/shared/contracts/ai.contracts";
import {
  INSURER_EDIT_STATUS_OPTIONS,
  OFFER_ERROR_MESSAGES,
  OFFER_TYPE_LABELS,
  OFFER_TYPE_OPTIONS,
  PRIVATE_OFFER_BADGE,
  insurerWriteErrorMessage,
  offerContentFromForm,
  offerTypeLabel,
  offerWriteErrorMessage
} from "../app/lib/offer-messages";

/** Spec 070 lot 4: source markers and pure helpers of the offer types, the insurer referential and the AI summary (admin). */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("the four offer types have their French label, in the same order as the contract", () => {
  expect([...OFFER_TYPE_OPTIONS]).toEqual([...offerTypeSchema.options]);
  expect(OFFER_TYPE_LABELS.indicative).toBe("Offre indicative");
  expect(OFFER_TYPE_LABELS.partner).toBe("Offre partenaire");
  expect(OFFER_TYPE_LABELS.insurer).toBe("Offre assureur (validée par un assureur, saisie par l'administration)");
  expect(OFFER_TYPE_LABELS.private).toBe("Offre privée (visible uniquement du courtier, jamais publique ni comparée)");
  expect(offerTypeLabel("private")).toBe("Offre privée");
  expect(offerTypeLabel(undefined)).toBe("Offre indicative");
  expect(PRIVATE_OFFER_BADGE).toBe("Privée — jamais publique");
});

test("the offer list filters by type and no longer hard-codes the type label", () => {
  const page = source("apps/admin/app/offers/page.tsx");
  expect(page).toContain("name=\"offerType\"");
  expect(page).toContain("OFFER_TYPE_OPTIONS");
  expect(page).toContain("offerTypeLabel(offer.offerType)");
  expect(page).toContain("PRIVATE_OFFER_BADGE");
  expect(page).not.toContain("offer.offerType === \"partner\" ? \"Offre partenaire\"");
  const api = source("apps/admin/app/lib/lot4-offers-api.ts");
  expect(api).toContain("params.set(\"offerType\", filters.offerType)");
});

test("the offer forms offer the four types at creation and keep the type read only on edition", () => {
  const forms = source("apps/admin/app/offers/offer-forms.tsx");
  expect(forms).toContain("OFFER_TYPE_OPTIONS.map");
  expect(forms).toContain("name=\"offerType\"");
  expect(forms).toContain("type-readonly");
  expect(forms).toContain("readOnly");
  expect(forms).toContain("<input type=\"hidden\" name=\"offerType\" value={offer.offerType} />");
  // A private offer is never sponsored: the sponsorship section disappears for it.
  expect(forms).toContain("offerType === \"private\" ? null : <SponsorshipFields");
  expect(forms).toContain("offer.offerType === \"private\" ? null : <SponsorshipFields");
});

test("the offer forms link the carrying insurer through insurerId and keep the free text as a fallback", () => {
  const forms = source("apps/admin/app/offers/offer-forms.tsx");
  expect(forms).toContain("Assureur porteur du risque");
  expect(forms).toContain("name=\"insurerId\"");
  expect(forms).toContain("Autre assureur (saisie libre)");
  expect(forms).toContain("name=\"insurerName\"");
  const form = new FormData();
  form.set("name", "Offre assureur");
  form.set("insurerId", "11111111-1111-4111-8111-111111111111");
  form.set("insurerName", "Saham");
  expect(offerContentFromForm(form)).toMatchObject({ insurerId: "11111111-1111-4111-8111-111111111111", insurerName: "Saham" });
  const free = new FormData();
  free.set("name", "Offre libre");
  free.set("insurerId", "");
  free.set("insurerName", "Assureur libre");
  const content = offerContentFromForm(free);
  expect(content).not.toHaveProperty("insurerId");
  expect(content.insurerName).toBe("Assureur libre");
});

test("the offer actions enforce the type rules and accept the four types", () => {
  const actions = source("apps/admin/app/lib/offer-actions.ts");
  expect(actions).toContain("OFFER_TYPE_OPTIONS");
  expect(actions).toContain("Une offre privée appartient à un courtier");
  expect(actions).toContain("Une offre assureur nomme son assureur");
});

test("the offer type and insurer refusals are translated to French", () => {
  for (const code of ["OFFER_TYPE_INVALID", "OFFER_TYPE_IMMUTABLE", "OFFER_INSURER_INVALID"]) {
    expect(OFFER_ERROR_MESSAGES[code]).toBeTruthy();
    expect(offerWriteErrorMessage({ status: 422, code })).toBe(OFFER_ERROR_MESSAGES[code]);
  }
  expect(OFFER_ERROR_MESSAGES.OFFER_INSURER_INVALID).toContain("suspendu");
});

test("the insurer referential has its list, create and edit pages, filters and navigation entry", () => {
  const list = source("apps/admin/app/insurers/page.tsx");
  for (const marker of ["Assureurs", "name=\"countryId\"", "name=\"status\"", "readAdminInsurers", "href=\"/insurers/new\""]) {
    expect(list).toContain(marker);
  }
  const forms = source("apps/admin/app/insurers/insurer-forms.tsx");
  for (const marker of [
    "name=\"code\"",
    "name=\"approvalNumber\"",
    "name=\"reason\"",
    "name=\"expectedUpdatedAt\"",
    "Définitif : le code ne peut pas être modifié.",
    "readOnly",
    "RetireInsurerForm",
    "ConfirmDialog"
  ]) {
    expect(forms).toContain(marker);
  }
  expect(source("apps/admin/app/insurers/[insurerId]/page.tsx")).toContain("readAdminInsurer(insurerId)");
  expect(source("apps/admin/app/insurers/new/page.tsx")).toContain("CreateInsurerForm");
  expect(source("apps/admin/app/lib/ui/admin-shell.tsx")).toContain("{ label: \"Assureurs\", href: \"/insurers\" }");
  expect([...INSURER_EDIT_STATUS_OPTIONS]).toEqual(["active", "suspended"]);
});

test("the insurer API client calls the spec 070 routes", () => {
  const api = source("apps/admin/app/lib/lot4-offers-api.ts");
  for (const marker of [
    "`/admin/insurers${query ? `?${query}` : \"\"}`",
    "`/admin/insurers/${encodeURIComponent(insurerId)}`",
    "write<AdminInsurerView>(\"/admin/insurers\", \"POST\", input)",
    "`/admin/insurers/${encodeURIComponent(insurerId)}/retire`",
    "`/admin/offers/${encodeURIComponent(offerId)}/ai-summary`",
    "\"/admin/ai/insights/offer_summary\""
  ]) {
    expect(api).toContain(marker);
  }
});

test("insurer refusals are translated to French (duplicate country + code, rights)", () => {
  expect(insurerWriteErrorMessage({ status: 409, code: "CONFLICT" }, "create")).toContain("Ce code existe déjà pour ce pays");
  expect(insurerWriteErrorMessage({ status: 409, code: "CONFLICT" }, "update")).toContain("modifiée depuis son chargement");
  expect(insurerWriteErrorMessage({ status: 403, code: "RBAC_DENIED" }, "create")).toContain("droits insuffisants");
  expect(insurerWriteErrorMessage({ status: 404 }, "retire")).toContain("introuvable");
  expect(insurerWriteErrorMessage({ status: 400, message: "Forbidden regulated wording: garantie à vie" }, "create")).toContain("garantie à vie");
});

test("the insurer actions ask for the audited reason and never change the code", () => {
  const actions = source("apps/admin/app/lib/lot4-offers-actions.ts");
  expect(actions).toContain("\"use server\"");
  expect(actions).toContain("Motif obligatoire : au moins");
  expect(actions).toContain("expectedUpdatedAt");
  const update = actions.slice(actions.indexOf("export async function updateInsurerAction"), actions.indexOf("export async function retireInsurerAction"));
  expect(update).not.toContain("code");
});

test("the offer page shows the AI summary with a generation button for the AI roles only when enabled", () => {
  const card = source("apps/admin/app/offers/offer-ai-summary.tsx");
  for (const marker of ["OFFER_AI_DISABLED_NOTE", "OFFER_AI_NO_SUMMARY_NOTE", "summary.label", "summary.disclaimer", "validatedAt", "Générer un résumé IA", "enabled && canGenerate", "href=\"/ai-assistance\""]) {
    expect(card).toContain(marker);
  }
  const messages = source("apps/admin/app/lib/offer-messages.ts");
  expect(messages).toContain("Assistance IA désactivée pour cette offre");
  expect(messages).toContain("Aucun résumé validé");
  expect(OFFER_AI_SUMMARY_LABEL).toBe("Contenu généré par IA, validé par un administrateur");
  const page = source("apps/admin/app/offers/[offerId]/page.tsx");
  expect(page).toContain("OfferAiSummaryCard");
  expect(page).toContain("readAdminOfferAiSummary(offerId)");
  const actions = source("apps/admin/app/lib/lot4-offers-actions.ts");
  expect(actions).toContain("generateOfferSummaryAction");
});

test("the AI assistance page knows the offer summary type", () => {
  expect(source("apps/admin/app/ai-assistance/page.tsx")).toContain("offer_summary: \"Résumé d'une offre\"");
  expect(source("apps/admin/app/lib/ai-insight-actions.ts")).toContain("\"offer_summary\"");
});
