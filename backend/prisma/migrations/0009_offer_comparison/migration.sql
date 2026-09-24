ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "insurerName" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "guaranteeLevel" INTEGER;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "deductibleAmount" DECIMAL(65,30);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "coverageCeiling" DECIMAL(65,30);
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "processingDelayDays" INTEGER;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "paymentFlexibility" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "guarantees" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "exclusionsSummary" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "requiredDocuments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "sourceOfInformation" TEXT;

CREATE TYPE "ScoringRuleStatus" AS ENUM ('active', 'disabled');

CREATE TABLE IF NOT EXISTS "ScoringRule" (
  "id" TEXT NOT NULL,
  "countryId" TEXT,
  "productId" TEXT,
  "weights" JSONB NOT NULL,
  "status" "ScoringRuleStatus" NOT NULL DEFAULT 'active',
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "ScoringRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScoringRule_countryId_productId_status_idx" ON "ScoringRule"("countryId", "productId", "status");
