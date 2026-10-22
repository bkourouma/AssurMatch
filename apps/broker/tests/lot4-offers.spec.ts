import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { brokerOfferCreateSchema, brokerOfferTypeSchema } from "../../../packages/shared/contracts/offer-content";
import {
  BROKER_OFFER_TYPE_DESCRIPTIONS,
  BROKER_OFFER_TYPE_OPTIONS,
  OFFER_ERROR_MESSAGES,
  OFFER_TYPE_LABELS,
  PRIVATE_OFFER_BADGE,
  offerContentFromForm,
  offerTypeLabel,
  offerWriteErrorMessage
} from "../app/lib/offer-messages";

/** Spec 070 lot 4: source markers and pure helpers of the offer types, the insurer choice and the read-only AI summary (broker). */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("the broker creates only indicative and private offers, with the private explanation", () => {
  expect([...BROKER_OFFER_TYPE_OPTIONS]).toEqual([...brokerOfferTypeSchema.options]);
  expect(BROKER_OFFER_TYPE_OPTIONS).not.toContain("partner");
  expect(BROKER_OFFER_TYPE_OPTIONS).not.toContain("insurer");
  expect(BROKER_OFFER_TYPE_DESCRIPTIONS.private).toContain("n'est jamais affichée au public");
  expect(OFFER_TYPE_LABELS.private).toBe("Offre privée (visible uniquement du courtier, jamais publique ni comparée)");
  expect(OFFER_TYPE_LABELS.insurer).toBe("Offre assureur (validée par un assureur, saisie par l'administration)");
  expect(offerTypeLabel("partner")).toBe("Offre partenaire");
  expect(PRIVATE_OFFER_BADGE).toBe("Privée — jamais publique");
  const forms = source("apps/broker/app/offers/offer-forms.tsx");
  expect(forms).toContain("BROKER_OFFER_TYPE_OPTIONS.map");
  expect(forms).toContain("type-readonly");
  expect(forms).toContain("readOnly");
});

test("the form sends the type and the chosen insurer, and the payload passes the broker schema", () => {
  const form = new FormData();
  form.set("name", "Auto Privée");
  form.set("validFrom", "2026-01-01");
  form.set("validUntil", "2099-12-31");
  form.set("offerType", "private");
  form.set("insurerId", "11111111-1111-4111-8111-111111111111");
  form.set("insurerName", "Saham");
  const content = offerContentFromForm(form);
  expect(content.offerType).toBe("private");
  expect(content.insurerId).toBe("11111111-1111-4111-8111-111111111111");
  const payload = { ...content, countryId: "22222222-2222-4222-8222-222222222222", productId: "33333333-3333-4333-8333-333333333333" };
  expect(brokerOfferCreateSchema.safeParse(payload).success).toBe(true);
  // A type the broker cannot write never travels (partner or insurer offers keep their type).
  const partner = new FormData();
  partner.set("name", "Offre partenaire");
  partner.set("offerType", "partner");
  expect(offerContentFromForm(partner)).not.toHaveProperty("offerType");
});

test("the insurer choice comes from the broker route and falls back to free text", () => {
  const api = source("apps/broker/app/lib/lot4-offers-api.ts");
  expect(api).toContain("`/broker/insurers?countryId=${encodeURIComponent(countryId)}`");
  expect(api).not.toContain("/admin/");
  const forms = source("apps/broker/app/offers/offer-forms.tsx");
  expect(forms).toContain("Assureur porteur du risque");
  expect(forms).toContain("name=\"insurerId\"");
  expect(forms).toContain("Autre assureur (saisie libre)");
  expect(forms).toContain("name=\"insurerName\"");
});

test("the offer list filters by type and shows the private badge", () => {
  const page = source("apps/broker/app/offers/page.tsx");
  expect(page).toContain("name=\"offerType\"");
  expect(page).toContain("OFFER_TYPE_FILTER_OPTIONS");
  expect(page).toContain("offerTypeLabel(offer.offerType)");
  expect(page).toContain("PRIVATE_OFFER_BADGE");
  const detail = source("apps/broker/app/offers/[offerId]/page.tsx");
  expect(detail).toContain("offerTypeLabel(offer.offerType)");
  expect(detail).not.toContain("offer.offerType === \"partner\" ? \"Offre partenaire\"");
  expect(detail).toContain("PRIVATE_OFFER_BADGE");
});

test("the type and insurer refusals are translated to French", () => {
  for (const code of ["OFFER_TYPE_INVALID", "OFFER_TYPE_IMMUTABLE", "OFFER_INSURER_INVALID"]) {
    expect(OFFER_ERROR_MESSAGES[code]).toBeTruthy();
    expect(offerWriteErrorMessage({ status: 422, code })).toBe(OFFER_ERROR_MESSAGES[code]);
  }
});

test("the AI summary is strictly read only for the broker: no generation, no edition", () => {
  const card = source("apps/broker/app/offers/offer-ai-summary.tsx");
  for (const marker of ["Assistance IA désactivée pour cette offre", "Aucun résumé validé", "summary.label", "summary.disclaimer", "validatedAt"]) {
    expect(card).toContain(marker);
  }
  for (const forbidden of ["<form", "<Form", "<Button", "<Textarea", "action=", "Générer"]) expect(card).not.toContain(forbidden);
  const api = source("apps/broker/app/lib/lot4-offers-api.ts");
  expect(api).toContain("`/broker/offers/${encodeURIComponent(offerId)}/ai-summary`");
  expect(api).not.toContain("POST");
  expect(api).not.toContain("/ai/insights");
  expect(source("apps/broker/app/offers/[offerId]/page.tsx")).toContain("<OfferAiSummaryCard result={aiSummary} />");
});
