-- Public-site forms: waitlist, broker application and contact message.
-- Every table stores a normalized contact plus its fingerprint (deduplication) and an IP hash,
-- never a raw IP, and carries an explicit retention horizon.

-- CreateEnum
CREATE TYPE "WaitlistEntryStatus" AS ENUM ('active', 'unsubscribed', 'notified');

-- CreateEnum
CREATE TYPE "PartnerApplicationStatus" AS ENUM ('received', 'under_review', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "ContactAudience" AS ENUM ('visitor', 'broker', 'insurer', 'press');

-- CreateEnum
CREATE TYPE "ContactMessageStatus" AS ENUM ('new', 'handled', 'spam');

CREATE TABLE IF NOT EXISTS "WaitlistEntry" (
  "id" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "productId" TEXT,
  "emailNormalized" TEXT NOT NULL,
  "emailFingerprint" TEXT NOT NULL,
  "consentVersion" TEXT NOT NULL,
  "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'active',
  "ipHash" TEXT,
  "source" TEXT NOT NULL DEFAULT 'public_web',
  "retentionUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- One subscription per country and per address; re-posting the same address is ignored, not stacked.
CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistEntry_countryId_emailFingerprint_key" ON "WaitlistEntry"("countryId", "emailFingerprint");
CREATE INDEX IF NOT EXISTS "WaitlistEntry_countryId_status_createdAt_idx" ON "WaitlistEntry"("countryId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "PartnerApplication" (
  "id" TEXT NOT NULL,
  "publicReference" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "tradeName" TEXT,
  "licenseNumber" TEXT NOT NULL,
  "licenseIssuingAuthority" TEXT,
  "licenseExpiresAt" TIMESTAMP(3) NOT NULL,
  "productIds" TEXT[] NOT NULL DEFAULT '{}',
  "monthlyCapacity" INTEGER NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactEmailNormalized" TEXT NOT NULL,
  "contactEmailFingerprint" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "whatsapp" TEXT,
  "desiredPlan" "PartnerPlan" NOT NULL DEFAULT 'starter',
  "message" TEXT,
  "consentVersion" TEXT NOT NULL,
  "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'received',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "partnerTenantId" TEXT,
  "ipHash" TEXT,
  "retentionUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerApplication_publicReference_key" ON "PartnerApplication"("publicReference");
-- The same broker re-applying for the same country and licence is a duplicate, not a new file.
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerApplication_countryId_contactEmailFingerprint_licenseNumber_key" ON "PartnerApplication"("countryId", "contactEmailFingerprint", "licenseNumber");
CREATE INDEX IF NOT EXISTS "PartnerApplication_status_createdAt_idx" ON "PartnerApplication"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "ContactMessage" (
  "id" TEXT NOT NULL,
  "publicReference" TEXT NOT NULL,
  "audience" "ContactAudience" NOT NULL DEFAULT 'visitor',
  "name" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "emailFingerprint" TEXT NOT NULL,
  "phone" TEXT,
  "countryId" TEXT,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "consentVersion" TEXT NOT NULL,
  "status" "ContactMessageStatus" NOT NULL DEFAULT 'new',
  "ipHash" TEXT,
  "retentionUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactMessage_publicReference_key" ON "ContactMessage"("publicReference");
CREATE INDEX IF NOT EXISTS "ContactMessage_audience_status_createdAt_idx" ON "ContactMessage"("audience", "status", "createdAt");

-- The public partner directory shows where a broker operates.
ALTER TABLE "PartnerTenant" ADD COLUMN IF NOT EXISTS "city" TEXT;
