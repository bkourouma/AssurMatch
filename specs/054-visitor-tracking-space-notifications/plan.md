# Implementation Plan: Espace de suivi visiteur, courtier nommé et notifications

**Branch**: `claude/inspiring-maxwell-58e67d` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Continuous Workflow Eligibility**: Eligible. La spec a été validée par l'utilisateur le 2026-10-03 et ne contient aucun marqueur `[NEEDS CLARIFICATION]`.

## Summary

Cette spec donne au visiteur un espace de suivi sans compte. L'accès passe par des jetons à durée limitée, hachés et vérifiés en temps constant, émis à la soumission puis dans chaque e-mail, et renouvelables par référence et e-mail. Le statut public est une projection pure des affectations et du CRM, qui nomme le courtier sans exposer les statuts internes. Le visiteur reçoit un e-mail bilingue à chaque étape publique, grâce à des évènements de lead complétés et à des notifications idempotentes. La plan corrige aussi l'enquête de satisfaction (jeton réel, pages `/avis` et `/en/feedback`), le message de revue manuelle et la protection du jeton dans l'adresse. Voir [research.md](./research.md) et [contracts/visitor-tracking-api.md](./contracts/visitor-tracking-api.md).

## Technical Context

- **Langage et versions** : TypeScript strict. NestJS 11, Next.js 16.3 avec next-intl, Prisma 7.8, zod 4.
- **Stockage** : PostgreSQL (migration 0023) ; Redis pour les limites de débit.
- **Tests** : Vitest (unitaires, intégration HTTP, garde-fous de formulation) ; Playwright en marqueurs de source pour le site public.
- **Applications impactées** : Backend API, Web Publique Client, notifications et worker, packages partagés, base de données. Back-offices non modifiés.
- **Contraintes** :
  - aucun jeton en clair stocké ;
  - réponses identiques pour un accès refusé ou un renvoi de lien ;
  - aucune donnée du formulaire dans les e-mails ;
  - aucun statut interne exposé.

## Constitution Check

*Gate avant la phase 0 : PASS. Re-vérification après la phase 1 : PASS.*

| Gate | Statut | Preuve |
|---|---|---|
| Plateforme technique | Pass | Statuts d'acheminement, rappel du rôle technique dans les e-mails. |
| Consentement | Pass | Retrait conservé et confirmé par e-mail ; courtier destinataire nommé. |
| Séparation des applications | Pass | Jeton visiteur propre à une demande ; aucune session back-office ; pages publiques uniquement. |
| Sécurité | Pass | Jetons hachés, TTL, temps constant, révocables. Débit limité. Réponses neutres. En-têtes `no-referrer` et `noindex`. |
| Données et audit | Pass | Audit des émissions, renvois, accès et refus, sans données personnelles. Notifications idempotentes et persistées. |
| Routage | Pass | Aucune décision modifiée ; seuls des évènements sont ajoutés. |
| Contenu | Pass | Gabarits FR et EN avec garde de formulations ; revue manuelle jamais annoncée « transmise ». |
| Tests | Pass | Unitaires (projection, jetons, gabarits), intégration (accès, renvoi, notifications par étape, enquête), marqueurs publics. |

## Project Structure

```text
packages/shared/contracts/public-quote-status.ts (new), quote.contracts.ts, ops.contracts.ts (types), error-codes.ts
backend/prisma/schema.prisma + migrations/0023_visitor_access_tokens_notifications/
backend/src/modules/quote-requests/visitor-access.service.ts (new), quote-submission.service.ts, quote-requests.repository.ts
backend/src/modules/notifications/{quote-notification.service.ts, quote-notification-delivery.service.ts, visitor-quote-notifier.ts (new), email/quote-email-template.service.ts, email/email-delivery.service.ts}
backend/src/modules/leads/{lead-assignment.service.ts, broker-starter-lead-actions.service.ts, broker-crm-pipeline.service.ts}, routing/lead-reassignment.service.ts
backend/src/modules/satisfaction-surveys/{satisfaction-surveys-drain.service.ts, satisfaction-survey-email-template.service.ts, satisfaction-survey-trigger.service.ts}
backend/src/modules/common/abuse/public-abuse-guard.service.ts
backend/src/modules/http-wiring/runtime-http-wiring.module.ts, runtime/assurmatch-runtime.ts
apps/public/app/[locale]/quote-requests/[publicReference]/page.tsx, [locale]/track/page.tsx (new), [locale]/feedback/[publicReference]/page.tsx (new), i18n/routing.ts, robots.ts, next.config.ts, lib/public-api.ts, messages/{fr,en}.json
backend/tests/**, apps/public/tests/**
```

## Phasing

1. Contrats, schéma et migration 0023.
2. Backend : accès, statut, renvoi, évènements, notifications, gabarits, enquête, tests.
3. Site public : espace, suivi, avis, en-têtes, robots, messages, tests.
4. Validations finales et carte de couverture.
