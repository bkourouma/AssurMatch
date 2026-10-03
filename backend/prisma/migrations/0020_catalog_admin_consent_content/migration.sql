-- Spec 050: admin catalogue, consent content and activation.
-- Additive only: every column is nullable or defaulted, so no existing row is lost or rewritten.

-- AlterTable: per country phone rule (R8)
ALTER TABLE "Country" ADD COLUMN IF NOT EXISTS "phoneDialCode" TEXT;
ALTER TABLE "Country" ADD COLUMN IF NOT EXISTS "phoneNationalLengths" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable: consent text content and retirement date (R5)
ALTER TABLE "ConsentText" ADD COLUMN IF NOT EXISTS "content" TEXT;
ALTER TABLE "ConsentText" ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);

-- AlterTable: language of the submitted quote form (R6)
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr';
