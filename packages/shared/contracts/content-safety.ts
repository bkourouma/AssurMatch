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
