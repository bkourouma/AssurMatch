import type { BillingPlanKey } from "../../../../packages/shared/contracts/billing.contracts";
import type { PartnerApplicationStatus } from "../../../../packages/shared/contracts/partner-application.contracts";
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
  ipHash?: string;
  retentionUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerApplicationsListFilter {
  status?: PartnerApplicationStatus;
  countryId?: string;
}

export interface PartnerApplicationsRepository extends RuntimeRepository {
  create(application: PartnerApplicationRecord): Promise<PartnerApplicationRecord>;
  findDuplicate(countryId: string, contactEmailFingerprint: string, licenseNumber: string): Promise<PartnerApplicationRecord | undefined>;
  list(filter?: PartnerApplicationsListFilter): Promise<PartnerApplicationRecord[]>;
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
}

type PartnerApplicationDelegate = {
  create(input: unknown): Promise<unknown>;
  findFirst(input: unknown): Promise<unknown | null>;
  findMany(input?: unknown): Promise<unknown[]>;
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

  private client(): PartnerApplicationDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerApplication: PartnerApplicationDelegate }).partnerApplication;
  }

  private toPrisma(application: PartnerApplicationRecord): Record<string, unknown> {
    return { ...application } as Record<string, unknown>;
  }

  private toDomain(row: unknown): PartnerApplicationRecord {
    return row as PartnerApplicationRecord;
  }
}
