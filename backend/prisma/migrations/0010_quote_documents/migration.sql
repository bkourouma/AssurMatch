CREATE TYPE "QuoteDocumentScanStatus" AS ENUM ('pending', 'clean', 'infected', 'failed');
CREATE TYPE "QuoteDocumentStatus" AS ENUM ('uploaded', 'available', 'quarantined', 'removed');

CREATE TABLE IF NOT EXISTS "QuoteRequestDocument" (
  "id" TEXT NOT NULL,
  "quoteRequestId" TEXT NOT NULL,
  "prospectId" TEXT,
  "label" TEXT NOT NULL,
  "documentKind" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "scanStatus" "QuoteDocumentScanStatus" NOT NULL DEFAULT 'pending',
  "scanEngine" TEXT,
  "scanSignature" TEXT,
  "scannedAt" TIMESTAMP(3),
  "status" "QuoteDocumentStatus" NOT NULL DEFAULT 'uploaded',
  "sharedLeadAssignmentId" TEXT,
  "sharedAt" TIMESTAMP(3),
  "retentionUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteRequestDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuoteRequestDocument_quoteRequestId_createdAt_idx" ON "QuoteRequestDocument"("quoteRequestId", "createdAt");
CREATE INDEX IF NOT EXISTS "QuoteRequestDocument_scanStatus_createdAt_idx" ON "QuoteRequestDocument"("scanStatus", "createdAt");
