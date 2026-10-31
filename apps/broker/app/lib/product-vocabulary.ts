/**
 * Libellé français d'un produit pour le back-office courtier. L'API renvoie la clé du produit
 * (`auto`, `voyage`), jamais montrée telle quelle : cette table ne sert qu'à l'affichage, les filtres et
 * les liens continuent d'utiliser la clé. Une clé inconnue reste lisible (première lettre en capitale,
 * séparateurs remplacés par des espaces) plutôt que d'afficher un identifiant technique.
 */
export const PRODUCT_LABELS: Record<string, string> = {
  auto: "Auto",
  voyage: "Voyage",
  sante: "Santé",
  habitation: "Habitation",
  moto: "Moto"
};

export function productLabel(key: string | null | undefined): string {
  const raw = (key ?? "").trim();
  if (!raw || raw === "-") return "-";
  const known = PRODUCT_LABELS[raw.toLowerCase()];
  if (known) return known;
  const spaced = raw.replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
