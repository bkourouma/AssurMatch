import type { PartnerStatus } from "../../../../packages/shared/contracts/partner.contracts";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { PartnerTenant } from "./partners.module";

export const PARTNERS_REPOSITORY = Symbol("PARTNERS_REPOSITORY");

/** Spec 051 R7: a country or product authorization; `scopeId` is the country or the product id. */
export interface PartnerAuthorizationRecord {
  partnerTenantId: string;
  scopeId: string;
  /** `active` or `withdrawn` (legacy rows may still read `pending`). */
  status: string;
  withdrawnAt: Date | null;
  withdrawalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Spec 051 R2. */
export interface PartnerStatusHistoryRecord {
  id: string;
  partnerTenantId: string;
  fromStatus: PartnerStatus | null;
  toStatus: PartnerStatus;
  reason: string;
  actorId: string | null;
  createdAt: Date;
}

/** Spec 051 R6. */
export interface PartnerContractRecord {
  id: string;
  partnerTenantId: string;
  version: string;
  /** Date only (YYYY-MM-DD). */
  signedAt: string;
  signatoryName: string;
  documentId: string;
  recordedById: string | null;
  createdAt: Date;
}

export type AuthorizationKind = "country" | "product";

export interface PartnersRepository extends RuntimeRepository {
  create(partner: PartnerTenant): Promise<PartnerTenant>;
  update(id: string, update: Partial<PartnerTenant>): Promise<PartnerTenant>;
  require(id: string): Promise<PartnerTenant>;
  list(): Promise<PartnerTenant[]>;
  authorizeCountry(partnerTenantId: string, countryId: string): Promise<void>;
  authorizeProduct(partnerTenantId: string, productId: string): Promise<void>;
  isAuthorizedForCountry(partnerTenantId: string, countryId: string): Promise<boolean>;
  isAuthorizedForProduct(partnerTenantId: string, productId: string): Promise<boolean>;
  /** Partner tenant ids holding an active country authorization for `countryId` (public directory scope). */
  listActivePartnerIdsForCountry(countryId: string): Promise<string[]>;
  /** Product ids the tenant holds an active authorization for (public directory scope). */
  listActiveProductIdsForPartner(partnerTenantId: string): Promise<string[]>;
  /** Spec 051 R7: every authorization of the partner, withdrawn ones included. */
  listAuthorizations(partnerTenantId: string, kind: AuthorizationKind): Promise<PartnerAuthorizationRecord[]>;
  /** Spec 051 R7: marks the authorization withdrawn; false when no active authorization existed. */
  withdrawAuthorization(partnerTenantId: string, kind: AuthorizationKind, scopeId: string, reason: string, at: Date): Promise<boolean>;
  addStatusHistory(entry: PartnerStatusHistoryRecord): Promise<void>;
  listStatusHistory(partnerTenantId: string): Promise<PartnerStatusHistoryRecord[]>;
  createContract(contract: PartnerContractRecord): Promise<PartnerContractRecord>;
  listContracts(partnerTenantId: string): Promise<PartnerContractRecord[]>;
}

export class MemoryPartnersRepository implements PartnersRepository {
  readonly mode = "memory-test" as const;
  private readonly partners: PartnerTenant[] = [];
  private readonly authorizations: Record<AuthorizationKind, PartnerAuthorizationRecord[]> = { country: [], product: [] };
  private readonly statusHistory: PartnerStatusHistoryRecord[] = [];
  private readonly contracts: PartnerContractRecord[] = [];

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
    await this.authorize(partnerTenantId, "country", countryId);
  }

  async authorizeProduct(partnerTenantId: string, productId: string): Promise<void> {
    await this.authorize(partnerTenantId, "product", productId);
  }

  async isAuthorizedForCountry(partnerTenantId: string, countryId: string): Promise<boolean> {
    return this.authorizations.country.some((row) => row.partnerTenantId === partnerTenantId && row.scopeId === countryId && row.status === "active");
  }

  async isAuthorizedForProduct(partnerTenantId: string, productId: string): Promise<boolean> {
    return this.authorizations.product.some((row) => row.partnerTenantId === partnerTenantId && row.scopeId === productId && row.status === "active");
  }

  async listActivePartnerIdsForCountry(countryId: string): Promise<string[]> {
    return this.authorizations.country.filter((row) => row.scopeId === countryId && row.status === "active").map((row) => row.partnerTenantId);
  }

  async listActiveProductIdsForPartner(partnerTenantId: string): Promise<string[]> {
    return this.authorizations.product.filter((row) => row.partnerTenantId === partnerTenantId && row.status === "active").map((row) => row.scopeId);
  }

  async listAuthorizations(partnerTenantId: string, kind: AuthorizationKind): Promise<PartnerAuthorizationRecord[]> {
    return this.authorizations[kind].filter((row) => row.partnerTenantId === partnerTenantId).map((row) => ({ ...row }));
  }

  async withdrawAuthorization(partnerTenantId: string, kind: AuthorizationKind, scopeId: string, reason: string, at: Date): Promise<boolean> {
    const row = this.authorizations[kind].find((candidate) => candidate.partnerTenantId === partnerTenantId && candidate.scopeId === scopeId && candidate.status === "active");
    if (!row) return false;
    Object.assign(row, { status: "withdrawn", withdrawnAt: at, withdrawalReason: reason, updatedAt: at });
    return true;
  }

  async addStatusHistory(entry: PartnerStatusHistoryRecord): Promise<void> {
    this.statusHistory.push({ ...entry });
  }

  async listStatusHistory(partnerTenantId: string): Promise<PartnerStatusHistoryRecord[]> {
    return this.statusHistory.filter((entry) => entry.partnerTenantId === partnerTenantId).map((entry) => ({ ...entry }));
  }

  async createContract(contract: PartnerContractRecord): Promise<PartnerContractRecord> {
    this.contracts.push({ ...contract });
    return contract;
  }

  async listContracts(partnerTenantId: string): Promise<PartnerContractRecord[]> {
    return this.contracts.filter((contract) => contract.partnerTenantId === partnerTenantId).map((contract) => ({ ...contract }));
  }

  private async authorize(partnerTenantId: string, kind: AuthorizationKind, scopeId: string): Promise<void> {
    await this.require(partnerTenantId);
    const now = new Date();
    const existing = this.authorizations[kind].find((row) => row.partnerTenantId === partnerTenantId && row.scopeId === scopeId);
    if (existing) {
      Object.assign(existing, { status: "active", withdrawnAt: null, withdrawalReason: null, updatedAt: now });
      return;
    }
    this.authorizations[kind].push({ partnerTenantId, scopeId, status: "active", withdrawnAt: null, withdrawalReason: null, createdAt: now, updatedAt: now });
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
  findMany(input: unknown): Promise<unknown[]>;
  updateMany(input: unknown): Promise<{ count: number }>;
};

type RowDelegate = {
  create(input: unknown): Promise<unknown>;
  findMany(input: unknown): Promise<unknown[]>;
};

type AuthorizationRow = {
  partnerTenantId: string;
  countryId?: string;
  productId?: string;
  status: string;
  withdrawnAt: Date | null;
  withdrawalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
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
      update: { status: "active", withdrawnAt: null, withdrawalReason: null, updatedAt: new Date() }
    });
  }

  async authorizeProduct(partnerTenantId: string, productId: string): Promise<void> {
    await this.require(partnerTenantId);
    await this.productAuthorizations().upsert({
      where: { partnerTenantId_productId: { partnerTenantId, productId } },
      create: { partnerTenantId, productId, status: "active", createdAt: new Date(), updatedAt: new Date() },
      update: { status: "active", withdrawnAt: null, withdrawalReason: null, updatedAt: new Date() }
    });
  }

  async isAuthorizedForCountry(partnerTenantId: string, countryId: string): Promise<boolean> {
    return Boolean(await this.countryAuthorizations().findFirst({ where: { partnerTenantId, countryId, status: "active" } }));
  }

  async isAuthorizedForProduct(partnerTenantId: string, productId: string): Promise<boolean> {
    return Boolean(await this.productAuthorizations().findFirst({ where: { partnerTenantId, productId, status: "active" } }));
  }

  async listActivePartnerIdsForCountry(countryId: string): Promise<string[]> {
    const rows = (await this.countryAuthorizations().findMany({ where: { countryId, status: "active" } })) as Array<{ partnerTenantId: string }>;
    return rows.map((row) => row.partnerTenantId);
  }

  async listActiveProductIdsForPartner(partnerTenantId: string): Promise<string[]> {
    const rows = (await this.productAuthorizations().findMany({ where: { partnerTenantId, status: "active" } })) as Array<{ productId: string }>;
    return rows.map((row) => row.productId);
  }

  async listAuthorizations(partnerTenantId: string, kind: AuthorizationKind): Promise<PartnerAuthorizationRecord[]> {
    const delegate = kind === "country" ? this.countryAuthorizations() : this.productAuthorizations();
    const rows = (await delegate.findMany({ where: { partnerTenantId }, orderBy: { createdAt: "asc" } })) as AuthorizationRow[];
    return rows.map((row) => ({
      partnerTenantId: row.partnerTenantId,
      scopeId: (kind === "country" ? row.countryId : row.productId) ?? "",
      status: row.status,
      withdrawnAt: row.withdrawnAt ?? null,
      withdrawalReason: row.withdrawalReason ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
  }

  async withdrawAuthorization(partnerTenantId: string, kind: AuthorizationKind, scopeId: string, reason: string, at: Date): Promise<boolean> {
    const delegate = kind === "country" ? this.countryAuthorizations() : this.productAuthorizations();
    const scope = kind === "country" ? { countryId: scopeId } : { productId: scopeId };
    const result = await delegate.updateMany({
      where: { partnerTenantId, ...scope, status: "active" },
      data: { status: "withdrawn", withdrawnAt: at, withdrawalReason: reason, updatedAt: at }
    });
    return result.count > 0;
  }

  async addStatusHistory(entry: PartnerStatusHistoryRecord): Promise<void> {
    await this.statusHistory().create({ data: { ...entry } });
  }

  async listStatusHistory(partnerTenantId: string): Promise<PartnerStatusHistoryRecord[]> {
    return (await this.statusHistory().findMany({ where: { partnerTenantId }, orderBy: { createdAt: "asc" } })) as PartnerStatusHistoryRecord[];
  }

  async createContract(contract: PartnerContractRecord): Promise<PartnerContractRecord> {
    await this.contracts().create({ data: { ...contract, signedAt: new Date(`${contract.signedAt}T00:00:00.000Z`) } });
    return contract;
  }

  async listContracts(partnerTenantId: string): Promise<PartnerContractRecord[]> {
    const rows = (await this.contracts().findMany({ where: { partnerTenantId }, orderBy: { createdAt: "asc" } })) as Array<Omit<PartnerContractRecord, "signedAt"> & { signedAt: Date }>;
    return rows.map((row) => ({ ...row, signedAt: row.signedAt.toISOString().slice(0, 10) }));
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

  private statusHistory(): RowDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerStatusHistory: RowDelegate }).partnerStatusHistory;
  }

  private contracts(): RowDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { partnerContract: RowDelegate }).partnerContract;
  }

  /** Prisma answers `null` for absent optional columns; the domain uses `undefined`. */
  private toDomain(row: unknown): PartnerTenant {
    const record = { ...(row as Record<string, unknown>) };
    for (const [key, value] of Object.entries(record)) if (value === null) delete record[key];
    if (!Array.isArray(record.partnerInsurers)) record.partnerInsurers = [];
    return record as unknown as PartnerTenant;
  }
}
