-- Annulation de revoke-auditlog-modify-from-app-role.sql : rend UPDATE, DELETE et TRUNCATE sur
-- "AuditLog" au role SQL applicatif. A n'utiliser qu'en cas de retour arriere decide et trace.
-- Les triggers append-only de la migration 0037 continuent de refuser les modifications.
--
--   psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -v app_role=assurmatch_api \
--        -f scripts/ops/sql/restore-auditlog-modify-to-app-role.sql
--
-- Idempotent. Memes refus que le script de revocation (role absent, proprietaire, superutilisateur).

\set ON_ERROR_STOP on
\if :{?app_role}
\else
  \echo 'Variable psql app_role manquante : psql -v app_role=<role_sql_de_l_api> -f ...'
  DO $$ BEGIN RAISE EXCEPTION 'Variable psql app_role manquante'; END $$;
  \quit
\endif

BEGIN;

SELECT set_config('assurmatch.target_role', :'app_role', true);

DO $$
DECLARE
  target text := current_setting('assurmatch.target_role');
  tbl regclass := to_regclass('public."AuditLog"');
  owner_name name;
  role_rec pg_roles%ROWTYPE;
BEGIN
  IF tbl IS NULL THEN
    RAISE EXCEPTION 'Table public."AuditLog" introuvable';
  END IF;
  SELECT * INTO role_rec FROM pg_roles WHERE rolname = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Le role % n''existe pas', target;
  END IF;
  SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid = tbl;
  IF owner_name = target OR role_rec.rolsuper THEN
    RAISE EXCEPTION 'Le role % est proprietaire ou superutilisateur : rien a restaurer', target;
  END IF;

  EXECUTE format('GRANT UPDATE, DELETE, TRUNCATE ON TABLE %s TO %I', tbl, target);
  RAISE NOTICE 'OK : droits UPDATE, DELETE, TRUNCATE rendus a % sur "AuditLog"', target;
END
$$;

COMMIT;
