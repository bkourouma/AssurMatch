import type { DocumentRequestCancelReason, DocumentRequestStatus, LeadMessageSenderType } from "../../../../packages/shared/contracts/lead-messaging";
import type { PrismaService } from "../common/prisma/prisma.service";
import { assertRuntimeRepository, type RuntimeRepository } from "../common/repositories/runtime-repository";

export type ScanStatus = "pending" | "clean" | "infected" | "failed";

/** The side that reads: marking read acts on the messages written by the other side. */
export type MessageReaderSide = LeadMessageSenderType;

export interface LeadMessageAttachmentRecord {
  id: string;
  messageId: string;
  leadAssignmentId: string;
  quoteRequestId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  storageKey: string;
  scanStatus: ScanStatus;
  scanEngine?: string | undefined;
  scannedAt?: Date | undefined;
  anonymizedAt?: Date | undefined;
  createdAt: Date;
}

/**
 * Spec 062: one message of a conversation. A conversation is the pair (assignment, broker): the
 * assignment row is mutated by a reassignment, so `partnerTenantId` is the broker at the time of
 * sending. The body never changes after creation (append-only); only `readAt` and the spec 046
 * anonymization marker do.
 */
export interface LeadMessageRecord {
  id: string;
  quoteRequestId: string;
  leadAssignmentId: string;
  partnerTenantId: string;
  senderType: LeadMessageSenderType;
  authorId?: string | undefined;
  body: string;
  readAt?: Date | undefined;
  clientRequestId?: string | undefined;
  anonymizedAt?: Date | undefined;
  createdAt: Date;
  attachments: LeadMessageAttachmentRecord[];
}

export type NewLeadMessage = Omit<LeadMessageRecord, "attachments" | "readAt" | "anonymizedAt">;
export type NewLeadMessageAttachment = Omit<LeadMessageAttachmentRecord, "anonymizedAt">;

export interface LeadDocumentRequestRecord {
  id: string;
  quoteRequestId: string;
  leadAssignmentId: string;
  partnerTenantId: string;
  authorId?: string | undefined;
  label: string;
  note?: string | undefined;
  dueAt?: Date | undefined;
  status: DocumentRequestStatus;
  fulfilledAt?: Date | undefined;
  fulfilledDocumentCount: number;
  cancelledAt?: Date | undefined;
  cancelledById?: string | undefined;
  cancelReason?: DocumentRequestCancelReason | undefined;
  anonymizedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

/** The only fields a document request may change: `open -> fulfilled` or `open -> cancelled`. */
export type DocumentRequestTransition =
  | { status: "fulfilled"; fulfilledAt: Date; fulfilledDocumentCount: number }
  | { status: "cancelled"; cancelledAt: Date; cancelledById?: string | undefined; cancelReason: DocumentRequestCancelReason };

/**
 * Append-only store. There is deliberately no method that rewrites a message body: the only
 * mutations are `appendMessage`, `markRead` (the recipient's first read) and the spec 046
 * anonymization of the free text.
 */
export interface LeadMessagingRepository extends RuntimeRepository {
  appendMessage(message: NewLeadMessage, attachments: readonly NewLeadMessageAttachment[]): Promise<LeadMessageRecord>;
  findMessage(id: string): Promise<LeadMessageRecord | undefined>;
  /** Ascending `createdAt`, then `id`. */
  listForConversation(leadAssignmentId: string, partnerTenantId: string): Promise<LeadMessageRecord[]>;
  listForQuote(quoteRequestId: string): Promise<LeadMessageRecord[]>;
  findByClientRequestId(leadAssignmentId: string, senderType: LeadMessageSenderType, clientRequestId: string): Promise<LeadMessageRecord | undefined>;
  countForConversation(leadAssignmentId: string, partnerTenantId: string): Promise<number>;
  /** Marks the unread messages written by the other side as read; returns how many changed. */
  markRead(leadAssignmentId: string, partnerTenantId: string, reader: MessageReaderSide, at: Date): Promise<number>;
  /** Spec 046 policy: bodies and file names are replaced by the marker; ids, authors and timestamps stay. */
  anonymizeForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void>;

  createDocumentRequest(record: LeadDocumentRequestRecord): Promise<LeadDocumentRequestRecord>;
  findDocumentRequest(id: string): Promise<LeadDocumentRequestRecord | undefined>;
  transitionDocumentRequest(id: string, transition: DocumentRequestTransition): Promise<LeadDocumentRequestRecord>;
  listDocumentRequestsForAssignment(leadAssignmentId: string): Promise<LeadDocumentRequestRecord[]>;
  listDocumentRequestsForQuote(quoteRequestId: string): Promise<LeadDocumentRequestRecord[]>;
  anonymizeDocumentRequestsForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void>;
}

function byCreation<T extends { createdAt: Date; id: string }>(left: T, right: T): number {
  return left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id);
}

function copyMessage(record: LeadMessageRecord): LeadMessageRecord {
  return { ...record, attachments: record.attachments.map((attachment) => ({ ...attachment })) };
}

function transitionPatch(transition: DocumentRequestTransition): Partial<LeadDocumentRequestRecord> {
  if (transition.status === "fulfilled") {
    return { status: "fulfilled", fulfilledAt: transition.fulfilledAt, fulfilledDocumentCount: transition.fulfilledDocumentCount };
  }
  return {
    status: "cancelled",
    cancelledAt: transition.cancelledAt,
    cancelReason: transition.cancelReason,
    ...(transition.cancelledById ? { cancelledById: transition.cancelledById } : {})
  };
}

export class MemoryLeadMessagingRepository implements LeadMessagingRepository {
  readonly mode = "memory-test" as const;
  private readonly messages: LeadMessageRecord[] = [];
  private readonly requests: LeadDocumentRequestRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "LeadMessagingRepository");
  }

  async appendMessage(message: NewLeadMessage, attachments: readonly NewLeadMessageAttachment[]): Promise<LeadMessageRecord> {
    const record: LeadMessageRecord = { ...message, attachments: attachments.map((attachment) => ({ ...attachment })) };
    this.messages.push(record);
    return copyMessage(record);
  }

  async findMessage(id: string): Promise<LeadMessageRecord | undefined> {
    const found = this.messages.find((message) => message.id === id);
    return found ? copyMessage(found) : undefined;
  }

  async listForConversation(leadAssignmentId: string, partnerTenantId: string): Promise<LeadMessageRecord[]> {
    return this.messages
      .filter((message) => message.leadAssignmentId === leadAssignmentId && message.partnerTenantId === partnerTenantId)
      .sort(byCreation)
      .map(copyMessage);
  }

  async listForQuote(quoteRequestId: string): Promise<LeadMessageRecord[]> {
    return this.messages.filter((message) => message.quoteRequestId === quoteRequestId).sort(byCreation).map(copyMessage);
  }

  async findByClientRequestId(leadAssignmentId: string, senderType: LeadMessageSenderType, clientRequestId: string): Promise<LeadMessageRecord | undefined> {
    const found = this.messages.find((message) => message.leadAssignmentId === leadAssignmentId && message.senderType === senderType && message.clientRequestId === clientRequestId);
    return found ? copyMessage(found) : undefined;
  }

  async countForConversation(leadAssignmentId: string, partnerTenantId: string): Promise<number> {
    return this.messages.filter((message) => message.leadAssignmentId === leadAssignmentId && message.partnerTenantId === partnerTenantId).length;
  }

  async markRead(leadAssignmentId: string, partnerTenantId: string, reader: MessageReaderSide, at: Date): Promise<number> {
    let marked = 0;
    for (const message of this.messages) {
      if (message.leadAssignmentId !== leadAssignmentId || message.partnerTenantId !== partnerTenantId) continue;
      if (message.senderType === reader || message.readAt) continue;
      message.readAt = at;
      marked += 1;
    }
    return marked;
  }

  async anonymizeForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void> {
    const ids = new Set(leadAssignmentIds);
    for (const message of this.messages) {
      if (!ids.has(message.leadAssignmentId)) continue;
      message.body = marker;
      message.anonymizedAt = now;
      for (const attachment of message.attachments) {
        attachment.fileName = marker;
        attachment.anonymizedAt = now;
      }
    }
  }

  async createDocumentRequest(record: LeadDocumentRequestRecord): Promise<LeadDocumentRequestRecord> {
    this.requests.push({ ...record });
    return { ...record };
  }

  async findDocumentRequest(id: string): Promise<LeadDocumentRequestRecord | undefined> {
    const found = this.requests.find((request) => request.id === id);
    return found ? { ...found } : undefined;
  }

  async transitionDocumentRequest(id: string, transition: DocumentRequestTransition): Promise<LeadDocumentRequestRecord> {
    const found = this.requests.find((request) => request.id === id);
    if (!found) throw new Error(`Document request ${id} not found`);
    if (found.status !== "open") throw new Error(`Document request ${id} is not open`);
    Object.assign(found, transitionPatch(transition), { updatedAt: new Date() });
    return { ...found };
  }

  async listDocumentRequestsForAssignment(leadAssignmentId: string): Promise<LeadDocumentRequestRecord[]> {
    return this.requests.filter((request) => request.leadAssignmentId === leadAssignmentId).sort(byCreation).map((request) => ({ ...request }));
  }

  async listDocumentRequestsForQuote(quoteRequestId: string): Promise<LeadDocumentRequestRecord[]> {
    return this.requests.filter((request) => request.quoteRequestId === quoteRequestId).sort(byCreation).map((request) => ({ ...request }));
  }

  async anonymizeDocumentRequestsForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void> {
    const ids = new Set(leadAssignmentIds);
    for (const request of this.requests) {
      if (!ids.has(request.leadAssignmentId)) continue;
      request.label = marker;
      delete request.note;
      request.anonymizedAt = now;
    }
  }
}

type Delegate = {
  create(input: unknown): Promise<unknown>;
  createMany(input: unknown): Promise<{ count: number }>;
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<{ count: number }>;
  findUnique(input: unknown): Promise<unknown>;
  findFirst(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  count(input?: unknown): Promise<number>;
};

type TransactionCapableClient = {
  $transaction<T>(callback: (tx: { leadMessage: Delegate; leadMessageAttachment: Delegate }) => Promise<T>): Promise<T>;
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

function defined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)) as T;
}

const ORDER = [{ createdAt: "asc" }, { id: "asc" }];

export class PrismaLeadMessagingRepository implements LeadMessagingRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The message and its attachments are one unit (a failed attachment insert leaves no message without
   * its files). A unique violation on (assignment, sender, clientRequestId) is a concurrent retry of the
   * same send: the message stored first is returned (idempotent replay), nothing else is written.
   */
  async appendMessage(message: NewLeadMessage, attachments: readonly NewLeadMessageAttachment[]): Promise<LeadMessageRecord> {
    const client = this.prisma.requireRuntimeClient() as unknown as TransactionCapableClient;
    try {
      const row = await client.$transaction(async (tx) => {
        const created = await tx.leadMessage.create({ data: { ...message } });
        if (attachments.length > 0) await tx.leadMessageAttachment.createMany({ data: attachments.map((attachment) => ({ ...attachment })) });
        return created;
      });
      return this.toMessage(row, attachments.map((attachment) => ({ ...attachment })));
    } catch (error) {
      if (isUniqueViolation(error) && message.clientRequestId) {
        const existing = await this.findByClientRequestId(message.leadAssignmentId, message.senderType, message.clientRequestId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async findMessage(id: string): Promise<LeadMessageRecord | undefined> {
    const row = await this.messagesTable().findUnique({ where: { id } });
    if (!row) return undefined;
    return this.toMessage(row, await this.attachmentRows([id]));
  }

  async listForConversation(leadAssignmentId: string, partnerTenantId: string): Promise<LeadMessageRecord[]> {
    return this.withAttachments(await this.messagesTable().findMany({ where: { leadAssignmentId, partnerTenantId }, orderBy: ORDER }));
  }

  async listForQuote(quoteRequestId: string): Promise<LeadMessageRecord[]> {
    return this.withAttachments(await this.messagesTable().findMany({ where: { quoteRequestId }, orderBy: ORDER }));
  }

  async findByClientRequestId(leadAssignmentId: string, senderType: LeadMessageSenderType, clientRequestId: string): Promise<LeadMessageRecord | undefined> {
    const row = await this.messagesTable().findFirst({ where: { leadAssignmentId, senderType, clientRequestId } });
    if (!row) return undefined;
    return this.toMessage(row, await this.attachmentRows([(row as { id: string }).id]));
  }

  countForConversation(leadAssignmentId: string, partnerTenantId: string): Promise<number> {
    return this.messagesTable().count({ where: { leadAssignmentId, partnerTenantId } });
  }

  async markRead(leadAssignmentId: string, partnerTenantId: string, reader: MessageReaderSide, at: Date): Promise<number> {
    const result = await this.messagesTable().updateMany({
      where: { leadAssignmentId, partnerTenantId, senderType: { not: reader }, readAt: null },
      data: { readAt: at }
    });
    return result.count;
  }

  async anonymizeForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void> {
    if (leadAssignmentIds.length === 0) return;
    const where = { leadAssignmentId: { in: [...leadAssignmentIds] } };
    await this.messagesTable().updateMany({ where, data: { body: marker, anonymizedAt: now } });
    await this.attachmentsTable().updateMany({ where, data: { fileName: marker, anonymizedAt: now } });
  }

  async createDocumentRequest(record: LeadDocumentRequestRecord): Promise<LeadDocumentRequestRecord> {
    return this.toRequest(await this.requestsTable().create({ data: { ...record } }));
  }

  async findDocumentRequest(id: string): Promise<LeadDocumentRequestRecord | undefined> {
    const row = await this.requestsTable().findUnique({ where: { id } });
    return row ? this.toRequest(row) : undefined;
  }

  async transitionDocumentRequest(id: string, transition: DocumentRequestTransition): Promise<LeadDocumentRequestRecord> {
    // Guarded on `open`: a request that already left that state is never rewritten.
    const result = await this.requestsTable().updateMany({ where: { id, status: "open" }, data: transitionPatch(transition) });
    if (result.count === 0) throw new Error(`Document request ${id} is not open`);
    const row = await this.requestsTable().findUnique({ where: { id } });
    if (!row) throw new Error(`Document request ${id} not found`);
    return this.toRequest(row);
  }

  async listDocumentRequestsForAssignment(leadAssignmentId: string): Promise<LeadDocumentRequestRecord[]> {
    return (await this.requestsTable().findMany({ where: { leadAssignmentId }, orderBy: ORDER })).map((row) => this.toRequest(row));
  }

  async listDocumentRequestsForQuote(quoteRequestId: string): Promise<LeadDocumentRequestRecord[]> {
    return (await this.requestsTable().findMany({ where: { quoteRequestId }, orderBy: ORDER })).map((row) => this.toRequest(row));
  }

  async anonymizeDocumentRequestsForAssignments(leadAssignmentIds: readonly string[], marker: string, now: Date): Promise<void> {
    if (leadAssignmentIds.length === 0) return;
    await this.requestsTable().updateMany({ where: { leadAssignmentId: { in: [...leadAssignmentIds] } }, data: { label: marker, note: null, anonymizedAt: now } });
  }

  private async attachmentRows(messageIds: readonly string[]): Promise<LeadMessageAttachmentRecord[]> {
    if (messageIds.length === 0) return [];
    const rows = await this.attachmentsTable().findMany({ where: { messageId: { in: [...messageIds] } }, orderBy: ORDER });
    return rows.map((row) => defined(row as Record<string, unknown>) as unknown as LeadMessageAttachmentRecord);
  }

  private async withAttachments(rows: unknown[]): Promise<LeadMessageRecord[]> {
    const attachments = await this.attachmentRows(rows.map((row) => (row as { id: string }).id));
    return rows.map((row) => this.toMessage(row, attachments.filter((attachment) => attachment.messageId === (row as { id: string }).id)));
  }

  private toMessage(raw: unknown, attachments: LeadMessageAttachmentRecord[]): LeadMessageRecord {
    const base = defined(raw as Record<string, unknown>) as unknown as Omit<LeadMessageRecord, "attachments">;
    return { ...base, attachments };
  }

  private toRequest(raw: unknown): LeadDocumentRequestRecord {
    return defined(raw as Record<string, unknown>) as unknown as LeadDocumentRequestRecord;
  }

  private messagesTable(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { leadMessage: Delegate }).leadMessage;
  }

  private attachmentsTable(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { leadMessageAttachment: Delegate }).leadMessageAttachment;
  }

  private requestsTable(): Delegate {
    return (this.prisma.requireRuntimeClient() as unknown as { leadDocumentRequest: Delegate }).leadDocumentRequest;
  }
}
