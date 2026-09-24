import {
  adminQuoteFormDefinitionListQuerySchema,
  type AdminQuoteFormDefinitionDto,
  type AdminQuoteFormDefinitionListQuery,
  type AdminQuoteFormDefinitionView
} from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../common/types";
import type { QuoteFormDefinitionRecord } from "./quote-form-definition.service";
import { QuoteFormDefinitionService } from "./quote-form-definition.service";

export class AdminQuoteFormDefinitionsController {
  constructor(private readonly forms: QuoteFormDefinitionService) {}

  async list(query: AdminQuoteFormDefinitionListQuery = {}): Promise<AdminQuoteFormDefinitionView[]> {
    const filters = adminQuoteFormDefinitionListQuerySchema.parse(query);
    const forms = await this.forms.list();
    return forms
      .filter((form) => !filters.countryId || form.countryId === filters.countryId)
      .filter((form) => !filters.productId || form.productId === filters.productId)
      .filter((form) => !filters.language || form.language === filters.language)
      .filter((form) => !filters.status || form.status === filters.status)
      .map((form) => this.toView(form));
  }

  async create(input: AdminQuoteFormDefinitionDto, actor: ActorContext): Promise<AdminQuoteFormDefinitionView> {
    return this.toView(await this.forms.create(input, actor));
  }

  async publish(id: string, actor: ActorContext): Promise<AdminQuoteFormDefinitionView> {
    return this.toView(await this.forms.publish(id, actor));
  }

  async retire(id: string, actor: ActorContext): Promise<AdminQuoteFormDefinitionView> {
    return this.toView(await this.forms.retire(id, actor));
  }

  private toView(form: QuoteFormDefinitionRecord): AdminQuoteFormDefinitionView {
    return {
      id: form.id,
      countryId: form.countryId,
      productId: form.productId,
      language: form.language,
      version: form.version,
      status: form.status,
      consentTextId: form.consentTextId,
      fieldCount: form.fields.length,
      ...(form.dataMinimizationNotes ? { dataMinimizationNotes: form.dataMinimizationNotes } : {}),
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined,
      retiredAt: form.retiredAt ? new Date(form.retiredAt).toISOString() : undefined,
      createdAt: new Date(form.createdAt).toISOString(),
      updatedAt: new Date(form.updatedAt).toISOString()
    };
  }
}
