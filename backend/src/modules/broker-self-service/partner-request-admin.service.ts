import {
  adminPartnerRequestListQuerySchema,
  partnerRequestDecisionSchema,
  type PartnerChangeRequestView
} from "../../../../packages/shared/contracts/broker-self-service.contracts";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import type { PartnerAdminService } from "../partners/partner-admin.service";
import { partnerConflict, partnerForbidden, partnerNotFound } from "../partners/partner-errors";
import type { PartnersService } from "../partners/partners.module";
import { toRequestView } from "./broker-account.service";
import type { PartnerChangeRequestsRepository } from "./partner-change-requests.repository";

export interface PartnerRequestAdminServiceDeps {
  audit: AuditLogWriter;
  partners: Pick<PartnersService, "find">;
  partnerAdmin: Pick<PartnerAdminService, "inCountryScope" | "update" | "authorizeCountry" | "authorizeProduct">;
  requests: PartnerChangeRequestsRepository;
}

export const PartnerRequestAdminAuditActions = {
  readRefused: "partner_request.read_refused",
  accepted: "partner_request.accepted",
  rejected: "partner_request.rejected",
  decisionRefused: "partner_request.decision_refused"
} as const;

/**
 * Spec 053 FR-004 / FR-013: the admin side of the broker requests. Reads need `partners:read` and
 * decisions `partners:update`, both within the country scope of the partner (Admin Pays). Accepting
 * applies the change through `PartnerAdminService` (spec 051), so the RBAC, the RCCM duplicate rule,
 * the retired guard and the "licence required for a country" rule stay in one place; a refusal
 * there leaves the request pending. A request is decided exactly once.
 */
export class PartnerRequestAdminService {
  private readonly rbac = new RbacGuard();

  constructor(private readonly deps: PartnerRequestAdminServiceDeps) {}

  async list(actor: ActorContext, query: unknown = {}): Promise<PartnerChangeRequestView[]> {
    const filters = adminPartnerRequestListQuerySchema.parse(query ?? {});
    if (!this.rbac.can(actor, "partners:read") || actor.partnerTenantId) {
      this.refuse(actor, PartnerRequestAdminAuditActions.readRefused, filters.partnerTenantId ?? "list", "rbac_denied");
      throw partnerForbidden();
    }
    const countryOf = new Map<string, string | undefined>();
    const views: PartnerChangeRequestView[] = [];
    for (const request of await this.deps.requests.list(filters)) {
      if (!countryOf.has(request.partnerTenantId)) countryOf.set(request.partnerTenantId, (await this.deps.partners.find(request.partnerTenantId))?.countryId);
      if (!this.deps.partnerAdmin.inCountryScope(actor, countryOf.get(request.partnerTenantId))) continue;
      views.push(toRequestView(request));
    }
    // Pending first, then newest first.
    return views.sort((left, right) => Number(right.status === "pending") - Number(left.status === "pending") || right.createdAt.localeCompare(left.createdAt));
  }

  async decide(actor: ActorContext, requestId: string, input: unknown): Promise<PartnerChangeRequestView> {
    const { decision, reason } = partnerRequestDecisionSchema.parse(input);
    const request = await this.deps.requests.find(requestId);
    if (!request) throw partnerNotFound("Request not found");
    const partner = await this.deps.partners.find(request.partnerTenantId);
    if (!partner) throw partnerNotFound("Partner not found");
    if (!this.rbac.can(actor, "partners:update") || actor.partnerTenantId || !this.deps.partnerAdmin.inCountryScope(actor, partner.countryId)) {
      this.refuse(actor, PartnerRequestAdminAuditActions.decisionRefused, request.id, "rbac_denied", { decision, requestReason: reason }, partner.countryId);
      throw partnerForbidden();
    }
    if (request.status !== "pending") {
      this.refuse(actor, PartnerRequestAdminAuditActions.decisionRefused, request.id, "already_decided", { decision, status: request.status }, partner.countryId);
      throw partnerConflict("The request has already been decided", ErrorCodes.PARTNER_REQUEST_ALREADY_DECIDED);
    }
    if (decision === "accepted") await this.apply(actor, request.partnerTenantId, request.type, request.requestedChanges, `request ${request.id}: ${reason}`);
    const closed = await this.deps.requests.close(request.id, { status: decision, decidedById: actor.actorId ?? null, decidedAt: new Date(), decisionReason: reason });
    if (!closed) {
      this.refuse(actor, PartnerRequestAdminAuditActions.decisionRefused, request.id, "already_decided", { decision }, partner.countryId);
      throw partnerConflict("The request has already been decided", ErrorCodes.PARTNER_REQUEST_ALREADY_DECIDED);
    }
    this.deps.audit.write({
      actor,
      action: decision === "accepted" ? PartnerRequestAdminAuditActions.accepted : PartnerRequestAdminAuditActions.rejected,
      targetType: "PartnerChangeRequest",
      targetId: request.id,
      scope: { partnerTenantId: request.partnerTenantId, ...(partner.countryId ? { countryId: partner.countryId } : {}) },
      result: "success",
      reason,
      context: { type: request.type, requestedFields: Object.keys(request.requestedChanges), before: { status: "pending" }, after: { status: decision } }
    });
    return toRequestView(closed);
  }

  /** The 051 service re-checks the actor and the business rules; its refusals propagate unchanged. */
  private async apply(actor: ActorContext, partnerTenantId: string, type: string, changes: Record<string, string>, reason: string): Promise<void> {
    if (type === "profile_change") {
      await this.deps.partnerAdmin.update(actor, partnerTenantId, { ...changes, reason });
      return;
    }
    if (changes.countryId) {
      await this.deps.partnerAdmin.authorizeCountry(actor, partnerTenantId, { countryId: changes.countryId, reason });
      return;
    }
    if (changes.productId) await this.deps.partnerAdmin.authorizeProduct(actor, partnerTenantId, { productId: changes.productId, reason });
  }

  private refuse(actor: ActorContext, action: string, targetId: string, refusal: string, context: Record<string, unknown> = {}, countryId?: string): void {
    this.deps.audit.write({
      actor,
      action,
      targetType: "PartnerChangeRequest",
      targetId,
      scope: countryId ? { countryId } : {},
      result: "refused",
      reason: refusal,
      context
    });
  }
}
