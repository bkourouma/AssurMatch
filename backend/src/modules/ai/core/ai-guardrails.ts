import { AI_ASSISTANCE_DISCLAIMER, type AiAssistTypeCatalog } from "../../../../../packages/shared/contracts/ai.contracts";
import { findForbiddenWording } from "../../../../../packages/shared/contracts/content-safety";

/** Advice, decision or promise wording the constitution forbids in any AI output (Principle V). */
const FORBIDDEN_AI_PATTERNS: Array<[string, RegExp]> = [
  ["official_recommendation", /recommand(e|ons)\s+officiellement/i],
  ["must_subscribe", /vous\s+devez\s+(souscrire|acheter|signer)/i],
  ["best_offer", /(la\s+)?meilleure\s+(offre|assurance|option)/i],
  ["firm_price", /prix\s+ferme|tarif\s+definitif|tarif\s+garanti/i],
  ["eligibility_decision", /vous\s+(etes|êtes)\s+(eligible|éligible|inéligible|ineligible)/i],
  ["acceptance_decision", /(demande|dossier)\s+(acceptee?|refusee?|validee?)\b/i],
  ["contract_validated", /contrat\s+valid(e|é)/i],
  ["chosen_broker", /courtier\s+choisi/i],
  ["guaranteed", /garantie\s+acceptee|nous\s+vous\s+assurons/i],
  ["guarantee_promise", /nous\s+(vous\s+)?garantissons|vous\s+(etes|êtes)\s+(couvert|assure|assuré)|couverture\s+garantie|remboursement\s+garanti|sans\s+aucune\s+exclusion/i]
];

/**
 * Visitor-facing outputs must stay neutral: no personalised advice, no choice or subscription
 * recommendation (PRD 10.1, COMP-010). Applied to every `visitor_*` assist type, French and English.
 */
const FORBIDDEN_VISITOR_PATTERNS: Array<[string, RegExp]> = [
  ["advice_fr", /\b(nous|je)\s+vous\s+(conseill(?:e|ons)|recommand(?:e|ons)|suggerons|suggérons|invitons\s+à\s+(choisir|souscrire|prendre))/i],
  ["should_choose_fr", /vous\s+devriez\s+(choisir|souscrire|prendre|opter|acheter|retenir)/i],
  ["choose_imperative_fr", /\b(choisissez|souscrivez|optez\s+pour|privil[eé]giez|retenez)\b/i],
  ["best_choice_fr", /le\s+meilleur\s+(choix|rapport)/i],
  ["most_suitable_fr", /l['’]offre\s+(la\s+plus\s+(adapt[eé]e|avantageuse|int[eé]ressante|appropri[eé]e)|qui\s+vous\s+convient)/i],
  ["advice_en", /\b(we|i)\s+(recommend|advise|suggest)\b/i],
  ["should_choose_en", /\byou\s+should\s+(choose|buy|subscribe|take|pick|go\s+(with|for)|opt)/i],
  ["best_offer_en", /\bbest\s+(offer|choice|option|deal|insurance)\b/i],
  ["most_suitable_en", /\b(most\s+(suitable|advantageous)|right\s+offer)\s+for\s+you\b/i]
];

const MAX_OUTPUT_CHARS = 4000;

/** Assist types whose output influences score, priority, relaunch or risk analysis: human validation is mandatory. */
const HUMAN_VALIDATION_REQUIRED: ReadonlySet<AiAssistTypeCatalog> = new Set([
  "lead_score", "next_action", "relaunch_message", "lead_classification", "duplicate_hint", "loss_analysis",
  "admin_risk_triage", "offer_consistency_check", "offer_summary", "suspicious_leads", "routing_anomaly_analysis"
]);

export interface GuardrailVerdict {
  approved: boolean;
  reasons: string[];
}

export class AiGuardrails {
  evaluate(assistType: AiAssistTypeCatalog, text: string): GuardrailVerdict {
    const reasons = [
      ...findForbiddenWording(text).map((word) => `forbidden_wording:${word}`),
      ...FORBIDDEN_AI_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => `forbidden_pattern:${name}`)
    ];
    if (assistType.startsWith("visitor_")) {
      reasons.push(...FORBIDDEN_VISITOR_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => `forbidden_pattern:${name}`));
    }
    if (text.trim().length === 0) reasons.push("empty_output");
    if (text.length > MAX_OUTPUT_CHARS) reasons.push("output_too_long");
    if (assistType === "relaunch_message" && /https?:\/\//i.test(text)) reasons.push("links_not_allowed");
    return { approved: reasons.length === 0, reasons };
  }

  /** Every visible AI output ends with the fixed assistance disclaimer. */
  decorate(text: string): string {
    const trimmed = text.trim();
    return trimmed.includes(AI_ASSISTANCE_DISCLAIMER) ? trimmed : `${trimmed}\n\n${AI_ASSISTANCE_DISCLAIMER}`;
  }

  requiresHumanValidation(assistType: AiAssistTypeCatalog): boolean {
    return HUMAN_VALIDATION_REQUIRED.has(assistType);
  }
}
