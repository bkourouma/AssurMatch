import { partnerCreateSchema, type PartnerDto, type PartnerRecord, type PartnerStatus } from "../../../../packages/shared/contracts/partner.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { isActivePartnerStatus } from "./partner-lifecycle";
import {
  MemoryPartnersRepository,
  type AuthorizationKind,
  type PartnerAuthorizationRecord,
  type PartnerContractRecord,
  type PartnerStatusHistoryRecord,
  type PartnersRepository
} from "./partners.repository";

export interface PartnerTenant extends PartnerRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

/** Listener notified after any change of a partner's status, identity or coverage (caches, tenant guard). */
export type PartnerChangeListener = (partnerTenantId: string) => void | Promise<void>;

export class PartnersService {
  private readonly listeners = new Set<PartnerChangeListener>();

  constructor(private readonly audit: AuditLogWriter, private readonly repository: PartnersRepository = new MemoryPartnersRepository()) {}

  /** Spec 051 R12: lot B registers the tenant-status cache invalidation here. */
  onChange(listener: PartnerChangeListener): void {
    this.listeners.add(listener);
  }

  async create(input: PartnerDto, actor: ActorContext, reason?: string): Promise<PartnerTenant> {
    const parsed = partnerCreateSchema.parse(input);
    const now = new Date();
    const partner: PartnerTenant = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      ...(actor.actorId ? { createdById: actor.actorId } : {}),
      createdAt: now,
      updatedAt: now
    };
    await this.repository.create(partner);
    await this.repository.addStatusHistory({
      id: crypto.randomUUID(),
      partnerTenantId: partner.id,
      fromStatus: null,
      toStatus: partner.status,
      reason: reason ?? "partner created",
      actorId: actor.actorId ?? null,
      createdAt: now
    });
    this.audit.write({
      actor,
      action: "partner.created",
      targetType: "PartnerTenant",
      targetId: partner.id,
      scope: { partnerTenantId: partner.id, ...(partner.countryId ? { countryId: partner.countryId } : {}) },
      result: "success",
      ...(reason ? { reason } : {}),
      context: { plan: partner.plan, status: partner.status, after: this.snapshot(partner) }
    });
    await this.notify(partner.id);
    return partner;
  }

  async update(id: string, input: Partial<PartnerDto> & { reason: string }, actor: ActorContext): Promise<PartnerTenant> {
    const partner = await this.require(id);
    if (input.status === "suspended" && !input.suspensionReason) {
      throw new Error("Suspension reason is required");
    }
    const before = this.snapshot(partner);
    const { reason, ...changes } = input;
    Object.assign(partner, changes, { updatedAt: new Date() });
    const updated = await this.repository.update(id, partner);
    this.audit.write({
      actor,
      action: "partner.updated",
      targetType: "PartnerTenant",
      targetId: partner.id,
      scope: { partnerTenantId: partner.id, ...(partner.countryId ? { countryId: partner.countryId } : {}) },
      result: "success",
      reason,
      context: { status: partner.status, suspensionReason: partner.suspensionReason, before, after: this.snapshot(updated) }
    });
    await this.notify(id);
    return updated;
  }

  /**
   * Spec 051 R2: applies an already authorised transition: stores the status and its reason,
   * remembers the active status left on suspension, writes the history row and the audit log.
   * The caller (PartnerAdminService) checks the graph, the role and the activation conditions.
   */
  async changeStatus(id: string, to: PartnerStatus, reason: string, actor: ActorContext): Promise<PartnerTenant> {
    const partner = await this.require(id);
    const from = partner.status;
    const now = new Date();
    const changes: Partial<PartnerTenant> = { status: to, statusReason: reason, updatedAt: now };
    if (to === "suspended") {
      if (isActivePartnerStatus(from)) changes.previousActiveStatus = from;
      changes.suspensionReason = reason;
    }
    if (to === "retired") changes.suspensionReason = reason;
    const updated = await this.repository.update(id, { ...partner, ...changes });
    await this.repository.addStatusHistory({ id: crypto.randomUUID(), partnerTenantId: id, fromStatus: from, toStatus: to, reason, actorId: actor.actorId ?? null, createdAt: now });
    this.audit.write({
      actor,
      action: "partner.status_changed",
      targetType: "PartnerTenant",
      targetId: id,
      scope: { partnerTenantId: id, ...(partner.countryId ? { countryId: partner.countryId } : {}) },
      result: "success",
      reason,
      context: { before: { status: from }, after: { status: to }, ...(changes.previousActiveStatus ? { previousActiveStatus: changes.previousActiveStatus } : {}) }
    });
    await this.notify(id);
    return updated;
  }

  require(id: string): Promise<PartnerTenant> {
    return this.repository.require(id);
  }

  /** Resolves to undefined instead of throwing for an unknown id. */
  find(id: string): Promise<PartnerTenant | undefined> {
    return this.repository.require(id).catch(() => undefined);
  }

  list(): Promise<PartnerTenant[]> {
    return this.repository.list();
  }

  /** FR-002: an existing partner of the same country with the same registration number (RCCM). */
  async findByRegistration(countryId: string, registrationNumber: string, excludeId?: string): Promise<PartnerTenant | undefined> {
    const wanted = registrationNumber.trim().toUpperCase();
    return (await this.repository.list()).find((partner) =>
      partner.id !== excludeId
      && partner.countryId === countryId
      && partner.registrationNumber?.trim().toUpperCase() === wanted
    );
  }

  async authorizeCountry(partnerTenantId: string, countryId: string, actor: ActorContext, reason?: string): Promise<void> {
    await this.repository.authorizeCountry(partnerTenantId, countryId);
    this.audit.write({
      actor,
      action: "partner.country_authorized",
      targetType: "PartnerTenant",
      targetId: partnerTenantId,
      scope: { partnerTenantId, countryId },
      result: "success",
      ...(reason ? { reason } : {}),
      context: {}
    });
    await this.notify(partnerTenantId);
  }

  async authorizeProduct(partnerTenantId: string, productId: string, actor: ActorContext, reason?: string): Promise<void> {
    await this.repository.authorizeProduct(partnerTenantId, productId);
    this.audit.write({
      actor,
      action: "partner.product_authorized",
      targetType: "PartnerTenant",
      targetId: partnerTenantId,
      scope: { partnerTenantId, productId },
      result: "success",
      ...(reason ? { reason } : {}),
      context: {}
    });
    await this.notify(partnerTenantId);
  }

  /** Spec 051 R7: immediate withdrawal; leads already assigned are not touched. */
  async withdrawAuthorization(partnerTenantId: string, kind: AuthorizationKind, scopeId: string, reason: string, actor: ActorContext): Promise<boolean> {
    const withdrawn = await this.repository.withdrawAuthorization(partnerTenantId, kind, scopeId, reason, new Date());
    if (withdrawn) {
      this.audit.write({
        actor,
        action: kind === "country" ? "partner.country_authorization_withdrawn" : "partner.product_authorization_withdrawn",
        targetType: "PartnerTenant",
        targetId: partnerTenantId,
        scope: { partnerTenantId, ...(kind === "country" ? { countryId: scopeId } : { productId: scopeId }) },
        result: "success",
        reason,
        context: { before: { status: "active" }, after: { status: "withdrawn" } }
      });
      await this.notify(partnerTenantId);
    }
    return withdrawn;
  }

  listAuthorizations(partnerTenantId: string, kind: AuthorizationKind): Promise<PartnerAuthorizationRecord[]> {
    return this.repository.listAuthorizations(partnerTenantId, kind);
  }

  isAuthorizedForCountry(partnerTenantId: string, countryId: string): Promise<boolean> {
    return this.repository.isAuthorizedForCountry(partnerTenantId, countryId);
  }

  isAuthorizedForProduct(partnerTenantId: string, productId: string): Promise<boolean> {
    return this.repository.isAuthorizedForProduct(partnerTenantId, productId);
  }

  /** Tenants with an active country authorization for `countryId` (public partner directory scope). */
  listActivePartnerIdsForCountry(countryId: string): Promise<string[]> {
    return this.repository.listActivePartnerIdsForCountry(countryId);
  }

  /** Products the tenant holds an active authorization for (public partner directory scope). */
  listActiveProductIdsForPartner(partnerTenantId: string): Promise<string[]> {
    return this.repository.listActiveProductIdsForPartner(partnerTenantId);
  }

  statusHistory(partnerTenantId: string): Promise<PartnerStatusHistoryRecord[]> {
    return this.repository.listStatusHistory(partnerTenantId);
  }

  /** Spec 051 R6: the caller has checked the signed document (type and scan). */
  async recordContract(contract: Omit<PartnerContractRecord, "id" | "createdAt">, reason: string, actor: ActorContext): Promise<PartnerContractRecord> {
    const record: PartnerContractRecord = { ...contract, id: crypto.randomUUID(), createdAt: new Date() };
    await this.repository.createContract(record);
    this.audit.write({
      actor,
      action: "partner.contract_recorded",
      targetType: "PartnerContract",
      targetId: record.id,
      scope: { partnerTenantId: record.partnerTenantId },
      result: "success",
      reason,
      context: { after: { version: record.version, signedAt: record.signedAt, documentId: record.documentId } }
    });
    await this.notify(record.partnerTenantId);
    return record;
  }

  listContracts(partnerTenantId: string): Promise<PartnerContractRecord[]> {
    return this.repository.listContracts(partnerTenantId);
  }

  /** Audit snapshot: business fields only (the audit writer masks contact PII). */
  private snapshot(partner: PartnerTenant): Record<string, unknown> {
    return {
      legalName: partner.legalName,
      tradeName: partner.tradeName,
      countryId: partner.countryId,
      city: partner.city,
      registrationNumber: partner.registrationNumber,
      plan: partner.plan,
      status: partner.status,
      quotaMonthlyLeads: partner.quotaMonthlyLeads,
      capacityStatus: partner.capacityStatus,
      slaTargetMinutes: partner.slaTargetMinutes,
      partnerInsurers: partner.partnerInsurers
    };
  }

  private async notify(partnerTenantId: string): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(partnerTenantId);
      } catch {
        // A cache listener must never fail the business change.
      }
    }
  }
}

export class PartnersModule {
  readonly service: PartnersService;

  constructor(audit = new AuditLogWriter(), repository?: PartnersRepository) {
    this.service = new PartnersService(audit, repository);
  }
}

export {
  PARTNERS_REPOSITORY,
  MemoryPartnersRepository,
  type AuthorizationKind,
  type PartnerAuthorizationRecord,
  type PartnerContractRecord,
  type PartnerStatusHistoryRecord,
  type PartnersRepository
} from "./partners.repository";
