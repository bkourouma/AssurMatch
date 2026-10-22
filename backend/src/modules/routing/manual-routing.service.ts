import type { ManualAssignRequest, ManualAssignResponse, PendingManualQueueResponse, PendingManualQuote } from "../../../../packages/shared/contracts/routing-rule.contracts";
import { manualAssignRequestSchema } from "../../../../packages/shared/contracts/routing-rule.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { BrokerEligibilityPolicy } from "../leads/broker-eligibility-policy";
import type { RoutingDecisionRecord } from "../leads/routing-decision.service";
import type { QuoteSubmissionService } from "../quote-requests/quote-submission.service";
import { RoutingAuditActions } from "./routing-audit-actions";

export class ManualRoutingAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Manual routing access denied: ${reason}`);
    this.name = "ManualRoutingAccessRefusedError";
  }
}

export interface ManualRoutingDeps {
  audit: AuditLogWriter;
  submissions: QuoteSubmissionService;
  eligibility: BrokerEligibilityPolicy;
  countries: CountriesService;
  /** Post-assignment hook (e.g. share visitor documents uploaded while the quote was parked). */
  afterAssign?: ((quoteRequestId: string, assignmentId: string) => Promise<void>) | undefined;
  /**
   * Lot 5 (spec 071): latest routing decision of a parked request (parked reasons, lead quality score,
   * AI suggestion). Optional: without it the queue shows no control details and no AI audit is written.
   */
  decisions?: { latestForQuote(quoteRequestId: string): Promise<RoutingDecisionRecord | undefined> } | undefined;
}

/** Lot 5 (spec 071): the AI suggestion stored on a decision, when it names a broker. */
function suggestionOf(decision: RoutingDecisionRecord | undefined): PendingManualQuote["aiSuggestion"] {
  const suggestion = decision?.controlDetails?.aiSuggestion;
  return suggestion?.partnerTenantId ? suggestion : null;
}

/** Admin queue for quotes parked by a `manual` routing rule. */
export class ManualRoutingService {
  constructor(private readonly deps: ManualRoutingDeps) {}

  async queue(actor: ActorContext): Promise<PendingManualQueueResponse> {
    this.assertPermission(actor, "lead_assignments:read");
    const countries = await this.deps.countries.listAdmin();
    const pending = (await this.deps.submissions.listPendingManual())
      .filter((quote) => this.scopeAllows(actor, quote.countryId, countries.find((country) => country.id === quote.countryId)?.isoCode));
    const items: PendingManualQuote[] = [];
    for (const quote of pending) {
      const candidates = await this.deps.eligibility.candidates(quote.countryId, quote.productId);
      const decision = await this.latestDecision(quote.id);
      const details = decision?.controlDetails;
      const degraded = new Set((details?.degradedCandidates ?? []).map((entry) => entry.partnerTenantId));
      const qualityScore = details?.qualityScore;
      items.push({
        quoteRequestId: quote.id,
        publicReference: quote.publicReference,
        countryId: quote.countryId,
        countryCode: quote.countryCode,
        productId: quote.productId,
        productKey: quote.productKey,
        createdAt: quote.createdAt.toISOString(),
        candidates: candidates.map((candidate) => ({
          partnerTenantId: candidate.partner.id,
          legalName: candidate.partner.legalName,
          plan: candidate.partner.plan,
          eligible: candidate.eligible,
          // Control 10: an over-SLA broker stays eligible; the reason only explains its ranking.
          reasons: degraded.has(candidate.partner.id) ? [...candidate.reasons, "sla_overrun"] : candidate.reasons
        })),
        parkedReasons: details?.parkedReasons ?? [],
        qualityScore: typeof qualityScore === "number" ? Math.min(100, Math.max(0, Math.round(qualityScore))) : null,
        aiSuggestion: suggestionOf(decision)
      });
    }
    this.deps.audit.write({
      actor,
      action: RoutingAuditActions.manualQueueRead,
      targetType: "RoutingManualQueue",
      targetId: "pending",
      result: "success",
      context: { total: items.length }
    });
    return { generatedAt: new Date().toISOString(), items, total: items.length };
  }

  async assign(actor: ActorContext, quoteRequestId: string, input: ManualAssignRequest): Promise<ManualAssignResponse> {
    this.assertPermission(actor, "lead_assignments:update");
    const parsed = manualAssignRequestSchema.parse(input);
    const quote = await this.deps.submissions.findById(quoteRequestId);
    if (!quote) throw new Error(`Quote request ${quoteRequestId} not found`);
    const country = await this.deps.countries.require(quote.countryId).catch(() => undefined);
    if (!this.scopeAllows(actor, quote.countryId, country?.isoCode)) this.refuse(actor, "out_of_scope_country", quoteRequestId);
    // Read BEFORE the assignment: assigning records a newer decision without the suggestion.
    const suggestion = suggestionOf(await this.latestDecision(quoteRequestId));
    try {
      const result = await this.deps.submissions.assignManually(quoteRequestId, parsed.partnerTenantId, actor, parsed.reason);
      await this.deps.afterAssign?.(quoteRequestId, result.assignmentId);
      this.deps.audit.write({
        actor,
        action: RoutingAuditActions.manualAssigned,
        targetType: "QuoteRequest",
        targetId: quoteRequestId,
        scope: { partnerTenantId: parsed.partnerTenantId, countryId: quote.countryId, productId: quote.productId },
        result: "success",
        reason: parsed.reason,
        context: { assignmentId: result.assignmentId }
      });
      if (suggestion) this.auditAiOutcome(actor, quoteRequestId, suggestion, parsed.partnerTenantId, result.assignmentId);
      return result;
    } catch (error) {
      this.deps.audit.write({
        actor,
        action: RoutingAuditActions.manualAssignmentRefused,
        targetType: "QuoteRequest",
        targetId: quoteRequestId,
        scope: { partnerTenantId: parsed.partnerTenantId },
        result: "refused",
        reason: error instanceof Error ? error.message.slice(0, 200) : "manual_assignment_failed",
        context: {}
      });
      throw error;
    }
  }

  private async latestDecision(quoteRequestId: string): Promise<RoutingDecisionRecord | undefined> {
    return this.deps.decisions?.latestForQuote(quoteRequestId).catch(() => undefined);
  }

  /**
   * Lot 5 (spec 071, PRD 31 "suggestion IA acceptée/refusée"): the admin decision on an AI routing
   * suggestion. Validated when the chosen broker is the suggested one, diverged otherwise. Metadata only.
   */
  private auditAiOutcome(actor: ActorContext, quoteRequestId: string, suggestion: NonNullable<PendingManualQuote["aiSuggestion"]>, chosenPartnerTenantId: string, assignmentId: string): void {
    const validated = suggestion.partnerTenantId === chosenPartnerTenantId;
    this.deps.audit.write({
      actor,
      action: validated ? RoutingAuditActions.aiSuggestionValidated : RoutingAuditActions.aiSuggestionDiverged,
      targetType: "QuoteRequest",
      targetId: quoteRequestId,
      // Broker ids in the scope: the audit context masks identifiers.
      scope: { partnerTenantId: chosenPartnerTenantId, suggestedPartnerTenantId: suggestion.partnerTenantId },
      result: "success",
      reason: validated ? "admin_followed_ai_suggestion" : "admin_chose_another_broker",
      context: { assistance: true, provider: suggestion.provider, assignmentId }
    });
  }

  private assertPermission(actor: ActorContext, permission: string): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required", "access");
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuse(actor, "forbidden_role", "access");
  }

  private scopeAllows(actor: ActorContext, countryId: string, isoCode: string | undefined): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (!actor.countryScopes?.length) return true;
    return actor.countryScopes.includes(countryId) || (isoCode !== undefined && actor.countryScopes.includes(isoCode));
  }

  private refuse(actor: ActorContext, reason: string, targetId: string): never {
    this.deps.audit.write({
      actor,
      action: RoutingAuditActions.manualAssignmentRefused,
      targetType: "RoutingManualQueue",
      targetId,
      scope: { roles: actor.roles },
      result: "refused",
      reason,
      context: {}
    });
    throw new ManualRoutingAccessRefusedError(reason);
  }
}
