import { assertNoHeavyPublicSynchronousWork } from "../common/interceptors/async-boundary.interceptor";
import { QuoteFormDefinitionService } from "./quote-form-definition.service";

export class PublicQuoteFormsController {
  constructor(private readonly forms: QuoteFormDefinitionService) {}

  get(countryId: string, productId: string, language = "fr") {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.forms.publicForm(countryId, productId, language);
  }
}
