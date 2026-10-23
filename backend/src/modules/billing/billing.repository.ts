import type { BillingAddOnKind } from "../../../../packages/shared/contracts/billing-addons.contracts";
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
  /** Spec 060 J-03: invoice whose recorded payment justified the grant. */
  invoiceId?: string | null | undefined;
  /** Spec 063: dispute that gave one credit back (unique) and the invoice whose pack-covered lead was re-credited. */
  disputeId?: string | null | undefined;
  sourceInvoiceId?: string | null | undefined;
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

/** Lot 5 (spec 071) H4: optional monthly package price per kind, plan and country; applies only when `enabled`. */
export interface BillingAddOnPriceRecord {
  id: string;
  kind: BillingAddOnKind;
  plan: BillingPlanKey;
  countryCode: string;
  monthlyAmount: number;
  enabled: boolean;
  currency: "XOF";
  reason: string;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Lot 5 (spec 071): add-on assigned to one broker; `createdAt` is the assignment date. */
export interface PartnerAddOnRecord {
  id: string;
  partnerId: string;
  kind: BillingAddOnKind;
  status: "active" | "ended";
  reason: string;
  assignedById: string | null;
  endedById: string | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Lot 5 (spec 071): commercial subscription state of a broker (routing controls 9 and 11). */
export interface PartnerSubscriptionRecord {
  partnerId: string;
  status: "active" | "suspended" | "cancelled";
  contractExpiresAt: Date | null;
  reason: string;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * An add-on counts for a period when it was assigned before the period ends and was not ended before
 * the period starts.
 */
export function addOnActiveDuring(addOn: Pick<PartnerAddOnRecord, "createdAt" | "endedAt">, period: { from: Date; to: Date }): boolean {
  return addOn.createdAt.getTime() <= period.to.getTime() && (addOn.endedAt === null || addOn.endedAt.getTime() >= period.from.getTime());
}

export interface BillingRepository extends RuntimeRepository {
  listPlanPrices(): Promise<BillingPlanPriceRecord[]>;
  upsertPlanPrice(record: BillingPlanPriceRecord): Promise<BillingPlanPriceRecord>;
  listPacks(partnerId?: string): Promise<LeadPackRecord[]>;
  createPack(record: LeadPackRecord): Promise<LeadPackRecord>;
  updatePackConsumption(id: string, creditsConsumed: number): Promise<LeadPackRecord>;
  listDrafts(partnerId?: string): Promise<DraftInvoiceRecord[]>;
  upsertDraft(record: DraftInvoiceRecord): Promise<DraftInvoiceRecord>;
  listAddOnPrices(): Promise<BillingAddOnPriceRecord[]>;
  upsertAddOnPrice(record: BillingAddOnPriceRecord): Promise<BillingAddOnPriceRecord>;
  listPartnerAddOns(partnerId?: string): Promise<PartnerAddOnRecord[]>;
  createPartnerAddOn(record: PartnerAddOnRecord): Promise<PartnerAddOnRecord>;
  updatePartnerAddOn(id: string, patch: Pick<PartnerAddOnRecord, "status" | "endedAt" | "endedById">): Promise<PartnerAddOnRecord>;
  getSubscription(partnerId: string): Promise<PartnerSubscriptionRecord | undefined>;
  upsertSubscription(record: PartnerSubscriptionRecord): Promise<PartnerSubscriptionRecord>;
}

export class MemoryBillingRepository implements BillingRepository {
  readonly mode = "memory-test" as const;
  private readonly planPrices: BillingPlanPriceRecord[] = [];
  private readonly packs: LeadPackRecord[] = [];
  private readonly drafts: DraftInvoiceRecord[] = [];
  private readonly addOnPrices: BillingAddOnPriceRecord[] = [];
  private readonly partnerAddOns: PartnerAddOnRecord[] = [];
  private readonly subscriptions = new Map<string, PartnerSubscriptionRecord>();

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
    // Same guarantee as the unique index on disputeId: one restored credit per dispute.
    if (record.disputeId && this.packs.some((pack) => pack.disputeId === record.disputeId)) throw Object.assign(new Error("Unique constraint failed on disputeId"), { code: "P2002" });
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

  async listAddOnPrices(): Promise<BillingAddOnPriceRecord[]> {
    return this.addOnPrices.map((price) => ({ ...price }));
  }

  async upsertAddOnPrice(record: BillingAddOnPriceRecord): Promise<BillingAddOnPriceRecord> {
    const index = this.addOnPrices.findIndex((candidate) => candidate.kind === record.kind && candidate.plan === record.plan && candidate.countryCode === record.countryCode);
    if (index >= 0) {
      const existing = this.addOnPrices[index] as BillingAddOnPriceRecord;
      const merged = { ...record, id: existing.id, createdAt: existing.createdAt };
      this.addOnPrices[index] = merged;
      return { ...merged };
    }
    this.addOnPrices.push({ ...record });
    return { ...record };
  }

  async listPartnerAddOns(partnerId?: string): Promise<PartnerAddOnRecord[]> {
    return this.partnerAddOns.filter((addOn) => !partnerId || addOn.partnerId === partnerId).map((addOn) => ({ ...addOn })).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async createPartnerAddOn(record: PartnerAddOnRecord): Promise<PartnerAddOnRecord> {
    this.partnerAddOns.push({ ...record });
    return { ...record };
  }

  async updatePartnerAddOn(id: string, patch: Pick<PartnerAddOnRecord, "status" | "endedAt" | "endedById">): Promise<PartnerAddOnRecord> {
    const addOn = this.partnerAddOns.find((candidate) => candidate.id === id);
    if (!addOn) throw new Error(`Partner add-on ${id} not found`);
    Object.assign(addOn, patch, { updatedAt: new Date() });
    return { ...addOn };
  }

  async getSubscription(partnerId: string): Promise<PartnerSubscriptionRecord | undefined> {
    const found = this.subscriptions.get(partnerId);
    return found ? { ...found } : undefined;
  }

  async upsertSubscription(record: PartnerSubscriptionRecord): Promise<PartnerSubscriptionRecord> {
    const existing = this.subscriptions.get(record.partnerId);
    const merged = { ...record, createdAt: existing?.createdAt ?? record.createdAt };
    this.subscriptions.set(record.partnerId, merged);
    return { ...merged };
  }
}

type Delegate = {
  findMany(input?: unknown): Promise<unknown[]>;
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  upsert(input: unknown): Promise<unknown>;
  findUnique(input: unknown): Promise<unknown | null>;
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

  async listAddOnPrices(): Promise<BillingAddOnPriceRecord[]> {
    return (await this.delegate("billingAddOnPrice").findMany({ orderBy: [{ countryCode: "asc" }, { plan: "asc" }, { kind: "asc" }] })) as BillingAddOnPriceRecord[];
  }

  async upsertAddOnPrice(record: BillingAddOnPriceRecord): Promise<BillingAddOnPriceRecord> {
    const data = {
      kind: record.kind,
      plan: record.plan,
      countryCode: record.countryCode,
      monthlyAmount: record.monthlyAmount,
      enabled: record.enabled,
      currency: record.currency,
      reason: record.reason,
      updatedById: record.updatedById,
      updatedAt: record.updatedAt
    };
    return (await this.delegate("billingAddOnPrice").upsert({
      where: { kind_plan_countryCode: { kind: record.kind, plan: record.plan, countryCode: record.countryCode } },
      create: { id: record.id, ...data, createdAt: record.createdAt },
      update: data
    })) as BillingAddOnPriceRecord;
  }

  async listPartnerAddOns(partnerId?: string): Promise<PartnerAddOnRecord[]> {
    const rows = await this.delegate("partnerAddOn").findMany({ ...(partnerId ? { where: { partnerTenantId: partnerId } } : {}), orderBy: { createdAt: "asc" } });
    return rows.map((row) => this.toPartnerAddOn(row));
  }

  async createPartnerAddOn(record: PartnerAddOnRecord): Promise<PartnerAddOnRecord> {
    const { partnerId, ...rest } = record;
    return this.toPartnerAddOn(await this.delegate("partnerAddOn").create({ data: { ...rest, partnerTenantId: partnerId } }));
  }

  async updatePartnerAddOn(id: string, patch: Pick<PartnerAddOnRecord, "status" | "endedAt" | "endedById">): Promise<PartnerAddOnRecord> {
    return this.toPartnerAddOn(await this.delegate("partnerAddOn").update({ where: { id }, data: { ...patch, updatedAt: new Date() } }));
  }

  async getSubscription(partnerId: string): Promise<PartnerSubscriptionRecord | undefined> {
    const row = await this.delegate("partnerSubscription").findUnique({ where: { partnerTenantId: partnerId } });
    return row ? this.toSubscription(row) : undefined;
  }

  async upsertSubscription(record: PartnerSubscriptionRecord): Promise<PartnerSubscriptionRecord> {
    const data = { status: record.status, contractExpiresAt: record.contractExpiresAt, reason: record.reason, updatedById: record.updatedById, updatedAt: record.updatedAt };
    return this.toSubscription(await this.delegate("partnerSubscription").upsert({
      where: { partnerTenantId: record.partnerId },
      create: { partnerTenantId: record.partnerId, ...data, createdAt: record.createdAt },
      update: data
    }));
  }

  private delegate(name: "billingPlanPrice" | "leadPack" | "draftInvoice" | "billingAddOnPrice" | "partnerAddOn" | "partnerSubscription"): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as Record<string, Delegate>)[name] as Delegate;
  }

  private toPlanPrice(row: unknown): BillingPlanPriceRecord {
    return row as BillingPlanPriceRecord;
  }

  private toPartnerAddOn(row: unknown): PartnerAddOnRecord {
    const { partnerTenantId, ...rest } = row as PartnerAddOnRecord & { partnerTenantId: string };
    return { ...rest, partnerId: partnerTenantId };
  }

  private toSubscription(row: unknown): PartnerSubscriptionRecord {
    const { partnerTenantId, ...rest } = row as PartnerSubscriptionRecord & { partnerTenantId: string };
    return { ...rest, partnerId: partnerTenantId };
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
