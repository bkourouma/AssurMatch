-- Spec 075 (lot 8): security hardening. Additive and backward compatible: nullable columns, indexes and
-- an append-only guard on "AuditLog". No existing row is rewritten and nothing is dropped. The
-- application reads the legacy clear values while "piiKeyId" is NULL; the idempotent backfill script
-- (scripts/ops/backfill-pii-encryption.ts) encrypts them later, outside of this migration.
-- Reverse: rollback.sql in this directory (run `backfill-pii-encryption.ts --decrypt` first).

-- Prospect: blind indexes (HMAC of the normalised e-mail / phone) and the id of the encrypting key.
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "emailBlindIndex" TEXT;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "phoneBlindIndex" TEXT;
ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "piiKeyId" TEXT;
CREATE INDEX IF NOT EXISTS "Prospect_countryId_productId_emailBlindIndex_phoneBlindInde_idx" ON "Prospect"("countryId", "productId", "emailBlindIndex", "phoneBlindIndex");
CREATE INDEX IF NOT EXISTS "Prospect_countryId_productId_phoneBlindIndex_idx" ON "Prospect"("countryId", "productId", "phoneBlindIndex");
CREATE INDEX IF NOT EXISTS "Prospect_piiKeyId_idx" ON "Prospect"("piiKeyId");

-- QuoteRequest: id of the key that encrypted "payload" (the envelope lives inside the existing JSONB).
ALTER TABLE "QuoteRequest" ADD COLUMN IF NOT EXISTS "piiKeyId" TEXT;
CREATE INDEX IF NOT EXISTS "QuoteRequest_piiKeyId_idx" ON "QuoteRequest"("piiKeyId");

-- AuditLog: HMAC of the canonical entry (tamper evidence, verified by scripts/ops/verify-audit-integrity.ts).
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "integrityHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "integrityKeyId" TEXT;

-- AuditLog is append-only: UPDATE, DELETE and TRUNCATE are refused unless a maintenance transaction
-- explicitly opens the gate with `SET LOCAL assurmatch.audit_maintenance = 'on'` (retention purge of
-- expired rows, documented in docs/runbooks/audit-integrity.md). The gate is never set by the API.
CREATE OR REPLACE FUNCTION "assurmatch_audit_log_guard"() RETURNS trigger AS $$
BEGIN
  IF current_setting('assurmatch.audit_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only (% refused)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLog_append_only_row" ON "AuditLog";
CREATE TRIGGER "AuditLog_append_only_row" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "assurmatch_audit_log_guard"();

DROP TRIGGER IF EXISTS "AuditLog_append_only_truncate" ON "AuditLog";
CREATE TRIGGER "AuditLog_append_only_truncate" BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION "assurmatch_audit_log_guard"();
