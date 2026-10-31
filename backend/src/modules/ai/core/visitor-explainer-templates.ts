/**
 * Deterministic FR/EN renderings for the visitor offer explainers (PRD 10.1, COMP-010). They only
 * restate figures found in the (minimised) input; they never rank offers, recommend a choice or
 * promise a coverage, so they stay valid under the visitor guardrails.
 */
type Language = "fr" | "en";
type Row = { key: string; label: string; values: Array<string | number | boolean | null> };

const CONFIRM = {
  fr: "Ces informations sont indicatives et à confirmer par le courtier partenaire.",
  en: "This information is indicative and to be confirmed by the partner broker."
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function amount(value: unknown, currency: string): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${currency}`.trim() : undefined;
}

function days(value: unknown, language: Language): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return language === "fr" ? `${value} jour${value > 1 ? "s" : ""}` : `${value} day${value === 1 ? "" : "s"}`;
}

function joinList(items: string[], language: Language): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${language === "fr" ? "et" : "and"} ${items[items.length - 1]}`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function renderGuaranteeExplainer(input: Record<string, unknown>, language: Language): string {
  const fr = language === "fr";
  const offer = isRecord(input.offer) ? input.offer : {};
  const currency = text(input.currency) ?? "";
  const name = text(offer.offerName) ?? (fr ? "cette offre" : "this offer");
  const insurer = text(offer.insurerName);
  const guarantees = Array.isArray(offer.guarantees) ? offer.guarantees.filter(isRecord) : [];
  const labelOf = (guarantee: Record<string, unknown>) => text(guarantee.label) ?? text(guarantee.key) ?? "?";
  const included = guarantees.filter((guarantee) => guarantee.included === true).map(labelOf);
  const excluded = guarantees.filter((guarantee) => guarantee.included !== true).map(labelOf);
  const parts: string[] = [];
  parts.push(fr
    ? `Voici, en langage simple, ce que les informations publiées indiquent pour l'offre "${name}"${insurer ? ` (assureur: ${insurer})` : ""}.`
    : `Here, in plain language, is what the published information says about the offer "${name}"${insurer ? ` (insurer: ${insurer})` : ""}.`);
  const summary = text(offer.guaranteeSummary) ?? text(offer.shortDescription);
  if (summary) parts.push(fr ? `Résumé: ${summary}` : `Summary: ${summary}`);
  parts.push(included.length > 0
    ? (fr ? `Garanties indiquées comme incluses: ${joinList(included, language)}.` : `Guarantees listed as included: ${joinList(included, language)}.`)
    : (fr ? "Aucune garantie incluse n'est détaillée dans les informations publiées." : "No included guarantee is detailed in the published information."));
  if (excluded.length > 0) parts.push(fr ? `Garanties indiquées comme non incluses: ${joinList(excluded, language)}.` : `Guarantees listed as not included: ${joinList(excluded, language)}.`);
  const exclusions = text(offer.exclusionsSummary);
  if (exclusions) parts.push(fr ? `Exclusions mentionnées: ${exclusions}` : `Exclusions mentioned: ${exclusions}`);
  const deductible = amount(offer.deductibleAmount, currency);
  const ceiling = amount(offer.coverageCeiling, currency);
  const delay = days(offer.processingDelayDays, language);
  const min = amount(offer.indicativePriceMin, currency);
  const max = amount(offer.indicativePriceMax, currency);
  const figures: string[] = [];
  if (deductible) figures.push(fr ? `franchise: ${deductible}` : `deductible: ${deductible}`);
  if (ceiling) figures.push(fr ? `plafond: ${ceiling}` : `ceiling: ${ceiling}`);
  if (delay) figures.push(fr ? `délai moyen de traitement: ${delay}` : `average processing time: ${delay}`);
  if (min) figures.push(fr ? `prix indicatif à partir de ${min}${max ? ` jusqu'à ${max}` : ""}` : `indicative price from ${min}${max ? ` up to ${max}` : ""}`);
  if (figures.length > 0) parts.push(`${fr ? "Repères chiffrés" : "Key figures"}: ${figures.join("; ")}.`);
  parts.push(fr ? `Cette reformulation ne crée aucune couverture. ${CONFIRM.fr}` : `This rewording does not create any coverage. ${CONFIRM.en}`);
  return parts.join(" ");
}

function numericValues(row: Row): Array<{ index: number; value: number }> {
  return row.values.flatMap((value, index) => (typeof value === "number" ? [{ index, value }] : []));
}

function offersAt(indexes: number[], language: Language): string {
  const labels = indexes.map((index) => String(index + 1));
  return language === "fr"
    ? `${labels.length > 1 ? "les offres" : "l'offre"} ${joinList(labels, language)}`
    : `${labels.length > 1 ? "offers" : "offer"} ${joinList(labels, language)}`;
}

const EXTREMES = [
  { key: "price", pick: "min", unit: "money", fr: "le prix indicatif le plus bas", en: "the lowest indicative price", labelFr: "Prix indicatif", labelEn: "Indicative price" },
  { key: "deductible", pick: "min", unit: "money", fr: "la franchise la plus basse", en: "the lowest deductible", labelFr: "Franchise", labelEn: "Deductible" },
  { key: "ceiling", pick: "max", unit: "money", fr: "le plafond de garantie le plus élevé", en: "the highest coverage ceiling", labelFr: "Plafond de garantie", labelEn: "Coverage ceiling" },
  { key: "processingDelay", pick: "min", unit: "days", fr: "le délai de traitement le plus court", en: "the shortest processing time", labelFr: "Délai de traitement", labelEn: "Processing time" }
] as const;

export function renderCompareExplainer(input: Record<string, unknown>, language: Language): string {
  const fr = language === "fr";
  const currency = text(input.currency) ?? "";
  const rows: Row[] = Array.isArray(input.rows)
    ? input.rows.filter(isRecord).map((row) => ({ key: text(row.key) ?? "", label: text(row.label) ?? "", values: Array.isArray(row.values) ? (row.values as Row["values"]) : [] }))
    : [];
  const count = Array.isArray(input.offers) ? input.offers.length : Math.max(0, ...rows.map((row) => row.values.length));
  const parts: string[] = [];
  parts.push(fr
    ? `Comparaison factuelle de ${count} offres, désignées offre 1 à offre ${count} dans l'ordre de votre sélection. Elle décrit des écarts, sans classement ni recommandation.`
    : `Factual comparison of ${count} offers, labelled offer 1 to offer ${count} in the order you selected them. It describes differences only, with no ranking and no recommendation.`);

  for (const extreme of EXTREMES) {
    const row = rows.find((candidate) => candidate.key === extreme.key);
    const values = row ? numericValues(row) : [];
    if (!row || values.length === 0) continue;
    const shown = (value: number) => extreme.unit === "days" ? days(value, language) ?? String(value) : amount(value, currency) ?? String(value);
    const detail = values.map(({ index, value }) => `${fr ? "offre" : "offer"} ${index + 1}: ${shown(value)}`).join(", ");
    const target = extreme.pick === "min" ? Math.min(...values.map((entry) => entry.value)) : Math.max(...values.map((entry) => entry.value));
    const winners = values.filter((entry) => entry.value === target).map((entry) => entry.index);
    const label = fr ? extreme.labelFr : extreme.labelEn;
    if (values.length === 1) {
      parts.push(fr ? `${label}: seule ${offersAt(winners, language)} le renseigne (${shown(target)}).` : `${label}: only ${offersAt(winners, language)} provides it (${shown(target)}).`);
    } else if (winners.length === values.length) {
      parts.push(fr ? `${label}: identique (${shown(target)}) pour les offres qui le renseignent.` : `${label}: the same (${shown(target)}) for the offers that provide it.`);
    } else {
      const single = winners.length === 1;
      parts.push(fr
        ? `${label}: ${detail}. ${capitalize(extreme.fr)} ${single ? "est celui de" : "est partagé par"} ${offersAt(winners, language)}.`
        : `${label}: ${detail}. ${capitalize(extreme.en)} ${single ? "is that of" : "is shared by"} ${offersAt(winners, language)}.`);
    }
  }

  const common: string[] = [];
  for (const row of rows.filter((candidate) => candidate.key.startsWith("guarantee:"))) {
    const label = row.label.replace(/^Garantie\s*:\s*/i, "");
    const included = row.values.flatMap((value, index) => (value === true ? [index] : []));
    const notIncluded = row.values.flatMap((value, index) => (value === false ? [index] : []));
    const unknown = row.values.flatMap((value, index) => (value === null || value === undefined ? [index] : []));
    if (notIncluded.length === 0 && unknown.length === 0) {
      common.push(label);
      continue;
    }
    const segments: string[] = [];
    if (included.length > 0) segments.push(fr ? `incluse dans ${offersAt(included, language)}` : `included in ${offersAt(included, language)}`);
    if (notIncluded.length > 0) segments.push(fr ? `non incluse dans ${offersAt(notIncluded, language)}` : `not included in ${offersAt(notIncluded, language)}`);
    if (unknown.length > 0) segments.push(fr ? `non précisée pour ${offersAt(unknown, language)}` : `not specified for ${offersAt(unknown, language)}`);
    parts.push(fr ? `Garantie "${label}": ${segments.join("; ")}.` : `Guarantee "${label}": ${segments.join("; ")}.`);
  }
  if (common.length > 0) parts.push(fr ? `Garanties indiquées comme incluses dans toutes les offres: ${joinList(common, language)}.` : `Guarantees listed as included in every offer: ${joinList(common, language)}.`);
  parts.push(fr
    ? `Le choix d'une offre dépend de votre situation et vous appartient. ${CONFIRM.fr}`
    : `The choice of an offer depends on your situation and is yours to make. ${CONFIRM.en}`);
  return parts.join(" ");
}

/** English variant of the form-field help (the French wording stays in the provider). */
export function renderFormHelp(input: Record<string, unknown>, language: Language): string | undefined {
  if (language !== "en") return undefined;
  const label = text(input.fieldLabel) ?? "this field";
  const product = text(input.productKey) ?? "insurance";
  return `The field "${label}" helps the partner broker prepare a suitable ${product} quote. Enter an exact or approximate value; it can be refined with the broker.`;
}
