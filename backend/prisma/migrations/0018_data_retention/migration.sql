-- Data retention and anonymization (spec 046).
-- Adds the retention policy overrides, the anonymization batch (the durable proof: who, when, why,
-- which ids - never an e-mail, a phone number or a fingerprint), the `anonymizedAt` /
-- `anonymizationBatchId` markers on the six rows that model a person, and `Country.publicSince`,
-- which anchors the waiting-list retention. ConsentRecord and AuditLog are deliberately untouched.

-- CreateEnum
CREATE TYPE "AnonymizationBatchKind" AS ENUM ('retention', 'erasure');

-- CreateEnum
CREATE TYPE "AnonymizationBatchStatus" AS ENUM ('previewed', 'executed', 'refused', 'expired', 'interrupted');

-- AlterTable
ALTER TABLE "Country" ADD COLUMN IF NOT EXISTS "publicSince" TIMESTAMP(3);

-- Countries already public get their first opening approximated by their last update.
UPDATE "Country" SET "publicSince" = "updatedAt" WHERE "status" = 'public' AND "publicSince" IS NULL;

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "anonymizationBatchId" TEXT;

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "anonymizationBatchId" TEXT;

-- AlterTable
ALTER TABLE "QuoteRequestDocument" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "anonymizationBatchId" TEXT;

-- AlterTable
ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "anonymizationBatchId" TEXT;

-- AlterTable
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "anonymizationBatchId" TEXT;

-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "anonymizationBatchId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "countryId" TEXT,
    "category" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RetentionPolicy_countryId_category_key" ON "RetentionPolicy"("countryId", "category");

-- PostgreSQL treats NULLs as distinct in the index above, so the global override (countryId NULL)
-- needs its own partial unique index: at most one global override per category.
CREATE UNIQUE INDEX IF NOT EXISTS "RetentionPolicy_global_category_key" ON "RetentionPolicy"("category") WHERE "countryId" IS NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AnonymizationBatch" (
    "id" TEXT NOT NULL,
    "kind" "AnonymizationBatchKind" NOT NULL,
    "status" "AnonymizationBatchStatus" NOT NULL DEFAULT 'previewed',
    "countryId" TEXT,
    "categories" TEXT[],
    "erasureLookup" TEXT,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvalReason" TEXT,
    "targets" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "previewExpiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnonymizationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnonymizationBatch_status_createdAt_idx" ON "AnonymizationBatch"("status", "createdAt");
