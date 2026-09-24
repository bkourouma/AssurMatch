import type { RetentionCategory } from "../../../../packages/shared/contracts/data-retention.contracts";
import type { BrokerCrmDispute, BrokerCrmDocument, BrokerCrmNote, BrokerCrmProposal, BrokerCrmReminder, BrokerCrmTask } from "../../../../packages/shared/contracts/quote.contracts";
import type { AiInteractionRecord } from "../ai/core/ai-interactions.repository";
import type { QuoteAISummaryRecord } from "../ai/quote-summary/quote-ai-summary.service";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";
import type { ContactMessageRecord } from "../contact-messages/contact-messages.repository";
import type { LeadAssignmentRecord } from "../leads/lead-assignment.service";
import type { MessagingDeliveryRecord } from "../notifications/messaging.repository";
import type { NotificationRecord } from "../notifications/notifications.module";
import type { PartnerApplicationRecord } from "../partner-applications/partner-applications.repository";
import type { PartnerWebhookDeliveryRecord } from "../partner-integrations/partner-integrations.repository";
import type { ProspectRecord } from "../prospects/prospects.service";
import type { QuoteDocumentRecord } from "../quote-documents/quote-documents.repository";
import type { QuoteRequestRecord } from "../quote-requests/quote-submission.service";
import type { WaitlistEntryRecord } from "../waitlist/waitlist.repository";

/**
 * Spec 046: the only file that knows the tables holding visitor personal data. It selects rows for
 * a retention or erasure batch and writes the D5/D4 anonymization. It never reads or writes
 * ConsentRecord, AuditLog, FeatureFlagHistory, OfferHistory, RoutingRuleHistory, RoutingDecision,
 * billing rows or staff accounts.
 */

/** D5: the fixed marker that replaces free text and identity fields. */
export const ANONYMIZED_MARKER = "[anonymise]";
/** D5: what a JSON payload becomes. */
export const ANONYMIZED_JSON: Readonly<Record<string, boolean>> = { anonymized: true };
/** D5: the file name a document row keeps once its file is deleted. */
export const ANONYMIZED_FILE_NAME = "document-anonymise";

/**
 * A fingerprint column that is NOT NULL and part of a unique key (waiting list, partner application)
 * cannot be cleared to NULL nor to one shared marker; it becomes a per-row marker that no e-mail can
 * ever hash to.
 */
export function anonymizedFingerprint(rowId: string): string {
  return `anonymise:${rowId}`;
}

const FINAL_WEBHOOK_STATUSES = ["delivered", "failed", "dead_letter", "skipped"] as const;
/** The e-mail channel is the one delivered (spec 044); WhatsApp is never attempted for these rows. */
const FINAL_EMAIL_STATUSES = ["sent", "delivered", "failed"] as const;
const NOTIFICATION_ID_PREFIX = "notification:";
const MESSAGING_DELIVERY_ID_PREFIX = "messaging-delivery:";

export interface RetentionCandidate {
  id: string;
  countryId: string | null;
  /** The D1 anchor of the row; null when the anchor does not exist yet (waiting list of a country never opened). */
  anchor: Date | null;
  /** Waiting-list entry of a country never opened whose own `retentionUntil` has passed. */
  expired: boolean;
}

export interface RetentionCandidateQuery {
  /** `erasure` ignores statuses and anchors: every not-yet-anonymized row among `onlyIds` is returned. */
  mode: "retention" | "erasure";
  now: Date;
  /** Safe prefilter: rows whose anchor is not older than this date are left in the database. */
  anchorBefore: Date;
  countryId?: string | undefined;
  onlyIds?: readonly string[] | undefined;
  skip: number;
  take: number;
}

export interface ErasureSubjectIds {
  prospects: string[];
  quoteRequests: string[];
  quoteDocuments: string[];
  contactMessages: string[];
  waitlist: string[];
  partnerApplications: string[];
}

export interface QuoteCascade {
  id: string;
  publicReference: string;
  prospectId: string;
  /** Documents of the request still holding a file. */
  documents: Array<{ id: string; storageKey: string }>;
  assignments: Array<{ id: string; partnerTenantId: string }>;
}

export interface AnonymizationStamp {
  batchId: string;
  now: Date;
}

export interface RetentionSubjectsRepository extends RuntimeRepository {
  listCandidates(category: RetentionCategory, query: RetentionCandidateQuery): Promise<RetentionCandidate[]>;
  /** The row a public reference designates (quote request, contact message or partner application) and its e-mail fingerprint. */
  findByPublicReference(publicReference: string): Promise<{ subjects: ErasureSubjectIds; emailFingerprint: string | undefined }>;
  findByEmailFingerprint(emailFingerprint: string): Promise<ErasureSubjectIds>;
  loadQuoteCascade(quoteRequestId: string): Promise<QuoteCascade | undefined>;
  anonymizeLeadContent(assignmentIds: readonly string[]): Promise<void>;
  anonymizeQuoteAi(quoteRequestId: string, assignmentIds: readonly string[]): Promise<void>;
  anonymizeQuoteRequestRow(id: string, stamp: AnonymizationStamp): Promise<boolean>;
  prospectHasLiveQuotes(prospectId: string): Promise<boolean>;
  anonymizeProspect(id: string, stamp: AnonymizationStamp): Promise<boolean>;
  findLiveDocument(id: string): Promise<{ id: string; storageKey: string } | undefined>;
  anonymizeDocumentRow(id: string, stamp: AnonymizationStamp): Promise<boolean>;
  anonymizeContactMessage(id: string, stamp: AnonymizationStamp): Promise<boolean>;
  anonymizePartnerApplication(id: string, stamp: AnonymizationStamp): Promise<boolean>;
  anonymizeWaitlistEntry(id: string, stamp: AnonymizationStamp): Promise<boolean>;
  anonymizeAiInteraction(id: string): Promise<boolean>;
  anonymizeWebhookPayload(id: string): Promise<boolean>;
  anonymizeMessagingReference(id: string): Promise<boolean>;
}

function emptySubjects(): ErasureSubjectIds {
  return { prospects: [], quoteRequests: [], quoteDocuments: [], contactMessages: [], waitlist: [], partnerApplications: [] };
}

function latest(dates: ReadonlyArray<Date | null | undefined>): Date | null {
  let result: Date | null = null;
  for (const date of dates) if (date && (!result || date > result)) result = date;
  return result;
}

function isAnonymizedJson(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).anonymized === true && Object.keys(value as object).length === 1);
}

/* ------------------------------------------------------------------------------------------------
 * Memory adapter (tests only). It works on the live records of the other memory repositories,
 * handed over as sources, so a test that seeds through the real services sees the same rows.
 * ---------------------------------------------------------------------------------------------- */

type Anonymizable<T> = T & { anonymizedAt?: Date | null | undefined; anonymizationBatchId?: string | null | undefined };

export interface MemoryCrmActivitySource {
  notesForLead(leadAssignmentId: string): Promise<BrokerCrmNote[]>;
  tasksForLead(leadAssignmentId: string): Promise<BrokerCrmTask[]>;
  remindersForLead(leadAssignmentId: string): Promise<BrokerCrmReminder[]>;
  documentsForLead(leadAssignmentId: string): Promise<BrokerCrmDocument[]>;
  proposalsForLead(leadAssignmentId: string): Promise<BrokerCrmProposal[]>;
  disputesForLead(leadAssignmentId: string): Promise<BrokerCrmDispute[]>;
}

export interface MemoryRetentionSources {
  countries?: () => Promise<Array<{ id: string; publicSince?: Date | null | undefined }>>;
  prospects?: () => Promise<Array<Anonymizable<ProspectRecord>>>;
  quoteRequests?: () => Promise<Array<Anonymizable<QuoteRequestRecord>>>;
  quoteDocuments?: () => Promise<Array<Anonymizable<QuoteDocumentRecord>>>;
  leadAssignments?: () => Promise<LeadAssignmentRecord[]>;
  leadHistory?: (leadAssignmentId: string) => Promise<Array<{ comment?: string | undefined }>>;
  crmActivity?: MemoryCrmActivitySource;
  quoteAiSummaries?: () => Promise<Array<QuoteAISummaryRecord & { aiInteractionId?: string | undefined }>>;
  aiInteractions?: () => Promise<AiInteractionRecord[]>;
  contactMessages?: () => Promise<Array<Anonymizable<ContactMessageRecord>>>;
  partnerApplications?: () => Promise<Array<Anonymizable<PartnerApplicationRecord>>>;
  waitlistEntries?: () => Promise<Array<Anonymizable<WaitlistEntryRecord>>>;
  webhookDeliveries?: () => Promise<PartnerWebhookDeliveryRecord[]>;
  notifications?: () => Promise<NotificationRecord[]>;
  messagingDeliveries?: () => Promise<MessagingDeliveryRecord[]>;
}

/** Writes an anonymization patch on a live memory record whose static type is narrower than the D5 values. */
function scrub(record: object, patch: Record<string, unknown>, removed: readonly string[] = []): void {
  const target = record as Record<string, unknown>;
  Object.assign(target, patch);
  for (const key of removed) delete target[key];
}

export class MemoryRetentionSubjectsRepository implements RetentionSubjectsRepository {
  readonly mode = "memory-test" as const;

  constructor(private readonly sources: MemoryRetentionSources = {}) {
    assertRuntimeRepository(this.mode, "RetentionSubjectsRepository");
  }

  async listCandidates(category: RetentionCategory, query: RetentionCandidateQuery): Promise<RetentionCandidate[]> {
    const candidates = await this.allCandidates(category, query);
    const only = query.onlyIds ? new Set(query.onlyIds) : undefined;
    return candidates
      .filter((candidate) => !only || only.has(candidate.id))
      .filter((candidate) => !query.countryId || candidate.countryId === query.countryId)
      .slice(query.skip, query.skip + query.take);
  }

  async findByPublicReference(publicReference: string): Promise<{ subjects: ErasureSubjectIds; emailFingerprint: string | undefined }> {
    const subjects = emptySubjects();
    const quote = (await this.list(this.sources.quoteRequests)).find((candidate) => candidate.publicReference === publicReference && !candidate.anonymizedAt);
    if (quote) {
      subjects.quoteRequests.push(quote.id);
      const prospect = (await this.list(this.sources.prospects)).find((candidate) => candidate.id === quote.prospectId && !candidate.anonymizedAt);
      return { subjects, emailFingerprint: prospect?.emailFingerprint || undefined };
    }
    const message = (await this.list(this.sources.contactMessages)).find((candidate) => candidate.publicReference === publicReference && !candidate.anonymizedAt);
    if (message) {
      subjects.contactMessages.push(message.id);
      return { subjects, emailFingerprint: message.emailFingerprint };
    }
    const application = (await this.list(this.sources.partnerApplications)).find((candidate) => candidate.publicReference === publicReference && !candidate.anonymizedAt);
    if (application) {
      subjects.partnerApplications.push(application.id);
      return { subjects, emailFingerprint: application.contactEmailFingerprint };
    }
    return { subjects, emailFingerprint: undefined };
  }

  async findByEmailFingerprint(emailFingerprint: string): Promise<ErasureSubjectIds> {
    const subjects = emptySubjects();
    const prospects = (await this.list(this.sources.prospects)).filter((prospect) => prospect.emailFingerprint === emailFingerprint && !prospect.anonymizedAt);
    const prospectIds = new Set(prospects.map((prospect) => prospect.id));
    const quotes = (await this.list(this.sources.quoteRequests)).filter((quote) => prospectIds.has(quote.prospectId) && !quote.anonymizedAt);
    const quoteIds = new Set(quotes.map((quote) => quote.id));
    subjects.quoteRequests = quotes.map((quote) => quote.id);
    subjects.prospects = prospects.filter((prospect) => !quotes.some((quote) => quote.prospectId === prospect.id)).map((prospect) => prospect.id);
    subjects.quoteDocuments = (await this.list(this.sources.quoteDocuments)).filter((document) => quoteIds.has(document.quoteRequestId) && !document.anonymizedAt).map((document) => document.id);
    subjects.contactMessages = (await this.list(this.sources.contactMessages)).filter((message) => message.emailFingerprint === emailFingerprint && !message.anonymizedAt).map((message) => message.id);
    subjects.waitlist = (await this.list(this.sources.waitlistEntries)).filter((entry) => entry.emailFingerprint === emailFingerprint && !entry.anonymizedAt).map((entry) => entry.id);
    subjects.partnerApplications = (await this.list(this.sources.partnerApplications)).filter((application) => application.contactEmailFingerprint === emailFingerprint && !application.anonymizedAt).map((application) => application.id);
    return subjects;
  }

  async loadQuoteCascade(quoteRequestId: string): Promise<QuoteCascade | undefined> {
    const quote = (await this.list(this.sources.quoteRequests)).find((candidate) => candidate.id === quoteRequestId);
    if (!quote || quote.anonymizedAt) return undefined;
    const documents = (await this.list(this.sources.quoteDocuments))
      .filter((document) => document.quoteRequestId === quoteRequestId && !document.anonymizedAt)
      .map((document) => ({ id: document.id, storageKey: document.storageKey }));
    const assignments = (await this.list(this.sources.leadAssignments))
      .filter((assignment) => assignment.quoteRequestId === quoteRequestId)
      .map((assignment) => ({ id: assignment.id, partnerTenantId: assignment.partnerTenantId }));
    return { id: quote.id, publicReference: quote.publicReference, prospectId: quote.prospectId, documents, assignments };
  }

  async anonymizeLeadContent(assignmentIds: readonly string[]): Promise<void> {
    const ids = new Set(assignmentIds);
    for (const assignment of await this.list(this.sources.leadAssignments)) {
      // The memory assignment carries a copy of the visitor contact and answers; the Prisma row does not.
      if (ids.has(assignment.id)) scrub(assignment, { contact: {}, answers: {} }, ["actionComment"]);
    }
    const crm = this.sources.crmActivity;
    for (const id of assignmentIds) {
      for (const event of this.sources.leadHistory ? await this.sources.leadHistory(id) : []) scrub(event, {}, ["comment"]);
      if (!crm) continue;
      for (const note of await crm.notesForLead(id)) scrub(note, { body: ANONYMIZED_MARKER });
      for (const task of await crm.tasksForLead(id)) scrub(task, { title: ANONYMIZED_MARKER });
      for (const reminder of await crm.remindersForLead(id)) scrub(reminder, {}, ["message"]);
      for (const proposal of await crm.proposalsForLead(id)) scrub(proposal, {}, ["notes"]);
      for (const dispute of await crm.disputesForLead(id)) scrub(dispute, {}, ["comment"]);
      for (const document of await crm.documentsForLead(id)) scrub(document, { label: ANONYMIZED_MARKER, storageKey: ANONYMIZED_MARKER });
    }
  }

  async anonymizeQuoteAi(quoteRequestId: string, assignmentIds: readonly string[]): Promise<void> {
    const summaries = (await this.list(this.sources.quoteAiSummaries)).filter((summary) => summary.quoteRequestId === quoteRequestId);
    for (const summary of summaries) scrub(summary, {}, ["summaryReference"]);
    const interactionIds = new Set(summaries.map((summary) => summary.aiInteractionId).filter((id): id is string => Boolean(id)));
    const targets = new Set([quoteRequestId, ...assignmentIds]);
    for (const interaction of await this.list(this.sources.aiInteractions)) {
      if (interactionIds.has(interaction.id) || (interaction.targetId && targets.has(interaction.targetId))) this.scrubAiInteraction(interaction);
    }
  }

  async anonymizeQuoteRequestRow(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    const quote = (await this.list(this.sources.quoteRequests)).find((candidate) => candidate.id === id);
    if (!quote || quote.anonymizedAt) return false;
    scrub(quote, { payload: { ...ANONYMIZED_JSON }, anonymizedAt: stamp.now, anonymizationBatchId: stamp.batchId, updatedAt: stamp.now });
    return true;
  }

  async prospectHasLiveQuotes(prospectId: string): Promise<boolean> {
    return (await this.list(this.sources.quoteRequests)).some((quote) => quote.prospectId === prospectId && !quote.anonymizedAt);
  }

  async anonymizeProspect(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    const prospect = (await this.list(this.sources.prospects)).find((candidate) => candidate.id === id);
    if (!prospect || prospect.anonymizedAt) return false;
    scrub(prospect, {
      emailNormalized: null,
      phoneNormalized: null,
      emailFingerprint: null,
      phoneFingerprint: null,
      anonymizedAt: stamp.now,
      anonymizationBatchId: stamp.batchId,
      updatedAt: stamp.now
    }, ["displayName", "preferredContactChannel"]);
    return true;
  }

  async findLiveDocument(id: string): Promise<{ id: string; storageKey: string } | undefined> {
    const document = (await this.list(this.sources.quoteDocuments)).find((candidate) => candidate.id === id && !candidate.anonymizedAt);
    return document ? { id: document.id, storageKey: document.storageKey } : undefined;
  }

  async anonymizeDocumentRow(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    const document = (await this.list(this.sources.quoteDocuments)).find((candidate) => candidate.id === id);
    if (!document || document.anonymizedAt) return false;
    scrub(document, { fileName: ANONYMIZED_FILE_NAME, label: ANONYMIZED_MARKER, status: "removed", anonymizedAt: stamp.now, anonymizationBatchId: stamp.batchId, updatedAt: stamp.now });
    return true;
  }

  async anonymizeContactMessage(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    const message = (await this.list(this.sources.contactMessages)).find((candidate) => candidate.id === id);
    if (!message || message.anonymizedAt) return false;
    scrub(message, {
      name: ANONYMIZED_MARKER,
      emailNormalized: ANONYMIZED_MARKER,
      emailFingerprint: anonymizedFingerprint(message.id),
      subject: ANONYMIZED_MARKER,
      message: ANONYMIZED_MARKER,
      anonymizedAt: stamp.now,
      anonymizationBatchId: stamp.batchId,
      updatedAt: stamp.now
    }, ["phone", "ipHash"]);
    return true;
  }

  async anonymizePartnerApplication(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    const application = (await this.list(this.sources.partnerApplications)).find((candidate) => candidate.id === id);
    if (!application || application.anonymizedAt) return false;
    scrub(application, {
      legalName: ANONYMIZED_MARKER,
      licenseNumber: anonymizedFingerprint(application.id),
      contactName: ANONYMIZED_MARKER,
      contactEmailNormalized: ANONYMIZED_MARKER,
      contactEmailFingerprint: anonymizedFingerprint(application.id),
      contactPhone: ANONYMIZED_MARKER,
      anonymizedAt: stamp.now,
      anonymizationBatchId: stamp.batchId,
      updatedAt: stamp.now
    }, ["tradeName", "whatsapp", "message", "reviewNote", "ipHash"]);
    return true;
  }

  async anonymizeWaitlistEntry(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    const entry = (await this.list(this.sources.waitlistEntries)).find((candidate) => candidate.id === id);
    if (!entry || entry.anonymizedAt) return false;
    scrub(entry, {
      emailNormalized: ANONYMIZED_MARKER,
      emailFingerprint: anonymizedFingerprint(entry.id),
      anonymizedAt: stamp.now,
      anonymizationBatchId: stamp.batchId,
      updatedAt: stamp.now
    }, ["ipHash"]);
    return true;
  }

  async anonymizeAiInteraction(id: string): Promise<boolean> {
    const interaction = (await this.list(this.sources.aiInteractions)).find((candidate) => candidate.id === id);
    if (!interaction || interaction.outputReference === ANONYMIZED_MARKER) return false;
    this.scrubAiInteraction(interaction);
    return true;
  }

  async anonymizeWebhookPayload(id: string): Promise<boolean> {
    const delivery = (await this.list(this.sources.webhookDeliveries)).find((candidate) => candidate.id === id);
    if (!delivery || isAnonymizedJson(delivery.payload)) return false;
    scrub(delivery, { payload: { ...ANONYMIZED_JSON }, updatedAt: new Date() });
    return true;
  }

  async anonymizeMessagingReference(id: string): Promise<boolean> {
    if (id.startsWith(NOTIFICATION_ID_PREFIX)) {
      const rowId = id.slice(NOTIFICATION_ID_PREFIX.length);
      const notification = (await this.list(this.sources.notifications)).find((candidate) => candidate.id === rowId);
      if (!notification || notification.payloadReference === ANONYMIZED_MARKER) return false;
      scrub(notification, { payloadReference: ANONYMIZED_MARKER, updatedAt: new Date() });
      return true;
    }
    const rowId = id.slice(MESSAGING_DELIVERY_ID_PREFIX.length);
    const delivery = (await this.list(this.sources.messagingDeliveries)).find((candidate) => candidate.id === rowId);
    if (!delivery || delivery.recipientMasked === ANONYMIZED_MARKER) return false;
    scrub(delivery, { recipientMasked: ANONYMIZED_MARKER });
    return true;
  }

  private scrubAiInteraction(interaction: AiInteractionRecord): void {
    scrub(interaction, {
      outputReference: ANONYMIZED_MARKER,
      outputText: null,
      outputData: { ...ANONYMIZED_JSON },
      minimizationReport: { ...ANONYMIZED_JSON },
      updatedAt: new Date()
    });
  }

  /** Every not-yet-anonymized row of a category, ordered by anchor. Filtering on cutoffs is the caller's job. */
  private async allCandidates(category: RetentionCategory, query: RetentionCandidateQuery): Promise<RetentionCandidate[]> {
    const retention = query.mode === "retention";
    const before = (date: Date | null | undefined) => !retention || (date !== null && date !== undefined && date < query.anchorBefore);
    const byAnchor = (left: RetentionCandidate, right: RetentionCandidate) => (left.anchor?.getTime() ?? 0) - (right.anchor?.getTime() ?? 0) || left.id.localeCompare(right.id);
    switch (category) {
      case "quote_requests": {
        const assignments = await this.list(this.sources.leadAssignments);
        return (await this.list(this.sources.quoteRequests))
          .filter((quote) => !quote.anonymizedAt && before(quote.updatedAt))
          .map((quote) => ({
            id: quote.id,
            countryId: quote.countryId,
            anchor: latest([quote.updatedAt, ...assignments.filter((assignment) => assignment.quoteRequestId === quote.id).map((assignment) => assignment.lastBrokerActionAt)]),
            expired: false
          }))
          .sort(byAnchor);
      }
      case "quote_documents": {
        const quotes = new Map((await this.list(this.sources.quoteRequests)).map((quote) => [quote.id, quote.countryId]));
        return (await this.list(this.sources.quoteDocuments))
          .filter((document) => !document.anonymizedAt && before(document.createdAt))
          .map((document) => ({ id: document.id, countryId: quotes.get(document.quoteRequestId) ?? null, anchor: document.createdAt, expired: false }))
          .sort(byAnchor);
      }
      case "contact_messages":
        return (await this.list(this.sources.contactMessages))
          .filter((message) => !message.anonymizedAt && before(message.createdAt))
          .map((message) => ({ id: message.id, countryId: message.countryId ?? null, anchor: message.createdAt, expired: false }))
          .sort(byAnchor);
      case "partner_applications":
        return (await this.list(this.sources.partnerApplications))
          .filter((application) => !application.anonymizedAt && (!retention || application.status === "rejected"))
          .map((application) => ({ id: application.id, countryId: application.countryId, anchor: application.reviewedAt ?? application.updatedAt, expired: false }))
          .filter((candidate) => before(candidate.anchor))
          .sort(byAnchor);
      case "waitlist": {
        const openings = new Map((await this.list(this.sources.countries)).map((country) => [country.id, country.publicSince ?? null]));
        return (await this.list(this.sources.waitlistEntries))
          .filter((entry) => !entry.anonymizedAt)
          .map((entry) => {
            const publicSince = openings.get(entry.countryId) ?? null;
            return {
              id: entry.id,
              countryId: entry.countryId,
              anchor: publicSince ? latest([publicSince, entry.createdAt]) : null,
              expired: !publicSince && entry.retentionUntil < query.now
            };
          })
          .sort(byAnchor);
      }
      case "ai_traces":
        return (await this.list(this.sources.aiInteractions))
          .filter((interaction) => interaction.outputReference !== ANONYMIZED_MARKER && before(interaction.occurredAt))
          .map((interaction) => ({ id: interaction.id, countryId: interaction.countryId, anchor: interaction.occurredAt, expired: false }))
          .sort(byAnchor);
      case "webhook_payloads":
        return (await this.list(this.sources.webhookDeliveries))
          .filter((delivery) => !isAnonymizedJson(delivery.payload) && (!retention || (FINAL_WEBHOOK_STATUSES as readonly string[]).includes(delivery.status)) && before(delivery.createdAt))
          .map((delivery) => ({ id: delivery.id, countryId: null, anchor: delivery.createdAt, expired: false }))
          .sort(byAnchor);
      case "messaging_references": {
        const notifications = (await this.list(this.sources.notifications))
          .filter((notification) => notification.payloadReference !== ANONYMIZED_MARKER && (!retention || isFinalNotification(notification)) && before(notification.createdAt))
          .map((notification) => ({ id: `${NOTIFICATION_ID_PREFIX}${notification.id}`, countryId: null, anchor: notification.createdAt, expired: false }))
          .sort(byAnchor);
        const deliveries = (await this.list(this.sources.messagingDeliveries))
          .filter((delivery) => delivery.recipientMasked !== ANONYMIZED_MARKER && before(delivery.createdAt))
          .map((delivery) => ({ id: `${MESSAGING_DELIVERY_ID_PREFIX}${delivery.id}`, countryId: null, anchor: delivery.createdAt, expired: false }))
          .sort(byAnchor);
        return [...notifications, ...deliveries];
      }
    }
  }

  private async list<T>(source: (() => Promise<T[]>) | undefined): Promise<T[]> {
    return source ? source() : [];
  }
}

function isFinalNotification(notification: Pick<NotificationRecord, "emailStatus" | "whatsAppStatus">): boolean {
  return (FINAL_EMAIL_STATUSES as readonly string[]).includes(notification.emailStatus) && notification.whatsAppStatus !== "retryable";
}

/* ------------------------------------------------------------------------------------------------
 * Prisma adapter. The models have no relations, so every cascade is an explicit query by id.
 * ---------------------------------------------------------------------------------------------- */

type Delegate = {
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input: unknown): Promise<unknown | null>;
  findUnique(input: unknown): Promise<unknown | null>;
  count(input?: unknown): Promise<number>;
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
};

type DelegateName =
  | "country"
  | "prospect"
  | "quoteRequest"
  | "quoteRequestDocument"
  | "leadAssignment"
  | "leadActionHistory"
  | "brokerCrmNote"
  | "brokerCrmTask"
  | "brokerCrmReminder"
  | "brokerCrmDocument"
  | "brokerCrmProposal"
  | "brokerCrmDispute"
  | "quoteAISummary"
  | "aIInteraction"
  | "contactMessage"
  | "partnerApplication"
  | "waitlistEntry"
  | "partnerWebhookDelivery"
  | "notification"
  | "messagingDelivery";

interface IdRow { id: string }

export class PrismaRetentionSubjectsRepository implements RetentionSubjectsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async listCandidates(category: RetentionCategory, query: RetentionCandidateQuery): Promise<RetentionCandidate[]> {
    const retention = query.mode === "retention";
    const ids = query.onlyIds ? { id: { in: [...query.onlyIds] } } : {};
    const page = { skip: query.skip, take: query.take };
    switch (category) {
      case "quote_requests": {
        const rows = await this.rows<{ id: string; countryId: string; updatedAt: Date }>("quoteRequest", {
          where: { anonymizedAt: null, ...ids, ...(retention ? { updatedAt: { lt: query.anchorBefore } } : {}), ...(query.countryId ? { countryId: query.countryId } : {}) },
          select: { id: true, countryId: true, updatedAt: true },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          ...page
        });
        if (rows.length === 0) return [];
        const actions = await this.rows<{ quoteRequestId: string; lastBrokerActionAt: Date | null }>("leadAssignment", {
          where: { quoteRequestId: { in: rows.map((row) => row.id) } },
          select: { quoteRequestId: true, lastBrokerActionAt: true }
        });
        return rows.map((row) => ({
          id: row.id,
          countryId: row.countryId,
          anchor: latest([row.updatedAt, ...actions.filter((action) => action.quoteRequestId === row.id).map((action) => action.lastBrokerActionAt)]),
          expired: false
        }));
      }
      case "quote_documents": {
        // The country lives on the quote request: a country-scoped preview filters after the join.
        const rows = await this.rows<{ id: string; quoteRequestId: string; createdAt: Date }>("quoteRequestDocument", {
          where: { anonymizedAt: null, ...ids, ...(retention ? { createdAt: { lt: query.anchorBefore } } : {}) },
          select: { id: true, quoteRequestId: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          ...page
        });
        const countries = await this.quoteCountries(rows.map((row) => row.quoteRequestId));
        return rows
          .map((row) => ({ id: row.id, countryId: countries.get(row.quoteRequestId) ?? null, anchor: row.createdAt, expired: false }))
          .filter((candidate) => !query.countryId || candidate.countryId === query.countryId);
      }
      case "contact_messages": {
        const rows = await this.rows<{ id: string; countryId: string | null; createdAt: Date }>("contactMessage", {
          where: { anonymizedAt: null, ...ids, ...(retention ? { createdAt: { lt: query.anchorBefore } } : {}), ...(query.countryId ? { countryId: query.countryId } : {}) },
          select: { id: true, countryId: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          ...page
        });
        return rows.map((row) => ({ id: row.id, countryId: row.countryId, anchor: row.createdAt, expired: false }));
      }
      case "partner_applications": {
        const rows = await this.rows<{ id: string; countryId: string; reviewedAt: Date | null; updatedAt: Date }>("partnerApplication", {
          where: {
            anonymizedAt: null,
            ...ids,
            ...(query.countryId ? { countryId: query.countryId } : {}),
            ...(retention
              ? {
                  status: "rejected",
                  OR: [{ reviewedAt: { lt: query.anchorBefore } }, { reviewedAt: null, updatedAt: { lt: query.anchorBefore } }]
                }
              : {})
          },
          select: { id: true, countryId: true, reviewedAt: true, updatedAt: true },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          ...page
        });
        return rows.map((row) => ({ id: row.id, countryId: row.countryId, anchor: row.reviewedAt ?? row.updatedAt, expired: false }));
      }
      case "waitlist": {
        // No anchor prefilter: an entry of a country never opened expires on its own retentionUntil.
        const rows = await this.rows<{ id: string; countryId: string; createdAt: Date; retentionUntil: Date }>("waitlistEntry", {
          where: { anonymizedAt: null, ...ids, ...(query.countryId ? { countryId: query.countryId } : {}) },
          select: { id: true, countryId: true, createdAt: true, retentionUntil: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          ...page
        });
        const countryIds = [...new Set(rows.map((row) => row.countryId))];
        const openings = new Map((countryIds.length === 0 ? [] : await this.rows<{ id: string; publicSince: Date | null }>("country", {
          where: { id: { in: countryIds } },
          select: { id: true, publicSince: true }
        })).map((country) => [country.id, country.publicSince]));
        return rows.map((row) => {
          const publicSince = openings.get(row.countryId) ?? null;
          return { id: row.id, countryId: row.countryId, anchor: publicSince ? latest([publicSince, row.createdAt]) : null, expired: !publicSince && row.retentionUntil < query.now };
        });
      }
      case "ai_traces": {
        const rows = await this.rows<{ id: string; countryId: string | null; occurredAt: Date }>("aIInteraction", {
          where: { outputReference: { not: ANONYMIZED_MARKER }, ...ids, ...(retention ? { occurredAt: { lt: query.anchorBefore } } : {}), ...(query.countryId ? { countryId: query.countryId } : {}) },
          select: { id: true, countryId: true, occurredAt: true },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          ...page
        });
        return rows.map((row) => ({ id: row.id, countryId: row.countryId, anchor: row.occurredAt, expired: false }));
      }
      case "webhook_payloads": {
        if (query.countryId) return [];
        const rows = await this.rows<{ id: string; createdAt: Date }>("partnerWebhookDelivery", {
          where: {
            ...ids,
            NOT: { payload: { equals: ANONYMIZED_JSON } },
            ...(retention ? { status: { in: [...FINAL_WEBHOOK_STATUSES] }, createdAt: { lt: query.anchorBefore } } : {})
          },
          select: { id: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          ...page
        });
        return rows.map((row) => ({ id: row.id, countryId: null, anchor: row.createdAt, expired: false }));
      }
      case "messaging_references":
        return query.countryId ? [] : this.messagingCandidates(query);
    }
  }

  async findByPublicReference(publicReference: string): Promise<{ subjects: ErasureSubjectIds; emailFingerprint: string | undefined }> {
    const subjects = emptySubjects();
    const quote = await this.delegate("quoteRequest").findFirst({ where: { publicReference, anonymizedAt: null }, select: { id: true, prospectId: true } }) as { id: string; prospectId: string } | null;
    if (quote) {
      subjects.quoteRequests.push(quote.id);
      const prospect = await this.delegate("prospect").findFirst({ where: { id: quote.prospectId, anonymizedAt: null }, select: { emailFingerprint: true } }) as { emailFingerprint: string | null } | null;
      return { subjects, emailFingerprint: prospect?.emailFingerprint ?? undefined };
    }
    const message = await this.delegate("contactMessage").findFirst({ where: { publicReference, anonymizedAt: null }, select: { id: true, emailFingerprint: true } }) as { id: string; emailFingerprint: string } | null;
    if (message) {
      subjects.contactMessages.push(message.id);
      return { subjects, emailFingerprint: message.emailFingerprint };
    }
    const application = await this.delegate("partnerApplication").findFirst({ where: { publicReference, anonymizedAt: null }, select: { id: true, contactEmailFingerprint: true } }) as { id: string; contactEmailFingerprint: string } | null;
    if (application) {
      subjects.partnerApplications.push(application.id);
      return { subjects, emailFingerprint: application.contactEmailFingerprint };
    }
    return { subjects, emailFingerprint: undefined };
  }

  async findByEmailFingerprint(emailFingerprint: string): Promise<ErasureSubjectIds> {
    const prospects = await this.rows<IdRow>("prospect", { where: { emailFingerprint, anonymizedAt: null }, select: { id: true } });
    const prospectIds = prospects.map((row) => row.id);
    const quotes = prospectIds.length === 0 ? [] : await this.rows<{ id: string; prospectId: string }>("quoteRequest", {
      where: { prospectId: { in: prospectIds }, anonymizedAt: null },
      select: { id: true, prospectId: true }
    });
    const quoteIds = quotes.map((row) => row.id);
    const withQuotes = new Set(quotes.map((row) => row.prospectId));
    return {
      prospects: prospectIds.filter((id) => !withQuotes.has(id)),
      quoteRequests: quoteIds,
      quoteDocuments: quoteIds.length === 0 ? [] : (await this.rows<IdRow>("quoteRequestDocument", { where: { quoteRequestId: { in: quoteIds }, anonymizedAt: null }, select: { id: true } })).map((row) => row.id),
      contactMessages: (await this.rows<IdRow>("contactMessage", { where: { emailFingerprint, anonymizedAt: null }, select: { id: true } })).map((row) => row.id),
      waitlist: (await this.rows<IdRow>("waitlistEntry", { where: { emailFingerprint, anonymizedAt: null }, select: { id: true } })).map((row) => row.id),
      partnerApplications: (await this.rows<IdRow>("partnerApplication", { where: { contactEmailFingerprint: emailFingerprint, anonymizedAt: null }, select: { id: true } })).map((row) => row.id)
    };
  }

  async loadQuoteCascade(quoteRequestId: string): Promise<QuoteCascade | undefined> {
    const quote = await this.delegate("quoteRequest").findFirst({ where: { id: quoteRequestId, anonymizedAt: null }, select: { id: true, publicReference: true, prospectId: true } }) as { id: string; publicReference: string; prospectId: string } | null;
    if (!quote) return undefined;
    const documents = await this.rows<{ id: string; storageKey: string }>("quoteRequestDocument", { where: { quoteRequestId, anonymizedAt: null }, select: { id: true, storageKey: true } });
    const assignments = await this.rows<{ id: string; partnerTenantId: string }>("leadAssignment", { where: { quoteRequestId }, select: { id: true, partnerTenantId: true } });
    return { ...quote, documents, assignments };
  }

  async anonymizeLeadContent(assignmentIds: readonly string[]): Promise<void> {
    if (assignmentIds.length === 0) return;
    const byAssignment = { where: { leadAssignmentId: { in: [...assignmentIds] } } };
    await this.delegate("leadAssignment").updateMany({ where: { id: { in: [...assignmentIds] } }, data: { actionComment: null } });
    await this.delegate("leadActionHistory").updateMany({ ...byAssignment, data: { comment: null } });
    await this.delegate("brokerCrmNote").updateMany({ ...byAssignment, data: { body: ANONYMIZED_MARKER } });
    await this.delegate("brokerCrmTask").updateMany({ ...byAssignment, data: { title: ANONYMIZED_MARKER } });
    await this.delegate("brokerCrmReminder").updateMany({ ...byAssignment, data: { message: null } });
    await this.delegate("brokerCrmProposal").updateMany({ ...byAssignment, data: { notes: null } });
    await this.delegate("brokerCrmDispute").updateMany({ ...byAssignment, data: { comment: null } });
    await this.delegate("brokerCrmDocument").updateMany({ ...byAssignment, data: { label: ANONYMIZED_MARKER, storageKey: ANONYMIZED_MARKER } });
  }

  async anonymizeQuoteAi(quoteRequestId: string, assignmentIds: readonly string[]): Promise<void> {
    const summaries = await this.rows<{ aiInteractionId: string | null }>("quoteAISummary", { where: { quoteRequestId }, select: { aiInteractionId: true } });
    await this.delegate("quoteAISummary").updateMany({ where: { quoteRequestId }, data: { summaryReference: null } });
    const interactionIds = summaries.map((summary) => summary.aiInteractionId).filter((id): id is string => Boolean(id));
    await this.delegate("aIInteraction").updateMany({
      where: { OR: [{ id: { in: interactionIds } }, { targetId: { in: [quoteRequestId, ...assignmentIds] } }] },
      data: this.aiInteractionScrub()
    });
  }

  async anonymizeQuoteRequestRow(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    return this.stampOnce("quoteRequest", id, { payload: ANONYMIZED_JSON }, stamp);
  }

  async prospectHasLiveQuotes(prospectId: string): Promise<boolean> {
    return (await this.delegate("quoteRequest").count({ where: { prospectId, anonymizedAt: null } })) > 0;
  }

  async anonymizeProspect(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    return this.stampOnce("prospect", id, {
      emailNormalized: null,
      phoneNormalized: null,
      emailFingerprint: null,
      phoneFingerprint: null,
      displayName: null,
      preferredContactChannel: null
    }, stamp);
  }

  async findLiveDocument(id: string): Promise<{ id: string; storageKey: string } | undefined> {
    const row = await this.delegate("quoteRequestDocument").findFirst({ where: { id, anonymizedAt: null }, select: { id: true, storageKey: true } });
    return (row as { id: string; storageKey: string } | null) ?? undefined;
  }

  async anonymizeDocumentRow(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    return this.stampOnce("quoteRequestDocument", id, { fileName: ANONYMIZED_FILE_NAME, label: ANONYMIZED_MARKER, status: "removed" }, stamp);
  }

  async anonymizeContactMessage(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    return this.stampOnce("contactMessage", id, {
      name: ANONYMIZED_MARKER,
      emailNormalized: ANONYMIZED_MARKER,
      emailFingerprint: anonymizedFingerprint(id),
      phone: null,
      subject: ANONYMIZED_MARKER,
      message: ANONYMIZED_MARKER,
      ipHash: null
    }, stamp);
  }

  async anonymizePartnerApplication(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    return this.stampOnce("partnerApplication", id, {
      legalName: ANONYMIZED_MARKER,
      tradeName: null,
      licenseNumber: anonymizedFingerprint(id),
      contactName: ANONYMIZED_MARKER,
      contactEmailNormalized: ANONYMIZED_MARKER,
      contactEmailFingerprint: anonymizedFingerprint(id),
      contactPhone: ANONYMIZED_MARKER,
      whatsapp: null,
      message: null,
      reviewNote: null,
      ipHash: null
    }, stamp);
  }

  async anonymizeWaitlistEntry(id: string, stamp: AnonymizationStamp): Promise<boolean> {
    return this.stampOnce("waitlistEntry", id, { emailNormalized: ANONYMIZED_MARKER, emailFingerprint: anonymizedFingerprint(id), ipHash: null }, stamp);
  }

  async anonymizeAiInteraction(id: string): Promise<boolean> {
    const result = await this.delegate("aIInteraction").updateMany({ where: { id, outputReference: { not: ANONYMIZED_MARKER } }, data: this.aiInteractionScrub() });
    return result.count === 1;
  }

  async anonymizeWebhookPayload(id: string): Promise<boolean> {
    const result = await this.delegate("partnerWebhookDelivery").updateMany({
      where: { id, NOT: { payload: { equals: ANONYMIZED_JSON } } },
      data: { payload: ANONYMIZED_JSON, updatedAt: new Date() }
    });
    return result.count === 1;
  }

  async anonymizeMessagingReference(id: string): Promise<boolean> {
    if (id.startsWith(NOTIFICATION_ID_PREFIX)) {
      const result = await this.delegate("notification").updateMany({
        where: { id: id.slice(NOTIFICATION_ID_PREFIX.length), payloadReference: { not: ANONYMIZED_MARKER } },
        data: { payloadReference: ANONYMIZED_MARKER, updatedAt: new Date() }
      });
      return result.count === 1;
    }
    const result = await this.delegate("messagingDelivery").updateMany({
      where: { id: id.slice(MESSAGING_DELIVERY_ID_PREFIX.length), recipientMasked: { not: ANONYMIZED_MARKER } },
      data: { recipientMasked: ANONYMIZED_MARKER }
    });
    return result.count === 1;
  }

  /** Notifications first, then messaging deliveries, paged as one list. */
  private async messagingCandidates(query: RetentionCandidateQuery): Promise<RetentionCandidate[]> {
    const retention = query.mode === "retention";
    const only = query.onlyIds;
    const notificationIds = only?.filter((id) => id.startsWith(NOTIFICATION_ID_PREFIX)).map((id) => id.slice(NOTIFICATION_ID_PREFIX.length));
    const deliveryIds = only?.filter((id) => id.startsWith(MESSAGING_DELIVERY_ID_PREFIX)).map((id) => id.slice(MESSAGING_DELIVERY_ID_PREFIX.length));
    const notificationWhere = {
      payloadReference: { not: ANONYMIZED_MARKER },
      ...(notificationIds ? { id: { in: notificationIds } } : {}),
      ...(retention ? { emailStatus: { in: [...FINAL_EMAIL_STATUSES] }, whatsAppStatus: { not: "retryable" }, createdAt: { lt: query.anchorBefore } } : {})
    };
    const deliveryWhere = {
      recipientMasked: { not: ANONYMIZED_MARKER },
      ...(deliveryIds ? { id: { in: deliveryIds } } : {}),
      ...(retention ? { createdAt: { lt: query.anchorBefore } } : {})
    };
    const notificationTotal = await this.delegate("notification").count({ where: notificationWhere });
    const candidates: RetentionCandidate[] = [];
    if (query.skip < notificationTotal) {
      const rows = await this.rows<{ id: string; createdAt: Date }>("notification", {
        where: notificationWhere,
        select: { id: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: query.skip,
        take: query.take
      });
      candidates.push(...rows.map((row) => ({ id: `${NOTIFICATION_ID_PREFIX}${row.id}`, countryId: null, anchor: row.createdAt, expired: false })));
    }
    const remaining = query.take - candidates.length;
    if (remaining <= 0) return candidates;
    const rows = await this.rows<{ id: string; createdAt: Date }>("messagingDelivery", {
      where: deliveryWhere,
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: Math.max(0, query.skip - notificationTotal),
      take: remaining
    });
    candidates.push(...rows.map((row) => ({ id: `${MESSAGING_DELIVERY_ID_PREFIX}${row.id}`, countryId: null, anchor: row.createdAt, expired: false })));
    return candidates;
  }

  private async quoteCountries(quoteIds: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(quoteIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.rows<{ id: string; countryId: string }>("quoteRequest", { where: { id: { in: unique } }, select: { id: true, countryId: true } });
    return new Map(rows.map((row) => [row.id, row.countryId]));
  }

  /** One conditional write: a row that already carries `anonymizedAt` is never touched again. */
  private async stampOnce(name: DelegateName, id: string, data: Record<string, unknown>, stamp: AnonymizationStamp): Promise<boolean> {
    const result = await this.delegate(name).updateMany({
      where: { id, anonymizedAt: null },
      data: { ...data, anonymizedAt: stamp.now, anonymizationBatchId: stamp.batchId, updatedAt: stamp.now }
    });
    return result.count === 1;
  }

  private aiInteractionScrub(): Record<string, unknown> {
    return { outputReference: ANONYMIZED_MARKER, outputText: null, outputData: ANONYMIZED_JSON, minimizationReport: ANONYMIZED_JSON, updatedAt: new Date() };
  }

  private async rows<T>(name: DelegateName, input: unknown): Promise<T[]> {
    return (await this.delegate(name).findMany(input)) as T[];
  }

  private delegate(name: DelegateName): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as Record<string, Delegate>)[name] as Delegate;
  }
}

export const RETENTION_SUBJECTS_REPOSITORY = "RETENTION_SUBJECTS_REPOSITORY";
