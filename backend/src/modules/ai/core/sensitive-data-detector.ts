/**
 * Constitution V / spec 075 (FR-E1, FR-E2): detects and masks sensitive data (health, national ids,
 * passports, driving licences, bank cards, IBAN, secrets, plates, birth dates) in free text before it
 * can reach an external model. Only categories and counters are ever exposed, never the values.
 * Detection and redaction share one code path so a redacted text is guaranteed to rescan clean.
 */
export type SensitiveCategory = "health" | "national_id" | "passport" | "driving_license" | "card" | "iban" | "secret" | "plate" | "birth_date";

export interface SensitiveDetection {
  categories: SensitiveCategory[];
  occurrences: Record<string, number>;
}

export interface SensitiveRedaction extends SensitiveDetection {
  text: string;
}

interface Rule {
  category: SensitiveCategory;
  pattern: RegExp;
  validate?: ((match: string) => boolean) | undefined;
}

const ACCENTS: Record<string, string> = { a: "[aàâä]", e: "[eéèêë]", i: "[iîï]", o: "[oôö]", u: "[uùûü]", c: "[cç]" };

function accentInsensitive(term: string): string {
  return term.replace(/[a-z ]/g, (char) => (char === " " ? "\\s+" : ACCENTS[char] ?? char));
}

const HEALTH_TERMS = [
  "diabete", "diabetique", "diabetes", "diabetic", "cancer", "cancereux", "tumeur", "leucemie", "lymphome", "vih", "hiv", "sida", "aids",
  "hepatite", "tuberculose", "drepanocytose", "sickle cell", "epilepsie", "epileptique", "asthme", "asthmatique", "hypertension", "hypertendu",
  "depression", "depressif", "schizophrenie", "bipolaire", "alzheimer", "parkinson", "avc", "infarctus", "insuffisance renale",
  "insuffisance cardiaque", "insuffisance respiratoire", "dialyse", "chimiotherapie", "chemotherapy", "radiotherapie", "greffe", "handicap",
  "handicape", "maladie chronique", "maladie grave", "maladie rare", "pathologie", "atteint de", "sous traitement", "traitement medical",
  "antidepresseur", "insuline", "stroke", "heart attack", "chronic illness", "chronic disease", "diagnostique", "diagnosed with",
  "medical condition", "hemophilie", "mucoviscidose", "sclerose en plaques"
];

const MONTHS = "janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre|january|february|march|april|may|june|july|august|september|october|november|december";
const DATE = `(?:\\d{1,2}[\\/.-]\\d{1,2}[\\/.-](?:\\d{4}|\\d{2})|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}(?:er)?\\s+(?:${MONTHS})\\s+\\d{4})`;
const LABEL_TAIL = "\\s*(?:n°|no\\.?|nb|number|numero|num)?\\s*[:=#]?\\s*";

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (value < 0 || value > 9) return false;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

export function ibanValid(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (iban.length < 15 || iban.length > 34 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    const chunk = code >= 65 ? String(code - 55) : char;
    for (const digit of chunk) remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

// Order matters: secrets and structured numbers first, so a longer match is never split by a looser rule.
const RULES: Rule[] = [
  { category: "secret", pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g },
  { category: "secret", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi },
  { category: "secret", pattern: /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/g },
  { category: "secret", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { category: "secret", pattern: /\b(?:ghp|gho|ghs|xox[bap])[-_][A-Za-z0-9_-]{16,}/g },
  { category: "secret", pattern: /\b(?:password|passwd|pwd|mot\s+de\s+passe|mdp)\s*[:=]\s*\S+/gi },
  { category: "iban", pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{2,4}){3,8}\b/g, validate: ibanValid },
  {
    category: "card",
    pattern: /(?<![+\d])(?:[3-6]\d{12,18}|[3-6]\d{3}(?:[ -]\d{4}){2,3}(?:[ -]\d{1,4})?|[3-6]\d{3}[ -]\d{6}[ -]\d{4,5})(?!\d)/g,
    validate: (match) => {
      const digits = match.replace(/[ -]/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
    }
  },
  { category: "national_id", pattern: /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2])\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g },
  { category: "national_id", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  {
    category: "national_id",
    pattern: new RegExp(`\\b(?:cni|nni|ssn|carte\\s+(?:nationale\\s+)?d['’ ]?identit[eé]|num[eé]ro\\s+d['’ ]?identification(?:\\s+nationale)?|national\\s+id(?:entity)?(?:\\s+card)?|id\\s+number|social\\s+security|s[eé]curit[eé]\\s+sociale)${LABEL_TAIL}(?=[A-Z0-9 -]{0,20}\\d)[A-Z0-9][A-Z0-9-]{4,}(?: ?[A-Z0-9-]{2,}){0,3}`, "gi")
  },
  { category: "passport", pattern: new RegExp(`\\b(?:passeport|passport)${LABEL_TAIL}(?=[A-Z0-9]{0,11}\\d)[A-Z0-9]{6,12}\\b`, "gi") },
  { category: "driving_license", pattern: new RegExp(`\\b(?:permis(?:\\s+de\\s+conduire)?|driving\\s+licen[cs]e|driver'?s?\\s+licen[cs]e)${LABEL_TAIL}(?=[A-Z0-9/-]{0,14}\\d)[A-Z0-9][A-Z0-9/-]{5,14}\\b`, "gi") },
  { category: "plate", pattern: /\b[A-Z]{2}[- ]?\d{3}[- ]?[A-Z]{2}\b/g },
  { category: "plate", pattern: /\b\d{3,4}[- ]?[A-Z]{2}[- ]?\d{2}\b/g },
  { category: "plate", pattern: new RegExp(`\\b(?:plaque(?:\\s+d['’ ]immatriculation)?|immatriculation|immat|licen[cs]e\\s+plate|registration\\s+(?:plate|number))${LABEL_TAIL}(?=[A-Z0-9]{1,4}(?:[ -][A-Z0-9]{1,4}){0,3}\\b)(?=[A-Z0-9 -]{0,14}\\d)[A-Z0-9]{1,4}(?:[ -][A-Z0-9]{1,4}){0,3}\\b`, "gi") },
  { category: "birth_date", pattern: new RegExp(`\\b(?:n[eé]e?\\s+le|date\\s+de\\s+naissance|date\\s+of\\s+birth|born\\s+on|born|dob|birth\\s?date|birthday|naissance)\\s*[:=]?\\s*(?:le\\s+|on\\s+)?${DATE}`, "gi") },
  {
    category: "health",
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${HEALTH_TERMS.map(accentInsensitive).join("|")})(?![\\p{L}\\p{N}])`, "giu")
  }
];

export class SensitiveDataDetector {
  detect(text: string): SensitiveDetection {
    const { categories, occurrences } = this.redactWithReport(text);
    return { categories, occurrences };
  }

  redact(text: string): string {
    return this.redactWithReport(text).text;
  }

  redactWithReport(text: string): SensitiveRedaction {
    const occurrences: Record<string, number> = {};
    let output = text;
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      output = output.replace(rule.pattern, (match: string) => {
        if (rule.validate && !rule.validate(match)) return match;
        occurrences[rule.category] = (occurrences[rule.category] ?? 0) + 1;
        return `[${rule.category}]`;
      });
    }
    return { text: output, categories: Object.keys(occurrences) as SensitiveCategory[], occurrences };
  }
}
