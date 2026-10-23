-- Spec 075 (lot 8): manual reverse of 0037_security_hardening (NOT run by `prisma migrate`).
-- After running it, DELETE the row of 0037_security_hardening from "_prisma_migrations" so that
-- `prisma migrate deploy` can re-apply it later; otherwise Prisma believes the migration is still applied.
-- Prerequisite: no row may still be encrypted (guard below). Run `node --import tsx scripts/ops/backfill-pii-encryption.ts
-- --decrypt --apply` first. Dropping the columns earlier would make encrypted values unreadable.
DO $$
BEGIN
  IF (SELECT count(*) FROM "Prospect" WHERE "piiKeyId" IS NOT NULL) > 0
     OR (SELECT count(*) FROM "QuoteRequest" WHERE "piiKeyId" IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'Rollback refused: encrypted rows remain (piiKeyId IS NOT NULL). Run backfill-pii-encryption.ts --decrypt --apply first.';
  END IF;
END $$;
DROP TRIGGER IF EXISTS "AuditLog_append_only_truncate" ON "AuditLog";
DROP TRIGGER IF EXISTS "AuditLog_append_only_row" ON "AuditLog";
DROP FUNCTION IF EXISTS "assurmatch_audit_log_guard"();
ALTER TABLE "AuditLog" DROP COLUMN IF EXISTS "integrityKeyId";
ALTER TABLE "AuditLog" DROP COLUMN IF EXISTS "integrityHash";
DROP INDEX IF EXISTS "QuoteRequest_piiKeyId_idx";
ALTER TABLE "QuoteRequest" DROP COLUMN IF EXISTS "piiKeyId";
DROP INDEX IF EXISTS "Prospect_piiKeyId_idx";
DROP INDEX IF EXISTS "Prospect_countryId_productId_phoneBlindIndex_idx";
DROP INDEX IF EXISTS "Prospect_countryId_productId_emailBlindIndex_phoneBlindInde_idx";
ALTER TABLE "Prospect" DROP COLUMN IF EXISTS "piiKeyId";
ALTER TABLE "Prospect" DROP COLUMN IF EXISTS "phoneBlindIndex";
ALTER TABLE "Prospect" DROP COLUMN IF EXISTS "emailBlindIndex";
