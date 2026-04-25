import { partnerLicenseSchema, type PartnerLicenseDto, type PartnerLicenseRecord } from "../../../../packages/shared/contracts/partner.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";

export interface PartnerLicense extends PartnerLicenseRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  validatedById?: string;
  validatedAt?: Date;
}

export class PartnerLicensesService {
  private readonly licenses: PartnerLicense[] = [];

  constructor(private readonly audit: AuditLogWriter) {}

  create(input: PartnerLicenseDto, actor: ActorContext): PartnerLicense {
    const parsed = partnerLicenseSchema.parse(input);
    const now = new Date();
    const license: PartnerLicense = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.licenses.push(license);
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
    return this.licenses.filter((license) => license.partnerTenantId === partnerTenantId);
  }

  eligible(partnerTenantId: string, countryId: string, productId?: string): boolean {
    return this.licenses.some((license) =>
      license.partnerTenantId === partnerTenantId &&
      license.countryId === countryId &&
      license.status === "valid" &&
      new Date(license.expirationDate) > new Date() &&
      (!productId || license.productIds.length === 0 || license.productIds.includes(productId))
    );
  }

  require(id: string): PartnerLicense {
    const license = this.licenses.find((candidate) => candidate.id === id);
    if (!license) throw new Error(`License ${id} not found`);
    return license;
  }
}

export class PartnerLicensesModule {
  readonly service: PartnerLicensesService;

  constructor(audit = new AuditLogWriter()) {
    this.service = new PartnerLicensesService(audit);
  }
}
