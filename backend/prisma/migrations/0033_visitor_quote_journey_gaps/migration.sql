-- Spec 067 (lot 1): visitor quote journey gaps. Additive only: one notification type and nullable or
-- defaulted columns. No existing row is rewritten and nothing is dropped.

-- AlterEnum: single reminder of a document request that stayed open for 3 days.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_documents_reminder';

-- AlterTable: COMP-009 (further offers), H2 (broker chosen directly), declarative marketing source.
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "additionalOfferIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "chosenPartnerTenantId" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "marketingSource" JSONB;

-- AlterTable: the reminder is queued at most once per document request.
ALTER TABLE "LeadDocumentRequest" ADD COLUMN IF NOT EXISTS "reminderQueuedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "LeadDocumentRequest_status_createdAt_idx" ON "LeadDocumentRequest"("status", "createdAt");
