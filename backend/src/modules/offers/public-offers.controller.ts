import type { OfferListQuery } from "../../../../packages/shared/contracts/quote.contracts";
import { assertNoHeavyPublicSynchronousWork } from "../common/interceptors/async-boundary.interceptor";
import { PublicOfferCatalogService } from "./public-offer-catalog.service";

export class PublicOffersController {
  constructor(private readonly catalog: PublicOfferCatalogService) {}

  list(countryId: string, productId: string, query: Partial<OfferListQuery> = {}) {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.catalog.list(countryId, productId, query);
  }

  detail(offerId: string) {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.catalog.detail(offerId);
  }
}
