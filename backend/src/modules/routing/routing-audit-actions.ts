export const RoutingAuditActions = {
  ruleCreated: "routing_rule.created",
  ruleUpdated: "routing_rule.updated",
  ruleRefused: "routing_rule.refused",
  manualQueueRead: "routing.manual_queue.read",
  manualAssigned: "routing.manual_assigned",
  manualAssignmentRefused: "routing.manual_assignment_refused",
  reassigned: "routing.reassigned",
  reassignmentRefused: "routing.reassignment_refused"
} as const;
