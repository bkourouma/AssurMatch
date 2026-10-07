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
 * Editorial vocabulary banned by the charter (spec 050, `content/00-charte-editoriale.md` §3), on top
 * of the constitutional list above. These are marketing/hype words and delay promises the charter
 * asks to keep out of visitor-facing copy — not a compliance list, but still CI-enforced so the
 * rewrite (and everything written after it) keeps the sober, concrete voice the charter sets out.
 *
 * "intelligence artificielle" / "artificial intelligence" is the only AI-related phrase checked here,
 * deliberately. The charter also bans the bare abbreviation "IA" as a commercial argument, but the D2
 * decision (spec.md) keeps "IA" as the one transparency label on a function that really calls a model
 * ("généré par IA", `Common.aiGenerated`), which must NOT be flagged. Banning the two-letter token
 * "IA"/"AI" outright would immediately catch that very label (and plenty of unrelated short words), so
 * this guardrail checks only the full phrase, which never legitimately appears in the transparency
 * label. A finer allow-listed check on the bare abbreviation is left as a follow-up if the fuller
 * phrase ever proves insufficient.
 */
export const FORBIDDEN_EDITORIAL_WORDING_FR = [
  "révolutionnaire",
  "innovant",
  "disruptif",
  "meilleur",
  "meilleure",
  "n°1",
  "leader",
  "instantané",
  "instantanément",
  "immédiat",
  "immédiatement",
  "en temps réel",
  "en quelques clics",
  "en un clic",
  "intelligence artificielle",
  "n'hésitez pas",
  "nous sommes ravis",
  "découvrez",
  "boostez",
  "profitez",
  "sans tracas",
  "simple comme bonjour",
  "bientôt",
  "écosystème",
  "expérience unique",
  "parcours fluide"
] as const;

/** English equivalents of `FORBIDDEN_EDITORIAL_WORDING_FR`, per `content/06` §6.2 rule 1. */
export const FORBIDDEN_EDITORIAL_WORDING_EN = [
  "revolutionary",
  "best",
  "instant",
  "instantly",
  "in a few clicks",
  "artificial intelligence",
  "don't hesitate",
  "discover",
  "hassle-free",
  "soon",
  "seamless"
] as const;

export const FORBIDDEN_EDITORIAL_WORDING = [...FORBIDDEN_EDITORIAL_WORDING_FR, ...FORBIDDEN_EDITORIAL_WORDING_EN] as const;

/** Strips combining diacritical marks after an NFD decomposition, so "révolutionnaire" and
 * "revolutionnaire" normalise to the same string; also folds the one typographic apostrophe variant
 * the catalogues could contain, so a straight or curly quote in "n'hésitez pas" matches alike. */
function normalizeEditorialText(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("fr-FR");
}

/** True when `phrase` occurs in `haystack` on word boundaries (not as a fragment of a longer word),
 * e.g. the banned "garanti" never matches inside the allowed noun "garantie". Both strings are
 * expected to already be normalised (see `normalizeEditorialText`). Unicode letter/number classes are
 * used instead of `\b`, which does not understand accented Latin letters. */
function containsWholePhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u");
  return pattern.test(haystack);
}

function forbiddenEditorialWordingIn(text: string, dictionary: readonly string[]): string[] {
  const normalized = normalizeEditorialText(text);
  return dictionary.filter((phrase) => containsWholePhrase(normalized, normalizeEditorialText(phrase)));
}

/**
 * Charter §3 editorial vocabulary found in `text`, diacritics-insensitive and word-boundary aware.
 * The noun "garantie"/"garanties" and the phrase "niveau de garantie" are never flagged: none of the
 * banned entries above is a substring match of them once word boundaries are respected ("meilleur"
 * does not match inside "meilleure" either way, since both are listed explicitly).
 *
 * Checks BOTH languages at once (the combined `FORBIDDEN_EDITORIAL_WORDING`). That is deliberate for a
 * source file that can legitimately mix French and English in the same document, such as a content
 * module under `app/content/**\/*.ts` that exports one array per locale: a single French-only or
 * English-only pass would miss whichever language sits in the other half of the file. It is the wrong
 * tool for a single-locale message catalogue, where an English entry ("instant") can otherwise flag
 * an unrelated French word ("pour l'instant") — use `findForbiddenEditorialWordingForLocale` there.
 */
export function findForbiddenEditorialWording(text: string): string[] {
  return forbiddenEditorialWordingIn(text, FORBIDDEN_EDITORIAL_WORDING);
}

/**
 * Same check, scoped to the vocabulary of a single locale: use this for `fr.json`/`en.json`, each of
 * which only ever holds one language per locale, so the other language's list must stay out of the
 * comparison (see the note on `findForbiddenEditorialWording`).
 */
export function findForbiddenEditorialWordingForLocale(text: string, locale: "fr" | "en"): string[] {
  return forbiddenEditorialWordingIn(text, locale === "en" ? FORBIDDEN_EDITORIAL_WORDING_EN : FORBIDDEN_EDITORIAL_WORDING_FR);
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
