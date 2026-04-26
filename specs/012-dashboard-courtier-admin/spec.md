# Feature Specification: Dashboards courtier et admin plateforme AssurMatch

**Feature Branch**: `012-dashboard-courtier-admin`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "Creer la specification fonctionnelle 012-dashboard-courtier-admin pour AssurMatch. Dashboards operationnels lus depuis la persistance PostgreSQL existante (leads, quote requests, lead assignments, CRM activity, partenaires, licences, offres, audit logs, feature flags). Donner aux courtiers et aux admins une vision agregee de leur activite, sans introduire de nouvelle logique metier de souscription, paiement, signature, sinistres ou IA avancee. Ne genere pas le plan, ne genere pas tasks.md, n'implemente rien."
**Validation State**: Draft
**Continuous Workflow Eligible**: No - cette invocation est limitee a la specification; l'utilisateur a explicitement demande de ne pas generer le plan, les taches ni l'implementation.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette specification ajoute des dashboards en lecture seule construits sur la persistance existante. Elle n'introduit aucune vente directe, souscription, encaissement de prime, emission de police, attestation, sinistre, paiement, signature electronique, API assureur avancee, webhook avance, IA avancee, conseil personnalise engageant, ni promesse reglementee. Les chiffres affiches sont des indicateurs internes operationnels et conformite, pas des decisions reglementees ou des recommandations officielles.
- **Impacted application(s)**: Backend API (nouveaux endpoints lecture seule sous `/broker/dashboard` et `/admin/dashboard`, agregations Prisma) et Back-office Partenaires/Plateforme (vue dashboard Starter, vue dashboard Pro/Enterprise, vue dashboard admin plateforme). Web Publique Client n'est pas impactee: aucune route publique nouvelle, aucune donnee broker/admin exposee publiquement. Packages partages peuvent recevoir des contrats DTO partages via le package contrats existant si necessaire.
- **Affected scopes**: Pays existants, produits existants, partenaires courtiers actifs et inactifs, plans Starter, Pro et Enterprise, roles broker (Owner Starter, Read-only Starter, Owner Pro, Manager, Agent, Read-only Pro/Enterprise) et roles admin (Super Admin, Admin Pays, Compliance Admin, Support Admin, Finance Admin lecture seule, Content Admin lecture seule selon scope). Modules backend impactes: dashboards (nouveau), audit-logs (lecture), feature-flags (lecture), partners, partner-licenses, leads, quote-requests, routing, broker-portal, broker-crm, common.
- **Frontend separation**: Aucune route dashboard n'est exposee dans l'application Web Publique Client. Les vues dashboard vivent uniquement dans le Back-office Partenaires/Plateforme et restent protegees par authentification, RBAC, tenant isolation et MFA selon role. Les composants UI partages (design system) peuvent etre reutilises mais routes, layouts et politiques d'acces restent separes des parcours publics.
- **Required feature flags**: `broker_dashboard_enabled` (global, fail-closed par defaut, controle l'acces aux dashboards courtier Starter et Pro/Enterprise). `broker_crm_enabled` (deja existant, fail-closed par defaut, controle l'inclusion des sections CRM dans le dashboard Pro/Enterprise). Les dashboards admin restent accessibles aux admins autorises meme si `broker_dashboard_enabled` est false, car ce flag ne concerne que la surface broker. Les flags pays (`country_public_enabled`, `country_quote_enabled`, etc.) et produit (`product_public_enabled`, `product_quote_enabled`, etc.) sont LUS pour determiner ce que les agregats considerent comme actif. Les flags sensibles `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled` et flags IA avancee restent fermes et ne sont ni actives ni utilises par cette spec.
- **Consent and transmission**: Cette spec ne transmet aucun lead. Elle lit l'etat agrege de transmissions deja effectuees ou refusees. Les agregats admin doivent refleter les refus de transmission lies a l'absence de `ConsentRecord`, sans exposer de PII visiteur non necessaire et en respectant les permissions du role consultant.
- **Partner license controls**: Les dashboards lisent l'etat des `PartnerLicense` pour produire les alertes "licence expiree" et "licence expirant dans 30 jours" (admin), ainsi que les alertes licence du tenant courtier (broker). Aucune activation, suspension ou modification de licence ne peut etre declenchee depuis ces dashboards.
- **Audit and data history**: Chaque acces admin a `/admin/dashboard` ou `/admin/dashboard/compliance-alerts` DOIT produire un `AuditLog` avec acteur, action, scope demande, periode, resultat, et `correlationId` lorsque disponible. Les acces broker peuvent etre journalises selon volumetrie acceptable; le plan precisera la decision finale. Les agregats sont calcules sur la base des entites historisees (`createdAt`, `updatedAt`, `LeadAssignment`, `RoutingDecision`, `CRMActivity`, `AuditLog`, etc.) sans requerir de nouvelle table sauf justification dans le plan.
- **Security and RBAC**: HTTPS obligatoire. RBAC strict avec verification du role, du tenant courtier, du plan, du pays/produit selon role et de la fenetre temporelle demandee. MFA admin requise lorsque deja en place pour la session admin. Les endpoints broker exigent un acteur broker authentifie scope au tenant. Les endpoints admin exigent un acteur admin authentifie. Aucun courtier ne peut atteindre les endpoints admin. Les read-only peuvent lire selon scope mais ne peuvent jamais modifier (les endpoints sont en tout etat de cause GET seulement). PII minimisee: les agregats privilegient les comptes, les statuts et les alertes; les details individuels affiches doivent respecter les permissions des specs 003 (Starter) et 004 (CRM Pro). Rate limiting et bornes de fenetre temporelle (max 365 jours) appliques. Les exports ne sont pas couverts par cette spec.
- **Routing impact**: Aucun changement de regles de routage. Les dashboards exposent les agregats de routages deja decides: leads transmis, leads refuses, leads non routes, raisons de non-routage (absence de consentement, pays desactive, produit desactive, aucun courtier eligible, licence expiree, feature flag ferme, autre raison auditee). Aucune mutation de routage, aucune assignation, aucune (re)transmission ne peut etre declenchee depuis ces endpoints.
- **AI impact**: Aucune fonctionnalite IA dans cette spec. Pas de scoring IA, pas de resume IA, pas de recommandation IA, pas d'assistant IA. Les flags IA restent fermes et la spec ne les active pas. Une eventuelle integration future serait traitee dans une spec dediee soumise aux garde-fous IA constitutionnels.
- **UX/content restrictions**: Le contenu des dashboards utilise un vocabulaire technique interne ("leads recus", "leads transmis", "leads non routes", "licence expirant"). Aucune formulation interdite ("acheter", "souscrire maintenant", "contrat valide", "la meilleure assurance du marche", "garantie acceptee"). Les chiffres sont presentes comme indicateurs operationnels internes, pas comme conseils, recommandations ou decisions reglementees. Les sponsorisations restent invisibles dans cette spec puisque les offres ne sont pas listees individuellement.
- **Workflow continuity**: Apres validation explicite et absence de marqueur `[NEEDS CLARIFICATION]`, cette feature standard pourra enchainer `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement` -> validations finales sans confirmation intermediaire, sauf conflit constitutionnel, ambiguite majeure, risque securite/conformite/donnees, activation interdite, decision produit non couverte ou validation bloquante. Aucun commit automatique apres implementation sans demande explicite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dashboard courtier Starter basique (Priority: P1)

Un Broker Owner Starter ou Broker Read-only Starter ouvre son dashboard pour suivre l'activite recente sur ses leads sans acceder au CRM ni a aucune fonctionnalite Pro.

**Why this priority**: Les courtiers Starter ont besoin d'une vision basique de leur activite pour piloter leur travail au quotidien. Les leads, leurs statuts et les alertes licence sont les indicateurs minimaux operationnels.

**Independent Test**: Authentifier un courtier Starter avec leads persistes dans son tenant, appeler `GET /broker/dashboard` avec une fenetre par defaut, verifier que la reponse contient les KPIs Starter, ne contient aucune donnee CRM (Kanban, taches, rappels, pipeline avance, assignation interne) et est limitee au tenant du courtier.

**Acceptance Scenarios**:

1. **Given** un Broker Starter actif avec leads persistes dans son tenant et `broker_dashboard_enabled=true`, **When** il appelle `GET /broker/dashboard`, **Then** il voit les KPIs Starter (leads recus, leads acceptes, leads rejetes, leads contestes, leads en attente d'action, delai moyen de premiere action si historise, repartition par produit, repartition par pays autorise) et aucune donnee CRM ni Kanban.
2. **Given** une licence courtier proche expiration ou expiree dans le tenant, **When** le dashboard Starter agrege les alertes, **Then** la licence apparait dans la section alertes avec le scope concerne.
3. **Given** `broker_dashboard_enabled=false` ou absent, **When** un Broker Starter appelle `GET /broker/dashboard`, **Then** l'acces est refuse fail-closed sans fuite de donnees.
4. **Given** un Broker Starter d'un tenant A, **When** il fournit un parametre forge pointant vers un tenant B, **Then** aucune donnee du tenant B n'apparait et l'acces est restreint a son tenant.
5. **Given** une fenetre temporelle superieure a 365 jours, **When** le dashboard Starter est demande, **Then** la requete est refusee ou bornee selon la regle specifiee, avec un message d'erreur explicite.

---

### User Story 2 - Dashboard courtier Pro/Enterprise avec CRM (Priority: P1)

Un Broker Owner Pro, Manager, Agent ou Read-only Pro/Enterprise ouvre son dashboard pour suivre l'activite agreee de son tenant, incluant les sections CRM lorsque le flag CRM est actif et que le plan le permet.

**Why this priority**: Les courtiers Pro/Enterprise pilotent un pipeline CRM et plusieurs agents. Ils ont besoin d'une vision agreee tenant pour decider des relances, repartir le travail et detecter les goulots.

**Independent Test**: Authentifier un courtier Pro avec leads et activites CRM persistes, activer `broker_crm_enabled=true` et `broker_dashboard_enabled=true`, appeler `GET /broker/dashboard`, verifier KPIs Starter plus agregats CRM (pipeline par statut, repartition par agent, taux de conversion par produit, delai moyen reception/premiere activite CRM, rappels et taches a venir en agregat). Repeter avec `broker_crm_enabled=false` et verifier que la section CRM est absente ou refusee.

**Acceptance Scenarios**:

1. **Given** un Broker Pro avec `broker_crm_enabled=true`, `broker_dashboard_enabled=true` et donnees CRM persistantes dans son tenant, **When** il appelle `GET /broker/dashboard`, **Then** il voit les KPIs Starter plus les agregats CRM de son tenant uniquement (pipeline par statut, repartition par agent, taux de conversion par produit, delai moyen entre reception et premiere activite CRM, comptes de rappels et taches a venir).
2. **Given** un Broker Pro avec `broker_crm_enabled=false` ou absent, **When** il appelle `GET /broker/dashboard`, **Then** la section CRM est absente ou refusee dans la reponse, un `AuditLog` de tentative refusee est cree si la tentative correspond a un acces interdit, et les KPIs Starter restent visibles.
3. **Given** un courtier Starter avec un role qui semblerait permettre le CRM, **When** il appelle `GET /broker/dashboard`, **Then** aucune section CRM n'apparait, conformement a la regle "aucun Starter dans le CRM" quel que soit le role.
4. **Given** un Broker Pro Read-only, **When** il appelle `GET /broker/dashboard`, **Then** il voit les agregats autorises en lecture sans aucune action de mutation possible (aucun endpoint dashboard n'expose de mutation).
5. **Given** des activites CRM appartenant a deux tenants distincts, **When** un Broker Pro du tenant A consulte son dashboard, **Then** aucune ligne, agent, statut ou compte n'inclut de donnees du tenant B, meme via parametre `agentId` ou autre forge.
6. **Given** une fenetre temporelle entre 1 et 365 jours, **When** un Broker Pro consulte son dashboard, **Then** les agregats sont calcules sur cette fenetre et la pagination s'applique aux listes sous-jacentes (rappels, taches, alertes).

---

### User Story 3 - Dashboard admin plateforme (Priority: P1)

Un Super Admin, Admin Pays, Compliance Admin ou Support Admin consulte le dashboard plateforme pour suivre l'activite cross-tenant et les alertes conformite.

**Why this priority**: Les admins plateforme pilotent l'activation des pays, des produits et des partenaires, et doivent reagir rapidement aux alertes conformite (licences expirees, refus de routage, tentatives interdites). Sans dashboard agrege, ils dependent d'une lecture manuelle de tables ou d'audit logs bruts.

**Independent Test**: Authentifier un Super Admin, appeler `GET /admin/dashboard` avec une fenetre par defaut, verifier que la reponse contient les agregats cross-tenant attendus (leads totaux recus, transmis, refuses, non routes; raisons de non-routage; repartitions par pays et produit actifs; partenaires actifs vs inactifs; offres expirees encore referencees; licences expirees; licences expirant dans 30 jours; alertes conformite depuis `AuditLog`; etat des feature flags sensibles en lecture seule). Verifier qu'un `AuditLog` d'acces admin a ete cree.

**Acceptance Scenarios**:

1. **Given** un Super Admin authentifie, **When** il appelle `GET /admin/dashboard` avec fenetre par defaut, **Then** il voit les agregats cross-tenant deterministes et les alertes conformite autorisees pour son scope.
2. **Given** un Admin Pays avec scope limite a un pays X, **When** il appelle `GET /admin/dashboard` ou specifie un scope hors pays X, **Then** les donnees hors scope sont refusees ou exclues, et un `AuditLog` est cree decrivant la limitation appliquee.
3. **Given** un Compliance Admin, **When** il appelle `GET /admin/dashboard`, **Then** il voit les alertes conformite (refus de routage par absence de consentement, tentative CRM sans flag, acces refuse RBAC, tentative inter-tenant) consolidees depuis `AuditLog` selon ses droits.
4. **Given** un Finance Admin lecture seule ou Content Admin lecture seule, **When** il appelle `GET /admin/dashboard`, **Then** seules les sections autorisees pour son scope sont retournees; les autres sections sont absentes ou explicitement marquees indisponibles selon la matrice RBAC.
5. **Given** une licence courtier expiree ou expirant dans 30 jours, **When** un admin agrege les alertes licence, **Then** ces licences apparaissent dans la section conformite avec partenaire, pays, produit et date d'expiration.
6. **Given** un pays avec `country_public_enabled=false`, **When** le dashboard admin agrege les leads non routes, **Then** les leads bloques par pays apparaissent dans la raison de non-routage "pays desactive" avec compte associe.
7. **Given** un produit avec `product_public_enabled=false` ou `product_quote_enabled=false`, **When** le dashboard admin agrege les leads non routes, **Then** les leads bloques par produit apparaissent dans la raison de non-routage "produit desactive" avec compte associe.
8. **Given** une tentative de demande sans `ConsentRecord` valide, **When** le dashboard admin agrege les refus, **Then** aucune ligne lead transmise n'est comptee, le refus apparait dans les agregats "leads non routes / absence de consentement" et un audit du refus est referencable.
9. **Given** des feature flags sensibles fermes par defaut, **When** un admin consulte la section flags, **Then** la section affiche l'etat persistant de chaque flag en lecture seule, sans permettre de modification depuis le dashboard.
10. **Given** un courtier qui tente d'appeler `GET /admin/dashboard`, **When** la requete arrive au backend, **Then** l'acces est refuse, un `AuditLog` de tentative inter-role est cree, et aucune donnee admin n'est exposee.

---

### User Story 4 - Tenant isolation et garde-fous (Priority: P1)

Un courtier ne peut, sous aucun parametre, consulter les donnees d'un autre tenant; un admin scope ne peut depasser son scope; un visiteur public ne peut pas atteindre les routes dashboard.

**Why this priority**: La tenant isolation est un invariant constitutionnel critique. Les dashboards exposent des agregats potentiellement sensibles; toute fuite inter-tenant ou inter-scope est une violation.

**Independent Test**: Tenter d'appeler les endpoints dashboard avec acteurs sans authentification, avec acteurs d'un autre tenant, avec parametres forges (tenantId, partnerId, agentId, country, product), avec acteurs read-only tentant des operations interdites; verifier les refus et les `AuditLog` correspondants.

**Acceptance Scenarios**:

1. **Given** un visiteur non authentifie, **When** il tente d'appeler `GET /broker/dashboard` ou `GET /admin/dashboard`, **Then** l'acces est refuse avec un code d'erreur d'authentification standard et aucune donnee n'est exposee.
2. **Given** un courtier authentifie du tenant A, **When** il fournit un parametre `tenantId`, `partnerId` ou `agentId` pointant vers le tenant B, **Then** ces parametres sont ignores ou refuses, et la reponse reste limitee au tenant A.
3. **Given** un courtier authentifie, **When** il appelle `GET /admin/dashboard` ou `GET /admin/dashboard/compliance-alerts`, **Then** l'acces est refuse, un `AuditLog` de tentative inter-role est cree et aucune donnee admin n'est exposee.
4. **Given** un Admin Pays scope a un pays X, **When** il fournit un `country` hors X dans la query, **Then** la requete retourne uniquement les agregats pour les pays autorises de son scope ou est refusee selon la regle specifiee, avec audit.
5. **Given** une route publique de l'application Web Publique Client, **When** un visiteur navigue dans cette application, **Then** aucun ecran dashboard, aucune route dashboard et aucune politique d'acces back-office n'est chargee.
6. **Given** un acteur read-only, **When** il consulte un dashboard, **Then** aucun endpoint dashboard ne propose de mutation, et les sous-ressources accessibles depuis le dashboard restent en lecture seule.

---

### User Story 5 - Audit durable des acces dashboard admin (Priority: P2)

Chaque acces admin aux endpoints dashboard produit un `AuditLog` durable consultable par les admins autorises (par exemple Compliance Admin) afin de tracer qui a consulte quoi, quand et avec quel scope.

**Why this priority**: L'audit des acces admin est une preuve opposable de gouvernance et permet de detecter les usages anormaux. Cette priorite est P2 car le mecanisme `AuditLog` existe deja; il s'agit de l'utiliser correctement, pas de le creer.

**Independent Test**: Effectuer plusieurs acces admin avec parametres differents, interroger directement la table `AuditLog` puis l'endpoint admin existant si applicable, verifier la presence d'enregistrements avec acteur, action, scope, periode, resultat et `correlationId` lorsque disponible.

**Acceptance Scenarios**:

1. **Given** un Super Admin appelant `GET /admin/dashboard` avec fenetre 90 jours et scope pays X, **When** la requete reussit, **Then** un `AuditLog` durable est cree avec acteur, action `dashboard.admin.read`, scope (pays X, fenetre 90 jours), resultat `success` et `correlationId`.
2. **Given** un acteur dont l'acces est refuse, **When** il appelle un endpoint admin dashboard, **Then** un `AuditLog` durable est cree avec resultat `denied` et raison structuree (par exemple `forbidden_role`, `out_of_scope`, `flag_disabled`).
3. **Given** un Compliance Admin autorise, **When** il consulte les audits via l'endpoint admin existant, **Then** les audits dashboard apparaissent selon pagination et droits existants.
4. **Given** un volume eleve d'acces broker dashboard, **When** la decision plan finalise la politique de journalisation broker, **Then** la politique appliquee est documentee et soit journalise soit echantillonne selon les regles definies, sans supprimer les audits sensibles.
5. **Given** un acteur non autorise, **When** il tente d'appeler l'endpoint admin audit, **Then** l'acces est refuse sans fuite et un `AuditLog` de tentative est cree.

---

### User Story 6 - Performance et bornes temporelles (Priority: P2)

Les dashboards renvoient des agregats deterministes en temps raisonnable, avec une fenetre temporelle bornee, sans N+1 et sans traitement lourd synchrone.

**Why this priority**: La performance evite les degradations sur les routes back-office et empeche l'usage des dashboards comme vecteur de surcharge. Les bornes temporelles preservent la semantique et les couts d'infrastructure.

**Independent Test**: Appeler les dashboards avec fenetres differentes (1 jour, 30 jours, 365 jours, 366 jours), mesurer les temps de reponse sur jeux de donnees representatifs, verifier l'absence de N+1 par instrumentation Prisma ou logs structures, verifier le refus ou la borne pour fenetre superieure a 365 jours.

**Acceptance Scenarios**:

1. **Given** une fenetre par defaut de 30 jours, **When** un dashboard broker ou admin est appele, **Then** la reponse est calculee par agregation Prisma sans N+1 visible.
2. **Given** une fenetre temporelle entre 1 et 365 jours, **When** un dashboard est appele, **Then** la reponse respecte un seuil de latence cible defini dans le plan et reste pagine pour les listes sous-jacentes.
3. **Given** une fenetre superieure a 365 jours ou inferieure a 1 jour, **When** un dashboard est appele, **Then** la requete est refusee ou bornee, avec un message d'erreur explicite et `400` par defaut.
4. **Given** une liste d'alertes ou de details sous-jacents, **When** elle est retournee dans un dashboard, **Then** elle est paginee avec des parametres `page`, `pageSize` ou `cursor` documentes dans le contrat.
5. **Given** un endpoint dashboard, **When** il est appele, **Then** il n'execute aucun traitement lourd synchrone (par exemple recalcul global, recompute IA, export) et delegue tout traitement asynchrone a un mecanisme existant si necessaire.

---

### Edge Cases

- `broker_dashboard_enabled=false` ou absent: les dashboards courtier doivent etre fail-closed; les dashboards admin restent accessibles aux admins autorises.
- `broker_crm_enabled=false` ou absent: la section CRM du dashboard Pro/Enterprise est absente ou refusee, sans casser les KPIs Starter.
- Plan Starter avec role qui semblerait permettre le CRM: aucun acces CRM, conformement a "aucun Starter dans le CRM".
- Tenant courtier sans aucun lead, activite CRM, licence ou alerte: la reponse retourne des comptes a zero et aucune erreur, sans exposer d'autres tenants.
- Pays ou produit desactive: les leads bloques apparaissent dans la raison de non-routage cote admin, sans etre transmis ni comptes comme acceptes.
- Licence expiree, suspendue ou invalide: alertes presentees avec scope concerne et le routage reste bloque pour ce scope.
- Offre expiree encore referencee: visible dans la section "offres expirees encore referencees" cote admin.
- Absence de `ConsentRecord` valide: aucun lead transmis n'est compte; le refus est trace dans les agregats admin.
- Acteur invalide, expire ou sans MFA lorsque requise: refus sans fuite avec audit.
- Acteur avec scope reduit (Admin Pays, Finance Admin, Content Admin): seules les sections et donnees autorisees apparaissent.
- Parametre forge (tenantId, partnerId, agentId, country, product hors scope): ignore ou refuse, audit de tentative.
- Fenetre temporelle hors bornes (>365 jours, <1 jour, format invalide, futur): refus avec erreur claire.
- Pagination: pages hors bornes ou tailles excessives doivent etre bornees ou refusees.
- Volume eleve: la requete reste agregee Prisma, sans N+1 et sans traitement lourd synchrone.
- Cache feature flag stale: la lecture du flag doit refleter l'etat persistant au moment requis (le plan precisera le mecanisme: lecture directe ou invalidation cache).
- Application publique tentant de charger un ecran dashboard: aucune route dashboard ne doit etre disponible cote application publique.
- Visiteur non authentifie tentant d'acceder a un endpoint dashboard: refus standardise sans fuite.
- Volume eleve d'acces broker: la politique de journalisation broker doit etre documentee et appliquee (journalisation complete, echantillonnage, ou journalisation des refus uniquement) sans masquer les acces refuses critiques.
- Donnees d'un autre tenant via jointure mal scopee: doit etre impossible; les services et repositories doivent appliquer le scope tenant a chaque requete.
- Donnees PII non necessaires dans les agregats: doivent etre absentes; les details individuels respectent les permissions des specs 003 et 004.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme DOIT exposer un endpoint `GET /broker/dashboard` retournant un dashboard adapte au plan du courtier authentifie (Starter ou Pro/Enterprise).
- **FR-002**: Le systeme DOIT exposer un endpoint `GET /admin/dashboard` retournant les agregats plateforme cross-tenant selon le role admin authentifie.
- **FR-003**: Le systeme DOIT exposer un endpoint optionnel `GET /admin/dashboard/compliance-alerts` si le plan choisit de paginer separement les alertes conformite, en lecture seule et soumis aux memes regles RBAC que `GET /admin/dashboard`.
- **FR-004**: Tous les endpoints dashboard DOIVENT etre en lecture seule. Aucune mutation, aucun routage, aucune assignation, aucune modification de feature flag ne DOIT etre declenchee depuis ces endpoints.
- **FR-005**: Tous les endpoints DOIVENT accepter les query params `from` et `to` decrivant la fenetre temporelle, avec defaut de 30 jours et maximum de 365 jours.
- **FR-006**: Tous les endpoints DOIVENT refuser ou borner les fenetres superieures a 365 jours, inferieures a 1 jour, ou de format invalide, avec message d'erreur explicite et code HTTP standard.
- **FR-007**: Les endpoints DOIVENT accepter les query params optionnels `country` et `product` filtrant les agregats au scope autorise par le role; tout filtre hors scope DOIT etre refuse ou borne au scope autorise avec audit.
- **FR-008**: L'endpoint admin DOIT accepter le query param optionnel `partnerId` selon le role; un Compliance Admin et un Super Admin peuvent filtrer par partenaire, un Admin Pays uniquement dans son scope pays.
- **FR-009**: L'endpoint broker DOIT accepter le query param optionnel `agentId` uniquement pour les roles Pro/Enterprise autorises (Owner Pro, Manager) et uniquement dans le tenant du courtier; un Starter ne peut pas l'utiliser.
- **FR-010**: Le systeme DOIT enforcer le feature flag `broker_dashboard_enabled` (fail-closed par defaut) avant d'exposer les dashboards courtier; si le flag est false ou absent, l'acces broker DOIT etre refuse.
- **FR-011**: Le systeme DOIT enforcer le feature flag `broker_crm_enabled` (fail-closed par defaut) avant d'inclure la section CRM dans le dashboard Pro/Enterprise; si le flag est false ou absent, la section CRM DOIT etre absente ou refusee, et un AuditLog peut etre cree selon la decision du plan.
- **FR-012**: Les dashboards admin DOIVENT rester accessibles aux admins autorises meme si `broker_dashboard_enabled=false`, car ce flag est broker-side.
- **FR-013**: Le systeme DOIT verifier le RBAC pour chaque endpoint dashboard: les endpoints broker exigent un acteur broker authentifie scope au tenant; les endpoints admin exigent un acteur admin authentifie. Aucun courtier NE DOIT pouvoir atteindre les endpoints admin.
- **FR-014**: Le systeme DOIT appliquer le tenant isolation au niveau service ET repository: aucun parametre forge NE DOIT permettre d'acceder a un autre tenant.
- **FR-015**: Le systeme DOIT empecher tout acces de Broker Starter ou role Starter aux sections CRM, quel que soit le role attribue dans le tenant.
- **FR-016**: Le systeme DOIT calculer pour le dashboard Starter au minimum: leads recus, leads acceptes, leads rejetes, leads contestes, leads en attente d'action, delai moyen de premiere action si historise, repartition par produit autorise et repartition par pays autorise au courtier.
- **FR-017**: Le systeme DOIT calculer pour le dashboard Pro/Enterprise au minimum: tous les KPIs Starter, plus pipeline CRM par statut, repartition par agent du tenant, taux de conversion par produit base sur les statuts ou activites CRM internes, delai moyen entre reception et premiere activite CRM, comptes (et non details) de rappels et taches a venir.
- **FR-018**: Le systeme DOIT inclure dans tout dashboard courtier les alertes licence du tenant: licence proche expiration (par defaut <=30 jours) et licence expiree bloquant le routage.
- **FR-019**: Le systeme DOIT calculer pour le dashboard admin au minimum: leads totaux recus, leads transmis, leads refuses, leads non routes, raisons principales de non-routage (absence de consentement, pays desactive, produit desactive, aucun courtier eligible, licence expiree, feature flag ferme, autre raison auditee), repartition par pays actifs, repartition par produits actifs, partenaires actifs vs inactifs, offres expirees encore referencees, licences expirees, licences expirant dans 30 jours, alertes conformite depuis `AuditLog`, etat des feature flags sensibles en lecture seule.
- **FR-020**: Le systeme DOIT lire les feature flags depuis la persistance Prisma-runtime ou son cache runtime associe; il NE DOIT PAS lire un adapter memoire hors `NODE_ENV=test`.
- **FR-021**: Le systeme DOIT consolider les alertes conformite admin depuis `AuditLog` et tables associees (refus de routage par absence de consentement, tentative CRM sans flag, acces refuse RBAC, tentative inter-tenant, autres refus auditee).
- **FR-022**: Le systeme DOIT creer un `AuditLog` durable pour chaque acces admin reussi a `GET /admin/dashboard` et `GET /admin/dashboard/compliance-alerts`, avec acteur, action, scope (pays, produit, partenaire, fenetre temporelle), resultat et `correlationId` lorsque disponible.
- **FR-023**: Le systeme DOIT creer un `AuditLog` durable pour tout refus d'acces admin (role insuffisant, scope hors limites, flag empechant l'acces) avec raison structuree.
- **FR-024**: Le systeme PEUT creer des `AuditLog` pour les acces broker selon une politique de journalisation documentee dans le plan (journalisation complete, echantillonnage, ou journalisation des refus uniquement). Les refus broker sensibles (acces inter-tenant, role Starter tentant CRM, flag ferme) DOIVENT etre journalises sans echantillonnage.
- **FR-025**: Les listes sous-jacentes (alertes, rappels, taches) DOIVENT etre paginees avec parametres `page` et `pageSize` ou `cursor` documentes; la taille par defaut et maximum DOIVENT etre fixees dans le contrat (par exemple 25/100).
- **FR-026**: Les agregats DOIVENT etre calcules par agregation Prisma sans N+1 et sans traitement lourd synchrone; les jointures DOIVENT etre scopees par tenant cote broker et par scope role cote admin.
- **FR-027**: Aucune route dashboard NE DOIT etre exposee dans l'application Web Publique Client.
- **FR-028**: Aucune donnee PII non necessaire NE DOIT etre exposee dans les agregats; les details individuels eventuels DOIVENT respecter les permissions des specs 003 (Starter) et 004 (CRM Pro).
- **FR-029**: Les dashboards admin lecture seule pour Finance Admin ou Content Admin DOIVENT retourner uniquement les sections autorisees a leur scope, ou les masquer/marquer indisponibles, conformement a la matrice RBAC documentee dans le plan.
- **FR-030**: Les endpoints dashboard NE DOIVENT PAS introduire de paiement, facturation detaillee, souscription, police, attestation, signature electronique, sinistres, recommandation IA, scoring IA, resume IA, webhook, API assureur ni integration externe nouvelle.
- **FR-031**: Les endpoints dashboard NE DOIVENT PAS exposer d'export de donnees; les exports CSV restent gouvernes par les specs 003 et 004 sous permission dediee.
- **FR-032**: Les endpoints dashboard DOIVENT respecter rate limiting selon configuration runtime existante; le plan precisera les seuils si differents des seuils par defaut.
- **FR-033**: Les contenus retournes NE DOIVENT PAS utiliser de formulation interdite ("acheter", "souscrire maintenant", "contrat valide", "garantie acceptee", "la meilleure assurance du marche") et DOIVENT presenter les chiffres comme indicateurs operationnels internes.
- **FR-034**: Les dashboards DOIVENT distinguer "leads transmis" et "leads non routes" selon les definitions deja en vigueur dans les specs 002, 003 et 004; aucune redefinition NE DOIT etre introduite par cette spec.
- **FR-035**: Le systeme DOIT pouvoir afficher un dashboard admin meme si certaines tables (par exemple `CRMActivity`) sont vides pour la fenetre demandee; les comptes vides s'affichent comme zero, sans erreur.

### Configuration Requirements

- **CFG-001**: Le feature flag `broker_dashboard_enabled` DOIT exister, etre persistant et fermer par defaut.
- **CFG-002**: Le feature flag `broker_crm_enabled` DOIT continuer a fermer par defaut conformement aux specs 004 et 011.
- **CFG-003**: La fenetre temporelle par defaut (30 jours) et maximum (365 jours) DOIVENT etre configurables via constantes documentees, sans necessiter de modification de schema Prisma.
- **CFG-004**: Les seuils d'alerte licence (par defaut <=30 jours pour "proche expiration") DOIVENT etre documentes et configurables sans modification de schema.
- **CFG-005**: La pagination par defaut et maximum DOIVENT etre documentees et coherentes avec les pratiques existantes du back-office.
- **CFG-006**: Les politiques de journalisation broker (complete, echantillonnage, refus uniquement) DOIVENT etre documentees dans le plan et activables sans deploiement de migration.

### Security Requirements

- **SEC-001**: HTTPS DOIT etre obligatoire pour tous les environnements exposes.
- **SEC-002**: La MFA admin DOIT etre verifiee si elle est deja en place pour la session admin, conformement aux pratiques existantes.
- **SEC-003**: Les endpoints dashboard DOIVENT verifier authentification, role, tenant courtier, plan, pays/produit selon role et fenetre temporelle.
- **SEC-004**: Aucun courtier NE DOIT pouvoir atteindre les endpoints admin; les tentatives DOIVENT etre auditees.
- **SEC-005**: Aucun parametre forge NE DOIT permettre d'acceder a un autre tenant ou a un scope hors role; le scope effectif DOIT etre derive du role et applique au repository.
- **SEC-006**: Les erreurs de refus tenant/RBAC NE DOIVENT PAS confirmer l'existence d'une ressource hors scope.
- **SEC-007**: Les logs applicatifs et sorties NE DOIVENT PAS exposer PII brute, secrets, tokens ou identifiants sensibles.
- **SEC-008**: Les rate limits existants DOIVENT s'appliquer; le plan precisera les seuils si specifiques.
- **SEC-009**: Les contenus NE DOIVENT PAS utiliser de formulation interdite ni induire de promesse reglementee.

### Performance Requirements

- **PERF-001**: Les agregats DOIVENT etre calcules par agregation Prisma sans N+1, mesure par instrumentation ou tests.
- **PERF-002**: Une fenetre par defaut de 30 jours sur des donnees representatives DOIT respecter un seuil de latence cible (par exemple p95 <= 500ms en local sur PostgreSQL local) defini precisement dans le plan.
- **PERF-003**: Aucun traitement lourd synchrone NE DOIT etre execute dans un endpoint dashboard.
- **PERF-004**: Les listes sous-jacentes DOIVENT etre paginees pour eviter les reponses excessives.
- **PERF-005**: Les requetes DOIVENT s'appuyer sur les index existants des entites lues (`createdAt`, `tenantId`, statut, pays, produit, etc.); si un nouvel index est necessaire, le plan le justifiera et l'integrera dans une migration explicite.

### Audit Requirements

- **AUD-001**: Tout acces admin reussi a un endpoint dashboard DOIT creer un `AuditLog` durable.
- **AUD-002**: Tout refus admin (role, scope, flag) DOIT creer un `AuditLog` durable avec raison structuree.
- **AUD-003**: Toute tentative cross-tenant ou inter-role refusee DOIT etre auditee meme cote broker.
- **AUD-004**: La politique de journalisation broker DOIT etre documentee dans le plan et appliquee de maniere coherente.
- **AUD-005**: Les enregistrements `AuditLog` DOIVENT inclure `correlationId` lorsque disponible, conformement aux pratiques existantes.

### Key Entities *(include if feature involves data)*

- **Country**: Lu pour la repartition par pays actifs et pour les flags pays appliques aux agregats.
- **Product**: Lu pour la repartition par produits actifs et pour les flags produit appliques aux agregats.
- **Offer**: Lu pour identifier les offres expirees encore referencees cote admin.
- **QuoteRequest**: Lu pour les comptes leads recus, transmis, refuses et non routes.
- **Lead / LeadAssignment**: Lu pour les comptes leads transmis, statuts et repartition par agent assigne dans le tenant.
- **RoutingDecision**: Lu si le domaine la persiste, pour les raisons de non-routage et la trace de decision.
- **CRMActivity**: Lu pour le pipeline CRM par statut, le delai moyen reception/premiere activite CRM et les agregats Pro/Enterprise.
- **Partner / Broker**: Lu pour partenaires actifs vs inactifs cote admin et pour scope tenant cote broker.
- **PartnerLicense**: Lu pour alertes licence expiree et licence expirant dans 30 jours, avec scope concerne.
- **ConsentRecord**: Lu indirectement pour distinguer leads transmis avec consentement valide des refus pour absence de consentement.
- **AuditLog**: Lu pour les alertes conformite et les agregats de tentatives refusees; ecrit pour chaque acces admin reussi ou refuse.
- **FeatureFlag**: Lu en persistance runtime pour `broker_dashboard_enabled`, `broker_crm_enabled` et les flags sensibles affiches en lecture seule cote admin.
- **Notification**: Lu eventuellement pour KPIs si pertinents (par exemple comptes notifications envoyees aux courtiers); le plan precisera son inclusion.
- **DashboardWindow**: Concept logique de la fenetre temporelle (`from`, `to`) appliquee aux agregats.
- **DashboardScope**: Concept logique combinant tenant, role, pays, produit et partenaire applique aux agregats.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% des appels `GET /broker/dashboard` par un courtier authentifie avec `broker_dashboard_enabled=true` retournent un dashboard adapte a son plan, scope a son tenant et calcule sur la fenetre demandee.
- **SC-002**: 100% des appels `GET /broker/dashboard` avec `broker_dashboard_enabled=false` ou absent retournent un refus fail-closed.
- **SC-003**: 100% des appels Pro/Enterprise avec `broker_crm_enabled=false` ou absent retournent un dashboard sans section CRM ou avec section CRM refusee, sans casser les KPIs Starter.
- **SC-004**: 100% des appels Starter retournent un dashboard sans donnees CRM (Kanban, taches, rappels, pipeline avance, assignation interne) quel que soit le role assigne dans le tenant.
- **SC-005**: 100% des tentatives broker d'acceder a un endpoint admin sont refusees et auditees.
- **SC-006**: 100% des appels admin reussis produisent un `AuditLog` durable avec acteur, action, scope et resultat.
- **SC-007**: 100% des tentatives admin hors scope (Admin Pays sur pays non autorise, Finance/Content Admin sur sections non autorisees) sont refusees ou bornees au scope autorise et auditees.
- **SC-008**: 100% des tentatives cross-tenant via parametres forges sont neutralisees: aucune donnee d'un tenant B ne peut apparaitre pour un acteur du tenant A.
- **SC-009**: 100% des requetes avec fenetre temporelle hors bornes (>365 jours, <1 jour, format invalide) sont refusees avec erreur explicite.
- **SC-010**: 0 endpoint dashboard expose une mutation, un export, un paiement, une souscription, une emission de police, une attestation, une signature electronique ou une fonction IA avancee.
- **SC-011**: 0 route dashboard est exposee dans l'application Web Publique Client.
- **SC-012**: 100% des agregats sont calcules par agregation Prisma sans N+1 detectable par les tests d'integration ou l'instrumentation Prisma.
- **SC-013**: 100% des listes sous-jacentes sont paginees avec parametres documentes et bornes par defaut/maximum.
- **SC-014**: 0 formulation interdite ("acheter", "souscrire maintenant", "contrat valide", "garantie acceptee", "la meilleure assurance du marche") n'apparait dans les contenus retournes.
- **SC-015**: 0 PII non necessaire n'est exposee dans les agregats; les details individuels respectent les permissions des specs 003 et 004.
- **SC-016**: 100% des feature flags sensibles affiches cote admin sont en lecture seule, calcules depuis la persistance runtime.

## Assumptions

- L'authentification, la session admin, la MFA et les guards RBAC necessaires existent deja et sont reutilisables; la spec n'en cree pas.
- Les entites `QuoteRequest`, `Lead`, `LeadAssignment`, `RoutingDecision`, `CRMActivity`, `Partner`, `PartnerLicense`, `Offer`, `Country`, `Product`, `ConsentRecord`, `AuditLog`, `FeatureFlag` sont persistees en PostgreSQL via Prisma-runtime conformement aux specs 010 et 011.
- Les agregats deterministes peuvent etre calcules par requetes Prisma agregees; aucun nouveau materialise/cache n'est introduit dans cette spec, sauf justification explicite dans le plan.
- Les endpoints existants (par exemple admin audit logs) peuvent etre reutilises pour la lecture des audits, sans creer de nouvelle route metier.
- Les notifications peuvent etre incluses ou non dans les KPIs; le plan tranchera selon la volumetrie disponible.
- Les seuils d'alerte (30 jours pour licence proche expiration) et les bornes (defaut 30 jours, max 365 jours) sont des defauts documentes; ils restent ajustables sans amendement de spec si le besoin est justifie dans le plan.
- Les tests utilisent les mecanismes existants (Vitest, tests HTTP NestJS, smoke runtime PostgreSQL) sans creer de nouveau framework.
- Les contenus FR/EN suivent la pratique deja en place; cette spec ne fixe pas les libelles UI.

## Risks

- Tentation d'introduire des mutations "discrettes" (par exemple resoudre une alerte) depuis le dashboard: cette spec interdit explicitement toute mutation.
- Risque de fuite tenant via parametre forge: la verification scope DOIT etre faite cote service ET repository.
- Risque de divergence avec les specs 003/004 sur la signification des statuts de leads: la spec impose de reutiliser les definitions existantes.
- Risque de cache feature flag stale masquant une desactivation: le plan precisera la strategie d'invalidation.
- Risque de N+1 sur les jointures multi-entites: le plan precisera les requetes agregees.
- Risque de surcharge si un acteur appelle a haute frequence: rate limits existants s'appliquent; ajuster si necessaire.
- Risque de PII excessive dans les details individuels: les detail eventuels respectent strictement les permissions existantes.
- Risque d'acces admin sans audit: l'audit DOIT etre durable et obligatoire pour les acces reussis et refuses cote admin.
- Risque d'introduire le dashboard avant l'activation explicite de `broker_dashboard_enabled`: ce flag DOIT etre fail-closed et active explicitement par les admins selon leur strategie de rollout.
- Risque de duplication de code entre dashboards Starter et Pro: le plan privilegiera la composition de services agreges, sans duplication fragile.

## Out Of Scope

- Generation de `plan.md`, generation de `tasks.md`, implementation ou commit automatique dans cette invocation.
- Paiement, facturation detaillee, encaissement, refacturation B2B avancee.
- Souscription, emission de police, emission d'attestation, signature electronique, sinistres.
- Recommandation IA, scoring IA, resume IA, assistant IA, decisioning IA.
- Webhooks, API assureur, integration externe nouvelle.
- Export CSV/Excel/PDF nouveau depuis les dashboards (les exports specs 003/004 restent gouvernes par leurs specs).
- Refonte UI complete du back-office.
- Modification des regles de routage existantes.
- Modification des regles RBAC ou MFA existantes hors integration des nouveaux endpoints.
- Modification fonctionnelle de l'application Web Publique Client.
- Multi-broker routing avance non deja prevu.
- White label dashboard partenaire.
- Activation de pays, produits ou partenaires nouveaux.
- Activation de modules IA, paiement, signature, police, attestation, sinistres, API assureur.
