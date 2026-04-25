import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { BrokerEligibilityPolicy } from "./broker-eligibility-policy";
import { LeadAssignmentService, type LeadAssignmentRecord } from "./lead-assignment.service";
import { RoutingDecisionService } from "./routing-decision.service";

export interface RoutableQuoteRequest {
  id: string;
  countryId: string;
  productId: string;
  consentRecordId: string;
  status: string;
  routingStatus: string;
  correlationId?: string;
}

export interface QuoteRoutingResult {
  assignment?: LeadAssignmentRecord;
  routingStatus: "assigned" | "no_broker_available" | "blocked";
  reasons: string[];
}

export class QuoteRoutingService {
  constructor(
    private readonly eligibility: BrokerEligibilityPolicy,
    private readonly decisions: RoutingDecisionService,
    private readonly assignments: LeadAssignmentService,
    private readonly audit: AuditLogWriter
  ) {}

  route(quote: RoutableQuoteRequest, actor: ActorContext): QuoteRoutingResult {
    if (!quote.consentRecordId) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.routingEvaluated,
        targetType: "QuoteRequest",
        targetId: quote.id,
        scope: { countryId: quote.countryId, productId: quote.productId },
        result: "refused",
        reason: "consent_missing",
        context: {}
      });
      return { routingStatus: "blocked", reasons: ["consent_missing"] };
    }
    const candidates = this.eligibility.candidates(quote.countryId, quote.productId);
    const eligible = candidates.filter((candidate) => candidate.eligible).sort((a, b) => a.partner.id.localeCompare(b.partner.id));
    const excludedCandidates = candidates
      .filter((candidate) => !candidate.eligible)
      .map((candidate) => ({ partnerTenantId: candidate.partner.id, reasons: candidate.reasons }));
    if (eligible.length === 0) {
      this.decisions.record({
        quoteRequestId: quote.id,
        result: "no_broker_available",
        candidateCount: candidates.length,
        excludedCandidates,
        reasons: ["no_eligible_broker"],
        ...(quote.correlationId ? { correlationId: quote.correlationId } : {})
      }, actor);
      return { routingStatus: "no_broker_available", reasons: ["no_eligible_broker"] };
    }
    const selected = eligible[0];
    if (!selected) return { routingStatus: "no_broker_available", reasons: ["no_eligible_broker"] };
    const decision = this.decisions.record({
      quoteRequestId: quote.id,
      result: "assigned",
      selectedPartnerTenantId: selected.partner.id,
      candidateCount: candidates.length,
      excludedCandidates,
      reasons: ["eligible_broker_selected"],
      ...(quote.correlationId ? { correlationId: quote.correlationId } : {})
    }, actor);
    const assignment = this.assignments.create({
      quoteRequestId: quote.id,
      partnerTenantId: selected.partner.id,
      assignmentReason: "eligible_broker_selected",
      routingDecisionId: decision.id
    }, actor);
    return { assignment, routingStatus: "assigned", reasons: ["eligible_broker_selected"] };
  }
}
