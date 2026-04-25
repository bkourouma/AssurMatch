import { regulatoryRegimeSchema, type RegulatoryRegimeDto, type RegulatoryRegimeRecord } from "../../../../packages/shared/contracts/catalog.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";

export interface RegulatoryRegime extends RegulatoryRegimeRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export class RegulatoryRegimesService {
  private readonly regimes: RegulatoryRegime[] = [];

  constructor(private readonly audit: AuditLogWriter) {}

  create(input: RegulatoryRegimeDto, actor: ActorContext): RegulatoryRegime {
    const parsed = regulatoryRegimeSchema.parse(input);
    if (parsed.retentionOverrideYears && parsed.retentionOverrideYears < 1) {
      throw new Error("Retention override cannot weaken compliance evidence");
    }
    const now = new Date();
    const regime: RegulatoryRegime = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.regimes.push(regime);
    this.audit.write({
      actor,
      action: "regulatory_regime.created",
      targetType: "RegulatoryRegime",
      targetId: regime.id,
      result: "success",
      context: { key: regime.key, status: regime.status }
    });
    return regime;
  }

  list(): RegulatoryRegime[] {
    return [...this.regimes];
  }

  findActive(id: string): RegulatoryRegime | undefined {
    return this.regimes.find((regime) => regime.id === id && regime.status === "active");
  }
}

export class RegulatoryRegimesModule {
  readonly service: RegulatoryRegimesService;

  constructor(audit = new AuditLogWriter()) {
    this.service = new RegulatoryRegimesService(audit);
  }
}
