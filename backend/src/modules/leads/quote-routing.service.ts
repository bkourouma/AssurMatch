import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { ActorContext } from "../common/types";
import { MAX_QUOTE_OFFERS } from "../../../../packages/shared/contracts/quote.contracts";
import { MULTI_SEND_DEFAULT_RECIPIENTS } from "../../../../packages/shared/contracts/routing-rule.contracts";
import { QuotaLock, quotaLockKey } from "../routing/quota-lock";
import { RoutingAuditActions } from "../routing/routing-audit-actions";
import { RoutingLockTimeoutError, type AiRoutingSuggestionPort, type LeadQualityPort, type PartnerSlaPort, type PartnerSlaState, type RoutingLockPort } from "../routing/routing-controls.ports";
import type { RoutingRuleRecord } from "../routing/routing-rules.repository";
import { EMPTY_ROUTING_STATS, selectRoutingCandidates, type RoutingCandidate, type RoutingPartnerStats } from "../routing/routing-strategy";
import { BrokerEligibilityPolicy, describeEligibilityBlockers, type BrokerEligibilityResult } from "./broker-eligibility-policy";
import { LeadAssignmentService, type LeadAssignmentRecord } from "./lead-assignment.service";
import { RoutingDecisionService, type RoutingControlDetails, type RoutingDecisionRecord } from "./routing-decision.service";

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
  /**
   * Spec 067 COMP-009 / H2: every preferred broker, in priority order (the first one is the principal
   * and equals `preferredPartnerTenantId`). Built by the submission service from verified offers and
   * the eligible direct choice; at most `MAX_QUOTE_OFFERS` are considered. When present it wins over
   * the single `preferredPartnerTenantId`.
   */
  preferredPartnerTenantIds?: string[];
  /** Spec 067 H2: the preferred broker that comes from the visitor's direct choice (not from an offer). */
  chosenBrokerPartnerTenantId?: string;
}

/** Spec 052 R7: whether the broker of the selected offer was retained. */
export type SelectedOfferRoutingOutcome = "retained" | "unavailable" | "none";

/** Spec 052 R8: prefix of a consent naming one broker (`partner:<id>`). */
export const NAMED_PARTNER_CONSENT_PREFIX = "partner:";
/** Spec 067 COMP-009: prefix of a consent naming several brokers (`partners:<id1>,<id2>,<id3>`). */
export const NAMED_PARTNERS_CONSENT_PREFIX = "partners:";

/** Spec 067: the brokers a recorded consent names (`partner:` or `partners:`); empty for a category consent. */
export function consentNamedPartners(intendedRecipient: string | undefined): string[] {
  if (!intendedRecipient) return [];
  if (intendedRecipient.startsWith(NAMED_PARTNERS_CONSENT_PREFIX)) {
    return intendedRecipient.slice(NAMED_PARTNERS_CONSENT_PREFIX.length).split(",").map((id) => id.trim()).filter(Boolean);
  }
  if (intendedRecipient.startsWith(NAMED_PARTNER_CONSENT_PREFIX)) {
    const id = intendedRecipient.slice(NAMED_PARTNER_CONSENT_PREFIX.length).trim();
    return id ? [id] : [];
  }
  return [];
}

/** Spec 067: assignment and decision reason of a broker retained from the visitor's direct choice. */
export const CHOSEN_BROKER_REASON = "chosen_broker";
/** Spec 052 R7: assignment and decision reason of the broker of a selected offer. */
export const SELECTED_OFFER_PARTNER_REASON = "selected_offer_partner";

export interface QuoteRoutingResult {
  /** First recipient, kept for callers that only need one (notifications, confirmation copy). */
  assignment?: LeadAssignmentRecord;
  /** Every recipient. Single-send returns one element, so callers have a uniform shape. */
  assignments: LeadAssignmentRecord[];
  routingStatus: "assigned" | "no_broker_available" | "blocked" | "pending_manual_assignment";
  reasons: string[];
  /** Spec 052 R7: present when the request carried an accepted offer. */
  selectedOfferOutcome?: SelectedOfferRoutingOutcome;
  /** Spec 067: preferred brokers (offers, direct choice) that received the request through the preferred path. */
  retainedPartnerTenantIds?: string[];
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
  /** Lot 5 (spec 071, control 10): over-SLA brokers are ranked after the healthy ones (never excluded). */
  sla?: PartnerSlaPort | undefined;
  /** Lot 5 (spec 071, control 12, H3): below the threshold the request waits for an admin review. */
  leadQuality?: LeadQualityPort | undefined;
  /** Lot 5 (spec 071, mode `ai_assisted`): advisory suggester; absent or closed = plain manual parking. */
  aiRouting?: AiRoutingSuggestionPort | undefined;
  /** Lot 5 (spec 071, ROUTE-003): quota consumption lock; defaults to an in-process mutex. */
  lock?: RoutingLockPort | undefined;
}

/**
 * A broker that does not cover the request country or product has nothing to do with it: it is not
 * audited one by one (noise). Its license check fails for the same reason, so a "scope only" test
 * would never match; any scope miss is enough. It stays in `RoutingDecision.excludedCandidates`.
 */
const OUT_OF_SCOPE_EXCLUSIONS: ReadonlySet<string> = new Set(["partner_country_not_authorized", "partner_product_not_authorized"]);

/** A gate that throws is a closed gate (fail closed: no AI suggestion). */
function isOpen(gate: { isEnabled(): boolean }): boolean {
  try {
    return gate.isEnabled() === true;
  } catch {
    return false;
  }
}

/** Lot 5 (spec 071): state shared by `route()` and its body (lock release, timeout fallback). */
interface QuotaLockSession {
  release?: (() => Promise<void>) | undefined;
  candidateCount: number;
  excludedCandidates: Array<{ partnerTenantId: string; reasons: string[] }>;
}

/** Lot 5 (spec 071): outcome of control 12 for one request. */
interface LeadControls {
  details: RoutingControlDetails;
  belowThreshold: boolean;
}

/** Fields shared by every decision of one routing (count, exclusions, correlation, selected offer). */
interface ParkedDecisionBase {
  candidateCount: number;
  excludedCandidates: Array<{ partnerTenantId: string; reasons: string[] }>;
  correlation: { correlationId?: string };
  offerDecision: { selectedOfferId?: string; selectedOfferOutcome?: SelectedOfferRoutingOutcome };
  offerResult: { selectedOfferOutcome?: SelectedOfferRoutingOutcome };
}

export class QuoteRoutingService {
  constructor(
    private readonly eligibility: BrokerEligibilityPolicy,
    private readonly decisions: RoutingDecisionService,
    private readonly assignments: LeadAssignmentService,
    private readonly audit: AuditLogWriter,
    private readonly options: QuoteRoutingOptions = {}
  ) {}

  /** In-process fallback of `options.lock` (memory runtime and tests). */
  private readonly defaultLock = new QuotaLock();

  /**
   * Lot 5 (spec 071, ROUTE-003): wraps the routing so the quota lock taken in its body (after the
   * eligibility evaluation) is always released, and a lock timeout parks the request for an admin
   * instead of consuming a quota it could not protect.
   */
  async route(quote: RoutableQuoteRequest, actor: ActorContext): Promise<QuoteRoutingResult> {
    const session: QuotaLockSession = { candidateCount: 0, excludedCandidates: [] };
    try {
      return await this.routeWithin(session, quote, actor);
    } catch (error) {
      if (!(error instanceof RoutingLockTimeoutError)) throw error;
      return await this.parkOnLockTimeout(quote, session, error, actor);
    } finally {
      await session.release?.();
    }
  }

  private async routeWithin(session: QuotaLockSession, quote: RoutableQuoteRequest, actor: ActorContext): Promise<QuoteRoutingResult> {
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
    await this.lockQuotaAndRecheck(session, quote, candidates);
    this.auditExcluded(quote, candidates, actor);
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
    const controls = await this.evaluateLeadQuality(quote, actor);
    if (mode === "manual") {
      // A manual rule stays manual: the admin decides, the offer only travels with the decision.
      const reasons = offer.unavailable("manual_rule", ["manual_assignment_required"]);
      await this.decisions.record({ quoteRequestId: quote.id, result: "pending_manual_assignment", candidateCount: candidates.length, excludedCandidates, reasons, ...correlation, ...offer.decision, ...this.controlDetailsOf(controls, { parkedReasons: this.parkedReasons(controls, "manual_rule") }) }, actor);
      return { assignments: [], routingStatus: "pending_manual_assignment", reasons, ...offer.result };
    }
    // Lot 5 (spec 071): control 12 (H3, never an exclusion) and the `ai_assisted` mode both park the
    // request for an admin; the selected offer, if any, only travels with the decision.
    const parkedBase = (): ParkedDecisionBase => ({ candidateCount: candidates.length, excludedCandidates, correlation, offerDecision: offer.decision, offerResult: offer.result });
    if (controls.belowThreshold) {
      return this.park(quote, offer.unavailable("lead_quality_below_threshold", ["manual_assignment_required", "lead_quality_below_threshold"]), this.controlDetailsOf(controls, { parkedReasons: ["lead_quality_below_threshold"] }), parkedBase(), actor);
    }
    if (mode === "ai_assisted") return this.parkWithAiSuggestion(quote, eligible, controls, parkedBase, offer.unavailable.bind(offer), actor);

    // Spec 052 R7 / D-4: the broker of the selected offer is retained alone when the deterministic
    // eligibility accepts it (quota included), whatever the strategy.
    // Spec 067 COMP-009 / H2: with several preferred brokers (offers, direct choice), only those that
    // are eligible, compatible with an `exclusive` rule and named by the recorded consent are
    // retained, and only while `multi_broker_routing_enabled` is open; otherwise the first usable
    // preferred broker is retained alone. Never more than `MAX_QUOTE_OFFERS` recipients.
    if (offer.preferredIds.length > 0) {
      const retention = await this.retainPreferred(quote, offer.preferredIds, candidates, mode, rule, actor);
      if (retention.retained.length > 0) {
        const retained = retention.retained;
        const reasonOf = (partnerTenantId: string): string =>
          partnerTenantId === offer.chosenBroker ? CHOSEN_BROKER_REASON : SELECTED_OFFER_PARTNER_REASON;
        const reasons = [...new Set(retained.map(reasonOf)), ...retention.reasons];
        offer.retainedIds = retained;
        const decision = await this.decisions.record({
          quoteRequestId: quote.id,
          result: "assigned",
          selectedPartnerTenantId: retained[0] as string,
          selectedPartnerTenantIds: retained,
          candidateCount: candidates.length,
          excludedCandidates,
          reasons,
          ...correlation,
          ...offer.decision,
          ...this.controlDetailsOf(controls)
        }, actor);
        const assignments: LeadAssignmentRecord[] = [];
        for (const partnerTenantId of retained) {
          assignments.push(await this.assignments.create({
            quoteRequestId: quote.id,
            partnerTenantId,
            assignmentReason: reasonOf(partnerTenantId),
            routingDecisionId: decision.id,
            recipientCount: retained.length,
            ...this.assignmentScope(quote)
          }, actor));
        }
        return { assignment: assignments[0] as LeadAssignmentRecord, assignments, routingStatus: "assigned", reasons, ...offer.result, retainedPartnerTenantIds: retained };
      }
      offer.unavailableCode = retention.unavailableCode;
    }

    const now = new Date();
    const stats = await this.options.stats?.(eligible.map((candidate) => candidate.partner.id), now) ?? new Map<string, RoutingPartnerStats>();
    // Control 10: an exclusive rule names one broker, so its SLA cannot change the outcome.
    const degraded = mode === "exclusive" ? new Map<string, PartnerSlaState>() : await this.slaDegradation(quote, eligible, now, actor);
    const ranked: RoutingCandidate[] = eligible.map((candidate) => ({
      partnerTenantId: candidate.partner.id,
      quotaMonthlyLeads: candidate.partner.quotaMonthlyLeads,
      stats: stats.get(candidate.partner.id) ?? EMPTY_ROUTING_STATS,
      ...(degraded.has(candidate.partner.id) ? { degraded: true } : {})
    }));
    const rankingDetails = this.controlDetailsOf(controls, this.degradedDetails(degraded));
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
      await this.decisions.record({ quoteRequestId: quote.id, result: "no_broker_available", candidateCount: candidates.length, excludedCandidates, reasons, ...correlation, ...offer.decision, ...rankingDetails }, actor);
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
      ...offer.decision,
      ...rankingDetails
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
    // Spec 067: the explicit list (built from verified offers and the eligible direct choice) wins;
    // the legacy single field only counts when it is backed by an accepted offer (spec 052).
    const explicit = [...new Set((quote.preferredPartnerTenantIds ?? []).filter((id) => typeof id === "string" && id.length > 0))];
    const preferredIds = explicit.length > 0
      ? explicit.slice(0, MAX_QUOTE_OFFERS)
      : offerId && quote.preferredPartnerTenantId ? [quote.preferredPartnerTenantId] : [];
    const chosenBroker = quote.chosenBrokerPartnerTenantId && preferredIds.includes(quote.chosenBrokerPartnerTenantId) ? quote.chosenBrokerPartnerTenantId : undefined;
    // Broker of the selected offer: the first preferred broker that does not come from the direct choice.
    const offerPartner = offerId ? preferredIds.find((id) => id !== chosenBroker) : undefined;
    const state = {
      offerId,
      preferredIds,
      preferred: preferredIds[0],
      chosenBroker,
      retainedIds: [] as string[],
      unavailableCode: undefined as string | undefined,
      get outcome(): SelectedOfferRoutingOutcome | undefined {
        if (!offerId) return undefined;
        if (!offerPartner) return "none";
        return state.retainedIds.includes(offerPartner) ? "retained" : "unavailable";
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
   * Spec 052 R7 / Spec 067 COMP-009: which preferred brokers receive the request directly.
   * - a preferred broker is usable when the deterministic eligibility accepts it (quota included)
   *   and an `exclusive` rule does not name another partner;
   * - one usable broker is retained alone (spec 052 behaviour);
   * - several usable brokers are all retained (capped) only when the multi-broker flag is open AND
   *   the recorded consent names them (`partners:`); otherwise the request degrades, audited, to the
   *   first usable preferred broker alone. A consent is never widened by a later flag flip.
   * An empty `retained` means no preferred broker can be used: the standard routing applies.
   */
  private async retainPreferred(
    quote: RoutableQuoteRequest,
    preferredIds: readonly string[],
    candidates: Awaited<ReturnType<BrokerEligibilityPolicy["candidates"]>>,
    mode: string,
    rule: RoutingRuleRecord | undefined,
    actor: ActorContext
  ): Promise<{ retained: string[]; reasons: string[]; unavailableCode: string }> {
    const usable: string[] = [];
    const skipped: string[] = [];
    let unavailableCode: string | undefined;
    for (const partnerTenantId of preferredIds) {
      const candidate = candidates.find((item) => item.partner.id === partnerTenantId);
      const exclusiveConflict = mode === "exclusive" && rule?.exclusivePartnerTenantId !== partnerTenantId;
      if (candidate?.eligible && !exclusiveConflict) {
        usable.push(partnerTenantId);
        continue;
      }
      const code = exclusiveConflict ? "exclusive_rule" : candidate ? candidate.reasons[0] ?? "not_eligible" : "not_candidate";
      unavailableCode ??= code;
      skipped.push(`preferred_partner_skipped:${code}`);
    }
    // Spec 052: a single preferred broker keeps exactly the historical decision reasons.
    const skippedReasons = preferredIds.length > 1 ? skipped : [];
    if (usable.length <= 1) return { retained: usable, reasons: skippedReasons, unavailableCode: unavailableCode ?? "not_candidate" };

    const degrade = (reason: string): { retained: string[]; reasons: string[]; unavailableCode: string } => {
      this.audit.write({
        actor,
        action: QuoteAuditActions.routingEvaluated,
        targetType: "QuoteRequest",
        targetId: quote.id,
        scope: { countryId: quote.countryId, productId: quote.productId },
        result: "success",
        reason,
        context: { mode, degradedToSingleBroker: true, preferredPartnerCount: usable.length }
      });
      return { retained: [usable[0] as string], reasons: [...skippedReasons, reason], unavailableCode: unavailableCode ?? "not_candidate" };
    };
    if (!this.options.multiBroker?.isEnabled()) return degrade("multi_broker_routing_disabled");
    const consent = await this.options.consent?.findRecord(quote.consentRecordId);
    const named = consent?.intendedRecipient?.startsWith(NAMED_PARTNERS_CONSENT_PREFIX) ? new Set(consentNamedPartners(consent.intendedRecipient)) : new Set<string>();
    const covered = usable.filter((partnerTenantId) => named.has(partnerTenantId));
    if (covered.length <= 1) return degrade("consent_covers_single_broker");
    const notCovered = usable.filter((partnerTenantId) => !named.has(partnerTenantId)).map(() => "preferred_partner_skipped:consent_not_covering");
    return { retained: covered.slice(0, MAX_QUOTE_OFFERS), reasons: [...skippedReasons, ...notCovered], unavailableCode: unavailableCode ?? "not_candidate" };
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

  private lockPort(): RoutingLockPort {
    return this.options.lock ?? this.defaultLock;
  }

  /**
   * Lot 5 (spec 071, ROUTE-003): locks the quota of every eligible broker that has one (sorted keys,
   * hence no deadlock between two routings) and re-checks it under the lock, because a concurrent
   * routing may have consumed the last lead since the eligibility evaluation. A broker exhausted
   * under the lock becomes an excluded candidate, so the ranking moves on to the next one (or ends
   * with no_broker_available). The lock is held until `route()` returns, i.e. after the assignments.
   */
  private async lockQuotaAndRecheck(session: QuotaLockSession, quote: RoutableQuoteRequest, candidates: BrokerEligibilityResult[]): Promise<void> {
    session.candidateCount = candidates.length;
    session.excludedCandidates = candidates.filter((candidate) => !candidate.eligible).map((candidate) => ({ partnerTenantId: candidate.partner.id, reasons: candidate.reasons }));
    const bounded = candidates.filter((candidate) => candidate.eligible && candidate.partner.quotaMonthlyLeads > 0);
    if (bounded.length === 0) return;
    session.release = await this.lockPort().acquire(bounded.map((candidate) => quotaLockKey(candidate.partner.id)));
    for (const candidate of bounded) {
      candidates[candidates.indexOf(candidate)] = await this.eligibility.recheckQuota(candidate);
    }
  }

  /**
   * Lot 5 (spec 071, ROUTE-008): one `routing.broker_excluded` event per excluded broker, with its
   * reasons. Brokers that do not cover the request country/product are not audited: they have
   * nothing to do with this request and would flood the journal at each routing.
   */
  private auditExcluded(quote: RoutableQuoteRequest, candidates: BrokerEligibilityResult[], actor: ActorContext): void {
    for (const candidate of candidates) {
      if (candidate.eligible || candidate.reasons.some((reason) => OUT_OF_SCOPE_EXCLUSIONS.has(reason))) continue;
      this.audit.write({
        actor,
        action: QuoteAuditActions.routingBrokerExcluded,
        targetType: "PartnerTenant",
        targetId: candidate.partner.id,
        scope: { quoteRequestId: quote.id, countryId: quote.countryId, productId: quote.productId, partnerTenantId: candidate.partner.id },
        result: "refused",
        reason: describeEligibilityBlockers(candidate.reasons),
        context: { reasons: candidate.reasons, ...(quote.correlationId ? { correlationId: quote.correlationId } : {}) }
      });
    }
  }

  /**
   * Lot 5 (spec 071, PRD 17 control 12, hypothesis H3): deterministic lead quality score. Below the
   * threshold the request is parked for an admin review; it is never excluded. A score that cannot be
   * computed also sends the request to review (fail safe: a human looks at it).
   */
  private async evaluateLeadQuality(quote: RoutableQuoteRequest, actor: ActorContext): Promise<LeadControls> {
    const port = this.options.leadQuality;
    if (!port || !(port.threshold > 0)) return { details: {}, belowThreshold: false };
    const evaluation = await port.evaluate({ id: quote.id, payload: quote.payload, consentRecordId: quote.consentRecordId }).catch(() => undefined);
    const details: RoutingControlDetails = evaluation
      ? { qualityScore: Math.min(100, Math.max(0, Math.round(evaluation.score))), qualityFactors: evaluation.factors, qualityThreshold: port.threshold }
      : { qualityThreshold: port.threshold };
    const belowThreshold = details.qualityScore === undefined || details.qualityScore < port.threshold;
    if (belowThreshold) {
      this.audit.write({
        actor,
        action: RoutingAuditActions.leadQualityReview,
        targetType: "QuoteRequest",
        targetId: quote.id,
        scope: { countryId: quote.countryId, productId: quote.productId },
        result: "success",
        reason: evaluation ? "lead_quality_below_threshold" : "lead_quality_unavailable",
        context: { qualityScore: details.qualityScore ?? null, qualityThreshold: port.threshold, qualityFactors: details.qualityFactors ?? [] }
      });
    }
    return { details, belowThreshold };
  }

  /**
   * Lot 5 (spec 071, PRD 17 control 10): brokers holding untouched leads beyond their SLA. They stay
   * eligible and are only ranked after the healthy ones. A failing SLA lookup degrades nobody.
   */
  private async slaDegradation(quote: RoutableQuoteRequest, eligible: BrokerEligibilityResult[], now: Date, actor: ActorContext): Promise<Map<string, PartnerSlaState>> {
    if (!this.options.sla || eligible.length === 0) return new Map();
    const states = await this.options.sla(eligible.map((candidate) => candidate.partner.id), now).catch(() => new Map<string, PartnerSlaState>());
    const degraded = new Map([...states].filter(([, state]) => state.overrunCount > 0));
    for (const [partnerTenantId, state] of degraded) {
      this.audit.write({
        actor,
        action: RoutingAuditActions.brokerDegraded,
        targetType: "PartnerTenant",
        targetId: partnerTenantId,
        scope: { quoteRequestId: quote.id, countryId: quote.countryId, productId: quote.productId, partnerTenantId },
        result: "success",
        reason: "sla_overrun",
        context: { overrunCount: state.overrunCount, oldestOverrunMinutes: state.oldestOverrunMinutes ?? null }
      });
    }
    return degraded;
  }

  private degradedDetails(degraded: Map<string, PartnerSlaState>): RoutingControlDetails {
    if (degraded.size === 0) return {};
    return {
      degradedCandidates: [...degraded].map(([partnerTenantId, state]) => ({
        partnerTenantId,
        overrunCount: state.overrunCount,
        ...(state.oldestOverrunMinutes !== undefined ? { oldestOverrunMinutes: state.oldestOverrunMinutes } : {})
      }))
    };
  }

  private parkedReasons(controls: LeadControls, primary: string): string[] {
    return controls.belowThreshold ? [primary, "lead_quality_below_threshold"] : [primary];
  }

  private controlDetailsOf(controls: LeadControls, extra: RoutingControlDetails = {}): { controlDetails?: RoutingControlDetails } {
    const details: RoutingControlDetails = { ...controls.details, ...extra };
    return Object.keys(details).length > 0 ? { controlDetails: details } : {};
  }

  private async park(quote: RoutableQuoteRequest, reasons: string[], details: { controlDetails?: RoutingControlDetails }, base: ParkedDecisionBase, actor: ActorContext): Promise<QuoteRoutingResult> {
    await this.decisions.record({
      quoteRequestId: quote.id,
      result: "pending_manual_assignment",
      candidateCount: base.candidateCount,
      excludedCandidates: base.excludedCandidates,
      reasons,
      ...base.correlation,
      ...base.offerDecision,
      ...details
    }, actor);
    return { assignments: [], routingStatus: "pending_manual_assignment", reasons, ...base.offerResult };
  }

  /**
   * Lot 5 (spec 071, PRD 32.8, constitution V/VII): the `ai_assisted` mode NEVER assigns. The
   * request is parked for manual assignment with, when the flag is open, ONE suggested broker among
   * the deterministic eligible ones. The suggester receives no personal data (scope ids and broker
   * statistics only). A suggestion naming a non-eligible broker is ignored. Flag closed (default):
   * plain manual parking with `ai_assisted_routing_disabled`, no suggestion.
   */
  private async parkWithAiSuggestion(
    quote: RoutableQuoteRequest,
    eligible: BrokerEligibilityResult[],
    controls: LeadControls,
    base: () => ParkedDecisionBase,
    unavailable: (code: string | undefined, reasons: string[]) => string[],
    actor: ActorContext
  ): Promise<QuoteRoutingResult> {
    const ai = this.options.aiRouting;
    if (!ai || !isOpen(ai)) {
      return this.park(quote, unavailable("ai_assisted_rule", ["manual_assignment_required", "ai_assisted_routing_disabled"]), this.controlDetailsOf(controls, { parkedReasons: this.parkedReasons(controls, "ai_assisted_routing_disabled") }), base(), actor);
    }
    const now = new Date();
    const ids = eligible.map((candidate) => candidate.partner.id);
    const stats = await this.options.stats?.(ids, now) ?? new Map<string, RoutingPartnerStats>();
    const degraded = await this.slaDegradation(quote, eligible, now, actor);
    const suggestion = await ai.suggest({
      quote: { id: quote.id, countryId: quote.countryId, productId: quote.productId },
      candidates: eligible.map((candidate) => {
        const partnerStats = stats.get(candidate.partner.id) ?? EMPTY_ROUTING_STATS;
        return {
          partnerTenantId: candidate.partner.id,
          quotaMonthlyLeads: candidate.partner.quotaMonthlyLeads,
          monthlyCount: partnerStats.monthlyCount,
          acceptanceRate90d: partnerStats.received90d > 0 ? partnerStats.accepted90d / partnerStats.received90d : null,
          averageFirstActionMinutes: partnerStats.averageFirstActionMinutes ?? null,
          slaDegraded: degraded.has(candidate.partner.id)
        };
      })
    }).catch(() => undefined);
    const valid = suggestion && ids.includes(suggestion.partnerTenantId) ? suggestion : undefined;
    if (suggestion) {
      this.audit.write({
        actor,
        action: RoutingAuditActions.aiSuggestionGenerated,
        targetType: "QuoteRequest",
        targetId: quote.id,
        scope: { countryId: quote.countryId, productId: quote.productId, partnerTenantId: suggestion.partnerTenantId },
        result: valid ? "success" : "refused",
        reason: valid ? "ai_suggestion_pending" : "suggestion_not_eligible",
        // Metadata only: no personal data, no rationale text.
        context: { mode: "ai_assisted", assistance: true, provider: suggestion.provider, candidateCount: ids.length, applied: false }
      });
    }
    const parkedReason = valid ? "ai_suggestion_pending" : "ai_suggestion_unavailable";
    const details: RoutingControlDetails = {
      ...this.degradedDetails(degraded),
      parkedReasons: this.parkedReasons(controls, parkedReason),
      ...(valid ? { aiSuggestion: { partnerTenantId: valid.partnerTenantId, rationale: valid.rationale.slice(0, 1000), provider: valid.provider, generatedAt: new Date(valid.generatedAt).toISOString() } } : {})
    };
    return this.park(quote, unavailable("ai_assisted_rule", ["manual_assignment_required", parkedReason]), this.controlDetailsOf(controls, details), base(), actor);
  }

  private auditLockTimeout(quote: RoutableQuoteRequest, error: RoutingLockTimeoutError, actor: ActorContext): void {
    this.audit.write({
      actor,
      action: RoutingAuditActions.quotaLockTimeout,
      targetType: "QuoteRequest",
      targetId: quote.id,
      // The lock key is the broker id: kept in the scope (the audit context masks identifiers).
      scope: { countryId: quote.countryId, productId: quote.productId, partnerTenantId: error.key },
      result: "failed",
      reason: "quota_lock_timeout",
      context: {}
    });
  }

  /**
   * Lot 5 (spec 071): the quota lock could not be taken in time. Nothing is assigned (a quota that
   * cannot be protected is never consumed); the request waits for an admin in the manual queue.
   */
  private async parkOnLockTimeout(quote: RoutableQuoteRequest, session: QuotaLockSession, error: RoutingLockTimeoutError, actor: ActorContext): Promise<QuoteRoutingResult> {
    this.auditLockTimeout(quote, error, actor);
    const reasons = ["manual_assignment_required", "quota_lock_timeout"];
    const decision: Omit<RoutingDecisionRecord, "id" | "createdAt"> = {
      quoteRequestId: quote.id,
      result: "pending_manual_assignment",
      candidateCount: session.candidateCount,
      excludedCandidates: session.excludedCandidates,
      reasons,
      ...(quote.correlationId ? { correlationId: quote.correlationId } : {}),
      controlDetails: { parkedReasons: ["quota_lock_timeout"] }
    };
    await this.decisions.record(decision, actor);
    return { assignments: [], routingStatus: "pending_manual_assignment", reasons };
  }

  /**
   * Admin-driven assignment of a quote parked by a `manual` rule. The same eligibility policy
   * gates the target partner; the admin only chooses among eligible brokers.
   */
  async assignManually(quote: RoutableQuoteRequest, partnerTenantId: string, actor: ActorContext, reason: string): Promise<LeadAssignmentRecord> {
    // Lot 5 (spec 071, ROUTE-003): the admin path consumes the same quota, under the same lock.
    let release: (() => Promise<void>) | undefined;
    try {
      release = await this.lockPort().acquire([quotaLockKey(partnerTenantId)]);
    } catch (error) {
      if (error instanceof RoutingLockTimeoutError) this.auditLockTimeout(quote, error, actor);
      throw error;
    }
    try {
      return await this.assignManuallyWithin(quote, partnerTenantId, actor, reason);
    } finally {
      await release();
    }
  }

  private async assignManuallyWithin(quote: RoutableQuoteRequest, partnerTenantId: string, actor: ActorContext, reason: string): Promise<LeadAssignmentRecord> {
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
