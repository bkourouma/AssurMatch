-- Spec 055: broker response loop (proposals to the visitor, visitor follow-up, internal documents).
-- Additive only: two notification types, two new tables and nullable file columns on the CRM
-- documents. No existing row is rewritten; the legacy "BrokerCrmProposal" references are kept.

-- AlterEnum (FR-008): visitor e-mail on a new proposal, broker notification on a visitor response.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_proposal_available';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_visitor_response';

-- AlterTable (FR-010): internal CRM documents become real, scanned files.
ALTER TABLE "BrokerCrmDocument" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "BrokerCrmDocument" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "BrokerCrmDocument" ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER;
ALTER TABLE "BrokerCrmDocument" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "BrokerCrmDocument" ADD COLUMN IF NOT EXISTS "scanStatus" TEXT;
ALTER TABLE "BrokerCrmDocument" ADD COLUMN IF NOT EXISTS "scanEngine" TEXT;
ALTER TABLE "BrokerCrmDocument" ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMP(3);

-- CreateTable (FR-002/FR-003): immutable proposals, lifecycle columns only change after sending.
CREATE TABLE IF NOT EXISTS "LeadProposal" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "authorId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'crm',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "message" TEXT NOT NULL,
    "priceMin" DECIMAL(16,2),
    "priceMax" DECIMAL(16,2),
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "guarantees" TEXT[],
    "validUntil" TIMESTAMP(3) NOT NULL,
    "nonContractual" BOOLEAN NOT NULL DEFAULT true,
    "documentStorageKey" TEXT,
    "documentFileName" TEXT,
    "documentMimeType" TEXT,
    "documentSizeBytes" INTEGER,
    "documentChecksum" TEXT,
    "documentScanStatus" TEXT,
    "documentScanEngine" TEXT,
    "documentScannedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnById" TEXT,
    "withdrawReason" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadProposal_leadAssignmentId_sentAt_idx" ON "LeadProposal"("leadAssignmentId", "sentAt");
CREATE INDEX IF NOT EXISTS "LeadProposal_quoteRequestId_sentAt_idx" ON "LeadProposal"("quoteRequestId", "sentAt");
CREATE INDEX IF NOT EXISTS "LeadProposal_partnerTenantId_sentAt_idx" ON "LeadProposal"("partnerTenantId", "sentAt");

-- CreateTable (US3): append-only visitor responses; the latest one prevails.
CREATE TABLE IF NOT EXISTS "VisitorProposalResponse" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "callbackSlot" TEXT,
    "declineReason" TEXT,
    "question" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorProposalResponse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VisitorProposalResponse_proposalId_createdAt_idx" ON "VisitorProposalResponse"("proposalId", "createdAt");
CREATE INDEX IF NOT EXISTS "VisitorProposalResponse_leadAssignmentId_createdAt_idx" ON "VisitorProposalResponse"("leadAssignmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "VisitorProposalResponse_partnerTenantId_createdAt_idx" ON "VisitorProposalResponse"("partnerTenantId", "createdAt");
