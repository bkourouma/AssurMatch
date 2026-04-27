# Runbook Outlines (created during /speckit.implement)

Each outline below describes the runbook's purpose, prerequisites, steps, and rollback hint. The full runbooks land under `docs/runbooks/` during implementation.

## 1. `deployment.md`

- Purpose: deploy a new image to preprod (or production future).
- Prerequisites: CI verify green; SSH access as `deployer`.
- Steps: trigger `git push origin main`, monitor pipeline, observe health on `/admin/system/health`, watch logs.
- Rollback: pipeline auto-reverts on health failure; manual rollback below.

## 2. `rollback.md`

- Purpose: roll back to the previous image SHA.
- Prerequisites: previous SHA known (visible in GHCR or in `env-history/`).
- Steps: SSH, `docker pull <prev-sha>`, `docker stop && rm`, `docker run` with prev SHA, health check, prune.
- Rollback: not applicable.

## 3. `migrations.md`

- Purpose: apply or check Prisma migrations.
- Steps: `docker exec assurmatch-app npx prisma migrate deploy`, verify `migrate status`, restart container if model changed.

## 4. `smoke-tests.md`

- Purpose: run smoke checks against a deployed env.
- Steps: scripted via `scripts/preprod/smoke.sh` (deferred to /speckit.tasks). Until then, manual list in Quickstart §E.

## 5. `catalog-import-countries.md`

- Purpose: refresh the countries reference catalog after editing JSON files.
- Steps: PR with edited `scripts/preprod/seeds/reference/countries.json`, merge, redeploy, run `seed-reference`.

## 6. `catalog-import-products.md`

- Purpose: refresh products reference catalog. Same flow as countries.

## 7. `operational-import-partners.md`

- Purpose: import a signed partners batch.
- Steps: place batch on VPS, dry-run, review report, apply, verify audit, archive bundle.

## 8. `activation-country.md`

- Purpose: activate a country publicly per checklist B.
- Steps: confirm checklist; PATCH the country flag with reason; verify; communicate.

## 9. `activation-product.md`

- Purpose: activate a product within a country per checklist C.

## 10. `activation-partner.md`

- Purpose: set a partner active per checklist D.

## 11. `feature-flag-toggle.md`

- Purpose: flip any feature flag (per global / country / product / partner / plan scope).

## 12. `rapid-disable.md`

- Purpose: kill switch for a scope. Flip flag(s) to false in seconds.
- Tested quarterly.

## 13. `license-expired.md`

- Purpose: mark a license expired, block routing, communicate.

## 14. `audit-logs.md`

- Purpose: how to query audit logs from `/admin/audit-logs` and from PostgreSQL directly.

## 15. `backup-restore.md`

- Purpose: trigger a backup; restore on a separate environment; verify integrity.

## 16. `secret-rotation.md`

- Purpose: rotate JWT/SESSION/ENCRYPTION/SMTP/DB secrets without service interruption.

These runbooks are written in /speckit.implement, not here.
