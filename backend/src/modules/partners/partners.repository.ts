import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { PartnerTenant } from "./partners.module";

export const PARTNERS_REPOSITORY = Symbol("PARTNERS_REPOSITORY");

export interface PartnersRepository extends RuntimeRepository {
  create(partner: PartnerTenant): Promise<PartnerTenant>;
  update(id: string, update: Partial<PartnerTenant>): Promise<PartnerTenant>;
  require(id: string): Promise<PartnerTenant>;
  list(): Promise<PartnerTenant[]>;
  authorizeCountry(partnerTenantId: string, countryId: string): Promise<void>;
  authorizeProduct(partnerTenantId: string, productId: string): Promise<void>;
  isAuthorizedForCountry(partnerTenantId: string, countryId: string): Promise<boolean>;
  isAuthorizedForProduct(partnerTenantId: string, productId: string): Promise<boolean>;
}

export class MemoryPartnersRepository implements PartnersRepository {
  readonly mode = "memory-test" as const;
  private readonly partners: PartnerTenant[] = [];
  private readonly countryAuthorizations = new Map<string, Set<string>>();
  private readonly productAuthorizations = new Map<string, Set<string>>();

  constructor() {
    assertRuntimeRepository(this.mode, "PartnersRepository");
  }

  async create(partner: PartnerTenant): Promise<PartnerTenant> {
    this.partners.push(partner);
    return partner;
  }

  async update(id: string, update: Partial<PartnerTenant>): Promise<PartnerTenant> {
    const partner = await this.require(id);
    Object.assign(partner, update);
    return partner;
  }

  async require(id: string): Promise<PartnerTenant> {
    const partner = this.partners.find((candidate) => candidate.id === id);
    if (!partner) throw new Error(`Partner ${id} not found`);
    return partner;
  }

  async list(): Promise<PartnerTenant[]> {
    return [...this.partners];
  }

  async authorizeCountry(partnerTenantId: string, countryId: string): Promise<void> {
    await this.require(partnerTenantId);
    const scopes = this.countryAuthorizations.get(partnerTenantId) ?? new Set<string>();
    scopes.add(countryId);
    this.countryAuthorizations.set(partnerTenantId, scopes);
  }

  async authorizeProduct(partnerTenantId: string, productId: string): Promise<void> {
    await this.require(partnerTenantId);
    const scopes = this.productAuthorizations.get(partnerTenantId) ?? new Set<string>();
    scopes.add(productId);
    this.productAuthorizations.set(partnerTenantId, scopes);
  }

  async isAuthorizedForCountry(partnerTenantId: string, countryId: string): Promise<boolean> {
    return this.countryAuthorizations.get(partnerTenantId)?.has(countryId) === true;
  }

  async isAuthorizedForProduct(partnerTenantId: string, productId: string): Promise<boolean> {
    return this.productAuthorizations.get(partnerTenantId)?.has(productId) === true;
  }
}

type PartnerDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

type AuthorizationDelegate = {
  upsert(input: unknown): Promise<unknown>;
  findFirst(input: unknown): Promise<unknown | null>;
};

export class PrismaPartnersRepository implements PartnersRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(partner: PartnerTenant): Promise<PartnerTenant> {
    return this.toDomain(await this.partners().create({ data: { ...partner } }));
  }

  async update(id: string, update: Partial<PartnerTenant>): Promise<PartnerTenant> {
    const data = { ...update } as Record<string, unknown>;
    delete data.id;
    delete data.createdAt;
    return this.toDomain(await this.partners().update({ where: { id }, data }));
  }

  async require(id: string): Promise<PartnerTenant> {
    const row = await this.partners().findUnique({ where: { id } });
    if (!row) throw new Error(`Partner ${id} not found`);
    return this.toDomain(row);
  }

  async list(): Promise<PartnerTenant[]> {
    return (await this.partners().findMany({ orderBy: { legalName: "asc" } })).map((row) => this.toDomain(row));
  }

  async authorizeCountry(partnerTenantId: string, countryId: string): Promise<void> {
    await this.require(partnerTenantId);
    await this.countryAuthorizations().upsert({
      where: { partnerTenantId_countryId: { partnerTenantId, countryId } },
      create: { partnerTenantId, countryId, status: "active", createdAt: new Date(), updatedAt: new Date() },
      update: { status: "active", updatedAt: new Date() }
    });
  }

  async authorizeProduct(partnerTenantId: string, productId: string): Promise<void> {
    await this.require(partnerTenantId);
    await this.productAuthorizations().upsert({
      where: { partnerTenantId_productId: { partnerTenantId, productId } },
      create: { partnerTenantId, productId, status: "active", createdAt: new Date(), updatedAt: new Date() },
      update: { status: "active", updatedAt: new Date() }
    });
  }

  async isAuthorizedForCountry(partnerTenantId: string, countryId: string): Promise<boolean> {
    return Boolean(await this.countryAuthorizations().findFirst({ where: { partnerTenantId, countryId, status: "active" } }));
  }

  async isAuthorizedForProduct(partnerTenantId: string, productId: string): Promise<boolean> {
    return Boolean(await this.productAuthorizations().findFirst({ where: { partnerTenantId, productId, status: "active" } }));
  }

  private partners(): PartnerDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerTenant: PartnerDelegate }).partnerTenant;
  }

  private countryAuthorizations(): AuthorizationDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerCountryAuthorization: AuthorizationDelegate }).partnerCountryAuthorization;
  }

  private productAuthorizations(): AuthorizationDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerProductAuthorization: AuthorizationDelegate }).partnerProductAuthorization;
  }

  private toDomain(row: unknown): PartnerTenant {
    return row as PartnerTenant;
  }
}
