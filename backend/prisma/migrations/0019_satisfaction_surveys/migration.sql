-- CreateEnum
CREATE TYPE "SatisfactionSurveyStatus" AS ENUM ('queued', 'sent', 'submitted', 'skipped', 'expired');

-- AlterEnum
ALTER TYPE "ConsentPurpose" ADD VALUE 'service_quality_survey';

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN "surveyConsentRecordId" TEXT;

-- CreateTable
CREATE TABLE "SatisfactionSurveyRequest" (
    "id" TEXT NOT NULL,
    "publicReference" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "consentRecordId" TEXT NOT NULL,
    "triggerStatus" TEXT NOT NULL,
    "status" "SatisfactionSurveyStatus" NOT NULL DEFAULT 'queued',
    "skippedReason" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "comment" TEXT,
    "flaggedConcern" BOOLEAN NOT NULL DEFAULT false,
    "anonymizedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SatisfactionSurveyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurveyRequest_publicReference_key" ON "SatisfactionSurveyRequest"("publicReference");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurveyRequest_leadAssignmentId_key" ON "SatisfactionSurveyRequest"("leadAssignmentId");

-- CreateIndex
CREATE INDEX "SatisfactionSurveyRequest_partnerTenantId_status_idx" ON "SatisfactionSurveyRequest"("partnerTenantId", "status");

-- CreateIndex
CREATE INDEX "SatisfactionSurveyRequest_status_dueAt_idx" ON "SatisfactionSurveyRequest"("status", "dueAt");
