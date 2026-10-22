# Plan - Spec 075 durcissement securite

Contexte technique : NestJS 12, Prisma 7 (schema `backend/prisma/schema.prisma`), Redis (`RedisClientPort`), Vitest. Migration reservee `0037_security_hardening` (additive + `rollback.sql`).

## Architecture
- `backend/src/modules/common/security/` : `pii-key-ring.ts` (cles, env), `pii-vault.ts` (encrypt/decrypt enveloppe, blind index, enveloppe JSON), `audit-integrity.ts` (HMAC canonique). Les repositories (`prospects`, `quote-requests`, `leads`, `data-retention`) appellent le vault ; le domaine reste en clair.
- Lecture : `decryptField(value)` retourne la valeur telle quelle si elle n'est pas une enveloppe `enc:v1:` (transition). Ecriture : chiffre si l'anneau est configure.
- Index aveugle : `HMAC-SHA256(blindKey, kind + ":" + normalise)` ; lookup prospect = `OR (blindIndex, legacy fingerprint)`.
- Audit : `AuditLogWriter` + outbox borne + compteur `auditPersistFailures` ; `PrismaService.persistAuditLog` signe `integrityHash` ; trigger append-only (migration).
- Partner API : `PartnerApiRateLimiter` (Redis incr+expire, fallback memoire) appele depuis `PartnerApiController` (avant le service).
- IA : `PiiMinimizer` etendu (`SensitiveDataDetector`), `AiGateway.isEnabled` + garde du prompt final.
- Apps : `global-error.tsx` x3, sitemap public verifie/etendu + test.

## Surfaces et proprietaires de fichiers (une tache = un proprietaire)
- T1 (expert, Opus) : `common/security/pii-*`, `prospects/*`, `quote-requests/quote-requests.repository.ts`, `leads/lead-assignments.repository.ts`, `data-retention/retention-subjects.repository.ts`, `config/config.module.ts` (env), `scripts/ops/backfill-pii-encryption.ts`, `docs/runbooks/pii-encryption.md`, `docs/runbooks/secret-rotation.md`, tests `backend/tests/unit/security/pii-*`.
- T2 (executant) : `audit-logs/*`, `common/prisma/prisma.service.ts`, `common/security/audit-integrity.ts`, `scripts/ops/verify-audit-integrity.ts`, `docs/runbooks/audit-integrity.md`, tests audit.
- T3 (executant) : `common/rate-limit/partner-api-rate-limiter.ts` (nouveau), bloc `PartnerApiController` dans `http-wiring/runtime-http-wiring.module.ts`, tests.
- T4 (executant) : `ai/**` (gateway, minimizer, detecteur), tests IA.
- T5 (executant-rapide) : `apps/*/app/global-error.tsx`, `apps/public/app/sitemap.ts` + tests.
- Superviseur : `schema.prisma`, migration 0037, `prisma-migrations.spec.ts`, `package.json` scripts, merge final.

## Validation
Typecheck, lint, tests cibles par tache, suite complete une fois. Timeouts isoles prisma-schema/secret-scan relances seuls. Aucun backfill execute.
