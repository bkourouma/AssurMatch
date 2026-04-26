import { partnerCreateSchema, type PartnerDto, type PartnerRecord } from "../../../../packages/shared/contracts/partner.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { MemoryPartnersRepository, type PartnersRepository } from "./partners.repository";

export interface PartnerTenant extends PartnerRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PartnersService {
  constructor(private readonly audit: AuditLogWriter, private readonly repository: PartnersRepository = new MemoryPartnersRepository()) {}

  create(input: PartnerDto, actor: ActorContext): PartnerTenant {
    const parsed = partnerCreateSchema.parse(input);
    const now = new Date();
    const partner: PartnerTenant = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.repository.create(partner);
    this.audit.write({
      actor,
      action: "partner.created",
      targetType: "PartnerTenant",
      targetId: partner.id,
      scope: { partnerTenantId: partner.id },
      result: "success",
      context: { plan: partner.plan, status: partner.status }
    });
    return partner;
  }

  update(id: string, input: Partial<PartnerDto> & { reason: string }, actor: ActorContext): PartnerTenant {
    const partner = this.require(id);
    if (input.status === "suspended" && !input.suspensionReason) {
      throw new Error("Suspension reason is required");
    }
    Object.assign(partner, input, { updatedAt: new Date() });
    this.repository.update(id, partner);
    this.audit.write({
      actor,
      action: "partner.updated",
      targetType: "PartnerTenant",
      targetId: partner.id,
      scope: { partnerTenantId: partner.id },
      result: "success",
      reason: input.reason,
      context: { status: partner.status, suspensionReason: partner.suspensionReason }
    });
    return partner;
  }

  require(id: string): PartnerTenant {
    return this.repository.require(id);
  }

  list(): PartnerTenant[] {
    return this.repository.list();
  }

  authorizeCountry(partnerTenantId: string, countryId: string, actor: ActorContext): void {
    this.repository.authorizeCountry(partnerTenantId, countryId);
    this.audit.write({
      actor,
      action: "partner.country_authorized",
      targetType: "PartnerTenant",
      targetId: partnerTenantId,
      scope: { partnerTenantId, countryId },
      result: "success",
      context: {}
    });
  }

  authorizeProduct(partnerTenantId: string, productId: string, actor: ActorContext): void {
    this.repository.authorizeProduct(partnerTenantId, productId);
    this.audit.write({
      actor,
      action: "partner.product_authorized",
      targetType: "PartnerTenant",
      targetId: partnerTenantId,
      scope: { partnerTenantId, productId },
      result: "success",
      context: {}
    });
  }

  isAuthorizedForCountry(partnerTenantId: string, countryId: string): boolean {
    return this.repository.isAuthorizedForCountry(partnerTenantId, countryId);
  }

  isAuthorizedForProduct(partnerTenantId: string, productId: string): boolean {
    return this.repository.isAuthorizedForProduct(partnerTenantId, productId);
  }
}

export class PartnersModule {
  readonly service: PartnersService;

  constructor(audit = new AuditLogWriter(), repository?: PartnersRepository) {
    this.service = new PartnersService(audit, repository);
  }
}

export { PARTNERS_REPOSITORY, MemoryPartnersRepository, type PartnersRepository } from "./partners.repository";
