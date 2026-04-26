import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { PartnerLicense } from "./partner-licenses.module";

export const PARTNER_LICENSES_REPOSITORY = Symbol("PARTNER_LICENSES_REPOSITORY");

export interface PartnerLicensesRepository extends RuntimeRepository {
  create(license: PartnerLicense): Promise<PartnerLicense>;
  update(id: string, update: Partial<PartnerLicense>): Promise<PartnerLicense>;
  listForPartner(partnerTenantId: string): Promise<PartnerLicense[]>;
  eligible(partnerTenantId: string, countryId: string, productId?: string): Promise<boolean>;
  require(id: string): Promise<PartnerLicense>;
}

export class MemoryPartnerLicensesRepository implements PartnerLicensesRepository {
  readonly mode = "memory-test" as const;
  private readonly licenses: PartnerLicense[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "PartnerLicensesRepository");
  }

  async create(license: PartnerLicense): Promise<PartnerLicense> {
    this.licenses.push(license);
    return license;
  }

  async update(id: string, update: Partial<PartnerLicense>): Promise<PartnerLicense> {
    const license = await this.require(id);
    Object.assign(license, update);
    return license;
  }

  async listForPartner(partnerTenantId: string): Promise<PartnerLicense[]> {
    return this.licenses.filter((license) => license.partnerTenantId === partnerTenantId);
  }

  async eligible(partnerTenantId: string, countryId: string, productId?: string): Promise<boolean> {
    return this.licenses.some((license) =>
      license.partnerTenantId === partnerTenantId &&
      license.countryId === countryId &&
      license.status === "valid" &&
      new Date(license.expirationDate) > new Date() &&
      (!productId || license.productIds.length === 0 || license.productIds.includes(productId))
    );
  }

  async require(id: string): Promise<PartnerLicense> {
    const license = this.licenses.find((candidate) => candidate.id === id);
    if (!license) throw new Error(`License ${id} not found`);
    return license;
  }
}

type PartnerLicenseDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
  findFirst(input: unknown): Promise<unknown | null>;
};

export class PrismaPartnerLicensesRepository implements PartnerLicensesRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(license: PartnerLicense): Promise<PartnerLicense> {
    return this.toDomain(await this.client().create({ data: { ...license } }));
  }

  async update(id: string, update: Partial<PartnerLicense>): Promise<PartnerLicense> {
    const data = { ...update } as Record<string, unknown>;
    delete data.id;
    delete data.createdAt;
    return this.toDomain(await this.client().update({ where: { id }, data }));
  }

  async listForPartner(partnerTenantId: string): Promise<PartnerLicense[]> {
    return (await this.client().findMany({ where: { partnerTenantId }, orderBy: { expirationDate: "asc" } })).map((row) => this.toDomain(row));
  }

  async eligible(partnerTenantId: string, countryId: string, productId?: string): Promise<boolean> {
    const now = new Date();
    const rows = await this.client().findMany({
      where: { partnerTenantId, countryId, status: "valid", expirationDate: { gt: now } }
    });
    return rows.map((row) => this.toDomain(row)).some((license) => !productId || license.productIds.length === 0 || license.productIds.includes(productId));
  }

  async require(id: string): Promise<PartnerLicense> {
    const row = await this.client().findUnique({ where: { id } });
    if (!row) throw new Error(`License ${id} not found`);
    return this.toDomain(row);
  }

  private client(): PartnerLicenseDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerLicense: PartnerLicenseDelegate }).partnerLicense;
  }

  private toDomain(row: unknown): PartnerLicense {
    return row as PartnerLicense;
  }
}
