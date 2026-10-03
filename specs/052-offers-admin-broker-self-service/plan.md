# Implementation Plan: Offres — admin, courtier, validation, versions et routage

**Branch**: `claude/inspiring-maxwell-58e67d` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Continuous Workflow Eligibility**: Eligible. L'utilisateur a validé la spec le 2026-10-03 ; elle ne contient aucun marqueur `[NEEDS CLARIFICATION]`.

## Summary

Cette spec introduit des versions d'offres. La ligne `Offer` reste la projection publiée (R1), ce qui laisse le public inchangé. Les courtiers propriétaires et managers gèrent leurs offres dans leur portail, sur leur seule couverture licenciée. La conformité valide avec contrôles (complétude, mentions, dates, éligibilité), refuse avec motif ou suspend. L'admin dispose d'une liste filtrée par périmètre, d'une file de validation, d'une comparaison de versions et de la sponsorisation. L'offre choisie par le visiteur est vérifiée et oriente le routage en priorité, sans jamais contourner l'éligibilité. Le consentement nomme le courtier de l'offre. Voir [research.md](./research.md), [data-model.md](./data-model.md) et [contracts/offers-api.md](./contracts/offers-api.md).

## Technical Context

**Language/Version**: TypeScript strict ; Node ≥ 24 visé, validé sous Node 22
**Primary Dependencies**: NestJS 11, Next.js 16.3, Prisma 7.8, zod 4
**Storage**: PostgreSQL (migration 0022 avec reprise de données)
**Testing**: Vitest (unitaires, intégration HTTP, garde-fous), Playwright en marqueurs de source
**Impacted Application(s)**:
- Backend API ;
- Back-office Plateforme (`apps/admin/app/offers`) ;
- Broker Back-office (`apps/broker/app/offers`) ;
- Web Publique Client (formulaire de devis et confirmation) ;
- packages partagés ;
- base de données.

**Constraints**: Aucun changement public sans validation ; aucun routage prioritaire hors éligibilité ; formulations interdites ; sponsorisation réservée à l'admin.

## Constitution Check

*Gate avant la phase 0 : PASS. Re-vérification après la phase 1 : PASS.*

| Gate | Statut | Preuve |
|---|---|---|
| Plateforme technique | Pass | Offres indicatives, mentions obligatoires, courtier responsable affiché. |
| Consentement et licences | Pass | Couverture licenciée exigée. Le consentement nomme le courtier de l'offre (R8). |
| Flags | Pass | Flags existants inchangés. Sponsorisation sous `sponsored_offers_enabled`. |
| Séparation des applications | Pass | Écrans courtier et admin séparés. Le public lit la projection publiée. |
| RBAC | Pass | Écriture pour Owner et Manager, isolation par courtier (404). Périmètre pays admin corrigé. Validation réservée à la conformité. Garde de lecture seule. |
| Données et audit | Pass | Versions immuables une fois décidées. AuditLog avant/après. Décision de routage enrichie. |
| Routage | Pass | Priorité au courtier de l'offre seulement s'il est éligible (déterministe). Raison journalisée. Le mode manuel est respecté. |
| IA | N/A | — |
| UX | Pass | Garde de formulations. « Sponsorisé » visible. |
| Tests | Pass | Unitaires (complétude, versions, routage prioritaire), intégration (RBAC, isolation, validation, refus, suspension, routage, offre falsifiée), marqueurs admin, courtier et public. |

## Project Structure

```text
packages/shared/contracts/{offer-content.ts (new), quote.contracts.ts, error-codes.ts}
packages/shared/rbac/assurmatch-role-matrix.ts
backend/prisma/schema.prisma + migrations/0022_offer_versions_selected_offer_routing/
backend/src/modules/offers/ (offer-versions.repository.ts, offer-lifecycle.service.ts, broker-offers.service.ts, offer-admin.service.ts)
backend/src/modules/leads/quote-routing.service.ts, routing/routing-decision*, quote-requests/quote-submission.service.ts
backend/src/modules/quote-forms (offerId → broker name), notifications (types)
backend/src/modules/http-wiring/runtime-http-wiring.module.ts
apps/admin/app/offers/ (list, [offerId], queue), apps/broker/app/offers/ (list, new, [offerId])
apps/public/app (quote form offerId + confirmation message)
scripts/local-app/seed-broker-demo.ts, backend/tests/**
```

## Phasing

1. Contrats, matrice RBAC, schéma, migration 0022 et reprise des données.
2. Backend : versions et cycle de vie, routes courtier et admin, routage et consentement, notifications, seeds et tests.
3. Interfaces admin et courtier (un agent) et site public (un agent), en parallèle sur des fichiers disjoints.
4. Validations finales et carte de couverture.

## Complexity Tracking

| Écart | Justification |
|---|---|
| Restriction de la validation d'offre à la conformité (R4) | Exigence FR-011 de la spec validée. Les tests RBAC existants sont ajustés. |
