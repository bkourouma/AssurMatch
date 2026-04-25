import { adminReviewStatusUpdateSchema, type AdminQuoteRequestQuery } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../common/types";
import { QuoteSubmissionService } from "./quote-submission.service";

export class AdminQuoteRequestsController {
  constructor(private readonly submissions: QuoteSubmissionService) {}

  list(_query: Partial<AdminQuoteRequestQuery> = {}) {
    return this.submissions.list();
  }

  review(id: string, input: unknown, _actor: ActorContext) {
    const parsed = adminReviewStatusUpdateSchema.parse(input);
    const quote = this.submissions.list().find((candidate) => candidate.id === id);
    if (!quote) throw new Error(`Quote request ${id} not found`);
    quote.status = parsed.status;
    quote.refusalReason = parsed.reason;
    quote.updatedAt = new Date();
    return quote;
  }
}
