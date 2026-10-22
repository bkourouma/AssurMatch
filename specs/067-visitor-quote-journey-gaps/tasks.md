# Tâches : écarts PRD du parcours de devis visiteur (spec 067)

**Spec** : `spec.md` | **Plan** : `plan.md`

- [x] T001 Prisma : migration additive `0033_visitor_quote_journey_gaps` (`QuoteRequest.additionalOfferIds/chosenPartnerTenantId/marketingSource`, `LeadDocumentRequest.reminderQueuedAt` + index, `NotificationType.visitor_documents_reminder`) ; `prisma-migrations.spec.ts` mis à jour.
- [x] T002 Contrats `quote.contracts.ts` : `firstName/lastName`, `additionalOfferIds`, `preferredPartnerId`, `marketingSource`, champs de confirmation, `quoteOptionsResponseSchema` ; `ops.contracts.ts` : `visitor_documents_reminder`.
- [x] T003 Soumission (`quote-submission.service.ts`, repository mémoire + Prisma) : offres supplémentaires gardées par le flag et le consentement, consentement `partners:` nommant chaque courtier, choix direct éligible, nom composé, source marketing, préférés recalculés après revue manuelle.
- [x] T004 Routage (`quote-routing.service.ts`, entrée « offres/courtier choisis ») : préférés multiples filtrés par flag + consentement nommé + éligibilité + règle `exclusive`, plafond 3, dégradation auditée au premier courtier.
- [x] T005 `QuoteOptionsService` + `GET /countries/:c/products/:p/quote-options` (câblage `// Lot 1 (spec 067)` dans runtime et contrôleurs HTTP).
- [x] T006 Site public : formulaire (prénom/nom, courtier souhaité, consentement multi-offres nommant les courtiers, étape Documents facultative avec téléversement après soumission, source marketing, notices de confirmation), page de devis (offres multiples, action sans JavaScript), comparateur (sélection de 3 offres), messages FR/EN (QuoteForm, Compare).
- [x] T007 Rappel documents manquants : `VisitorDocumentReminderService`, type `visitor_documents_reminder`, e-mail bilingue pointeur, finalité de désinscription `document_reminder`, méthodes de dépôt lead-messaging, tâche `document-reminders` du worker.
- [x] T008 Tests : unitaires (soumission, routage, options, relance, dépôt, helpers publics) et intégration HTTP `quote-journey-067-runtime-http.spec.ts` (flag fermé, flag ouvert, choix direct, nom complet côté courtier, source marketing, relance J+3 unique, F1, désinscription).
- [x] T009 Validations : typecheck, lint, vitest (361 fichiers), Playwright `test:web` (specs de sources), `prisma validate`, scan de secrets.
