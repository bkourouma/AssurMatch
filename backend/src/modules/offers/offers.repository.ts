import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { OfferHistoryRecord, OfferPatch, OfferRecord, OfferVersionRecord } from "./offers.module";

export const OFFERS_REPOSITORY = Symbol("OFFERS_REPOSITORY");

export interface OffersRepository extends RuntimeRepository {
  create(offer: OfferRecord): Promise<OfferRecord>;
  /**
   * Keys present with `undefined` clear the column (spec 052: a published projection may lose an
   * optional field, and the version pointers are cleared); absent keys are left unchanged.
   */
  update(id: string, update: OfferPatch<OfferRecord>): Promise<OfferRecord>;
  appendHistory(history: OfferHistoryRecord): Promise<OfferHistoryRecord>;
  list(): Promise<OfferRecord[]>;
  history(): Promise<OfferHistoryRecord[]>;
  require(id: string): Promise<OfferRecord>;
  find(id: string): Promise<OfferRecord | undefined>;
  /** Spec 052 R1: versions of an offer. */
  createVersion(version: OfferVersionRecord): Promise<OfferVersionRecord>;
  updateVersion(id: string, update: OfferPatch<OfferVersionRecord>): Promise<OfferVersionRecord>;
  listVersions(offerId: string): Promise<OfferVersionRecord[]>;
  /** Every version of every offer (admin queue and expiry reminders). */
  listAllVersions(): Promise<OfferVersionRecord[]>;
}

/** Optional columns of `Offer` and `OfferVersion` that an explicit `undefined` clears. */
const NULLABLE_OFFER_KEYS = new Set([
  "partnerTenantId", "shortDescription", "guaranteeSummary", "indicativePriceMin", "indicativePriceMax", "pricingUnit",
  "sponsorLabel", "insurerName", "guaranteeLevel", "deductibleAmount", "coverageCeiling", "processingDelayDays",
  "paymentFlexibility", "exclusionsSummary", "sourceOfInformation", "validatedById", "validatedAt",
  "publishedVersionId", "pendingVersionId", "withdrawnAt"
]);
const NULLABLE_VERSION_KEYS = new Set([
  "shortDescription", "guaranteeSummary", "exclusionsSummary", "insurerName", "guaranteeLevel", "deductibleAmount",
  "coverageCeiling", "processingDelayDays", "paymentFlexibility", "sourceOfInformation", "indicativePriceMin",
  "indicativePriceMax", "pricingUnit", "sponsorLabel", "authorId", "submittedAt", "decidedById", "decidedAt",
  "lastDecision", "decisionReason"
]);
const DECIMAL_KEYS = ["indicativePriceMin", "indicativePriceMax", "deductibleAmount", "coverageCeiling"] as const;

function applyUpdate<T extends object>(target: T, update: OfferPatch<T>): T {
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) delete (target as Record<string, unknown>)[key];
    else (target as Record<string, unknown>)[key] = value;
  }
  return target;
}

export class MemoryOffersRepository implements OffersRepository {
  readonly mode = "memory-test" as const;
  private readonly offers: OfferRecord[] = [];
  private readonly offerHistory: OfferHistoryRecord[] = [];
  private readonly versions: OfferVersionRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "OffersRepository");
  }

  async create(offer: OfferRecord): Promise<OfferRecord> {
    this.offers.push(offer);
    return offer;
  }

  async update(id: string, update: OfferPatch<OfferRecord>): Promise<OfferRecord> {
    const offer = await this.require(id);
    if (update === offer) return offer;
    return applyUpdate(offer, update);
  }

  async appendHistory(history: OfferHistoryRecord): Promise<OfferHistoryRecord> {
    this.offerHistory.push(history);
    return history;
  }

  async list(): Promise<OfferRecord[]> {
    return [...this.offers];
  }

  async history(): Promise<OfferHistoryRecord[]> {
    return [...this.offerHistory];
  }

  async require(id: string): Promise<OfferRecord> {
    const offer = await this.find(id);
    if (!offer) throw new Error(`Offer ${id} not found`);
    return offer;
  }

  async find(id: string): Promise<OfferRecord | undefined> {
    return this.offers.find((candidate) => candidate.id === id);
  }

  async createVersion(version: OfferVersionRecord): Promise<OfferVersionRecord> {
    if (this.versions.some((candidate) => candidate.offerId === version.offerId && candidate.versionNumber === version.versionNumber)) {
      throw new Error("Offer version conflict: duplicate version number");
    }
    this.versions.push({ ...version });
    return { ...version };
  }

  async updateVersion(id: string, update: OfferPatch<OfferVersionRecord>): Promise<OfferVersionRecord> {
    const version = this.versions.find((candidate) => candidate.id === id);
    if (!version) throw new Error(`Offer version ${id} not found`);
    return { ...applyUpdate(version, update) };
  }

  async listVersions(offerId: string): Promise<OfferVersionRecord[]> {
    return this.versions.filter((version) => version.offerId === offerId).sort((a, b) => a.versionNumber - b.versionNumber).map((version) => ({ ...version }));
  }

  async listAllVersions(): Promise<OfferVersionRecord[]> {
    return this.versions.map((version) => ({ ...version }));
  }
}

type OfferDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

type OfferHistoryDelegate = {
  create(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
};

type OfferVersionDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
};

export class PrismaOffersRepository implements OffersRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(offer: OfferRecord): Promise<OfferRecord> {
    return this.toDomain(await this.offers().create({ data: this.toPrisma(offer) }));
  }

  async update(id: string, update: OfferPatch<OfferRecord>): Promise<OfferRecord> {
    return this.toDomain(await this.offers().update({ where: { id }, data: this.toPrismaUpdate(update, NULLABLE_OFFER_KEYS) }));
  }

  async appendHistory(history: OfferHistoryRecord): Promise<OfferHistoryRecord> {
    return this.toHistory(await this.histories().create({ data: this.toPrismaHistory(history) }));
  }

  async list(): Promise<OfferRecord[]> {
    return (await this.offers().findMany({ orderBy: [{ displayPriority: "desc" }, { createdAt: "desc" }] })).map((row) => this.toDomain(row));
  }

  async history(): Promise<OfferHistoryRecord[]> {
    return (await this.histories().findMany({ orderBy: { changedAt: "asc" } })).map((row) => this.toHistory(row));
  }

  async require(id: string): Promise<OfferRecord> {
    const offer = await this.find(id);
    if (!offer) throw new Error(`Offer ${id} not found`);
    return offer;
  }

  async find(id: string): Promise<OfferRecord | undefined> {
    const row = await this.offers().findUnique({ where: { id } });
    return row ? this.toDomain(row) : undefined;
  }

  async createVersion(version: OfferVersionRecord): Promise<OfferVersionRecord> {
    return this.toVersion(await this.versionsClient().create({ data: { ...version } }));
  }

  async updateVersion(id: string, update: OfferPatch<OfferVersionRecord>): Promise<OfferVersionRecord> {
    return this.toVersion(await this.versionsClient().update({ where: { id }, data: this.toPrismaUpdate(update, NULLABLE_VERSION_KEYS) }));
  }

  async listVersions(offerId: string): Promise<OfferVersionRecord[]> {
    return (await this.versionsClient().findMany({ where: { offerId }, orderBy: { versionNumber: "asc" } })).map((row) => this.toVersion(row));
  }

  async listAllVersions(): Promise<OfferVersionRecord[]> {
    return (await this.versionsClient().findMany({ orderBy: [{ offerId: "asc" }, { versionNumber: "asc" }] })).map((row) => this.toVersion(row));
  }

  private offers(): OfferDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { offer: OfferDelegate }).offer;
  }

  private histories(): OfferHistoryDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { offerHistory: OfferHistoryDelegate }).offerHistory;
  }

  private versionsClient(): OfferVersionDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { offerVersion: OfferVersionDelegate }).offerVersion;
  }

  /** Prisma returns Decimal instances and null for optional columns; the domain uses numbers and undefined. */
  private normalize<T>(row: unknown, nullable: Set<string>): T {
    const item = row as Record<string, unknown>;
    const result = { ...item };
    for (const key of DECIMAL_KEYS) {
      const value = item[key] as { toNumber?: () => number } | number | null | undefined;
      delete result[key];
      if (value === null || value === undefined) continue;
      result[key] = typeof value === "number" ? value : typeof value.toNumber === "function" ? value.toNumber() : Number(value);
    }
    for (const key of nullable) {
      if (result[key] === null) delete result[key];
    }
    result.guarantees = Array.isArray(item.guarantees) ? item.guarantees : [];
    result.requiredDocuments = Array.isArray(item.requiredDocuments) ? item.requiredDocuments : [];
    return result as T;
  }

  private toDomain(row: unknown): OfferRecord {
    return this.normalize<OfferRecord>(row, NULLABLE_OFFER_KEYS);
  }

  private toVersion(row: unknown): OfferVersionRecord {
    return this.normalize<OfferVersionRecord>(row, NULLABLE_VERSION_KEYS);
  }

  private toHistory(row: unknown): OfferHistoryRecord {
    return row as OfferHistoryRecord;
  }

  private toPrisma(offer: OfferRecord): Record<string, unknown> {
    return Object.fromEntries(Object.entries(offer).filter(([, value]) => value !== undefined));
  }

  /** Explicit `undefined` on a nullable column becomes `null`; other `undefined` keys are dropped. */
  private toPrismaUpdate(update: object, nullable: Set<string>): Record<string, unknown> {
    const data = { ...update } as Record<string, unknown>;
    delete data.id;
    delete data.createdAt;
    const entries: Array<[string, unknown]> = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) entries.push([key, value]);
      else if (nullable.has(key)) entries.push([key, null]);
    }
    return Object.fromEntries(entries);
  }

  private toPrismaHistory(history: OfferHistoryRecord): Record<string, unknown> {
    return { ...history };
  }
}
