-- Spec 053: broker self-service requests (identity changes and coverage extensions) decided by the
-- admin. Additive: two new enums and one new table; no existing table or row is touched.
-- Numbered 0025 because 0023/0024 are prepared concurrently by other specs (renumbered at merge if needed).

-- CreateEnum (R3)
DO $$ BEGIN
  CREATE TYPE "PartnerChangeRequestType" AS ENUM ('profile_change', 'coverage_extension');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PartnerChangeRequestStatus" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable (R3)
CREATE TABLE IF NOT EXISTS "PartnerChangeRequest" (
    "id" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "type" "PartnerChangeRequestType" NOT NULL,
    "status" "PartnerChangeRequestStatus" NOT NULL DEFAULT 'pending',
    "requestedChanges" JSONB NOT NULL,
    "previousValues" JSONB NOT NULL DEFAULT '{}',
    "justification" TEXT NOT NULL,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerChangeRequest_partnerTenantId_status_idx" ON "PartnerChangeRequest"("partnerTenantId", "status");
CREATE INDEX IF NOT EXISTS "PartnerChangeRequest_status_createdAt_idx" ON "PartnerChangeRequest"("status", "createdAt");
