CREATE TABLE IF NOT EXISTS "MessagingDelivery" (
  "id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "recipientMasked" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "partnerTenantId" TEXT,
  "scopeId" TEXT NOT NULL,
  "reason" TEXT,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessagingDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MessagingDelivery_channel_createdAt_idx" ON "MessagingDelivery"("channel", "createdAt");
CREATE INDEX IF NOT EXISTS "MessagingDelivery_partnerTenantId_createdAt_idx" ON "MessagingDelivery"("partnerTenantId", "createdAt");

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "sms" BOOLEAN NOT NULL DEFAULT FALSE,
  "whatsapp" BOOLEAN NOT NULL DEFAULT FALSE,
  "reason" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_scopeId_key" ON "NotificationPreference"("scopeId");

CREATE TABLE IF NOT EXISTS "InAppNotification" (
  "id" TEXT NOT NULL,
  "recipientScopeId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InAppNotification_recipientScopeId_createdAt_idx" ON "InAppNotification"("recipientScopeId", "createdAt");
