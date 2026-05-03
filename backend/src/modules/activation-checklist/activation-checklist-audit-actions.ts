export const ActivationChecklistAuditActions = {
  read: "activation_checklist.read",
  refused: "activation_checklist.refused"
} as const;

export type ActivationChecklistAuditAction = (typeof ActivationChecklistAuditActions)[keyof typeof ActivationChecklistAuditActions];
