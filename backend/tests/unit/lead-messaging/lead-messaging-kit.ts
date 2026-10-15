import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { DocumentRequestsService, type RequestedDocumentsPort } from "../../../src/modules/lead-messaging/document-requests.service";
import type { FirstVisibleReplyPort, LeadMessagingNotificationsPort, MessagingQuote } from "../../../src/modules/lead-messaging/lead-messaging.ports";
import { MemoryLeadMessagingRepository, type ScanStatus } from "../../../src/modules/lead-messaging/lead-messaging.repository";
import { LeadMessagingService } from "../../../src/modules/lead-messaging/lead-messaging.service";
import type { UploadedLeadFile } from "../../../src/modules/lead-proposals/scanned-upload";
import type { ActorContext } from "../../../src/modules/common/types";
import { BrokerCrmAccessPolicy } from "../../../src/modules/leads/broker-crm-access-policy";
import { BrokerStarterAccessPolicy } from "../../../src/modules/leads/broker-starter-access-policy";
import { LeadAssignmentService, type LeadAssignmentRecord } from "../../../src/modules/leads/lead-assignment.service";
import { MemoryDocumentStorage } from "../../../src/modules/quote-documents/document-storage.port";
import type { QuoteDocumentRecord } from "../../../src/modules/quote-documents/quote-documents.repository";
import { EicarSignatureScanner } from "../../../src/modules/quote-documents/virus-scanner.port";

export const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
export const PDF = Buffer.from("%PDF-1.4\n% piece jointe indicative\n");
export const INFECTED_PDF = Buffer.from(`%PDF-1.4\n${EICAR}\n`);

export function file(bytes: Buffer, name = "piece.pdf", type = "application/pdf"): UploadedLeadFile {
  return { buffer: bytes, originalname: name, mimetype: type, size: bytes.length };
}

/** Counts the stored objects so a refused send can be shown to leave none behind. */
class CountingStorage extends MemoryDocumentStorage {
  private readonly keys = new Set<string>();

  override async put(storageKey: string, bytes: Buffer, mimeType: string): Promise<void> {
    this.keys.add(storageKey);
    await super.put(storageKey, bytes, mimeType);
  }

  override async delete(storageKey: string): Promise<void> {
    this.keys.delete(storageKey);
    await super.delete(storageKey);
  }

  size(): number {
    return this.keys.size;
  }
}

/** Test double: lets a test flip the scan status of a stored attachment (no production code does). */
class TestLeadMessagingRepository extends MemoryLeadMessagingRepository {
  async markAttachmentScanStatusForTest(attachmentId: string, scanStatus: ScanStatus): Promise<void> {
    const messages = (this as unknown as { messages: Array<{ attachments: Array<{ id: string; scanStatus: ScanStatus }> }> }).messages;
    for (const message of messages) for (const attachment of message.attachments) if (attachment.id === attachmentId) attachment.scanStatus = scanStatus;
  }
}

export const TENANT = "00000000-0000-4000-8000-000000000a01";
export const OTHER_TENANT = "00000000-0000-4000-8000-000000000a02";

export const actors = {
  starter: { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: TENANT, partnerPlan: "starter", mfaVerified: true } as ActorContext,
  pro: { actorId: "pro-owner", roles: ["broker_owner_pro"], partnerTenantId: TENANT, partnerPlan: "pro", mfaVerified: true } as ActorContext,
  readOnly: { actorId: "reader", roles: ["broker_read_only"], partnerTenantId: TENANT, partnerPlan: "pro", mfaVerified: true } as ActorContext,
  other: { actorId: "other-owner", roles: ["broker_owner_pro"], partnerTenantId: OTHER_TENANT, partnerPlan: "pro", mfaVerified: true } as ActorContext,
  compliance: { actorId: "compliance", roles: ["compliance_admin"], mfaVerified: true } as ActorContext,
  support: { actorId: "support", roles: ["support_admin"], mfaVerified: true } as ActorContext,
  finance: { actorId: "finance", roles: ["finance_admin"], mfaVerified: true } as ActorContext
};

export const GOOD_TOKEN = "good-token";

/** Two quote requests so a visitor of one can be shown not to reach the other. */
export async function createKit(options: { enabled?: () => boolean; now?: () => Date } = {}) {
  const audit = new AuditLogWriter();
  const assignments = new LeadAssignmentService(audit);
  const repository = new TestLeadMessagingRepository();
  const storage = new CountingStorage();
  const quotes: Record<string, MessagingQuote & { prospectId: string }> = {
    q1: { id: "q1", publicReference: "QR-1", status: "routed", language: "fr", prospectId: "p1" },
    q2: { id: "q2", publicReference: "QR-2", status: "routed", language: "en", prospectId: "p2" }
  };
  const queued: Array<{ method: string; event: Record<string, unknown> }> = [];
  const notifications: LeadMessagingNotificationsPort = {
    queueVisitorBrokerMessage: async (_quote, event) => void queued.push({ method: "queueVisitorBrokerMessage", event }),
    queueVisitorDocumentsRequested: async (_quote, event) => void queued.push({ method: "queueVisitorDocumentsRequested", event }),
    queueBrokerVisitorMessage: async (_quote, event) => void queued.push({ method: "queueBrokerVisitorMessage", event }),
    queueBrokerDocumentReceived: async (_quote, event) => void queued.push({ method: "queueBrokerDocumentReceived", event })
  };
  const firstReplies: string[] = [];
  const firstVisibleReply: FirstVisibleReplyPort = { recordFirstVisibleReply: async (id) => void firstReplies.push(id) };
  const visitorAccess = {
    verify: async (publicReference: string, token: string) => {
      const quote = Object.values(quotes).find((candidate) => candidate.publicReference === publicReference);
      return quote && token === `${GOOD_TOKEN}-${quote.id}` ? { quote } : undefined;
    }
  };
  const provided: QuoteDocumentRecord[] = [];
  const documents: RequestedDocumentsPort = {
    acceptRequestedDocument: async (input) => {
      const record = { id: crypto.randomUUID(), quoteRequestId: input.quote.id, label: input.label, fileName: input.file.fileName, mimeType: input.file.mimeType, sizeBytes: input.file.sizeBytes, storageKey: input.file.storageKey, scanStatus: "clean", status: "available", documentRequestId: input.documentRequestId, createdAt: new Date() } as unknown as QuoteDocumentRecord;
      provided.push(record);
      return record;
    },
    listForDocumentRequest: async (quoteRequestId, documentRequestId) => provided.filter((record) => record.quoteRequestId === quoteRequestId && record.documentRequestId === documentRequestId),
    readRequestedDocument: async (quoteRequestId, documentRequestId, documentId) => {
      const document = provided.find((record) => record.id === documentId && record.quoteRequestId === quoteRequestId && record.documentRequestId === documentRequestId);
      const bytes = document ? await storage.get(document.storageKey) : undefined;
      return document && bytes ? { document, bytes } : undefined;
    }
  };
  const enabled = options.enabled ?? (() => true);
  const common = {
    audit,
    repository,
    assignments,
    crmAccess: new BrokerCrmAccessPolicy(audit, { brokerCrmEnabled: true }),
    starterAccess: new BrokerStarterAccessPolicy(audit, { starterPortalEnabled: true, brokerDashboardEnabled: true, brokerCrmEnabled: true }),
    upload: { storage, scanner: new EicarSignatureScanner() },
    partnerName: async (id: string) => (id === TENANT ? "Cabinet Kone" : "Cabinet Autre"),
    notifications,
    isMessagingEnabled: enabled,
    ...(options.now ? { now: options.now } : {})
  };
  const messages = new LeadMessagingService({
    ...common,
    quotes: { findById: async (id) => quotes[id] },
    firstVisibleReply,
    visitorAccess
  });
  const requests = new DocumentRequestsService({
    ...common,
    documents,
    quotes: { findById: async (id) => quotes[id] },
    visitorAccess
  });
  async function assign(quoteId = "q1", status: LeadAssignmentRecord["status"] = "accepted", tenant = TENANT): Promise<LeadAssignmentRecord> {
    const assignment = await assignments.create({ quoteRequestId: quoteId, partnerTenantId: tenant, assignmentReason: "routing" }, actors.pro);
    if (status !== "assigned") await assignments.updateStatus(assignment.id, status, actors.pro, "test");
    return assignment;
  }
  return { audit, assignments, repository, storage, quotes, queued, firstReplies, provided, messages, requests, assign };
}

export const query = { limit: 50 } as const;
export const visitorToken = (quoteId = "q1") => `${GOOD_TOKEN}-${quoteId}`;

/** A clock that moves forward at every reading, so messages sent in a row keep a deterministic order. */
export function tickingClock(start = "2026-10-15T10:00:00.000Z", stepMs = 1000): () => Date {
  let current = new Date(start).getTime();
  return () => {
    current += stepMs;
    return new Date(current);
  };
}
