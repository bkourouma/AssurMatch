import type { BrokerCrmKpis, BrokerCrmSourceRow } from "../../../../packages/shared/contracts/dashboard.contracts";
import { SHARED_LEAD_TOTAL_CAP } from "../../../../packages/shared/contracts/billing.contracts";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";

/** PRD §20: a lead is "contacted" once it reached one of these pipeline statuses (`contact_tente` does not count). */
export const CONTACTED_STATUSES: ReadonlySet<string> = new Set([
  "contacte",
  "qualifie",
  "documents_demandes",
  "devis_en_preparation",
  "devis_envoye",
  "negociation",
  "gagne"
]);

/** A lead is "qualified" once it reached `qualifie` or any later status of the pipeline. */
export const QUALIFIED_STATUSES: ReadonlySet<string> = new Set([
  "qualifie",
  "documents_demandes",
  "devis_en_preparation",
  "devis_envoye",
  "negociation",
  "gagne"
]);

export interface LeadHistoryEventLike {
  eventType?: string | undefined;
  nextStatus?: string | undefined;
  occurredAt: string;
}

/** Per-lead facts derived from the assignment and its CRM history; no prospect identity. */
export interface LeadCrmFacts {
  contacted: boolean;
  qualified: boolean;
  won: boolean;
  quoteSent: boolean;
  proposals: number;
  /** Minutes from assignment to the first transition to a contacted status; null when none is recorded. */
  firstContactMinutes: number | null;
}

export interface LeadPricing {
  perLeadPrice: number;
  sharedLeadPriceMultiplier: number;
  currency: string;
}

export function computeLeadFacts(assignment: LeadAssignmentRecord, history: LeadHistoryEventLike[], proposals: number): LeadCrmFacts {
  const reached = new Set<string>();
  if (assignment.crmStatus) reached.add(assignment.crmStatus);
  for (const event of history) if (event.nextStatus) reached.add(event.nextStatus);
  const contacted = assignment.status === "contacted" || [...reached].some((status) => CONTACTED_STATUSES.has(status));
  let firstContactMinutes: number | null = null;
  const firstContact = [...history]
    .filter((event) => event.eventType === "status_changed" && event.nextStatus !== undefined && CONTACTED_STATUSES.has(event.nextStatus))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))[0];
  if (firstContact) {
    const occurred = new Date(firstContact.occurredAt).getTime();
    if (Number.isFinite(occurred)) firstContactMinutes = (occurred - assignment.assignedAt.getTime()) / 60_000;
  }
  return {
    contacted,
    qualified: [...reached].some((status) => QUALIFIED_STATUSES.has(status)),
    won: assignment.crmStatus === "gagne",
    quoteSent: proposals > 0 || reached.has("devis_envoye"),
    proposals,
    firstContactMinutes
  };
}

export function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 1000;
}

export function averageMinutes(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (present.length === 0) return null;
  return Math.round((present.reduce((sum, value) => sum + value, 0) / present.length) * 100) / 100;
}

/**
 * DECISION: no UTM / marketing attribution is captured, so the CRM `source` of the lead is used as the
 * source of the request (`quote_request` when the lead carries none).
 */
export function computeTopSources(rows: Array<{ assignment: LeadAssignmentRecord; facts: LeadCrmFacts }>): BrokerCrmSourceRow[] {
  const map = new Map<string, { received: number; won: number }>();
  for (const { assignment, facts } of rows) {
    const source = assignment.source ?? "quote_request";
    const entry = map.get(source) ?? { received: 0, won: 0 };
    entry.received += 1;
    if (facts.won) entry.won += 1;
    map.set(source, entry);
  }
  return [...map.entries()]
    .map(([source, value]) => ({ source, received: value.received, won: value.won, conversionRate: ratio(value.won, value.received) }))
    .sort((left, right) => right.won - left.won || right.received - left.received || left.source.localeCompare(right.source));
}

/** Same shared-lead rule as the draft invoice: price x min(multiplier, cap / recipients). */
export function sharedUnitPrice(pricing: LeadPricing, recipientCount: number): number {
  if (recipientCount <= 1) return pricing.perLeadPrice;
  const capped = Math.min(pricing.sharedLeadPriceMultiplier, SHARED_LEAD_TOTAL_CAP / recipientCount);
  return Math.round(pricing.perLeadPrice * capped * 100) / 100;
}

export function buildKpis(rows: Array<{ assignment: LeadAssignmentRecord; facts: LeadCrmFacts }>, leadCost: BrokerCrmKpis["leadCost"]): BrokerCrmKpis {
  const received = rows.length;
  return {
    contactRate: ratio(rows.filter((row) => row.facts.contacted).length, received),
    averageFirstContactMinutes: averageMinutes(rows.map((row) => row.facts.firstContactMinutes)),
    qualificationRate: ratio(rows.filter((row) => row.facts.qualified).length, received),
    quotesSent: {
      leads: rows.filter((row) => row.facts.quoteSent).length,
      proposals: rows.reduce((sum, row) => sum + row.facts.proposals, 0)
    },
    topSources: computeTopSources(rows),
    ...(leadCost ? { leadCost } : {})
  };
}
