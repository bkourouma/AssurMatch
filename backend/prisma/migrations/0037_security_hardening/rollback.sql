-- Spec 075 (lot 8): manual reverse of 0037_security_hardening (NOT run by `prisma migrate`).
-- Prerequisite: no row may still be encrypted. Run `node --import tsx scripts/ops/backfill-pii-encryption.ts
-- --decrypt --apply` first, then check: SELECT count(*) FROM "Prospect" WHERE "piiKeyId" IS NOT NULL; (must be 0)
-- and the same on "QuoteRequest". Dropping the columns earlier would make encrypted values unreadable.
DROP TRIGGER IF EXISTS "AuditLog_append_only_truncate" ON "AuditLog";
DROP TRIGGER IF EXISTS "AuditLog_append_only_row" ON "AuditLog";
DROP FUNCTION IF EXISTS "assurmatch_audit_log_guard"();
ALTER TABLE "AuditLog" DROP COLUMN IF EXISTS "integrityKeyId";
ALTER TABLE "AuditLog" DROP COLUMN IF EXISTS "integrityHash";
DROP INDEX IF EXISTS "QuoteRequest_piiKeyId_idx";
ALTER TABLE "QuoteRequest" DROP COLUMN IF EXISTS "piiKeyId";
DROP INDEX IF EXISTS "Prospect_piiKeyId_idx";
DROP INDEX IF EXISTS "Prospect_countryId_productId_phoneBlindIndex_idx";
DROP INDEX IF EXISTS "Prospect_countryId_productId_emailBlindIndex_phoneBlindIndex_idx";
ALTER TABLE "Prospect" DROP COLUMN IF EXISTS "piiKeyId";
ALTER TABLE "Prospect" DROP COLUMN IF EXISTS "phoneBlindIndex";
ALTER TABLE "Prospect" DROP COLUMN IF EXISTS "emailBlindIndex";
