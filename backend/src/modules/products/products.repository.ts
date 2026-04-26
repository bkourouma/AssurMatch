import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { Product } from "./products.module";

export const PRODUCTS_REPOSITORY = Symbol("PRODUCTS_REPOSITORY");

export interface ProductsRepository extends RuntimeRepository {
  create(product: Product): Promise<Product>;
  update(id: string, update: Partial<Product>): Promise<Product>;
  associateCountry(productId: string, countryId: string): Promise<Product>;
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

type CountryProductDelegate = {
  upsert(input: unknown): Promise<unknown>;
  findMany(input?: unknown): Promise<Array<{ productId: string; countryId: string }>>;
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
    const countries = await this.countryIds(id);
    return this.withCountries(row, countries);
  }

  async associateCountry(productId: string, countryId: string): Promise<Product> {
    await this.countryProducts().upsert({
      where: { countryId_productId: { countryId, productId } },
      create: { countryId, productId, status: "public", flags: {}, createdAt: new Date(), updatedAt: new Date() },
      update: { updatedAt: new Date() }
    });
    return this.require(productId);
  }

  async list(countryId?: string): Promise<Product[]> {
    const rows = await this.products().findMany({ orderBy: { name: "asc" } });
    const products = await Promise.all(rows.map((row) => this.withCountries(row, undefined)));
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

  private async countryIds(productId: string): Promise<string[]> {
    const rows = await this.countryProducts().findMany({ where: { productId } });
    return rows.map((row) => row.countryId);
  }

  private async withCountries(row: unknown, knownCountryIds?: string[]): Promise<Product> {
    const item = row as Product;
    return { ...item, countryIds: knownCountryIds ?? await this.countryIds(item.id) };
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
