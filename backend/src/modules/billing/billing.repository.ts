import type { BillingPlanKey, DraftInvoiceLine } from "../../../../packages/shared/contracts/billing.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

export interface BillingPlanPriceRecord {
  id: string;
  plan: BillingPlanKey;
  countryCode: string;
  monthlySubscription: number;
  perLeadPrice: number;
  /** Spec 042 D1: fraction of `perLeadPrice` charged when a lead is shared between brokers. */
  sharedLeadPriceMultiplier: number;
  setupFee: number;
  currency: "XOF";
  reason: string;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadPackRecord {
  id: string;
  partnerId: string;
  creditsGranted: number;
  creditsConsumed: number;
  reason: string;
  grantedById: string | null;
  grantedAt: Date;
  updatedAt: Date;
}

export interface DraftInvoiceRecord {
  id: string;
  partnerId: string;
  partnerName: string;
  plan: BillingPlanKey;
  countryCode: string;
  periodFrom: Date;
  periodTo: Date;
  reference: string;
  status: "draft_not_billable";
  currency: "XOF";
  lines: DraftInvoiceLine[];
  billableLeadCount: number;
  nonBillableLeadCount: number;
  disputeCreditCount: number;
  packCreditsUsed: number;
  totalAmount: number;
  computedAt: Date;
}

export interface BillingRepository extends RuntimeRepository {
  listPlanPrices(): Promise<BillingPlanPriceRecord[]>;
  upsertPlanPrice(record: BillingPlanPriceRecord): Promise<BillingPlanPriceRecord>;
  listPacks(partnerId?: string): Promise<LeadPackRecord[]>;
  createPack(record: LeadPackRecord): Promise<LeadPackRecord>;
  updatePackConsumption(id: string, creditsConsumed: number): Promise<LeadPackRecord>;
  listDrafts(partnerId?: string): Promise<DraftInvoiceRecord[]>;
  upsertDraft(record: DraftInvoiceRecord): Promise<DraftInvoiceRecord>;
}

export class MemoryBillingRepository implements BillingRepository {
  readonly mode = "memory-test" as const;
  private readonly planPrices: BillingPlanPriceRecord[] = [];
  private readonly packs: LeadPackRecord[] = [];
  private readonly drafts: DraftInvoiceRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "BillingRepository");
  }

  async listPlanPrices(): Promise<BillingPlanPriceRecord[]> {
    return [...this.planPrices];
  }

  async upsertPlanPrice(record: BillingPlanPriceRecord): Promise<BillingPlanPriceRecord> {
    const index = this.planPrices.findIndex((candidate) => candidate.plan === record.plan && candidate.countryCode === record.countryCode);
    if (index >= 0) {
      const existing = this.planPrices[index] as BillingPlanPriceRecord;
      const merged = { ...record, id: existing.id, createdAt: existing.createdAt };
      this.planPrices[index] = merged;
      return merged;
    }
    this.planPrices.push(record);
    return record;
  }

  async listPacks(partnerId?: string): Promise<LeadPackRecord[]> {
    return this.packs.filter((pack) => !partnerId || pack.partnerId === partnerId).sort((left, right) => left.grantedAt.getTime() - right.grantedAt.getTime());
  }

  async createPack(record: LeadPackRecord): Promise<LeadPackRecord> {
    this.packs.push(record);
    return record;
  }

  async updatePackConsumption(id: string, creditsConsumed: number): Promise<LeadPackRecord> {
    const pack = this.packs.find((candidate) => candidate.id === id);
    if (!pack) throw new Error(`Lead pack ${id} not found`);
    pack.creditsConsumed = creditsConsumed;
    pack.updatedAt = new Date();
    return pack;
  }

  async listDrafts(partnerId?: string): Promise<DraftInvoiceRecord[]> {
    return this.drafts.filter((draft) => !partnerId || draft.partnerId === partnerId).sort((left, right) => right.periodFrom.getTime() - left.periodFrom.getTime());
  }

  async upsertDraft(record: DraftInvoiceRecord): Promise<DraftInvoiceRecord> {
    const index = this.drafts.findIndex((draft) => draft.partnerId === record.partnerId && draft.periodFrom.getTime() === record.periodFrom.getTime());
    if (index >= 0) {
      const existing = this.drafts[index] as DraftInvoiceRecord;
      const merged = { ...record, id: existing.id };
      this.drafts[index] = merged;
      return merged;
    }
    this.drafts.push(record);
    return record;
  }
}

type Delegate = {
  findMany(input?: unknown): Promise<unknown[]>;
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  upsert(input: unknown): Promise<unknown>;
};

export class PrismaBillingRepository implements BillingRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async listPlanPrices(): Promise<BillingPlanPriceRecord[]> {
    return (await this.delegate("billingPlanPrice").findMany({ orderBy: [{ countryCode: "asc" }, { plan: "asc" }] })).map((row) => this.toPlanPrice(row));
  }

  async upsertPlanPrice(record: BillingPlanPriceRecord): Promise<BillingPlanPriceRecord> {
    const data = {
      plan: record.plan,
      countryCode: record.countryCode,
      monthlySubscription: record.monthlySubscription,
      perLeadPrice: record.perLeadPrice,
      sharedLeadPriceMultiplier: record.sharedLeadPriceMultiplier,
      setupFee: record.setupFee,
      currency: record.currency,
      reason: record.reason,
      updatedById: record.updatedById,
      updatedAt: record.updatedAt
    };
    return this.toPlanPrice(await this.delegate("billingPlanPrice").upsert({
      where: { plan_countryCode: { plan: record.plan, countryCode: record.countryCode } },
      create: { id: record.id, ...data, createdAt: record.createdAt },
      update: data
    }));
  }

  async listPacks(partnerId?: string): Promise<LeadPackRecord[]> {
    return (await this.delegate("leadPack").findMany({ ...(partnerId ? { where: { partnerId } } : {}), orderBy: { grantedAt: "asc" } })).map((row) => this.toPack(row));
  }

  async createPack(record: LeadPackRecord): Promise<LeadPackRecord> {
    return this.toPack(await this.delegate("leadPack").create({ data: record }));
  }

  async updatePackConsumption(id: string, creditsConsumed: number): Promise<LeadPackRecord> {
    return this.toPack(await this.delegate("leadPack").update({ where: { id }, data: { creditsConsumed, updatedAt: new Date() } }));
  }

  async listDrafts(partnerId?: string): Promise<DraftInvoiceRecord[]> {
    return (await this.delegate("draftInvoice").findMany({ ...(partnerId ? { where: { partnerId } } : {}), orderBy: { periodFrom: "desc" } })).map((row) => this.toDraft(row));
  }

  async upsertDraft(record: DraftInvoiceRecord): Promise<DraftInvoiceRecord> {
    const data = {
      partnerName: record.partnerName,
      plan: record.plan,
      countryCode: record.countryCode,
      periodTo: record.periodTo,
      reference: record.reference,
      status: record.status,
      currency: record.currency,
      lines: record.lines,
      billableLeadCount: record.billableLeadCount,
      nonBillableLeadCount: record.nonBillableLeadCount,
      disputeCreditCount: record.disputeCreditCount,
      packCreditsUsed: record.packCreditsUsed,
      totalAmount: record.totalAmount,
      computedAt: record.computedAt
    };
    return this.toDraft(await this.delegate("draftInvoice").upsert({
      where: { partnerId_periodFrom: { partnerId: record.partnerId, periodFrom: record.periodFrom } },
      create: { id: record.id, partnerId: record.partnerId, periodFrom: record.periodFrom, ...data },
      update: data
    }));
  }

  private delegate(name: "billingPlanPrice" | "leadPack" | "draftInvoice"): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as Record<string, Delegate>)[name] as Delegate;
  }

  private toPlanPrice(row: unknown): BillingPlanPriceRecord {
    return row as BillingPlanPriceRecord;
  }

  private toPack(row: unknown): LeadPackRecord {
    return row as LeadPackRecord;
  }

  private toDraft(row: unknown): DraftInvoiceRecord {
    const draft = row as DraftInvoiceRecord & { lines: unknown };
    return { ...draft, lines: (Array.isArray(draft.lines) ? draft.lines : []) as DraftInvoiceLine[] };
  }
}

export const BILLING_REPOSITORY = "BILLING_REPOSITORY";
