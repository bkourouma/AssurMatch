import type { ManualAssignRequest, ManualAssignResponse, PendingManualQueueResponse, PendingManualQuote } from "../../../../packages/shared/contracts/routing-rule.contracts";
import { manualAssignRequestSchema } from "../../../../packages/shared/contracts/routing-rule.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { BrokerEligibilityPolicy } from "../leads/broker-eligibility-policy";
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
          reasons: candidate.reasons
        }))
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
