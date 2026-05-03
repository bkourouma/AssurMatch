export const AIAssistanceAuditActions = {
  statusRead: "ai_assistance.status.read",
  statusRefused: "ai_assistance.status.refused"
} as const;

export type AIAssistanceAuditAction = (typeof AIAssistanceAuditActions)[keyof typeof AIAssistanceAuditActions];
