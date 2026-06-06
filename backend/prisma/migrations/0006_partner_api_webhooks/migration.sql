CREATE TYPE "PartnerApiKeyStatus" AS ENUM ('active', 'revoked');
CREATE TYPE "PartnerWebhookEndpointStatus" AS ENUM ('disabled', 'active', 'suspended');
CREATE TYPE "PartnerWebhookDeliveryStatus" AS ENUM ('skipped', 'pending', 'retryable', 'delivered', 'failed', 'dead_letter');
CREATE TYPE "PartnerWebhookEventType" AS ENUM ('lead_assigned', 'lead_status_changed', 'notification_failed');

CREATE TABLE IF NOT EXISTS "PartnerApiKey" (
  "id" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "PartnerApiKeyStatus" NOT NULL DEFAULT 'active',
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "PartnerApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PartnerWebhookEndpoint" (
  "id" TEXT NOT NULL,
  "partnerTenantId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "description" TEXT,
  "eventTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "PartnerWebhookEndpointStatus" NOT NULL DEFAULT 'disabled',
  "secretEncrypted" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "PartnerWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PartnerWebhookDelivery" (
  "id" TEXT NOT NULL,
  "endpointId" TEXT,
  "partnerTenantId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadMetadata" JSONB NOT NULL,
  "status" "PartnerWebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastResponseClass" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerApiKey_keyPrefix_key" ON "PartnerApiKey"("keyPrefix");
CREATE INDEX IF NOT EXISTS "PartnerApiKey_partnerTenantId_status_idx" ON "PartnerApiKey"("partnerTenantId", "status");
CREATE INDEX IF NOT EXISTS "PartnerWebhookEndpoint_partnerTenantId_status_idx" ON "PartnerWebhookEndpoint"("partnerTenantId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerWebhookDelivery_idempotencyKey_key" ON "PartnerWebhookDelivery"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "PartnerWebhookDelivery_partnerTenantId_eventType_createdAt_idx" ON "PartnerWebhookDelivery"("partnerTenantId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerWebhookDelivery_endpointId_status_nextAttemptAt_idx" ON "PartnerWebhookDelivery"("endpointId", "status", "nextAttemptAt");
