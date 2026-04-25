import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import { assertNoHeavyPublicSynchronousWork } from "../common/interceptors/async-boundary.interceptor";
import type { ActorContext } from "../common/types";
import { QuoteSubmissionService } from "./quote-submission.service";

export class PublicQuoteRequestsController {
  constructor(private readonly submissions: QuoteSubmissionService) {}

  submit(input: QuoteRequestCreateDto, actor: ActorContext) {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.submissions.submit(input, actor);
  }
}
