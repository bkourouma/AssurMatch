-- Spec 051: partner onboarding and lifecycle (statuses, licence history, persisted accreditation
-- documents, partnership contract, withdrawable coverage, application decisions).
-- Additive only: new enum values, nullable or defaulted columns and new tables. No existing row is
-- rewritten: stored `active` partners stay "Actif public".

-- AlterEnum (R1, R4, R5)
ALTER TYPE "PartnerStatus" ADD VALUE IF NOT EXISTS 'active_test';
ALTER TYPE "LicenseStatus" ADD VALUE IF NOT EXISTS 'superseded';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'partnership_contract';

-- CreateEnum (R5)
DO $$ BEGIN
  CREATE TYPE "AccreditationScanStatus" AS ENUM ('pending', 'clean', 'infected', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: partner identity, contacts, insurers, contractual SLA, lifecycle (R8)
ALTER TABLE "PartnerTenant" ADD COLUMN IF NOT EXISTS "countryId" TEXT,
ADD COLUMN IF NOT EXISTS "adminContactName" TEXT,
ADD COLUMN IF NOT EXISTS "adminContactEmail" TEXT,
ADD COLUMN IF NOT EXISTS "adminContactPhone" TEXT,
ADD COLUMN IF NOT EXISTS "commercialContactName" TEXT,
ADD COLUMN IF NOT EXISTS "commercialContactEmail" TEXT,
ADD COLUMN IF NOT EXISTS "commercialContactPhone" TEXT,
ADD COLUMN IF NOT EXISTS "partnerInsurers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "slaTargetMinutes" INTEGER,
ADD COLUMN IF NOT EXISTS "statusReason" TEXT,
ADD COLUMN IF NOT EXISTS "previousActiveStatus" "PartnerStatus";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerTenant_countryId_status_idx" ON "PartnerTenant"("countryId", "status");

-- FR-002: one registration number per country. Partial, so partners without a country or a
-- registration number (every row stored before this spec) are never compared.
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerTenant_countryId_registrationNumber_key" ON "PartnerTenant"("countryId", "registrationNumber") WHERE "countryId" IS NOT NULL AND "registrationNumber" IS NOT NULL;

-- CreateTable (R2)
CREATE TABLE IF NOT EXISTS "PartnerStatusHistory" (
    "id" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "fromStatus" "PartnerStatus",
    "toStatus" "PartnerStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PartnerStatusHistory_partnerTenantId_createdAt_idx" ON "PartnerStatusHistory"("partnerTenantId", "createdAt");

-- AlterTable: licence status reason and renewal link (R4)
ALTER TABLE "PartnerLicense" ADD COLUMN IF NOT EXISTS "statusReason" TEXT,
ADD COLUMN IF NOT EXISTS "renewsLicenseId" TEXT;

-- CreateTable (R4)
CREATE TABLE IF NOT EXISTS "PartnerLicenseHistory" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "fromStatus" "LicenseStatus",
    "toStatus" "LicenseStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerLicenseHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PartnerLicenseHistory_licenseId_createdAt_idx" ON "PartnerLicenseHistory"("licenseId", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerLicenseHistory_partnerTenantId_createdAt_idx" ON "PartnerLicenseHistory"("partnerTenantId", "createdAt");

-- AlterTable: uploaded file metadata, antivirus verdict, review reason (R5)
ALTER TABLE "AccreditationDocument" ADD COLUMN IF NOT EXISTS "fileName" TEXT,
ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER,
ADD COLUMN IF NOT EXISTS "scanStatus" "AccreditationScanStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS "scanEngine" TEXT,
ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reviewReason" TEXT;

-- CreateTable (R6)
CREATE TABLE IF NOT EXISTS "PartnerContract" (
    "id" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "signatoryName" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerContract_partnerTenantId_version_key" ON "PartnerContract"("partnerTenantId", "version");

-- AlterTable: withdrawable coverage (R7)
ALTER TABLE "PartnerCountryAuthorization" ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "withdrawalReason" TEXT;
ALTER TABLE "PartnerProductAuthorization" ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "withdrawalReason" TEXT;

-- AlterTable: application decision (R10)
ALTER TABLE "PartnerApplication" ADD COLUMN IF NOT EXISTS "rejectionReasonCode" TEXT,
ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'fr',
ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3);
