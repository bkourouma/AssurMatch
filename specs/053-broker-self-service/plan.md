# Implementation Plan: Self-service du courtier

**Branch**: `worktree-agent-aa45f0d42b24d1c06` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Continuous Workflow Eligibility**: Eligible. Spec validée par délégation du superviseur, sans marqueur `[NEEDS CLARIFICATION]`. Arrêt sur échec bloquant ou conflit constitutionnel.

## Summary

Le courtier consulte tout son compte et agit dans des limites strictes : contacts et présentation commerciale en direct ; identité légale et extension de couverture par demande décidée par l'admin ; dépôt de renouvellement de licence avec preuve, sans jamais valider ; gestion de son équipe (invitation, désactivation, réactivation, rôle) avec garde-fous. Le backend délègue aux services 051 (R1) ; une table de demandes est ajoutée (R3). Voir [research.md](./research.md), [data-model.md](./data-model.md) et [contracts/broker-self-service-api.md](./contracts/broker-self-service-api.md).

## Technical Context

**Language/Version**: TypeScript strict ; Node ≥ 24 visé, validé sous Node 22
**Primary Dependencies**: NestJS 11 (`FileInterceptor`), Next.js 16.3, Prisma 7.8, zod 4
**Storage**: PostgreSQL (migration `0025_broker_self_service`) ; stockage et antivirus des documents de la 051
**Testing**: Vitest (intégration HTTP, RBAC, isolation, inventaire), Playwright en marqueurs de source (courtier et admin)
**Impacted Application(s)**:
- Backend API ;
- Broker Back-office (`apps/broker`) ;
- Back-office Plateforme (`apps/admin`, fiche courtier) ;
- packages partagés (contrats, RBAC, codes d'erreur) ;
- base de données.

Web Publique Client : non impacté.
**Constraints**: Aucune validation réglementaire par le courtier ; isolation par tenant (404) ; lecture seule si suspendu ; dernier propriétaire protégé.

## Constitution Check

*Gate avant la phase 0 : PASS. Re-vérification après la phase 1 : PASS.*

| Gate | Statut | Preuve |
|---|---|---|
| Rôle de plateforme technique | Pass | Le courtier propose ; AssurMatch décide les données réglementaires (R2, R4). |
| Réglementation et licences | Pass | Renouvellement brouillon puis en revue ; validation réservée à la conformité (051 FR-010). Ancienne licence valide jusqu'à la décision. |
| Flags et activation | Pass | Aucun flag ajouté ni activé ; extension soumise aux règles 051. |
| Séparation des applications | Pass | Écrans courtier dans `apps/broker`, décision dans `apps/admin`, aucune route publique. |
| Sécurité et RBAC | Pass | Permissions `broker_account:*`, `broker_team:*` ; tenant de l'acteur ; 404 inter-courtiers ; garde de suspension ; dernier propriétaire ; 401 après désactivation (R6). |
| Données et audit | Pass | Demandes historisées (valeurs demandées et précédentes, décideur, motif) ; AuditLog sur chaque écriture et refus ; migration additive. |
| Intégrité du routage | Pass | Aucune règle modifiée ; extension via `authorizeCountry/Product` (licence exigée). |
| IA | N/A | — |
| UX et contenu | Pass | Libellés neutres ; « examinée par AssurMatch » ; aucune formulation interdite. |
| Tests | Pass | Intégration (RBAC, isolation, suspendu, dernier propriétaire, renouvellement en revue, décision), inventaire d'écriture, marqueurs courtier et admin. |

## Project Structure

```text
packages/shared/contracts/{broker-self-service.contracts.ts (new), error-codes.ts}
packages/shared/rbac/assurmatch-role-matrix.ts (+ apps/broker/app/lib/broker-permissions.ts)
backend/prisma/schema.prisma + migrations/0025_broker_self_service/
backend/src/modules/broker-self-service/
  partner-change-requests.repository.ts   # memory + Prisma
  broker-account.service.ts               # profile, coverage, requests, licences, renewal, proof
  broker-team.service.ts                  # team
  partner-request-admin.service.ts        # admin list + decision
backend/src/modules/auth/user-access-status.service.ts + guards/http-auth.guard.ts (R6)
backend/src/modules/http-wiring/runtime-http-wiring.module.ts
backend/src/runtime/assurmatch-runtime.ts
apps/broker/app/{company,licenses,team}/ + lib/self-service-{api,actions,messages}.ts + licenses/[licenseId]/documents/route.ts
apps/admin/app/partners/[partnerId]/ (section « Demandes du courtier ») + lib/admin-api.ts, partner-actions.ts
backend/tests/integration/broker-self-service/*, apps/broker/tests/self-service.spec.ts, apps/admin/tests/partner-requests.spec.ts
```

**Structure Decision**: Module backend dédié qui orchestre les services existants ; aucune règle 051 n'est dupliquée.

## Phasing

1. Contrats, RBAC, schéma, migration 0025, inventaire des migrations.
2. Backend : dépôt des demandes, services courtier, équipe et admin, garde de statut utilisateur, routes, runtime.
3. Tests d'intégration (RBAC, isolation, suspension, dernier propriétaire, renouvellement, décision) et inventaire.
4. Interfaces courtier puis admin ; tests de marqueurs.
5. Validations finales (typecheck, lint, vitest, Playwright, builds Next, scan de secrets).

## Complexity Tracking

| Écart | Justification | Alternative écartée |
|---|---|---|
| Lecture du statut utilisateur à chaque requête courtier (R6) | FR-011 : une désactivation doit être immédiate ; les jetons ne sont pas révocables. Cache 30 s invalidé à l'action. | Attendre l'expiration du jeton (15 min). |
