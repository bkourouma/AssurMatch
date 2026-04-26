ALTER TYPE "LeadAssignmentStatus" ADD VALUE IF NOT EXISTS 'seen';
ALTER TYPE "LeadAssignmentStatus" ADD VALUE IF NOT EXISTS 'accepted';

ALTER TABLE "LeadAssignment"
  ADD COLUMN IF NOT EXISTS "seenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "seenById" TEXT,
  ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disputedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "actionComment" TEXT,
  ADD COLUMN IF NOT EXISTS "lastBrokerActionById" TEXT;

CREATE TABLE IF NOT EXISTS "LeadActionHistory" (
  "id" TEXT NOT NULL,
  "leadAssignmentId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "actorId" TEXT,
  "eventType" TEXT NOT NULL,
  "previousStatus" TEXT,
  "nextStatus" TEXT,
  "reason" TEXT,
  "comment" TEXT,
  "context" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeadActionHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadActionHistory_leadAssignmentId_occurredAt_idx" ON "LeadActionHistory"("leadAssignmentId", "occurredAt");
CREATE INDEX IF NOT EXISTS "LeadActionHistory_partnerTenantId_occurredAt_idx" ON "LeadActionHistory"("partnerTenantId", "occurredAt");
