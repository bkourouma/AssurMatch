-- Spec 070 (PRD gaps lot 4): product categories administration, product legal text / required
-- documents / version history, insurers referential, offer-to-insurer link and manual
-- activation attestations. Additive only: nullable or defaulted columns and new tables. No
-- existing row is rewritten (except the optional insurer backfill below, which only fills new
-- columns) and nothing is dropped.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "InsurerStatus" AS ENUM ('active', 'suspended', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: PROD-001 category labels and ordering.
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "nameEn" TEXT;
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: PROD-005 / PROD-007 / PROD-008.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "legalNotice" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "requiredDocumentKinds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable: PROD-008 / PROD-009 history of the conditions of a product.
CREATE TABLE IF NOT EXISTS "ProductVersion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVersion_productId_versionNumber_key" ON "ProductVersion"("productId", "versionNumber");
CREATE INDEX IF NOT EXISTS "ProductVersion_productId_createdAt_idx" ON "ProductVersion"("productId", "createdAt");

-- CreateTable: PRD section 8 insurers referential, per country.
CREATE TABLE IF NOT EXISTS "Insurer" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "approvalNumber" TEXT,
    "status" "InsurerStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Insurer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Insurer_countryId_code_key" ON "Insurer"("countryId", "code");
CREATE INDEX IF NOT EXISTS "Insurer_countryId_status_idx" ON "Insurer"("countryId", "status");

-- CreateTable: PRD 35/36 manual attestations (author and date) of activation checklist controls.
CREATE TABLE IF NOT EXISTS "ActivationAttestation" (
    "id" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "controlKey" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "attestedById" TEXT NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ActivationAttestation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ActivationAttestation_scopeType_scopeId_controlKey_key" ON "ActivationAttestation"("scopeType", "scopeId", "controlKey");
CREATE INDEX IF NOT EXISTS "ActivationAttestation_scopeType_scopeId_idx" ON "ActivationAttestation"("scopeType", "scopeId");

-- AlterTable: optional offer-to-insurer link (insurerName stays the displayed name).
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "insurerId" TEXT;
ALTER TABLE "OfferVersion" ADD COLUMN IF NOT EXISTS "insurerId" TEXT;

-- Data (additive): one insurer per (country, distinct insurerName) already typed on an offer, then
-- link the offers that carry that name. Offers without a name, and every other column, are untouched.
INSERT INTO "Insurer" ("id", "countryId", "name", "code", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, src."countryId", src."name", src."code", 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (o."countryId", lower(btrim(o."insurerName")))
    o."countryId" AS "countryId",
    btrim(o."insurerName") AS "name",
    left(trim(both '-' from regexp_replace(lower(btrim(o."insurerName")), '[^a-z0-9]+', '-', 'g')), 40) AS "code"
  FROM "Offer" o
  WHERE o."insurerName" IS NOT NULL AND btrim(o."insurerName") <> ''
  ORDER BY o."countryId", lower(btrim(o."insurerName")), o."createdAt"
) src
WHERE src."code" <> ''
ON CONFLICT ("countryId", "code") DO NOTHING;

UPDATE "Offer" o
SET "insurerId" = i."id"
FROM "Insurer" i
WHERE o."insurerId" IS NULL
  AND o."insurerName" IS NOT NULL
  AND i."countryId" = o."countryId"
  AND lower(btrim(i."name")) = lower(btrim(o."insurerName"));

-- Data (additive): version 1 of every existing product, so the history always starts somewhere.
INSERT INTO "ProductVersion" ("id", "productId", "versionNumber", "snapshot", "changes", "reason", "authorId", "createdAt")
SELECT gen_random_uuid()::text, p."id", 1,
  jsonb_build_object(
    'name', p."name", 'description', p."description", 'categoryId', p."categoryId",
    'sensitivity', p."sensitivity"::text, 'requiresDocuments', p."requiresDocuments",
    'requiresManualReview', p."requiresManualReview", 'status', p."status"::text,
    'legalNotice', p."legalNotice", 'requiredDocumentKinds', to_jsonb(p."requiredDocumentKinds")
  ),
  '[]'::jsonb, 'Version initiale (reprise de l''existant)', p."createdById", p."createdAt"
FROM "Product" p
ON CONFLICT ("productId", "versionNumber") DO NOTHING;
