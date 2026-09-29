export const SatisfactionAuditActions = {
  satisfactionSurveyQueued: "satisfaction_survey.queued",
  satisfactionSurveySent: "satisfaction_survey.sent",
  satisfactionSurveySkipped: "satisfaction_survey.skipped",
  satisfactionSurveyLinkInvalid: "satisfaction_survey.link_invalid",
  satisfactionSurveySubmitted: "satisfaction_survey.submitted",
  satisfactionSurveyConcernFlagged: "satisfaction_survey.concern_flagged"
} as const;

export type SatisfactionAuditAction = (typeof SatisfactionAuditActions)[keyof typeof SatisfactionAuditActions];
