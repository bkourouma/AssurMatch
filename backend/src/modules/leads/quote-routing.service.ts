import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { MULTI_SEND_DEFAULT_RECIPIENTS } from "../../../../packages/shared/contracts/routing-rule.contracts";
import type { RoutingRuleRecord } from "../routing/routing-rules.repository";
import { EMPTY_ROUTING_STATS, selectRoutingCandidates, type RoutingCandidate, type RoutingPartnerStats } from "../routing/routing-strategy";
import { BrokerEligibilityPolicy, describeEligibilityBlockers } from "./broker-eligibility-policy";
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
  publicReference?: string;
  countryCode?: string;
  productKey?: string;
  /** The visitor's consented answers, carried to each recipient's lead. */
  payload?: Record<string, unknown>;
  /** Spec 052 R7: offer chosen by the visitor and the outcome of its verification at submission. */
  selectedOfferId?: string;
  selectedOfferOutcome?: "accepted" | "ignored";
  /** Spec 052 R7: broker of the accepted offer, retained first when it is eligible. */
  preferredPartnerTenantId?: string;
}

/** Spec 052 R7: whether the broker of the selected offer was retained. */
export type SelectedOfferRoutingOutcome = "retained" | "unavailable" | "none";

export interface QuoteRoutingResult {
  /** First recipient, kept for callers that only need one (notifications, confirmation copy). */
  assignment?: LeadAssignmentRecord;
  /** Every recipient. Single-send returns one element, so callers have a uniform shape. */
  assignments: LeadAssignmentRecord[];
  routingStatus: "assigned" | "no_broker_available" | "blocked" | "pending_manual_assignment";
  reasons: string[];
  /** Spec 052 R7: present when the request carried an accepted offer. */
  selectedOfferOutcome?: SelectedOfferRoutingOutcome;
}

/** Consent categories (spec 042). Anything other than the multi value means a single broker. */
export const SINGLE_BROKER_CONSENT = "courtier_partenaire_eligible";
export const MULTI_BROKER_CONSENT = "plusieurs_courtiers_partenaires_eligibles";

/** Structural port so routing can verify the consent actually recorded for this request. */
export interface ConsentRecordResolver {
  findRecord(id: string): Promise<{ intendedRecipient: string } | undefined>;
}

export interface MultiBrokerPolicy {
  isEnabled(): boolean;
}

/** Structural port so the leads module does not depend on the routing module at runtime. */
export interface RoutingRuleResolver {
  resolveForQuote(countryId: string, productId: string): Promise<RoutingRuleRecord | undefined>;
}

export type RoutingStatsProvider = (partnerTenantIds: string[], now: Date) => Promise<Map<string, RoutingPartnerStats>>;

export interface QuoteRoutingOptions {
  rules?: RoutingRuleResolver | undefined;
  stats?: RoutingStatsProvider | undefined;
  /** Spec 042: resolves the consent actually recorded for the request being routed. */
  consent?: ConsentRecordResolver | undefined;
  /** Spec 042: `multi_broker_routing_enabled`; absent means closed. */
  multiBroker?: MultiBrokerPolicy | undefined;
}

export class QuoteRoutingService {
  constructor(
    private readonly eligibility: BrokerEligibilityPolicy,
    private readonly decisions: RoutingDecisionService,
    private readonly assignments: LeadAssignmentService,
    private readonly audit: AuditLogWriter,
    private readonly options: QuoteRoutingOptions = {}
  ) {}

  async route(quote: RoutableQuoteRequest, actor: ActorContext): Promise<QuoteRoutingResult> {
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
      return { assignments: [], routingStatus: "blocked", reasons: ["consent_missing"] };
    }
    const candidates = await this.eligibility.candidates(quote.countryId, quote.productId);
    const eligible = candidates.filter((candidate) => candidate.eligible);
    const excludedCandidates = candidates
      .filter((candidate) => !candidate.eligible)
      .map((candidate) => ({ partnerTenantId: candidate.partner.id, reasons: candidate.reasons }));
    const correlation = quote.correlationId ? { correlationId: quote.correlationId } : {};
    const offer = this.selectedOffer(quote);
    if (eligible.length === 0) {
      const preferred = offer.preferred ? candidates.find((candidate) => candidate.partner.id === offer.preferred) : undefined;
      const reasons = offer.unavailable(preferred ? preferred.reasons[0] ?? "not_eligible" : "not_candidate", ["no_eligible_broker"]);
      await this.decisions.record({ quoteRequestId: quote.id, result: "no_broker_available", candidateCount: candidates.length, excludedCandidates, reasons, ...correlation, ...offer.decision }, actor);
      return { assignments: [], routingStatus: "no_broker_available", reasons, ...offer.result };
    }

    const rule = await this.options.rules?.resolveForQuote(quote.countryId, quote.productId);
    const mode = rule?.mode ?? "first_eligible";
    if (rule) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.routingEvaluated,
        targetType: "RoutingRule",
        targetId: rule.id,
        scope: { quoteRequestId: quote.id, countryId: quote.countryId, productId: quote.productId },
        result: "success",
        reason: "rule_applied",
        context: { mode, version: rule.version }
      });
    }
    if (mode === "manual") {
      // A manual rule stays manual: the admin decides, the offer only travels with the decision.
      const reasons = offer.unavailable("manual_rule", ["manual_assignment_required"]);
      await this.decisions.record({ quoteRequestId: quote.id, result: "pending_manual_assignment", candidateCount: candidates.length, excludedCandidates, reasons, ...correlation, ...offer.decision }, actor);
      return { assignments: [], routingStatus: "pending_manual_assignment", reasons, ...offer.result };
    }

    // Spec 052 R7 / D-4: the broker of the selected offer is retained alone when the deterministic
    // eligibility accepts it (quota included), whatever the strategy; never more than one recipient.
    if (offer.preferred) {
      const preferred = candidates.find((candidate) => candidate.partner.id === offer.preferred);
      const exclusiveConflict = mode === "exclusive" && rule?.exclusivePartnerTenantId !== offer.preferred;
      if (preferred?.eligible && !exclusiveConflict) {
        const reasons = ["selected_offer_partner"];
        const decision = await this.decisions.record({
          quoteRequestId: quote.id,
          result: "assigned",
          selectedPartnerTenantId: preferred.partner.id,
          selectedPartnerTenantIds: [preferred.partner.id],
          candidateCount: candidates.length,
          excludedCandidates,
          reasons,
          ...correlation,
          selectedOfferId: offer.offerId as string,
          selectedOfferOutcome: "retained"
        }, actor);
        const assignment = await this.assignments.create({
          quoteRequestId: quote.id,
          partnerTenantId: preferred.partner.id,
          assignmentReason: "selected_offer_partner",
          routingDecisionId: decision.id,
          recipientCount: 1,
          ...this.assignmentScope(quote)
        }, actor);
        return { assignment, assignments: [assignment], routingStatus: "assigned", reasons, selectedOfferOutcome: "retained" };
      }
      offer.unavailableCode = exclusiveConflict ? "exclusive_rule" : preferred ? preferred.reasons[0] ?? "not_eligible" : "not_candidate";
    }

    const now = new Date();
    const stats = await this.options.stats?.(eligible.map((candidate) => candidate.partner.id), now) ?? new Map<string, RoutingPartnerStats>();
    const ranked: RoutingCandidate[] = eligible.map((candidate) => ({
      partnerTenantId: candidate.partner.id,
      quotaMonthlyLeads: candidate.partner.quotaMonthlyLeads,
      stats: stats.get(candidate.partner.id) ?? EMPTY_ROUTING_STATS
    }));
    const selectionInput = {
      mode,
      candidates: ranked,
      priorities: rule?.priorities,
      exclusivePartnerTenantId: rule?.exclusivePartnerTenantId
    };
    const fanOut = await this.resolveFanOut(quote, mode, rule?.maxRecipients, actor);
    const selection = selectRoutingCandidates(selectionInput, fanOut.maxRecipients);
    if (selection.selected.length === 0) {
      const reasons = offer.unavailable(undefined, [selection.reason]);
      await this.decisions.record({ quoteRequestId: quote.id, result: "no_broker_available", candidateCount: candidates.length, excludedCandidates, reasons, ...correlation, ...offer.decision }, actor);
      return { assignments: [], routingStatus: "no_broker_available", reasons, ...offer.result };
    }
    const recipients = selection.selected;
    const reasons = offer.unavailable(undefined, fanOut.reason ? [selection.reason, fanOut.reason] : [selection.reason]);
    const decision = await this.decisions.record({
      quoteRequestId: quote.id,
      result: "assigned",
      selectedPartnerTenantId: recipients[0]?.partnerTenantId as string,
      selectedPartnerTenantIds: recipients.map((candidate) => candidate.partnerTenantId),
      candidateCount: candidates.length,
      excludedCandidates,
      reasons,
      ...correlation,
      ...offer.decision
    }, actor);
    const assignments: LeadAssignmentRecord[] = [];
    for (const recipient of recipients) {
      assignments.push(await this.assignments.create({
        quoteRequestId: quote.id,
        partnerTenantId: recipient.partnerTenantId,
        assignmentReason: selection.reason,
        routingDecisionId: decision.id,
        recipientCount: recipients.length,
        ...this.assignmentScope(quote)
      }, actor));
    }
    return { ...(assignments[0] ? { assignment: assignments[0] } : {}), assignments, routingStatus: "assigned", reasons, ...offer.result };
  }

  /**
   * Spec 052 R7: the accepted offer of the request (if any) and how it is reported when its broker
   * is not retained: `selected_offer_partner_unavailable:<code>` is added to the decision reasons.
   */
  private selectedOffer(quote: RoutableQuoteRequest) {
    const offerId = quote.selectedOfferOutcome === "accepted" ? quote.selectedOfferId : undefined;
    const state = {
      offerId,
      preferred: offerId ? quote.preferredPartnerTenantId : undefined,
      unavailableCode: undefined as string | undefined,
      get outcome(): SelectedOfferRoutingOutcome | undefined {
        if (!offerId) return undefined;
        return state.preferred ? "unavailable" : "none";
      },
      get decision(): { selectedOfferId?: string; selectedOfferOutcome?: SelectedOfferRoutingOutcome } {
        return offerId && state.outcome ? { selectedOfferId: offerId, selectedOfferOutcome: state.outcome } : {};
      },
      get result(): { selectedOfferOutcome?: SelectedOfferRoutingOutcome } {
        return state.outcome ? { selectedOfferOutcome: state.outcome } : {};
      },
      unavailable(code: string | undefined, reasons: string[]): string[] {
        if (!state.preferred) return reasons;
        return [...reasons, `selected_offer_partner_unavailable:${code ?? state.unavailableCode ?? "not_candidate"}`];
      }
    };
    return state;
  }

  /**
   * How many partners this request may reach. Multi-send requires all three of: the rule asking
   * for it, the global flag being open, and the visitor's own recorded consent covering several
   * brokers. Any missing condition degrades to a single recipient with an audited reason - a
   * consent granted under the single-broker wording is never re-interpreted by a later flag flip.
   */
  private async resolveFanOut(
    quote: RoutableQuoteRequest,
    mode: string,
    ruleMaxRecipients: number | undefined,
    actor: ActorContext
  ): Promise<{ maxRecipients: number; reason?: string }> {
    if (mode !== "multi_send") return { maxRecipients: 1 };
    const degrade = (reason: string): { maxRecipients: number; reason: string } => {
      this.audit.write({
        actor,
        action: QuoteAuditActions.routingEvaluated,
        targetType: "QuoteRequest",
        targetId: quote.id,
        scope: { countryId: quote.countryId, productId: quote.productId },
        result: "success",
        reason,
        context: { mode, degradedToSingleBroker: true }
      });
      return { maxRecipients: 1, reason };
    };
    if (!this.options.multiBroker?.isEnabled()) return degrade("multi_broker_routing_disabled");
    const consent = await this.options.consent?.findRecord(quote.consentRecordId);
    if (consent?.intendedRecipient !== MULTI_BROKER_CONSENT) return degrade("consent_covers_single_broker");
    return { maxRecipients: Math.max(2, ruleMaxRecipients ?? MULTI_SEND_DEFAULT_RECIPIENTS) };
  }

  private assignmentScope(quote: RoutableQuoteRequest): { publicReference?: string; countryCode?: string; productKey?: string; consentRecordId?: string; answers?: Record<string, unknown> } {
    return {
      ...(quote.publicReference ? { publicReference: quote.publicReference } : {}),
      ...(quote.countryCode ? { countryCode: quote.countryCode } : {}),
      ...(quote.productKey ? { productKey: quote.productKey } : {}),
      ...(quote.consentRecordId ? { consentRecordId: quote.consentRecordId } : {}),
      // Spec 043: the consented answers travel with the lead. Without this the broker receives a
      // request with a contact and nothing else - invisible until the form started collecting them.
      ...(quote.payload && Object.keys(quote.payload).length > 0 ? { answers: quote.payload } : {})
    };
  }

  /**
   * Admin-driven assignment of a quote parked by a `manual` rule. The same eligibility policy
   * gates the target partner; the admin only chooses among eligible brokers.
   */
  async assignManually(quote: RoutableQuoteRequest, partnerTenantId: string, actor: ActorContext, reason: string): Promise<LeadAssignmentRecord> {
    if (!quote.consentRecordId) throw new Error("Consent missing: lead cannot be transmitted");
    const evaluation = await this.eligibility.evaluate(partnerTenantId, quote.countryId, quote.productId);
    if (!evaluation.eligible) throw new Error(`Partner not eligible: ${describeEligibilityBlockers(evaluation.reasons)}`);
    const decision = await this.decisions.record({
      quoteRequestId: quote.id,
      result: "assigned",
      selectedPartnerTenantId: partnerTenantId,
      candidateCount: 1,
      excludedCandidates: [],
      reasons: ["admin_manual_assignment"],
      ...(quote.correlationId ? { correlationId: quote.correlationId } : {})
    }, actor);
    return this.assignments.create({
      quoteRequestId: quote.id,
      partnerTenantId,
      assignmentReason: `admin_manual_assignment:${reason}`.slice(0, 200),
      routingDecisionId: decision.id,
      ...this.assignmentScope(quote)
    }, actor);
  }
}
