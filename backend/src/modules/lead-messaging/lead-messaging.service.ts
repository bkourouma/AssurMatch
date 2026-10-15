import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { findForbiddenWordingAnyLanguage } from "../../../../packages/shared/contracts/content-safety";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import {
  LEAD_MESSAGE_DUPLICATE_WINDOW_MINUTES,
  LEAD_MESSAGE_PAGE_SIZE,
  LEAD_MESSAGE_THREAD_MAX,
  VISITOR_DOWNLOAD_RATE_LIMIT_PER_IP_PER_HOUR,
  VISITOR_MESSAGE_RATE_LIMIT_PER_CONVERSATION_PER_HOUR,
  VISITOR_MESSAGE_RATE_LIMIT_PER_IP_PER_HOUR,
  leadMessagingNotice,
  type AdminLeadConversationView,
  type AdminLeadConversationsView,
  type LeadConversationQuery,
  type LeadConversationReadOnlyReason,
  type LeadConversationReadResult,
  type LeadConversationView,
  type LeadMessageSendResult,
  type LeadMessageView,
  type PublicMessagingSummary,
  type VisitorConversationList,
  type VisitorConversationSummary
} from "../../../../packages/shared/contracts/lead-messaging";
import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { LeadMessagingAuditActions } from "../audit-logs/lead-messaging-audit-actions";
import type { PublicAbuseGuardService } from "../common/abuse/public-abuse-guard.service";
import { QuoteRedisKeys } from "../common/redis/quote-redis-keys";
import type { RedisClientPort } from "../common/redis/redis.module";
import type { ActorContext } from "../common/types";
import type { BrokerCrmAccessPolicy } from "../leads/broker-crm-access-policy";
import type { BrokerStarterAccessPolicy } from "../leads/broker-starter-access-policy";
import type { LeadAssignmentRecord, LeadAssignmentService } from "../leads/lead-assignment.service";
import type { ProposalFile } from "../lead-proposals/lead-proposals.service";
import type { ScannedUploadDeps, UploadedLeadFile } from "../lead-proposals/scanned-upload";
import { assertBrokerTenantWritable } from "../partners/partner-tenant-status.service";
import { visitorAccessDenied } from "../quote-requests/quote-submission.service";
import {
  messageNotificationBucket,
  type FirstVisibleReplyPort,
  type LeadMessagingNotificationsPort,
  type MessagingQuote
} from "./lead-messaging.ports";
import {
  MemoryLeadMessagingRepository,
  type LeadMessageAttachmentRecord,
  type LeadMessageRecord,
  type LeadMessagingRepository,
  type NewLeadMessageAttachment
} from "./lead-messaging.repository";
import {
  attachmentRefusalError,
  badRequest,
  brokerWriteBlocker,
  conflict,
  consentWithdrawn,
  conversationIdFor,
  forbiddenWordingError,
  isQuarantine,
  leadState,
  quoteLocale,
  readOnlyMessage,
  storeAttachments,
  unprocessable
} from "./lead-messaging.rules";

export type LeadMessagingChannel = "starter" | "crm";

export interface LeadMessagingServiceDeps {
  audit: AuditLogWriter;
  repository?: LeadMessagingRepository | undefined;
  assignments: LeadAssignmentService;
  crmAccess: BrokerCrmAccessPolicy;
  starterAccess: BrokerStarterAccessPolicy;
  upload: ScannedUploadDeps;
  quotes: { findById(id: string): Promise<MessagingQuote | undefined> };
  partnerName: (partnerTenantId: string) => Promise<string>;
  notifications?: LeadMessagingNotificationsPort | undefined;
  firstVisibleReply?: FirstVisibleReplyPort | undefined;
  /** Spec 054 token verification of every visitor route. */
  visitorAccess?: { verify(publicReference: string, token: string, actor?: ActorContext): Promise<{ quote: MessagingQuote } | undefined> } | undefined;
  abuseGuard?: PublicAbuseGuardService | undefined;
  redis?: RedisClientPort | undefined;
  /** Global flag `broker_visitor_messaging_enabled` (default on when no row exists), read on every call. */
  isMessagingEnabled?: (() => boolean) | undefined;
  now?: () => Date;
}

export interface VisitorRequestContext {
  ipAddress?: string | undefined;
  actor?: ActorContext | undefined;
}

export interface BrokerMessageInput {
  body: string;
  clientRequestId?: string | undefined;
}

export interface VisitorMessageInput extends BrokerMessageInput {
  /** Honeypot of the public form: a filled one gets a fake success and no write. */
  website?: string | undefined;
}

const SYSTEM_VISITOR: ActorContext = { actorId: "visitor", roles: [] };
const WINDOW_SECONDS = 3600;
const MASKED_BODY = "[masqué]";
const ADMIN_ROLES: ReadonlySet<AssurMatchRole> = new Set<AssurMatchRole>(["super_admin", "compliance_admin", "support_admin"]);
const ADMIN_UNMASKED_ROLES: ReadonlySet<AssurMatchRole> = new Set<AssurMatchRole>(["super_admin", "compliance_admin"]);

/** A conversation as seen from the quote request: one broker, one assignment, its messages. */
interface QuoteConversation {
  id: string;
  leadAssignmentId: string;
  partnerTenantId: string;
  assignment: LeadAssignmentRecord | undefined;
  messages: LeadMessageRecord[];
}

function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: ErrorCodes.NOT_FOUND, message });
}

/**
 * Spec 062: the written exchange between the assigned broker (Starter or CRM) and the visitor.
 *
 * - A conversation is the pair (assignment, broker). A reassignment mutates the same assignment row,
 *   so the new broker starts from an empty conversation and the previous one is read-only for the visitor.
 * - Messages are append-only; the only change a row accepts is the recipient's first read.
 * - The broker side goes through the regulated-wording guard; the visitor side is rate limited,
 *   protected by a honeypot and refuses identical repeats.
 * - Notifications are pointers (identifiers and a 15 minute bucket): the message text, file names and
 *   visitor data never reach a notification, an audit entry or a log.
 */
export class LeadMessagingService {
  private readonly repository: LeadMessagingRepository;

  constructor(private readonly deps: LeadMessagingServiceDeps) {
    this.repository = deps.repository ?? new MemoryLeadMessagingRepository();
  }

  // ---------------------------------------------------------------------------------------------
  // Broker side
  // ---------------------------------------------------------------------------------------------

  /** The conversation of the broker currently assigned to the lead; never a previous broker's. */
  async brokerConversation(channel: LeadMessagingChannel, leadId: string, query: LeadConversationQuery, actor: ActorContext): Promise<LeadConversationView> {
    const assignment = await this.deps.assignments.require(leadId);
    this.assertRead(channel, actor, assignment);
    const quote = await this.quoteOf(assignment.quoteRequestId);
    const messages = await this.repository.listForConversation(assignment.id, assignment.partnerTenantId);
    const reason = this.brokerReadOnlyReason(assignment, quote, actor);
    return this.conversationView({
      conversationId: conversationIdFor(assignment.id, assignment.partnerTenantId),
      partnerName: await this.deps.partnerName(assignment.partnerTenantId),
      reason,
      messages,
      reader: "broker",
      query,
      locale: "fr"
    });
  }

  async brokerSend(channel: LeadMessagingChannel, leadId: string, input: BrokerMessageInput, files: readonly UploadedLeadFile[], actor: ActorContext): Promise<LeadMessageSendResult> {
    assertBrokerTenantWritable(actor);
    const assignment = await this.deps.assignments.require(leadId);
    this.assertMutation(channel, actor, assignment);
    const refuse = (code: string, reason: string, error: Error, context: Record<string, unknown> = {}): never => {
      this.deps.audit.write({
        actor,
        action: LeadMessagingAuditActions.refused,
        targetType: "LeadAssignment",
        targetId: assignment.id,
        scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId },
        result: "refused",
        reason,
        context: { channel, code, side: "broker", ...context }
      });
      throw error;
    };

    if (!this.enabled()) refuse(ErrorCodes.MESSAGING_DISABLED, "messaging_disabled", conflict(ErrorCodes.MESSAGING_DISABLED, "Messaging is switched off"));
    const quote = await this.quoteOf(assignment.quoteRequestId);
    const blocker = brokerWriteBlocker(assignment, quote);
    if (blocker === "consent_withdrawn") refuse(ErrorCodes.LEAD_CONSENT_WITHDRAWN, blocker, unprocessable(ErrorCodes.LEAD_CONSENT_WITHDRAWN, "Message refused: the visitor's consent is no longer active"));
    if (blocker === "lead_closed") refuse(ErrorCodes.LEAD_CLOSED, blocker, conflict(ErrorCodes.LEAD_CLOSED, "Lead closed: no message can be sent"));
    if (blocker === "not_accepted") refuse(ErrorCodes.LEAD_NOT_ACCEPTED, blocker, conflict(ErrorCodes.LEAD_NOT_ACCEPTED, "Lead must be accepted before a message is sent"));
    const activeQuote = quote as MessagingQuote;

    if (input.clientRequestId) {
      const existing = await this.repository.findByClientRequestId(assignment.id, "broker", input.clientRequestId);
      if (existing && existing.partnerTenantId === assignment.partnerTenantId) return { message: this.toView(existing, "broker") };
    }
    const wording = findForbiddenWordingAnyLanguage(input.body);
    if (wording.length > 0) refuse(ErrorCodes.FORBIDDEN_WORDING, "forbidden_wording", forbiddenWordingError(wording), { wordingCount: wording.length });
    if (await this.repository.countForConversation(assignment.id, assignment.partnerTenantId) >= LEAD_MESSAGE_THREAD_MAX) {
      refuse(ErrorCodes.THREAD_LIMIT_REACHED, "thread_limit_reached", conflict(ErrorCodes.THREAD_LIMIT_REACHED, `At most ${LEAD_MESSAGE_THREAD_MAX} messages per conversation`));
    }

    const stored = await storeAttachments(this.deps.upload, files, "lm");
    if (!stored.ok) {
      if (isQuarantine(stored.refusal)) this.auditQuarantine(actor, assignment.id, assignment.partnerTenantId, stored.refusal, stored.engine);
      return refuse(stored.refusal === "scan_failed" || stored.refusal === "infected" ? ErrorCodes.DOCUMENT_QUARANTINED : ErrorCodes.DOCUMENT_INVALID, `attachment_${stored.refusal}`, attachmentRefusalError(stored.refusal));
    }

    const now = this.now();
    const messageId = crypto.randomUUID();
    const record = await this.repository.appendMessage({
      id: messageId,
      quoteRequestId: assignment.quoteRequestId,
      leadAssignmentId: assignment.id,
      partnerTenantId: assignment.partnerTenantId,
      senderType: "broker",
      ...(actor.actorId ? { authorId: actor.actorId } : {}),
      body: input.body,
      ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
      createdAt: now
    }, this.attachmentRecords(messageId, assignment, stored.files.map((entry) => entry.stored), now));
    this.deps.audit.write({
      actor,
      action: LeadMessagingAuditActions.sent,
      targetType: "LeadMessage",
      targetId: record.id,
      scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId, leadAssignmentId: assignment.id },
      result: "success",
      context: { channel, attachmentCount: record.attachments.length }
    });
    await this.safely(() => this.deps.notifications?.queueVisitorBrokerMessage(activeQuote, { assignmentId: assignment.id, partnerTenantId: assignment.partnerTenantId, bucket: messageNotificationBucket(now) }, actor));
    // E-08: only a broker message counts towards the first visible reply (idempotent on the port side).
    await this.safely(() => this.deps.firstVisibleReply?.recordFirstVisibleReply(assignment.id, now, actor));
    return { message: this.toView(record, "broker") };
  }

  async brokerMarkRead(channel: LeadMessagingChannel, leadId: string, actor: ActorContext): Promise<LeadConversationReadResult> {
    assertBrokerTenantWritable(actor);
    const assignment = await this.deps.assignments.require(leadId);
    this.assertRead(channel, actor, assignment);
    const marked = await this.repository.markRead(assignment.id, assignment.partnerTenantId, "broker", this.now());
    if (marked > 0) {
      this.deps.audit.write({
        actor,
        action: LeadMessagingAuditActions.read,
        targetType: "LeadAssignment",
        targetId: assignment.id,
        scope: { partnerTenantId: assignment.partnerTenantId, quoteRequestId: assignment.quoteRequestId },
        result: "success",
        context: { side: "broker", count: marked }
      });
    }
    return { markedRead: marked, unreadCount: 0 };
  }

  /** Broker download with its session: own conversation, clean file only, audited. */
  async brokerAttachment(channel: LeadMessagingChannel, leadId: string, messageId: string, attachmentId: string, actor: ActorContext): Promise<ProposalFile> {
    const assignment = await this.deps.assignments.require(leadId);
    this.assertRead(channel, actor, assignment);
    const message = await this.repository.findMessage(messageId);
    const own = message && message.leadAssignmentId === assignment.id && message.partnerTenantId === assignment.partnerTenantId;
    return this.serveAttachment(own ? message : undefined, attachmentId, {
      actor,
      by: "broker",
      quoteRequestId: assignment.quoteRequestId,
      partnerTenantId: assignment.partnerTenantId,
      notFound: () => notFound("Attachment not found")
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Visitor side (token of spec 054)
  // ---------------------------------------------------------------------------------------------

  async visitorList(publicReference: string, token: string, context: VisitorRequestContext = {}): Promise<VisitorConversationList> {
    const actor = context.actor ?? SYSTEM_VISITOR;
    const quote = await this.verifyVisitor(publicReference, token, actor);
    const conversations = await this.quoteConversations(quote);
    const summaries: VisitorConversationSummary[] = [];
    for (const conversation of conversations) {
      const reason = this.visitorReadOnlyReason(conversation, quote);
      const last = conversation.messages.at(-1);
      summaries.push({
        conversationId: conversation.id,
        partnerName: await this.deps.partnerName(conversation.partnerTenantId),
        state: reason ? "read_only" : "open",
        readOnlyReason: reason ?? null,
        canSend: !reason,
        unreadCount: this.unread(conversation.messages, "visitor"),
        lastMessage: last ? this.toView(last, "visitor") : null
      });
    }
    return { messagingEnabled: this.enabled(), conversations: summaries };
  }

  async visitorConversation(publicReference: string, token: string, conversationId: string, query: LeadConversationQuery, context: VisitorRequestContext = {}): Promise<LeadConversationView> {
    const actor = context.actor ?? SYSTEM_VISITOR;
    const quote = await this.verifyVisitor(publicReference, token, actor);
    const conversation = this.requireConversation(await this.quoteConversations(quote), conversationId);
    return this.conversationView({
      conversationId: conversation.id,
      partnerName: await this.deps.partnerName(conversation.partnerTenantId),
      reason: this.visitorReadOnlyReason(conversation, quote),
      messages: conversation.messages,
      reader: "visitor",
      query,
      locale: quoteLocale(quote)
    });
  }

  async visitorSend(publicReference: string, token: string, conversationId: string, input: VisitorMessageInput, files: readonly UploadedLeadFile[], context: VisitorRequestContext = {}): Promise<LeadMessageSendResult> {
    const actor = context.actor ?? SYSTEM_VISITOR;
    if (context.ipAddress) {
      await this.deps.abuseGuard?.assertAllowed({ scope: "lead_message", ipAddress: context.ipAddress, limitPerWindow: VISITOR_MESSAGE_RATE_LIMIT_PER_IP_PER_HOUR, windowSeconds: WINDOW_SECONDS });
    }
    const quote = await this.verifyVisitor(publicReference, token, actor);
    const conversation = this.requireConversation(await this.quoteConversations(quote), conversationId);
    if (this.deps.redis) {
      const count = await this.deps.redis.incr(QuoteRedisKeys.publicScopeRateLimit("lead_message_conversation", conversation.id), WINDOW_SECONDS);
      if (count > VISITOR_MESSAGE_RATE_LIMIT_PER_CONVERSATION_PER_HOUR) throw new Error("Rate limit exceeded for public submissions");
    }
    const now = this.now();
    if (input.website && input.website.trim().length > 0) {
      // Honeypot: only a bot fills it. A success that looks real, and nothing is written.
      return { message: { id: crypto.randomUUID(), senderType: "visitor", mine: true, body: input.body, createdAt: now.toISOString(), readAt: null, attachments: [] } };
    }
    const refuse = (code: string, reason: string, error: Error): never => {
      this.deps.audit.write({
        actor,
        action: LeadMessagingAuditActions.refused,
        targetType: "LeadAssignment",
        targetId: conversation.leadAssignmentId,
        scope: { quoteRequestId: quote.id, partnerTenantId: conversation.partnerTenantId },
        result: "refused",
        reason,
        context: { code, side: "visitor" }
      });
      throw error;
    };

    if (!this.enabled()) refuse(ErrorCodes.MESSAGING_DISABLED, "messaging_disabled", conflict(ErrorCodes.MESSAGING_DISABLED, "Messaging is switched off"));
    const readOnly = this.visitorReadOnlyReason(conversation, quote);
    if (readOnly) refuse(ErrorCodes.CONVERSATION_READ_ONLY, readOnly, conflict(ErrorCodes.CONVERSATION_READ_ONLY, readOnlyMessage(readOnly), { reason: readOnly }));
    const assignment = conversation.assignment as LeadAssignmentRecord;

    if (input.clientRequestId) {
      const existing = await this.repository.findByClientRequestId(assignment.id, "visitor", input.clientRequestId);
      if (existing && existing.partnerTenantId === conversation.partnerTenantId) return { message: this.toView(existing, "visitor") };
    }
    const lastVisitor = [...conversation.messages].reverse().find((message) => message.senderType === "visitor");
    if (lastVisitor && lastVisitor.body === input.body && now.getTime() - lastVisitor.createdAt.getTime() < LEAD_MESSAGE_DUPLICATE_WINDOW_MINUTES * 60_000) {
      refuse(ErrorCodes.DUPLICATE_MESSAGE, "duplicate_message", conflict(ErrorCodes.DUPLICATE_MESSAGE, "The same message was just sent"));
    }
    if (conversation.messages.length >= LEAD_MESSAGE_THREAD_MAX) {
      refuse(ErrorCodes.THREAD_LIMIT_REACHED, "thread_limit_reached", conflict(ErrorCodes.THREAD_LIMIT_REACHED, `At most ${LEAD_MESSAGE_THREAD_MAX} messages per conversation`));
    }

    const stored = await storeAttachments(this.deps.upload, files, "lm");
    if (!stored.ok) {
      if (isQuarantine(stored.refusal)) this.auditQuarantine(actor, assignment.id, assignment.partnerTenantId, stored.refusal, stored.engine);
      return refuse(isQuarantine(stored.refusal) ? ErrorCodes.DOCUMENT_QUARANTINED : ErrorCodes.DOCUMENT_INVALID, `attachment_${stored.refusal}`, attachmentRefusalError(stored.refusal));
    }

    const messageId = crypto.randomUUID();
    const record = await this.repository.appendMessage({
      id: messageId,
      quoteRequestId: quote.id,
      leadAssignmentId: assignment.id,
      partnerTenantId: conversation.partnerTenantId,
      senderType: "visitor",
      body: input.body,
      ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
      createdAt: now
    }, this.attachmentRecords(messageId, assignment, stored.files.map((entry) => entry.stored), now));
    this.deps.audit.write({
      actor,
      action: LeadMessagingAuditActions.visitorSent,
      targetType: "LeadMessage",
      targetId: record.id,
      scope: { quoteRequestId: quote.id, partnerTenantId: conversation.partnerTenantId, leadAssignmentId: assignment.id },
      result: "success",
      context: { attachmentCount: record.attachments.length }
    });
    await this.safely(() => this.deps.notifications?.queueBrokerVisitorMessage(quote, { assignmentId: assignment.id, partnerTenantId: conversation.partnerTenantId, bucket: messageNotificationBucket(now) }, actor));
    return { message: this.toView(record, "visitor") };
  }

  async visitorMarkRead(publicReference: string, token: string, conversationId: string, context: VisitorRequestContext = {}): Promise<LeadConversationReadResult> {
    const actor = context.actor ?? SYSTEM_VISITOR;
    const quote = await this.verifyVisitor(publicReference, token, actor);
    const conversation = this.requireConversation(await this.quoteConversations(quote), conversationId);
    const marked = await this.repository.markRead(conversation.leadAssignmentId, conversation.partnerTenantId, "visitor", this.now());
    if (marked > 0) {
      this.deps.audit.write({
        actor,
        action: LeadMessagingAuditActions.read,
        targetType: "LeadAssignment",
        targetId: conversation.leadAssignmentId,
        scope: { quoteRequestId: quote.id, partnerTenantId: conversation.partnerTenantId },
        result: "success",
        context: { side: "visitor", count: marked }
      });
    }
    return { markedRead: marked, unreadCount: 0 };
  }

  /** Clean file only, audited, rate limited per IP; every refusal is the neutral 404 of the visitor routes. */
  async visitorAttachment(publicReference: string, token: string, conversationId: string, messageId: string, attachmentId: string, context: VisitorRequestContext = {}): Promise<ProposalFile> {
    const actor = context.actor ?? SYSTEM_VISITOR;
    if (context.ipAddress) {
      await this.deps.abuseGuard?.assertAllowed({ scope: "lead_message_attachment", ipAddress: context.ipAddress, limitPerWindow: VISITOR_DOWNLOAD_RATE_LIMIT_PER_IP_PER_HOUR, windowSeconds: WINDOW_SECONDS });
    }
    const quote = await this.verifyVisitor(publicReference, token, actor);
    const conversation = this.requireConversation(await this.quoteConversations(quote), conversationId);
    const message = conversation.messages.find((candidate) => candidate.id === messageId);
    return this.serveAttachment(message, attachmentId, {
      actor,
      by: "visitor",
      quoteRequestId: quote.id,
      partnerTenantId: conversation.partnerTenantId,
      notFound: () => visitorAccessDenied()
    });
  }

  /** `messaging: { enabled, unreadCount }` of the tracking status view (broker messages not read yet). */
  async summaryForVisitorStatus(quote: MessagingQuote): Promise<PublicMessagingSummary> {
    const enabled = this.enabled();
    if (quote.anonymizedAt) return { enabled, unreadCount: 0 };
    const messages = await this.repository.listForQuote(quote.id);
    return { enabled, unreadCount: this.unread(messages, "visitor") };
  }

  // ---------------------------------------------------------------------------------------------
  // Admin (read-only, audited)
  // ---------------------------------------------------------------------------------------------

  /** Compliance and super admin read the bodies; support gets them masked. Every call is audited. */
  async adminConversations(actor: ActorContext, quoteRequestId: string): Promise<AdminLeadConversationsView & { masked: boolean }> {
    const allowed = actor.mfaVerified === true && actor.roles.some((role) => ADMIN_ROLES.has(role));
    if (!allowed) {
      this.deps.audit.write({
        actor,
        action: LeadMessagingAuditActions.adminViewRefused,
        targetType: "QuoteRequest",
        targetId: quoteRequestId,
        scope: {},
        result: "refused",
        reason: actor.mfaVerified === true ? "forbidden_role" : "mfa_required",
        context: {}
      });
      throw new ForbiddenException({ code: ErrorCodes.RBAC_DENIED, message: "Lead messaging access denied" });
    }
    const quote = await this.quoteOf(quoteRequestId);
    if (!quote) throw notFound("Quote request not found");
    const masked = !actor.roles.some((role) => ADMIN_UNMASKED_ROLES.has(role));
    const conversations: AdminLeadConversationView[] = [];
    let messageCount = 0;
    for (const conversation of await this.quoteConversations(quote)) {
      const reason = this.visitorReadOnlyReason(conversation, quote);
      messageCount += conversation.messages.length;
      conversations.push({
        conversationId: conversation.id,
        partnerName: await this.deps.partnerName(conversation.partnerTenantId),
        state: reason ? "read_only" : "open",
        readOnlyReason: reason ?? null,
        messages: conversation.messages.map((message) => ({
          id: message.id,
          senderType: message.senderType,
          body: masked ? MASKED_BODY : message.body,
          bodyMasked: masked,
          createdAt: message.createdAt.toISOString(),
          readAt: message.readAt ? message.readAt.toISOString() : null,
          attachmentCount: message.attachments.filter((attachment) => attachment.scanStatus === "clean").length
        }))
      });
    }
    this.deps.audit.write({
      actor,
      action: LeadMessagingAuditActions.adminViewed,
      targetType: "QuoteRequest",
      targetId: quote.id,
      scope: { quoteRequestId: quote.id },
      result: "success",
      context: { conversationCount: conversations.length, messageCount, masked }
    });
    return { quoteRequestId: quote.id, masked, conversations };
  }

  /** Spec 046 retention: scrub the bodies and file names of these assignments (ids, authors and timestamps stay). */
  anonymizeForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void> {
    return this.repository.anonymizeForAssignments(leadAssignmentIds, marker, now);
  }

  // ---------------------------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------------------------

  private enabled(): boolean {
    return this.deps.isMessagingEnabled ? this.deps.isMessagingEnabled() : true;
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private assertRead(channel: LeadMessagingChannel, actor: ActorContext, assignment: LeadAssignmentRecord): void {
    if (channel === "crm") this.deps.crmAccess.assertLeadRead(actor, assignment);
    else this.deps.starterAccess.assertLeadAccess(actor, assignment);
  }

  private assertMutation(channel: LeadMessagingChannel, actor: ActorContext, assignment: LeadAssignmentRecord): void {
    if (channel === "crm") this.deps.crmAccess.assertMutation(actor, assignment);
    else this.deps.starterAccess.assertMutationAccess(actor, assignment);
  }

  private quoteOf(quoteRequestId: string): Promise<MessagingQuote | undefined> {
    return this.deps.quotes.findById(quoteRequestId).catch(() => undefined);
  }

  private async safely(task: () => Promise<unknown> | undefined): Promise<void> {
    try {
      await task();
    } catch {
      // The message is already stored: a failing pointer notification must not fail (or duplicate) the send.
    }
  }

  private async verifyVisitor(publicReference: string, token: string, actor: ActorContext): Promise<MessagingQuote> {
    const grant = await this.deps.visitorAccess?.verify(publicReference, token, actor);
    if (!grant) throw visitorAccessDenied();
    return grant.quote;
  }

  /** Broker side: why the conversation of the current assignment cannot be written (undefined = open). */
  private brokerReadOnlyReason(assignment: LeadAssignmentRecord, quote: MessagingQuote | undefined, actor: ActorContext): LeadConversationReadOnlyReason | undefined {
    const blocker = brokerWriteBlocker(assignment, quote);
    if (blocker) return blocker;
    if (actor.tenantReadOnly) return "partner_suspended";
    if (!this.enabled()) return "messaging_disabled";
    return undefined;
  }

  /** Visitor/admin side: a previous broker's conversation is `reassigned`, the current one follows the lead. */
  private visitorReadOnlyReason(conversation: QuoteConversation, quote: MessagingQuote): LeadConversationReadOnlyReason | undefined {
    if (consentWithdrawn(quote)) return "consent_withdrawn";
    const assignment = conversation.assignment;
    if (!assignment || assignment.partnerTenantId !== conversation.partnerTenantId) return "reassigned";
    const state = leadState(assignment);
    if (state === "closed") return "lead_closed";
    if (state === "not_accepted") return "not_accepted";
    if (!this.enabled()) return "messaging_disabled";
    return undefined;
  }

  /**
   * Conversations of a quote request: one per broker that ever wrote, plus the current accepted
   * assignment (so the visitor can open the exchange before the first message). Newest activity first.
   */
  private async quoteConversations(quote: MessagingQuote): Promise<QuoteConversation[]> {
    const [messages, allAssignments] = await Promise.all([this.repository.listForQuote(quote.id), this.deps.assignments.list()]);
    const assignments = new Map(allAssignments.filter((assignment) => assignment.quoteRequestId === quote.id).map((assignment) => [assignment.id, assignment]));
    const byKey = new Map<string, QuoteConversation>();
    const ensure = (leadAssignmentId: string, partnerTenantId: string): QuoteConversation => {
      const id = conversationIdFor(leadAssignmentId, partnerTenantId);
      let conversation = byKey.get(id);
      if (!conversation) {
        conversation = { id, leadAssignmentId, partnerTenantId, assignment: assignments.get(leadAssignmentId), messages: [] };
        byKey.set(id, conversation);
      }
      return conversation;
    };
    for (const message of messages) ensure(message.leadAssignmentId, message.partnerTenantId).messages.push(message);
    for (const assignment of assignments.values()) {
      if (leadState(assignment) === "accepted") ensure(assignment.id, assignment.partnerTenantId);
    }
    const activity = (conversation: QuoteConversation): number => conversation.messages.at(-1)?.createdAt.getTime() ?? conversation.assignment?.assignedAt.getTime() ?? 0;
    return [...byKey.values()].sort((left, right) => activity(right) - activity(left) || left.id.localeCompare(right.id));
  }

  /** Neutral refusal for a conversation that is not one of this request's. */
  private requireConversation(conversations: QuoteConversation[], conversationId: string): QuoteConversation {
    const found = conversations.find((conversation) => conversation.id === conversationId);
    if (!found) throw visitorAccessDenied();
    return found;
  }

  private unread(messages: readonly LeadMessageRecord[], reader: "broker" | "visitor"): number {
    return messages.filter((message) => message.senderType !== reader && !message.readAt).length;
  }

  private attachmentRecords(messageId: string, assignment: LeadAssignmentRecord, stored: ReadonlyArray<{ storageKey: string; fileName: string; mimeType: string; sizeBytes: number; checksum: string; scanEngine: string; scannedAt: Date }>, now: Date): NewLeadMessageAttachment[] {
    return stored.map((file) => ({
      id: crypto.randomUUID(),
      messageId,
      leadAssignmentId: assignment.id,
      quoteRequestId: assignment.quoteRequestId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      checksum: file.checksum,
      storageKey: file.storageKey,
      scanStatus: "clean" as const,
      scanEngine: file.scanEngine,
      scannedAt: file.scannedAt,
      createdAt: now
    }));
  }

  private async serveAttachment(
    message: LeadMessageRecord | undefined,
    attachmentId: string,
    options: { actor: ActorContext; by: "broker" | "visitor"; quoteRequestId: string; partnerTenantId: string; notFound: () => Error }
  ): Promise<ProposalFile> {
    const attachment = message?.attachments.find((candidate) => candidate.id === attachmentId);
    const audit = (result: "success" | "refused", reason?: string): void => {
      this.deps.audit.write({
        actor: options.actor,
        action: result === "success" ? LeadMessagingAuditActions.attachmentDownloaded : LeadMessagingAuditActions.attachmentDownloadRefused,
        targetType: "LeadMessageAttachment",
        targetId: attachmentId,
        scope: { quoteRequestId: options.quoteRequestId, partnerTenantId: options.partnerTenantId },
        result,
        ...(reason ? { reason } : {}),
        context: { by: options.by }
      });
    };
    if (!message || !attachment) {
      audit("refused", "attachment_not_found");
      throw options.notFound();
    }
    if (attachment.scanStatus !== "clean") {
      audit("refused", "attachment_not_clean");
      throw options.notFound();
    }
    const bytes = await this.deps.upload.storage.get(attachment.storageKey);
    if (!bytes) {
      audit("refused", "storage_missing");
      throw options.notFound();
    }
    audit("success");
    return { bytes, fileName: attachment.fileName, mimeType: attachment.mimeType };
  }

  private auditQuarantine(actor: ActorContext, assignmentId: string, partnerTenantId: string, verdict: string, engine: string | undefined): void {
    this.deps.audit.write({
      actor,
      action: LeadMessagingAuditActions.attachmentQuarantined,
      targetType: "LeadAssignment",
      targetId: assignmentId,
      scope: { partnerTenantId },
      result: verdict === "infected" ? "success" : "failed",
      reason: verdict,
      context: { verdict, ...(engine ? { engine } : {}) }
    });
  }

  private toView(record: LeadMessageRecord, reader: "broker" | "visitor"): LeadMessageView {
    return {
      id: record.id,
      senderType: record.senderType,
      mine: record.senderType === reader,
      body: record.body,
      createdAt: record.createdAt.toISOString(),
      readAt: record.readAt ? record.readAt.toISOString() : null,
      attachments: record.attachments.filter((attachment: LeadMessageAttachmentRecord) => attachment.scanStatus === "clean").map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes
      }))
    };
  }

  private conversationView(input: {
    conversationId: string;
    partnerName: string;
    reason: LeadConversationReadOnlyReason | undefined;
    messages: LeadMessageRecord[];
    reader: "broker" | "visitor";
    query: LeadConversationQuery;
    locale: "fr" | "en";
  }): LeadConversationView {
    const limit = input.query.limit ?? LEAD_MESSAGE_PAGE_SIZE;
    let end = input.messages.length;
    if (input.query.before) {
      end = input.messages.findIndex((message) => message.id === input.query.before);
      if (end < 0) throw badRequest("Invalid input: unknown cursor");
    }
    const start = Math.max(0, end - limit);
    const page = input.messages.slice(start, end);
    return {
      conversationId: input.conversationId,
      partnerName: input.partnerName,
      state: input.reason ? "read_only" : "open",
      readOnlyReason: input.reason ?? null,
      canSend: !input.reason,
      unreadCount: this.unread(input.messages, input.reader),
      notice: leadMessagingNotice(input.locale, input.partnerName),
      messages: page.map((message) => this.toView(message, input.reader)),
      nextCursor: start > 0 ? (input.messages[start]?.id ?? null) : null
    };
  }
}
