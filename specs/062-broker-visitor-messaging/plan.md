# Implementation Plan: Messagerie courtier ↔ visiteur, demandes de documents, SLA de première réponse, demandes de données

**Branch**: `062-broker-visitor-messaging` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Continuous Workflow Eligibility**: Eligible. Spec validée (décisions produit du 2026-10-15), aucun marqueur `[NEEDS CLARIFICATION]` ; les points non couverts sont des « DÉCISIONS À CONFIRMER » avec un choix conservateur appliqué. Aucun conflit constitutionnel (constitution 1.3.0) : voir le Constitution Check.

## Summary

Le courtier affecté (Starter ou CRM) échange par écrit avec le visiteur : messages texte + 3 pièces jointes analysées, historique en ajout seul, accusés de lecture, garde de formulations interdites qui bloque l'envoi, demandes de documents que le visiteur satisfait depuis son espace. Le visiteur utilise le lien magique de la spec 054 (aucun compte). Les e-mails ne portent qu'un pointeur. Le SLA gagne la « première réponse visible » (première proposition ou premier message). Le visiteur peut déposer une demande d'accès, de rectification ou d'effacement, traitée par la conformité dans « Rétention » ; l'effacement passe par le flux de la spec 046 et n'est jamais automatique. Un drapeau global non sensible `broker_visitor_messaging_enabled` (défaut `true`) coupe les écritures. Voir [research.md](./research.md), [data-model.md](./data-model.md), [contracts/messaging-api.md](./contracts/messaging-api.md).

## Technical Context

- **Langage** : TypeScript strict ; NestJS, Next.js 16, Prisma 7, zod.
- **Stockage** : PostgreSQL (migration `0031_broker_visitor_messaging`, additive) ; stockage documentaire et antivirus des specs 033/051/055 ; Redis pour les limites (`PublicAbuseGuardService`, compteurs par conversation).
- **Modules backend** : `lead-messaging` (messages, pièces jointes, demandes de documents, SLA) ; `data-requests` (demandes de données, file admin, lien avec `data-retention`) ; extensions de `notifications`, `leads` (SLA), `quote-documents`, `data-retention`, `feature-flags`.
- **Tests** : Vitest (unitaires, intégration HTTP de bout en bout en mémoire, garde-fous), Playwright « marqueurs de source » pour les trois apps web (le dépôt n'intercepte pas l'API dans les specs web), garde `controller-reachability`.
- **Surfaces impactées** : **Backend API** ; **base de données** (Prisma, migration 0031) ; **packages partagés** (`lead-messaging.ts`, `data-requests.ts`, `error-codes.ts`, `ops.contracts.ts`, `content-safety.ts`, `data-retention.contracts.ts`) ; **Web Publique Client** (espace de suivi : conversation, demandes de documents, demandes de données) ; **Back-office Courtier** (fiche lead Starter et CRM, notifications) ; **Back-office Plateforme** (file des demandes de données dans « Rétention », vue de conversation en lecture seule, drapeau) ; **notifications/worker**. Runtime Docker et lanceur local : **non impactés**.
- **Contraintes** : aucun jeton côté navigateur du courtier (relais serveur) ; aucun contenu de message dans un e-mail, un log ou un audit ; aucun fichier non sain servi ; aucune route de modification ou suppression de message ; Starter sans fonction CRM ; l'app publique n'embarque aucune route/privilège back-office.

## Constitution Check

*Gate avant la phase 0 : PASS. Re-vérification après la phase 1 : PASS.*

| Gate | Statut | Preuve |
|---|---|---|
| Plateforme technique (I) | Pass | Auteur = courtier nommé ; bandeau « plateforme technique, ni contrat ni garantie » ; aucune souscription/signature/paiement ; AssurMatch ne rédige ni ne recommande. |
| Consentement et licences (II) | Pass | Conversation uniquement pour une affectation acceptée à consentement actif ; lecture seule après retrait ; courtier suspendu en lecture seule ; formulations de l'art. II bloquées à l'envoi. |
| Architecture et activation (III) | Pass | Drapeau global `broker_visitor_messaging_enabled` ; visiteur sur routes publiques (jeton 054), courtier/admin sur routes back-office ; aucun traitement lourd synchrone au-delà de l'antivirus déjà utilisé ; routes distinctes `public`/`broker`/`admin`. |
| Sécurité (IV) | Pass | Tenant + rôle + agent assigné + affectation courante vérifiés ; 404 neutre côté visiteur ; limites de débit Redis, champ piège, validation stricte ; PII exclues des logs/e-mails/audits ; conformité/support en lecture seule auditée, support masqué. |
| IA (V) | N/A | Aucune IA. |
| Historique opposable (VI) | Pass | Messages en ajout seul, `createdAt`/auteur/lecture, audits horodatés, demandes de données historisées, anonymisation 046 conserve les preuves minimales (références, horodatages, types, statuts). |
| Routage (VII) | Pass | Aucune règle de routage modifiée ; la réaffectation ferme les demandes de documents et fige la conversation de l'ancien courtier. |
| UX et contenu (VIII) | Pass | Garde FR+EN accent-insensible sur tout texte courtier ; libellés visiteur sans « acheter/souscrire/contrat validé » (balayage de catalogue de messages) ; FR avec accents + EN. |
| Starter (critère 1) | **Conflit — amendement requis** | La liste fermée du critère n°1 (v1.3.0) ne couvre pas la messagerie bidirectionnelle ni les demandes de documents du Starter : amendement MINOR v1.4.0 proposé dans `constitution-amendment-proposal.md`, à ratifier par le propriétaire du produit (décision du 2026-10-15). Les exclusions CRM du Starter restent testées. Drapeau de coupure disponible. |
| Discipline de tests (IX) | Pass | RBAC et isolation, non-consentement, drapeau coupé, fichier infecté, formulation interdite, rate limit, ajout seul, dérogations de rôle, e-mails sans contenu, pas d'effacement automatique (voir tasks.md). |
| Gouvernance (XI) | Pass | Spec, plan, tâches, migration et rapport ; pas de commit sur `main`. |

## Project Structure

```text
packages/shared/contracts/{lead-messaging.ts, data-requests.ts (new), error-codes.ts, ops.contracts.ts, content-safety.ts, data-retention.contracts.ts, public-quote-status.ts, index.ts}
backend/prisma/schema.prisma + migrations/0031_broker_visitor_messaging/
backend/src/modules/lead-messaging/{lead-messaging.repository.ts, lead-messaging.service.ts, document-requests.service.ts, lead-messaging.module.ts} (new)
backend/src/modules/data-requests/{data-requests.repository.ts, data-requests.service.ts, data-requests.module.ts} (new)
backend/src/modules/audit-logs/{lead-messaging-audit-actions.ts, data-request-audit-actions.ts} (new)
backend/src/modules/leads/{lead-assignment.service.ts (recordFirstVisibleReply), lead-assignments.repository.ts, ...SLA calculations}
backend/src/modules/enterprise, dashboards, partners (SLA first visible reply fields)
backend/src/modules/lead-proposals/lead-proposals.service.ts (first visible reply on first proposal)
backend/src/modules/notifications/{quote-notification.service.ts, quote-notification-delivery.service.ts, email/*} (6 notification types, templates)
backend/src/modules/quote-documents (document-request fulfilment)
backend/src/modules/data-retention/{retention-policies.ts, retention-subjects.repository.ts, anonymization.service.ts, data-retention.service.ts}
backend/src/modules/feature-flags/default-flags.ts
backend/src/modules/http-wiring/{runtime-http-wiring.module.ts (blocks "// Spec 062"), lead-messaging-http.controllers.ts, data-requests-http.controllers.ts (new)}
backend/src/runtime/assurmatch-runtime.ts (block "// Spec 062")
apps/public/app/[locale]/quote-requests/[publicReference]/page.tsx (one mount), apps/public/app/components/tracking/{conversation-panel.tsx, document-requests-panel.tsx, data-request-panel.tsx, ...}, apps/public/app/api/quote-requests/[publicReference]/{conversations,document-requests}/**, apps/public/app/lib/public-api.ts, apps/public/messages/{fr,en}.json
apps/broker/app/{leads,crm/leads}/[leadAssignmentId]/{page.tsx (one mount), conversation/**, document-requests/**}, apps/broker/app/lib/{broker-api.ts, messaging-actions.ts, messaging-vocabulary.ts, ui/conversation-panel.tsx}, apps/broker/app/notifications/page.tsx (link)
apps/admin/app/compliance/{retention/page.tsx (link), data-requests/**}, apps/admin/app/quote-requests/[quoteRequestId]/{page.tsx (one mount), conversation card}, apps/admin/app/lib/{admin-api.ts, data-request-actions.ts}
backend/tests/{unit/lead-messaging, unit/data-requests, integration/lead-messaging, integration/data-requests, guardrails}, apps/{public,broker,admin}/tests/**
docs/scenarios/e2e-admin-courtier-devis.md (steps), docs/prd/prd_v0.3 (D-9 note)
```

## Phasing

1. **Fondation** (un agent) : contrats partagés, schéma, migration 0031, drapeau, constantes d'audit, garde de formulations renforcée.
2. **Backend** (deux propriétaires d'écriture, fichiers disjoints) : (a) messagerie + demandes de documents + SLA + notifications ; (b) demandes de données + rétention + vue admin. Les points d'intégration dans `runtime-http-wiring.module.ts` et `assurmatch-runtime.ts` sont des blocs `// Spec 062`.
3. **Fronts en parallèle** (un propriétaire par application) : public, courtier, admin.
4. **Revue en lecture seule** (sécurité/constitution, QA), corrections, validations finales.

## Complexity Tracking

| Écart | Pourquoi | Alternative rejetée |
|---|---|---|
| `firstVisibleReplyAt` dénormalisé sur `LeadAssignment` | Quatre calculs SLA lisent déjà des colonnes de l'affectation ; une colonne unique évite de dupliquer une jointure messages/propositions | Calcul à la volée par jointure |
| Contrôleurs HTTP dans des fichiers dédiés (`*-http.controllers.ts`) | Le fichier de câblage dépasse 2 600 lignes et est modifié en parallèle par d'autres lots ; précédent : `admin-operations-http.controllers.ts` | Tout dans `runtime-http-wiring.module.ts` |
| Clé de conversation `(affectation, courtier)` | Une réaffectation modifie la même ligne d'affectation | Table de conversation |
