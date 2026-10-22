import type { AiInteraction, BrokerAiOptOutStatus, BrokerAiPriorityScore, BrokerAiPriorityScores, BrokerLeadAssistType, BrokerManagerAnalysis, BrokerTenantAssistType } from "../../../../packages/shared/contracts/ai.contracts";
import { aiHumanValidationDecisionSchema, aiLeadScoreSchema, brokerAiInsightRequestSchema, brokerAiOptOutSchema, brokerAiRequestSchema, brokerLeadAssistTypeSchema } from "../../../../packages/shared/contracts/ai.contracts";
import type { PartnerStatus } from "../../../../packages/shared/contracts/partner.contracts";
import type { BrokerCrmLeadDetail, BrokerCrmPipelineStatus } from "../../../../packages/shared/contracts/quote.contracts";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { actorHasPermission } from "../common/rbac/actor-permissions";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { BrokerCrmAccessPolicy } from "../leads/broker-crm-access-policy";
import type { BrokerCrmLeadsService } from "../leads/broker-crm-leads.service";
import { firstVisibleReplyMinutes } from "../leads/first-visible-reply";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../leads/lead-assignment.service";
import type { ProductsService } from "../products/products.module";
import { AiAuditActions } from "./core/ai-audit-actions";
import { AI_PARTNER_OPT_OUT_FLAG, type AiGateway, type AiGatewayScope, type PartnerPlan } from "./core/ai-gateway.service";
import type { AiInteractionRecord } from "./core/ai-interactions.repository";

export interface BrokerAiDeps {
  audit: AuditLogWriter;
  gateway: AiGateway;
  featureFlags: FeatureFlagsService;
  crmLeads: BrokerCrmLeadsService;
  assignments: LeadAssignmentService;
  access: BrokerCrmAccessPolicy;
  countries: CountriesService;
  products: ProductsService;
  /**
   * DASH-B-009: optional dashboard aggregates of the caller's perimeter. Whatever it returns is reduced
   * to bounded numeric aggregates before reaching the gateway (no free text, no identifier, no prospect).
   */
  performanceInput?: ((actor: ActorContext, query: Record<string, unknown>) => Promise<Record<string, unknown>>) | undefined;
  /** Plan and status of a partner tenant, for system callers (scheduled alerts) that carry no actor plan. Absent: no AI for them. */
  partnerProfile?: ((partnerTenantId: string) => Promise<BrokerAiPartnerProfile | undefined>) | undefined;
}

export interface BrokerAiPartnerProfile {
  plan: PartnerPlan;
  status: PartnerStatus;
}

/** Counters of one tenant's week, as computed by the scheduled alerts worker (no prospect data). */
export type BrokerWeeklyStats = Record<string, unknown>;

const DRAFTING_ASSISTS: ReadonlySet<BrokerLeadAssistType> = new Set(["next_action", "relaunch_message"]);
const DUPLICATE_WINDOW_MS = 30 * 24 * 3600 * 1000;
const LOSS_WINDOW_MS = 90 * 24 * 3600 * 1000;
const LOSS_ANALYSES_LIST_LIMIT = 10;
const DAY_MS = 24 * 3600 * 1000;
/** An open lead without any activity for this long counts as "en retard" in the steering aggregates. */
const OVERDUE_AFTER_HOURS = 72;
const MANAGER_MAX_ADVISORS = 50;
const CLOSED_PIPELINE_STATUSES: ReadonlySet<BrokerCrmPipelineStatus> = new Set(["gagne", "perdu", "doublon", "hors_cible", "rejete_conteste"]);
export const BROKER_WEEKLY_AI_SUMMARY_FLAG = "broker_weekly_ai_summary_enabled";
const WEEKLY_SUMMARY_ACTOR_ID = "system:scheduled-alerts";
const AI_ELIGIBLE_PARTNER_STATUSES: ReadonlySet<PartnerStatus> = new Set(["active", "active_test"]);
const CRM_PLANS: ReadonlySet<PartnerPlan> = new Set(["pro", "enterprise"]);

/**
 * Broker CRM AI assistance (PRD §10.2). Every request first passes the CRM access policy (tenant,
 * MFA, plan, permissions) through the existing lead detail read, then the central gateway. Contact
 * data never enters the prompt: only `hasEmail` / `hasPhone` booleans and minimized answers.
 */
export class BrokerAiService {
  constructor(private readonly deps: BrokerAiDeps) {}

  async requestForLead(leadId: string, assistTypeInput: string, body: unknown, actor: ActorContext): Promise<AiInteraction> {
    const assistType = brokerLeadAssistTypeSchema.parse(assistTypeInput);
    const parsed = brokerAiRequestSchema.parse(body ?? {});
    const detail = await this.deps.crmLeads.detail(leadId, actor);
    const assignment = await this.deps.assignments.require(leadId);
    if (DRAFTING_ASSISTS.has(assistType)) this.deps.access.assertMutation(actor, assignment);
    const input = assistType === "duplicate_hint" ? { ...this.leadInput(detail, assignment), ...(await this.duplicateInput(assignment)) } : this.leadInput(detail, assignment);
    const record = await this.deps.gateway.run({
      assistType,
      surface: "broker_crm",
      actor,
      input,
      language: parsed.language,
      target: { type: "LeadAssignment", id: leadId },
      scope: await this.scopeFor(actor, assignment),
      quotaKey: this.tenantOf(actor)
    }, { wait: false });
    return this.deps.gateway.toDto(record);
  }

  /** Tenant-level analysis of lost leads (Enterprise plan, enforced by the gateway). */
  async lossAnalysis(actor: ActorContext, body: unknown): Promise<AiInteraction> {
    const parsed = brokerAiRequestSchema.parse(body ?? {});
    const since = Date.now() - LOSS_WINDOW_MS;
    const lost = (await this.deps.crmLeads.applyFilters(actor, { status: "perdu" })).filter((assignment) => assignment.assignedAt.getTime() >= since);
    const reasons = this.countBy(lost, (assignment) => assignment.actionReason ?? "non_renseigne");
    const byProduct = this.countBy(lost, (assignment) => assignment.productKey ?? "unknown");
    const record = await this.deps.gateway.run({
      assistType: "loss_analysis",
      surface: "broker_crm",
      actor,
      input: { lostCount: lost.length, reasons, byProduct, windowDays: 90 },
      language: parsed.language,
      target: { type: "PartnerTenant", id: this.tenantOf(actor) },
      scope: { partnerTenantId: this.tenantOf(actor), plan: actor.partnerPlan as PartnerPlan | undefined },
      quotaKey: this.tenantOf(actor)
    }, { wait: false });
    return this.deps.gateway.toDto(record);
  }

  /**
   * Spec 064 (FR-003): the recent loss analyses of the caller's own tenant (newest first, at most 10).
   * The tenant is never taken from the request: only interactions stored for the actor's partner
   * tenant and the CRM surface are returned.
   */
  async listLossAnalyses(actor: ActorContext): Promise<AiInteraction[]> {
    this.deps.access.assertCrmAccess(actor);
    // Tenant-wide aggregates: never shown to an assigned-only agent (same rule as the sensitive search), nor to a non Enterprise plan.
    if (!this.deps.access.canSeeSensitiveSearch(actor) || actor.partnerPlan !== "enterprise") throw new Error("Loss analysis access denied");
    const tenant = this.tenantOf(actor);
    const records = (await this.deps.gateway.listForTarget("PartnerTenant", tenant))
      .filter((record) => record.assistType === "loss_analysis" && record.surface === "broker_crm" && record.partnerTenantId === tenant)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, LOSS_ANALYSES_LIST_LIMIT);
    this.deps.audit.write({ actor, action: AiAuditActions.read, targetType: "AIInteraction", targetId: "loss_analysis_list", scope: { surface: "broker_crm", partnerTenantId: tenant }, result: "success", context: { assistType: "loss_analysis", count: records.length } });
    return records.map((record) => this.deps.gateway.toDto(record));
  }

  /**
   * DASH-B-009 "Générer résumé IA de performance": tenant-level, Pro and Enterprise (the gateway refuses
   * Starter and an unknown plan). The model only sees aggregates of the caller's perimeter; the output
   * stays pending until a human validates it (steering insight).
   */
  async performanceSummary(actor: ActorContext, body: unknown): Promise<AiInteraction> {
    const parsed = brokerAiInsightRequestSchema.parse(body ?? {});
    this.assertTenantInsightAccess(actor);
    const rows = await this.deps.crmLeads.applyFilters(actor, {});
    const dashboard = await this.dashboardAggregates(actor, parsed.windowDays);
    const input = { ...this.performanceAggregates(rows, parsed.windowDays), ...(dashboard ? { dashboard } : {}) };
    const record = await this.runTenantInsight("performance_summary", actor, input, parsed.language);
    return this.deps.gateway.toDto(record);
  }

  /**
   * PRD 10.2 "assistant manager" (Enterprise only, like the loss analysis): workload and lateness per
   * advisor. Advisors reach the model as neutral labels (C1, C2...); the label map is kept on the
   * interaction server side and returned to the manager only.
   */
  async managerAssistant(actor: ActorContext, body: unknown): Promise<BrokerManagerAnalysis> {
    const parsed = brokerAiInsightRequestSchema.parse(body ?? {});
    this.assertTenantInsightAccess(actor);
    const rows = await this.deps.crmLeads.applyFilters(actor, {});
    const { input, advisorLabels } = this.managerAggregates(rows, parsed.windowDays);
    const record = await this.runTenantInsight("manager_assistant", actor, input, parsed.language, { advisorLabels });
    return this.toManagerAnalysis(record);
  }

  /** The recent performance summaries of the caller's own tenant (newest first, at most 10). */
  async listPerformanceSummaries(actor: ActorContext): Promise<AiInteraction[]> {
    return (await this.listTenantInsights(actor, "performance_summary")).map((record) => this.deps.gateway.toDto(record));
  }

  /** The recent manager analyses of the caller's own tenant (Enterprise only, newest first, at most 10). */
  async listManagerAnalyses(actor: ActorContext): Promise<BrokerManagerAnalysis[]> {
    this.assertTenantInsightAccess(actor);
    if (actor.partnerPlan !== "enterprise") throw new Error("Manager analysis access denied");
    return (await this.listTenantInsights(actor, "manager_assistant")).map((record) => this.toManagerAnalysis(record));
  }

  /**
   * CRM-015: the human-approved indicative priority scores of the leads in the caller's CRM perimeter
   * (role, agency and tenant through `applyFilters`). Lead scoring closed (flag, partner opt-out, plan)
   * answers `enabled: false` with no score; this method never calls a model.
   */
  async priorityScores(actor: ActorContext): Promise<BrokerAiPriorityScores> {
    const tenant = this.tenantOf(actor);
    // Starter has no CRM: it learns only that scoring is closed for it.
    if (actor.partnerPlan !== "starter") this.deps.access.assertCrmAccess(actor);
    const plan = this.planOf(actor);
    if (!this.leadScoringEnabled(tenant, plan)) return { enabled: false, scores: {} };
    const rows = await this.deps.crmLeads.applyFilters(actor, {});
    const scores = await this.approvedScores(tenant, plan, rows);
    this.deps.audit.write({ actor, action: AiAuditActions.read, targetType: "AIInteraction", targetId: "priority_scores", scope: { surface: "broker_crm", partnerTenantId: tenant }, result: "success", context: { assistType: "lead_score", count: scores.size, modelCall: false } });
    return { enabled: true, scores: Object.fromEntries(scores) };
  }

  /**
   * Internal port for the CRM lists (they do not depend on the AI module): approved scores of the given
   * leads of one tenant. Leads of another tenant are ignored; the caller owns the perimeter check.
   */
  async priorityScoreMap(partnerTenantId: string, leadIds: readonly string[], plan: PartnerPlan | undefined): Promise<Map<string, BrokerAiPriorityScore>> {
    if (leadIds.length === 0 || !this.leadScoringEnabled(partnerTenantId, plan)) return new Map();
    const wanted = new Set(leadIds);
    const rows = (await this.deps.assignments.list()).filter((assignment) => wanted.has(assignment.id) && assignment.partnerTenantId === partnerTenantId);
    return this.approvedScores(partnerTenantId, plan, rows);
  }

  /** `(actor) => Map<leadId, score>` port for the CRM list service: the actor's perimeter only, never throws. */
  async priorityScoreMapFor(actor: ActorContext): Promise<Map<string, number>> {
    try {
      const plan = this.planOf(actor);
      if (!actor.partnerTenantId || !this.leadScoringEnabled(actor.partnerTenantId, plan)) return new Map();
      const scores = await this.approvedScores(actor.partnerTenantId, plan, await this.deps.crmLeads.applyFilters(actor, {}));
      return new Map([...scores].map(([leadId, entry]) => [leadId, entry.score]));
    } catch {
      return new Map();
    }
  }

  /**
   * PRD section 23 weekly summary, composed for the scheduled alerts worker with a system actor of the
   * tenant. Returns `undefined` (the worker keeps its deterministic text) unless the weekly AI flag, the
   * AI summary flag, the partner opt-out, the plan (Pro/Enterprise) and the partner status all allow it.
   * The text is descriptive only (guardrail `advice_not_allowed`), hence no per-message validation.
   */
  async weeklySummaryText(partnerTenantId: string, stats: BrokerWeeklyStats, language: "fr" | "en" = "fr"): Promise<string | undefined> {
    if (!partnerTenantId || !this.deps.featureFlags.isEnabled(BROKER_WEEKLY_AI_SUMMARY_FLAG)) return undefined;
    if (!this.deps.featureFlags.isEnabledOrDefault(BROKER_WEEKLY_AI_SUMMARY_FLAG, true, "partner", partnerTenantId)) return undefined;
    const profile = await this.deps.partnerProfile?.(partnerTenantId).catch(() => undefined);
    if (!profile || !CRM_PLANS.has(profile.plan) || !AI_ELIGIBLE_PARTNER_STATUSES.has(profile.status)) return undefined;
    const scope: AiGatewayScope = { partnerTenantId, plan: profile.plan };
    if (!this.deps.gateway.isEnabled("weekly_summary", scope).enabled) return undefined;
    const actor: ActorContext = { actorId: WEEKLY_SUMMARY_ACTOR_ID, roles: [], partnerTenantId, partnerPlan: profile.plan, mfaVerified: true };
    try {
      const record = await this.deps.gateway.run({
        assistType: "weekly_summary",
        surface: "broker_crm",
        actor,
        input: boundAggregates(stats),
        language,
        target: { type: "PartnerTenant", id: partnerTenantId },
        scope,
        quotaKey: partnerTenantId
      }, { wait: true });
      return record.status === "completed" && record.outputText ? record.outputText : undefined;
    } catch {
      // Quota exceeded or provider chain failure: the worker keeps its deterministic text.
      return undefined;
    }
  }

  async read(id: string, actor: ActorContext): Promise<AiInteraction> {
    this.deps.access.assertCrmAccess(actor);
    const record = await this.requireTenantRecord(id, actor);
    // Tenant-level insights (aggregates of the whole cabinet) stay with the roles that see them.
    if (record.targetType === "PartnerTenant" && !this.deps.access.canSeeSensitiveSearch(actor)) throw new Error("AI interaction not found");
    this.deps.audit.write({ actor, action: AiAuditActions.read, targetType: "AIInteraction", targetId: id, scope: { surface: "broker_crm", partnerTenantId: record.partnerTenantId }, result: "success", context: { status: record.status, assistType: record.assistType } });
    return this.deps.gateway.toDto(record);
  }

  async listForLead(leadId: string, actor: ActorContext): Promise<AiInteraction[]> {
    const assignment = await this.deps.assignments.require(leadId);
    this.deps.access.assertLeadRead(actor, assignment);
    const records = await this.deps.gateway.listForTarget("LeadAssignment", leadId);
    return records.filter((record) => record.partnerTenantId === actor.partnerTenantId).map((record) => this.deps.gateway.toDto(record));
  }

  /** Human validation of a sensitive suggestion; requires CRM mutation rights on the lead. */
  async validate(id: string, body: unknown, actor: ActorContext): Promise<AiInteraction> {
    const parsed = aiHumanValidationDecisionSchema.parse(body ?? {});
    this.deps.access.assertCrmAccess(actor);
    const record = await this.requireTenantRecord(id, actor);
    if (record.targetType === "LeadAssignment" && record.targetId) {
      this.deps.access.assertMutation(actor, await this.deps.assignments.require(record.targetId));
    } else if (actor.roles.includes("broker_read_only") || !actorHasPermission(actor, "broker_crm:update")) {
      throw new Error("AI decision denied: CRM update permission required");
    }
    if (record.status !== "completed") throw new Error("Invalid validation: the AI interaction is not completed");
    const updated = await this.deps.gateway.validate(id, parsed.decision, actor);
    return this.deps.gateway.toDto(updated);
  }

  optOutStatus(actor: ActorContext): BrokerAiOptOutStatus {
    this.deps.access.assertCrmAccess(actor);
    const tenant = this.tenantOf(actor);
    const flag = this.deps.featureFlags.list().find((entry) => entry.key === AI_PARTNER_OPT_OUT_FLAG && entry.scopeType === "partner" && entry.scopeId === tenant);
    return { partnerTenantId: tenant, optedOut: flag?.value ?? false, updatedAt: flag ? flag.changedAt.toISOString() : null };
  }

  /** Partner opt-out (Constitution: partner can refuse AI on its data); owner permission required. */
  async setOptOut(actor: ActorContext, body: unknown): Promise<BrokerAiOptOutStatus> {
    this.deps.access.assertCrmAccess(actor);
    const parsed = brokerAiOptOutSchema.parse(body ?? {});
    if (!actorHasPermission(actor, "broker_crm:*")) throw new Error("AI opt-out change denied: owner permission required");
    const tenant = this.tenantOf(actor);
    await this.deps.featureFlags.setFlag({ key: AI_PARTNER_OPT_OUT_FLAG, scopeType: "partner", scopeId: tenant, value: parsed.optOut, reason: parsed.reason }, actor);
    this.deps.audit.write({ actor, action: AiAuditActions.partnerOptOutChanged, targetType: "PartnerTenant", targetId: tenant, scope: { partnerTenantId: tenant }, result: "success", reason: parsed.reason, context: { optOut: parsed.optOut } });
    return this.optOutStatus(actor);
  }

  private leadInput(detail: BrokerCrmLeadDetail, assignment: LeadAssignmentRecord): Record<string, unknown> {
    const contact = assignment.contact ?? {};
    const answers = detail.answers;
    const missing = Object.entries(answers).filter(([, value]) => value === null || value === undefined || value === "").map(([key]) => key);
    const lastActivity = assignment.crmUpdatedAt ?? assignment.lastBrokerActionAt ?? assignment.assignedAt;
    return {
      countryCode: detail.countryCode,
      productKey: detail.productKey,
      status: detail.status,
      urgency: detail.urgency,
      source: detail.source,
      assignedAt: detail.assignedAt,
      lastActivityAt: lastActivity.toISOString(),
      answers,
      missing: missing.length > 0 ? missing : "aucun",
      hasEmail: typeof contact.email === "string" && contact.email.length > 0,
      hasPhone: typeof contact.phone === "string" && contact.phone.length > 0,
      notesCount: detail.notes.length,
      tasksCount: detail.tasks.length,
      documentsCount: detail.documents.length,
      proposalsCount: detail.proposals.length,
      historyCount: detail.history.length
    };
  }

  /** Duplicate signals stay inside the tenant: same contact (normalized) or identical answers within 30 days. */
  private async duplicateInput(assignment: LeadAssignmentRecord): Promise<Record<string, unknown>> {
    const since = Date.now() - DUPLICATE_WINDOW_MS;
    const contact = assignment.contact ?? {};
    const email = typeof contact.email === "string" ? contact.email.trim().toLowerCase() : "";
    const phone = typeof contact.phone === "string" ? contact.phone.replace(/\D/g, "") : "";
    const answersKey = JSON.stringify(assignment.answers ?? {});
    const similar = (await this.deps.assignments.list())
      .filter((candidate) => candidate.id !== assignment.id && candidate.partnerTenantId === assignment.partnerTenantId && candidate.assignedAt.getTime() >= since)
      .map((candidate) => {
        const candidateContact = candidate.contact ?? {};
        const matchedOn: string[] = [];
        if (email && typeof candidateContact.email === "string" && candidateContact.email.trim().toLowerCase() === email) matchedOn.push("email");
        if (phone && typeof candidateContact.phone === "string" && candidateContact.phone.replace(/\D/g, "") === phone) matchedOn.push("phone");
        if (candidate.productKey === assignment.productKey && candidate.countryCode === assignment.countryCode && JSON.stringify(candidate.answers ?? {}) === answersKey) matchedOn.push("answers");
        return { candidate, matchedOn };
      })
      .filter((entry) => entry.matchedOn.length > 0)
      .slice(0, 10)
      .map((entry) => ({ publicReference: entry.candidate.publicReference ?? entry.candidate.quoteRequestId, status: entry.candidate.crmStatus ?? entry.candidate.status, assignedAt: entry.candidate.assignedAt.toISOString(), matchedOn: entry.matchedOn }));
    return { similarCount: similar.length, similar, windowDays: 30 };
  }

  private async scopeFor(actor: ActorContext, assignment: LeadAssignmentRecord): Promise<AiGatewayScope> {
    return this.leadScope(this.tenantOf(actor), actor.partnerPlan as PartnerPlan | undefined, assignment);
  }

  private async leadScope(partnerTenantId: string, plan: PartnerPlan | undefined, assignment: LeadAssignmentRecord): Promise<AiGatewayScope> {
    const country = assignment.countryCode ? await this.deps.countries.findByIsoCode(assignment.countryCode) : undefined;
    const product = assignment.productKey ? await this.deps.products.findByKey(assignment.productKey) : undefined;
    return {
      partnerTenantId,
      plan,
      ...(country ? { countryId: country.id, countryFlags: country.flags } : {}),
      ...(product ? { productId: product.id, productFlags: product.flags } : {})
    };
  }

  /** Tenant-wide aggregates: never for an assigned-only agent (same rule as the sensitive search and the loss analyses). */
  private assertTenantInsightAccess(actor: ActorContext): void {
    this.deps.access.assertCrmAccess(actor);
    if (!this.deps.access.canSeeSensitiveSearch(actor)) throw new Error("AI insight access denied");
  }

  private async runTenantInsight(assistType: BrokerTenantAssistType, actor: ActorContext, input: Record<string, unknown>, language: "fr" | "en", context?: Record<string, unknown>): Promise<AiInteractionRecord> {
    const tenant = this.tenantOf(actor);
    return this.deps.gateway.run({
      assistType,
      surface: "broker_crm",
      actor,
      input,
      language,
      target: { type: "PartnerTenant", id: tenant },
      scope: { partnerTenantId: tenant, plan: this.planOf(actor) },
      quotaKey: tenant,
      ...(context ? { context } : {})
    }, { wait: false });
  }

  /** Tenant read from the actor, never from the request; the list read is audited. */
  private async listTenantInsights(actor: ActorContext, assistType: BrokerTenantAssistType): Promise<AiInteractionRecord[]> {
    this.assertTenantInsightAccess(actor);
    const tenant = this.tenantOf(actor);
    const records = (await this.deps.gateway.listForTarget("PartnerTenant", tenant))
      .filter((record) => record.assistType === assistType && record.surface === "broker_crm" && record.partnerTenantId === tenant)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, LOSS_ANALYSES_LIST_LIMIT);
    this.deps.audit.write({ actor, action: AiAuditActions.read, targetType: "AIInteraction", targetId: `${assistType}_list`, scope: { surface: "broker_crm", partnerTenantId: tenant }, result: "success", context: { assistType, count: records.length } });
    return records;
  }

  private toManagerAnalysis(record: AiInteractionRecord): BrokerManagerAnalysis {
    const context = record.scope.context as { advisorLabels?: unknown } | undefined;
    const labels = context?.advisorLabels && typeof context.advisorLabels === "object" ? context.advisorLabels as Record<string, unknown> : {};
    const advisorLabels = Object.fromEntries(Object.entries(labels).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    return { ...this.deps.gateway.toDto(record), advisorLabels };
  }

  private planOf(actor: ActorContext): PartnerPlan | undefined {
    return actor.partnerPlan;
  }

  /** Lead scoring at tenant level: Pro/Enterprise only (an unknown plan is closed), flag and partner opt-out through the gateway. */
  private leadScoringEnabled(partnerTenantId: string, plan: PartnerPlan | undefined): boolean {
    if (!plan || !CRM_PLANS.has(plan)) return false;
    return this.deps.gateway.isEnabled("lead_score", { partnerTenantId, plan }).enabled;
  }

  /**
   * The latest `lead_score` interaction of each lead, kept only when it belongs to the tenant, is
   * completed AND human-approved, and when scoring is still open for the lead's country and product.
   */
  private async approvedScores(partnerTenantId: string, plan: PartnerPlan | undefined, rows: readonly LeadAssignmentRecord[]): Promise<Map<string, BrokerAiPriorityScore>> {
    const scores = new Map<string, BrokerAiPriorityScore>();
    const inTenant = rows.filter((assignment) => assignment.partnerTenantId === partnerTenantId);
    if (inTenant.length === 0) return scores;
    const latest = new Map<string, AiInteractionRecord>();
    for (const record of await this.deps.gateway.listForTargets("LeadAssignment", inTenant.map((assignment) => assignment.id), "lead_score")) {
      if (!record.targetId || record.surface !== "broker_crm" || record.partnerTenantId !== partnerTenantId) continue;
      const current = latest.get(record.targetId);
      if (!current || record.createdAt.getTime() > current.createdAt.getTime()) latest.set(record.targetId, record);
    }
    for (const assignment of inTenant) {
      const record = latest.get(assignment.id);
      if (!record || record.status !== "completed" || record.humanValidationStatus !== "approved") continue;
      const parsed = aiLeadScoreSchema.safeParse(record.outputData);
      if (!parsed.success) continue;
      if (!this.deps.gateway.isEnabled("lead_score", await this.leadScope(partnerTenantId, plan, assignment)).enabled) continue;
      scores.set(assignment.id, { score: parsed.data.score, level: parsed.data.level, interactionId: record.id });
    }
    return scores;
  }

  /** Optional dashboard port: its output is reduced to bounded aggregates; a failing port is simply left out. */
  private async dashboardAggregates(actor: ActorContext, windowDays: number): Promise<Record<string, unknown> | undefined> {
    if (!this.deps.performanceInput) return undefined;
    try {
      const bounded = boundAggregates(await this.deps.performanceInput(actor, { windowDays }));
      return Object.keys(bounded).length > 0 ? bounded : undefined;
    } catch {
      return undefined;
    }
  }

  private performanceAggregates(rows: readonly LeadAssignmentRecord[], windowDays: number): Record<string, unknown> {
    const now = Date.now();
    const inWindow = rows.filter((assignment) => assignment.assignedAt.getTime() >= now - windowDays * DAY_MS);
    const open = rows.filter((assignment) => !CLOSED_PIPELINE_STATUSES.has(pipelineStatusOf(assignment)));
    const won = inWindow.filter((assignment) => pipelineStatusOf(assignment) === "gagne").length;
    const lost = inWindow.filter((assignment) => pipelineStatusOf(assignment) === "perdu").length;
    const replies = averageFirstReply(inWindow);
    return {
      windowDays,
      received: inWindow.length,
      won,
      lost,
      conversionRate: inWindow.length === 0 ? null : Math.round((won / inWindow.length) * 1000) / 10,
      open: open.length,
      overdueOpen: open.filter((assignment) => isOverdue(assignment, now)).length,
      overdueAfterHours: OVERDUE_AFTER_HOURS,
      averageFirstReplyMinutes: replies.average,
      firstReplyMeasured: replies.measured,
      byStatus: this.countBy([...inWindow], pipelineStatusOf),
      bySource: this.countBy([...inWindow], (assignment) => assignment.source ?? "quote_request"),
      byProduct: this.countBy([...inWindow], (assignment) => assignment.productKey ?? "unknown"),
      byUrgency: this.countBy([...inWindow], (assignment) => assignment.urgency ?? "normal")
    };
  }

  private managerAggregates(rows: readonly LeadAssignmentRecord[], windowDays: number): { input: Record<string, unknown>; advisorLabels: Record<string, string> } {
    const now = Date.now();
    const since = now - windowDays * DAY_MS;
    const byAdvisor = new Map<string, LeadAssignmentRecord[]>();
    let unassignedOpen = 0;
    for (const assignment of rows) {
      const open = !CLOSED_PIPELINE_STATUSES.has(pipelineStatusOf(assignment));
      if (!assignment.assignedAdvisorId) {
        if (open) unassignedOpen += 1;
        continue;
      }
      byAdvisor.set(assignment.assignedAdvisorId, [...(byAdvisor.get(assignment.assignedAdvisorId) ?? []), assignment]);
    }
    const stats = [...byAdvisor.entries()].map(([advisorId, leads]) => {
      const open = leads.filter((assignment) => !CLOSED_PIPELINE_STATUSES.has(pipelineStatusOf(assignment)));
      const inWindow = leads.filter((assignment) => assignment.assignedAt.getTime() >= since);
      const won = inWindow.filter((assignment) => pipelineStatusOf(assignment) === "gagne").length;
      return {
        advisorId,
        openLeads: open.length,
        overdueOpen: open.filter((assignment) => isOverdue(assignment, now)).length,
        received: inWindow.length,
        won,
        lost: inWindow.filter((assignment) => pipelineStatusOf(assignment) === "perdu").length,
        conversionRate: inWindow.length === 0 ? null : Math.round((won / inWindow.length) * 1000) / 10,
        averageFirstReplyMinutes: averageFirstReply(inWindow).average
      };
    })
      .sort((left, right) => right.openLeads - left.openLeads || left.advisorId.localeCompare(right.advisorId))
      .slice(0, MANAGER_MAX_ADVISORS);
    const advisorLabels: Record<string, string> = {};
    const advisors = stats.map(({ advisorId, ...counters }, index) => {
      const label = `C${index + 1}`;
      advisorLabels[label] = advisorId;
      return { label, ...counters };
    });
    return {
      input: { windowDays, overdueAfterHours: OVERDUE_AFTER_HOURS, advisorsCount: byAdvisor.size, unassignedOpen, advisors },
      advisorLabels
    };
  }

  private async requireTenantRecord(id: string, actor: ActorContext): Promise<AiInteractionRecord> {
    const record = await this.deps.gateway.find(id);
    if (!record || record.surface !== "broker_crm" || record.partnerTenantId !== actor.partnerTenantId) throw new Error("AI interaction not found");
    return record;
  }

  private tenantOf(actor: ActorContext): string {
    if (!actor.partnerTenantId) throw new Error("CRM access denied: missing broker tenant");
    return actor.partnerTenantId;
  }

  private countBy(rows: LeadAssignmentRecord[], key: (row: LeadAssignmentRecord) => string): Record<string, number> {
    return rows.reduce<Record<string, number>>((acc, row) => {
      const bucket = key(row);
      acc[bucket] = (acc[bucket] ?? 0) + 1;
      return acc;
    }, {});
  }
}

/** Same reading as the CRM lists (`BrokerCrmLeadsService.statusOf`, private there). */
function pipelineStatusOf(assignment: LeadAssignmentRecord): BrokerCrmPipelineStatus {
  if (assignment.crmStatus) return assignment.crmStatus;
  if (assignment.status === "accepted") return "accepte";
  if (assignment.status === "contacted") return "contacte";
  if (assignment.status === "rejected" || assignment.status === "disputed") return "rejete_conteste";
  return "nouveau";
}

function isOverdue(assignment: LeadAssignmentRecord, now: number): boolean {
  const lastActivity = assignment.crmUpdatedAt ?? assignment.lastBrokerActionAt ?? assignment.assignedAt;
  return now - lastActivity.getTime() > OVERDUE_AFTER_HOURS * 3600 * 1000;
}

function averageFirstReply(rows: readonly LeadAssignmentRecord[]): { average: number | null; measured: number } {
  const delays = rows.map(firstVisibleReplyMinutes).filter((minutes): minutes is number => minutes !== null);
  return { average: delays.length === 0 ? null : Math.round(delays.reduce((sum, minutes) => sum + minutes, 0) / delays.length), measured: delays.length };
}

const AGGREGATE_KEY = /^[A-Za-z0-9_-]{1,48}$/;
/** Keys that could carry an identity even in an aggregate payload: dropped whatever their value. */
const IDENTITY_LIKE_KEY = /(name|nom|prenom|tel|contact|address|adresse|reference|token|ip)$|mail|phone|mobile|msisdn|whatsapp|iban|passport|card/i;
/** Only lower-case codes (statuses, product keys, sources) and ISO dates survive as strings; digit runs (phones, ids) never do. */
const AGGREGATE_CODE = /^(?!.*\d{6})[a-z0-9_]{1,40}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z?)?$/;
const AGGREGATE_MAX_DEPTH = 4;
const AGGREGATE_MAX_LEAVES = 150;
const AGGREGATE_MAX_ARRAY = 20;

/**
 * Reduces a caller-provided aggregate object (dashboard port, weekly stats) to a bounded tree of
 * numbers, booleans, nulls, lower-case codes and ISO dates: no free text, no identifier, no prospect.
 */
export function boundAggregates(value: unknown): Record<string, unknown> {
  const budget = { leaves: AGGREGATE_MAX_LEAVES };
  const bounded = boundNode(value, 0, budget);
  return bounded && typeof bounded === "object" && !Array.isArray(bounded) ? bounded as Record<string, unknown> : {};
}

function boundNode(value: unknown, depth: number, budget: { leaves: number }): unknown {
  if (value === null || typeof value === "boolean") return takeLeaf(budget, value);
  if (typeof value === "number") return Number.isFinite(value) ? takeLeaf(budget, Math.round(value * 100) / 100) : undefined;
  if (typeof value === "string") return AGGREGATE_CODE.test(value) || ISO_DATE.test(value) ? takeLeaf(budget, value) : undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : takeLeaf(budget, value.toISOString());
  if (depth >= AGGREGATE_MAX_DEPTH || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    const items = value.slice(0, AGGREGATE_MAX_ARRAY).map((item) => boundNode(item, depth + 1, budget)).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!AGGREGATE_KEY.test(key) || IDENTITY_LIKE_KEY.test(key)) continue;
    const bounded = boundNode(child, depth + 1, budget);
    if (bounded !== undefined) result[key] = bounded;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function takeLeaf(budget: { leaves: number }, value: unknown): unknown {
  if (budget.leaves <= 0) return undefined;
  budget.leaves -= 1;
  return value;
}
