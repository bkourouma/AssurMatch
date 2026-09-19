import type { AdminAssistType, AiInteraction } from "../../../../packages/shared/contracts/ai.contracts";
import { adminAiRequestSchema, adminAssistTypeSchema, aiHumanValidationDecisionSchema } from "../../../../packages/shared/contracts/ai.contracts";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import type { AdminDashboardService } from "../dashboards/admin-dashboard.service";
import type { ComplianceAlertsService } from "../dashboards/compliance-alerts.service";
import type { ActivationChecklistService } from "../activation-checklist/activation-checklist.service";
import type { OffersRepository } from "../offers/offers.repository";
import type { QuoteSubmissionService } from "../quote-requests/quote-submission.service";
import { AiAuditActions } from "./core/ai-audit-actions";
import type { AiGateway } from "./core/ai-gateway.service";
import type { AiInteractionRecord } from "./core/ai-interactions.repository";

export interface AdminAiDeps {
  audit: AuditLogWriter;
  gateway: AiGateway;
  dashboard: AdminDashboardService;
  complianceAlerts: ComplianceAlertsService;
  activationChecklist: ActivationChecklistService;
  offers: OffersRepository;
  quoteRequests: QuoteSubmissionService;
}

export class AdminAiAccessRefusedError extends Error {
  constructor(reason: string) {
    super(`AI insight access denied: ${reason}`);
    this.name = "AdminAiAccessRefusedError";
  }
}

const SUSPICIOUS_BURST_WINDOW_MS = 60 * 60 * 1000;

/**
 * Admin platform AI insights (PRD §10.3). Inputs are aggregates only - never prospect data - and
 * every output is a suggestion an administrator must validate before acting on it.
 *
 * No privilege escalation through AI: the underlying reads (compliance alerts, admin dashboard,
 * activation checklist) run as the requesting actor, so their own access policies still refuse an
 * actor who could not read that data directly. Offer checks additionally respect the actor scopes.
 */
export class AdminAiService {
  constructor(private readonly deps: AdminAiDeps) {}

  async request(assistTypeInput: string, body: unknown, actor: ActorContext): Promise<AiInteraction> {
    const assistType = adminAssistTypeSchema.parse(assistTypeInput);
    const parsed = adminAiRequestSchema.parse(body ?? {});
    this.assertAccess(actor, "write");
    const { input, target } = await this.buildInput(assistType, parsed, actor);
    const record = await this.deps.gateway.run({
      assistType,
      surface: "admin_platform",
      actor,
      input,
      language: parsed.language,
      ...(target ? { target } : {}),
      scope: {},
      quotaKey: actor.actorId ?? "admin"
    }, { wait: false });
    return this.deps.gateway.toDto(record);
  }

  async read(id: string, actor: ActorContext): Promise<AiInteraction> {
    this.assertAccess(actor, "read");
    const record = await this.requireAdminRecord(id);
    this.deps.audit.write({ actor, action: AiAuditActions.read, targetType: "AIInteraction", targetId: id, scope: { surface: "admin_platform" }, result: "success", context: { status: record.status, assistType: record.assistType } });
    return this.deps.gateway.toDto(record);
  }

  async list(actor: ActorContext): Promise<AiInteraction[]> {
    this.assertAccess(actor, "read");
    const records = await this.deps.gateway.listForSurface("admin_platform");
    return records.map((record) => this.deps.gateway.toDto(record));
  }

  async validate(id: string, body: unknown, actor: ActorContext): Promise<AiInteraction> {
    const parsed = aiHumanValidationDecisionSchema.parse(body ?? {});
    this.assertAccess(actor, "write");
    const record = await this.requireAdminRecord(id);
    if (record.status !== "completed") throw new Error("Invalid validation: the AI interaction is not completed");
    return this.deps.gateway.toDto(await this.deps.gateway.validate(id, parsed.decision, actor));
  }

  private async buildInput(assistType: AdminAssistType, query: { from?: string | undefined; to?: string | undefined; offerId?: string | undefined }, actor: ActorContext): Promise<{ input: Record<string, unknown>; target?: { type: string; id: string } | undefined }> {
    const window = { ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}) };
    if (assistType === "admin_risk_triage") {
      const alerts = this.deps.complianceAlerts.list(actor, { ...window, page: 1, pageSize: 100 });
      const dashboard = await this.deps.dashboard.dashboard(actor, window);
      return {
        input: {
          alerts: alerts.total,
          byCategory: this.countBy(alerts.items.map((item) => item.category)),
          expiringLicenses: dashboard.licenseAlerts.expiringSoon + dashboard.licenseAlerts.expired,
          expiredOffers: dashboard.expiredOffersStillReferenced,
          sensitiveFlagsOn: dashboard.sensitiveFeatureFlags.filter((flag) => flag.value).map((flag) => flag.key)
        }
      };
    }
    if (assistType === "activation_gap_summary") {
      const checklist = await this.deps.activationChecklist.read(actor, {});
      const failing = checklist.sections.flatMap((section) => section.controls.filter((control) => control.status !== "passed").map((control) => `${section.key}:${control.key}`));
      return { input: { blocked: checklist.summary.blocked, warning: checklist.summary.warning, passed: checklist.summary.passed, reasons: failing.slice(0, 20) } };
    }
    if (assistType === "offer_consistency_check") {
      if (!query.offerId) throw new Error("Invalid AI insight request: offerId is required for offer_consistency_check");
      const offer = (await this.deps.offers.list()).find((candidate) => candidate.id === query.offerId);
      if (!offer) throw new Error("Offer not found");
      if (actor.countryScopes?.length && !actor.countryScopes.includes(offer.countryId)) this.refuse(actor, "offer_consistency_check", "out_of_scope_country");
      if (actor.productScopes?.length && !actor.productScopes.includes(offer.productId)) this.refuse(actor, "offer_consistency_check", "out_of_scope_product");
      return { input: { name: offer.publicKey, issues: this.offerIssues(offer), status: offer.status, validationStatus: offer.validationStatus }, target: { type: "Offer", id: offer.id } };
    }
    if (assistType === "activity_report") {
      const dashboard = await this.deps.dashboard.dashboard(actor, window);
      return {
        input: {
          window: `${dashboard.window.from.slice(0, 10)} -> ${dashboard.window.to.slice(0, 10)}`,
          received: dashboard.leadVolumes.received,
          transmitted: dashboard.leadVolumes.transmitted,
          refused: dashboard.leadVolumes.refused,
          nonRouted: dashboard.leadVolumes.nonRouted,
          activePartners: dashboard.partners.active,
          byCountry: dashboard.byCountry,
          byProduct: dashboard.byProduct
        }
      };
    }
    const quotes = await this.deps.quoteRequests.list();
    const duplicates = quotes.filter((quote) => quote.duplicateStatus !== "unique").length;
    const refused = quotes.filter((quote) => quote.status === "spam_blocked" || quote.status === "non_routable" || Boolean(quote.refusalReason)).length;
    const manualReview = quotes.filter((quote) => quote.routingStatus === "pending_manual_assignment").length;
    return { input: { flaggedCount: duplicates + refused, duplicates, refused, manualReview, bursts: this.burstCount(quotes.map((quote) => quote.createdAt)), total: quotes.length } };
  }

  /** Catalogue coherence signals the model is asked to comment on; the admin stays the decision maker. */
  private offerIssues(offer: { validUntil: Date; validFrom: Date; guaranteeSummary?: string | undefined; publicDisclaimers: string[]; indicativePriceMin?: number | undefined; indicativePriceMax?: number | undefined; exclusionsSummary?: string | undefined; requiredDocuments?: string[] | undefined; sourceOfInformation?: string | undefined }): string[] {
    const issues: string[] = [];
    const now = Date.now();
    if (offer.validUntil.getTime() <= now) issues.push("validite expiree");
    if (offer.validFrom.getTime() > offer.validUntil.getTime()) issues.push("dates de validite incoherentes");
    if (!offer.guaranteeSummary) issues.push("resume des garanties manquant");
    if (offer.publicDisclaimers.length === 0) issues.push("mentions obligatoires absentes");
    if (offer.indicativePriceMin !== undefined && offer.indicativePriceMax !== undefined && offer.indicativePriceMin > offer.indicativePriceMax) issues.push("fourchette de prix inversee");
    if (offer.indicativePriceMin === undefined && offer.indicativePriceMax === undefined) issues.push("prix indicatif absent");
    if (!offer.exclusionsSummary) issues.push("exclusions non resumees");
    if (!offer.requiredDocuments || offer.requiredDocuments.length === 0) issues.push("documents requis non listes");
    if (!offer.sourceOfInformation) issues.push("source d'information non renseignee");
    return issues.length > 0 ? issues : ["aucun ecart detecte automatiquement"];
  }

  private burstCount(dates: Date[]): number {
    const sorted = dates.map((date) => date.getTime()).sort((left, right) => left - right);
    return sorted.filter((value, index) => index >= 4 && value - (sorted[index - 4] ?? 0) <= SUSPICIOUS_BURST_WINDOW_MS).length;
  }

  private countBy(values: string[]): Record<string, number> {
    return values.reduce<Record<string, number>>((acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});
  }

  private async requireAdminRecord(id: string): Promise<AiInteractionRecord> {
    const record = await this.deps.gateway.find(id);
    if (!record || record.surface !== "admin_platform") throw new Error("AI interaction not found");
    return record;
  }

  private assertAccess(actor: ActorContext, mode: "read" | "write"): void {
    if (actor.mfaVerified !== true) this.refuse(actor, mode, "mfa_required");
    // Requesting an insight needs the AI capability; compliance oversight may read the results.
    const allowed = actor.roles.some((role) => roleHasPermission(role, "ai:*"))
      || (mode === "read" && actor.roles.some((role) => roleHasPermission(role, "ai:read") || role === "compliance_admin"));
    if (!allowed) this.refuse(actor, mode, "forbidden_role");
  }

  private refuse(actor: ActorContext, mode: string, reason: string): never {
    this.deps.audit.write({
      actor,
      action: AiAuditActions.refused,
      targetType: "AIInsight",
      targetId: mode,
      scope: { surface: "admin_platform", roles: actor.roles },
      result: "refused",
      reason,
      context: { modelCall: false }
    });
    throw new AdminAiAccessRefusedError(reason);
  }
}
