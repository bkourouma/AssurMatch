-- Spec 062: broker <-> visitor messaging, document requests and visitor data requests (D-10).
-- Additive only: new notification types, four new tables and nullable columns. No existing row is
-- rewritten and nothing is dropped. Message bodies are never updated by the application (append-only).

-- AlterEnum: pointer e-mails of the conversation and of the data requests, broker and compliance alerts.
-- `broker_document_received` already exists (0028) and is reused for documents provided by the visitor.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_broker_message';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_documents_requested';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_data_request_acknowledged';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'visitor_data_request_closed';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_visitor_message';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'admin_data_request_received';

-- AlterTable (R7): first reply the visitor can see (first proposal or first broker message).
ALTER TABLE "LeadAssignment" ADD COLUMN IF NOT EXISTS "firstVisibleReplyAt" TIMESTAMP(3);

-- AlterTable (R3): a file the visitor provides for a broker document request.
ALTER TABLE "QuoteRequestDocument" ADD COLUMN IF NOT EXISTS "documentRequestId" TEXT;
ALTER TABLE "QuoteRequestDocument" ADD COLUMN IF NOT EXISTS "uploadedBy" TEXT;
CREATE INDEX IF NOT EXISTS "QuoteRequestDocument_documentRequestId_idx" ON "QuoteRequestDocument"("documentRequestId");

-- CreateTable: one message of an assignment conversation (append-only; readAt is the only lifecycle column).
CREATE TABLE IF NOT EXISTS "LeadMessage" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "clientRequestId" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadMessage_pkey" PRIMARY KEY ("id")
);

-- NULL clientRequestId values never collide, so only client-supplied keys are deduplicated.
CREATE UNIQUE INDEX IF NOT EXISTS "LeadMessage_leadAssignmentId_senderType_clientRequestId_key" ON "LeadMessage"("leadAssignmentId", "senderType", "clientRequestId");
CREATE INDEX IF NOT EXISTS "LeadMessage_quoteRequestId_createdAt_idx" ON "LeadMessage"("quoteRequestId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadMessage_leadAssignmentId_createdAt_idx" ON "LeadMessage"("leadAssignmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadMessage_partnerTenantId_idx" ON "LeadMessage"("partnerTenantId");

-- CreateTable: scanned files attached to a message (only clean files are served).
CREATE TABLE IF NOT EXISTS "LeadMessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL,
    "scanEngine" TEXT,
    "scannedAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadMessageAttachment_messageId_idx" ON "LeadMessageAttachment"("messageId");
CREATE INDEX IF NOT EXISTS "LeadMessageAttachment_leadAssignmentId_createdAt_idx" ON "LeadMessageAttachment"("leadAssignmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadMessageAttachment_quoteRequestId_idx" ON "LeadMessageAttachment"("quoteRequestId");

-- CreateTable: documents the broker asks the visitor for (open -> fulfilled | cancelled only).
CREATE TABLE IF NOT EXISTS "LeadDocumentRequest" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "authorId" TEXT,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "fulfilledAt" TIMESTAMP(3),
    "fulfilledDocumentCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadDocumentRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadDocumentRequest_leadAssignmentId_status_idx" ON "LeadDocumentRequest"("leadAssignmentId", "status");
CREATE INDEX IF NOT EXISTS "LeadDocumentRequest_quoteRequestId_idx" ON "LeadDocumentRequest"("quoteRequestId");
CREATE INDEX IF NOT EXISTS "LeadDocumentRequest_partnerTenantId_idx" ON "LeadDocumentRequest"("partnerTenantId");

-- CreateTable (D-10): visitor data-subject requests. "detail" is personal data; nothing is erased from here.
CREATE TABLE IF NOT EXISTS "DataRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "detail" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "erasureBatchId" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataRequest_reference_key" ON "DataRequest"("reference");
CREATE INDEX IF NOT EXISTS "DataRequest_quoteRequestId_type_status_idx" ON "DataRequest"("quoteRequestId", "type", "status");
CREATE INDEX IF NOT EXISTS "DataRequest_status_dueAt_idx" ON "DataRequest"("status", "dueAt");
