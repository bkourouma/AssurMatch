import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { OfferHistoryRecord, OfferRecord } from "./offers.module";

export const OFFERS_REPOSITORY = Symbol("OFFERS_REPOSITORY");

export interface OffersRepository extends RuntimeRepository {
  create(offer: OfferRecord): Promise<OfferRecord>;
  update(id: string, update: Partial<OfferRecord>): Promise<OfferRecord>;
  appendHistory(history: OfferHistoryRecord): Promise<OfferHistoryRecord>;
  list(): Promise<OfferRecord[]>;
  history(): Promise<OfferHistoryRecord[]>;
  require(id: string): Promise<OfferRecord>;
}

export class MemoryOffersRepository implements OffersRepository {
  readonly mode = "memory-test" as const;
  private readonly offers: OfferRecord[] = [];
  private readonly offerHistory: OfferHistoryRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "OffersRepository");
  }

  async create(offer: OfferRecord): Promise<OfferRecord> {
    this.offers.push(offer);
    return offer;
  }

  async update(id: string, update: Partial<OfferRecord>): Promise<OfferRecord> {
    const offer = await this.require(id);
    Object.assign(offer, update);
    return offer;
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
    const offer = this.offers.find((candidate) => candidate.id === id);
    if (!offer) throw new Error(`Offer ${id} not found`);
    return offer;
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

export class PrismaOffersRepository implements OffersRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(offer: OfferRecord): Promise<OfferRecord> {
    return this.toDomain(await this.offers().create({ data: this.toPrisma(offer) }));
  }

  async update(id: string, update: Partial<OfferRecord>): Promise<OfferRecord> {
    return this.toDomain(await this.offers().update({ where: { id }, data: this.toPrismaUpdate(update) }));
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
    const row = await this.offers().findUnique({ where: { id } });
    if (!row) throw new Error(`Offer ${id} not found`);
    return this.toDomain(row);
  }

  private offers(): OfferDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { offer: OfferDelegate }).offer;
  }

  private histories(): OfferHistoryDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { offerHistory: OfferHistoryDelegate }).offerHistory;
  }

  private toDomain(row: unknown): OfferRecord {
    const item = row as Record<string, unknown>;
    const result = { ...item } as unknown as OfferRecord;
    // Prisma returns Decimal instances and null for optional columns; the domain uses numbers and undefined.
    for (const key of ["indicativePriceMin", "indicativePriceMax", "deductibleAmount", "coverageCeiling"] as const) {
      const value = item[key] as { toNumber?: () => number } | number | null | undefined;
      delete (result as unknown as Record<string, unknown>)[key];
      if (value === null || value === undefined) continue;
      result[key] = typeof value === "number" ? value : typeof value.toNumber === "function" ? value.toNumber() : Number(value);
    }
    for (const key of ["insurerName", "guaranteeLevel", "processingDelayDays", "paymentFlexibility", "exclusionsSummary", "sourceOfInformation"] as const) {
      if (item[key] === null) delete (result as unknown as Record<string, unknown>)[key];
    }
    result.guarantees = Array.isArray(item.guarantees) ? item.guarantees as NonNullable<OfferRecord["guarantees"]> : [];
    result.requiredDocuments = Array.isArray(item.requiredDocuments) ? item.requiredDocuments as string[] : [];
    return result;
  }

  private toHistory(row: unknown): OfferHistoryRecord {
    return row as OfferHistoryRecord;
  }

  private toPrisma(offer: OfferRecord): Record<string, unknown> {
    return { ...offer };
  }

  private toPrismaUpdate(update: Partial<OfferRecord>): Record<string, unknown> {
    const data = { ...update } as Record<string, unknown>;
    delete data.id;
    delete data.createdAt;
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  }

  private toPrismaHistory(history: OfferHistoryRecord): Record<string, unknown> {
    return { ...history };
  }
}
