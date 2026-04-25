import { assertNoHeavyPublicSynchronousWork } from "../common/interceptors/async-boundary.interceptor";
import { ProductsService, type Product } from "./products.module";

export class PublicProductsController {
  constructor(private readonly products: ProductsService) {}

  list(countryId: string): Product[] {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.products.listPublic(countryId);
  }
}
