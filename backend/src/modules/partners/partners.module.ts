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
}

export class PartnersModule {
  readonly service: PartnersService;

  constructor(audit = new AuditLogWriter()) {
    this.service = new PartnersService(audit);
  }
}
