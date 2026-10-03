import { timingSafeEqual } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import { quoteRequestCreateSchema, type QuoteConfirmation, type QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import type { ConsentWithdrawalResponse } from "../../../../packages/shared/contracts/public-site.contracts";
import {
  projectPublicQuoteStatus,
  trackingLinkRequestSchema,
  VISITOR_ACCESS_DENIED_CODE,
  type ProjectionHistoryEvent,
  type PublicQuoteStatusView,
  type TrackingLinkResponse
} from "../../../../packages/shared/contracts/public-quote-status";
import type { PublicLeadProposal } from "../../../../packages/shared/contracts/lead-proposals";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { VisitorTrackingAuditActions } from "../audit-logs/visitor-tracking-audit-actions";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../audit-logs/public-site-audit-actions";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import { ConsentService } from "../consent/consent.module";
import { MULTI_BROKER_CONSENT, SINGLE_BROKER_CONSENT } from "../leads/quote-routing.service";
import { publicCountryFlags, type Country } from "../countries/countries.module";
import { countryLinkFor, effectiveProductFlags, type Product } from "../products/products.module";
import type { ProspectIdentityService } from "../prospects/prospect-identity.service";
import type { ProspectsService } from "../prospects/prospects.service";
import type { QuoteFormDefinitionService } from "../quote-forms/quote-form-definition.service";
import type { LeadAssignmentRecord, LeadAssignmentStatus } from "../leads/lead-assignment.service";
import type { QuoteRoutingService } from "../leads/quote-routing.service";
import type { QuoteNotificationService } from "../notifications/quote-notification.service";
import type { QuoteAISummaryService } from "../ai/quote-summary/quote-ai-summary.service";
import type { PublicAntiSpamService } from "./public-anti-spam.service";
import type { PublicQuoteRateLimitService } from "./public-quote-rate-limit.service";
import type { QuoteDuplicateDetectionService } from "./quote-duplicate-detection.service";
import { MemoryQuoteRequestsRepository, type QuoteRequestsRepository } from "./quote-requests.repository";
import { VISITOR_ACCESS_TOKEN_MARKER, VisitorAccessService, type VisitorAccessOptions } from "./visitor-access.service";
import { MemoryVisitorAccessTokensRepository, type VisitorAccessTokensRepository } from "./visitor-access-tokens.repository";

export type QuoteRequestStatus = "created" | "manual_review" | "routed" | "non_routable" | "duplicate" | "spam_blocked" | "cancelled";
export type RoutingStatus = "not_started" | "assigned" | "no_broker_available" | "manual_review_required" | "blocked" | "pending_manual_assignment";
export type DuplicateStatus = "not_checked" | "unique" | "possible_duplicate" | "blocked_duplicate";

export interface QuoteRequestRecord {
  id: string;
  publicReference: string;
  verificationTokenHash: string;
  countryId: string;
  countryCode: string;
  productId: string;
  productKey: string;
  selectedOfferId?: string;
  /** Spec 052 R7: outcome of the verification of `selectedOfferId` (absent without offer). */
  selectedOfferOutcome?: "accepted" | "ignored";
  selectedOfferIgnoredReason?: string;
  quoteFormDefinitionId: string;
  /** Spec 050 R6: language of the submitted form (`fr` for every request created before the spec). */
  language?: string;
  prospectId: string;
  consentRecordId: string;
  surveyConsentRecordId?: string;
  source: "public_web";
  payload: Record<string, unknown>;
  status: QuoteRequestStatus;
  duplicateStatus: DuplicateStatus;
  routingStatus: RoutingStatus;
  refusalReason?: string;
  manualReviewReason?: string;
  correlationId?: string;
  retentionUntil: Date;
  anonymizedAt?: Date;
  /** Spec 056: persisted manual-review decision. */
  reviewedAt?: Date;
  reviewedById?: string;
  duplicateOfQuoteRequestId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Spec 056: statuses a manual review can no longer change. */
const REVIEW_TERMINAL_STATUSES = new Set<QuoteRequestStatus>(["routed", "non_routable", "duplicate", "spam_blocked", "cancelled"]);

/**
 * Spec 056: a request is open to manual review when a product forces it (`manual_review` /
 * `manual_review_required`) or a `manual` routing rule parked it (`pending_manual_assignment`), and
 * nothing has closed it since.
 */
export function isManualReviewOpen(quote: Pick<QuoteRequestRecord, "status" | "routingStatus">): boolean {
  if (REVIEW_TERMINAL_STATUSES.has(quote.status)) return false;
  return quote.status === "manual_review" || quote.routingStatus === "manual_review_required" || quote.routingStatus === "pending_manual_assignment";
}

export interface ManualReviewStamp {
  reason: string;
}

export interface ReviewRoutingOutcome {
  quote: QuoteRequestRecord;
  assignmentIds: string[];
}

/** Read/close access to the assignments of a request; `LeadAssignmentService` satisfies it. */
export interface QuoteAssignmentsPort {
  list(): Promise<LeadAssignmentRecord[]>;
  updateStatus(id: string, status: LeadAssignmentStatus, actor: ActorContext, reason: string): Promise<LeadAssignmentRecord>;
}

/** In-app inbox publisher; `MessagingDispatchService` satisfies it. */
export interface QuoteInAppNotifierPort {
  publishInApp(input: { scopeId: string; template: string; title: string; body: string; targetType?: string; targetId?: string }): Promise<unknown>;
}

/** The only terminal assignment status the lead transition table knows (see `BrokerStarterLeadActionsService`). */
const CLOSED_ASSIGNMENT_STATUS: LeadAssignmentStatus = "closed";
/** Message shared by `status()` and `withdrawConsent()`: an unknown reference and a wrong token are indistinguishable. */
const QUOTE_NOT_AVAILABLE = "Quote status not available";
const CONSENT_WITHDRAWAL_LIMIT_PER_WINDOW = 5;
const CONSENT_WITHDRAWAL_WINDOW_SECONDS = 3600;
/** Spec 054 contract: 60 status reads per hour and IP; 5 link resends per hour and IP, 3 per reference. */
const STATUS_LIMIT_PER_WINDOW = 60;
const TRACKING_LINK_LIMIT_PER_IP = 5;
const TRACKING_LINK_LIMIT_PER_REFERENCE = 3;
const TRACKING_WINDOW_SECONDS = 3600;
const RATE_LIMIT_MESSAGE = "Rate limit exceeded for public submissions";
/** Used when no partner lookup is wired (unit harnesses); the runtime always names the broker. */
const GENERIC_BROKER_NAME = "courtier partenaire";
const REASSIGNED_FROM = /^Reassigned from partner ([0-9a-fA-F-]{36})/;

/** Spec 054: one neutral refusal for every visitor route (unknown reference, wrong, expired or revoked token). */
export function visitorAccessDenied(): NotFoundException {
  return new NotFoundException({ code: VISITOR_ACCESS_DENIED_CODE, message: QUOTE_NOT_AVAILABLE });
}

/** History rows the visitor timeline is built from (`LeadAssignmentsRepository.historyForLead`). */
export interface QuoteAssignmentHistoryEvent {
  eventType: string;
  partnerTenantId: string;
  occurredAt: Date | string;
  comment?: string | undefined;
}

/**
 * Spec 052 R7: verifies the offer a visitor selected (exists, publicly visible with the catalogue
 * rules, same country and product). `partnerTenantId` is the broker of an accepted offer.
 */
export interface SelectedOfferVerifier {
  verify(offerId: string, countryId: string, productId: string): Promise<{ accepted: true; partnerTenantId?: string | undefined } | { accepted: false; reason: string }>;
}

/** Spec 052 R8: consent recipient category recorded when the broker of the selected offer is named. */
export function selectedOfferRecipient(partnerTenantId: string): string {
  return `partner:${partnerTenantId}`;
}

export interface QuoteSubmissionDependencies {
  findCountryByCode: (countryCode: string) => Country | undefined | Promise<Country | undefined>;
  findProductByKey: (productKey: string) => Product | undefined | Promise<Product | undefined>;
  forms: QuoteFormDefinitionService;
  consent: ConsentService;
  identity: ProspectIdentityService;
  prospects: ProspectsService;
  rateLimit?: PublicQuoteRateLimitService;
  antiSpam?: PublicAntiSpamService;
  duplicate?: QuoteDuplicateDetectionService;
  routing?: QuoteRoutingService;
  notifications?: QuoteNotificationService;
  aiSummary?: QuoteAISummaryService;
  /** Spec 045 consent withdrawal: closes the assignments a revoked request had produced. */
  assignments?: QuoteAssignmentsPort;
  satisfactionSurveys?: { onConsentWithdrawn(quoteRequestId: string): Promise<void> };
  /** Spec 045 consent withdrawal: tells each partner tenant, in its inbox, to stop working the lead. */
  inApp?: QuoteInAppNotifierPort;
  /** Spec 045 consent withdrawal: per-IP rate limit on the unauthenticated withdrawal endpoint. */
  abuseGuard?: PublicAbuseGuardService;
  isGlobalFlagEnabled?: (key: string) => boolean;
  /** Spec 052 R7: absent means the selected offer is recorded without verification (legacy unit tests). */
  selectedOffers?: SelectedOfferVerifier;
  /** Spec 054 R1: persisted visitor access tokens (memory store when absent, tests only). */
  visitorAccessTokens?: VisitorAccessTokensRepository;
  visitorAccessOptions?: VisitorAccessOptions;
  /** Spec 054: trade name, else legal name, of a partner; the broker the visitor sees. */
  partnerName?: (partnerTenantId: string) => Promise<string | undefined>;
  /** Spec 054 R5: assignment history (reassignment, acceptance) for the public timeline. */
  assignmentHistory?: (leadAssignmentId: string) => Promise<QuoteAssignmentHistoryEvent[]>;
  findCountryById?: (countryId: string) => Promise<{ isoCode: string; name: string } | undefined>;
  findProductById?: (productId: string) => Promise<{ key: string; name: string } | undefined>;
  /** Spec 054 R7: per-reference counter of the tracking-link resend. */
  redis?: RedisClientPort;
  /** Spec 055 FR-005: visible proposals of the request and the active proposal per assignment. */
  proposals?: {
    forVisitorStatus(quote: QuoteRequestRecord, assignments: LeadAssignmentRecord[], actor?: ActorContext): Promise<{ proposals: PublicLeadProposal[]; activeProposalAt: Map<string, Date> }>;
  };
}

export class QuoteSubmissionService {
  /** Spec 054 R1: issues and verifies the visitor tokens of every visitor route. */
  readonly visitorAccess: VisitorAccessService<QuoteRequestRecord>;

  constructor(
    private readonly deps: QuoteSubmissionDependencies,
    private readonly audit: AuditLogWriter,
    private readonly repository: QuoteRequestsRepository = new MemoryQuoteRequestsRepository()
  ) {
    this.visitorAccess = new VisitorAccessService<QuoteRequestRecord>(
      deps.visitorAccessTokens ?? new MemoryVisitorAccessTokensRepository(),
      audit,
      (publicReference) => this.repository.findByPublicReference(publicReference),
      deps.visitorAccessOptions ?? {}
    );
  }

  async submit(input: QuoteRequestCreateDto, actor: ActorContext): Promise<QuoteConfirmation> {
    const parsedResult = quoteRequestCreateSchema.safeParse(input);
    if (!parsedResult.success) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.quoteRequestRefused,
        targetType: "QuoteRequest",
        targetId: "draft",
        result: "refused",
        reason: "validation_failed",
        context: {}
      });
      throw new Error("Quote request validation failed");
    }
    const parsed = parsedResult.data;
    const country = await this.deps.findCountryByCode(parsed.countryCode);
    const linkedProduct = await this.deps.findProductByKey(parsed.productKey);
    if (!country || !linkedProduct || !linkedProduct.countryIds.includes(country.id)) {
      throw new Error("Country or product is not available");
    }
    // Spec 050 R2: the product as seen from this country (product flag AND country link flag).
    const product = { ...linkedProduct, flags: effectiveProductFlags(linkedProduct, countryLinkFor(linkedProduct, country.id)) };
    const globalQuoteEnabled = this.deps.isGlobalFlagEnabled ? this.deps.isGlobalFlagEnabled("quote_request_enabled") === true : true;
    if (!globalQuoteEnabled || !publicCountryFlags(country).country_quote_enabled || !product.flags.product_quote_enabled) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.quoteRequestRefused,
        targetType: "QuoteRequest",
        targetId: "draft",
        scope: { countryId: country.id, productId: product.id },
        result: "refused",
        reason: "quote_disabled",
        context: { globalQuoteEnabled }
      });
      throw new Error("Quote request is disabled");
    }
    await this.deps.rateLimit?.assertAllowed(parsed.ipAddress ?? "unknown", country.id, product.id);
    await this.deps.antiSpam?.assertClean({
      ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
      answers: parsed.answers
    });
    // Spec 050 R6: the consent is checked against the published form of the submitted language only.
    const publicForm = await this.deps.forms.publicForm(country.id, product.id, parsed.language).catch((error: unknown) => {
      if (error instanceof NotFoundException) return undefined;
      throw error;
    });
    if (!publicForm || publicForm.formDefinitionId !== parsed.formDefinitionId || publicForm.consent.consentTextId !== parsed.consent.consentTextId || publicForm.consent.contentHash !== parsed.consent.contentHash) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.consentLeadTransmissionRefused,
        targetType: "QuoteRequest",
        targetId: "draft",
        scope: { countryId: country.id, productId: product.id },
        result: "refused",
        reason: "consent_text_mismatch",
        context: { language: parsed.language }
      });
      throw new Error("Consent text mismatch");
    }
    const selectedOffer = await this.verifySelectedOffer(parsed.selectedOfferId, country.id, product.id, actor);
    const contact = this.deps.identity.normalize({
      ...(parsed.contact.displayName ? { displayName: parsed.contact.displayName } : {}),
      email: parsed.contact.email,
      phone: parsed.contact.phone,
      countryCode: country.isoCode,
      // Spec 050 R8: the country's own phone rule when it has one; the generic normalisation otherwise.
      ...(country.phoneDialCode && country.phoneNationalLengths?.length
        ? { phoneRule: { dialCode: country.phoneDialCode, nationalLengths: country.phoneNationalLengths } }
        : {})
    });
    const contactFingerprint = contact.emailFingerprint;
    const duplicateDecision = await this.deps.duplicate?.evaluate(country.id, product.id, contactFingerprint) ?? "unique";
    if (duplicateDecision === "blocked_duplicate") {
      this.audit.write({
        actor,
        action: QuoteAuditActions.quoteRequestDuplicateDetected,
        targetType: "QuoteRequest",
        targetId: "draft",
        scope: { countryId: country.id, productId: product.id },
        result: "refused",
        reason: "blocked_duplicate",
        context: { contactFingerprint }
      });
      return this.duplicateConfirmation();
    }
    const consentRecord = await this.deps.consent.record({
      consentTextId: parsed.consent.consentTextId,
      subjectReference: contact.emailFingerprint,
      purpose: "lead_transmission",
      countryId: country.id,
      productId: product.id,
      channel: "public_web",
      // Spec 042 D2: the visitor decides. The category recorded here is what routing will honour,
      // so a request submitted without the opt-in can never be fanned out later.
      // Spec 052 R8: the broker of an accepted offer is the named recipient (never a fan-out).
      intendedRecipient: selectedOffer?.partnerTenantId
        ? selectedOfferRecipient(selectedOffer.partnerTenantId)
        : parsed.consent.multiBrokerAccepted ? MULTI_BROKER_CONSENT : SINGLE_BROKER_CONSENT,
      status: "granted",
      grantedAt: new Date().toISOString()
    }, actor);
    this.audit.write({
      actor,
      action: QuoteAuditActions.consentLeadTransmissionGranted,
      targetType: "ConsentRecord",
      targetId: consentRecord.id,
      scope: { countryId: country.id, productId: product.id },
      result: "success",
      context: { intendedRecipient: consentRecord.intendedRecipient }
    });

    const surveyConsentRecord = await this.deps.consent.record({
      consentTextId: parsed.consent.consentTextId,
      subjectReference: contact.emailFingerprint,
      purpose: "service_quality_survey",
      countryId: country.id,
      productId: product.id,
      channel: "public_web",
      intendedRecipient: "AssurMatch",
      status: "granted",
      grantedAt: new Date().toISOString()
    }, actor);
    this.audit.write({
      actor,
      action: QuoteAuditActions.consentServiceQualitySurveyGranted,
      targetType: "ConsentRecord",
      targetId: surveyConsentRecord.id,
      scope: { countryId: country.id, productId: product.id },
      result: "success",
      context: { intendedRecipient: "AssurMatch" }
    });
    const prospect = await this.deps.prospects.createOrLink(country.id, product.id, contact, consentRecord.id, actor);
    const now = new Date();
    const quote: QuoteRequestRecord = {
      id: crypto.randomUUID(),
      publicReference: `QR-${now.getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      // Spec 054 R1: the access goes through `VisitorAccessToken`; this marker never matches a token.
      verificationTokenHash: VISITOR_ACCESS_TOKEN_MARKER,
      countryId: country.id,
      countryCode: country.isoCode,
      productId: product.id,
      productKey: product.key,
      ...(parsed.selectedOfferId ? { selectedOfferId: parsed.selectedOfferId } : {}),
      ...(selectedOffer ? { selectedOfferOutcome: selectedOffer.outcome } : {}),
      ...(selectedOffer?.ignoredReason ? { selectedOfferIgnoredReason: selectedOffer.ignoredReason } : {}),
      quoteFormDefinitionId: parsed.formDefinitionId,
      language: parsed.language,
      prospectId: prospect.id,
      consentRecordId: consentRecord.id,
      surveyConsentRecordId: surveyConsentRecord.id,
      source: "public_web",
      payload: parsed.answers,
      status: product.flags.product_manual_review_required ? "manual_review" : "created",
      duplicateStatus: duplicateDecision,
      routingStatus: product.flags.product_manual_review_required ? "manual_review_required" : "not_started",
      ...(actor.correlationId ? { correlationId: actor.correlationId } : {}),
      retentionUntil: new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now
    };
    await this.repository.create(quote);
    const access = await this.visitorAccess.issue(quote.id, { reason: "submission", actor });
    this.audit.write({
      actor,
      action: QuoteAuditActions.quoteRequestCreated,
      targetType: "QuoteRequest",
      targetId: quote.id,
      scope: { countryId: country.id, productId: product.id },
      result: "success",
      context: { duplicateStatus: quote.duplicateStatus, routingStatus: quote.routingStatus }
    });
    const routingResult = quote.routingStatus === "manual_review_required"
      ? undefined
      : await this.deps.routing?.route({ ...quote, ...(selectedOffer?.partnerTenantId ? { preferredPartnerTenantId: selectedOffer.partnerTenantId } : {}) }, actor);
    if (routingResult?.assignment) {
      quote.status = "routed";
      quote.routingStatus = "assigned";
    } else if (routingResult?.routingStatus === "no_broker_available") {
      quote.status = "non_routable";
      quote.routingStatus = "no_broker_available";
      quote.refusalReason = "no_eligible_broker";
    } else if (routingResult?.routingStatus === "pending_manual_assignment") {
      // A `manual` routing rule parks the quote for an admin; the visitor only sees "recue".
      quote.routingStatus = "pending_manual_assignment";
    }
    quote.updatedAt = new Date();
    await this.repository.update(quote.id, quote);
    // Spec 054 R4: "received" (or "in review", or "not transmitted") first, then one "transmitted"
    // e-mail per assignment, each naming its broker.
    await this.deps.notifications?.queueVisitor(quote, actor);
    for (const assignment of routingResult?.assignments ?? []) {
      await this.queueTransmitted(quote, assignment, actor);
    }
    // Spec 042: every recipient of a fanned-out request is notified, not just the first one.
    for (const assignment of routingResult?.assignments ?? []) {
      const brokerNotification = await this.deps.notifications?.queueBroker(quote, assignment, actor);
      if (brokerNotification) assignment.brokerNotificationId = brokerNotification.notification.id;
    }
    await this.deps.aiSummary?.enqueueIfAllowed(quote, actor);
    const brokerName = routingResult?.assignment ? await this.brokerName(routingResult.assignment.partnerTenantId) : undefined;
    return {
      publicReference: quote.publicReference,
      status: quote.status === "routed" ? "routed" : quote.status === "manual_review" ? "manual_review" : quote.status === "duplicate" ? "duplicate" : "non_routable",
      routed: quote.status === "routed",
      ...(brokerName ? { brokerName } : {}),
      message: quote.status === "routed"
        ? (routingResult?.assignments.length ?? 0) > 1
          ? `Votre demande indicative a ete transmise a ${routingResult?.assignments.length} courtiers partenaires eligibles, comme vous l'avez accepte.`
          : "Votre demande indicative a ete transmise au courtier partenaire identifie."
        : "Votre demande a ete recue et reste a confirmer par un courtier partenaire.",
      verificationToken: access.token,
      selectedOfferPartnerRetained: this.selectedOfferPartnerRetained(selectedOffer, routingResult?.selectedOfferOutcome)
    };
  }

  /** FR-019: `true` broker of the offer retained, `false` routed elsewhere or offer ignored, `null` without offer. */
  private selectedOfferPartnerRetained(selectedOffer: { outcome: "accepted" | "ignored"; partnerTenantId?: string | undefined } | undefined, routingOutcome: string | undefined): boolean | null {
    if (!selectedOffer) return null;
    if (selectedOffer.outcome === "ignored") return false;
    if (!selectedOffer.partnerTenantId) return null;
    return routingOutcome === "retained";
  }

  /**
   * Spec 052 R7 / FR-016: a selected offer that does not exist, is not public (unpublished, expired,
   * suspended, broker not eligible) or belongs to another country or product is ignored: the request
   * goes on without it and the discrepancy is audited, the visitor is never blocked.
   */
  private async verifySelectedOffer(offerId: string | undefined, countryId: string, productId: string, actor: ActorContext): Promise<{ outcome: "accepted" | "ignored"; partnerTenantId?: string | undefined; ignoredReason?: string } | undefined> {
    if (!offerId || !this.deps.selectedOffers) return undefined;
    const verdict = await this.deps.selectedOffers.verify(offerId, countryId, productId).catch(() => ({ accepted: false as const, reason: "offer_verification_failed" }));
    if (verdict.accepted) return { outcome: "accepted", ...(verdict.partnerTenantId ? { partnerTenantId: verdict.partnerTenantId } : {}) };
    this.audit.write({
      actor,
      action: QuoteAuditActions.quoteRequestSelectedOfferIgnored,
      targetType: "Offer",
      targetId: offerId,
      scope: { countryId, productId },
      result: "refused",
      reason: verdict.reason,
      context: {}
    });
    return { outcome: "ignored", ignoredReason: verdict.reason };
  }

  findById(id: string): Promise<QuoteRequestRecord | undefined> {
    return this.repository.findById(id);
  }

  async listPendingManual(): Promise<QuoteRequestRecord[]> {
    return (await this.repository.list()).filter((quote) => quote.routingStatus === "pending_manual_assignment");
  }

  /** Spec 056: every request still open to manual review (forced review or parked by a manual rule). */
  async listOpenForReview(): Promise<QuoteRequestRecord[]> {
    return (await this.repository.list()).filter((quote) => isManualReviewOpen(quote));
  }

  findByPublicReference(publicReference: string): Promise<QuoteRequestRecord | undefined> {
    return this.repository.findByPublicReference(publicReference);
  }

  /**
   * Spec 056: the admin approved a request held for manual review; the deterministic routing engine
   * runs exactly as it would have at submission (rules, eligibility, multi-broker consent), and its
   * outcome is persisted with the review stamp.
   */
  async routeAfterReview(quoteRequestId: string, actor: ActorContext, stamp: ManualReviewStamp): Promise<ReviewRoutingOutcome> {
    const quote = await this.repository.findById(quoteRequestId);
    if (!quote) throw new Error(`Quote request ${quoteRequestId} not found`);
    if (!isManualReviewOpen(quote)) throw new Error("Manual review conflict: quote_not_reviewable");
    if (!this.deps.routing) throw new Error("Manual review conflict: routing_not_configured");
    // Spec 052 R7: the broker of the offer the visitor selected stays preferred after the review,
    // provided the offer is still public (it is re-verified; an expired one simply drops out).
    const preferredPartnerTenantId = await this.preferredPartnerAfterReview(quote);
    const routingResult = await this.deps.routing.route({ ...quote, ...(preferredPartnerTenantId ? { preferredPartnerTenantId } : {}) }, actor);
    if (routingResult.assignment) {
      quote.status = "routed";
      quote.routingStatus = "assigned";
    } else if (routingResult.routingStatus === "no_broker_available") {
      quote.status = "non_routable";
      quote.routingStatus = "no_broker_available";
      quote.refusalReason = "no_eligible_broker";
    } else if (routingResult.routingStatus === "pending_manual_assignment") {
      // A `manual` rule covers the scope: the request stays in the queue, now awaiting an assignment.
      quote.status = "created";
      quote.routingStatus = "pending_manual_assignment";
    } else {
      quote.status = "non_routable";
      quote.routingStatus = "blocked";
      quote.refusalReason = "routing_blocked";
    }
    this.stampReview(quote, actor, stamp);
    await this.repository.update(quote.id, quote);
    // Spec 054 R4: one "transmitted" visitor e-mail per assignment, as at submission.
    for (const assignment of routingResult.assignments) {
      await this.queueTransmitted(quote, assignment, actor);
    }
    for (const assignment of routingResult.assignments) {
      const brokerNotification = await this.deps.notifications?.queueBroker(quote, assignment, actor);
      if (brokerNotification) assignment.brokerNotificationId = brokerNotification.notification.id;
    }
    if (routingResult.assignment) await this.deps.aiSummary?.enqueueIfAllowed(quote, actor);
    return { quote, assignmentIds: routingResult.assignments.map((assignment) => assignment.id) };
  }

  /** Spec 056: closes a review without transmission (`non_routable` or `duplicate`); nothing is routed. */
  async closeReview(
    quoteRequestId: string,
    outcome: { kind: "non_routable" } | { kind: "duplicate"; duplicateOfQuoteRequestId?: string | undefined },
    actor: ActorContext,
    stamp: ManualReviewStamp
  ): Promise<QuoteRequestRecord> {
    const quote = await this.repository.findById(quoteRequestId);
    if (!quote) throw new Error(`Quote request ${quoteRequestId} not found`);
    if (!isManualReviewOpen(quote)) throw new Error("Manual review conflict: quote_not_reviewable");
    quote.routingStatus = "blocked";
    if (outcome.kind === "duplicate") {
      quote.status = "duplicate";
      quote.duplicateStatus = "blocked_duplicate";
      quote.refusalReason = "admin_review_duplicate";
      if (outcome.duplicateOfQuoteRequestId) quote.duplicateOfQuoteRequestId = outcome.duplicateOfQuoteRequestId;
    } else {
      quote.status = "non_routable";
      quote.refusalReason = "admin_review_non_routable";
    }
    this.stampReview(quote, actor, stamp);
    await this.repository.update(quote.id, quote);
    return quote;
  }

  /**
   * Spec 056 hook, aligned on the spec 054 visitor steps after a review decision:
   * - routed: the per-assignment "transmitted" e-mails were already queued by `routeAfterReview` /
   *   `assignManually`, so nothing more is sent here;
   * - non-routable: the "not transmitted" e-mail (`visitor_quote_non_routable`);
   * - duplicate: nothing, the original request is the one the visitor follows;
   * - still parked by a manual rule: the "in review" e-mail (deduplicated per request).
   * A notification failure never undoes a persisted decision. Returns whether an e-mail was queued.
   */
  async notifyVisitorOfReviewOutcome(quote: QuoteRequestRecord, actor: ActorContext): Promise<boolean> {
    if (quote.status === "routed" || quote.status === "duplicate") return false;
    try {
      return Boolean(await this.deps.notifications?.queueVisitor(quote, actor));
    } catch {
      return false;
    }
  }

  private async preferredPartnerAfterReview(quote: QuoteRequestRecord): Promise<string | undefined> {
    if (quote.selectedOfferOutcome !== "accepted" || !quote.selectedOfferId || !this.deps.selectedOffers) return undefined;
    const verdict = await this.deps.selectedOffers.verify(quote.selectedOfferId, quote.countryId, quote.productId).catch(() => undefined);
    return verdict?.accepted ? verdict.partnerTenantId : undefined;
  }

  private stampReview(quote: QuoteRequestRecord, actor: ActorContext, stamp: ManualReviewStamp): void {
    const now = new Date();
    quote.reviewedAt = now;
    if (actor.actorId) quote.reviewedById = actor.actorId;
    quote.manualReviewReason = stamp.reason.slice(0, 500);
    quote.updatedAt = now;
  }

  /** Completes a quote parked by a `manual` routing rule; eligibility is enforced by the routing service. */
  async assignManually(quoteRequestId: string, partnerTenantId: string, actor: ActorContext, reason: string): Promise<{ quoteRequestId: string; assignmentId: string; partnerTenantId: string; status: "routed" }> {
    const quote = await this.repository.findById(quoteRequestId);
    if (!quote) throw new Error(`Quote request ${quoteRequestId} not found`);
    // Spec 056: a request held by a forced manual review can be assigned the same way.
    if (!isManualReviewOpen(quote)) throw new Error("Manual routing conflict: quote_not_pending");
    if (!this.deps.routing) throw new Error("Manual routing conflict: routing_not_configured");
    const assignment = await this.deps.routing.assignManually(quote, partnerTenantId, actor, reason);
    quote.status = "routed";
    quote.routingStatus = "assigned";
    this.stampReview(quote, actor, { reason });
    await this.repository.update(quote.id, quote);
    await this.queueTransmitted(quote, assignment, actor);
    const brokerNotification = await this.deps.notifications?.queueBroker(quote, assignment, actor);
    if (brokerNotification) assignment.brokerNotificationId = brokerNotification.notification.id;
    await this.deps.aiSummary?.enqueueIfAllowed(quote, actor);
    return { quoteRequestId: quote.id, assignmentId: assignment.id, partnerTenantId, status: "routed" };
  }

  /** Re-notifies a partner after an admin reassignment; returns the notification id when queued. */
  async notifyBrokerForAssignment(assignment: LeadAssignmentRecord, actor: ActorContext): Promise<string | undefined> {
    const quote = await this.repository.findById(assignment.quoteRequestId);
    if (!quote) return undefined;
    const queued = await this.deps.notifications?.queueBroker(quote, assignment, actor, { allowRepeat: true, reassigned: true });
    return queued?.notification.id;
  }

  /**
   * Visitor-side authentication (documents, withdrawal, status): the public reference plus a valid
   * visitor access token (spec 054 R1), or a pre-054 token before its cutover date.
   */
  async authenticateVisitor(publicReference: string, token: string, actor?: ActorContext): Promise<QuoteRequestRecord | undefined> {
    return (await this.visitorAccess.verify(publicReference, token, actor))?.quote;
  }

  /**
   * Spec 054 R5 / FR-006: the public status of the visitor's own request. Every refusal (unknown
   * reference, wrong, expired or revoked token, anonymized request) is the same neutral 404.
   */
  async status(publicReference: string, token: string, context: { ipAddress?: string; actor?: ActorContext } = {}): Promise<PublicQuoteStatusView> {
    const actor = context.actor ?? { roles: [] };
    if (context.ipAddress) {
      await this.deps.abuseGuard?.assertAllowed({
        scope: "tracking_status",
        ipAddress: context.ipAddress,
        limitPerWindow: STATUS_LIMIT_PER_WINDOW,
        windowSeconds: TRACKING_WINDOW_SECONDS
      });
    }
    const grant = await this.visitorAccess.verify(publicReference, token, actor);
    if (!grant) throw visitorAccessDenied();
    const { quote } = grant;
    const assignments = (await this.safeListAssignments(quote, actor)).filter((assignment) => assignment.quoteRequestId === quote.id);
    const names = new Map<string, string>();
    const nameOf = async (partnerTenantId: string): Promise<string> => {
      if (!names.has(partnerTenantId)) names.set(partnerTenantId, await this.brokerName(partnerTenantId));
      return names.get(partnerTenantId)!;
    };
    const history: ProjectionHistoryEvent[] = [];
    for (const assignment of assignments) {
      const events = this.deps.assignmentHistory ? await this.deps.assignmentHistory(assignment.id).catch(() => []) : [];
      for (const event of events) {
        if (event.eventType !== "reassigned" && event.eventType !== "accepted") continue;
        const previous = event.eventType === "reassigned" ? REASSIGNED_FROM.exec(event.comment ?? "")?.[1] : undefined;
        history.push({
          assignmentId: assignment.id,
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          partnerName: await nameOf(event.partnerTenantId),
          ...(previous ? { previousPartnerName: await nameOf(previous) } : {})
        });
      }
    }
    const visible = this.deps.proposals
      ? await this.deps.proposals.forVisitorStatus(quote, assignments, actor)
      : { proposals: [] as PublicLeadProposal[], activeProposalAt: new Map<string, Date>() };
    const projected = projectPublicQuoteStatus(
      quote,
      await Promise.all(assignments.map(async (assignment) => ({
        id: assignment.id,
        partnerName: await nameOf(assignment.partnerTenantId),
        status: assignment.status,
        crmStatus: assignment.crmStatus,
        createdAt: assignment.createdAt,
        assignedAt: assignment.assignedAt,
        acceptedAt: assignment.acceptedAt,
        crmUpdatedAt: assignment.crmUpdatedAt,
        lastBrokerActionAt: assignment.lastBrokerActionAt,
        updatedAt: assignment.updatedAt,
        activeProposalAt: visible.activeProposalAt.get(assignment.id)
      }))),
      history
    );
    const [country, product] = await Promise.all([
      this.deps.findCountryById?.(quote.countryId).catch(() => undefined),
      this.deps.findProductById?.(quote.productId).catch(() => undefined)
    ]);
    this.audit.write({
      actor,
      action: VisitorTrackingAuditActions.spaceOpened,
      targetType: "QuoteRequest",
      targetId: quote.id,
      scope: { countryId: quote.countryId, productId: quote.productId },
      result: "success",
      context: { legacyToken: grant.legacy, status: projected.status }
    });
    return {
      publicReference: quote.publicReference,
      language: quote.language === "en" ? "en" : "fr",
      country: { isoCode: country?.isoCode ?? quote.countryCode ?? "", name: country?.name ?? country?.isoCode ?? quote.countryCode ?? "" },
      product: { key: product?.key ?? quote.productKey ?? "", name: product?.name ?? product?.key ?? quote.productKey ?? "" },
      status: projected.status,
      brokers: projected.brokers,
      timeline: projected.timeline,
      consent: projected.consent,
      tokenExpiresAt: grant.expiresAt.toISOString(),
      proposals: visible.proposals
    };
  }

  /**
   * Spec 054 R7 / FR-004: sends a new tracking link when the reference and the e-mail match. The
   * answer is the same `202 { accepted: true }` in every case; the e-mail itself leaves through the
   * notification worker, so the response time does not depend on the outcome either.
   */
  async requestTrackingLink(input: unknown, context: { ipAddress: string; actor: ActorContext }): Promise<TrackingLinkResponse> {
    const { actor } = context;
    const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    if (typeof raw.website === "string" && raw.website.trim().length > 0) {
      this.auditTrackingLink(actor, undefined, "refused", "honeypot");
      return { accepted: true };
    }
    const parsed = trackingLinkRequestSchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid submission: validation_failed");
    await this.deps.abuseGuard?.assertAllowed({
      scope: "tracking_link_resend",
      ipAddress: context.ipAddress,
      limitPerWindow: TRACKING_LINK_LIMIT_PER_IP,
      windowSeconds: TRACKING_WINDOW_SECONDS
    });
    const publicReference = parsed.data.publicReference.toUpperCase();
    if (this.deps.redis) {
      const count = await this.deps.redis.incr(QuoteRedisKeys.publicScopeRateLimit("tracking_link_reference", publicReference), TRACKING_WINDOW_SECONDS);
      if (count > TRACKING_LINK_LIMIT_PER_REFERENCE) throw new Error(RATE_LIMIT_MESSAGE);
    }
    const quote = await this.repository.findByPublicReference(publicReference);
    if (!quote) {
      this.auditTrackingLink(actor, undefined, "refused", "unknown_reference");
      return { accepted: true };
    }
    if (quote.anonymizedAt) {
      this.auditTrackingLink(actor, quote.id, "refused", "quote_anonymized");
      return { accepted: true };
    }
    const prospect = await this.deps.prospects.require(quote.prospectId).catch(() => undefined);
    const candidate = this.deps.identity.fingerprint(parsed.data.email.trim().toLowerCase());
    if (!prospect || !sameHex(candidate, prospect.emailFingerprint)) {
      this.auditTrackingLink(actor, quote.id, "refused", "email_mismatch");
      return { accepted: true };
    }
    await this.deps.notifications?.queueVisitorEvent(quote, { type: "visitor_tracking_link", seq: crypto.randomUUID() }, actor);
    this.auditTrackingLink(actor, quote.id, "success", "link_queued");
    return { accepted: true };
  }

  private auditTrackingLink(actor: ActorContext, quoteRequestId: string | undefined, result: "success" | "refused", reason: string): void {
    this.audit.write({
      actor,
      action: result === "success" ? VisitorTrackingAuditActions.trackingLinkRequested : VisitorTrackingAuditActions.trackingLinkRefused,
      targetType: "QuoteRequest",
      targetId: quoteRequestId ?? "unknown",
      result,
      reason,
      context: {}
    });
  }

  private async brokerName(partnerTenantId: string): Promise<string> {
    return (await this.deps.partnerName?.(partnerTenantId).catch(() => undefined)) ?? GENERIC_BROKER_NAME;
  }

  private async queueTransmitted(quote: QuoteRequestRecord, assignment: LeadAssignmentRecord, actor: ActorContext): Promise<void> {
    await this.deps.notifications?.queueVisitorEvent(quote, {
      type: "visitor_quote_transmitted",
      assignmentId: assignment.id,
      partnerTenantId: assignment.partnerTenantId
    }, actor);
  }

  /**
   * Spec 045: the visitor revokes the transmission they had authorised. The revocation is the point
   * of the call, so nothing downstream may block it: once the consent record is withdrawn and the
   * request cancelled, a failing assignment close or inbox publish is audited and stepped over.
   *
   * Spec 054 US4: the first withdrawal queues one confirmation e-mail; a repeated call sends none.
   */
  async withdrawConsent(publicReference: string, token: string, context: { ipAddress: string; actor: ActorContext }): Promise<ConsentWithdrawalResponse> {
    const { actor } = context;
    await this.deps.abuseGuard?.assertAllowed({
      scope: "consent_withdrawal",
      ipAddress: context.ipAddress,
      limitPerWindow: CONSENT_WITHDRAWAL_LIMIT_PER_WINDOW,
      windowSeconds: CONSENT_WITHDRAWAL_WINDOW_SECONDS
    });
    // Same neutral refusal as `status()`: the endpoint must not reveal which references exist.
    const quote = await this.authenticateVisitor(publicReference, token, actor);
    if (!quote) throw visitorAccessDenied();

    if (quote.status === "cancelled") {
      return {
        status: "cancelled",
        publicReference: quote.publicReference,
        alreadyWithdrawn: true,
        message: "Votre demande a deja ete annulee; le courtier partenaire en avait ete informe."
      };
    }

    await this.deps.consent.withdraw(quote.consentRecordId, actor, "visitor_withdrawal");
    if (quote.surveyConsentRecordId) {
      await this.deps.consent.withdraw(quote.surveyConsentRecordId, actor, "visitor_withdrawal");
    }
    await this.deps.satisfactionSurveys?.onConsentWithdrawn(quote.id).catch(() => {});

    quote.status = "cancelled";
    quote.refusalReason = "consent_withdrawn";
    quote.updatedAt = new Date();
    await this.repository.update(quote.id, quote);

    const assignments = (await this.safeListAssignments(quote, actor))
      .filter((assignment) => assignment.quoteRequestId === quote.id && assignment.status !== CLOSED_ASSIGNMENT_STATUS);
    const notifiedTenants = new Set<string>();
    for (const assignment of assignments) {
      await this.closeAssignmentForWithdrawal(assignment, quote, actor);
      if (notifiedTenants.has(assignment.partnerTenantId)) continue;
      notifiedTenants.add(assignment.partnerTenantId);
      await this.notifyPartnerOfWithdrawal(assignment, quote, actor);
    }

    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.quoteRequestCancelledByVisitor,
      targetType: "QuoteRequest",
      targetId: quote.id,
      scope: { countryId: quote.countryId, productId: quote.productId },
      result: "success",
      reason: "consent_withdrawn",
      context: { consentRecordId: quote.consentRecordId, closedAssignments: assignments.length, notifiedPartners: notifiedTenants.size }
    });
    await this.deps.notifications?.queueVisitorEvent(quote, { type: "visitor_consent_withdrawn" }, actor).catch((error: unknown) => {
      this.auditWithdrawalFailure(actor, "Notification", quote.id, "visitor_confirmation_failed", error);
    });

    return {
      status: "cancelled",
      publicReference: quote.publicReference,
      alreadyWithdrawn: false,
      message: "Votre demande a ete annulee et le courtier partenaire a ete informe de votre retrait de consentement."
    };
  }

  private async safeListAssignments(quote: QuoteRequestRecord, actor: ActorContext): Promise<LeadAssignmentRecord[]> {
    if (!this.deps.assignments) return [];
    try {
      return await this.deps.assignments.list();
    } catch (error) {
      this.auditWithdrawalFailure(actor, "LeadAssignment", quote.id, "assignment_lookup_failed", error);
      return [];
    }
  }

  private async closeAssignmentForWithdrawal(assignment: LeadAssignmentRecord, quote: QuoteRequestRecord, actor: ActorContext): Promise<void> {
    try {
      await this.deps.assignments?.updateStatus(assignment.id, CLOSED_ASSIGNMENT_STATUS, actor, "consent_withdrawn");
      this.audit.write({
        actor,
        action: PUBLIC_SITE_AUDIT_ACTIONS.leadAssignmentClosedConsentWithdrawn,
        targetType: "LeadAssignment",
        targetId: assignment.id,
        scope: { quoteRequestId: quote.id, partnerTenantId: assignment.partnerTenantId },
        result: "success",
        reason: "consent_withdrawn",
        context: { status: CLOSED_ASSIGNMENT_STATUS }
      });
    } catch (error) {
      this.auditWithdrawalFailure(actor, "LeadAssignment", assignment.id, "assignment_close_failed", error, { partnerTenantId: assignment.partnerTenantId });
    }
  }

  private async notifyPartnerOfWithdrawal(assignment: LeadAssignmentRecord, quote: QuoteRequestRecord, actor: ActorContext): Promise<void> {
    try {
      await this.deps.inApp?.publishInApp({
        scopeId: assignment.partnerTenantId,
        template: "lead_consent_withdrawn",
        title: "Consentement retire par le visiteur",
        body: `Le visiteur a retire son consentement pour la demande ${quote.publicReference}. Ce lead ne doit plus etre travaille ni recontacte.`,
        targetType: "LeadAssignment",
        targetId: assignment.id
      });
    } catch (error) {
      this.auditWithdrawalFailure(actor, "LeadAssignment", assignment.id, "partner_notification_failed", error, { partnerTenantId: assignment.partnerTenantId });
    }
  }

  private auditWithdrawalFailure(actor: ActorContext, targetType: string, targetId: string, reason: string, error: unknown, scope: Record<string, unknown> = {}): void {
    this.audit.write({
      actor,
      action: PUBLIC_SITE_AUDIT_ACTIONS.leadAssignmentClosedConsentWithdrawn,
      targetType,
      targetId,
      scope,
      result: "failed",
      reason,
      context: { error: error instanceof Error ? error.message.slice(0, 160) : "unknown_error" }
    });
  }

  list(): Promise<QuoteRequestRecord[]> {
    return this.repository.list();
  }

  private duplicateConfirmation(): QuoteConfirmation {
    return {
      publicReference: "duplicate",
      status: "duplicate",
      routed: false,
      message: "Une demande recente similaire existe deja; aucun courtier partenaire n'est notifie une seconde fois.",
      verificationToken: "duplicate"
    };
  }

}

/** Constant-time equality of two hex digests of the same length. */
function sameHex(candidate: string, stored: string | undefined): boolean {
  if (!stored || candidate.length !== stored.length || !/^[0-9a-f]+$/i.test(stored)) return false;
  const left = Buffer.from(candidate, "hex");
  const right = Buffer.from(stored, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export { QUOTE_REQUESTS_REPOSITORY, MemoryQuoteRequestsRepository, type QuoteRequestsRepository } from "./quote-requests.repository";
