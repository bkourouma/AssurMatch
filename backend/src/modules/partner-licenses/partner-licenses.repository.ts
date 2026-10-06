import type { PartnerLicenseStatus } from "../../../../packages/shared/contracts/partner.contracts";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { PartnerLicense } from "./partner-licenses.module";

export const PARTNER_LICENSES_REPOSITORY = Symbol("PARTNER_LICENSES_REPOSITORY");

/** Spec 051 R4: one licence status change. */
export interface PartnerLicenseHistoryRecord {
  id: string;
  licenseId: string;
  partnerTenantId: string;
  fromStatus: PartnerLicenseStatus | null;
  toStatus: PartnerLicenseStatus;
  reason: string;
  actorId: string | null;
  createdAt: Date;
}

export interface PartnerLicensesRepository extends RuntimeRepository {
  create(license: PartnerLicense): Promise<PartnerLicense>;
  update(id: string, update: Partial<PartnerLicense>): Promise<PartnerLicense>;
  listForPartner(partnerTenantId: string): Promise<PartnerLicense[]>;
  eligible(partnerTenantId: string, countryId: string, productId?: string): Promise<boolean>;
  require(id: string): Promise<PartnerLicense>;
  addHistory(entry: PartnerLicenseHistoryRecord): Promise<void>;
  /** Every licence status change of the partner, oldest first. */
  listHistory(partnerTenantId: string): Promise<PartnerLicenseHistoryRecord[]>;
}

export class MemoryPartnerLicensesRepository implements PartnerLicensesRepository {
  readonly mode = "memory-test" as const;
  private readonly licenses: PartnerLicense[] = [];
  private readonly history: PartnerLicenseHistoryRecord[] = [];

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

  async addHistory(entry: PartnerLicenseHistoryRecord): Promise<void> {
    this.history.push({ ...entry });
  }

  async listHistory(partnerTenantId: string): Promise<PartnerLicenseHistoryRecord[]> {
    return this.history.filter((entry) => entry.partnerTenantId === partnerTenantId).map((entry) => ({ ...entry }));
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
    return this.toDomain(await this.client().create({ data: this.toPrismaData(license) }));
  }

  async update(id: string, update: Partial<PartnerLicense>): Promise<PartnerLicense> {
    const data = this.toPrismaData(update);
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

  async addHistory(entry: PartnerLicenseHistoryRecord): Promise<void> {
    await this.historyClient().create({ data: { ...entry } });
  }

  async listHistory(partnerTenantId: string): Promise<PartnerLicenseHistoryRecord[]> {
    return (await this.historyClient().findMany({ where: { partnerTenantId }, orderBy: { createdAt: "asc" } })) as PartnerLicenseHistoryRecord[];
  }

  private historyClient(): { create(input: unknown): Promise<unknown>; findMany(input: unknown): Promise<unknown[]> } {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerLicenseHistory: { create(input: unknown): Promise<unknown>; findMany(input: unknown): Promise<unknown[]> } }).partnerLicenseHistory;
  }

  private client(): PartnerLicenseDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerLicense: PartnerLicenseDelegate }).partnerLicense;
  }

  private toPrismaData(license: Partial<PartnerLicense>): Record<string, unknown> {
    const data = { ...license } as Record<string, unknown>;
    if (typeof license.effectiveDate === "string") data.effectiveDate = new Date(`${license.effectiveDate}T00:00:00.000Z`);
    if (typeof license.expirationDate === "string") data.expirationDate = new Date(`${license.expirationDate}T00:00:00.000Z`);
    return data;
  }

  private toDomain(row: unknown): PartnerLicense {
    const raw = { ...(row as Record<string, unknown>) };
    // Prisma answers `null` for absent optional columns; the domain uses `undefined`.
    for (const [key, value] of Object.entries(raw)) if (value === null) delete raw[key];
    const record = raw as unknown as PartnerLicense & { effectiveDate: Date | string; expirationDate: Date | string };
    return {
      ...record,
      effectiveDate: this.toDateOnly(record.effectiveDate),
      expirationDate: this.toDateOnly(record.expirationDate)
    };
  }

  private toDateOnly(value: Date | string): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
  }
}
