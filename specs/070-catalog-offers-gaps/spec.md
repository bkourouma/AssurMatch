# Feature Specification: Écarts PRD catalogue et offres (spec 070, lot 4)

**Statut** : implémentée sur la branche `orch/2026-10-21-ecarts-prd-lot-4` (base `integration/recos-1-4`).
**Surfaces impactées** : Backend API (produits, catégories, assureurs, offres, checklist d'activation, IA), Back-office Plateforme/Admin (catalogue, offres, checklist), Back-office Courtier (types d'offres, résumé IA en lecture seule), packages partagés (contrats), base de données (Prisma, migration `0034_catalog_offers_gaps`), scripts de seed de référence. Aucun changement du site public : les offres privées n'y apparaissent jamais. Les parcours visiteur public et administrateur/courtier restent séparés.
**Références** : constitution v1.4.0 (offres indicatives, aucune publication sans validation conformité, IA fermée par défaut avec validation humaine), PRD §8, §12 (PROD-001 à 010), §13 (types d'offres, OFFER-002, OFFER-010), §35, §36 ; specs 032 (critères de comparaison), 050 (catalogue, activation), 052 (offres versionnées, validation conformité).

## US1 — Catégories produit administrables (PROD-001)
- FR-001 : un administrateur crée, modifie et retire les catégories de produits (clé immuable, nom FR, nom EN, description, ordre). Seule une catégorie `active` peut être attribuée à un produit.
- FR-002 : retirer une catégorie est refusé tant que des produits non retirés y sont rattachés.
- FR-003 : le seed de référence crée les 14 catégories du PRD §12 (`active`) et ne réécrit jamais une catégorie existante, ni la catégorie d'un produit déjà classé.
- FR-004 : le formulaire produit du back-office propose la catégorie ; la fiche publique de conditions (`requirements`) la renvoie.

## US2 — Conditions d'un produit : texte légal, documents requis, versions (PROD-005, 007, 008, 009)
- FR-005 : chaque produit porte un texte légal et un disclaimer en FR et en EN (`legalNotice`), contrôlés par la liste de formulations interdites.
- FR-006 : chaque produit porte la liste des types de documents demandés (`requiredDocumentKinds`, vocabulaire des justificatifs visiteur). L'étape « documents » du devis (lot 1) et l'activation la lisent.
- FR-007 : toute modification du contenu d'un produit crée une version (numéro, auteur, date, motif, diff champ par champ) consultable dans le back-office ; une modification sans effet ne crée rien ; statut et flags gardent leur propre historique.
- FR-008 : la mise en public d'un produit (statut `public` ou flag global `product_public_enabled`) est refusée tant que la checklist §36 a un point bloquant ; la désactivation reste toujours libre.

## US3 — Référentiel Assureur (PRD §8)
- FR-009 : un administrateur gère un référentiel d'assureurs par pays (nom, code unique par pays, numéro d'agrément, statut actif/suspendu/retiré).
- FR-010 : une offre peut être reliée à un assureur (`insurerId`), du même pays et actif ; `insurerName` reste le nom affiché et reste utilisable seul. La migration reprend les noms d'assureur existants sans rien supprimer ni réécrire.

## US4 — Types d'offres « assureur » et « privée » (PRD §13)
- FR-011 : l'offre « assureur » est saisie par l'administrateur uniquement et validée par la conformité comme toute offre ; elle reste indicative.
- FR-012 : l'offre « privée » est visible uniquement du courtier propriétaire et de l'administrateur ; elle n'est jamais publique, jamais comparée, jamais comptée dans les assureurs ou la checklist (politique de publication `offer_private`). Le type est immuable après création.

## US5 — Résumé IA d'offre (OFFER-010)
- FR-013 : un résumé IA d'offre (`offer_summary`) est généré à la demande d'un administrateur, uniquement si l'IA est ouverte (flag global, pays), puis validé par un humain. Admin et courtier propriétaire le lisent en lecture seule, étiqueté « contenu généré par IA ». Fermé par défaut : aucun texte tant que l'IA est fermée ou le résumé non validé.

## US6 — Checklists §35 et §36 complètes
- FR-014 : la checklist pays contrôle les règles de routage configurées (calculé) et quatre attestations de conformité (notifications testées, support prêt, plan de désactivation rapide, décision IA explicite).
- FR-015 : la checklist produit contrôle les documents requis, les règles de scoring, les disclaimers FR et EN (calculés) et quatre attestations (routage testé, parcours testé, garde-fous IA, métriques du dashboard).
- FR-016 : une attestation est posée ou révoquée par la conformité (ou le super administrateur) avec MFA ; elle porte auteur, date et note, est auditée, et ne vaut que pour sa portée. L'ouverture publique d'un pays reste bloquée tant qu'un point manque.

## Hypothèses prudentes appliquées
Voir `plan.md` (section Décisions). Aucun `[NEEDS CLARIFICATION]`.

## Critères d'acceptation
14 catégories seedées et administrables ; texte légal et documents requis éditables, versionnés et historisés ; assureurs administrables et liés aux offres ; offres privées jamais visibles publiquement (tests) ; offres « assureur » validées par la conformité (tests) ; résumé IA fermé par défaut ; checklists §35/§36 complètes, ouverture publique bloquée tant qu'un point manque ; typecheck, lint, vitest, Playwright (marqueurs de source) et scan de secrets verts.
