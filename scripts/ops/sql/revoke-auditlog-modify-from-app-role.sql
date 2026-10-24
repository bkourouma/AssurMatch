-- Durcissement de la table d'audit : retire UPDATE, DELETE et TRUNCATE sur "AuditLog" au role SQL
-- applicatif (API et worker). INSERT et SELECT sont conserves.
--
-- Ce script n'est PAS une migration Prisma : le nom du role applicatif varie selon l'environnement.
-- A executer APRES `prisma migrate deploy` et AVANT l'ouverture au trafic, avec un role
-- proprietaire/migrateur (ou superutilisateur), jamais avec le role applicatif lui-meme.
--
--   psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -v app_role=assurmatch_api \
--        -f scripts/ops/sql/revoke-auditlog-modify-from-app-role.sql
--
-- Annulation : scripts/ops/sql/restore-auditlog-modify-to-app-role.sql
-- Idempotent : un second passage ne change rien.
-- Refus (RAISE EXCEPTION, transaction annulee) si le role n'existe pas, s'il est proprietaire de la
-- table, superutilisateur, ou si le role courant est le role vise. Voir docs/runbooks/audit-integrity.md.

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
    RAISE EXCEPTION 'Table public."AuditLog" introuvable : appliquer prisma migrate deploy d''abord';
  END IF;
  SELECT * INTO role_rec FROM pg_roles WHERE rolname = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Le role % n''existe pas', target;
  END IF;
  SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid = tbl;
  IF owner_name = target THEN
    RAISE EXCEPTION 'Le role % est proprietaire de "AuditLog" (role migrateur) : utiliser un role applicatif distinct', target;
  END IF;
  IF role_rec.rolsuper THEN
    RAISE EXCEPTION 'Le role % est superutilisateur : le REVOKE serait sans effet', target;
  END IF;
  IF target = current_user THEN
    RAISE EXCEPTION 'Executer ce script avec un role d''administration, pas avec le role applicatif %', target;
  END IF;
  IF pg_has_role(target, owner_name, 'USAGE') THEN
    RAISE EXCEPTION 'Le role % herite du role proprietaire % : le REVOKE serait sans effet', target, owner_name;
  END IF;

  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE %s FROM %I', tbl, target);

  IF has_table_privilege(target, tbl, 'UPDATE') OR has_table_privilege(target, tbl, 'DELETE')
     OR has_table_privilege(target, tbl, 'TRUNCATE') THEN
    RAISE EXCEPTION 'Le role % conserve un droit de modification sur "AuditLog" (herite d''un autre role ou de PUBLIC) : verifier les GRANT', target;
  END IF;
  IF NOT has_table_privilege(target, tbl, 'INSERT') OR NOT has_table_privilege(target, tbl, 'SELECT') THEN
    RAISE EXCEPTION 'Le role % n''a pas INSERT et SELECT sur "AuditLog" : l''API ne pourrait plus journaliser', target;
  END IF;
  RAISE NOTICE 'OK : % ne peut plus modifier "AuditLog" (INSERT et SELECT conserves)', target;
END
$$;

COMMIT;
