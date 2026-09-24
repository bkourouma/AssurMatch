import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ConsentService } from "../consent/consent.module";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { OffersModule } from "../offers/offers.module";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "../partners/partners.module";
import type { ProductsService } from "../products/products.module";
import type { QuoteFormDefinitionService } from "../quote-forms/quote-form-definition.service";
import { ActivationChecklistAccessRefusedError, ActivationChecklistService } from "./activation-checklist.service";

export interface ActivationChecklistModuleDeps {
  audit: AuditLogWriter;
  featureFlags: FeatureFlagsService;
  countries: CountriesService;
  products: ProductsService;
  partners: PartnersService;
  partnerLicenses: PartnerLicensesService;
  offers: OffersModule;
  quoteForms: QuoteFormDefinitionService;
  consent: ConsentService;
}

export class ActivationChecklistModule {
  readonly service: ActivationChecklistService;

  constructor(deps: ActivationChecklistModuleDeps) {
    this.service = new ActivationChecklistService(deps);
  }
}

export { ActivationChecklistAuditActions } from "./activation-checklist-audit-actions";
export { ActivationChecklistAccessRefusedError, ActivationChecklistService };
