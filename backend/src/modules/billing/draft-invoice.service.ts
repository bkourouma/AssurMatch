import type {
  BrokerBillingStatement,
  DraftInvoice,
  DraftInvoiceLine,
  DraftInvoiceQuery,
  DraftInvoiceRecompute,
  BillingPlanKey
} from "../../../../packages/shared/contracts/billing.contracts";
import { SHARED_LEAD_DEFAULT_MULTIPLIER, SHARED_LEAD_TOTAL_CAP, draftInvoiceQuerySchema, draftInvoiceRecomputeSchema } from "../../../../packages/shared/contracts/billing.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { CrmActivityRepository } from "../leads/crm-activity.repository";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../leads/lead-assignment.service";
import type { PartnersService } from "../partners/partners.module";
import type { ProductsService } from "../products/products.module";
import { BillableLeadPolicy } from "./billable-lead-policy";
import { BillingAuditActions } from "./billing-audit-actions";
import { BillingAccessRefusedError, BillingDisabledError } from "./billing-foundation.service";
import type { BillingRepository, DraftInvoiceRecord } from "./billing.repository";
import type { LeadPacksService } from "./lead-packs.service";

export interface DraftInvoiceDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  partners: PartnersService;
  assignments: LeadAssignmentService;
  countries: CountriesService;
  products: ProductsService;
  packs: LeadPacksService;
  repository: BillingRepository;
  crmActivity?: CrmActivityRepository | undefined;
}

const DRAFT_NOTICE = "Brouillon non facturable: aucun encaissement, aucune emission de facture, aucune prime collectee par AssurMatch.";

/**
 * Monthly draft per partner: subscription + billable leads - accepted disputes - pack credits.
 * The result is always `draft_not_billable`; issuing and collecting stay out of scope until the
 * payments feature is separately specified and enabled.
 */
export class DraftInvoiceService {
  private readonly policy = new BillableLeadPolicy();

  constructor(private readonly deps: DraftInvoiceDeps) {}

  async list(actor: ActorContext, query: DraftInvoiceQuery): Promise<{ items: DraftInvoice[]; page: number; pageSize: number; total: number; paymentsEnabled: false; notice: string }> {
    this.assertAdmin(actor, "read");
    const parsed = draftInvoiceQuerySchema.parse(query);
    const drafts = await this.deps.repository.listDrafts(parsed.partnerId);
    const start = (parsed.page - 1) * parsed.pageSize;
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.draftRead,
      targetType: "DraftInvoice",
      targetId: parsed.partnerId ?? "all",
      scope: { partnerId: parsed.partnerId ?? null },
      result: "success",
      context: { total: drafts.length, paymentsEnabled: false }
    });
    return {
      items: drafts.slice(start, start + parsed.pageSize).map((record) => this.toDto(record)),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total: drafts.length,
      paymentsEnabled: false,
      notice: DRAFT_NOTICE
    };
  }

  async recompute(input: DraftInvoiceRecompute, actor: ActorContext): Promise<DraftInvoice[]> {
    this.assertAdmin(actor, "write");
    const parsed = draftInvoiceRecomputeSchema.parse(input);
    if (!this.deps.featureFlags.isEnabled("billing_enabled")) this.refuseDisabled(actor, "DraftInvoice");
    const partners = (await this.deps.partners.list()).filter((partner) => !parsed.partnerId || partner.id === parsed.partnerId);
    const drafts: DraftInvoice[] = [];
    for (const partner of partners) {
      drafts.push(await this.computeForPartner(partner.id, partner.legalName, partner.plan as BillingPlanKey, actor, parsed.reason));
    }
    return drafts;
  }

  /** Broker-facing consumption view (DASH-B-008); strictly tenant-bound and read-only. */
  async statement(actor: ActorContext): Promise<BrokerBillingStatement> {
    if (actor.mfaVerified !== true) this.refuse(actor, "BrokerBillingStatement", "mfa_required");
    if (!actor.partnerTenantId) this.refuse(actor, "BrokerBillingStatement", "missing_broker_tenant");
    if (!actor.roles.some((role) => role.startsWith("broker_"))) this.refuse(actor, "BrokerBillingStatement", "forbidden_role");
    const tenantId = actor.partnerTenantId;
    const period = this.currentMonth();
    const { evaluations, assignments } = await this.evaluateLeads(tenantId, period);
    const billable = evaluations.filter((evaluation) => evaluation.billable && !evaluation.disputeCredited).length;
    const plan = (actor.partnerPlan ?? "starter") as BillingPlanKey;
    const price = await this.priceFor(plan, assignments[0]?.countryCode ?? "CI");
    const packCreditsRemaining = await this.deps.packs.remainingCredits(tenantId);
    const chargeableUnits = Math.max(0, billable - packCreditsRemaining);
    const draft = (await this.deps.repository.listDrafts(tenantId)).find((record) => record.periodFrom.getTime() === period.from.getTime());
    const statement: BrokerBillingStatement = {
      generatedAt: new Date().toISOString(),
      partnerTenantId: tenantId,
      plan,
      billingEnabled: this.deps.featureFlags.isEnabled("billing_enabled"),
      paymentsEnabled: false,
      collectionEnabled: false,
      currency: "XOF",
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      leadsReceived: assignments.length,
      billableLeadCount: billable,
      nonBillableLeadCount: evaluations.filter((evaluation) => !evaluation.billable).length,
      disputeCreditCount: evaluations.filter((evaluation) => evaluation.disputeCredited).length,
      packCreditsRemaining,
      estimatedAmount: price.monthlySubscription + chargeableUnits * price.perLeadPrice,
      draft: draft ? this.toDto(draft) : null,
      notice: DRAFT_NOTICE
    };
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.brokerStatementRead,
      targetType: "BrokerBillingStatement",
      targetId: tenantId,
      scope: { partnerTenantId: tenantId },
      result: "success",
      context: { billableLeadCount: billable, paymentsEnabled: false }
    });
    return statement;
  }

  private async computeForPartner(partnerId: string, partnerName: string, plan: BillingPlanKey, actor: ActorContext, reason: string): Promise<DraftInvoice> {
    const period = this.currentMonth();
    const { evaluations, assignments } = await this.evaluateLeads(partnerId, period);
    const countryCode = assignments[0]?.countryCode ?? "CI";
    const price = await this.priceFor(plan, countryCode);
    const billableEvaluations = evaluations.filter((evaluation) => evaluation.billable);
    const disputeCredits = billableEvaluations.filter((evaluation) => evaluation.disputeCredited).length;
    const netBillable = billableEvaluations.length - disputeCredits;
    const packCreditsUsed = await this.deps.packs.consume(partnerId, netBillable, actor);

    // Chargeable leads, cheapest-priced last: pack credits are applied to the most expensive leads
    // first so a granted credit is always worth the most to the partner.
    const recipientCountById = new Map(assignments.map((assignment) => [assignment.id, assignment.recipientCount ?? 1]));
    const chargeable = billableEvaluations
      .filter((evaluation) => !evaluation.disputeCredited)
      .map((evaluation) => {
        const recipientCount = recipientCountById.get(evaluation.leadAssignmentId) ?? 1;
        return { recipientCount, unitAmount: this.sharedUnitPrice(price.perLeadPrice, recipientCount, price.sharedLeadPriceMultiplier) };
      })
      .sort((left, right) => right.unitAmount - left.unitAmount)
      .slice(packCreditsUsed);

    const exclusive = chargeable.filter((entry) => entry.recipientCount <= 1);
    const sharedByRecipientCount = new Map<number, { quantity: number; unitAmount: number }>();
    for (const entry of chargeable.filter((candidate) => candidate.recipientCount > 1)) {
      const bucket = sharedByRecipientCount.get(entry.recipientCount) ?? { quantity: 0, unitAmount: entry.unitAmount };
      sharedByRecipientCount.set(entry.recipientCount, { quantity: bucket.quantity + 1, unitAmount: entry.unitAmount });
    }

    const lines: DraftInvoiceLine[] = [
      { kind: "subscription", label: `Abonnement ${plan} (${countryCode})`, quantity: 1, unitAmount: price.monthlySubscription, amount: price.monthlySubscription },
      { kind: "billable_leads", label: "Leads qualifies exclusifs (brouillon)", quantity: exclusive.length, unitAmount: price.perLeadPrice, amount: exclusive.length * price.perLeadPrice }
    ];
    for (const [recipientCount, bucket] of [...sharedByRecipientCount.entries()].sort((left, right) => left[0] - right[0])) {
      lines.push({
        kind: "shared_leads",
        label: `Leads partages entre ${recipientCount} courtiers (tarif reduit)`,
        quantity: bucket.quantity,
        unitAmount: bucket.unitAmount,
        amount: Math.round(bucket.quantity * bucket.unitAmount * 100) / 100
      });
    }
    if (packCreditsUsed > 0) lines.push({ kind: "pack_credit", label: "Credits pack consommes", quantity: packCreditsUsed, unitAmount: -price.perLeadPrice, amount: -packCreditsUsed * price.perLeadPrice });
    if (disputeCredits > 0) lines.push({ kind: "dispute_credit", label: "Leads contestes acceptes", quantity: disputeCredits, unitAmount: -price.perLeadPrice, amount: -disputeCredits * price.perLeadPrice });
    const totalAmount = Math.round((price.monthlySubscription + chargeable.reduce((sum, entry) => sum + entry.unitAmount, 0)) * 100) / 100;
    const existing = (await this.deps.repository.listDrafts(partnerId)).find((record) => record.periodFrom.getTime() === period.from.getTime());
    const record: DraftInvoiceRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      partnerId,
      partnerName,
      plan,
      countryCode,
      periodFrom: period.from,
      periodTo: period.to,
      reference: `DRAFT-NON-BILLABLE-${period.from.getUTCFullYear()}-${String(period.from.getUTCMonth() + 1).padStart(2, "0")}-${partnerId.slice(0, 8)}`,
      status: "draft_not_billable",
      currency: "XOF",
      lines,
      billableLeadCount: netBillable,
      nonBillableLeadCount: evaluations.filter((evaluation) => !evaluation.billable).length,
      disputeCreditCount: disputeCredits,
      packCreditsUsed,
      totalAmount,
      computedAt: new Date()
    };
    const saved = await this.deps.repository.upsertDraft(record);
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.draftComputed,
      targetType: "DraftInvoice",
      targetId: saved.id,
      scope: { partnerId, period: { from: period.from.toISOString(), to: period.to.toISOString() } },
      result: "success",
      reason,
      context: {
        billableLeadCount: saved.billableLeadCount,
        nonBillableLeadCount: saved.nonBillableLeadCount,
        disputeCreditCount: saved.disputeCreditCount,
        packCreditsUsed: saved.packCreditsUsed,
        totalAmount: saved.totalAmount,
        status: saved.status,
        paymentsEnabled: false
      }
    });
    return this.toDto(saved);
  }

  private async evaluateLeads(partnerId: string, period: { from: Date; to: Date }) {
    const [assignments, countries, products] = await Promise.all([
      this.deps.assignments.list(),
      this.deps.countries.listAdmin(),
      this.deps.products.listAdmin()
    ]);
    const scoped = assignments.filter((assignment) => assignment.partnerTenantId === partnerId && assignment.assignedAt >= period.from && assignment.assignedAt <= period.to);
    const context = {
      countries: new Map(countries.map((country) => [country.isoCode, country])),
      products: new Map(products.map((product) => [product.key, product])),
      creditedDisputeLeadIds: await this.acceptedDisputeLeadIds(scoped)
    };
    return { assignments: scoped, evaluations: scoped.map((assignment) => this.policy.evaluate(assignment, context)) };
  }

  private async acceptedDisputeLeadIds(assignments: LeadAssignmentRecord[]): Promise<Set<string>> {
    const credited = new Set<string>();
    if (!this.deps.crmActivity) return credited;
    for (const assignment of assignments) {
      const disputes = await this.deps.crmActivity.disputesForLead(assignment.id);
      if (disputes.some((dispute) => dispute.status === "accepted")) credited.add(assignment.id);
    }
    return credited;
  }

  private async priceFor(plan: BillingPlanKey, countryCode: string): Promise<{ monthlySubscription: number; perLeadPrice: number; sharedLeadPriceMultiplier: number }> {
    const prices = await this.deps.repository.listPlanPrices();
    const match = prices.find((price) => price.plan === plan && price.countryCode === countryCode) ?? prices.find((price) => price.plan === plan);
    return {
      monthlySubscription: match?.monthlySubscription ?? 0,
      perLeadPrice: match?.perLeadPrice ?? 0,
      sharedLeadPriceMultiplier: match?.sharedLeadPriceMultiplier ?? SHARED_LEAD_DEFAULT_MULTIPLIER
    };
  }

  /**
   * Spec 042 D1: a lead shared between `recipientCount` brokers costs a fraction of the exclusive
   * price, and the total charged across all recipients of one request is capped at
   * `perLeadPrice x SHARED_LEAD_TOTAL_CAP` - so widening a fan-out can never raise what the
   * platform earns from a single request beyond that ceiling.
   */
  private sharedUnitPrice(perLeadPrice: number, recipientCount: number, multiplier: number): number {
    if (recipientCount <= 1) return perLeadPrice;
    const capped = Math.min(multiplier, SHARED_LEAD_TOTAL_CAP / recipientCount);
    return Math.round(perLeadPrice * capped * 100) / 100;
  }

  private currentMonth(): { from: Date; to: Date } {
    const now = new Date();
    return {
      from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
    };
  }

  private toDto(record: DraftInvoiceRecord): DraftInvoice {
    return {
      id: record.id,
      partnerId: record.partnerId,
      partnerName: record.partnerName,
      plan: record.plan,
      countryCode: record.countryCode,
      periodFrom: record.periodFrom.toISOString(),
      periodTo: record.periodTo.toISOString(),
      reference: record.reference,
      status: "draft_not_billable",
      paymentStatus: "not_applicable",
      currency: "XOF",
      lines: record.lines,
      billableLeadCount: record.billableLeadCount,
      nonBillableLeadCount: record.nonBillableLeadCount,
      disputeCreditCount: record.disputeCreditCount,
      packCreditsUsed: record.packCreditsUsed,
      totalAmount: record.totalAmount,
      computedAt: record.computedAt.toISOString()
    };
  }

  private assertAdmin(actor: ActorContext, mode: "read" | "write"): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "DraftInvoice", "mfa_required");
    const permission = mode === "write" ? "billing:*" : "billing:read";
    if (!actor.roles.some((role) => roleHasPermission(role, permission))) this.refuse(actor, "DraftInvoice", "forbidden_role");
  }

  private refuseDisabled(actor: ActorContext, targetType: string): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.accessRefused,
      targetType,
      targetId: "billing",
      scope: { roles: actor.roles },
      result: "refused",
      reason: "billing_disabled",
      context: { paymentsEnabled: false }
    });
    throw new BillingDisabledError("billing_disabled");
  }

  private refuse(actor: ActorContext, targetType: string, reason: string): never {
    this.deps.audit.write({
      actor,
      action: BillingAuditActions.accessRefused,
      targetType,
      targetId: "billing",
      scope: { roles: actor.roles, partnerTenantId: actor.partnerTenantId ?? null },
      result: "refused",
      reason,
      context: { paymentsEnabled: false }
    });
    throw new BillingAccessRefusedError(reason);
  }
}
