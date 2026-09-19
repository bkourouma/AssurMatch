import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AdminQuoteFormDefinitionsController } from "./admin-quote-form-definitions.controller";
import { PublicQuoteFormsController } from "./public-quote-forms.controller";
import { QuoteFormDefinitionService, type ConsentTextReference } from "./quote-form-definition.service";
import { MemoryQuoteFormDefinitionsRepository, type QuoteFormDefinitionsRepository } from "./quote-form-definitions.repository";

export interface QuoteFormsModuleOptions {
  consentTexts?: () => ConsentTextReference[] | Promise<ConsentTextReference[]>;
  repository?: QuoteFormDefinitionsRepository;
  /** Spec 043 D3: a definition with sensitive fields stays unpublishable while the product flag is closed. */
  sensitiveDataEnabled?: (productId: string) => boolean;
}

export class QuoteFormsModule {
  readonly service: QuoteFormDefinitionService;
  readonly adminController: AdminQuoteFormDefinitionsController;
  readonly publicController: PublicQuoteFormsController;

  constructor(audit = new AuditLogWriter(), options: QuoteFormsModuleOptions = {}) {
    this.service = new QuoteFormDefinitionService(
      audit,
      options.consentTexts ?? (() => []),
      options.repository ?? new MemoryQuoteFormDefinitionsRepository(),
      options.sensitiveDataEnabled ?? (() => false)
    );
    this.adminController = new AdminQuoteFormDefinitionsController(this.service);
    this.publicController = new PublicQuoteFormsController(this.service);
  }
}
