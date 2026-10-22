# Feature Specification: Pilotage admin (KPI PRD §21, page Prospects, visites, alertes IA, contrôleurs admin non branchés)

**Status**: Implemented (lot 6 « Pilotage admin » mandaté par le superviseur le 2026-10-22 ; spec standard, aucun `[NEEDS CLARIFICATION]` ; hypothèse métier H5 appliquée et signalée)
**Input**: PRD §21 (dashboard admin plateforme), PRD complétion v0.3 H-01, H-08, H-09 ; specs 012 (dashboard), 036 (insights IA admin), 049 (anomalies de routage), 056 (consoles d'opérations), 060 (facturation B2B manuelle), 061 (alertes planifiées), 063 (contestations de leads).
**Impacted surfaces**: Backend API (nouveau module de comptage des visites, console Prospects, extension du dashboard admin, route de pré-contrôle de routage), shared packages (`dashboard.contracts.ts`, `admin-operations.contracts.ts`, `visit-stats.contracts.ts`), base de données / Prisma (migration réservée `0036_admin_steering`, table `VisitCounter`), Back-office Plateforme/Admin (dashboard, `/prospects`, `/messaging`, `/routing`). **Web Publique Client : un seul montage minimal** (une balise de comptage sans UI, un fichier + une ligne de layout), nécessaire pour que le KPI « visiteurs » ne reste pas à zéro ; à signaler au superviseur. Back-office courtier : aucun changement. Les parcours visiteur (anonymes) et les parcours admin restent séparés.

## Why
Le PRD §21 liste 15 KPI pour le dashboard admin. Le dashboard actuel (spec 012) en couvre une partie (demandes, leads routés / non routés, partenaires actifs, offres expirées, alertes de conformité). Manquent : visiteurs, taux visite → demande, pays et produits actifs, CA abonnement, CA leads, SLA courtier, taux de contestation, synthèse IA. D'autre part :

- la page `/prospects` du back-office est un texte statique (aucune donnée) alors que la table `Prospect` existe ;
- la route `POST /admin/messaging/test` (H-08) n'est consommée par aucun écran ;
- `AdminRoutingPrecheckController` (pré-contrôle de routage) n'est enregistré dans aucune route ;
- les insights et alertes IA existent (`/ai-assistance`, anomalies de routage) mais ne sont pas remontés dans le dashboard.

## User stories
1. **(P1) Admin plateforme — KPI complets.** Il ouvre `/dashboard` et voit les 15 KPI du PRD §21 (valeur, aide, état « non mesuré » plutôt que zéro trompeur), sur la fenêtre et le périmètre déjà filtrables.
2. **(P1) Admin — Prospects.** Il recherche et pagine les prospects (nom, e-mail, téléphone, pays, produit, consentements, demandes liées) avec un périmètre PII limité par rôle, pays et produit ; chaque consultation est auditée.
3. **(P1) Admin — Visites.** Le dashboard affiche le nombre de visites du site public et le taux visite → demande, sans que le site dépose de cookie ni collecte de donnée personnelle.
4. **(P2) Admin — Alertes et synthèse IA.** Le dashboard montre les alertes IA en attente de validation et la dernière synthèse d'activité IA, avec un lien vers `/ai-assistance` pour en demander une nouvelle. Rien n'est généré ni validé automatiquement.
5. **(P2) Admin messagerie — envoi de test (H-08).** Un bouton « Envoyer un message de test » sur `/messaging`.
6. **(P2) Admin routage — simulateur de pré-contrôle.** Un formulaire sur `/routing` évalue l'éligibilité d'un courtier pour un pays, un produit et un consentement, sans notifier ni transmettre de lead.

## Requirements
### Prospects (H-01 / console)
- **FR-001.** `GET /admin/operations/prospects` (authentifié + MFA, comme les autres consoles de la spec 056), paginé (`page`, `pageSize` ≤ 100), filtres `country`, `product`, `search` (nom ou empreinte exacte d'e-mail / téléphone saisi en clair puis haché côté serveur), `anonymized` (inclure ou non).
- **FR-002 (PII limitée).** L'e-mail et le téléphone sont **masqués** (`a***@d***.com`, `+221 ** ** ** 45`) pour tous les rôles sauf `super_admin` et `support_admin`, qui voient les valeurs en clair sur le détail d'un prospect uniquement (`GET /admin/operations/prospects/:id`), avec journal d'audit `admin.prospect.viewed` (acteur, prospect, motif de périmètre). La liste ne contient jamais de valeur en clair. Les prospects anonymisés n'exposent aucune donnée de contact.
- **FR-003 (périmètre).** Un `admin_pays` ne voit que les prospects de ses pays ; un admin limité à des produits ne voit que ces produits ; `finance_admin` et `content_admin` sont refusés (audit du refus). Mêmes règles d'accès que les autres consoles d'opérations (`admin-operations-access.ts`).
- **FR-004.** Chaque ligne indique : id, nom d'affichage (masqué partiellement hors rôles PII), pays (ISO), produit, date de création, nombre de consentements, nombre de demandes de devis liées, état d'anonymisation.
- **FR-005 (écran).** `/prospects` affiche filtres, tableau, pagination, état vide et erreurs ; un panneau de détail est atteignable depuis chaque ligne.

### Comptage des visites (hypothèse H5)
- **FR-006.** Table `VisitCounter` (`day` date UTC, `page` clé énumérée, `count`), clé unique `(day, page)`. Aucune autre colonne : ni IP, ni agent utilisateur, ni référent, ni identifiant, ni cookie.
- **FR-007.** `POST /public-stats/visits` (public, sans corps sensible) accepte `{ page }` où `page` appartient à une liste fermée (`home`, `countries`, `country`, `product`, `offers`, `offer`, `compare`, `quote_form`, `quote_submitted`, `tracking`, `other`) ; toute autre valeur est refusée ; réponse 204. Incrément atomique (upsert) ; plafond global par page et par minute (anti-gonflage) sans stocker d'identifiant du visiteur.
- **FR-008.** La balise publique (composant client sans UI) envoie une visite par navigation, ne s'exécute pas si le navigateur envoie « Do Not Track », n'utilise ni cookie ni stockage local, n'envoie que la clé de page déduite du chemin (jamais l'URL, la référence de demande ou un paramètre). Désactivable côté serveur par `ASSURMATCH_VISIT_COUNTER_ENABLED=false`.
- **FR-009.** Lecture : `VisitStatsService.totalsBetween(from, to)` renvoie le total et le détail par page. Le dashboard n'utilise que ces agrégats.
- **FR-010 (limite documentée).** Sans cookie, on compte des **pages vues** et non des visiteurs uniques ; le KPI est libellé « Visites (pages vues) » et le taux visite → demande est indicatif.

### KPI du dashboard admin (PRD §21)
Extension **additive** de la réponse `GET /admin/dashboard` (champs optionnels, aucune rupture des clients existants), même fenêtre et même périmètre pays / produit / partenaire :
- **FR-011 Visiteurs et conversion.** `visits { total, byPage[] }` ; `visitToRequestRate = demandes créées / visites` (null si zéro visite). Si le compteur est désactivé ou vide : `visits = null`, libellé « Non mesuré ».
- **FR-012 Pays et produits actifs.** `activeCountries`, `activeProducts` : mêmes règles de publication publique que `PublicStatsService` (pays dont le parcours public est ouvert ; produits actifs et publics), dans le périmètre.
- **FR-013 SLA courtier.** `partnerSla { averageFirstActionMinutes, measured }` calculé sur les affectations de la fenêtre (même définition que `GET /admin/partners/sla`). Duplication minimale d'une logique que le lot 3 (dashboard courtier) calcule aussi : voir plan.
- **FR-014 Qualité des leads / contestations.** `leadQuality { transmitted, disputed, accepted, rejected, disputeRate }` où `disputeRate = contestations ouvertes dans la fenêtre / leads transmis` (null si aucun lead), à partir de `LeadDispute` (spec 063), dans le périmètre.
- **FR-015 CA abonnement et CA leads.** `revenue { byCurrency: [{ currency, subscription, leads }] }` : sommes des lignes de **factures émises** dans la fenêtre (abonnement, leads facturés et packs de leads, nets des avoirs). **Réservé à `super_admin`** ; autres rôles : `revenue = null` et `revenueRestricted = true`. Aucune conversion de devise.
- **FR-016 Synthèse IA.** `aiSummary { insightId, generatedAt, status, excerpt } | null` : dernier insight `activity_report` de la surface `admin_platform` visible par le rôle, extrait borné à 600 caractères, statut de validation visible. Jamais généré par la lecture du dashboard.
- **FR-017 Alertes IA.** `aiAlerts { pendingValidation, items[≤5] }` : insights IA admin (`admin_risk_triage`, `routing_anomaly_analysis`, `offer_consistency_check`, `activation_gap_summary`) en attente de validation humaine ; chaque item = id, type, date, statut, lien vers `/ai-assistance`. Aucun contenu de prompt ni donnée personnelle.
- **FR-018 Écran.** Le dashboard présente les 15 KPI en grille (carte avec libellé PRD, valeur, aide, état « Non mesuré » ou « Réservé » le cas échéant) et le CSV d'export (`export.csv`) ajoute les nouvelles lignes.

### Contrôleurs non branchés
- **FR-019 Envoi de test (H-08).** `/messaging` : formulaire (canal, destinataire de test saisi par l'admin, modèle) qui appelle `POST /admin/messaging/test` par action serveur ; résultat (accepté / refusé et motif) affiché ; aucun envoi si le flag ou le fournisseur sont fermés (comportement serveur inchangé) ; destinataire masqué dans le retour et dans l'audit.
- **FR-020 Pré-contrôle de routage.** `POST /admin/routing/precheck` enregistre `AdminRoutingPrecheckController` (permission `partners:read`, périmètre pays / produit / partenaire) ; formulaire sur `/routing` (identifiants de courtier, pays, produit, consentement) ; résultat `eligible` / `not_eligible` avec motifs ; texte explicite « simulation : aucun courtier notifié, aucun lead transmis » ; la décision d'éligibilité reste déterministe (principe VII).
- **FR-021 Modules IA.** `AdminAIModulesController` (liste / configuration en mémoire) n'est **pas** branché : la configuration IA par HTTP contredit la règle « flags IA non modifiables par HTTP » et le contrôleur n'a pas de persistance. Documenté ; aucune route ajoutée.

### Transverse
- **FR-022 (IA fermée par défaut).** Aucune nouvelle génération IA ; les cartes IA du dashboard lisent des insights existants. Si les flags IA sont fermés, la carte affiche « IA désactivée » sans appel. Aucun flag modifiable par HTTP (inchangé).
- **FR-023 (audit et RBAC).** Toute lecture sensible (détail prospect, revenus) et tout refus sont audités ; tests RBAC pour chaque nouvelle route.
- **FR-024 (tests).** Unitaires (masquage PII, périmètre, agrégats KPI, plafond de visites, liste fermée), intégration HTTP (routes, refus, audit), contrat (schémas), schéma Prisma / migration.

## Hors périmètre (documenté)
- Visiteurs uniques et attribution de sources (nécessiteraient un identifiant ou un consentement).
- Conversion de devises ; ventilation du CA par pays.
- Modification de la configuration IA par HTTP.
- KPI du dashboard courtier (lot 3).

## Questions et hypothèses (à valider par le propriétaire du produit)
- **H5.** Comptage des visites = compteur serveur agrégé par jour et par page, sans cookie ni donnée personnelle, libellé « pages vues ».
- **H6 (conversion).** Taux visite → demande = demandes créées / pages vues (toutes pages) ; alternative : rapporter au nombre de vues de la page d'accueil seule.
- **H7 (CA).** CA affiché uniquement au `super_admin` ; `finance_admin` n'accède pas au dashboard (règle existante de la spec 012) et garde ses écrans de facturation.
- **H8.** Le détail d'un prospect en clair est réservé à `super_admin` et `support_admin`.
