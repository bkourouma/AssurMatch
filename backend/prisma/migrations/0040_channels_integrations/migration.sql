-- Spec 076 (lot 10): SMS / WhatsApp retry outbox and generic outbound CRM connector.
-- Additive only: three new tables, nothing is altered, rewritten or dropped.

-- CreateTable: message waiting for a (re)try; recipient and body encrypted, wiped at terminal status.
CREATE TABLE IF NOT EXISTS "ChannelOutbox" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "partnerTenantId" TEXT,
    "template" TEXT NOT NULL,
    "recipientEncrypted" TEXT NOT NULL,
    "bodyEncrypted" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'retryable',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastErrorClass" TEXT,
    "providerMessageId" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChannelOutbox_status_nextAttemptAt_idx" ON "ChannelOutbox"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "ChannelOutbox_partnerTenantId_createdAt_idx" ON "ChannelOutbox"("partnerTenantId", "createdAt");

-- CreateTable: one outbound CRM connector per partner, disabled by default.
CREATE TABLE IF NOT EXISTS "CrmConnector" (
    "id" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'disabled',
    "secretEncrypted" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "authHeaderName" TEXT,
    "authHeaderValueEncrypted" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmConnector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmConnector_partnerTenantId_key" ON "CrmConnector"("partnerTenantId");

-- CreateTable: one outbound CRM call (minimised body, encrypted at rest).
CREATE TABLE IF NOT EXISTS "CrmConnectorDelivery" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadEncrypted" TEXT NOT NULL,
    "payloadMetadata" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastResponseClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmConnectorDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmConnectorDelivery_idempotencyKey_key" ON "CrmConnectorDelivery"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "CrmConnectorDelivery_connectorId_status_nextAttemptAt_idx" ON "CrmConnectorDelivery"("connectorId", "status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "CrmConnectorDelivery_partnerTenantId_createdAt_idx" ON "CrmConnectorDelivery"("partnerTenantId", "createdAt");
