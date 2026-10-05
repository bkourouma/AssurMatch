-- Spec 052: offer versions, offer chosen by the visitor and its routing outcome.
-- Additive: new enum, new table, nullable or defaulted columns, new enum values. The only data
-- written is the version 1 backfill of every existing offer (R10); no existing column is rewritten
-- except the two new version pointers of "Offer".

-- AlterEnum (R9): in-app offer events also exist as notification types for later channels.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'offer_validated';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'offer_rejected';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'offer_suspended';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'offer_expiring';

-- CreateEnum (R2)
DO $$ BEGIN
  CREATE TYPE "OfferVersionStatus" AS ENUM ('draft', 'submitted', 'published', 'archived', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable (R1)
CREATE TABLE IF NOT EXISTS "OfferVersion" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "OfferVersionStatus" NOT NULL DEFAULT 'draft',
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "guaranteeSummary" TEXT,
    "exclusionsSummary" TEXT,
    "insurerName" TEXT,
    "guarantees" JSONB NOT NULL DEFAULT '[]',
    "guaranteeLevel" INTEGER,
    "deductibleAmount" DECIMAL(65,30),
    "coverageCeiling" DECIMAL(65,30),
    "processingDelayDays" INTEGER,
    "paymentFlexibility" TEXT,
    "requiredDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceOfInformation" TEXT,
    "indicativePriceMin" DECIMAL(65,30),
    "indicativePriceMax" DECIMAL(65,30),
    "currency" TEXT NOT NULL,
    "pricingUnit" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "publicDisclaimers" TEXT[],
    "isSponsored" BOOLEAN NOT NULL DEFAULT false,
    "sponsorLabel" TEXT,
    "displayPriority" INTEGER NOT NULL DEFAULT 0,
    "completenessScore" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT,
    "authorRole" TEXT NOT NULL DEFAULT 'admin',
    "submittedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "lastDecision" TEXT,
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OfferVersion_offerId_versionNumber_key" ON "OfferVersion"("offerId", "versionNumber");
CREATE INDEX IF NOT EXISTS "OfferVersion_offerId_status_idx" ON "OfferVersion"("offerId", "status");
CREATE INDEX IF NOT EXISTS "OfferVersion_status_submittedAt_idx" ON "OfferVersion"("status", "submittedAt");
-- FR-002: at most one published and one in-progress (draft or submitted) version per offer.
CREATE UNIQUE INDEX IF NOT EXISTS "OfferVersion_offerId_published_key" ON "OfferVersion"("offerId") WHERE "status" = 'published';
CREATE UNIQUE INDEX IF NOT EXISTS "OfferVersion_offerId_pending_key" ON "OfferVersion"("offerId") WHERE "status" IN ('draft', 'submitted');

-- AlterTable: version pointers, offer type, withdrawal (R1)
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "publishedVersionId" TEXT,
ADD COLUMN IF NOT EXISTS "pendingVersionId" TEXT,
ADD COLUMN IF NOT EXISTS "offerType" TEXT NOT NULL DEFAULT 'indicative',
ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3);

-- AlterTable: verified selected offer (R7)
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "selectedOfferOutcome" TEXT,
ADD COLUMN IF NOT EXISTS "selectedOfferIgnoredReason" TEXT;

-- AlterTable: routing decision records the chosen offer and the outcome (R7)
ALTER TABLE "RoutingDecision" ADD COLUMN IF NOT EXISTS "selectedOfferId" TEXT,
ADD COLUMN IF NOT EXISTS "selectedOfferOutcome" TEXT;

-- Backfill (R10): version 1 of every existing offer, published when the offer was validated and
-- active, draft otherwise. The id is derived from the offer id, so the statement is idempotent.
INSERT INTO "OfferVersion" (
    "id", "offerId", "versionNumber", "status", "name", "shortDescription", "guaranteeSummary",
    "exclusionsSummary", "insurerName", "guarantees", "guaranteeLevel", "deductibleAmount",
    "coverageCeiling", "processingDelayDays", "paymentFlexibility", "requiredDocuments",
    "sourceOfInformation", "indicativePriceMin", "indicativePriceMax", "currency", "pricingUnit",
    "validFrom", "validUntil", "publicDisclaimers", "isSponsored", "sponsorLabel", "displayPriority",
    "completenessScore", "authorId", "authorRole", "submittedAt", "decidedById", "decidedAt",
    "lastDecision", "decisionReason", "createdAt", "updatedAt"
)
SELECT
    md5('offer-version-1:' || o."id")::uuid::text,
    o."id",
    1,
    CASE WHEN o."validationStatus" = 'validated' AND o."status" IN ('active', 'validated')
      THEN 'published'::"OfferVersionStatus" ELSE 'draft'::"OfferVersionStatus" END,
    o."name", o."shortDescription", o."guaranteeSummary", o."exclusionsSummary", o."insurerName",
    o."guarantees", o."guaranteeLevel", o."deductibleAmount", o."coverageCeiling",
    o."processingDelayDays", o."paymentFlexibility", o."requiredDocuments", o."sourceOfInformation",
    o."indicativePriceMin", o."indicativePriceMax", o."currency", o."pricingUnit", o."validFrom",
    o."validUntil", o."publicDisclaimers", o."isSponsored", o."sponsorLabel", o."displayPriority",
    0,
    o."createdById",
    'admin',
    CASE WHEN o."validationStatus" = 'validated' AND o."status" IN ('active', 'validated') THEN o."validatedAt" END,
    CASE WHEN o."validationStatus" = 'validated' AND o."status" IN ('active', 'validated') THEN o."validatedById" END,
    CASE WHEN o."validationStatus" = 'validated' AND o."status" IN ('active', 'validated') THEN o."validatedAt" END,
    CASE WHEN o."validationStatus" = 'validated' AND o."status" IN ('active', 'validated') THEN 'validated' END,
    NULL,
    o."createdAt",
    o."updatedAt"
FROM "Offer" o
WHERE NOT EXISTS (SELECT 1 FROM "OfferVersion" v WHERE v."offerId" = o."id")
ON CONFLICT DO NOTHING;

-- Version pointers of the backfilled offers (only when not yet set).
UPDATE "Offer" o SET "publishedVersionId" = v."id"
FROM "OfferVersion" v
WHERE v."offerId" = o."id" AND v."status" = 'published' AND o."publishedVersionId" IS NULL;

UPDATE "Offer" o SET "pendingVersionId" = v."id"
FROM "OfferVersion" v
WHERE v."offerId" = o."id" AND v."status" IN ('draft', 'submitted') AND o."pendingVersionId" IS NULL;
