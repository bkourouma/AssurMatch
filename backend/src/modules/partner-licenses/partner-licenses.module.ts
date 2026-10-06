import { partnerLicenseSchema, type PartnerLicenseDto, type PartnerLicenseRecord, type PartnerLicenseStatus } from "../../../../packages/shared/contracts/partner.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { MemoryPartnerLicensesRepository, type PartnerLicenseHistoryRecord, type PartnerLicensesRepository } from "./partner-licenses.repository";

export interface PartnerLicense extends PartnerLicenseRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  validatedById?: string;
  validatedAt?: Date;
  createdById?: string;
}

/** Audit action per target status of a licence (spec 051 R4). */
const STATUS_ACTIONS: Partial<Record<PartnerLicenseStatus, string>> = {
  valid: "partner_license.validated",
  suspended: "partner_license.suspended",
  revoked: "partner_license.revoked",
  superseded: "partner_license.superseded",
  expired: "partner_license.expired"
};

export class PartnerLicensesService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: PartnerLicensesRepository = new MemoryPartnerLicensesRepository()) {}

  async create(input: PartnerLicenseDto, actor: ActorContext, reason?: string): Promise<PartnerLicense> {
    const parsed = partnerLicenseSchema.parse(input);
    const now = new Date();
    const license: PartnerLicense = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      ...(actor.actorId ? { createdById: actor.actorId } : {}),
      createdAt: now,
      updatedAt: now
    };
    await this.repository.create(license);
    await this.repository.addHistory({
      id: crypto.randomUUID(),
      licenseId: license.id,
      partnerTenantId: license.partnerTenantId,
      fromStatus: null,
      toStatus: license.status,
      reason: reason ?? (license.renewsLicenseId ? "licence renewal recorded" : "licence created"),
      actorId: actor.actorId ?? null,
      createdAt: now
    });
    this.audit.write({
      actor,
      action: license.renewsLicenseId ? "partner_license.renewal_created" : "partner_license.created",
      targetType: "PartnerLicense",
      targetId: license.id,
      scope: { partnerTenantId: license.partnerTenantId, countryId: license.countryId },
      result: "success",
      ...(reason ? { reason } : {}),
      context: {
        licenseNumber: license.licenseNumber,
        status: license.status,
        ...(license.renewsLicenseId ? { renewsLicenseId: license.renewsLicenseId } : {})
      }
    });
    return license;
  }

  /** Legacy validation path (no document rule); the admin routes go through PartnerAdminService. */
  async validate(id: string, actor: ActorContext, reason = "licence validated"): Promise<PartnerLicense> {
    const license = await this.require(id);
    if (new Date(license.expirationDate) <= new Date()) {
      throw new Error("Expired license cannot be validated");
    }
    return this.changeStatus(id, "valid", reason, actor);
  }

  /**
   * Spec 051 R4: stores the new status and its reason, records the history row and the audit log.
   * The caller checks the transition rules (document, expiration, role).
   */
  async changeStatus(id: string, to: PartnerLicenseStatus, reason: string, actor: ActorContext): Promise<PartnerLicense> {
    const license = await this.require(id);
    const from = license.status;
    const now = new Date();
    const changes: Partial<PartnerLicense> = { status: to, statusReason: reason, updatedAt: now };
    if (to === "valid") {
      if (actor.actorId) changes.validatedById = actor.actorId;
      changes.validatedAt = now;
    }
    const updated = await this.repository.update(id, changes);
    await this.repository.addHistory({
      id: crypto.randomUUID(),
      licenseId: id,
      partnerTenantId: license.partnerTenantId,
      fromStatus: from,
      toStatus: to,
      reason,
      actorId: actor.actorId ?? null,
      createdAt: now
    });
    this.audit.write({
      actor,
      action: STATUS_ACTIONS[to] ?? "partner_license.status_changed",
      targetType: "PartnerLicense",
      targetId: id,
      scope: { partnerTenantId: license.partnerTenantId, countryId: license.countryId },
      result: "success",
      reason,
      context: { before: { status: from }, after: { status: to } }
    });
    return updated;
  }

  listForPartner(partnerTenantId: string): Promise<PartnerLicense[]> {
    return this.repository.listForPartner(partnerTenantId);
  }

  history(partnerTenantId: string): Promise<PartnerLicenseHistoryRecord[]> {
    return this.repository.listHistory(partnerTenantId);
  }

  eligible(partnerTenantId: string, countryId: string, productId?: string): Promise<boolean> {
    return this.repository.eligible(partnerTenantId, countryId, productId);
  }

  require(id: string): Promise<PartnerLicense> {
    return this.repository.require(id);
  }
}

export class PartnerLicensesModule {
  readonly service: PartnerLicensesService;

  constructor(audit = new AuditLogWriter(), repository?: PartnerLicensesRepository) {
    this.service = new PartnerLicensesService(audit, repository);
  }
}

export {
  PARTNER_LICENSES_REPOSITORY,
  MemoryPartnerLicensesRepository,
  type PartnerLicenseHistoryRecord,
  type PartnerLicensesRepository
} from "./partner-licenses.repository";
