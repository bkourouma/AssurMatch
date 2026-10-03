import { SatisfactionAuditActions } from "../audit-logs/satisfaction-audit-actions";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { AuthEmailPayload } from "../notifications/email/email-delivery.service";
import type { ProspectRecord } from "../prospects/prospects.service";
import type { QuoteRequestRecord } from "../quote-requests/quote-submission.service";
import { SatisfactionSurveyEmailTemplateService } from "./satisfaction-survey-email-template.service";
import { SatisfactionSurveyTokenService } from "./satisfaction-survey-token.service";
import type { SatisfactionSurveyRecord, SatisfactionSurveyRepository } from "./satisfaction-survey.model";

export interface SatisfactionSurveysDrainDeps {
  repository: SatisfactionSurveyRepository;
  audit: AuditLogWriter;
  emailTemplate: SatisfactionSurveyEmailTemplateService;
  emailDelivery: {
    sendAuthEmail(payload: AuthEmailPayload): Promise<{ status: string }>;
  };
  quotes: {
    findById(id: string): Promise<QuoteRequestRecord | undefined>;
  };
  prospects: {
    find(id: string): Promise<ProspectRecord | undefined>;
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
  /** Spec 054 R9: mints the token sent in the e-mail (rotation); a default instance when absent. */
  tokenService?: SatisfactionSurveyTokenService;
}

export interface DrainSummary {
  totalDue: number;
  sent: number;
  skipped: number;
  failed: number;
}

export class SatisfactionSurveysDrainService {
  constructor(private readonly deps: SatisfactionSurveysDrainDeps) {}

  async deliverDue(limit = 50, now = new Date()): Promise<DrainSummary> {
    const dueSurveys = await this.deps.repository.findDueQueued(now, limit);
    const summary: DrainSummary = {
      totalDue: dueSurveys.length,
      sent: 0,
      skipped: 0,
      failed: 0
    };

    for (const survey of dueSurveys) {
      try {
        const ineligibleReason = await this.checkIneligibleReason(survey);
        if (ineligibleReason) {
          await this.deps.repository.update(survey.id, {
            status: "skipped",
            skippedReason: ineligibleReason
          });
          this.deps.audit.write({
            
            action: SatisfactionAuditActions.satisfactionSurveySkipped,
            targetType: "SatisfactionSurveyRequest",
            targetId: survey.id,
            scope: { partnerTenantId: survey.partnerTenantId },
            result: "success",
            reason: ineligibleReason,
            context: { publicReference: survey.publicReference }
          });
          summary.skipped += 1;
          continue;
        }

        const quote = await this.deps.quotes.findById(survey.quoteRequestId);
        const prospect = quote ? await this.deps.prospects.find(quote.prospectId) : undefined;
        const email = prospect?.emailNormalized;
        if (!email) {
          await this.deps.repository.update(survey.id, {
            status: "skipped",
            skippedReason: "prospect_contact_missing"
          });
          summary.skipped += 1;
          continue;
        }

        // Spec 054 R9: the clear token only exists at render time. A fresh one is minted and its
        // hash replaces the stored one before sending, so the link in the e-mail is the only valid
        // token and nothing in clear is ever persisted. The language is the request's own.
        const tokenService = this.deps.tokenService ?? new SatisfactionSurveyTokenService();
        const token = tokenService.generateToken();
        const locale = quote?.language === "en" ? "en" : quote?.language === "fr" ? "fr" : survey.locale;
        const emailPayload = this.deps.emailTemplate.render({
          to: email,
          publicReference: survey.publicReference,
          token,
          locale
        });
        await this.deps.repository.update(survey.id, { tokenHash: tokenService.hashToken(token), locale });

        await this.deps.emailDelivery.sendAuthEmail(emailPayload);

        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await this.deps.repository.update(survey.id, {
          status: "sent",
          sentAt: now,
          expiresAt
        });

        this.deps.audit.write({
          
          action: SatisfactionAuditActions.satisfactionSurveySent,
          targetType: "SatisfactionSurveyRequest",
          targetId: survey.id,
          scope: { partnerTenantId: survey.partnerTenantId },
          result: "success",
          context: {
            publicReference: survey.publicReference,
            sentAt: now.toISOString(),
            expiresAt: expiresAt.toISOString()
          }
        });

        summary.sent += 1;
      } catch (error) {
        summary.failed += 1;
        this.deps.audit.write({
          
          action: "satisfaction_survey.delivery_failed",
          targetType: "SatisfactionSurveyRequest",
          targetId: survey.id,
          scope: { partnerTenantId: survey.partnerTenantId },
          result: "failed",
          reason: "delivery_transport_error",
          context: {
            publicReference: survey.publicReference,
            error: error instanceof Error ? error.message : "unknown"
          }
        });
      }
    }

    return summary;
  }

  private async checkIneligibleReason(survey: SatisfactionSurveyRecord): Promise<string | null> {
    if (!this.deps.isFlagEnabled("satisfaction_survey_enabled")) {
      return "flag_disabled";
    }

    const quote = await this.deps.quotes.findById(survey.quoteRequestId);
    if (!quote || quote.anonymizedAt) {
      return "quote_anonymized_or_missing";
    }

    const country = await this.deps.countries.findById(quote.countryId);
    if (!country || country.status !== "public" || !country.flags?.country_public_enabled) {
      return "country_or_product_inactive";
    }

    const product = await this.deps.products.findById(quote.productId);
    if (!product || product.status !== "public" || !product.flags?.product_public_enabled) {
      return "country_or_product_inactive";
    }

    if (!quote.surveyConsentRecordId) {
      return "consent_withdrawn_or_missing";
    }

    const hasConsent = await this.deps.consent.hasValidConsent(
      quote.surveyConsentRecordId,
      "service_quality_survey",
      quote.countryId,
      quote.productId
    );
    if (!hasConsent) {
      return "consent_withdrawn_or_missing";
    }

    return null;
  }
}
