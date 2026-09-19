import type { AiInteraction, BrokerAiOptOutStatus, BrokerLeadAssistType } from "../../../../packages/shared/contracts/ai.contracts";
import { aiHumanValidationDecisionSchema, brokerAiOptOutSchema, brokerAiRequestSchema, brokerLeadAssistTypeSchema } from "../../../../packages/shared/contracts/ai.contracts";
import type { BrokerCrmLeadDetail } from "../../../../packages/shared/contracts/quote.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { BrokerCrmAccessPolicy } from "../leads/broker-crm-access-policy";
import type { BrokerCrmLeadsService } from "../leads/broker-crm-leads.service";
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
}

const DRAFTING_ASSISTS: ReadonlySet<BrokerLeadAssistType> = new Set(["next_action", "relaunch_message"]);
const DUPLICATE_WINDOW_MS = 30 * 24 * 3600 * 1000;
const LOSS_WINDOW_MS = 90 * 24 * 3600 * 1000;

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

  async read(id: string, actor: ActorContext): Promise<AiInteraction> {
    this.deps.access.assertCrmAccess(actor);
    const record = await this.requireTenantRecord(id, actor);
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
    } else if (actor.roles.includes("broker_read_only")) {
      throw new Error("AI validation denied for read_only role");
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
    if (!actor.roles.some((role) => roleHasPermission(role, "broker_crm:*"))) throw new Error("AI opt-out change denied: owner permission required");
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
    const country = assignment.countryCode ? await this.deps.countries.findByIsoCode(assignment.countryCode) : undefined;
    const product = assignment.productKey ? await this.deps.products.findByKey(assignment.productKey) : undefined;
    return {
      partnerTenantId: this.tenantOf(actor),
      plan: actor.partnerPlan as PartnerPlan | undefined,
      ...(country ? { countryId: country.id, countryFlags: country.flags } : {}),
      ...(product ? { productId: product.id, productFlags: product.flags } : {})
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
