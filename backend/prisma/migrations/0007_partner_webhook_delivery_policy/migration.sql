CREATE TYPE "PartnerWebhookAllowlistStatus" AS ENUM ('active', 'revoked');

CREATE TABLE IF NOT EXISTS "PartnerWebhookAllowlistEntry" (
  "id" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "path" TEXT,
  "status" "PartnerWebhookAllowlistStatus" NOT NULL DEFAULT 'active',
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "PartnerWebhookAllowlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PartnerWebhookAllowlistEntry_partnerTenantId_status_idx" ON "PartnerWebhookAllowlistEntry"("partnerTenantId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerWebhookAllowlistEntry_partnerTenantId_origin_path_key" ON "PartnerWebhookAllowlistEntry"("partnerTenantId", "origin", "path");
