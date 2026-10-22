-- Lot 9 (spec 072): minimal CMS for the Content Admin role. One versioned table for FAQ, guides,
-- glossary and per-country legal overrides. Additive only; nothing existing is touched.
CREATE TABLE IF NOT EXISTS "ContentEntry" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entryKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "countryCode" TEXT,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "label" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "basedOnId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ContentEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentEntry_kind_locale_status_idx" ON "ContentEntry"("kind", "locale", "status");
-- At most one published version, and at most one open (draft or pending_review) version, per key;
-- and never two rows with the same version of a key (a concurrent create/revise computing the same
-- next version fails instead of duplicating it). COALESCE makes a NULL country one value.
-- Prisma cannot express expression or partial unique indexes: they live only in this SQL (see the ContentEntry model).
CREATE UNIQUE INDEX IF NOT EXISTS "ContentEntry_key_version" ON "ContentEntry"("kind", "entryKey", "locale", COALESCE("countryCode", ''), "version");
CREATE UNIQUE INDEX IF NOT EXISTS "ContentEntry_published_key" ON "ContentEntry"("kind", "entryKey", "locale", COALESCE("countryCode", '')) WHERE "status" = 'published';
CREATE UNIQUE INDEX IF NOT EXISTS "ContentEntry_open_key" ON "ContentEntry"("kind", "entryKey", "locale", COALESCE("countryCode", '')) WHERE "status" IN ('draft', 'pending_review');
