import {
  adminRegulatoryRegimeCreateSchema,
  regulatoryRegimeSchema,
  regulatoryRegimeUpdateSchema,
  type RegulatoryRegimeDto,
  type RegulatoryRegimeRecord,
  type RegulatoryRegimeUpdateDto
} from "../../../../packages/shared/contracts/catalog.contracts";
import { pickDefined } from "../../../../packages/shared/validation/patch.schemas";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { assertFreshVersion, catalogConflict, catalogNotFound } from "../catalog/catalog-errors";
import type { ActorContext } from "../common/types";
import { MemoryRegulatoryRegimesRepository, type RegulatoryRegimesRepository } from "./regulatory-regimes.repository";

export interface RegulatoryRegime extends RegulatoryRegimeRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

/** Lists the ISO codes of the countries that still reference a regime (R9). */
export type RegimeReferenceLookup = (regimeId: string) => Promise<string[]>;

export class RegulatoryRegimesService {
  constructor(
    private readonly audit: AuditLogWriter,
    private readonly repository: RegulatoryRegimesRepository = new MemoryRegulatoryRegimesRepository(),
    /** The countries module is composed after this one, so the lookup is resolved at call time. */
    private readonly referenceLookup: RegimeReferenceLookup = async () => []
  ) {}

  async create(input: RegulatoryRegimeDto & { reason?: string }, actor: ActorContext): Promise<RegulatoryRegime> {
    const { reason, ...rest } = input;
    const parsed = regulatoryRegimeSchema.parse(rest);
    if (parsed.retentionOverrideYears && parsed.retentionOverrideYears < 1) {
      throw new Error("Retention override cannot weaken compliance evidence");
    }
    if (await this.repository.findByKey(parsed.key)) {
      this.refuse(actor, "regulatory_regime.create_refused", parsed.key, "duplicate_key", reason);
      throw catalogConflict(`Regulatory regime conflict: key ${parsed.key} already exists`);
    }
    const now = new Date();
    const regime: RegulatoryRegime = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...(actor.actorId ? { createdById: actor.actorId } : {})
    };
    await this.repository.create(regime);
    this.audit.write({
      actor,
      action: "regulatory_regime.created",
      targetType: "RegulatoryRegime",
      targetId: regime.id,
      result: "success",
      ...(reason ? { reason } : {}),
      context: { key: regime.key, status: regime.status, after: this.snapshot(regime) }
    });
    return regime;
  }

  /** Admin creation: the contract requires a reason and forbids creating a retired regime. */
  createFromAdmin(input: unknown, actor: ActorContext): Promise<RegulatoryRegime> {
    const parsed = adminRegulatoryRegimeCreateSchema.parse(input);
    return this.create(parsed, actor);
  }

  async update(id: string, input: RegulatoryRegimeUpdateDto, actor: ActorContext): Promise<RegulatoryRegime> {
    const { reason, expectedUpdatedAt, ...changes } = regulatoryRegimeUpdateSchema.parse(input);
    const regime = await this.require(id);
    if (regime.status === "retired") {
      this.refuse(actor, "regulatory_regime.update_refused", id, "retired", reason);
      throw catalogConflict("Regulatory regime conflict: a retired regime cannot be edited");
    }
    try {
      assertFreshVersion(expectedUpdatedAt, regime.updatedAt);
    } catch (error) {
      this.refuse(actor, "regulatory_regime.update_refused", id, "stale_version", reason);
      throw error;
    }
    const before = this.snapshot(regime);
    const updated = await this.repository.update(id, { ...pickDefined(changes), updatedAt: new Date() });
    this.audit.write({
      actor,
      action: "regulatory_regime.updated",
      targetType: "RegulatoryRegime",
      targetId: id,
      result: "success",
      reason,
      context: { before, after: this.snapshot(updated) }
    });
    return updated;
  }

  async retire(id: string, reason: string, actor: ActorContext): Promise<RegulatoryRegime> {
    const regime = await this.require(id);
    const references = await this.referenceLookup(id);
    if (references.length) {
      this.refuse(actor, "regulatory_regime.retire_refused", id, "referenced_by_country", reason, { countries: references });
      throw catalogConflict(`Regulatory regime conflict: referenced by country ${references.join(", ")}`);
    }
    if (regime.status === "retired") return regime;
    const updated = await this.repository.update(id, { status: "retired", updatedAt: new Date() });
    this.audit.write({
      actor,
      action: "regulatory_regime.retired",
      targetType: "RegulatoryRegime",
      targetId: id,
      result: "success",
      reason,
      context: { before: { status: regime.status }, after: { status: "retired" } }
    });
    return updated;
  }

  list(): Promise<RegulatoryRegime[]> {
    return this.repository.list();
  }

  find(id: string): Promise<RegulatoryRegime | undefined> {
    return this.repository.findById(id);
  }

  async findActive(id: string): Promise<RegulatoryRegime | undefined> {
    const regime = await this.repository.findById(id);
    return regime?.status === "active" ? regime : undefined;
  }

  async require(id: string): Promise<RegulatoryRegime> {
    const regime = await this.repository.findById(id);
    if (!regime) throw catalogNotFound(`Regulatory regime ${id} not found`);
    return regime;
  }

  private snapshot(regime: RegulatoryRegime): Record<string, unknown> {
    return {
      key: regime.key,
      name: regime.name,
      description: regime.description,
      retentionOverrideYears: regime.retentionOverrideYears,
      requiresManualActivationReview: regime.requiresManualActivationReview,
      status: regime.status
    };
  }

  private refuse(actor: ActorContext, action: string, targetId: string, refusal: string, reason?: string, context: Record<string, unknown> = {}): void {
    this.audit.write({
      actor,
      action,
      targetType: "RegulatoryRegime",
      targetId,
      result: "refused",
      reason: refusal,
      context: { requestReason: reason, ...context }
    });
  }
}

export class RegulatoryRegimesModule {
  readonly service: RegulatoryRegimesService;

  constructor(audit = new AuditLogWriter(), repository?: RegulatoryRegimesRepository, referenceLookup?: RegimeReferenceLookup) {
    this.service = new RegulatoryRegimesService(audit, repository, referenceLookup);
  }
}

export { MemoryRegulatoryRegimesRepository, PrismaRegulatoryRegimesRepository, type RegulatoryRegimesRepository } from "./regulatory-regimes.repository";
