import { SatisfactionAuditActions } from "../audit-logs/satisfaction-audit-actions";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { QuoteRequestRecord } from "../quote-requests/quote-submission.service";
import type { SatisfactionSurveyRecord, SatisfactionSurveyRepository } from "./satisfaction-survey.model";
import { SatisfactionSurveyTokenService } from "./satisfaction-survey-token.service";

export interface SatisfactionSurveyTriggerDeps {
  repository: SatisfactionSurveyRepository;
  tokenService: SatisfactionSurveyTokenService;
  audit: AuditLogWriter;
  assignments: {
    find(id: string): Promise<LeadAssignmentRecord | undefined>;
  };
  quotes: {
    findById(id: string): Promise<QuoteRequestRecord | undefined>;
  };
  consent: {
    hasValidConsent(recordId: string | undefined, purpose: string, countryId: string, productId?: string): Promise<boolean>;
  };
  countries: {
    findById(id: string): Promise<{ id: string; status: string; flags?: { country_public_enabled?: boolean } } | undefined>;
  };
  products: {
    findById(id: string): Promise<{ id: string; status: string; flags?: { product_public_enabled?: boolean } } | undefined>;
  };
  isFlagEnabled: (flag: string) => boolean;
}

const TRIGGER_STATUSES = new Set(["gagne", "perdu", "closed"]);
const EXCLUDED_STATUSES = new Set(["doublon", "hors_cible", "injoignable", "rejete_conteste", "rejected"]);

export class SatisfactionSurveyTriggerService {
  constructor(private readonly deps: SatisfactionSurveyTriggerDeps) {}

  async onLeadStatusChanged(event: {
    leadAssignmentId: string;
    status: string;
    previousStatus?: string | undefined;
    partnerTenantId?: string | undefined;
  }): Promise<SatisfactionSurveyRecord | null> {
    if (EXCLUDED_STATUSES.has(event.status)) return null;
    if (!TRIGGER_STATUSES.has(event.status)) return null;

    if (!this.deps.isFlagEnabled("satisfaction_survey_enabled")) return null;

    const existing = await this.deps.repository.findByLeadAssignmentId(event.leadAssignmentId);
    if (existing) return null;

    const assignment = await this.deps.assignments.find(event.leadAssignmentId);
    if (!assignment) return null;

    const quote = await this.deps.quotes.findById(assignment.quoteRequestId);
    if (!quote || quote.anonymizedAt) return null;

    const country = await this.deps.countries.findById(quote.countryId);
    if (!country || country.status !== "public" || !country.flags?.country_public_enabled) return null;

    const product = await this.deps.products.findById(quote.productId);
    if (!product || product.status !== "public" || !product.flags?.product_public_enabled) return null;

    if (!quote.surveyConsentRecordId) return null;
    const hasConsent = await this.deps.consent.hasValidConsent(
      quote.surveyConsentRecordId,
      "service_quality_survey",
      quote.countryId,
      quote.productId
    );
    if (!hasConsent) return null;

    const publicReference = this.deps.tokenService.generatePublicReference();
    const token = this.deps.tokenService.generateToken();
    const tokenHash = this.deps.tokenService.hashToken(token);

    const now = new Date();
    const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h delay
    const retentionUntil = new Date(now.getTime() + 730 * 24 * 60 * 60 * 1000); // 2 years default
    const locale = typeof (quote.payload as Record<string, unknown>)?.locale === "string"
      ? (quote.payload as Record<string, unknown>).locale as string
      : "fr";

    const record = await this.deps.repository.create({
      publicReference,
      tokenHash,
      leadAssignmentId: assignment.id,
      quoteRequestId: quote.id,
      partnerTenantId: assignment.partnerTenantId,
      consentRecordId: quote.surveyConsentRecordId,
      triggerStatus: event.status,
      status: "queued",
      dueAt,
      retentionUntil,
      flaggedConcern: false,
      locale
    });

    this.deps.audit.write({
      
      action: SatisfactionAuditActions.satisfactionSurveyQueued,
      targetType: "SatisfactionSurveyRequest",
      targetId: record.id,
      scope: { partnerTenantId: record.partnerTenantId },
      result: "success",
      context: {
        publicReference: record.publicReference,
        leadAssignmentId: record.leadAssignmentId,
        quoteRequestId: record.quoteRequestId,
        triggerStatus: record.triggerStatus,
        dueAt: record.dueAt.toISOString(),
        token // Note: returned for testability in memory/unit tests
      }
    });

    return record;
  }
}
