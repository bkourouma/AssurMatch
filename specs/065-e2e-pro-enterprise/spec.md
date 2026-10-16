# Feature Specification: Parcours de bout en bout Pro / Enterprise (lot 3, phase A)

**Status**: Validated (demande du superviseur du 2026-10-15, workflow continu)
**Input**: PRD §18, §19, §20, §22, §29, §32.1, §32.2, §32.6, §32.7 ; PRD v0.3 §4 (SC-01 à SC-10) ; spec 059 (E2E sur pile Docker vierge).
**Impacted surfaces**: tests (Playwright multi-applications), CI (le job `e2e` exécute les nouveaux fichiers), documentation. Aucun code produit modifié : un défaut produit révélé par un parcours est consigné (étapes, attendu, obtenu), pas corrigé ici.

## Why
Seul le plan Starter est couvert de bout en bout (spec 059). Les plans Pro et Enterprise (CRM, rôles, agences, SLA), l'ouverture d'un second pays (Sénégal) et deux cas interdits (licence expirée, retrait de consentement) n'ont aucun parcours navigateur.

## User stories
1. **(P1) Pro avec CRM (PRD §32.2).** Un courtier Pro, dont le plan est posé par l'admin et dont le module `broker_crm_enabled` est activé par l'écran des flags, voit ses leads dans la liste et le Kanban du CRM, fait avancer un lead dans le pipeline, ajoute une note interne, une tâche et un rappel, l'assigne à un agent, le marque gagné, en marque un autre perdu ; l'historique est complet et les KPI du dashboard bougent.
2. **(P1) Isolation par rôle (PRD §32.1).** Un Broker Agent ne voit que ses leads (UI et API 403/404), un Broker Read-only ne peut rien modifier, le propriétaire Starter n'a pas le CRM (menu masqué, API refusée).
3. **(P1) IA désactivée (PRD §32.7).** Flags IA fermés : aucune action IA n'est proposée ni appelée dans le détail d'un lead CRM.
4. **(P2) Enterprise (spec 040).** Création et modification d'agences ; paramètres SLA visibles du courtier et de l'admin.
5. **(P1) Cas interdits non couverts (PRD §32.6, §20, §22).** Licence expirée : courtier exclu du routage et alerte de conformité ; retrait de consentement par le visiteur : lead clos/retiré chez le courtier et e-mail de confirmation au visiteur.
6. **(P2) Ouverture du Sénégal (SC-01).** Catalogue, consentements, formulaires, flags, checklist d'activation, jusqu'à la page publique SN.

## Requirements
- **FR-001** Chaque parcours part de la pile vierge de la spec 059 (seed de référence + premier Super Admin, aucun seed démo) et de l'état laissé par `scenario-core` ; les courtiers Pro/Enterprise/cas interdits sont créés par l'admin (plan choisi sur le formulaire), activés par e-mail et MFA, avec leur propre offre publiée.
- **FR-002** Le réglage de `broker_crm_enabled` est idempotent (valeur par défaut `false` aujourd'hui, `true` après le lot 063) : il passe par l'écran `/feature-flags` et ne fait rien si le flag est déjà actif.
- **FR-003** Aucun SQL direct, aucun appel API de préparation : tout passe par les écrans réels. Les appels API directs ne servent qu'à prouver un refus (403/404).
- **FR-004** Les nouveaux fichiers sont déclarés dans `playwright.e2e.config.ts` (projets `pro-enterprise` et `senegal`), donc exécutés par `npm run test:e2e:stack` et par le job CI `e2e`.
- **FR-005** Chaque fichier est rejouable (données uniques) et n'altère pas les parcours existants ; le Sénégal n'est ouvert qu'après la vérification SC-09a qu'il est fermé.

## Success criteria
- `npm run test:e2e:stack` est vert sur pile vierge avec les parcours existants et nouveaux.
- Durée totale documentée dans le rapport de lot.
- Les défauts produits trouvés sont consignés avec étapes, attendu et obtenu.

## Hors périmètre
Correction du code produit ; intégration des lots 062 à 064 (phase B) ; données démo.
