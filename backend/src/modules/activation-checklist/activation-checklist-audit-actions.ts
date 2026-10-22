export const ActivationChecklistAuditActions = {
  read: "activation_checklist.read",
  refused: "activation_checklist.refused",
  attestationRead: "activation_attestation.read",
  attested: "activation_attestation.attested",
  revoked: "activation_attestation.revoked",
  attestationRefused: "activation_attestation.refused"
} as const;

export type ActivationChecklistAuditAction = (typeof ActivationChecklistAuditActions)[keyof typeof ActivationChecklistAuditActions];
