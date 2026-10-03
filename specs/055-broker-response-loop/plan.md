# Implementation Plan: Réponse du courtier au visiteur et suite donnée par le visiteur

**Branch**: `claude/inspiring-maxwell-58e67d` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Continuous Workflow Eligibility**: Eligible. Spec validée le 2026-10-03, aucun marqueur `[NEEDS CLARIFICATION]`, constitution 1.3.0 (décision D-5) applicable.

## Summary

Le courtier affecté, Starter (« Répondre au visiteur ») ou CRM Pro/Enterprise, envoie au visiteur une proposition indicative non contractuelle : message, prime ou fourchette, devise, garanties, validité et PDF facultatif analysé par l'antivirus. Une proposition envoyée est immuable (retrait puis nouvel envoi). Le visiteur la voit dans son espace de suivi (statut « Proposition disponible »), reçoit un e-mail FR/EN avec un lien neuf, télécharge le PDF avec son jeton et répond : intéressé (rappel), pas de suite (motif) ou question. Le courtier est notifié (in-app + e-mail pointeur) ; le statut CRM n'est jamais modifié par la réponse, seulement suggéré. Le courtier affecté voit les coordonnées complètes (consultation auditée), masquées après un retrait du consentement. Le CRM gagne ses écrans manquants : assignation à un conseiller, documents internes réels, chronologie des propositions, Kanban. Voir [research.md](./research.md), [data-model.md](./data-model.md) et [contracts/broker-response-api.md](./contracts/broker-response-api.md).

## Technical Context

- **Langage** : TypeScript strict ; NestJS 11, Next.js 16.3, Prisma 7.8, zod 4.
- **Stockage** : PostgreSQL (migration `0028_broker_response_loop`, renumérotée à la fusion) ; stockage documentaire et antivirus des specs 033/051 ; Redis pour les limites.
- **Tests** : Vitest (unitaires, intégration HTTP de bout en bout), Playwright en marqueurs de source pour le back-office courtier.
- **Surfaces impactées** : Backend API ; Broker Back-office (Starter et CRM) ; notifications et worker ; base de données ; packages partagés (contrats). **Web Publique Client** : contrat exposé seulement (`proposals` dans la vue de statut, routes de document et de réponse) ; l'écran visiteur est livré ensuite par un autre agent (aucune modification de `apps/public` ici). Back-office Plateforme/Admin : aucun changement.
- **Contraintes** : aucun jeton côté navigateur du courtier (relais serveur) ; aucun fichier non sain servi ; aucune donnée de réponse visiteur dans les e-mails ; aucun statut CRM modifié par le visiteur ; Starter sans fonction CRM.

## Constitution Check

*Gate avant la phase 0 : PASS. Re-vérification après la phase 1 : PASS.*

| Gate | Statut | Preuve |
|---|---|---|
| Plateforme technique (I) | Pass | Proposition émise par le courtier nommé, mention « Proposition indicative non contractuelle, à confirmer par le courtier » (FR/EN), aucune comparaison/classement/recommandation, aucune signature ni paiement ; « intéressé » = demande de rappel. |
| Consentement (II) | Pass | Envoi refusé et propositions masquées après retrait ; coordonnées masquées pour tous les courtiers ; documents internes jamais exposés au visiteur. |
| Séparation des applications (III) | Pass | Visiteur : jeton 054 sur routes publiques ; courtier : session back-office + MFA ; relais serveur Next pour fichiers. Aucun nouveau flag ; multi-courtiers inchangé. |
| Sécurité et accès (IV) | Pass | Tenant, rôle, agent assigné, lecture seule et suspension vérifiés (403 `PARTNER_SUSPENDED` avant parsing) ; inventaire `BROKER_TENANT_WRITE_GUARDED` complété ; 404 neutre côté visiteur ; limites de débit ; `no-store`/`nosniff`. |
| IA (V) | N/A | Aucune rédaction automatique. |
| Données et historique (VI) | Pass | Propositions immuables (seul le cycle de vie change), réponses en ajout seul, historique de lead (`proposal_sent`, `proposal_withdrawn`, `visitor_responded`), audits sans contenu ; anonymisation spec 046 étendue. |
| Routage (VII) | Pass | Aucune règle modifiée ; la réaffectation ferme les propositions de l'ancien courtier. |
| UX et contenu (VIII) | Pass | Garde des formulations FR + EN sur tout texte saisi (`FORBIDDEN_WORDING` cite la formulation) ; e-mails gardés ; aucun « acceptée/contrat/souscrire » côté visiteur. |
| Starter (critère 1, v1.3.0) | Pass | Starter : « Répondre au visiteur » seulement ; pas de Kanban, pipeline, assignation, tâches, rappels (tests HTTP et marqueurs). |
| Tests (IX) | Pass | Isolation courtiers/visiteurs, Starter sans CRM, suspendu, non accepté, formulation interdite, fichier infecté, immutabilité, réponse sans effet CRM, retrait du consentement, réaffectation, notifications uniques, assignation agent, documents internes. |

## Project Structure

```text
packages/shared/contracts/lead-proposals.ts (new), public-quote-status.ts (proposals, proposal_available), content-safety.ts (EN), quote.contracts.ts, ops.contracts.ts, error-codes.ts
backend/prisma/schema.prisma + migrations/0028_broker_response_loop/
backend/src/modules/lead-proposals/{lead-proposals.repository.ts, lead-proposals.service.ts, lead-documents.service.ts, scanned-upload.ts, lead-proposals.module.ts} (new)
backend/src/modules/leads/{lead-contact-policy.ts (new), broker-crm-leads.service.ts, broker-starter-leads.service.ts, lead-assignment.service.ts, lead-assignments.repository.ts, crm-activity.repository.ts, leads.module.ts}
backend/src/modules/notifications/{quote-notification.service.ts, quote-notification-delivery.service.ts, email/quote-email-template.service.ts, email/email-delivery.service.ts}
backend/src/modules/quote-requests/{quote-submission.service.ts, quote-requests.module.ts}, data-retention/retention-subjects.repository.ts, audit-logs/lead-proposal-audit-actions.ts (new)
backend/src/modules/http-wiring/runtime-http-wiring.module.ts, runtime/assurmatch-runtime.ts
apps/broker/app/{leads/[id]/page.tsx, leads/[id]/proposals/**, crm/leads/[id]/page.tsx, crm/leads/[id]/{proposals,documents}/**, crm/kanban/page.tsx}, app/lib/{broker-api.ts, broker-upload.ts, proposal-actions.ts, proposal-vocabulary.ts, broker-permissions.ts, lead-vocabulary.ts, ui/proposal-panel.tsx, ui/broker-shell.tsx}
backend/tests/{integration/leads/broker-response-loop-runtime-http.spec.ts, unit/lead-proposals/lead-proposals.spec.ts, integration/prisma-migrations.spec.ts}, apps/broker/tests/leads/broker-response-loop.spec.ts
```

## Phasing

1. Contrats partagés, schéma et migration 0028.
2. Backend : coordonnées, propositions (Starter + CRM), fichiers, statut public, réponses visiteur, notifications, documents internes, persistance de l'état CRM, anonymisation, routes et inventaire.
3. Back-office courtier : « Répondre au visiteur », onglet Propositions, coordonnées complètes, assignation, documents internes, Kanban, relais serveur.
4. Tests et validations finales.

## Complexity Tracking

| Écart | Pourquoi | Alternative rejetée |
|---|---|---|
| Écriture de `BrokerCrmLeadState` ajoutée | Sans elle, FR-011 (`devis_envoye`) et tout statut CRM sont perdus en PostgreSQL | Laisser l'écart : FR-011 non tenu hors tests |
| Nouvelle table au lieu d'étendre `BrokerCrmProposal` | Immutabilité, statut, fichier, propriété par courtier ; l'ancienne table garde les références internes | Migration destructive de l'existant |
