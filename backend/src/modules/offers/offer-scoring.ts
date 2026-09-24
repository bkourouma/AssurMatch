import type { OfferPreference, OfferScore, OfferScoreBreakdown, ScoringCriterion } from "../../../../packages/shared/contracts/quote.contracts";
import { scoringCriteria } from "../../../../packages/shared/contracts/quote.contracts";
import type { ScoringWeights } from "../../../../packages/shared/contracts/scoring-rule.contracts";
import type { OfferRecord } from "./offers.module";

export const SCORE_LABEL = "Score indicatif selon vos criteres, calcule par rapport aux offres affichees";

const PAYMENT_FLEXIBILITY_SCORE: Record<string, number> = { monthly: 1, quarterly: 0.75, semiannual: 0.5, annual: 0.25 };
const PREFERENCE_CRITERION: Record<OfferPreference, Exclude<ScoringCriterion, "userPreferences" | "informationQuality">> = {
  price: "price",
  guarantees: "guaranteeLevel",
  speed: "processingSpeed",
  deductible: "deductible",
  flexibility: "paymentFlexibility"
};
const PREFERENCE_LABEL: Record<OfferPreference, string> = {
  price: "le prix",
  guarantees: "le niveau de garantie",
  speed: "la rapidite de traitement",
  deductible: "la franchise",
  flexibility: "la flexibilite de paiement"
};

type CriterionScore = { score: number; explanation: string };

/**
 * Deterministic, explainable, relative scoring (PRD §15 / COMP-004). Every criterion yields a
 * 0..1 score with a plain-language explanation; missing data scores 0 and says so. The result is
 * indicative only: it never designates a best offer and is recomputed for each visible list.
 */
export function scoreOffers(offers: readonly OfferRecord[], weights: ScoringWeights, preference?: OfferPreference): Map<string, OfferScore> {
  const lowestPrice = min(offers.map((offer) => offer.indicativePriceMin));
  const lowestDeductible = min(offers.map((offer) => offer.deductibleAmount));
  const fastestDelay = min(offers.map((offer) => offer.processingDelayDays));
  const result = new Map<string, OfferScore>();
  for (const offer of offers) {
    const base: Record<Exclude<ScoringCriterion, "userPreferences">, CriterionScore> = {
      guaranteeLevel: scoreGuaranteeLevel(offer),
      price: scoreLowerIsBetter(offer.indicativePriceMin, lowestPrice, "Prix indicatif", "prix indicatif non renseigne"),
      deductible: scoreLowerIsBetter(offer.deductibleAmount, lowestDeductible, "Franchise", "franchise non renseignee"),
      processingSpeed: scoreLowerIsBetter(offer.processingDelayDays, fastestDelay, "Delai moyen de traitement", "delai de traitement non renseigne"),
      paymentFlexibility: scorePaymentFlexibility(offer),
      informationQuality: scoreInformationQuality(offer)
    };
    const userPreferences = scoreUserPreferences(base, preference);
    const scores: Record<ScoringCriterion, CriterionScore> = { ...base, userPreferences };
    const breakdown: OfferScoreBreakdown[] = scoringCriteria.map((criterion) => ({
      criterion,
      weight: weights[criterion],
      score: round(scores[criterion].score, 3),
      points: round(weights[criterion] * scores[criterion].score, 1),
      explanation: scores[criterion].explanation
    }));
    const total = Math.round(scoringCriteria.reduce((sum, criterion) => sum + weights[criterion] * scores[criterion].score, 0));
    result.set(offer.id, { total: Math.min(100, Math.max(0, total)), label: SCORE_LABEL, breakdown });
  }
  return result;
}

function scoreGuaranteeLevel(offer: OfferRecord): CriterionScore {
  if (offer.guaranteeLevel === undefined) return { score: 0, explanation: "Niveau de garantie non renseigne par le courtier partenaire" };
  return { score: offer.guaranteeLevel / 5, explanation: `Niveau de garantie ${offer.guaranteeLevel}/5 declare par le courtier partenaire` };
}

function scoreLowerIsBetter(value: number | undefined, best: number | undefined, label: string, missing: string): CriterionScore {
  if (value === undefined || best === undefined) return { score: 0, explanation: `${label}: ${missing}` };
  if (value <= 0 || best <= 0) return { score: 1, explanation: `${label} nul ou le plus bas des offres affichees` };
  const score = Math.min(1, best / value);
  return {
    score,
    explanation: score === 1 ? `${label} le plus bas des offres affichees` : `${label} ${round(value / best, 2)} fois le plus bas des offres affichees`
  };
}

function scorePaymentFlexibility(offer: OfferRecord): CriterionScore {
  const score = offer.paymentFlexibility ? PAYMENT_FLEXIBILITY_SCORE[offer.paymentFlexibility] ?? 0 : 0;
  return {
    score,
    explanation: offer.paymentFlexibility ? `Paiement ${offer.paymentFlexibility} propose a titre indicatif` : "Flexibilite de paiement non renseignee"
  };
}

function scoreInformationQuality(offer: OfferRecord): CriterionScore {
  const fields: Array<[string, boolean]> = [
    ["nom", Boolean(offer.name)],
    ["description", Boolean(offer.shortDescription)],
    ["resume des garanties", Boolean(offer.guaranteeSummary)],
    ["prix indicatif", offer.indicativePriceMin !== undefined],
    ["niveau de garantie", offer.guaranteeLevel !== undefined],
    ["franchise", offer.deductibleAmount !== undefined],
    ["plafond", offer.coverageCeiling !== undefined],
    ["delai", offer.processingDelayDays !== undefined],
    ["paiement", Boolean(offer.paymentFlexibility)],
    ["garanties detaillees", (offer.guarantees ?? []).length > 0],
    ["exclusions", Boolean(offer.exclusionsSummary)],
    ["assureur", Boolean(offer.insurerName)],
    ["documents requis", (offer.requiredDocuments ?? []).length > 0],
    ["source", Boolean(offer.sourceOfInformation)]
  ];
  const filled = fields.filter(([, present]) => present).length;
  const missing = fields.filter(([, present]) => !present).map(([label]) => label);
  return {
    score: filled / fields.length,
    explanation: missing.length === 0 ? "Fiche complete" : `Fiche renseignee a ${filled}/${fields.length}; manque: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "..." : ""}`
  };
}

function scoreUserPreferences(base: Record<Exclude<ScoringCriterion, "userPreferences">, CriterionScore>, preference?: OfferPreference): CriterionScore {
  if (preference) {
    const criterion = PREFERENCE_CRITERION[preference];
    return { score: base[criterion].score, explanation: `Priorite visiteur: ${PREFERENCE_LABEL[preference]}` };
  }
  const values = Object.values(base).map((entry) => entry.score);
  return { score: values.reduce((sum, value) => sum + value, 0) / values.length, explanation: "Aucune priorite exprimee: moyenne des autres criteres" };
}

function min(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length > 0 ? Math.min(...defined) : undefined;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
