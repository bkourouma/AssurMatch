import { partnerLicenseSchema, type PartnerLicenseDto, type PartnerLicenseRecord } from "../../../../packages/shared/contracts/partner.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { MemoryPartnerLicensesRepository, type PartnerLicensesRepository } from "./partner-licenses.repository";

export interface PartnerLicense extends PartnerLicenseRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  validatedById?: string;
  validatedAt?: Date;
}

export class PartnerLicensesService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: PartnerLicensesRepository = new MemoryPartnerLicensesRepository()) {}

  create(input: PartnerLicenseDto, actor: ActorContext): PartnerLicense {
    const parsed = partnerLicenseSchema.parse(input);
    const now = new Date();
    const license: PartnerLicense = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.repository.create(license);
    this.audit.write({
      actor,
      action: "partner_license.created",
      targetType: "PartnerLicense",
      targetId: license.id,
      scope: { partnerTenantId: license.partnerTenantId, countryId: license.countryId },
      result: "success",
      context: { licenseNumber: license.licenseNumber, status: license.status }
    });
    return license;
  }

  validate(id: string, actor: ActorContext): PartnerLicense {
    const license = this.require(id);
    if (new Date(license.expirationDate) <= new Date()) {
      license.status = "expired";
      throw new Error("Expired license cannot be validated");
    }
    license.status = "valid";
    if (actor.actorId) license.validatedById = actor.actorId;
    license.validatedAt = new Date();
    license.updatedAt = new Date();
    this.repository.update(id, license);
    this.audit.write({
      actor,
      action: "partner_license.validated",
      targetType: "PartnerLicense",
      targetId: license.id,
      scope: { partnerTenantId: license.partnerTenantId, countryId: license.countryId },
      result: "success",
      context: { status: license.status }
    });
    return license;
  }

  listForPartner(partnerTenantId: string): PartnerLicense[] {
    return this.repository.listForPartner(partnerTenantId);
  }

  eligible(partnerTenantId: string, countryId: string, productId?: string): boolean {
    return this.repository.eligible(partnerTenantId, countryId, productId);
  }

  require(id: string): PartnerLicense {
    return this.repository.require(id);
  }
}

export class PartnerLicensesModule {
  readonly service: PartnerLicensesService;

  constructor(audit = new AuditLogWriter(), repository?: PartnerLicensesRepository) {
    this.service = new PartnerLicensesService(audit, repository);
  }
}

export { PARTNER_LICENSES_REPOSITORY, MemoryPartnerLicensesRepository, type PartnerLicensesRepository } from "./partner-licenses.repository";
