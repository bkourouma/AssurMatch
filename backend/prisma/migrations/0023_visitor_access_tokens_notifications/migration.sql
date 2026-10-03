-- Spec 054: visitor tracking space and notifications.
-- Additive: new enum values, one new table, two nullable columns and their indexes. No existing
-- row is rewritten; the tokens issued before this spec stay in "QuoteRequest"."verificationTokenHash"
-- and are accepted until their cutover date (R1).

-- AlterEnum (R4): one visitor notification type per public step, plus the tracking-link resend.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_quote_received';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_quote_in_review';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_quote_transmitted';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_quote_accepted';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_quote_reassigned';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_quote_closed';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_consent_withdrawn';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_tracking_link';

-- AlterTable (R3): persisted idempotency key and non-sensitive event data.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "eventPayload" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateTable (R1): hashed, expiring, revocable visitor access tokens.
CREATE TABLE IF NOT EXISTS "VisitorAccessToken" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'tracking',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VisitorAccessToken_tokenHash_key" ON "VisitorAccessToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "VisitorAccessToken_quoteRequestId_expiresAt_idx" ON "VisitorAccessToken"("quoteRequestId", "expiresAt");
