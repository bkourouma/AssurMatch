import type { LeadReassignRequest, LeadReassignResponse } from "../../../../packages/shared/contracts/routing-rule.contracts";
import { leadReassignRequestSchema } from "../../../../packages/shared/contracts/routing-rule.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import { describeEligibilityBlockers, type BrokerEligibilityPolicy } from "../leads/broker-eligibility-policy";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../leads/lead-assignment.service";
import type { RoutingDecisionService } from "../leads/routing-decision.service";
import type { ProductsService } from "../products/products.module";
import { RoutingAuditActions } from "./routing-audit-actions";

export class LeadReassignmentAccessRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(`Lead reassignment access denied: ${reason}`);
    this.name = "LeadReassignmentAccessRefusedError";
  }
}

export class LeadReassignmentConflictError extends Error {
  constructor(public readonly reason: string) {
    super(`Lead reassignment conflict: ${reason}`);
    this.name = "LeadReassignmentConflictError";
  }
}

export interface LeadReassignmentDeps {
  audit: AuditLogWriter;
  assignments: LeadAssignmentService;
  eligibility: BrokerEligibilityPolicy;
  decisions: RoutingDecisionService;
  countries: CountriesService;
  products: ProductsService;
  /** Re-notifies the new partner; returns the notification id when one was queued. */
  notifyBroker?: (assignment: LeadAssignmentRecord, actor: ActorContext) => Promise<string | undefined>;
}

/** ROUTE-007: admin reassignment of an existing lead to another eligible partner. */
export class LeadReassignmentService {
  constructor(private readonly deps: LeadReassignmentDeps) {}

  async reassign(actor: ActorContext, assignmentId: string, input: LeadReassignRequest): Promise<LeadReassignResponse> {
    this.assertPermission(actor);
    const parsed = leadReassignRequestSchema.parse(input);
    const assignment = await this.deps.assignments.require(assignmentId);
    const previousPartnerTenantId = assignment.partnerTenantId;
    if (previousPartnerTenantId === parsed.partnerTenantId) this.refuse(actor, assignmentId, "same_partner", "conflict");
    const country = assignment.countryCode ? await this.deps.countries.findByIsoCode(assignment.countryCode) : undefined;
    const product = assignment.productKey ? await this.deps.products.findByKey(assignment.productKey) : undefined;
    if (!country || !product) throw new Error("Invalid reassignment: scope_unresolved");
    if (!this.scopeAllows(actor, country.id, country.isoCode)) this.refuse(actor, assignmentId, "out_of_scope_country");
    const evaluation = await this.deps.eligibility.evaluate(parsed.partnerTenantId, country.id, product.id);
    if (!evaluation.eligible) {
      this.deps.audit.write({
        actor,
        action: RoutingAuditActions.reassignmentRefused,
        targetType: "LeadAssignment",
        targetId: assignmentId,
        scope: { partnerTenantId: parsed.partnerTenantId, countryId: country.id, productId: product.id },
        result: "refused",
        reason: evaluation.reasons.join(","),
        context: {}
      });
      throw new Error(`Partner not eligible: ${describeEligibilityBlockers(evaluation.reasons)}`);
    }
    const decision = await this.deps.decisions.record({
      quoteRequestId: assignment.quoteRequestId,
      result: "assigned",
      selectedPartnerTenantId: parsed.partnerTenantId,
      candidateCount: 1,
      excludedCandidates: [{ partnerTenantId: previousPartnerTenantId, reasons: ["admin_reassigned_away"] }],
      reasons: ["admin_reassigned"]
    }, actor);
    const updated = await this.deps.assignments.reassign(assignmentId, {
      partnerTenantId: parsed.partnerTenantId,
      routingDecisionId: decision.id,
      reason: parsed.reason,
      previousPartnerTenantId
    }, actor);
    const notificationId = await this.deps.notifyBroker?.(updated, actor);
    if (notificationId) await this.deps.assignments.setBrokerNotification(updated.id, notificationId);
    this.deps.audit.write({
      actor,
      action: RoutingAuditActions.reassigned,
      targetType: "LeadAssignment",
      targetId: assignmentId,
      scope: { partnerTenantId: parsed.partnerTenantId, previousPartnerTenantId, countryId: country.id, productId: product.id },
      result: "success",
      reason: parsed.reason,
      context: { routingDecisionId: decision.id, notified: Boolean(notificationId) }
    });
    return {
      assignmentId: updated.id,
      quoteRequestId: updated.quoteRequestId,
      previousPartnerTenantId,
      partnerTenantId: updated.partnerTenantId,
      status: notificationId ? "broker_notified" : updated.status,
      assignedAt: updated.assignedAt.toISOString()
    };
  }

  private assertPermission(actor: ActorContext): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "access", "mfa_required");
    if (!actor.roles.some((role) => roleHasPermission(role, "lead_assignments:update"))) this.refuse(actor, "access", "forbidden_role");
  }

  private scopeAllows(actor: ActorContext, countryId: string, isoCode: string): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (!actor.countryScopes?.length) return true;
    return actor.countryScopes.includes(countryId) || actor.countryScopes.includes(isoCode);
  }

  private refuse(actor: ActorContext, targetId: string, reason: string, kind: "access" | "conflict" = "access"): never {
    this.deps.audit.write({
      actor,
      action: RoutingAuditActions.reassignmentRefused,
      targetType: "LeadAssignment",
      targetId,
      scope: { roles: actor.roles },
      result: "refused",
      reason,
      context: {}
    });
    if (kind === "conflict") throw new LeadReassignmentConflictError(reason);
    throw new LeadReassignmentAccessRefusedError(reason);
  }
}
