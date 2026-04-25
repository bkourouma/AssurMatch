import type { AdminQuoteFormDefinitionDto } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../common/types";
import { QuoteFormDefinitionService } from "./quote-form-definition.service";

export class AdminQuoteFormDefinitionsController {
  constructor(private readonly forms: QuoteFormDefinitionService) {}

  list() {
    return this.forms.list();
  }

  create(input: AdminQuoteFormDefinitionDto, actor: ActorContext) {
    return this.forms.create(input, actor);
  }

  publish(id: string, actor: ActorContext) {
    return this.forms.publish(id, actor);
  }
}
