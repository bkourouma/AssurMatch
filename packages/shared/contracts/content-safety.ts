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
  "Être rappelé par un courtier agréé",
  "Être rappelé par un courtier partenaire"
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

/**
 * Spec 062 R4: additional promises banned in broker-written messages and document requests, matched
 * as whole phrases after normalisation. They only extend the guard; nothing blocked before passes now.
 */
export const FORBIDDEN_MESSAGING_PHRASES = ["achetez maintenant", "souscrivez maintenant", "contract validated", "validated contract"] as const;

/**
 * Spec 062 R4: stand-alone English word that makes a promise ("guaranteed price"), matched on word
 * boundaries. The French bare « garanti » is NOT listed here any more: it is also ordinary technical
 * wording ("risques garantis", "capital garanti", "dommages garantis"), so the French promises are the
 * closed list of phrases below instead.
 */
export const FORBIDDEN_MESSAGING_WORDS = ["guaranteed"] as const;

/**
 * Spec 062 R4: French promise phrases built on « garanti » (the owner requirement: « garanti » used as a
 * promise blocks the send). Gender and number are free ("garanti", "garantie", "garantis", "garanties"; the
 * other words accept a plural "s"), accents and case are ignored. Ordinary technical wording such as
 * "risques garantis", "capital garanti", "dommages garantis" or "garanties incluses" is not in the list.
 */
export const FORBIDDEN_MESSAGING_PROMISES_FR = [
  "garanti à vie",
  "100 % garanti",
  "garanti sans condition",
  "remboursement garanti",
  "résultat garanti",
  "prix garanti",
  "tarif garanti",
  "acceptation garantie",
  "réponse garantie",
  "devis garanti",
  "contrat garanti",
  "couverture garantie",
  "offre garantie",
  "approbation garantie",
  "taux garanti"
] as const;

/**
 * C0 control characters other than tab, line feed and carriage return (a NUL byte is refused by
 * PostgreSQL text columns and has no place in a message). Removed from the free texts of the messaging
 * and data-request contracts.
 */
// eslint-disable-next-line no-control-regex
const C0_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripControlCharacters(value: string): string {
  return value.replace(C0_CONTROL_CHARACTERS, "");
}

/**
 * Normal form every messaging wording check reads, so the usual evasions do not hide a banned phrase:
 * compatibility folding (NFKC: full-width letters, no-break spaces), invisible format characters
 * (zero-width space and joiners, soft hyphen, bidi marks, BOM), diacritics and other combining marks,
 * typographic apostrophes, case, hyphens / dashes / underscores / dots between words (read as a space),
 * then whitespace.
 */
export function normalizeWordingText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\p{Cf}­]/gu, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[\p{Pd}\u2212_]+/gu, " ")
    .replace(/(?<=[\p{L}\p{N}])[.·•]+(?=[\p{L}\p{N}])/gu, " ")
    .replace(/(\d)\s*%/g, "$1 %")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-phrase test on normalised text: the words keep their boundaries and accept a plural "s". */
function containsPhrase(normalizedText: string, normalizedPhrase: string, promiseFr = false): boolean {
  const words = normalizedPhrase.split(" ").map((word) => {
    if (promiseFr && /^garanti(?:e|s|es)?$/.test(word)) return "garanti(?:e|s|es)?";
    return /^[a-z]+$/.test(word) ? `${escapeRegExp(word)}s?` : escapeRegExp(word);
  });
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join(" ")}(?![\\p{L}\\p{N}])`, "u").test(normalizedText);
}

/** Same whole-phrase pattern as `containsPhrase`, compiled once (see the narrow regulated filter). */
function compilePhrase(normalizedPhrase: string, suffix = ""): RegExp {
  const words = normalizedPhrase.split(" ").map((word) => (/^[a-z]+$/.test(word) ? `${escapeRegExp(word)}s?` : escapeRegExp(word)));
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join(" ")}(?![\\p{L}\\p{N}])${suffix}`, "u");
}

/**
 * Normal form that keeps the accents (NFKC, invisible characters, case, separators), used only to tell
 * the participle "contrat validé" (a claim, always refused) from the adjective "contrat valide".
 */
function normalizeKeepingAccents(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\p{Cf}­]/gu, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .toLocaleLowerCase("fr-FR")
    .replace(/[\p{Pd}−_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const CONTRACT_VALIDE_FR = "contrat valide";
const VALID_CONTRACT_EN = "valid contract";
/** Adjectival continuations that make « contrat valide » a condition, not a claim (text already normalised). */
const CONTRACT_VALIDE_FR_RE = compilePhrase(CONTRACT_VALIDE_FR, "(?! (?:jusqu|a partir|depuis|requis|necessaire|exige|obligatoire))");
const VALID_CONTRACT_EN_RE = compilePhrase(VALID_CONTRACT_EN, "(?! (?:required|needed|necessary|mandatory|until|through|upon)(?![\\p{L}\\p{N}]))");
/** The participle (accent kept): "contrat validé / validée / validés / validées". */
const CONTRAT_VALIDE_PARTICIPLE_RE = /(?<![\p{L}\p{N}])contrats? valid(?:é|ée|és|ées)(?![\p{L}\p{N}])/u;

const NARROW_PLAIN_FR = FORBIDDEN_REGULATED_WORDING.filter((phrase) => phrase !== CONTRACT_VALIDE_FR);
const NARROW_PLAIN_FR_KEYS = NARROW_PLAIN_FR.map(normalizeWordingText);
const NARROW_PHRASES = [...FORBIDDEN_ENGLISH_WORDING.filter((phrase) => phrase !== VALID_CONTRACT_EN), ...FORBIDDEN_MESSAGING_PHRASES];
const NARROW_PHRASE_RES = NARROW_PHRASES.map((phrase) => compilePhrase(normalizeWordingText(phrase)));

// Sized for a public catalogue re-evaluated on every request (100 offers x ~15 texts): a smaller memo
// would be flushed by each pass. Texts longer than REGULATED_CACHE_MAX_TEXT are never memoised.
const REGULATED_CACHE_MAX = 5000;
const REGULATED_CACHE_MAX_TEXT = 2000;
const regulatedCache = new Map<string, readonly string[]>();

function computeRegulatedWording(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (wording: string): void => {
    const key = normalizeWordingText(wording);
    if (seen.has(key)) return;
    seen.add(key);
    found.push(wording);
  };
  const lowered = text.toLocaleLowerCase("fr-FR");
  // Raw (accented) hits first so the canonical form keeps the accent the author typed, as the legacy guard does.
  for (const phrase of NARROW_PLAIN_FR) if (lowered.includes(phrase)) add(phrase);
  const normalized = normalizeWordingText(text);
  NARROW_PLAIN_FR.forEach((phrase, index) => {
    if (normalized.includes(NARROW_PLAIN_FR_KEYS[index] as string)) add(phrase);
  });
  if (CONTRAT_VALIDE_PARTICIPLE_RE.test(normalizeKeepingAccents(text)) || CONTRACT_VALIDE_FR_RE.test(normalized)) add(CONTRACT_VALIDE_FR);
  if (VALID_CONTRACT_EN_RE.test(normalized)) add(VALID_CONTRACT_EN);
  NARROW_PHRASES.forEach((phrase, index) => {
    if ((NARROW_PHRASE_RES[index] as RegExp).test(normalized)) add(phrase);
  });
  return found;
}

/**
 * NARROW regulatory filter for offers, consent texts, insurers and quote-form labels: the constitution
 * list (« acheter maintenant », « souscrire maintenant », « contrat valide », « garantie acceptée »,
 * « la meilleure assurance du marché »), its English equivalents and the imperative / English variants,
 * WITHOUT the broker-messaging promise lists (`FORBIDDEN_MESSAGING_WORDS`, `FORBIDDEN_MESSAGING_PROMISES_FR`),
 * so « Couverture garantie en cas de vol » or « Guaranteed cover for theft » stay publishable. Broker
 * messaging keeps `findForbiddenWordingAnyLanguage`.
 *
 * « contrat valide » / « valid contract » stay refused as a claim, but not as an adjective with a
 * condition: they pass when immediately followed by `jusqu'…`, `à partir`, `depuis`, `requis`, `nécessaire`,
 * `exigé`, `obligatoire` (EN: `required`, `needed`, `necessary`, `mandatory`, `until`, `through`, `upon`).
 * The accented participle « contrat validé » is always refused. Accent, case, spacing, separator and
 * invisible-character insensitive. Returns canonical list entries, deduplicated, in a stable order.
 * Results are memoised per text (bounded cache).
 */
export function findRegulatedWordingAnyLanguage(text: string): string[] {
  if (text.length > REGULATED_CACHE_MAX_TEXT) return computeRegulatedWording(text);
  const cached = regulatedCache.get(text);
  if (cached) return [...cached];
  const result = computeRegulatedWording(text);
  if (regulatedCache.size >= REGULATED_CACHE_MAX) {
    const oldest = regulatedCache.keys().next();
    if (!oldest.done) regulatedCache.delete(oldest.value);
  }
  regulatedCache.set(text, result);
  return [...result];
}

/** Test hook: empties the memo of `findRegulatedWordingAnyLanguage`. */
export function clearRegulatedWordingCache(): void {
  regulatedCache.clear();
}

/**
 * Spec 055 FR-004 + spec 062 R4: the French regulated list plus its English equivalents, case- and
 * accent-insensitive ("contrat validé" is "contrat valide"), robust to invisible characters, full-width
 * letters, no-break spaces and hyphen / dot separators, plus the promise phrases. The English phrases
 * are matched on word boundaries ("invalid contract" is not "valid contract"). Returns the canonical
 * wording found (list entry), in a stable order.
 */
export function findForbiddenWordingAnyLanguage(text: string): string[] {
  // The legacy guard on the raw text first: whatever it blocked stays blocked, in the same form.
  const found = new Set<string>(findForbiddenWording(text));
  const seen = new Set([...found].map(normalizeWordingText));
  const normalized = normalizeWordingText(text);
  const add = (wording: string): void => {
    const key = normalizeWordingText(wording);
    if (seen.has(key)) return;
    seen.add(key);
    found.add(wording);
  };
  for (const phrase of FORBIDDEN_REGULATED_WORDING) {
    if (normalized.includes(normalizeWordingText(phrase))) add(phrase);
  }
  for (const phrase of [...FORBIDDEN_ENGLISH_WORDING, ...FORBIDDEN_MESSAGING_PHRASES]) {
    if (containsPhrase(normalized, normalizeWordingText(phrase))) add(phrase);
  }
  for (const word of FORBIDDEN_MESSAGING_WORDS) {
    if (containsPhrase(normalized, word)) add(word);
  }
  for (const promise of FORBIDDEN_MESSAGING_PROMISES_FR) {
    if (containsPhrase(normalized, normalizeWordingText(promise), true)) add(promise);
  }
  return [...found];
}
