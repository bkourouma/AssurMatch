export const AiAuditActions = {
  queued: "ai.interaction.queued",
  completed: "ai.interaction.completed",
  refused: "ai.interaction.refused",
  failedFallback: "ai.interaction.failed_fallback",
  read: "ai.interaction.read",
  validated: "ai.interaction.validated",
  quotaExceeded: "ai.quota.exceeded",
  partnerOptOutChanged: "ai.partner_opt_out.changed"
} as const;
