import type { AiRoutingSuggestion, AiRoutingSuggestionPort } from "./routing-controls.ports";

/** Closed by default (`GLOBAL_FEATURE_FLAG_DEFAULTS`). */
export const AI_ASSISTED_ROUTING_FLAG = "ai_assisted_routing_enabled";

type SuggestInput = Parameters<AiRoutingSuggestionPort["suggest"]>[0];
type SuggestCandidate = SuggestInput["candidates"][number];

/** Neutral acceptance rate for a broker without history in the 90-day window. */
const UNKNOWN_ACCEPTANCE_RATE = 0.5;

/**
 * Lot 5 (spec 071, PRD 32.8 / constitution V and VII): default suggester of the `ai_assisted`
 * routing mode. It calls NO model (`provider: "template"`) and receives NO personal data: only the
 * request scope ids and the operational statistics of the brokers the deterministic eligibility
 * already accepted. It picks one of them with an explainable order (not over SLA, acceptance rate
 * over 90 days, average first-action delay, remaining quota, then id for stability). The suggestion
 * is advisory: the routing parks the request and an admin decides by assigning manually.
 */
export class TemplateAiRoutingSuggester implements AiRoutingSuggestionPort {
  constructor(private readonly enabled: () => boolean = () => false, private readonly now: () => Date = () => new Date()) {}

  isEnabled(): boolean {
    try {
      return this.enabled() === true;
    } catch {
      return false;
    }
  }

  async suggest(input: SuggestInput): Promise<AiRoutingSuggestion | undefined> {
    if (!this.isEnabled() || input.candidates.length === 0) return undefined;
    const [best] = [...input.candidates].sort(compareCandidates);
    if (!best) return undefined;
    return {
      partnerTenantId: best.partnerTenantId,
      rationale: rationaleFor(best, input.candidates.length),
      provider: "template",
      generatedAt: this.now()
    };
  }
}

function compareCandidates(a: SuggestCandidate, b: SuggestCandidate): number {
  return Number(Boolean(a.slaDegraded)) - Number(Boolean(b.slaDegraded))
    || acceptance(b) - acceptance(a)
    || firstAction(a) - firstAction(b)
    || remaining(b) - remaining(a)
    || a.partnerTenantId.localeCompare(b.partnerTenantId);
}

function acceptance(candidate: SuggestCandidate): number {
  return candidate.acceptanceRate90d ?? UNKNOWN_ACCEPTANCE_RATE;
}

function firstAction(candidate: SuggestCandidate): number {
  return candidate.averageFirstActionMinutes ?? Number.POSITIVE_INFINITY;
}

function remaining(candidate: SuggestCandidate): number {
  return candidate.quotaMonthlyLeads > 0 ? candidate.quotaMonthlyLeads - candidate.monthlyCount : Number.POSITIVE_INFINITY;
}

/** French wording shown to the admin, always labelled as an assistance (constitution V). */
function rationaleFor(candidate: SuggestCandidate, candidateCount: number): string {
  const parts = [
    candidate.acceptanceRate90d === null ? "taux d'acceptation 90 j : sans historique" : `taux d'acceptation 90 j : ${Math.round(candidate.acceptanceRate90d * 100)} %`,
    candidate.averageFirstActionMinutes === null ? "délai de première action : inconnu" : `délai moyen de première action : ${Math.round(candidate.averageFirstActionMinutes)} min`,
    candidate.quotaMonthlyLeads > 0 ? `quota restant : ${Math.max(0, candidate.quotaMonthlyLeads - candidate.monthlyCount)}` : "quota : illimité",
    ...(candidate.slaDegraded ? ["délai de réponse dépassé"] : [])
  ];
  return `Suggestion d'assistance, à valider par un administrateur (${candidateCount} courtier(s) éligible(s)) : ${parts.join(", ")}.`;
}
