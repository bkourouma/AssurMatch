# Implementation Plan: Onboarding et cycle de vie des courtiers partenaires (admin)

**Branch**: `claude/inspiring-maxwell-58e67d` | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)

**Continuous Workflow Eligibility**: Eligible. L'utilisateur a validé la spec le 2026-10-02 ; elle ne contient aucun marqueur `[NEEDS CLARIFICATION]`. Le workflow s'arrête en cas d'échec bloquant ou de conflit constitutionnel.

## Summary

Cette spec rend administrable le cycle de vie complet d'un courtier : fiche, statuts du PRD avec historique, licences (validation, suspension, révocation, renouvellement), documents d'agrément réellement téléversés et analysés, contrat enregistré, couverture par pays et produit, conversion des candidatures avec e-mail de décision, et invitation du propriétaire. L'activation est conditionnée et réservée à la conformité. Les effets de la suspension (lecture seule) et de la résiliation (connexion refusée) s'appliquent au portail courtier. Seul « Actif public » est routable, et « Actif test » ne reçoit aucun lead réel. L'approche est détaillée dans [research.md](./research.md) (R1 à R16), [data-model.md](./data-model.md) et [contracts/admin-partners-api.md](./contracts/admin-partners-api.md).

## Technical Context

**Language/Version**: TypeScript strict ; Node ≥ 24 visé, validé sous Node 22
**Primary Dependencies**: NestJS 11 (câblage déclaratif, `FileInterceptor` multer), Next.js 16.3, Prisma 7.8, zod 4
**Storage**: PostgreSQL ; stockage de documents de la spec 033 (mémoire, disque ou S3) et antivirus (EICAR ou ClamAV)
**Testing**: Vitest (unitaires, intégration HTTP, garde-fous), Playwright en marqueurs de source
**Impacted Application(s)**:
- Backend API ;
- Back-office Plateforme (`apps/admin`) ;
- Broker Back-office (`apps/broker` : bannière et lecture seule) ;
- packages partagés (contrats, matrice RBAC) ;
- base de données (migration 0021) ;
- notifications e-mail ;
- scripts (`import-partners`, seed démo).

Le Web Publique Client n'est pas modifié (l'annuaire et les statistiques excluent déjà tout statut autre que `active`).
**Constraints**: Aucune activation sans conditions ; documents en quarantaine jamais servis ; aucun lead réel vers `active_test` ; suspension et résiliation effectives en moins d'une minute.
**Scale/Scope**: 3 à 5 courtiers par pays au lancement ; quelques dizaines de documents.

## Constitution Check

*Gate avant la phase 0 : PASS. Re-vérification après la phase 1 : PASS.*

| Gate | Statut | Preuve |
|---|---|---|
| Rôle de plateforme technique | Pass | Vérification des courtiers agréés avant transmission (II). L'e-mail de décision précise qu'il s'agit d'un partenariat technique, pas d'un agrément. |
| Réglementation et licences | Pass | Licence validée par la conformité avec document accepté (R4, R5). Blocage à l'expiration, à la suspension et à la révocation. « Expiré » calculé (R1). Activation conditionnée (R3). |
| Flags et activation | Pass | `country_broker_onboarding_enabled` exigé pour la conversion et l'activation. Aucun flag sensible. |
| Séparation des applications | Pass | Gestion dans `apps/admin`. Bannière et lecture seule dans `apps/broker`. Rien dans `apps/public`. |
| Sécurité et RBAC | Pass | MFA. Élargissement mesuré de `admin_pays` à la préparation (R13), actions de conformité réservées par rôle. Périmètre pays. Documents réservés et consultations auditées. Antivirus et vérification des octets de signature. |
| Données et audit | Pass | Historiques de statut courtier et licence. AuditLog avant/après sur chaque mutation et chaque refus. Migration additive. |
| Intégrité du routage | Pass | Seul `active` est routable (sites existants). Document persistant exigé (R14). Suspension et résiliation immédiates (cache invalidé). |
| IA | N/A | — |
| UX et contenu | Pass | Garde de formulations sur les gabarits d'e-mail. Libellés neutres. |
| Tests | Pass | Unitaires (transitions, blocages, licences), intégration (RBAC, périmètre, conditions, quarantaine, conversion et e-mail, lecture seule et 401 après résiliation), garde-fous, marqueurs admin et courtier. |
| Asynchrone | Pass | Analyse antivirus synchrone mais bornée (petits fichiers, 5 Mo). E-mails best effort. |

## Project Structure

```text
packages/shared/contracts/{partner,partner-application,error-codes}.contracts.ts
packages/shared/rbac/assurmatch-role-matrix.ts
backend/prisma/schema.prisma + migrations/0021_partner_onboarding_lifecycle/
backend/src/modules/
  partners/          # lifecycle, transitions, activation blockers, authorizations, admin service
  partner-licenses/  # validate/suspend/revoke/renew + history
  documents/         # persisted accreditation documents, upload, scan, review, download
  partner-applications/  # review/convert/reject + decision email
  notifications/email/   # partner_application_decision purpose + templates
  users/             # tenant/role validation, invitation from partner page
  auth/              # retired tenant login refusal, per-request tenant status, tenantReadOnly
  enterprise/        # contractual SLA bound
  leads/, partners/partner-eligibility.service.ts, activation-checklist/  # persisted documents, new controls
  http-wiring/runtime-http-wiring.module.ts
backend/src/runtime/assurmatch-runtime.ts  # repositories, scanner exposure, tenant status cache
apps/admin/app/partners/ (directory, [partnerId], applications/, applications/[applicationId])
apps/admin/app/users/ (tenant picker)
apps/broker/app/ (suspended banner, write actions disabled)
scripts/import-partners*.ts, scripts/local-app/seed-broker-demo.ts, backend/tests/**
```

**Structure Decision**: La logique reste dans les modules existants (`partners`, `partner-licenses`, `documents`, `partner-applications`). Un `PartnerAdminService` orchestre les routes admin. La garde de tenant (R12) vit dans `auth`, pour s'appliquer à toutes les routes courtiers.

## Phasing

1. **Fondations** : contrats, matrice RBAC, schéma, migration 0021, inventaire des migrations.
2. **Lot backend A** : cycle de vie du courtier, licences, documents, contrat, couverture, conditions d'activation, éligibilité et checklist, routes admin, tests.
3. **Lot backend B** : candidatures et e-mail, utilisateurs et invitation, garde de tenant (connexion, 401, lecture seule, `/auth/me`), SLA contractuel, import et seeds, tests.
4. **Lot UI** : écrans admin (annuaire, fiche, licences et documents, couverture, contrat, invitation, candidatures, sélecteur de courtier dans les utilisateurs) et portail courtier (bannière, actions désactivées) ; tests de marqueurs.
5. **Validations finales** et carte de couverture.

## Complexity Tracking

| Écart | Justification | Alternative écartée |
|---|---|---|
| Élargissement de la matrice RBAC pour `admin_pays` (R13) | La spec validée exige qu'un Admin Pays crée et prépare les courtiers de son pays. Les actions de conformité restent réservées. | Laisser la préparation à la seule conformité : contraire à la spec, et goulot d'étranglement opérationnel. |
