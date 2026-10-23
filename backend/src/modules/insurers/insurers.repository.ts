import type { InsurerStatus } from "../../../../packages/shared/contracts/insurer.contracts";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";

export const INSURERS_REPOSITORY = Symbol("INSURERS_REPOSITORY");

/** Spec 070 (PRD section 8): one insurer of a country. */
export interface InsurerRecord {
  id: string;
  countryId: string;
  name: string;
  /** Unique within the country, immutable. */
  code: string;
  approvalNumber?: string;
  status: InsurerStatus;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

/** Partial update where an explicit `undefined` clears an optional column. */
export type InsurerPatch = { [K in keyof InsurerRecord]?: InsurerRecord[K] | undefined };

export interface InsurersListFilter {
  countryId?: string | undefined;
  status?: InsurerStatus | undefined;
}

export interface InsurersRepository extends RuntimeRepository {
  create(insurer: InsurerRecord): Promise<InsurerRecord>;
  update(id: string, patch: InsurerPatch): Promise<InsurerRecord>;
  find(id: string): Promise<InsurerRecord | undefined>;
  findByCode(countryId: string, code: string): Promise<InsurerRecord | undefined>;
  list(filter?: InsurersListFilter): Promise<InsurerRecord[]>;
}

const NULLABLE_KEYS = new Set(["approvalNumber", "createdById"]);

export class MemoryInsurersRepository implements InsurersRepository {
  readonly mode = "memory-test" as const;
  private readonly insurers: InsurerRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "InsurersRepository");
  }

  async create(insurer: InsurerRecord): Promise<InsurerRecord> {
    if (this.insurers.some((candidate) => candidate.countryId === insurer.countryId && candidate.code === insurer.code)) {
      throw new Error("Insurer code already used in this country");
    }
    this.insurers.push({ ...insurer });
    return { ...insurer };
  }

  async update(id: string, patch: InsurerPatch): Promise<InsurerRecord> {
    const insurer = this.insurers.find((candidate) => candidate.id === id);
    if (!insurer) throw new Error(`Insurer ${id} not found`);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete (insurer as unknown as Record<string, unknown>)[key];
      else (insurer as unknown as Record<string, unknown>)[key] = value;
    }
    return { ...insurer };
  }

  async find(id: string): Promise<InsurerRecord | undefined> {
    const insurer = this.insurers.find((candidate) => candidate.id === id);
    return insurer ? { ...insurer } : undefined;
  }

  async findByCode(countryId: string, code: string): Promise<InsurerRecord | undefined> {
    const insurer = this.insurers.find((candidate) => candidate.countryId === countryId && candidate.code === code);
    return insurer ? { ...insurer } : undefined;
  }

  async list(filter: InsurersListFilter = {}): Promise<InsurerRecord[]> {
    return this.insurers
      .filter((insurer) => (!filter.countryId || insurer.countryId === filter.countryId) && (!filter.status || insurer.status === filter.status))
      .map((insurer) => ({ ...insurer }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }
}

type InsurerDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

export class PrismaInsurersRepository implements InsurersRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(insurer: InsurerRecord): Promise<InsurerRecord> {
    const data = Object.fromEntries(Object.entries(insurer).filter(([, value]) => value !== undefined));
    return this.toDomain(await this.insurers().create({ data }));
  }

  async update(id: string, patch: InsurerPatch): Promise<InsurerRecord> {
    const entries: Array<[string, unknown]> = [];
    for (const [key, value] of Object.entries(patch)) {
      if (key === "id" || key === "createdAt") continue;
      if (value !== undefined) entries.push([key, value]);
      else if (NULLABLE_KEYS.has(key)) entries.push([key, null]);
    }
    return this.toDomain(await this.insurers().update({ where: { id }, data: Object.fromEntries(entries) }));
  }

  async find(id: string): Promise<InsurerRecord | undefined> {
    const row = await this.insurers().findUnique({ where: { id } });
    return row ? this.toDomain(row) : undefined;
  }

  async findByCode(countryId: string, code: string): Promise<InsurerRecord | undefined> {
    const row = await this.insurers().findUnique({ where: { countryId_code: { countryId, code } } });
    return row ? this.toDomain(row) : undefined;
  }

  async list(filter: InsurersListFilter = {}): Promise<InsurerRecord[]> {
    const where = {
      ...(filter.countryId ? { countryId: filter.countryId } : {}),
      ...(filter.status ? { status: filter.status } : {})
    };
    const rows = await this.insurers().findMany({ where, orderBy: { name: "asc" } });
    return rows.map((row) => this.toDomain(row));
  }

  private insurers(): InsurerDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { insurer: InsurerDelegate }).insurer;
  }

  private toDomain(row: unknown): InsurerRecord {
    const result = { ...(row as Record<string, unknown>) };
    for (const key of NULLABLE_KEYS) if (result[key] === null) delete result[key];
    return result as unknown as InsurerRecord;
  }
}
