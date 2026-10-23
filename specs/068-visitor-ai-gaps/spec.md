# Feature Specification: Fermer les écarts IA côté visiteur (explication des garanties, aide au remplissage, explication des différences)

**Status**: Validated (lot 2 « IA visiteur » mandaté par le superviseur le 2026-10-21 ; spec standard, aucun `[NEEDS CLARIFICATION]`)
**Input**: PRD §10.1, §10.4, §14 COMP-010, §32.7, §32.8 ; specs 034 (passerelle IA, garde-fous, minimisation, repli déterministe, audit), 050 (décision D2, « assistant de lecture »), 063 (le formulaire de devis fournit les vraies réponses).
**Impacted surfaces**: Backend API (module `ai` : deux nouveaux types visiteur, dépendance « offres publiées »), shared packages (`ai.contracts.ts`), Web Publique Client (page détail d'offre, page de comparaison, formulaire de devis par un montage minimal). **Back-office Partenaires/Plateforme, Broker Back-office, base de données, runtime/Docker : aucun changement.** Les parcours visiteur (anonymes) restent séparés des parcours authentifiés.

## Why
Le PRD §10.1 liste trois fonctions IA visiteur dont l'écran n'existe pas ou qui n'est branchée nulle part :

1. « Explication simple des garanties » (P1) : aucun type d'assistance ni écran.
2. « Aide au remplissage du formulaire » (P1) : `visitor_form_help` existe côté backend mais aucun écran ne l'appelle.
3. COMP-010 « IA pour expliquer les différences entre offres » (P1) : absente.

## User stories
1. **(P1) Visiteur sur une offre.** Il demande « Expliquer les garanties » et lit une reformulation en langage clair des garanties de l'offre publiée, avec la mention « Contenu généré par IA, à confirmer par le courtier partenaire ».
2. **(P1) Visiteur dans le formulaire de devis.** Un bouton « ? » à côté de chaque champ explique à quoi sert le champ et comment le renseigner. Aucune valeur saisie ni donnée personnelle n'est envoyée.
3. **(P1) Visiteur sur la comparaison (2 à 4 offres).** Il demande « Expliquer les différences » et lit un résumé neutre des écarts (prix, franchise, plafond, garanties, délai). Jamais de classement, jamais de recommandation de souscription.

## Requirements
- **FR-001 (types).** Deux nouveaux types dans le contrat partagé : `visitor_guarantee_explainer` ({ countryCode, productKey, offerId, language }) et `visitor_compare_explainer` ({ countryCode, productKey, offerIds[2..4], language }). Servis par la route générique existante `POST /ai/visitor/:assistType` (file d'attente + lecture par `GET /ai/visitor/interactions/:id`).
- **FR-002 (source des faits).** Le serveur résout lui-même les offres à partir de leurs identifiants et n'accepte que des offres publiquement visibles pour le pays et le produit annoncés (mêmes règles que `list`/`detail`/`compare`). Aucun texte d'offre venant du client n'atteint le modèle.
- **FR-003 (fermé par défaut).** Les deux types dépendent de `ai_summary_enabled`, `country_ai_enabled` et `product_ai_form_assistant_enabled` (comme `visitor_form_help`). Flag fermé : interaction `refused` / `ai_disabled`, aucun appel fournisseur, audit `modelCall:false` ; côté UI, aucun bouton ni aucune zone d'assistance (PRD §32.7).
- **FR-004 (garde-fous).** Les sorties de tous les types `visitor_*` sont refusées si elles recommandent de souscrire ou de choisir une offre (« nous vous conseillons », « vous devriez souscrire », « choisissez cette offre », « you should choose », etc.), en plus des formulations interdites existantes. Le résumé de comparaison décrit des écarts factuels, jamais un classement (PRD §10.1 garde-fous).
- **FR-005 (repli déterministe).** Le `TemplateAiProvider` produit des rendus FR et EN pour les deux types (et pour `visitor_form_help`) à partir des seules données minimisées ; il sert quand le fournisseur échoue ou n'est pas configuré.
- **FR-006 (minimisation, quotas, audit).** La passerelle minimise l'entrée, applique le quota visiteur (20/h/IP côté service, 40/jour côté passerelle), trace la file, le fournisseur, les hachages et le refus. Ni prompt ni texte de sortie dans l'audit.
- **FR-007 (aucune application automatique, mention visible).** Le texte n'est jamais appliqué (ni dans un champ, ni dans la sélection d'offre). Chaque affichage porte l'étiquette de transparence permanente et la ligne « Contenu généré par IA, à confirmer par le courtier partenaire ».
- **FR-008 (aide par champ).** Un fournisseur de contexte lit une seule fois la disponibilité de `visitor_form_help` ; le bouton « ? » est rendu par le composant `Field` seulement si l'assistance est ouverte. Corps de requête : `countryCode`, `productKey`, `fieldKey`, `language`. Le serveur valide `fieldKey` contre le formulaire publié du pays et du produit (`VisitorAiFormFieldSource`, `formHelpInput` dans `visitor-ai.service.ts`, branché dans `assurmatch-runtime.ts`) et en tire lui-même le libellé (langue demandée, sinon toute langue publiée) : un `fieldKey` inconnu, ou l'absence de formulaire publié, donne `Field is not publicly available in the published form` et un 404 ; tout `fieldLabel` envoyé par le client est ignoré. Réponses mises en cache par champ pour économiser le quota.
- **FR-009 (tests).** Tests unitaires (garde-fous, gabarits FR/EN, minimisation), intégration HTTP (flux complet, flag fermé sans appel fournisseur, quotas, refus d'offres hors périmètre, `visitor_form_help`), et spécifications Playwright « sources » côté public.

## Hors périmètre (documenté)
- Traduction automatique (P2) : inchangé.
- Aucune : la validation côté serveur de `fieldKey` est dans le périmètre (FR-008). Seul le cas où la dépendance `formFields` n'est pas fournie (tests unitaires sans formulaire) laisse le libellé vide.
- Mise en cache serveur des explications d'offre.
