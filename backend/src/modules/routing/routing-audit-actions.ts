export const RoutingAuditActions = {
  ruleCreated: "routing_rule.created",
  ruleUpdated: "routing_rule.updated",
  ruleRefused: "routing_rule.refused",
  manualQueueRead: "routing.manual_queue.read",
  manualAssigned: "routing.manual_assigned",
  manualAssignmentRefused: "routing.manual_assignment_refused",
  reassigned: "routing.reassigned",
  reassignmentRefused: "routing.reassignment_refused",
  anomalyDetected: "routing.anomaly.detected",
  anomalyAnalysisRequested: "routing.anomaly.analysis_requested",
  anomalyAlertRaised: "routing.anomaly.alert_raised",
  // Lot 5 (spec 071) - controls 9-12, quota lock, AI-assisted routing (PRD 17, 31, 32.8).
  brokerDegraded: "routing.broker_degraded",
  leadQualityReview: "routing.lead_quality.manual_review",
  quotaLockTimeout: "routing.quota_lock.timeout",
  aiSuggestionGenerated: "routing.ai_suggestion.generated",
  aiSuggestionValidated: "routing.ai_suggestion.validated",
  aiSuggestionDiverged: "routing.ai_suggestion.diverged"
} as const;
