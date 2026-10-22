# Implementation Plan: Écarts PRD du parcours de devis visiteur (spec 067)

**Spec** : `spec.md` | **Branche** : `orch/2026-10-21-ecarts-prd-lot-1`
**Surfaces impactées** : Web Publique Client ; Backend API ; shared packages ; database / Prisma / migrations (`0033`, additive) ; runtime / worker (câblage). Pas de Back-office Courtier ni Plateforme.

## Contexte technique
TypeScript, NestJS (runtime `AssurMatchRuntime`), Prisma/PostgreSQL, Next.js (apps/public, next-intl FR/EN), Zod (contrats partagés), Vitest. Aucune nouvelle dépendance.

## Conformité constitution
- II / VII : le consentement est la source de vérité du nombre de destinataires. Un consentement `partners:<ids>` nomme les courtiers ; le routage revérifie le flag, le consentement enregistré et l'éligibilité déterministe (aucune IA dans la décision).
- III : multi-offres derrière `multi_broker_routing_enabled` (fermé par défaut) ; étape documents derrière `product_document_upload_enabled`.
- IV : pas de cookie ni de stockage navigateur pour la source marketing ; la source n'est jamais transmise au courtier ; relance sans contenu (pointeur uniquement) et désinscriptible.
- VIII : textes indicatifs, aucune promesse ; garde-fous de contenu existants inchangés.
- F1 (spec 066) : aucune modification de la résolution d'adresse des e-mails visiteur ; tests de non-régression.

## Décisions de conception
1. **Données** (migration additive `0033_visitor_quote_journey_gaps`) : `QuoteRequest.additionalOfferIds String[]`, `chosenPartnerTenantId`, `marketingSource Json?` ; `LeadDocumentRequest.reminderQueuedAt` + index ; `NotificationType.visitor_documents_reminder`.
2. **Routage** : `RoutableQuoteRequest.preferredPartnerTenantIds` (ordre = priorité). Un seul préféré : comportement spec 052 inchangé. Plusieurs : filtre flag + consentement `partners:` + éligibilité + règle `exclusive`, plafond 3, sinon dégradation au premier. Les préférés sont recalculés (et revérifiés) après une revue manuelle.
3. **Nom** : le contrat accepte `firstName`/`lastName` ; le serveur compose `Prospect.displayName` (un seul champ de stockage, aucune migration `Prospect`, courtier et e-mails inchangés).
4. **Options publiques** : `GET /countries/:c/products/:p/quote-options` (service `QuoteOptionsService`) isole les drapeaux et la liste des courtiers éligibles sans toucher à `quote-form`.
5. **Documents** : fichiers gardés en mémoire côté client puis envoyés par `uploadQuoteDocument` après la soumission ; sans JavaScript l'étape n'existe pas (ajout depuis l'espace de suivi).
6. **Relance** : `VisitorDocumentReminderService` (tâche `document-reminders` du worker, `runIfDue`), regroupement par (demande, assignation, courtier), clé de dédoublonnage unique + `reminderQueuedAt`, finalité de désinscription `document_reminder`.

## Fichiers principaux
`packages/shared/contracts/quote.contracts.ts`, `ops.contracts.ts` ; `backend/prisma/schema.prisma` + migration 0033 ; `backend/src/modules/quote-requests/{quote-submission.service,quote-requests.repository,quote-options.service}.ts` ; `backend/src/modules/leads/quote-routing.service.ts` ; `backend/src/modules/notifications/**` ; `backend/src/modules/lead-messaging/**` (deux méthodes de dépôt) ; câblage `runtime-http-wiring.module.ts`, `assurmatch-runtime.ts`, `scripts/worker/assurmatch-worker.ts` (blocs `// Lot 1 (spec 067)`) ; `apps/public/app/components/quote-form.tsx`, page de devis, `compare/page.tsx`, `lib/{public-api,quote-journey}.ts`, `messages/{fr,en}.json` (QuoteForm, Offers, Compare).

## Validation
`npm run typecheck`, `npm run lint`, `NODE_ENV=test npm run test`, `npm run test:web` (nécessite la stack locale, non exécuté ici), `prisma validate`, `node scripts/ci/secret-scan.mjs`.
