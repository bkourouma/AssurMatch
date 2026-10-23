import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ConsentService } from "../consent/consent.module";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { OffersModule } from "../offers/offers.module";
import type { PartnerLicensesService } from "../partner-licenses/partner-licenses.module";
import type { PartnersService } from "../partners/partners.module";
import type { ProductsService } from "../products/products.module";
import type { QuoteFormDefinitionService } from "../quote-forms/quote-form-definition.service";
import { ActivationChecklistAccessRefusedError, ActivationChecklistService, type ActivationChecklistDeps } from "./activation-checklist.service";

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
  partnerReadiness?: ActivationChecklistDeps["partnerReadiness"];
  /** Spec 070: routing rules, scoring rules and manual attestations (controls left out when absent). */
  routingRules?: ActivationChecklistDeps["routingRules"];
  scoringRules?: ActivationChecklistDeps["scoringRules"];
  attestations?: ActivationChecklistDeps["attestations"];
}

export class ActivationChecklistModule {
  readonly service: ActivationChecklistService;

  constructor(deps: ActivationChecklistModuleDeps) {
    this.service = new ActivationChecklistService(deps);
  }
}

export { ActivationChecklistAuditActions } from "./activation-checklist-audit-actions";
export { ACTIVATION_ATTESTATIONS_REPOSITORY, MemoryActivationAttestationsRepository, PrismaActivationAttestationsRepository } from "./activation-attestations.repository";
export type { ActivationAttestation, ActivationAttestationsRepository } from "./activation-attestations.repository";
export { ActivationAttestationRefusedError, ActivationAttestationsService, type ActivationAttestationsDeps } from "./activation-attestations.service";
export { ActivationAttestationsController } from "./activation-attestations.controller";
export { ActivationChecklistAccessRefusedError, ActivationChecklistService };
