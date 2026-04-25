import { assertNoHeavyPublicSynchronousWork } from "../common/interceptors/async-boundary.interceptor";
import { QuoteSubmissionService } from "./quote-submission.service";

export class PublicQuoteStatusController {
  constructor(private readonly submissions: QuoteSubmissionService) {}

  get(publicReference: string, token: string) {
    assertNoHeavyPublicSynchronousWork({ publicEndpoint: true, heavySynchronousWork: false });
    return this.submissions.status(publicReference, token);
  }
}
