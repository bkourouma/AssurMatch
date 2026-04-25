import { assertNoHeavyPublicSynchronousWork } from "../common/interceptors/async-boundary.interceptor";
import { ProductsService, type Product } from "./products.module";

export class PublicProductsController {
  constructor(private readonly products: ProductsService) {}

  list(countryId: string): Product[] {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.products.listPublic(countryId);
  }

  listForCountry(countryId: string, countryFlags: Parameters<ProductsService["listPublicForCountry"]>[1]) {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.products.listPublicForCountry(countryId, countryFlags);
  }

  detail(countryId: string, productKey: string, countryFlags: Parameters<ProductsService["getPublicProductPage"]>[2]) {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.products.getPublicProductPage(countryId, productKey, countryFlags);
  }
}
