-- Spec 056: admin operations consoles.
-- Additive and idempotent: no column is dropped or rewritten, no data is moved.

-- Persisted manual-review decision on a quote request.
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "duplicateOfQuoteRequestId" TEXT;
CREATE INDEX IF NOT EXISTS "QuoteRequest_duplicateOfQuoteRequestId_idx" ON "QuoteRequest"("duplicateOfQuoteRequestId");

-- Contact inbox status handling.
ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "handledAt" TIMESTAMP(3);
ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "handledById" TEXT;
ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "statusReason" TEXT;

-- Audit-log search indexes (actor, action prefix, target, period).
CREATE INDEX IF NOT EXISTS "AuditLog_occurredAt_idx" ON "AuditLog"("occurredAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_occurredAt_idx" ON "AuditLog"("action", "occurredAt");
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_occurredAt_idx" ON "AuditLog"("actorId", "occurredAt");
