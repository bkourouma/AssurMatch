# Implementation Plan: Consoles d'exploitation admin

**Branch**: `worktree-agent-a0abbef3c0567b000` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Continuous Workflow Eligibility**: Eligible. Spec validée par délégation du superviseur ; aucun `[NEEDS CLARIFICATION]`.

## Summary

Les routes d'exploitation existantes deviennent des consoles utilisables : liste et fiche des demandes de devis (consentement, routage, exclus, affectations, documents, offre choisie), revue manuelle **persistée** et auditée (router, assigner, non routable, doublon), liste et réaffectation des leads, statut des messages de contact, recherche et export restreint des journaux d'audit lus depuis le dépôt durable, anomalies et historique de routage. Voir [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript strict ; Node ≥ 24 visé
**Primary Dependencies**: NestJS 11, Next.js 16.3, Prisma 7.8, zod 4
**Storage**: PostgreSQL, migration `0025_admin_operations` (additive)
**Testing**: Vitest (intégration HTTP par harnais Nest), Playwright en marqueurs de source (`apps/admin/tests`)
**Impacted Application(s)**:
- Back-office Plateforme/Admin ;
- Backend API ;
- packages partagés (`packages/shared/contracts/admin-operations.contracts.ts`) ;
- base de données / Prisma / migrations.
- Non impactés : Web Publique Client, Broker Back-office, runtime/launcher.

**Constraints**: aucune modification de `apps/public`, `apps/broker`, `backend/src/modules/notifications/*`, ni de la logique métier offres/partenaires ; matrice RBAC inchangée.

## Constitution Check

*Gate avant la phase 0 : PASS. Re-vérification après conception : PASS.*

| Gate | Statut | Preuve |
|---|---|---|
| Plateforme technique | Pass | Outils internes ; transmission uniquement par le routage déterministe. |
| Consentement | Pass | Revue `route`/`assign` refusée (422, auditée) sans consentement `granted`. |
| Licences | Pass | Assignation via `assignManually` → éligibilité (licence, autorisations, quota). |
| Flags | Pass | Aucun nouveau flag ; flags 049/042 respectés. |
| Séparation des applications | Pass | Écrans dans l'app admin uniquement. |
| RBAC / MFA / périmètre | Pass | R3/R4 ; tests 401/403/périmètre par route. |
| PII | Pass | Masquage Support Admin ; aucun jeton ni empreinte exposé ; lectures historiques assainies. |
| Données et audit | Pass | Revue persistée (`reviewedAt/By`, motif, doublon) ; `RoutingDecision` des refus ; audit de chaque lecture sensible, décision, statut et export. |
| Routage | Pass | Moteur existant relancé ; aucune exception d'éligibilité. |
| IA | N/A | Analyse IA non exposée. |
| Tests | Pass | Intégration par route, persistance, marqueurs admin. |

## Project Structure

```text
packages/shared/contracts/admin-operations.contracts.ts (new)
backend/prisma/schema.prisma + migrations/0025_admin_operations/
backend/src/modules/admin-operations/ (new: access, quote console, review, assignments, audit, routing history, module)
backend/src/modules/audit-logs/audit-log-repository.ts (search)
backend/src/modules/contact-messages/ (findById, updateStatus)
backend/src/modules/quote-requests/ (routeAfterReview, applyReviewOutcome, assignManually élargi, suppression review en mémoire)
backend/src/modules/http-wiring/admin-operations-http.controllers.ts (new) + runtime-http-wiring.module.ts (lectures historiques, enregistrement)
backend/src/runtime/assurmatch-runtime.ts (adminOperations)
apps/admin/app/lib/operations-api.ts, apps/admin/app/lib/ui/operations-tabs.tsx, admin-shell.tsx
apps/admin/app/{quote-requests, quote-requests/[quoteRequestId], operations/quote-review, lead-assignments, operations/contact-messages, compliance/audit-logs(+export route), routing/anomalies, routing/history}
backend/tests/integration/admin-operations/*.spec.ts, apps/admin/tests/admin-operations-consoles.spec.ts
```

## Phasing

1. Contrats, schéma et migration.
2. Backend : dépôts, services, routes, durcissement des lectures historiques.
3. Tests d'intégration (RBAC, périmètre, persistance, export).
4. Écrans admin et navigation ; tests de marqueurs.
5. Validations (typecheck, lint, vitest, playwright admin, build Next admin, scan de secrets).

## Complexity Tracking

Aucune violation constitutionnelle. Écart assumé : filtrage en mémoire des affectations et décisions (volume V1), la pagination étant appliquée par l'API.
