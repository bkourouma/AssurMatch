import { SatisfactionSurveysService, type SurveySubmissionInput } from "./satisfaction-surveys.service";

export class SatisfactionSurveysController {
  constructor(private readonly service: SatisfactionSurveysService) {}

  async checkStatus(publicReference: string, token?: string) {
    return this.service.checkStatus(publicReference, token);
  }

  async submit(publicReference: string, token: string | undefined, body: SurveySubmissionInput, ipAddress?: string) {
    return this.service.submit(publicReference, token, body, ipAddress);
  }
}
