import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { CountryProductLink, Product } from "./products.module";

export const PRODUCTS_REPOSITORY = Symbol("PRODUCTS_REPOSITORY");

export interface ProductsRepository extends RuntimeRepository {
  create(product: Product): Promise<Product>;
  update(id: string, update: Partial<Product>): Promise<Product>;
  associateCountry(productId: string, countryId: string): Promise<Product>;
  /** Spec 050: creates or replaces the CountryProduct row (status and flags). */
  saveLink(productId: string, link: CountryProductLink): Promise<CountryProductLink>;
  list(countryId?: string): Promise<Product[]>;
  listPublic(countryId: string): Promise<Product[]>;
  findByKey(productKey: string): Promise<Product | undefined>;
  require(id: string): Promise<Product>;
}

export class MemoryProductsRepository implements ProductsRepository {
  readonly mode = "memory-test" as const;
  private readonly products: Product[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ProductsRepository");
  }

  async create(product: Product): Promise<Product> {
    this.products.push(product);
    return product;
  }

  async update(id: string, update: Partial<Product>): Promise<Product> {
    const product = await this.require(id);
    Object.assign(product, update);
    return product;
  }

  async associateCountry(productId: string, countryId: string): Promise<Product> {
    const product = await this.require(productId);
    if (!product.countryIds.includes(countryId)) product.countryIds.push(countryId);
    product.updatedAt = new Date();
    return product;
  }

  async saveLink(productId: string, link: CountryProductLink): Promise<CountryProductLink> {
    const product = await this.require(productId);
    const links = product.countryLinks ?? [];
    const index = links.findIndex((candidate) => candidate.countryId === link.countryId);
    const saved: CountryProductLink = { ...link, flags: { ...link.flags } };
    if (index >= 0) links[index] = saved;
    else links.push(saved);
    product.countryLinks = links;
    const active = product.countryIds.includes(link.countryId);
    if (link.status === "retired" && active) product.countryIds.splice(product.countryIds.indexOf(link.countryId), 1);
    if (link.status !== "retired" && !active) product.countryIds.push(link.countryId);
    return saved;
  }

  async list(countryId?: string): Promise<Product[]> {
    return countryId ? this.products.filter((product) => product.countryIds.includes(countryId)) : [...this.products];
  }

  async listPublic(countryId: string): Promise<Product[]> {
    return this.products.filter((product) =>
      product.countryIds.includes(countryId) && product.status === "public" && product.flags.product_public_enabled
    );
  }

  async findByKey(productKey: string): Promise<Product | undefined> {
    return this.products.find((candidate) => candidate.key === productKey);
  }

  async require(id: string): Promise<Product> {
    const product = this.products.find((candidate) => candidate.id === id);
    if (!product) throw new Error(`Product ${id} not found`);
    return product;
  }
}

type ProductDelegate = {
  create(input: unknown): Promise<unknown>;
  update(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<unknown[]>;
  findFirst(input: unknown): Promise<unknown | null>;
  findUnique(input: unknown): Promise<unknown | null>;
};

type CountryProductRow = {
  productId: string;
  countryId: string;
  status?: string;
  flags?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
  createdById?: string | null;
};

type CountryProductDelegate = {
  upsert(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<CountryProductRow[]>;
};

export class PrismaProductsRepository implements ProductsRepository {
  readonly mode = "prisma-runtime" as const;

  constructor(private readonly prisma: PrismaService) {}

  async create(product: Product): Promise<Product> {
    const row = await this.products().create({ data: this.toPrisma(product) });
    return this.withCountries(row, product.countryIds);
  }

  async update(id: string, update: Partial<Product>): Promise<Product> {
    const row = await this.products().update({ where: { id }, data: this.toPrismaUpdate(update) });
    return this.withCountries(row, undefined);
  }

  async associateCountry(productId: string, countryId: string): Promise<Product> {
    await this.countryProducts().upsert({
      where: { countryId_productId: { countryId, productId } },
      create: { countryId, productId, status: "public", flags: {}, createdAt: new Date(), updatedAt: new Date() },
      update: { updatedAt: new Date() }
    });
    return this.require(productId);
  }

  async saveLink(productId: string, link: CountryProductLink): Promise<CountryProductLink> {
    await this.countryProducts().upsert({
      where: { countryId_productId: { countryId: link.countryId, productId } },
      create: {
        countryId: link.countryId,
        productId,
        status: link.status,
        flags: link.flags,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
        ...(link.createdById ? { createdById: link.createdById } : {})
      },
      update: { status: link.status, flags: link.flags, updatedAt: link.updatedAt }
    });
    return link;
  }

  async list(countryId?: string): Promise<Product[]> {
    const rows = await this.products().findMany({ orderBy: { name: "asc" } });
    // Spec 059 follow-up: one query for every country link instead of one per product.
    const ids = rows.map((row) => (row as { id: string }).id);
    const links = ids.length > 0 ? await this.countryProducts().findMany({ where: { productId: { in: ids } } }) : [];
    const byProduct = new Map<string, CountryProductRow[]>();
    for (const link of links) byProduct.set(link.productId, [...(byProduct.get(link.productId) ?? []), link]);
    const products = rows.map((row) => this.assemble(row, byProduct.get((row as { id: string }).id) ?? []));
    return countryId ? products.filter((product) => product.countryIds.includes(countryId)) : products;
  }

  async listPublic(countryId: string): Promise<Product[]> {
    return (await this.list(countryId)).filter((product) => product.status === "public" && product.flags.product_public_enabled);
  }

  async findByKey(productKey: string): Promise<Product | undefined> {
    const row = await this.products().findFirst({ where: { key: productKey } });
    return row ? this.withCountries(row, undefined) : undefined;
  }

  async require(id: string): Promise<Product> {
    const row = await this.products().findUnique({ where: { id } });
    if (!row) throw new Error(`Product ${id} not found`);
    return this.withCountries(row, undefined);
  }

  private products(): ProductDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { product: ProductDelegate }).product;
  }

  private countryProducts(): CountryProductDelegate {
    return (this.prisma.requireRuntimeClient() as unknown as { countryProduct: CountryProductDelegate }).countryProduct;
  }

  private async withCountries(row: unknown, knownCountryIds?: string[]): Promise<Product> {
    const item = row as Product & { description?: string | null; categoryId?: string | null };
    const { description, categoryId, ...rest } = item;
    const base = { ...rest, ...(description ? { description } : {}), ...(categoryId ? { categoryId } : {}) } as Product;
    if (knownCountryIds) return { ...base, countryIds: knownCountryIds, countryLinks: [] };
    return this.assemble(row, await this.countryProducts().findMany({ where: { productId: item.id } }));
  }

  private assemble(row: unknown, linkRows: CountryProductRow[]): Product {
    const item = row as Product & { description?: string | null; categoryId?: string | null };
    const { description, categoryId, ...rest } = item;
    const base = { ...rest, ...(description ? { description } : {}), ...(categoryId ? { categoryId } : {}) } as Product;
    const links = linkRows.map((link) => this.toLink(link));
    return {
      ...base,
      countryIds: links.filter((link) => link.status !== "retired").map((link) => link.countryId),
      countryLinks: links
    };
  }

  private toLink(row: CountryProductRow): CountryProductLink {
    const status = (["internal", "pilot", "public", "suspended", "retired"] as const).find((candidate) => candidate === row.status) ?? "internal";
    const flags = row.flags && typeof row.flags === "object" && !Array.isArray(row.flags) ? row.flags as CountryProductLink["flags"] : {};
    const epoch = new Date(0);
    return {
      countryId: row.countryId,
      status,
      flags,
      createdAt: row.createdAt ?? epoch,
      updatedAt: row.updatedAt ?? epoch,
      ...(row.createdById ? { createdById: row.createdById } : {})
    };
  }

  private toPrisma(product: Product): Record<string, unknown> {
    return {
      id: product.id,
      categoryId: product.categoryId,
      key: product.key,
      name: product.name,
      description: product.description,
      sensitivity: product.sensitivity,
      requiresDocuments: product.requiresDocuments,
      requiresManualReview: product.requiresManualReview,
      status: product.status,
      flags: product.flags,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      createdById: product.createdById
    };
  }

  private toPrismaUpdate(update: Partial<Product>): Record<string, unknown> {
    const data = this.toPrisma({ ...update } as Product);
    delete data.id;
    delete data.createdAt;
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  }
}
