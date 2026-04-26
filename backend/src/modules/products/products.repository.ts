import type { RuntimeRepository } from "../common/repositories/runtime-repository";
import { assertRuntimeRepository } from "../common/repositories/runtime-repository";
import type { Product } from "./products.module";

export const PRODUCTS_REPOSITORY = Symbol("PRODUCTS_REPOSITORY");

export interface ProductsRepository extends RuntimeRepository {
  create(product: Product): Product;
  update(id: string, update: Partial<Product>): Product;
  associateCountry(productId: string, countryId: string): Product;
  list(countryId?: string): Product[];
  listPublic(countryId: string): Product[];
  findByKey(productKey: string): Product | undefined;
  require(id: string): Product;
}

export class MemoryProductsRepository implements ProductsRepository {
  readonly mode = "memory-test" as const;
  private readonly products: Product[] = [];

  constructor() {
    assertRuntimeRepository(this.mode, "ProductsRepository");
  }

  create(product: Product): Product {
    this.products.push(product);
    return product;
  }

  update(id: string, update: Partial<Product>): Product {
    const product = this.require(id);
    Object.assign(product, update);
    return product;
  }

  associateCountry(productId: string, countryId: string): Product {
    const product = this.require(productId);
    if (!product.countryIds.includes(countryId)) product.countryIds.push(countryId);
    product.updatedAt = new Date();
    return product;
  }

  list(countryId?: string): Product[] {
    return countryId ? this.products.filter((product) => product.countryIds.includes(countryId)) : [...this.products];
  }

  listPublic(countryId: string): Product[] {
    return this.products.filter((product) =>
      product.countryIds.includes(countryId) && product.status === "public" && product.flags.product_public_enabled
    );
  }

  findByKey(productKey: string): Product | undefined {
    return this.products.find((candidate) => candidate.key === productKey);
  }

  require(id: string): Product {
    const product = this.products.find((candidate) => candidate.id === id);
    if (!product) throw new Error(`Product ${id} not found`);
    return product;
  }
}
