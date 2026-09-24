CREATE TABLE IF NOT EXISTS "PartnerAgency" (
  "id" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "city" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "memberIds" JSONB NOT NULL DEFAULT '[]',
  "reason" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerAgency_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PartnerAgency_partnerTenantId_idx" ON "PartnerAgency"("partnerTenantId");

CREATE TABLE IF NOT EXISTS "PartnerCustomRole" (
  "id" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "permissions" JSONB NOT NULL DEFAULT '[]',
  "reason" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerCustomRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerCustomRole_partnerTenantId_name_key" ON "PartnerCustomRole"("partnerTenantId", "name");

CREATE TABLE IF NOT EXISTS "PartnerBranding" (
  "id" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "displayLabel" TEXT NOT NULL,
  "primaryColor" TEXT NOT NULL,
  "firstActionTargetMinutes" INTEGER NOT NULL DEFAULT 240,
  "reason" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerBranding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerBranding_partnerTenantId_key" ON "PartnerBranding"("partnerTenantId");
