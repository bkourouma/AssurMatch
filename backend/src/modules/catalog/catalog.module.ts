import type { ActivationChecklistService } from "../activation-checklist/activation-checklist.service";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ConsentService } from "../consent/consent.module";
import type { CountriesService } from "../countries/countries.module";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.module";
import type { ProductsService } from "../products/products.module";
import type { QuoteFormDefinitionService } from "../quote-forms/quote-form-definition.service";
import type { RegulatoryRegimesService } from "../regulatory-regimes/regulatory-regimes.module";
import { CatalogActivationGuard } from "./catalog-activation-guard";
import { CatalogAdminService } from "./catalog-admin.service";
import { CatalogFlagService } from "./catalog-flag.service";

export interface CatalogModuleDeps {
  audit: AuditLogWriter;
  countries: CountriesService;
  products: ProductsService;
  regimes: RegulatoryRegimesService;
  featureFlags: FeatureFlagsService;
  checklist: ActivationChecklistService;
  quoteForms: QuoteFormDefinitionService;
  consent: ConsentService;
  onCatalogChanged?: () => Promise<void> | void;
}

/** Spec 050: admin catalogue (countries, products, links, regimes) and controlled flag toggles. */
export class CatalogModule {
  readonly guard: CatalogActivationGuard;
  readonly flags: CatalogFlagService;
  readonly admin: CatalogAdminService;

  constructor(deps: CatalogModuleDeps) {
    this.guard = new CatalogActivationGuard({ checklist: deps.checklist, quoteForms: deps.quoteForms, consentTexts: deps.consent });
    this.flags = new CatalogFlagService({
      audit: deps.audit,
      countries: deps.countries,
      products: deps.products,
      featureFlags: deps.featureFlags,
      guard: this.guard,
      ...(deps.onCatalogChanged ? { onCatalogChanged: deps.onCatalogChanged } : {})
    });
    this.admin = new CatalogAdminService({
      audit: deps.audit,
      countries: deps.countries,
      products: deps.products,
      regimes: deps.regimes,
      flags: this.flags,
      guard: this.guard,
      ...(deps.onCatalogChanged ? { onCatalogChanged: deps.onCatalogChanged } : {})
    });
  }
}

export { CatalogAccess } from "./catalog-access";
export { CatalogActivationGuard, COUNTRY_PUBLIC_SELF_CONTROLS } from "./catalog-activation-guard";
export { CatalogAdminService } from "./catalog-admin.service";
export { CatalogErrorCodes } from "./catalog-errors";
export { CatalogFlagAuditActions, CatalogFlagService } from "./catalog-flag.service";
