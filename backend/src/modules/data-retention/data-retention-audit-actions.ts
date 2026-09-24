export const DataRetentionAuditActions = {
  policyChanged: "retention.policy.changed",
  batchPreviewed: "retention.batch.previewed",
  batchApproved: "retention.batch.approved",
  batchExecuted: "retention.batch.executed",
  batchRefused: "retention.batch.refused",
  accessRefused: "retention.access.refused",
  categoryAnonymized: "retention.category.anonymized"
} as const;

export type DataRetentionAuditAction = (typeof DataRetentionAuditActions)[keyof typeof DataRetentionAuditActions];
