# Feature Specification: Écarts PRD du parcours de demande de devis visiteur (spec 067, lot 1)

**Statut** : intégré dans main (PR #44, commit 50c0c84) ; recos-1-4 fusionnée via la PR #42.
**Surfaces impactées** :
- Web Publique Client (formulaire de devis, page de devis, comparateur, messages FR/EN) ;
- Backend API (demandes de devis, routage « offres/courtier choisis », notifications visiteur, worker) ;
- shared packages (`quote.contracts.ts`, `ops.contracts.ts`) ;
- database / Prisma / migrations (`0033_visitor_quote_journey_gaps`, additive) ;
- runtime (câblage `runtime-http-wiring.module.ts`, `assurmatch-runtime.ts`, tâche du worker).
Aucun changement du Back-office Courtier ni du Back-office Plateforme. Les parcours visiteur public et courtier/admin restent séparés.
**Références** : PRD `docs/prd_plateforme_comparaison_assurances.md` §14 (COMP-009), §16 (étapes et champs génériques), §17 (mode « sélection utilisateur »), §23 (rappel documents manquants) ; `docs/prd/prd_v0.3_completion_mise_en_production.md` (D-4) ; constitution v1.4.0 (II consentement, III activation progressive, IV données, VII routage responsable, VIII promesses publiques) ; specs 042 (multi-courtiers), 043, 050, 052 (offre choisie), 054, 062 (demandes de documents), 066 (correctif F1, non régressé).

## Hypothèses métier appliquées (à confirmer)

- **H1 (COMP-009)** : une demande peut viser jusqu'à 3 offres, **uniquement** si `multi_broker_routing_enabled` est ouvert **et** que le visiteur coche une case de consentement nommant chaque courtier. Sinon une seule offre (la première) est retenue, le reste est ignoré avec audit et le visiteur en est informé.
- **H2 (§16 étape 4)** : le visiteur peut choisir un courtier parmi les courtiers **éligibles** du pays et du produit. Le choix est routé en priorité s'il reste éligible au moment du routage (même mécanique que D-4 / offre choisie) ; sinon routage standard et le visiteur en est informé sur la confirmation. Une offre sélectionnée garde la priorité sur un choix direct.
- **H3 (§23)** : la relance « documents manquants » est un e-mail pointeur envoyé une seule fois, 3 jours après l'ouverture de la demande de documents (délai configurable `ASSURMATCH_DOCUMENT_REMINDER_DAYS`), avec lien de désinscription propre à cette finalité.

## Exigences

### Multi-offres (COMP-009)
- FR-001 : `additionalOfferIds` (2 au plus) s'ajoute à `selectedOfferId` ; plafond de 3 destinataires, un courtier une seule fois.
- FR-002 : sans flag `multi_broker_routing_enabled` ouvert ou sans `consent.multiBrokerAccepted`, les offres supplémentaires sont ignorées (audit `quoteRequestSelectedOfferIgnored`, `additionalOffersIgnored: true`).
- FR-003 : le consentement enregistré nomme chaque courtier (`intendedRecipient = partners:<id1>,<id2>,<id3>`) ; le routage n'assigne un courtier préféré que s'il est dans cette liste, éligible (politique déterministe, quota inclus) et le flag toujours ouvert ; sinon dégradation au premier courtier seul.
- FR-004 : le formulaire nomme chaque courtier dans la case de consentement et explique ce qui se passe sans consentement.
- FR-005 : sélection depuis le comparateur (`/compare`) : jusqu'à 3 offres cochées vers la page de devis (`?offerId=` répété).

### Choix direct du courtier (H2)
- FR-006 : `preferredPartnerId` ; vérifié éligible à la soumission puis au routage ; persisté (`chosenPartnerTenantId`) et conservé après une revue manuelle.
- FR-007 : confirmation : `chosenPartnerRetained`, `requestedPartnerCount`, `retainedPartnerCount` ; notice si le courtier choisi n'a pas été retenu.
- FR-008 : `GET /countries/:c/products/:p/quote-options` (public, sans donnée personnelle) fournit `multiBrokerAvailable`, `documentUploadEnabled`, les offres vérifiées et les courtiers éligibles.

### Documents facultatifs dans le formulaire
- FR-009 : étape « Documents (facultatif) » seulement si `product_document_upload_enabled` ; fichiers gardés en mémoire du navigateur, téléversés **après** la soumission avec le jeton retourné via le pipeline `quote-documents` existant (antivirus inclus) ; un échec ne bloque ni n'annule la demande et est signalé avec renvoi vers l'espace de suivi.

### Champs génériques
- FR-010 : `firstName` / `lastName` séparés dans le contrat et le formulaire ; le serveur compose `displayName` (compatibilité courtier et e-mails inchangée) ; `displayName` seul reste accepté.
- FR-011 : `marketingSource` déclaratif (`utm_*` de la page + hôte du referrer), sans cookie ni stockage, persisté sur la demande, jamais transmis au courtier.
- FR-012 : langue de la demande (`language`) déjà de bout en bout ; la préférence de contact n'est pas un champ du formulaire (voir rapport).

### Rappel documents manquants (§23)
- FR-013 : une demande de documents `open` depuis 3 jours produit au plus une relance par (demande de devis, assignation, courtier), e-mail pointeur bilingue, type `visitor_documents_reminder`, via le worker.
- FR-014 : pas de relance si la demande est remplie, annulée, anonymisée, si la demande de devis est annulée (retrait de consentement) ou si l'adresse est désinscrite.
- FR-015 : régression F1 : l'e-mail part uniquement vers l'adresse du prospect de la demande.

## Hors périmètre
Back-office, billing (lot 5), composants IA (lot 2), couverture PRD (lot 11). Capture de l'UTM d'une page d'arrivée antérieure à la page de devis (nécessiterait un stockage navigateur soumis au consentement cookies).

## Critères d'acceptation
Multi-offres impossible flag fermé (tests soumission et routage) ; consentement nommant chaque courtier ; choix direct prioritaire si éligible, sinon routage standard et information ; documents téléversés après soumission sans blocage ; prénom/nom séparés de bout en bout (courtier : nom complet, e-mails inchangés) ; relance unique à J+3 ; aucune adresse autre que celle de la demande ; tests unitaires et d'intégration ; typecheck, lint, vitest, scan de secrets verts.
