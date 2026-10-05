import type { BillingPlanKey } from "../../../../packages/shared/contracts/billing.contracts";
import type { PartnerApplicationRejectionReasonCode, PartnerApplicationStatus } from "../../../../packages/shared/contracts/partner-application.contracts";
import type { PublicLocale } from "../../../../packages/shared/contracts/public-site.contracts";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";

export const PARTNER_APPLICATIONS_REPOSITORY = Symbol("PARTNER_APPLICATIONS_REPOSITORY");

/**
 * A broker's application record. Nothing here activates a partner (spec decision D4): compliance
 * reviews this evidence out of band before any PartnerTenant or PartnerLicense is created.
 */
export interface PartnerApplicationRecord {
  id: string;
  publicReference: string;
  countryId: string;
  legalName: string;
  tradeName?: string;
  licenseNumber: string;
  licenseIssuingAuthority?: string;
  licenseExpiresAt: Date;
  productIds: string[];
  monthlyCapacity: number;
  contactName: string;
  contactEmailNormalized: string;
  contactEmailFingerprint: string;
  contactPhone: string;
  whatsapp?: string;
  desiredPlan: BillingPlanKey;
  message?: string;
  consentVersion: string;
  status: PartnerApplicationStatus;
  reviewedById?: string;
  reviewedAt?: Date;
  reviewNote?: string;
  partnerTenantId?: string;
  /** Spec 051 R10: closed-list refusal reason, decision date and language of the application. */
  rejectionReasonCode?: PartnerApplicationRejectionReasonCode;
  decidedAt?: Date;
  locale?: PublicLocale;
  ipHash?: string;
  retentionUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Spec 051: the fields a back-office decision writes. */
export type PartnerApplicationDecisionChanges = Partial<Pick<PartnerApplicationRecord,
  "status" | "reviewedById" | "reviewedAt" | "reviewNote" | "partnerTenantId" | "rejectionReasonCode" | "decidedAt">>;

export interface PartnerApplicationsListFilter {
  status?: PartnerApplicationStatus;
  countryId?: string;
}

export interface PartnerApplicationsRepository extends RuntimeRepository {
  create(application: PartnerApplicationRecord): Promise<PartnerApplicationRecord>;
  findDuplicate(countryId: string, contactEmailFingerprint: string, licenseNumber: string): Promise<PartnerApplicationRecord | undefined>;
  list(filter?: PartnerApplicationsListFilter): Promise<PartnerApplicationRecord[]>;
  find(id: string): Promise<PartnerApplicationRecord | undefined>;
  update(id: string, changes: PartnerApplicationDecisionChanges): Promise<PartnerApplicationRecord>;
}

export class MemoryPartnerApplicationsRepository implements PartnerApplicationsRepository {
  readonly mode = "memory-test" as const;
  private readonly applications: PartnerApplicationRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "PartnerApplicationsRepository");
  }

  async create(application: PartnerApplicationRecord): Promise<PartnerApplicationRecord> {
    this.applications.push(application);
    return application;
  }

  async findDuplicate(countryId: string, contactEmailFingerprint: string, licenseNumber: string): Promise<PartnerApplicationRecord | undefined> {
    return this.applications.find((candidate) =>
      candidate.countryId === countryId
      && candidate.contactEmailFingerprint === contactEmailFingerprint
      && candidate.licenseNumber === licenseNumber
    );
  }

  async list(filter: PartnerApplicationsListFilter = {}): Promise<PartnerApplicationRecord[]> {
    return this.applications
      .filter((candidate) => filter.status === undefined || candidate.status === filter.status)
      .filter((candidate) => filter.countryId === undefined || candidate.countryId === filter.countryId);
  }

  async find(id: string): Promise<PartnerApplicationRecord | undefined> {
    return this.applications.find((candidate) => candidate.id === id);
  }

  async update(id: string, changes: PartnerApplicationDecisionChanges): Promise<PartnerApplicationRecord> {
    const index = this.applications.findIndex((candidate) => candidate.id === id);
    const existing = this.applications[index];
    if (!existing) throw new Error(`Partner application ${id} not found`);
    const updated: PartnerApplicationRecord = { ...existing, ...changes, updatedAt: new Date() };
    this.applications[index] = updated;
    return updated;
  }
}

type PartnerApplicationDelegate = {
  create(input: unknown): Promise<unknown>;
  findFirst(input: unknown): Promise<unknown | null>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
  update(input: unknown): Promise<unknown>;
};

export class PrismaPartnerApplicationsRepository implements PartnerApplicationsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(application: PartnerApplicationRecord): Promise<PartnerApplicationRecord> {
    return this.toDomain(await this.client().create({ data: this.toPrisma(application) }));
  }

  async findDuplicate(countryId: string, contactEmailFingerprint: string, licenseNumber: string): Promise<PartnerApplicationRecord | undefined> {
    const row = await this.client().findFirst({ where: { countryId, contactEmailFingerprint, licenseNumber } });
    return row ? this.toDomain(row) : undefined;
  }

  async list(filter: PartnerApplicationsListFilter = {}): Promise<PartnerApplicationRecord[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.countryId !== undefined) where.countryId = filter.countryId;
    const rows = await this.client().findMany({ where, orderBy: { createdAt: "desc" } });
    return rows.map((row) => this.toDomain(row));
  }

  async find(id: string): Promise<PartnerApplicationRecord | undefined> {
    const row = await this.client().findUnique({ where: { id } });
    return row ? this.toDomain(row) : undefined;
  }

  async update(id: string, changes: PartnerApplicationDecisionChanges): Promise<PartnerApplicationRecord> {
    return this.toDomain(await this.client().update({ where: { id }, data: { ...changes } }));
  }

  private client(): PartnerApplicationDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerApplication: PartnerApplicationDelegate }).partnerApplication;
  }

  private toPrisma(application: PartnerApplicationRecord): Record<string, unknown> {
    return { ...application } as Record<string, unknown>;
  }

  /** Nullable columns come back as `null`; the domain uses absent fields. */
  private toDomain(row: unknown): PartnerApplicationRecord {
    return Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([, value]) => value !== null)) as unknown as PartnerApplicationRecord;
  }
}
