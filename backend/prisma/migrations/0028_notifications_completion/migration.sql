-- Spec 061: remaining broker/admin notifications, scheduled expiry reminders, admin alerts center,
-- worker liveness and the satisfaction survey opt-out. Additive only: no existing row is rewritten.

-- AlterEnum (FR-002): broker notification types and the compliance team pointer e-mail.
-- `broker_document_received` was already queued by the code (visitor documents) but missing here.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_document_received';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_lead_reassigned';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_task_due';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_quota_threshold';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_license_expiring';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_offer_expiring';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'admin_alert_raised';

-- CreateTable (FR-004): admin alerts center, one row per condition and day at most.
CREATE TABLE IF NOT EXISTS "AdminAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "conditionKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "countryId" TEXT,
    "partnerTenantId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "acknowledgeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminAlert_dedupeKey_key" ON "AdminAlert"("dedupeKey");
CREATE INDEX IF NOT EXISTS "AdminAlert_status_lastSeenAt_idx" ON "AdminAlert"("status", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "AdminAlert_conditionKey_status_idx" ON "AdminAlert"("conditionKey", "status");

-- CreateTable: liveness of the spec 057 worker, read by the alerts center.
CREATE TABLE IF NOT EXISTS "WorkerHeartbeat" (
    "name" TEXT NOT NULL,
    "lastBeatAt" TIMESTAMP(3) NOT NULL,
    "cycles" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("name")
);

-- CreateTable (FR-005): opt-out of non-transactional messages, hashed address only.
CREATE TABLE IF NOT EXISTS "NotificationUnsubscribe" (
    "id" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationUnsubscribe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationUnsubscribe_subjectHash_purpose_key" ON "NotificationUnsubscribe"("subjectHash", "purpose");
