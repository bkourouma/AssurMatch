import type { BrokerCustomPermission } from "../../../../packages/shared/contracts/enterprise.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

export interface PartnerAgencyRecord {
  id: string;
  partnerTenantId: string;
  name: string;
  countryCode: string;
  city: string | null;
  status: "active" | "suspended";
  memberIds: string[];
  reason: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerCustomRoleRecord {
  id: string;
  partnerTenantId: string;
  name: string;
  permissions: BrokerCustomPermission[];
  reason: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerBrandingRecord {
  id: string;
  partnerTenantId: string;
  displayLabel: string;
  primaryColor: string;
  firstActionTargetMinutes: number;
  reason: string;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnterpriseRepository extends RuntimeRepository {
  listAgencies(partnerTenantId: string): Promise<PartnerAgencyRecord[]>;
  findAgency(id: string): Promise<PartnerAgencyRecord | undefined>;
  upsertAgency(record: PartnerAgencyRecord): Promise<PartnerAgencyRecord>;
  listCustomRoles(partnerTenantId: string): Promise<PartnerCustomRoleRecord[]>;
  findCustomRole(id: string): Promise<PartnerCustomRoleRecord | undefined>;
  upsertCustomRole(record: PartnerCustomRoleRecord): Promise<PartnerCustomRoleRecord>;
  findBranding(partnerTenantId: string): Promise<PartnerBrandingRecord | undefined>;
  upsertBranding(record: PartnerBrandingRecord): Promise<PartnerBrandingRecord>;
  listBranding(): Promise<PartnerBrandingRecord[]>;
}

export class MemoryEnterpriseRepository implements EnterpriseRepository {
  readonly mode = "memory-test" as const;
  private readonly agencies: PartnerAgencyRecord[] = [];
  private readonly roles: PartnerCustomRoleRecord[] = [];
  private readonly branding: PartnerBrandingRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "EnterpriseRepository");
  }

  async listAgencies(partnerTenantId: string): Promise<PartnerAgencyRecord[]> {
    return this.agencies.filter((agency) => agency.partnerTenantId === partnerTenantId);
  }

  async findAgency(id: string): Promise<PartnerAgencyRecord | undefined> {
    return this.agencies.find((agency) => agency.id === id);
  }

  async upsertAgency(record: PartnerAgencyRecord): Promise<PartnerAgencyRecord> {
    const index = this.agencies.findIndex((agency) => agency.id === record.id);
    if (index >= 0) this.agencies[index] = record;
    else this.agencies.push(record);
    return record;
  }

  async listCustomRoles(partnerTenantId: string): Promise<PartnerCustomRoleRecord[]> {
    return this.roles.filter((role) => role.partnerTenantId === partnerTenantId);
  }

  async findCustomRole(id: string): Promise<PartnerCustomRoleRecord | undefined> {
    return this.roles.find((role) => role.id === id);
  }

  async upsertCustomRole(record: PartnerCustomRoleRecord): Promise<PartnerCustomRoleRecord> {
    const index = this.roles.findIndex((role) => role.id === record.id);
    if (index >= 0) this.roles[index] = record;
    else this.roles.push(record);
    return record;
  }

  async findBranding(partnerTenantId: string): Promise<PartnerBrandingRecord | undefined> {
    return this.branding.find((entry) => entry.partnerTenantId === partnerTenantId);
  }

  async upsertBranding(record: PartnerBrandingRecord): Promise<PartnerBrandingRecord> {
    const index = this.branding.findIndex((entry) => entry.partnerTenantId === record.partnerTenantId);
    if (index >= 0) this.branding[index] = record;
    else this.branding.push(record);
    return record;
  }

  async listBranding(): Promise<PartnerBrandingRecord[]> {
    return [...this.branding];
  }
}

type Delegate = {
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input: unknown): Promise<unknown | null>;
  upsert(input: unknown): Promise<unknown>;
};

export class PrismaEnterpriseRepository implements EnterpriseRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async listAgencies(partnerTenantId: string): Promise<PartnerAgencyRecord[]> {
    return (await this.delegate("partnerAgency").findMany({ where: { partnerTenantId }, orderBy: { createdAt: "asc" } })).map((row) => this.toAgency(row));
  }

  async findAgency(id: string): Promise<PartnerAgencyRecord | undefined> {
    const row = await this.delegate("partnerAgency").findFirst({ where: { id } });
    return row ? this.toAgency(row) : undefined;
  }

  async upsertAgency(record: PartnerAgencyRecord): Promise<PartnerAgencyRecord> {
    const data = { name: record.name, countryCode: record.countryCode, city: record.city, status: record.status, memberIds: record.memberIds, reason: record.reason, updatedAt: record.updatedAt };
    return this.toAgency(await this.delegate("partnerAgency").upsert({
      where: { id: record.id },
      create: { id: record.id, partnerTenantId: record.partnerTenantId, createdById: record.createdById, createdAt: record.createdAt, ...data },
      update: data
    }));
  }

  async listCustomRoles(partnerTenantId: string): Promise<PartnerCustomRoleRecord[]> {
    return (await this.delegate("partnerCustomRole").findMany({ where: { partnerTenantId }, orderBy: { createdAt: "asc" } })).map((row) => this.toRole(row));
  }

  async findCustomRole(id: string): Promise<PartnerCustomRoleRecord | undefined> {
    const row = await this.delegate("partnerCustomRole").findFirst({ where: { id } });
    return row ? this.toRole(row) : undefined;
  }

  async upsertCustomRole(record: PartnerCustomRoleRecord): Promise<PartnerCustomRoleRecord> {
    const data = { name: record.name, permissions: record.permissions, reason: record.reason, updatedAt: record.updatedAt };
    return this.toRole(await this.delegate("partnerCustomRole").upsert({
      where: { id: record.id },
      create: { id: record.id, partnerTenantId: record.partnerTenantId, createdById: record.createdById, createdAt: record.createdAt, ...data },
      update: data
    }));
  }

  async findBranding(partnerTenantId: string): Promise<PartnerBrandingRecord | undefined> {
    const row = await this.delegate("partnerBranding").findFirst({ where: { partnerTenantId } });
    return row ? (row as PartnerBrandingRecord) : undefined;
  }

  async upsertBranding(record: PartnerBrandingRecord): Promise<PartnerBrandingRecord> {
    const data = {
      displayLabel: record.displayLabel,
      primaryColor: record.primaryColor,
      firstActionTargetMinutes: record.firstActionTargetMinutes,
      reason: record.reason,
      updatedById: record.updatedById,
      updatedAt: record.updatedAt
    };
    return await this.delegate("partnerBranding").upsert({
      where: { partnerTenantId: record.partnerTenantId },
      create: { id: record.id, partnerTenantId: record.partnerTenantId, createdAt: record.createdAt, ...data },
      update: data
    }) as PartnerBrandingRecord;
  }

  async listBranding(): Promise<PartnerBrandingRecord[]> {
    return await this.delegate("partnerBranding").findMany() as PartnerBrandingRecord[];
  }

  private delegate(name: "partnerAgency" | "partnerCustomRole" | "partnerBranding"): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as Record<string, Delegate>)[name] as Delegate;
  }

  private toAgency(row: unknown): PartnerAgencyRecord {
    const agency = row as PartnerAgencyRecord & { memberIds: unknown };
    return { ...agency, memberIds: Array.isArray(agency.memberIds) ? agency.memberIds as string[] : [] };
  }

  private toRole(row: unknown): PartnerCustomRoleRecord {
    const role = row as PartnerCustomRoleRecord & { permissions: unknown };
    return { ...role, permissions: Array.isArray(role.permissions) ? role.permissions as BrokerCustomPermission[] : [] };
  }
}

export const ENTERPRISE_REPOSITORY = "ENTERPRISE_REPOSITORY";
