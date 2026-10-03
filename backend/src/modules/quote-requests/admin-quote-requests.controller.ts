import type { AdminQuoteRequestQuery } from "../../../../packages/shared/contracts/quote.contracts";
import { QuoteSubmissionService } from "./quote-submission.service";

/**
 * Raw listing kept for in-process callers. Spec 056 removed the former `review` method, which
 * changed the record in memory without persisting or auditing it: manual review now goes through
 * `AdminQuoteReviewService` (`POST /admin/operations/quote-requests/:id/review`).
 */
export class AdminQuoteRequestsController {
  constructor(private readonly submissions: QuoteSubmissionService) {}

  list(_query: Partial<AdminQuoteRequestQuery> = {}) {
    return this.submissions.list();
  }
}
