import { findForbiddenWording } from "../../../../../packages/shared/contracts/content-safety";

const FORBIDDEN_AI_PATTERNS = [
  /je recommande/i,
  /meilleure offre/i,
  /prix ferme/i,
  /eligible/i,
  /accepte/i,
  /refuse/i,
  /courtier choisi/i
];

export class QuoteAISummaryGuardrails {
  evaluate(output: string): { approved: boolean; reasons: string[] } {
    const reasons = [
      ...findForbiddenWording(output),
      ...FORBIDDEN_AI_PATTERNS.filter((pattern) => pattern.test(output)).map((pattern) => pattern.source)
    ];
    return { approved: reasons.length === 0, reasons };
  }
}
