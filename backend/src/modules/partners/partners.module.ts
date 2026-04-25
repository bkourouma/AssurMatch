import { partnerCreateSchema, type PartnerDto, type PartnerRecord } from "../../../../packages/shared/contracts/partner.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";

export interface PartnerTenant extends PartnerRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PartnersService {
  private readonly partners: PartnerTenant[] = [];
  private readonly countryAuthorizations = new Map<string, Set<string>>();
  private readonly productAuthorizations = new Map<string, Set<string>>();

  constructor(private readonly audit: AuditLogWriter) {}

  create(input: PartnerDto, actor: ActorContext): PartnerTenant {
    const parsed = partnerCreateSchema.parse(input);
    const now = new Date();
    const partner: PartnerTenant = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.partners.push(partner);
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
    const partner = this.partners.find((candidate) => candidate.id === id);
    if (!partner) throw new Error(`Partner ${id} not found`);
    return partner;
  }

  list(): PartnerTenant[] {
    return [...this.partners];
  }

  authorizeCountry(partnerTenantId: string, countryId: string, actor: ActorContext): void {
    this.require(partnerTenantId);
    const scopes = this.countryAuthorizations.get(partnerTenantId) ?? new Set<string>();
    scopes.add(countryId);
    this.countryAuthorizations.set(partnerTenantId, scopes);
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
    this.require(partnerTenantId);
    const scopes = this.productAuthorizations.get(partnerTenantId) ?? new Set<string>();
    scopes.add(productId);
    this.productAuthorizations.set(partnerTenantId, scopes);
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
    return this.countryAuthorizations.get(partnerTenantId)?.has(countryId) === true;
  }

  isAuthorizedForProduct(partnerTenantId: string, productId: string): boolean {
    return this.productAuthorizations.get(partnerTenantId)?.has(productId) === true;
  }
}

export class PartnersModule {
  readonly service: PartnersService;

  constructor(audit = new AuditLogWriter()) {
    this.service = new PartnersService(audit);
  }
}
