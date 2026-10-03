import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { ContactAudience } from "../../../../packages/shared/contracts/public-site.contracts";

export const CONTACT_MESSAGES_REPOSITORY = Symbol("CONTACT_MESSAGES_REPOSITORY");

/** Mirrors the Prisma `ContactMessageStatus` enum (see `backend/prisma/schema.prisma`). */
export type ContactMessageStatus = "new" | "handled" | "spam";

export interface ContactMessageRecord {
  id: string;
  publicReference: string;
  audience: ContactAudience;
  name: string;
  emailNormalized: string;
  emailFingerprint: string;
  phone?: string;
  countryId?: string;
  subject: string;
  message: string;
  consentVersion: string;
  status: ContactMessageStatus;
  /** Spec 056: set when an admin changes the status; cleared when it goes back to `new`. */
  handledAt?: Date;
  handledById?: string;
  statusReason?: string;
  ipHash?: string;
  retentionUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactMessagesFilter {
  audience?: ContactAudience;
  status?: ContactMessageStatus;
  countryId?: string;
}

export interface ContactMessagesRepository extends RuntimeRepository {
  create(message: ContactMessageRecord): Promise<ContactMessageRecord>;
  list(filter: ContactMessagesFilter): Promise<ContactMessageRecord[]>;
  /** Spec 056 admin inbox. */
  findById(id: string): Promise<ContactMessageRecord | undefined>;
  updateStatus(id: string, update: ContactMessageStatusUpdate): Promise<ContactMessageRecord>;
}

export interface ContactMessageStatusUpdate {
  status: ContactMessageStatus;
  handledAt: Date | null;
  handledById: string | null;
  statusReason: string | null;
}

export class MemoryContactMessagesRepository implements ContactMessagesRepository {
  readonly mode = "memory-test" as const;
  private readonly messages: ContactMessageRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ContactMessagesRepository");
  }

  async create(message: ContactMessageRecord): Promise<ContactMessageRecord> {
    this.messages.push(message);
    return message;
  }

  async list(filter: ContactMessagesFilter): Promise<ContactMessageRecord[]> {
    return this.messages
      .filter((candidate) => !filter.audience || candidate.audience === filter.audience)
      .filter((candidate) => !filter.status || candidate.status === filter.status)
      .filter((candidate) => !filter.countryId || candidate.countryId === filter.countryId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(id: string): Promise<ContactMessageRecord | undefined> {
    return this.messages.find((candidate) => candidate.id === id);
  }

  async updateStatus(id: string, update: ContactMessageStatusUpdate): Promise<ContactMessageRecord> {
    const message = this.messages.find((candidate) => candidate.id === id);
    if (!message) throw new Error("Contact message not found");
    message.status = update.status;
    if (update.handledAt) message.handledAt = update.handledAt; else delete message.handledAt;
    if (update.handledById) message.handledById = update.handledById; else delete message.handledById;
    if (update.statusReason) message.statusReason = update.statusReason; else delete message.statusReason;
    message.updatedAt = new Date();
    return message;
  }
}

type ContactMessageDelegate = {
  create(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
  update(input: unknown): Promise<unknown>;
};

export class PrismaContactMessagesRepository implements ContactMessagesRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(message: ContactMessageRecord): Promise<ContactMessageRecord> {
    return this.toDomain(await this.client().create({ data: message }));
  }

  async list(filter: ContactMessagesFilter): Promise<ContactMessageRecord[]> {
    const where = {
      ...(filter.audience ? { audience: filter.audience } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.countryId ? { countryId: filter.countryId } : {})
    };
    const rows = await this.client().findMany({ where, orderBy: { createdAt: "desc" } });
    return rows.map((row) => this.toDomain(row));
  }

  async findById(id: string): Promise<ContactMessageRecord | undefined> {
    const row = await this.client().findUnique({ where: { id } });
    return row ? this.toDomain(row) : undefined;
  }

  async updateStatus(id: string, update: ContactMessageStatusUpdate): Promise<ContactMessageRecord> {
    return this.toDomain(await this.client().update({ where: { id }, data: update }));
  }

  private client(): ContactMessageDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { contactMessage: ContactMessageDelegate }).contactMessage;
  }

  /** Prisma returns `null` for empty optional columns; the domain record leaves them out. */
  private toDomain(row: unknown): ContactMessageRecord {
    const record = { ...(row as Record<string, unknown>) };
    for (const key of ["handledAt", "handledById", "statusReason"]) {
      if (record[key] === null) delete record[key];
    }
    return record as unknown as ContactMessageRecord;
  }
}
