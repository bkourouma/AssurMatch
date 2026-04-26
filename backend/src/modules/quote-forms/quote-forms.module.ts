import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AdminQuoteFormDefinitionsController } from "./admin-quote-form-definitions.controller";
import { PublicQuoteFormsController } from "./public-quote-forms.controller";
import { QuoteFormDefinitionService, type ConsentTextReference } from "./quote-form-definition.service";

export class QuoteFormsModule {
  readonly service: QuoteFormDefinitionService;
  readonly adminController: AdminQuoteFormDefinitionsController;
  readonly publicController: PublicQuoteFormsController;

  constructor(audit = new AuditLogWriter(), consentTexts: () => ConsentTextReference[] | Promise<ConsentTextReference[]> = () => []) {
    this.service = new QuoteFormDefinitionService(audit, consentTexts);
    this.adminController = new AdminQuoteFormDefinitionsController(this.service);
    this.publicController = new PublicQuoteFormsController(this.service);
  }
}
