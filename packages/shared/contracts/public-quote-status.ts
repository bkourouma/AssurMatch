import { z } from "zod";
import { publicLeadProposalSchema } from "./lead-proposals";

/**
 * Spec 054 R5: the status a visitor sees for their own request. It is a pure projection of the
 * request, its assignments and the broker CRM state: no internal status (CRM pipeline, rejection
 * reason, dispute, notes) ever leaves this module as is.
 *
 * Spec 055: `proposal_available` is the status of an assignment whose broker has an active proposal
 * (sent, not withdrawn, not expired), and the view carries the visible proposals in `proposals`.
 */
export const PUBLIC_QUOTE_STATUSES = ["received", "in_review", "transmitted", "in_progress", "proposal_available", "closed", "not_transmitted"] as const;
export const PUBLIC_BROKER_STATUSES = ["transmitted", "in_progress", "proposal_available", "closed"] as const;
export const PUBLIC_TIMELINE_STEPS = ["received", "in_review", "transmitted", "accepted", "reassigned", "closed", "consent_withdrawn", "not_transmitted"] as const;

export const publicQuoteStatusSchema = z.enum(PUBLIC_QUOTE_STATUSES);
export const publicBrokerStatusSchema = z.enum(PUBLIC_BROKER_STATUSES);
export const publicTimelineStepSchema = z.enum(PUBLIC_TIMELINE_STEPS);

export type PublicQuoteStatus = z.output<typeof publicQuoteStatusSchema>;
export type PublicBrokerStatus = z.output<typeof publicBrokerStatusSchema>;
export type PublicTimelineStep = z.output<typeof publicTimelineStepSchema>;

export const publicQuoteBrokerSchema = z.object({
  partnerName: z.string(),
  status: publicBrokerStatusSchema,
  since: z.string()
});

export const publicQuoteTimelineEntrySchema = z.object({
  step: publicTimelineStepSchema,
  at: z.string(),
  partnerName: z.string().optional()
});

/** `GET /quote-requests/:publicReference?token=` (contract `contracts/visitor-tracking-api.md`). */
export const publicQuoteStatusViewSchema = z.object({
  publicReference: z.string(),
  language: z.enum(["fr", "en"]),
  country: z.object({ isoCode: z.string(), name: z.string() }),
  product: z.object({ key: z.string(), name: z.string() }),
  status: publicQuoteStatusSchema,
  brokers: z.array(publicQuoteBrokerSchema),
  timeline: z.array(publicQuoteTimelineEntrySchema),
  consent: z.object({ withdrawn: z.boolean(), withdrawnAt: z.string().optional() }),
  tokenExpiresAt: z.string().nullable(),
  /**
   * Spec 055 FR-005: proposals of the request, sent and not withdrawn, newest first; empty after a
   * consent withdrawal. Optional on input so a pre-055 payload still parses.
   */
  proposals: z.array(publicLeadProposalSchema).default([])
});

export type PublicQuoteBroker = z.output<typeof publicQuoteBrokerSchema>;
export type PublicQuoteTimelineEntry = z.output<typeof publicQuoteTimelineEntrySchema>;
export type PublicQuoteStatusView = z.output<typeof publicQuoteStatusViewSchema>;

/** `POST /quote-requests/tracking-link`: `website` is the honeypot and must stay empty. */
export const trackingLinkRequestSchema = z.object({
  publicReference: z.string().trim().min(4).max(64).regex(/^[A-Za-z0-9-]+$/),
  email: z.string().trim().max(254).email(),
  locale: z.enum(["fr", "en"]).optional(),
  website: z.string().max(200).optional()
});

export type TrackingLinkRequest = z.input<typeof trackingLinkRequestSchema>;

/** Always the same body, whether the reference and e-mail matched or not (FR-004). */
export const trackingLinkResponseSchema = z.object({ accepted: z.literal(true) });
export type TrackingLinkResponse = z.output<typeof trackingLinkResponseSchema>;

/** Neutral refusal body of every visitor route (unknown reference, wrong, expired or revoked token). */
export const VISITOR_ACCESS_DENIED_CODE = "VISITOR_ACCESS_DENIED" as const;

// ---------------------------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------------------------

export type ProjectionAssignmentStatus = "assigned" | "broker_notified" | "seen" | "accepted" | "received" | "contacted" | "rejected" | "closed" | "disputed";

export interface ProjectionQuote {
  status: "created" | "manual_review" | "routed" | "non_routable" | "duplicate" | "spam_blocked" | "cancelled";
  routingStatus: string;
  refusalReason?: string | undefined;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProjectionAssignment {
  id: string;
  partnerName: string;
  status: ProjectionAssignmentStatus;
  crmStatus?: string | undefined;
  createdAt: Date | string;
  assignedAt: Date | string;
  acceptedAt?: Date | string | undefined;
  crmUpdatedAt?: Date | string | undefined;
  lastBrokerActionAt?: Date | string | undefined;
  updatedAt: Date | string;
  /** Spec 055: sending time of the latest active proposal of the current broker, if any. */
  activeProposalAt?: Date | string | undefined;
}

/** Assignment history reduced to what the visitor may see; `partnerName` is the partner of that moment. */
export interface ProjectionHistoryEvent {
  assignmentId: string;
  eventType: "assigned" | "reassigned" | "accepted" | "rejected" | "closed" | string;
  occurredAt: Date | string;
  partnerName?: string | undefined;
  /** For `reassigned`: the partner the request was taken from. */
  previousPartnerName?: string | undefined;
}

export interface PublicQuoteStatusProjection {
  status: PublicQuoteStatus;
  brokers: PublicQuoteBroker[];
  timeline: PublicQuoteTimelineEntry[];
  consent: { withdrawn: boolean; withdrawnAt?: string };
}

const IN_PROGRESS_CRM = new Set(["accepte", "contact_tente", "contacte", "qualifie", "documents_demandes", "devis_en_preparation", "devis_envoye", "negociation"]);
const CLOSED_CRM = new Set(["gagne", "perdu", "doublon", "injoignable", "hors_cible", "rejete_conteste"]);
const CLOSED_ASSIGNMENT = new Set<ProjectionAssignmentStatus>(["closed", "rejected", "disputed"]);
const IN_PROGRESS_ASSIGNMENT = new Set<ProjectionAssignmentStatus>(["accepted", "received", "contacted"]);
const BROKER_RANK: Record<PublicBrokerStatus, number> = { closed: 0, transmitted: 1, in_progress: 2, proposal_available: 3 };

function iso(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Public status of one assignment (R5 table). A CRM status that is not listed keeps the assignment
 * status. Spec 055: an open assignment with an active proposal is `proposal_available`.
 */
export function projectBrokerStatus(assignment: Pick<ProjectionAssignment, "status" | "crmStatus" | "activeProposalAt">): PublicBrokerStatus {
  if (CLOSED_ASSIGNMENT.has(assignment.status)) return "closed";
  if (assignment.crmStatus && CLOSED_CRM.has(assignment.crmStatus)) return "closed";
  if (assignment.activeProposalAt) return "proposal_available";
  if (assignment.crmStatus && IN_PROGRESS_CRM.has(assignment.crmStatus)) return "in_progress";
  if (IN_PROGRESS_ASSIGNMENT.has(assignment.status)) return "in_progress";
  return "transmitted";
}

function brokerSince(assignment: ProjectionAssignment, status: PublicBrokerStatus): string {
  const at = status === "transmitted"
    ? assignment.assignedAt
    : status === "in_progress"
      ? assignment.acceptedAt ?? assignment.crmUpdatedAt ?? assignment.updatedAt
      : assignment.activeProposalAt ?? assignment.lastBrokerActionAt ?? assignment.crmUpdatedAt ?? assignment.updatedAt;
  return iso(at) ?? iso(assignment.updatedAt) ?? new Date(0).toISOString();
}

/**
 * Spec 054 R5: pure projection. Global status: `cancelled` -> closed, `non_routable` ->
 * not_transmitted, manual review or a parked manual assignment -> in_review, `routed` -> the most
 * advanced status among the assignments still open (closed when none is), otherwise received.
 */
export function projectPublicQuoteStatus(
  quote: ProjectionQuote,
  assignments: ProjectionAssignment[],
  history: ProjectionHistoryEvent[] = []
): PublicQuoteStatusProjection {
  const brokers = assignments.map((assignment) => {
    const status = projectBrokerStatus(assignment);
    return { partnerName: assignment.partnerName, status, since: brokerSince(assignment, status) };
  });
  const withdrawn = quote.status === "cancelled" && quote.refusalReason === "consent_withdrawn";
  const status = globalStatus(quote, brokers);
  const timeline = buildTimeline(quote, assignments, history, withdrawn);
  const withdrawnAt = withdrawn ? iso(quote.updatedAt) : undefined;
  return {
    status,
    brokers,
    timeline,
    consent: { withdrawn, ...(withdrawnAt ? { withdrawnAt } : {}) }
  };
}

function globalStatus(quote: ProjectionQuote, brokers: PublicQuoteBroker[]): PublicQuoteStatus {
  if (quote.status === "cancelled") return "closed";
  if (quote.status === "non_routable") return "not_transmitted";
  if (quote.status === "manual_review" || quote.routingStatus === "pending_manual_assignment" || quote.routingStatus === "manual_review_required") return "in_review";
  if (quote.status === "routed") {
    const open = brokers.filter((broker) => broker.status !== "closed");
    if (open.length === 0) return "closed";
    return open.reduce((best, broker) => (BROKER_RANK[broker.status] > BROKER_RANK[best] ? broker.status : best), open[0]!.status);
  }
  return "received";
}

function buildTimeline(quote: ProjectionQuote, assignments: ProjectionAssignment[], history: ProjectionHistoryEvent[], withdrawn: boolean): PublicQuoteTimelineEntry[] {
  const entries: PublicQuoteTimelineEntry[] = [];
  const push = (step: PublicTimelineStep, at: Date | string | undefined, partnerName?: string) => {
    const when = iso(at);
    if (!when) return;
    entries.push({ step, at: when, ...(partnerName ? { partnerName } : {}) });
  };
  push("received", quote.createdAt);
  if (quote.status === "manual_review" || quote.routingStatus === "manual_review_required" || quote.routingStatus === "pending_manual_assignment") {
    push("in_review", quote.createdAt);
  }
  if (quote.status === "non_routable") push("not_transmitted", quote.updatedAt);

  for (const assignment of assignments) {
    const events = history.filter((event) => event.assignmentId === assignment.id);
    const reassignments = events.filter((event) => event.eventType === "reassigned");
    // The first transmission went to the partner the first reassignment took the request from.
    const firstPartner = reassignments[0] ? reassignments[0].previousPartnerName : assignment.partnerName;
    push("transmitted", assignment.createdAt, firstPartner);
    let accepted = false;
    for (const event of events) {
      if (event.eventType === "reassigned") push("reassigned", event.occurredAt, event.partnerName);
      if (event.eventType === "accepted") {
        accepted = true;
        push("accepted", event.occurredAt, event.partnerName ?? assignment.partnerName);
      }
    }
    const brokerStatus = projectBrokerStatus(assignment);
    if (!accepted && (brokerStatus === "in_progress" || brokerStatus === "proposal_available" || (brokerStatus === "closed" && (assignment.acceptedAt || (assignment.crmStatus && IN_PROGRESS_CRM.has(assignment.crmStatus)))))) {
      push("accepted", assignment.acceptedAt ?? assignment.crmUpdatedAt ?? assignment.activeProposalAt, assignment.partnerName);
    }
    if (brokerStatus === "closed" && !withdrawn) {
      push("closed", assignment.lastBrokerActionAt ?? assignment.crmUpdatedAt ?? assignment.updatedAt, assignment.partnerName);
    }
  }
  if (withdrawn) push("consent_withdrawn", quote.updatedAt);
  else if (quote.status === "cancelled") push("closed", quote.updatedAt);
  return entries.sort((left, right) => left.at.localeCompare(right.at));
}
