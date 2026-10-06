export const FORBIDDEN_REGULATED_WORDING = [
  "acheter maintenant",
  "souscrire maintenant",
  "contrat valide",
  "garantie acceptee",
  "garantie acceptée",
  "la meilleure assurance du marche",
  "la meilleure assurance du marché"
] as const;

export const SAFE_PUBLIC_CTA = [
  "Comparer les offres",
  "Demander un devis",
  "Etre rappele par un courtier agree",
  "Etre rappele par un courtier partenaire"
] as const;

export function findForbiddenWording(text: string): string[] {
  const normalized = text.toLocaleLowerCase("fr-FR");
  return FORBIDDEN_REGULATED_WORDING.filter((wording) => normalized.includes(wording));
}

/**
 * Spec 054/055: English equivalents of the regulated list, used on every text a visitor may read in
 * English (e-mails, broker proposals). Kept beside the French list so both guards evolve together.
 */
export const FORBIDDEN_ENGLISH_WORDING = ["buy now", "subscribe now", "valid contract", "cover accepted", "best insurance on the market", "guaranteed callback", "firm price"] as const;

/** Spec 055 FR-004: the French regulated list plus its English equivalents, case-insensitive. */
export function findForbiddenWordingAnyLanguage(text: string): string[] {
  const english = text.toLocaleLowerCase("en-US");
  return [...new Set([...findForbiddenWording(text), ...FORBIDDEN_ENGLISH_WORDING.filter((phrase) => english.includes(phrase))])];
}
