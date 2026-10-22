import type {
  BrokerBillingStatement,
  DraftInvoice,
  DraftInvoiceLine,
  DraftInvoiceQuery,
  DraftInvoiceRecompute,
  BillingPlanKey
} from "../../../../packages/shared/contracts/billing.contracts";
import { BILLING_ADD_ON_LABELS } from "../../../../packages/shared/contracts/billing-addons.contracts";
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
import { addOnActiveDuring, type BillingRepository, type DraftInvoiceRecord } from "./billing.repository";
import type { InvoicingRepository } from "./invoicing.repository";
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
  /** Spec 060: true when the partner's draft for that period already became an active invoice. */
  isPeriodInvoiced?: ((partnerId: string, periodFrom: Date) => Promise<boolean>) | undefined;
  /**
   * Lot 5 (spec 071) H4: true when an ACTIVE (not cancelled by a credit note) issued invoice of the partner
   * already carries the one-time `setup_fee` line. See `setupFeeInvoicedPort` for the runtime implementation.
   */
  hasActiveSetupFeeInvoice?: ((partnerId: string) => Promise<boolean>) | undefined;
  /**
   * Lot 5 (spec 071): among these quote request ids, the ones the duplicate detection blocked
   * (duplicateStatus blocked_duplicate or status duplicate). Absent: only the CRM status `doublon` counts.
   */
  quoteDuplicates?: ((quoteRequestIds: string[]) => Promise<Set<string>>) | undefined;
  /** Lot 5 (spec 071) G-06: plan effective at `at` (a plan change is effective next cycle). Absent: the current plan. */
  effectivePlan?: ((partnerId: string, currentPlan: BillingPlanKey, at: Date) => Promise<BillingPlanKey>) | undefined;
}

/** Runtime implementation of `DraftInvoiceDeps.hasActiveSetupFeeInvoice` from the invoicing repository. */
export function setupFeeInvoicedPort(invoicing: Pick<InvoicingRepository, "listInvoices">): (partnerId: string) => Promise<boolean> {
  return async (partnerId) => (await invoicing.listInvoices({ partnerId })).some((invoice) => invoice.status !== "cancelled" && invoice.lines.some((line) => line.kind === "setup_fee" && !line.informational));
}

/**
 * Spec 060: the draft is still an estimate; the invoice is issued separately by finance (manual
 * invoicing, decision D-8) and paid outside the platform.
 */
const DRAFT_NOTICE = "Brouillon non facturable: estimation du mois en cours, aucun encaissement en ligne et aucune prime collectee par AssurMatch. La facture du mois est emise separement par la finance.";

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
    const period = this.currentMonth();
    for (const partner of partners) {
      // Spec 060 R-6: an invoiced draft stays aligned with its immutable invoice (and pack credits
      // are not consumed twice); cancelling the invoice with a credit note re-opens recomputation.
      if (await this.deps.isPeriodInvoiced?.(partner.id, period.from)) {
        const existing = (await this.deps.repository.listDrafts(partner.id)).find((record) => record.periodFrom.getTime() === period.from.getTime());
        if (existing) {
          drafts.push(this.toDto(existing));
          continue;
        }
      }
      drafts.push(await this.computeForPartner(partner.id, partner.legalName, partner.plan as BillingPlanKey, actor, parsed.reason));
    }
    return drafts;
  }

  /** Broker-facing consumption view (DASH-B-008); strictly tenant-bound and read-only. */
  async statement(actor: ActorContext): Promise<BrokerBillingStatement> {
    if (actor.mfaVerified !== true) this.refuse(actor, "BrokerBillingStatement", "mfa_required");
    if (!actor.partnerTenantId) this.refuse(actor, "BrokerBillingStatement", "missing_broker_tenant");
    // Spec 060 FR-16: owners, managers and read-only members read billing; agents do not.
    if (!actor.roles.some((role) => role.startsWith("broker_") && roleHasPermission(role, "billing:read_own"))) this.refuse(actor, "BrokerBillingStatement", "forbidden_role");
    const tenantId = actor.partnerTenantId;
    const period = this.currentMonth();
    const { evaluations, assignments } = await this.evaluateLeads(tenantId, period);
    const billable = evaluations.filter((evaluation) => evaluation.billable && !evaluation.disputeCredited).length;
    const plan = await this.resolvePlan(tenantId, (actor.partnerPlan ?? "starter") as BillingPlanKey, period.from);
    const statementCountry = assignments[0]?.countryCode ?? "CI";
    const price = await this.priceFor(plan, statementCountry);
    const packCreditsRemaining = await this.deps.packs.remainingCredits(tenantId);
    const chargeableUnits = Math.max(0, billable - packCreditsRemaining);
    const draft = (await this.deps.repository.listDrafts(tenantId)).find((record) => record.periodFrom.getTime() === period.from.getTime());
    const extras = await this.extraLines({ partnerId: tenantId, plan, countryCode: statementCountry, period, setupFee: price.setupFee, existingDraft: draft });
    const extrasAmount = [...(extras.setupFee ? [extras.setupFee] : []), ...extras.addOns].reduce((sum, line) => sum + line.amount, 0);
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
      estimatedAmount: price.monthlySubscription + chargeableUnits * price.perLeadPrice + extrasAmount,
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

  /**
   * Spec 063 FR-B06: an accepted dispute in "draft_invoice" mode must reach the draft of the lead's
   * month even when it was computed before the decision (and even for a past month, which the monthly
   * recompute never revisits). Only an existing, not yet invoiced draft is refreshed; pack credits are
   * applied idempotently (see computeForPartner). Returns undefined when nothing had to be done.
   */
  async refreshDraftForPeriod(partnerId: string, periodFrom: Date, actor: ActorContext, reason: string): Promise<DraftInvoice | undefined> {
    if (!this.deps.featureFlags.isEnabled("billing_enabled")) return undefined;
    if (await this.deps.isPeriodInvoiced?.(partnerId, periodFrom)) return undefined;
    const existing = (await this.deps.repository.listDrafts(partnerId)).find((record) => record.periodFrom.getTime() === periodFrom.getTime());
    if (!existing) return undefined;
    const partner = (await this.deps.partners.list()).find((candidate) => candidate.id === partnerId);
    if (!partner) return undefined;
    const period = { from: periodFrom, to: new Date(Date.UTC(periodFrom.getUTCFullYear(), periodFrom.getUTCMonth() + 1, 0, 23, 59, 59, 999)) };
    return this.computeForPartner(partner.id, partner.legalName, partner.plan as BillingPlanKey, actor, reason, period);
  }

  private async computeForPartner(partnerId: string, partnerName: string, currentPlan: BillingPlanKey, actor: ActorContext, reason: string, period: { from: Date; to: Date } = this.currentMonth()): Promise<DraftInvoice> {
    const plan = await this.resolvePlan(partnerId, currentPlan, period.from);
    const { evaluations, assignments } = await this.evaluateLeads(partnerId, period);
    const countryCode = assignments[0]?.countryCode ?? "CI";
    const price = await this.priceFor(plan, countryCode);
    const billableEvaluations = evaluations.filter((evaluation) => evaluation.billable);
    const disputeCredits = billableEvaluations.filter((evaluation) => evaluation.disputeCredited).length;
    const netBillable = billableEvaluations.length - disputeCredits;
    // Spec 063: pack consumption is idempotent per draft. The draft remembers what it already consumed,
    // so a repeated or refreshed computation only consumes (or releases) the difference.
    const existing = (await this.deps.repository.listDrafts(partnerId)).find((record) => record.periodFrom.getTime() === period.from.getTime());
    const previouslyUsed = existing?.packCreditsUsed ?? 0;
    const packCreditsUsed = Math.min(netBillable, previouslyUsed + (await this.deps.packs.remainingCredits(partnerId)));
    if (packCreditsUsed > previouslyUsed) await this.deps.packs.consume(partnerId, packCreditsUsed - previouslyUsed, actor);
    else if (packCreditsUsed < previouslyUsed) await this.deps.packs.release(partnerId, previouslyUsed - packCreditsUsed, actor);

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
    // Lot 5 (spec 071) H4: one-time setup fee on the first invoice and optional monthly add-ons.
    const extras = await this.extraLines({ partnerId, plan, countryCode, period, setupFee: price.setupFee, existingDraft: existing });
    if (extras.setupFee) lines.push(extras.setupFee);
    lines.push(...extras.addOns);
    const extrasAmount = [...(extras.setupFee ? [extras.setupFee] : []), ...extras.addOns].reduce((sum, line) => sum + line.amount, 0);
    const totalAmount = Math.round((price.monthlySubscription + chargeable.reduce((sum, entry) => sum + entry.unitAmount, 0) + extrasAmount) * 100) / 100;
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
    if (extras.setupFee && !existing?.lines.some((line) => line.kind === "setup_fee")) {
      this.deps.audit.write({
        actor,
        action: BillingAuditActions.setupFeeBilled,
        targetType: "DraftInvoice",
        targetId: saved.id,
        scope: { partnerId, plan, countryCode, period: { from: period.from.toISOString(), to: period.to.toISOString() } },
        result: "success",
        reason,
        context: { amount: extras.setupFee.amount, paymentsEnabled: false }
      });
    }
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
      creditedDisputeLeadIds: await this.acceptedDisputeLeadIds(scoped, partnerId, period.from),
      duplicateQuoteRequestIds: this.deps.quoteDuplicates ? await this.deps.quoteDuplicates([...new Set(scoped.map((assignment) => assignment.quoteRequestId))]) : undefined
    };
    return { assignments: scoped, evaluations: scoped.map((assignment) => this.policy.evaluate(assignment, context)) };
  }

  private async acceptedDisputeLeadIds(assignments: LeadAssignmentRecord[], partnerId: string, periodFrom: Date): Promise<Set<string>> {
    const credited = new Set<string>();
    if (!this.deps.crmActivity) return credited;
    // Spec 063: a dispute settled by a partial credit note stays credited on that invoice. If the invoice
    // was cancelled since (no active invoice for the period), the re-issued invoice must carry the credit.
    const periodInvoiced = await this.deps.isPeriodInvoiced?.(partnerId, periodFrom) ?? false;
    for (const assignment of assignments) {
      const disputes = await this.deps.crmActivity.disputesForLead(assignment.id);
      // Spec 063: a dispute settled by a partial credit note ("credit_note") or by hand ("none") must not
      // be credited a second time on the draft; legacy accepted rows (no mode) keep the draft credit.
      if (disputes.some((dispute) => dispute.status === "accepted" && (dispute.creditMode === undefined || dispute.creditMode === "draft_invoice" || (dispute.creditMode === "credit_note" && !periodInvoiced)))) credited.add(assignment.id);
    }
    return credited;
  }

  private async resolvePlan(partnerId: string, currentPlan: BillingPlanKey, at: Date): Promise<BillingPlanKey> {
    return (await this.deps.effectivePlan?.(partnerId, currentPlan, at)) ?? currentPlan;
  }

  /**
   * Lot 5 (spec 071) H4. Setup fee: billed once, on the broker's first invoice. The period's draft carries the
   * line when setupFee > 0, no ACTIVE issued invoice carries it yet (a credit-noted invoice re-opens it) and no
   * OTHER period's draft carries it. A draft recomputed for its own period keeps its line (idempotent).
   * Add-ons: one line per kind active during the period (assigned before its end, not ended before its start)
   * with an ENABLED price for the effective plan and country; no enabled price means no line.
   */
  private async extraLines(input: { partnerId: string; plan: BillingPlanKey; countryCode: string; period: { from: Date; to: Date }; setupFee: number; existingDraft?: DraftInvoiceRecord | undefined }): Promise<{ setupFee?: DraftInvoiceLine; addOns: DraftInvoiceLine[] }> {
    let setupFeeLine: DraftInvoiceLine | undefined;
    if (input.setupFee > 0) {
      const alreadyInvoiced = (await this.deps.hasActiveSetupFeeInvoice?.(input.partnerId)) ?? false;
      const carriedByOtherDraft = (await this.deps.repository.listDrafts(input.partnerId)).some((record) => record.periodFrom.getTime() !== input.period.from.getTime() && record.lines.some((line) => line.kind === "setup_fee"));
      if (!alreadyInvoiced && !carriedByOtherDraft) setupFeeLine = { kind: "setup_fee", label: "Frais d'installation (premiere facture)", quantity: 1, unitAmount: input.setupFee, amount: input.setupFee };
    }
    const [addOns, prices] = await Promise.all([this.deps.repository.listPartnerAddOns(input.partnerId), this.deps.repository.listAddOnPrices()]);
    const addOnLines: DraftInvoiceLine[] = [];
    const seen = new Set<string>();
    for (const addOn of addOns) {
      if (seen.has(addOn.kind) || !addOnActiveDuring(addOn, input.period)) continue;
      const price = prices.find((candidate) => candidate.kind === addOn.kind && candidate.plan === input.plan && candidate.countryCode === input.countryCode && candidate.enabled);
      if (!price) continue;
      seen.add(addOn.kind);
      addOnLines.push({ kind: "add_on", label: `${BILLING_ADD_ON_LABELS[addOn.kind]} (mensuel)`, quantity: 1, unitAmount: price.monthlyAmount, amount: price.monthlyAmount });
    }
    return { ...(setupFeeLine ? { setupFee: setupFeeLine } : {}), addOns: addOnLines };
  }

  private async priceFor(plan: BillingPlanKey, countryCode: string): Promise<{ monthlySubscription: number; perLeadPrice: number; sharedLeadPriceMultiplier: number; setupFee: number }> {
    const prices = await this.deps.repository.listPlanPrices();
    const match = prices.find((price) => price.plan === plan && price.countryCode === countryCode) ?? prices.find((price) => price.plan === plan);
    return {
      monthlySubscription: match?.monthlySubscription ?? 0,
      perLeadPrice: match?.perLeadPrice ?? 0,
      sharedLeadPriceMultiplier: match?.sharedLeadPriceMultiplier ?? SHARED_LEAD_DEFAULT_MULTIPLIER,
      setupFee: match?.setupFee ?? 0
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
