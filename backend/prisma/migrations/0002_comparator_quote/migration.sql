ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_quote_confirmation';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_quote_non_routable';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_lead_assigned';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'quote_notification_failed';

ALTER TYPE "QueueJobType" ADD VALUE IF NOT EXISTS 'visitor_quote_notification';
ALTER TYPE "QueueJobType" ADD VALUE IF NOT EXISTS 'broker_lead_notification';
ALTER TYPE "QueueJobType" ADD VALUE IF NOT EXISTS 'ai_quote_summary';
ALTER TYPE "QueueJobType" ADD VALUE IF NOT EXISTS 'quote_manual_review';

DO $$ BEGIN
  CREATE TYPE "OfferStatus" AS ENUM ('draft', 'review', 'validated', 'active', 'suspended', 'expired', 'retired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OfferValidationStatus" AS ENUM ('pending', 'validated', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "QuoteFormStatus" AS ENUM ('draft', 'published', 'suspended', 'retired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "QuoteRequestStatus" AS ENUM ('draft_refused', 'created', 'manual_review', 'routed', 'non_routable', 'duplicate', 'spam_blocked', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RoutingStatus" AS ENUM ('not_started', 'eligible', 'assigned', 'blocked', 'no_broker_available', 'manual_review_required');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DuplicateStatus" AS ENUM ('not_checked', 'unique', 'possible_duplicate', 'blocked_duplicate');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeadAssignmentStatus" AS ENUM ('assigned', 'broker_notified', 'received', 'contacted', 'rejected', 'closed', 'disputed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Offer" (
  "id" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "partnerTenantId" TEXT,
  "publicKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortDescription" TEXT,
  "guaranteeSummary" TEXT,
  "indicativePriceMin" DECIMAL(65,30),
  "indicativePriceMax" DECIMAL(65,30),
  "currency" TEXT NOT NULL,
  "pricingUnit" TEXT,
  "status" "OfferStatus" NOT NULL DEFAULT 'draft',
  "validationStatus" "OfferValidationStatus" NOT NULL DEFAULT 'pending',
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "isSponsored" BOOLEAN NOT NULL DEFAULT false,
  "sponsorLabel" TEXT,
  "displayPriority" INTEGER NOT NULL DEFAULT 0,
  "publicDisclaimers" TEXT[],
  "validatedById" TEXT,
  "validatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Offer_countryId_productId_publicKey_key" ON "Offer"("countryId", "productId", "publicKey");
CREATE INDEX IF NOT EXISTS "Offer_countryId_productId_status_validationStatus_validFrom_validUntil_idx" ON "Offer"("countryId", "productId", "status", "validationStatus", "validFrom", "validUntil");

CREATE TABLE IF NOT EXISTS "OfferHistory" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "changedById" TEXT,
  "changeType" TEXT NOT NULL,
  "previousValue" JSONB,
  "nextValue" JSONB,
  "reason" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfferHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OfferHistory_offerId_changedAt_idx" ON "OfferHistory"("offerId", "changedAt");

CREATE TABLE IF NOT EXISTS "QuoteFormDefinition" (
  "id" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" "QuoteFormStatus" NOT NULL DEFAULT 'draft',
  "fields" JSONB NOT NULL,
  "validationSchema" JSONB,
  "consentTextId" TEXT NOT NULL,
  "dataMinimizationNotes" TEXT,
  "publishedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "QuoteFormDefinition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuoteFormDefinition_countryId_productId_language_status_version_idx" ON "QuoteFormDefinition"("countryId", "productId", "language", "status", "version");

CREATE TABLE IF NOT EXISTS "Prospect" (
  "id" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "emailNormalized" TEXT,
  "phoneNormalized" TEXT,
  "emailFingerprint" TEXT,
  "phoneFingerprint" TEXT,
  "displayName" TEXT,
  "preferredContactChannel" TEXT,
  "consentRecordIds" TEXT[],
  "retentionUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Prospect_countryId_productId_emailFingerprint_phoneFingerprint_createdAt_idx" ON "Prospect"("countryId", "productId", "emailFingerprint", "phoneFingerprint", "createdAt");

CREATE TABLE IF NOT EXISTS "QuoteRequest" (
  "id" TEXT NOT NULL,
  "publicReference" TEXT NOT NULL,
  "verificationTokenHash" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "selectedOfferId" TEXT,
  "quoteFormDefinitionId" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "consentRecordId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "QuoteRequestStatus" NOT NULL DEFAULT 'created',
  "duplicateStatus" "DuplicateStatus" NOT NULL DEFAULT 'not_checked',
  "routingStatus" "RoutingStatus" NOT NULL DEFAULT 'not_started',
  "refusalReason" TEXT,
  "manualReviewReason" TEXT,
  "correlationId" TEXT,
  "retentionUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QuoteRequest_publicReference_key" ON "QuoteRequest"("publicReference");
CREATE INDEX IF NOT EXISTS "QuoteRequest_countryId_productId_status_routingStatus_createdAt_idx" ON "QuoteRequest"("countryId", "productId", "status", "routingStatus", "createdAt");

CREATE TABLE IF NOT EXISTS "LeadAssignment" (
  "id" TEXT NOT NULL,
  "quoteRequestId" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "status" "LeadAssignmentStatus" NOT NULL DEFAULT 'assigned',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignmentReason" TEXT NOT NULL,
  "routingDecisionId" TEXT,
  "brokerNotificationId" TEXT,
  "lastBrokerActionAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeadAssignment_quoteRequestId_key" ON "LeadAssignment"("quoteRequestId");
CREATE INDEX IF NOT EXISTS "LeadAssignment_partnerTenantId_status_assignedAt_idx" ON "LeadAssignment"("partnerTenantId", "status", "assignedAt");

CREATE TABLE IF NOT EXISTS "RoutingDecision" (
  "id" TEXT NOT NULL,
  "quoteRequestId" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "selectedPartnerTenantId" TEXT,
  "candidateCount" INTEGER NOT NULL,
  "excludedCandidates" JSONB NOT NULL,
  "reasons" TEXT[],
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoutingDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RoutingDecision_quoteRequestId_createdAt_idx" ON "RoutingDecision"("quoteRequestId", "createdAt");

CREATE TABLE IF NOT EXISTS "QuoteAISummary" (
  "id" TEXT NOT NULL,
  "quoteRequestId" TEXT NOT NULL,
  "aiInteractionId" TEXT,
  "summaryReference" TEXT,
  "guardrailResult" TEXT NOT NULL,
  "humanValidationStatus" "HumanValidationStatus" NOT NULL DEFAULT 'not_required',
  "visibleToBroker" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteAISummary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuoteAISummary_quoteRequestId_idx" ON "QuoteAISummary"("quoteRequestId");
