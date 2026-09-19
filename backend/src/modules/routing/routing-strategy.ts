import type { RoutingRuleMode, RoutingRulePriority } from "../../../../packages/shared/contracts/routing-rule.contracts";

/**
 * Per-partner operational statistics used to rank candidates. They are computed from
 * LeadAssignment records only; nothing here decides eligibility.
 */
export interface RoutingPartnerStats {
  monthlyCount: number;
  lastAssignedAt?: Date | undefined;
  received90d: number;
  accepted90d: number;
  averageFirstActionMinutes?: number | undefined;
}

export interface RoutingCandidate {
  partnerTenantId: string;
  quotaMonthlyLeads: number;
  stats: RoutingPartnerStats;
}

export interface RoutingSelectionInput {
  mode: RoutingRuleMode;
  candidates: RoutingCandidate[];
  priorities?: RoutingRulePriority[] | undefined;
  exclusivePartnerTenantId?: string | null | undefined;
}

export interface RoutingSelection {
  selected?: RoutingCandidate | undefined;
  reason: string;
  /** Candidate ids in the order the strategy ranked them, for decision context. */
  ranking: string[];
}

export const EMPTY_ROUTING_STATS: RoutingPartnerStats = { monthlyCount: 0, received90d: 0, accepted90d: 0 };

/**
 * Deterministic strategy applied to candidates that the eligibility policy already accepted
 * (Constitution VII: business rules, never AI, decide final eligibility). Every mode ends with
 * the same stable tie-break so repeated evaluations of identical inputs select identically.
 */
export function selectRoutingCandidate(input: RoutingSelectionInput): RoutingSelection {
  const candidates = [...input.candidates];
  if (input.mode === "manual") return { reason: "manual_assignment_required", ranking: [] };
  if (candidates.length === 0) return { reason: "no_eligible_broker", ranking: [] };

  if (input.mode === "exclusive") {
    const exclusive = candidates.find((candidate) => candidate.partnerTenantId === input.exclusivePartnerTenantId);
    return exclusive
      ? { selected: exclusive, reason: "exclusive_selected", ranking: [exclusive.partnerTenantId] }
      : { reason: "exclusive_partner_not_eligible", ranking: [] };
  }

  const ranked = candidates.sort(comparatorFor(input));
  const selected = ranked[0];
  return {
    selected,
    reason: input.mode === "first_eligible" ? "eligible_broker_selected" : `${input.mode}_selected`,
    ranking: ranked.map((candidate) => candidate.partnerTenantId)
  };
}

export interface RoutingMultiSelection {
  /** Ranked recipients, at most `max`; empty when no candidate could be selected. */
  selected: RoutingCandidate[];
  reason: string;
  ranking: string[];
}

/**
 * Multi-recipient selection (spec 042). It reuses the single-send ranking, so a fan-out always
 * starts with the partner that would have been chosen alone and then widens down the same order.
 * `exclusive` and `manual` never fan out: an exclusive rule means one named partner, and a manual
 * rule means a human decides.
 */
export function selectRoutingCandidates(input: RoutingSelectionInput, max: number): RoutingMultiSelection {
  const single = selectRoutingCandidate(input);
  if (!single.selected) return { selected: [], reason: single.reason, ranking: single.ranking };
  if (input.mode === "exclusive" || input.mode === "manual" || max <= 1) {
    return { selected: [single.selected], reason: single.reason, ranking: single.ranking };
  }
  const byPartnerId = new Map(input.candidates.map((candidate) => [candidate.partnerTenantId, candidate]));
  // Eligibility already excluded over-quota partners, but the fan-out re-checks each recipient so
  // widening never hands a lead to a partner with no remaining capacity.
  const selected = single.ranking
    .map((partnerTenantId) => byPartnerId.get(partnerTenantId))
    .filter((candidate): candidate is RoutingCandidate => Boolean(candidate))
    .filter((candidate) => remainingQuota(candidate) > 0)
    .slice(0, Math.max(1, max));
  return {
    selected,
    reason: selected.length > 1 ? `multi_send_selected_${selected.length}` : single.reason,
    ranking: single.ranking
  };
}

function comparatorFor(input: RoutingSelectionInput): (a: RoutingCandidate, b: RoutingCandidate) => number {
  switch (input.mode) {
    case "first_eligible":
      return byId;
    case "round_robin":
      return leastRecentlyAssigned;
    case "priority": {
      const rank = new Map((input.priorities ?? []).map((entry) => [entry.partnerTenantId, entry.priority]));
      return (a, b) =>
        (rank.get(a.partnerTenantId) ?? Number.POSITIVE_INFINITY) - (rank.get(b.partnerTenantId) ?? Number.POSITIVE_INFINITY)
        || leastRecentlyAssigned(a, b);
    }
    case "capacity":
      return (a, b) => remainingQuota(b) - remainingQuota(a) || leastRecentlyAssigned(a, b);
    case "performance":
      return (a, b) =>
        acceptanceRate(b) - acceptanceRate(a)
        || firstActionMinutes(a) - firstActionMinutes(b)
        || leastRecentlyAssigned(a, b);
    default:
      return byId;
  }
}

function byId(a: RoutingCandidate, b: RoutingCandidate): number {
  return a.partnerTenantId.localeCompare(b.partnerTenantId);
}

function leastRecentlyAssigned(a: RoutingCandidate, b: RoutingCandidate): number {
  const left = a.stats.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const right = b.stats.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  return left - right || byId(a, b);
}

function remainingQuota(candidate: RoutingCandidate): number {
  if (candidate.quotaMonthlyLeads <= 0) return Number.POSITIVE_INFINITY;
  return candidate.quotaMonthlyLeads - candidate.stats.monthlyCount;
}

function acceptanceRate(candidate: RoutingCandidate): number {
  return candidate.stats.received90d > 0 ? candidate.stats.accepted90d / candidate.stats.received90d : 0;
}

function firstActionMinutes(candidate: RoutingCandidate): number {
  return candidate.stats.averageFirstActionMinutes ?? Number.POSITIVE_INFINITY;
}
