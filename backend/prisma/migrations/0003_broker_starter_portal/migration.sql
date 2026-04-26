ALTER TYPE "LeadAssignmentStatus" ADD VALUE 'seen';
ALTER TYPE "LeadAssignmentStatus" ADD VALUE 'accepted';

ALTER TABLE "LeadAssignment"
  ADD COLUMN "seenAt" TIMESTAMP(3),
  ADD COLUMN "seenById" TEXT,
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "disputedAt" TIMESTAMP(3),
  ADD COLUMN "actionReason" TEXT,
  ADD COLUMN "actionComment" TEXT,
  ADD COLUMN "lastBrokerActionById" TEXT;

CREATE TABLE "LeadActionHistory" (
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

CREATE INDEX "LeadActionHistory_leadAssignmentId_occurredAt_idx" ON "LeadActionHistory"("leadAssignmentId", "occurredAt");
CREATE INDEX "LeadActionHistory_partnerTenantId_occurredAt_idx" ON "LeadActionHistory"("partnerTenantId", "occurredAt");
