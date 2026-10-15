-- Spec 063: critical fixes (trusted MFA devices, lead disputes with finance decision, partial credit notes).
-- Additive only: no column is dropped, no existing row is rewritten.

-- A. Trusted devices: 30-day MFA exemption per device. Only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS "TrustedDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");
CREATE INDEX IF NOT EXISTS "TrustedDevice_userId_revokedAt_idx" ON "TrustedDevice"("userId", "revokedAt");

-- B. Lead disputes: source, country and the finance decision (accept | reject) with its reason.
ALTER TABLE "BrokerCrmDispute" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'crm';
ALTER TABLE "BrokerCrmDispute" ADD COLUMN IF NOT EXISTS "countryCode" TEXT;
ALTER TABLE "BrokerCrmDispute" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3);
ALTER TABLE "BrokerCrmDispute" ADD COLUMN IF NOT EXISTS "decidedById" TEXT;
ALTER TABLE "BrokerCrmDispute" ADD COLUMN IF NOT EXISTS "decisionReason" TEXT;
ALTER TABLE "BrokerCrmDispute" ADD COLUMN IF NOT EXISTS "creditMode" TEXT;
ALTER TABLE "BrokerCrmDispute" ADD COLUMN IF NOT EXISTS "creditNoteId" TEXT;
ALTER TABLE "BrokerCrmDispute" ADD COLUMN IF NOT EXISTS "creditAmount" INTEGER;
CREATE INDEX IF NOT EXISTS "BrokerCrmDispute_status_createdAt_idx" ON "BrokerCrmDispute"("status", "createdAt");
-- Note: "one dispute per lead" (D-B1) is enforced by the service, not by a unique index, because rows
-- written before this migration may already hold several disputes for the same lead.

-- B. Partial credit notes: a dispute credit note can sit next to the cancellation one of an invoice.
ALTER TABLE "CreditNote" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'cancellation';
ALTER TABLE "CreditNote" ADD COLUMN IF NOT EXISTS "disputeId" TEXT;
ALTER TABLE "CreditNote" ADD COLUMN IF NOT EXISTS "leadAssignmentId" TEXT;
ALTER TABLE "CreditNote" DROP CONSTRAINT IF EXISTS "CreditNote_kind_check";
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_kind_check" CHECK ("kind" IN ('cancellation', 'dispute'));
DROP INDEX IF EXISTS "CreditNote_invoiceId_key";
CREATE INDEX IF NOT EXISTS "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");
-- At most one cancellation (total) credit note per invoice, as before; dispute notes are unbounded.
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_cancellation_invoice_key" ON "CreditNote"("invoiceId") WHERE "kind" = 'cancellation';
-- Idempotence of the automatic credit: one credit note per dispute.
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_disputeId_key" ON "CreditNote"("disputeId");
