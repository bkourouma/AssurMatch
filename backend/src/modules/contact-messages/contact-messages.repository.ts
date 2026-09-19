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
}

type ContactMessageDelegate = {
  create(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
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

  private client(): ContactMessageDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { contactMessage: ContactMessageDelegate }).contactMessage;
  }

  private toDomain(row: unknown): ContactMessageRecord {
    return row as ContactMessageRecord;
  }
}
