import { SatisfactionAuditActions } from "../audit-logs/satisfaction-audit-actions";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import type { ActorContext } from "../common/types";
import { SatisfactionSurveyTokenService } from "./satisfaction-survey-token.service";
import type { SatisfactionSurveyRepository } from "./satisfaction-survey.model";

export interface SatisfactionSurveysServiceDeps {
  repository: SatisfactionSurveyRepository;
  tokenService: SatisfactionSurveyTokenService;
  abuseGuard?: PublicAbuseGuardService;
  audit: AuditLogWriter;
  complianceAlerts?: {
    raise(alert: { partnerTenantId: string; publicReference: string; rating: number; flaggedConcern: boolean }): Promise<void>;
  } | undefined;
}

export interface SurveyPublicStatusResponse {
  status: "available" | "unavailable";
  publicReference?: string;
  partnerTenantId?: string;
  locale?: string;
  message?: string;
}

export interface SurveySubmissionInput {
  rating: number;
  comment?: string;
  flaggedConcern?: boolean;
}

export interface SurveySubmissionConfirmation {
  status: "submitted";
  publicReference: string;
  submittedAt: string;
  alreadySubmitted?: boolean;
}

const UNAVAILABLE_MESSAGE = "Ce questionnaire n'est plus disponible.";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class SatisfactionSurveysService {
  constructor(private readonly deps: SatisfactionSurveysServiceDeps) {}

  async checkStatus(publicReference: string, token?: string): Promise<SurveyPublicStatusResponse> {
    if (!token) {
      return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
    }

    const survey = await this.deps.repository.findByPublicReference(publicReference);
    if (!survey) {
      this.auditInvalidLink(publicReference, "unknown_reference");
      return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
    }

    const isValidToken = this.deps.tokenService.verifyToken(token, survey.tokenHash);
    if (!isValidToken) {
      this.auditInvalidLink(publicReference, "invalid_token");
      return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
    }

    const now = new Date();
    if (survey.expiresAt && survey.expiresAt < now) {
      this.auditInvalidLink(publicReference, "expired_link");
      return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
    }

    if (survey.status === "expired" || survey.status === "skipped") {
      this.auditInvalidLink(publicReference, "survey_inactive");
      return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
    }

    if (survey.status === "submitted") {
      // D4: already-submitted is indistinguishable from unknown/expired/wrong token
      return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
    }

    return {
      status: "available",
      publicReference: survey.publicReference,
      partnerTenantId: survey.partnerTenantId,
      locale: survey.locale
    };
  }

  async submit(
    publicReference: string,
    token: string | undefined,
    input: SurveySubmissionInput,
    ipAddress?: string
  ): Promise<SurveySubmissionConfirmation> {
    if (this.deps.abuseGuard && ipAddress) {
      await this.deps.abuseGuard.assertAllowed({
        scope: "consent_withdrawal",
        ipAddress,
        limitPerWindow: 10,
        windowSeconds: 3600
      });
    }

    if (!token) {
      throw new Error(UNAVAILABLE_MESSAGE);
    }

    const survey = await this.deps.repository.findByPublicReference(publicReference);
    if (!survey) {
      this.auditInvalidLink(publicReference, "unknown_reference");
      throw new Error(UNAVAILABLE_MESSAGE);
    }

    const isValidToken = this.deps.tokenService.verifyToken(token, survey.tokenHash);
    if (!isValidToken) {
      this.auditInvalidLink(publicReference, "invalid_token");
      throw new Error(UNAVAILABLE_MESSAGE);
    }

    const now = new Date();
    if (survey.expiresAt && survey.expiresAt < now) {
      this.auditInvalidLink(publicReference, "expired_link");
      throw new Error(UNAVAILABLE_MESSAGE);
    }

    // D8: immutability. If already submitted, return prior confirmation and mutate nothing.
    if (survey.status === "submitted") {
      return {
        status: "submitted",
        publicReference: survey.publicReference,
        submittedAt: survey.submittedAt?.toISOString() ?? now.toISOString(),
        alreadySubmitted: true
      };
    }

    if (survey.status === "skipped" || survey.status === "expired") {
      throw new Error(UNAVAILABLE_MESSAGE);
    }

    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new Error("Rating must be an integer between 1 and 5");
    }

    const rawComment = typeof input.comment === "string" ? input.comment.trim().slice(0, 1000) : null;
    const flaggedConcern = Boolean(input.flaggedConcern);

    const updated = await this.deps.repository.update(survey.id, {
      status: "submitted",
      submittedAt: now,
      rating: input.rating,
      comment: rawComment,
      flaggedConcern
    });

    // Audit submission: NEVER include the comment inline per D7
    this.deps.audit.write({
      
      action: SatisfactionAuditActions.satisfactionSurveySubmitted,
      targetType: "SatisfactionSurveyRequest",
      targetId: updated.id,
      scope: { partnerTenantId: updated.partnerTenantId },
      result: "success",
      context: {
        publicReference: updated.publicReference,
        rating: updated.rating,
        flaggedConcern: updated.flaggedConcern
      }
    });

    // D7 / FR-006: rating <= 2 or concern flag raises compliance alert
    if (input.rating <= 2 || flaggedConcern) {
      this.deps.audit.write({
        
        action: SatisfactionAuditActions.satisfactionSurveyConcernFlagged,
        targetType: "SatisfactionSurveyRequest",
        targetId: updated.id,
        scope: { partnerTenantId: updated.partnerTenantId },
        result: "refused",
        reason: "broker_satisfaction_concern",
        context: {
          publicReference: updated.publicReference,
          rating: updated.rating,
          flaggedConcern: updated.flaggedConcern
        }
      });

      if (this.deps.complianceAlerts) {
        await this.deps.complianceAlerts.raise({
          partnerTenantId: updated.partnerTenantId,
          publicReference: updated.publicReference,
          rating: input.rating,
          flaggedConcern
        }).catch(() => {});
      }
    }

    return {
      status: "submitted",
      publicReference: updated.publicReference,
      submittedAt: now.toISOString()
    };
  }

  async onConsentWithdrawn(quoteRequestId: string): Promise<void> {
    const surveys = await this.deps.repository.findByQuoteRequestId(quoteRequestId);
    for (const survey of surveys) {
      if (survey.status === "queued") {
        await this.deps.repository.update(survey.id, {
          status: "skipped",
          skippedReason: "consent_withdrawn"
        });
        this.deps.audit.write({
          
          action: SatisfactionAuditActions.satisfactionSurveySkipped,
          targetType: "SatisfactionSurveyRequest",
          targetId: survey.id,
          scope: { partnerTenantId: survey.partnerTenantId },
          result: "success",
          reason: "consent_withdrawn",
          context: { publicReference: survey.publicReference, quoteRequestId }
        });
      }
    }
  }

  async getPartnerSatisfactionStats(partnerTenantId: string): Promise<{
    averageRating: number | null;
    responseCount: number;
    flaggedCount: number;
  }> {
    const surveys = (await this.deps.repository.findByPartnerTenantId(partnerTenantId))
      .filter((s) => s.status === "submitted" && s.rating !== null && s.rating !== undefined);

    if (surveys.length === 0) {
      return { averageRating: null, responseCount: 0, flaggedCount: 0 };
    }

    const responseCount = surveys.length;
    const flaggedCount = surveys.filter((s) => s.flaggedConcern).length;
    const ratingSum = surveys.reduce((sum, s) => sum + (s.rating ?? 0), 0);
    const averageRating = Math.round((ratingSum / responseCount) * 10) / 10;

    return { averageRating, responseCount, flaggedCount };
  }

  async listPartnerResponses(partnerTenantId: string, actor: ActorContext): Promise<Array<{
    id: string;
    publicReference: string;
    rating: number;
    comment: string | null;
    flaggedConcern: boolean;
    submittedAt: string;
  }>> {
    const isPlatformAdmin = actor.roles.some((r) => ["super_admin", "compliance_admin", "support_admin"].includes(r));
    if (!isPlatformAdmin && actor.partnerTenantId !== partnerTenantId) {
      throw new Error("Cross-tenant access refused");
    }

    const surveys = (await this.deps.repository.findByPartnerTenantId(partnerTenantId))
      .filter((s) => s.status === "submitted" && s.rating !== null && s.rating !== undefined);

    return surveys.map((s) => ({
      id: s.id,
      publicReference: s.publicReference,
      rating: s.rating!,
      comment: s.comment ? escapeHtml(s.comment) : null,
      flaggedConcern: s.flaggedConcern,
      submittedAt: s.submittedAt?.toISOString() ?? s.createdAt.toISOString()
    }));
  }

  private auditInvalidLink(publicReference: string, reason: string): void {
    this.deps.audit.write({
      
      action: SatisfactionAuditActions.satisfactionSurveyLinkInvalid,
      targetType: "SatisfactionSurveyRequest",
      targetId: publicReference,
      scope: {},
      result: "refused",
      reason,
      context: { publicReference }
    });
  }
}
