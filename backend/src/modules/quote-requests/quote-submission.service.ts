import { createHash } from "node:crypto";
import { quoteRequestCreateSchema, type QuoteConfirmation, type QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import type { ConsentWithdrawalResponse } from "../../../../packages/shared/contracts/public-site.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { PUBLIC_SITE_AUDIT_ACTIONS } from "../audit-logs/public-site-audit-actions";
import { QuoteAuditActions } from "../audit-logs/quote-audit-actions";
import type { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import type { ActorContext } from "../common/types";
import { ConsentService } from "../consent/consent.module";
import { MULTI_BROKER_CONSENT, SINGLE_BROKER_CONSENT } from "../leads/quote-routing.service";
import type { Country } from "../countries/countries.module";
import type { Product } from "../products/products.module";
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
  quoteFormDefinitionId: string;
  prospectId: string;
  consentRecordId: string;
  source: "public_web";
  payload: Record<string, unknown>;
  status: QuoteRequestStatus;
  duplicateStatus: DuplicateStatus;
  routingStatus: RoutingStatus;
  refusalReason?: string;
  manualReviewReason?: string;
  correlationId?: string;
  retentionUntil: Date;
  createdAt: Date;
  updatedAt: Date;
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
  /** Spec 045 consent withdrawal: tells each partner tenant, in its inbox, to stop working the lead. */
  inApp?: QuoteInAppNotifierPort;
  /** Spec 045 consent withdrawal: per-IP rate limit on the unauthenticated withdrawal endpoint. */
  abuseGuard?: PublicAbuseGuardService;
  isGlobalFlagEnabled?: (key: string) => boolean;
}

export class QuoteSubmissionService {
  constructor(
    private readonly deps: QuoteSubmissionDependencies,
    private readonly audit: AuditLogWriter,
    private readonly repository: QuoteRequestsRepository = new MemoryQuoteRequestsRepository()
  ) {}

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
    const product = await this.deps.findProductByKey(parsed.productKey);
    if (!country || !product || !product.countryIds.includes(country.id)) {
      throw new Error("Country or product is not available");
    }
    const globalQuoteEnabled = this.deps.isGlobalFlagEnabled ? this.deps.isGlobalFlagEnabled("quote_request_enabled") === true : true;
    if (!globalQuoteEnabled || !country.flags.country_quote_enabled || !product.flags.product_quote_enabled) {
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
    const publicForm = await this.deps.forms.publicForm(country.id, product.id);
    if (publicForm.formDefinitionId !== parsed.formDefinitionId || publicForm.consent.consentTextId !== parsed.consent.consentTextId || publicForm.consent.contentHash !== parsed.consent.contentHash) {
      this.audit.write({
        actor,
        action: QuoteAuditActions.consentLeadTransmissionRefused,
        targetType: "QuoteRequest",
        targetId: "draft",
        scope: { countryId: country.id, productId: product.id },
        result: "refused",
        reason: "consent_text_mismatch",
        context: {}
      });
      throw new Error("Consent text mismatch");
    }
    const contact = this.deps.identity.normalize({
      ...(parsed.contact.displayName ? { displayName: parsed.contact.displayName } : {}),
      email: parsed.contact.email,
      phone: parsed.contact.phone,
      countryCode: country.isoCode
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
      intendedRecipient: parsed.consent.multiBrokerAccepted ? MULTI_BROKER_CONSENT : SINGLE_BROKER_CONSENT,
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
    const prospect = await this.deps.prospects.createOrLink(country.id, product.id, contact, consentRecord.id, actor);
    const token = crypto.randomUUID();
    const now = new Date();
    const quote: QuoteRequestRecord = {
      id: crypto.randomUUID(),
      publicReference: `QR-${now.getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      verificationTokenHash: this.hash(token),
      countryId: country.id,
      countryCode: country.isoCode,
      productId: product.id,
      productKey: product.key,
      ...(parsed.selectedOfferId ? { selectedOfferId: parsed.selectedOfferId } : {}),
      quoteFormDefinitionId: parsed.formDefinitionId,
      prospectId: prospect.id,
      consentRecordId: consentRecord.id,
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
    this.audit.write({
      actor,
      action: QuoteAuditActions.quoteRequestCreated,
      targetType: "QuoteRequest",
      targetId: quote.id,
      scope: { countryId: country.id, productId: product.id },
      result: "success",
      context: { duplicateStatus: quote.duplicateStatus, routingStatus: quote.routingStatus }
    });
    const routingResult = quote.routingStatus === "manual_review_required" ? undefined : await this.deps.routing?.route(quote, actor);
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
    await this.deps.notifications?.queueVisitor(quote, actor);
    // Spec 042: every recipient of a fanned-out request is notified, not just the first one.
    for (const assignment of routingResult?.assignments ?? []) {
      const brokerNotification = await this.deps.notifications?.queueBroker(quote, assignment, actor);
      if (brokerNotification) assignment.brokerNotificationId = brokerNotification.notification.id;
    }
    await this.deps.aiSummary?.enqueueIfAllowed(quote, actor);
    return {
      publicReference: quote.publicReference,
      status: quote.status === "routed" ? "routed" : quote.status === "manual_review" ? "manual_review" : quote.status === "duplicate" ? "duplicate" : "non_routable",
      routed: quote.status === "routed",
      ...(routingResult?.assignment ? { brokerName: "courtier partenaire" } : {}),
      message: quote.status === "routed"
        ? (routingResult?.assignments.length ?? 0) > 1
          ? `Votre demande indicative a ete transmise a ${routingResult?.assignments.length} courtiers partenaires eligibles, comme vous l'avez accepte.`
          : "Votre demande indicative a ete transmise au courtier partenaire identifie."
        : "Votre demande a ete recue et reste a confirmer par un courtier partenaire.",
      verificationToken: token
    };
  }

  findById(id: string): Promise<QuoteRequestRecord | undefined> {
    return this.repository.findById(id);
  }

  async listPendingManual(): Promise<QuoteRequestRecord[]> {
    return (await this.repository.list()).filter((quote) => quote.routingStatus === "pending_manual_assignment");
  }

  /** Completes a quote parked by a `manual` routing rule; eligibility is enforced by the routing service. */
  async assignManually(quoteRequestId: string, partnerTenantId: string, actor: ActorContext, reason: string): Promise<{ quoteRequestId: string; assignmentId: string; partnerTenantId: string; status: "routed" }> {
    const quote = await this.repository.findById(quoteRequestId);
    if (!quote) throw new Error(`Quote request ${quoteRequestId} not found`);
    if (quote.routingStatus !== "pending_manual_assignment") throw new Error("Manual routing conflict: quote_not_pending");
    if (!this.deps.routing) throw new Error("Manual routing conflict: routing_not_configured");
    const assignment = await this.deps.routing.assignManually(quote, partnerTenantId, actor, reason);
    quote.status = "routed";
    quote.routingStatus = "assigned";
    quote.updatedAt = new Date();
    await this.repository.update(quote.id, quote);
    const brokerNotification = await this.deps.notifications?.queueBroker(quote, assignment, actor);
    if (brokerNotification) assignment.brokerNotificationId = brokerNotification.notification.id;
    await this.deps.aiSummary?.enqueueIfAllowed(quote, actor);
    return { quoteRequestId: quote.id, assignmentId: assignment.id, partnerTenantId, status: "routed" };
  }

  /** Re-notifies a partner after an admin reassignment; returns the notification id when queued. */
  async notifyBrokerForAssignment(assignment: LeadAssignmentRecord, actor: ActorContext): Promise<string | undefined> {
    const quote = await this.repository.findById(assignment.quoteRequestId);
    if (!quote) return undefined;
    const queued = await this.deps.notifications?.queueBroker(quote, assignment, actor, { allowRepeat: true });
    return queued?.notification.id;
  }

  /** Visitor-side authentication: the public reference plus the verification token issued at submission. */
  async authenticateVisitor(publicReference: string, token: string): Promise<QuoteRequestRecord | undefined> {
    if (!token) return undefined;
    const quote = await this.repository.findByPublicReference(publicReference);
    if (!quote || quote.verificationTokenHash !== this.hash(token)) return undefined;
    return quote;
  }

  async status(publicReference: string, token: string) {
    const quote = await this.repository.findByPublicReference(publicReference);
    if (!quote || quote.verificationTokenHash !== this.hash(token)) throw new Error(QUOTE_NOT_AVAILABLE);
    return {
      publicReference: quote.publicReference,
      status: quote.status,
      ...(quote.status === "routed" ? { brokerName: "courtier partenaire" } : {})
    };
  }

  /**
   * Spec 045: the visitor revokes the transmission they had authorised. The revocation is the point
   * of the call, so nothing downstream may block it: once the consent record is withdrawn and the
   * request cancelled, a failing assignment close or inbox publish is audited and stepped over.
   *
   * No e-mail is sent here: that would need a new `NotificationType` enum value and a migration, out of scope.
   */
  async withdrawConsent(publicReference: string, token: string, context: { ipAddress: string; actor: ActorContext }): Promise<ConsentWithdrawalResponse> {
    const { actor } = context;
    await this.deps.abuseGuard?.assertAllowed({
      scope: "consent_withdrawal",
      ipAddress: context.ipAddress,
      limitPerWindow: CONSENT_WITHDRAWAL_LIMIT_PER_WINDOW,
      windowSeconds: CONSENT_WITHDRAWAL_WINDOW_SECONDS
    });
    const quote = await this.repository.findByPublicReference(publicReference);
    // Same message as `status()` for an unknown reference: the endpoint must not reveal which references exist.
    if (!quote || quote.verificationTokenHash !== this.hash(token)) throw new Error(QUOTE_NOT_AVAILABLE);

    if (quote.status === "cancelled") {
      return {
        status: "cancelled",
        publicReference: quote.publicReference,
        alreadyWithdrawn: true,
        message: "Votre demande a deja ete annulee; le courtier partenaire en avait ete informe."
      };
    }

    await this.deps.consent.withdraw(quote.consentRecordId, actor, "visitor_withdrawal");

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

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}

export { QUOTE_REQUESTS_REPOSITORY, MemoryQuoteRequestsRepository, type QuoteRequestsRepository } from "./quote-requests.repository";
