import { describe, expect, it } from "vitest";
import { findConsentContentIssues } from "../../../../packages/shared/contracts/consent-content";
import { clearRegulatedWordingCache, findForbiddenWordingAnyLanguage, findRegulatedWordingAnyLanguage } from "../../../../packages/shared/contracts/content-safety";
import { insurerCreateSchema } from "../../../../packages/shared/contracts/insurer.contracts";
import { findOfferContentForbiddenWording, offerContentSchema } from "../../../../packages/shared/contracts/offer-content";
import { findQuoteFormForbiddenWording } from "../../../src/modules/quote-forms/quote-form-definition.service";

const LEGIT = [
  "Couverture garantie en cas de vol",
  "Taux garanti de 2 %",
  "Remboursement garanti des frais médicaux",
  "Guaranteed cover for theft",
  "Valid contract required for claims",
  "Contrat valide jusqu'au 31/12",
  "Offre garantie par la société XYZ",
  "invalid contract",
  "contrat à valider",
  "Contrat valide à partir du 1er janvier"
];
const FORBIDDEN: Array<[string, string]> = [
  ["contrat validé", "contrat valide"], ["Contrat-validé", "contrat valide"], ["CONTRAT VALIDÉ", "contrat valide"], ["contrat   validé", "contrat valide"],
  ["Contrat validé jusqu'au 31/12", "contrat valide"], ["contrat valide", "contrat valide"],
  ["valid contract", "valid contract"], ["VALID CONTRACT", "valid contract"], ["Avec ce contrat valide pour vous", "contrat valide"],
  ["acheter maintenant", "acheter maintenant"], ["souscrire maintenant", "souscrire maintenant"],
  ["garantie acceptée", "garantie acceptée"], ["garantie acceptee", "garantie acceptee"],
  ["la meilleure assurance du marché", "la meilleure assurance du marché"], ["la meilleure assurance du marche", "la meilleure assurance du marche"],
  ["buy now", "buy now"], ["subscribe now", "subscribe now"], ["cover accepted", "cover accepted"],
  ["best insurance on the market", "best insurance on the market"], ["guaranteed callback", "guaranteed callback"], ["firm price", "firm price"],
  ["contract validated", "contract validated"], ["validated contract", "validated contract"],
  ["Achetez maintenant", "achetez maintenant"], ["Souscrivez-maintenant", "souscrivez maintenant"], ["Con​trat val­idé", "contrat valide"]
];

describe("findRegulatedWordingAnyLanguage (narrow regulatory filter)", () => {
  it.each(LEGIT)("lets %j through", (text) => {
    expect(findRegulatedWordingAnyLanguage(text)).toEqual([]);
  });
  it.each(FORBIDDEN)("refuses %j", (text, canonical) => {
    expect(findRegulatedWordingAnyLanguage(text)).toContain(canonical);
  });
  it("is stable, deduplicated and cache-safe (mutating a result does not poison the next call)", () => {
    clearRegulatedWordingCache();
    const sample = "Souscrivez maintenant, achetez maintenant, buy now";
    const first = findRegulatedWordingAnyLanguage(sample);
    expect(first).toEqual(["buy now", "achetez maintenant", "souscrivez maintenant"]);
    first.push("junk");
    expect(findRegulatedWordingAnyLanguage(sample)).toEqual(["buy now", "achetez maintenant", "souscrivez maintenant"]);
    expect(findRegulatedWordingAnyLanguage("contrat valide contrat validé")).toEqual(["contrat valide"]);
  });
  it("keeps the messaging filter unchanged: promises stay refused there", () => {
    expect(findForbiddenWordingAnyLanguage("Couverture garantie en cas de vol")).toEqual(["couverture garantie"]);
    expect(findForbiddenWordingAnyLanguage("Taux garanti de 2 %")).toEqual(["taux garanti"]);
    expect(findForbiddenWordingAnyLanguage("Guaranteed cover for theft")).toEqual(["guaranteed"]);
    expect(findForbiddenWordingAnyLanguage("Contrat valide jusqu'au 31/12")).toEqual(["contrat valide"]);
  });
});

describe("narrow filter on each surface", () => {
  const base = { name: "Auto Essentiel", validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2030-01-01T00:00:00.000Z" };
  it("offers: legit texts pass on every text field, claims refused", () => {
    for (const text of LEGIT) {
      expect(findOfferContentForbiddenWording({ name: base.name, shortDescription: text, exclusionsSummary: text, guarantees: [{ label: "RC", detail: text }] }), text).toEqual([]);
      expect(offerContentSchema.safeParse({ ...base, shortDescription: text }).success, text).toBe(true);
    }
    expect(offerContentSchema.safeParse({ ...base, shortDescription: "Contrat-validé" }).success).toBe(false);
    expect(findOfferContentForbiddenWording({ name: "Buy now", guarantees: [{ label: "RC", detail: "firm price" }] })).toEqual(["buy now", "firm price"]);
  });
  it("consent texts", () => {
    const consent = (text: string) => `Je consens a la transmission a {{brokerName}}. ${text}. AssurMatch assure le role technique.`;
    for (const text of LEGIT) expect(findConsentContentIssues({ purpose: "lead_transmission", content: consent(text) }), text).toEqual([]);
    expect(findConsentContentIssues({ purpose: "lead_transmission", content: consent("CONTRAT VALIDÉ") })).toEqual([{ code: "forbidden_wording", detail: "contrat valide" }]);
  });
  it("insurers", () => {
    const parse = (name: string) => insurerCreateSchema.safeParse({ countryId: crypto.randomUUID(), name, code: "assureur", reason: "creation assureur" }).success;
    expect(parse("Assureur Couverture garantie")).toBe(true);
    expect(parse("Assureur contrat validé")).toBe(false);
  });
  it("quote form labels and choices", () => {
    const field = (label: string, options?: string[]) => ({ key: "k", label, type: "select" as const, required: true, sensitivity: "public" as const, ...(options ? { options } : {}) });
    expect(findQuoteFormForbiddenWording(LEGIT.map((text) => field(text, [text])))).toEqual([]);
    expect(findQuoteFormForbiddenWording([field("Votre contrat validé", ["Buy now"])])).toEqual(["contrat valide", "buy now"]);
  });
});

describe("performance of the narrow filter on 100 offers", () => {
  function offerTexts(i: number): string[] {
    return [
      `Auto Essentiel ${i}`, "Une couverture complète pour votre véhicule, avec assistance dépannage 24 h sur 24 dans toute la zone.",
      "Sont exclus les dommages causés intentionnellement, la conduite sans permis valide et les courses organisées.", "Fiche produit assureur, édition 2026",
      `Assureur numéro ${i}`, ...Array.from({ length: 5 }, (_, g) => `Garantie ${g} : responsabilité civile, couverture garantie en cas de vol`),
      "offre indicative", "prix à confirmer par le courtier partenaire", "Contrat valide jusqu'au 31/12"
    ];
  }
  it("evaluates 100 offers quickly, with and without the memo", () => {
    const all = Array.from({ length: 100 }, (_, i) => offerTexts(i));
    clearRegulatedWordingCache();
    const t0 = performance.now();
    for (const texts of all) for (const text of texts) findRegulatedWordingAnyLanguage(text);
    const cold = performance.now() - t0;
    const t1 = performance.now();
    for (const texts of all) for (const text of texts) findRegulatedWordingAnyLanguage(text);
    const warm = performance.now() - t1;
    expect(cold, `cold ${cold.toFixed(2)} ms`).toBeLessThan(250);
    expect(warm, `memoised ${warm.toFixed(2)} ms`).toBeLessThan(250);
  });
});
