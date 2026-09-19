import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { QuoteFormDefinitionRecord } from "./quote-form-definition.service";

export const QUOTE_FORM_DEFINITIONS_REPOSITORY = Symbol("QUOTE_FORM_DEFINITIONS_REPOSITORY");

export interface QuoteFormPublicationScope {
  countryId: string;
  productId: string;
  language: string;
}

export interface QuoteFormDefinitionsRepository extends RuntimeRepository {
  create(form: QuoteFormDefinitionRecord): Promise<QuoteFormDefinitionRecord>;
  update(id: string, update: Partial<QuoteFormDefinitionRecord>): Promise<QuoteFormDefinitionRecord>;
  list(): Promise<QuoteFormDefinitionRecord[]>;
  find(id: string): Promise<QuoteFormDefinitionRecord | undefined>;
  /** Public read path: scoped query rather than a full scan, since it serves every visitor page. */
  findPublished(countryId: string, productId: string): Promise<QuoteFormDefinitionRecord[]>;
  /**
   * Spec 043 D2: publishing must never leave a (country, product, language) triple with zero or two
   * published definitions, so retiring the previous version and publishing the new one is one write.
   */
  publishExclusively(id: string, scope: QuoteFormPublicationScope, publishedAt: Date): Promise<QuoteFormDefinitionRecord>;
}

export class MemoryQuoteFormDefinitionsRepository implements QuoteFormDefinitionsRepository {
  readonly mode = "memory-test" as const;
  private readonly forms: QuoteFormDefinitionRecord[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "QuoteFormDefinitionsRepository");
  }

  async create(form: QuoteFormDefinitionRecord): Promise<QuoteFormDefinitionRecord> {
    this.forms.push(form);
    return form;
  }

  async update(id: string, update: Partial<QuoteFormDefinitionRecord>): Promise<QuoteFormDefinitionRecord> {
    const form = await this.require(id);
    Object.assign(form, update);
    return form;
  }

  async list(): Promise<QuoteFormDefinitionRecord[]> {
    return [...this.forms];
  }

  async find(id: string): Promise<QuoteFormDefinitionRecord | undefined> {
    return this.forms.find((candidate) => candidate.id === id);
  }

  async findPublished(countryId: string, productId: string): Promise<QuoteFormDefinitionRecord[]> {
    return this.forms.filter((candidate) =>
      candidate.countryId === countryId && candidate.productId === productId && candidate.status === "published");
  }

  async publishExclusively(id: string, scope: QuoteFormPublicationScope, publishedAt: Date): Promise<QuoteFormDefinitionRecord> {
    const form = await this.require(id);
    for (const candidate of this.forms) {
      if (candidate.id === id) continue;
      if (candidate.status !== "published") continue;
      if (candidate.countryId !== scope.countryId || candidate.productId !== scope.productId || candidate.language !== scope.language) continue;
      candidate.status = "retired";
      candidate.retiredAt = publishedAt;
      candidate.updatedAt = publishedAt;
    }
    form.status = "published";
    form.publishedAt = publishedAt;
    form.updatedAt = publishedAt;
    return form;
  }

  private async require(id: string): Promise<QuoteFormDefinitionRecord> {
    const form = this.forms.find((candidate) => candidate.id === id);
    if (!form) throw new Error(`Quote form ${id} not found`);
    return form;
  }
}

type QuoteFormDefinitionDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  updateMany(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findUnique(input: unknown): Promise<unknown | null>;
};

export class PrismaQuoteFormDefinitionsRepository implements QuoteFormDefinitionsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(form: QuoteFormDefinitionRecord): Promise<QuoteFormDefinitionRecord> {
    return this.toRecord(await this.forms().create({ data: this.toRow(form) }));
  }

  async update(id: string, update: Partial<QuoteFormDefinitionRecord>): Promise<QuoteFormDefinitionRecord> {
    const data = { ...update } as Record<string, unknown>;
    delete data.id;
    delete data.createdAt;
    return this.toRecord(await this.forms().update({ where: { id }, data }));
  }

  async list(): Promise<QuoteFormDefinitionRecord[]> {
    return (await this.forms().findMany({ orderBy: { createdAt: "desc" } })).map((row) => this.toRecord(row));
  }

  async find(id: string): Promise<QuoteFormDefinitionRecord | undefined> {
    const row = await this.forms().findUnique({ where: { id } });
    return row ? this.toRecord(row) : undefined;
  }

  async findPublished(countryId: string, productId: string): Promise<QuoteFormDefinitionRecord[]> {
    const rows = await this.forms().findMany({ where: { countryId, productId, status: "published" } });
    return rows.map((row) => this.toRecord(row));
  }

  async publishExclusively(id: string, scope: QuoteFormPublicationScope, publishedAt: Date): Promise<QuoteFormDefinitionRecord> {
    return this.prisma.transaction(async () => {
      await this.forms().updateMany({
        where: { ...scope, status: "published", id: { not: id } },
        data: { status: "retired", retiredAt: publishedAt }
      });
      return this.toRecord(await this.forms().update({
        where: { id },
        data: { status: "published", publishedAt }
      }));
    });
  }

  private forms(): QuoteFormDefinitionDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { quoteFormDefinition: QuoteFormDefinitionDelegate }).quoteFormDefinition;
  }

  private toRow(form: QuoteFormDefinitionRecord): Record<string, unknown> {
    // `validationSchema` exists on the table but not on the contract; it is carried through untouched
    // so the repository never silently drops a column a later spec may start using.
    return { ...form, validationSchema: form.validationSchema ?? null };
  }

  private toRecord(row: unknown): QuoteFormDefinitionRecord {
    return row as QuoteFormDefinitionRecord;
  }
}
