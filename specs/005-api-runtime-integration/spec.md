# Feature Specification: API Runtime Integration AssurMatch

**Feature Branch**: `005-api-runtime-integration`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "Creer la specification technique 005-api-runtime-integration pour brancher reellement le runtime applicatif AssurMatch afin que les fonctionnalites deja prevues dans 001, 002, 003 et 004 soient utilisables via HTTP reel, avec NestJS, Prisma, Redis/BullMQ, Auth, RBAC, audit durable et clients frontend API. Ne pas ajouter de nouvelles fonctionnalites metier."
**Validation State**: Draft
**Continuous Workflow Eligible**: No - the user requested specification only and explicitly asked not to generate plan, tasks or implementation yet.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette specification rend executables les capacites deja specifiees dans 001, 002, 003 et 004. Elle ne cree aucune vente directe, souscription, encaissement de prime, emission de police, attestation, sinistre, API assureur avancee, signature electronique ou conseil personnalise engageant par AssurMatch.
- **Impacted application(s)**: Multiple scopes: Web Publique Client, Back-office Partenaires/Plateforme, Backend API, packages partages et infrastructure runtime. Les deux applications web doivent rester separees applicativement.
- **Affected scopes**: Auth, users, countries, products, offers, quote-forms, quote-requests, consent, leads, routing, broker Starter portal, broker CRM Pro/Enterprise, admin minimal existant, feature flags, audit logs, Prisma, Redis, BullMQ, OpenAPI, tests HTTP et Playwright.
- **Frontend separation**: L'application Web Publique Client consomme seulement les API publiques pays, produits, offres, formulaires, demandes de devis et statut visiteur minimal. Elle ne charge aucun ecran, route, privilege, token broker/admin, layout ou client API back-office. L'application Back-office Partenaires/Plateforme consomme seulement les API authentifiees broker/admin et refuse tout acces non authentifie ou non autorise.
- **Required feature flags**: Les flags existants restent les controles d'activation: `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled`, flags pays, flags produit, flags IA et flags de modules reglementes. `broker_crm_enabled` reste false par defaut. `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled` et les modules reglementes exclus restent desactives.
- **Consent and transmission**: Aucune transmission de lead ne peut etre executee sans ConsentRecord valide, scope et durable. Les endpoints publics de demande de devis doivent refuser les soumissions sans consentement, ne pas creer de LeadAssignment routable, ne notifier aucun courtier et auditer le refus.
- **Partner license controls**: Le runtime doit verifier les partenaires actifs, autorisations pays/produits, quotas et licences valides avant routage ou action broker sensible. Les licences expirees, suspendues, invalides, manquantes ou hors scope bloquent le routage et les actions sensibles concernees.
- **Audit and data history**: Les actions sensibles doivent produire des AuditLogs persistants, consultables par roles autorises et conservant correlationId lorsque disponible. Les entites critiques doivent conserver timestamps, auteur lorsque applicable, historique et raisons de refus.
- **Security and RBAC**: Toutes les routes broker/admin exigent authentification, ActorContext fiable, RBAC strict, MFA pour roles sensibles, isolation tenant courtier, controle pays/produit/plan et masquage PII dans logs, queues et erreurs. Les endpoints publics exigent validation stricte, rate limiting, anti-spam et messages non sensibles.
- **Routing impact**: Le runtime active le routage deja specifie, sans ajouter de nouvelle strategie commerciale. Tout lead non routable reste non transmis, avec raison persistante et audit.
- **AI impact**: Aucune IA avancee n'est activee. Les fonctions IA deja preparees restent flag-gated, assistance only, auditees et sans appel modele lorsque les flags globaux, pays, produit, partenaire ou plan sont desactives.
- **UX/content restrictions**: Les contenus publics conservent "offre indicative", "prix a confirmer", "courtier partenaire" et les CTA autorises. Les formulations de vente directe ou de contrat valide restent interdites.
- **Workflow continuity**: Non eligible a l'enchainement automatique dans cet etat Draft. Apres validation explicite et absence de marqueur de clarification, la feature pourra passer a `/speckit.plan`, puis `/speckit.tasks`, puis implementation, sauf conflit constitutionnel ou risque de securite/conformite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Exposer un runtime HTTP reel pour les capacites existantes (Priority: P1)

Une equipe technique veut demarrer l'API AssurMatch et obtenir des routes HTTP reelles pour les modules deja specifies afin que les contrats, tests et frontends ne restent pas de simples artefacts statiques.

**Why this priority**: Sans runtime NestJS cable, les guards, services, OpenAPI, tests et pages frontend ne prouvent pas le comportement applicatif.

**Independent Test**: Demarrer l'application backend dans un environnement de test propre, introspecter les routes exposees, appeler les endpoints publics et proteges, puis verifier que les modules metier sont injectes par le conteneur applicatif plutot qu'instancies manuellement hors tests.

**Acceptance Scenarios**:

1. **Given** l'API backend demarre, **When** le module applicatif est initialise, **Then** les modules auth, countries, products, offers, quote-requests, consent, leads, broker, CRM, feature flags, audit et admin minimal sont importes par le runtime et exposent les controllers prevus.
2. **Given** une classe nommee `*Controller`, **When** elle est utilisee par le runtime, **Then** elle possede les decorateurs HTTP requis et apparait dans la table de routes NestJS.
3. **Given** une dependance metier hors test, **When** le runtime la resout, **Then** elle provient de l'injection de dependances applicative et non d'une instanciation manuelle dans `AppModule`.

---

### User Story 2 - Executer le parcours public via API reelle (Priority: P1)

Un visiteur utilise la Web Publique Client pour consulter pays, produits, offres indicatives, formulaire de devis et confirmation, avec des appels API reels et des etats de chargement, erreur et vide.

**Why this priority**: Le parcours public 002 est la surface B2C principale et doit prouver consentement, flags, offres valides, anti-spam et routage sans exposer le back-office.

**Independent Test**: Depuis l'application publique, naviguer pays -> produit -> offres -> demande de devis -> confirmation en utilisant l'API HTTP, puis verifier les refus sans consentement, pays/produit desactive, offre expiree et licence courtier expiree.

**Acceptance Scenarios**:

1. **Given** un pays, produit et offres actives avec flags publics actifs, **When** un visiteur ouvre les pages publiques, **Then** les donnees viennent des endpoints publics reels et seules les offres indicatives valides sont affichees.
2. **Given** une demande de devis valide avec consentement, **When** le visiteur soumet le formulaire, **Then** le runtime cree les enregistrements durables attendus, evalue le routage et retourne une confirmation sans attendre les traitements lourds.
3. **Given** une demande sans consentement, **When** le visiteur soumet le formulaire, **Then** aucune transmission, aucun LeadAssignment routable et aucune notification courtier ne sont produits, et le refus est audite durablement.
4. **Given** l'application publique, **When** elle est inspectee ou naviguee par URL directe, **Then** aucune route broker, CRM ou admin n'est chargee ou appelee.

---

### User Story 3 - Proteger les parcours broker et admin par auth, RBAC, MFA et tenant (Priority: P1)

Un courtier Starter, un courtier Pro/Enterprise et un admin plateforme utilisent le back-office selon leur role, leur plan, leur tenant et leurs flags, sans acces public ni fuite cross-tenant.

**Why this priority**: Les specs 003 et 004 reposent sur l'isolation tenant, le plan Starter sans CRM, le CRM Pro flag-gated et les roles read-only.

**Independent Test**: Authentifier plusieurs acteurs de tenants distincts, appeler les routes Starter, CRM et admin avec et sans MFA/permissions, puis verifier les reponses 401, 403, 404/masquage et les audits de refus.

**Acceptance Scenarios**:

1. **Given** un courtier Starter authentifie avec MFA, **When** il liste ses leads, **Then** seuls les leads de son tenant sont retournes.
2. **Given** un courtier Starter, **When** il tente d'acceder au CRM, **Then** l'acces est refuse meme si une URL CRM existe.
3. **Given** un courtier Pro avec `broker_crm_enabled=true`, MFA et permission CRM, **When** il consulte le CRM, **Then** il accede seulement aux leads de son tenant et a son perimetre autorise.
4. **Given** `broker_crm_enabled=false` ou absent, **When** un courtier Pro tente le CRM, **Then** l'acces est refuse par defaut.
5. **Given** un role read-only, **When** il tente une mutation lead, export non autorise ou assignation, **Then** la mutation est refusee et auditee.

---

### User Story 4 - Utiliser des donnees et infrastructures runtime durables (Priority: P1)

Un operateur technique veut reconstruire une base fraiche, lancer l'API avec Prisma, Redis, BullMQ et audit persistants, puis constater que les services ne reposent pas sur des tableaux memoire en production.

**Why this priority**: Les comportements de conformite, audit, consentement, routage et file de jobs doivent survivre au redemarrage et etre exploitables.

**Independent Test**: Reconstruire une base depuis zero avec les migrations, executer les tests e2e HTTP contre Prisma reel et Redis/BullMQ reel configure, redemarrer le backend, puis verifier la persistance des consentements, leads, flags, jobs et AuditLogs.

**Acceptance Scenarios**:

1. **Given** une base vide, **When** les migrations sont appliquees dans l'ordre, **Then** toutes les tables/types necessaires a 001-004 existent sans intervention manuelle.
2. **Given** l'environnement hors test, **When** `PrismaService` est initialise, **Then** il utilise un client runtime reel et non un stub.
3. **Given** l'environnement hors test, **When** Redis et BullMQ sont configures, **Then** rate limiting, cache flags, anti-spam, doublons, locks et jobs asynchrones utilisent les adaptateurs runtime reels.
4. **Given** une action sensible, **When** elle reussit ou echoue, **Then** l'AuditLog est persiste et retrouvable apres redemarrage.

---

### User Story 5 - Aligner OpenAPI, DTOs et erreurs avec les routes reelles (Priority: P2)

Une equipe integration veut utiliser le contrat OpenAPI pour appeler l'API reelle avec les bons chemins, methodes, parametres, schemas de validation et erreurs standardisees.

**Why this priority**: Les contrats ne sont utiles que s'ils representent le runtime expose et les erreurs que les clients recevront.

**Independent Test**: Generer ou charger le contrat OpenAPI, lancer les tests contractuels contre l'application NestJS reelle et verifier chaque endpoint public, broker et admin minimal inclus.

**Acceptance Scenarios**:

1. **Given** un endpoint documente, **When** le test contractuel l'appelle, **Then** la methode, le chemin, les parametres, le body, les codes d'erreur et le schema de reponse correspondent au runtime.
2. **Given** une entree invalide, **When** elle est soumise a un endpoint, **Then** la validation DTO stricte refuse la requete avant la logique metier.
3. **Given** une erreur metier connue, **When** elle survient, **Then** elle est mappee vers 400, 401, 403, 404, 409, 422 ou 500 selon son type, avec message non sensible.

---

### User Story 6 - Prouver les parcours par tests HTTP et Playwright reels (Priority: P2)

Une equipe produit et qualite veut des tests qui naviguent et appellent reellement les applications et l'API, au lieu de lire des fichiers ou de valider des mocks.

**Why this priority**: Les regressions critiques de runtime ne sont detectees que par des tests qui traversent HTTP, auth, persistance, frontend et guards reels.

**Independent Test**: Executer les suites e2e HTTP et Playwright smoke contre des serveurs de test demarres, avec donnees de test isolees et flags controles.

**Acceptance Scenarios**:

1. **Given** les serveurs backend et frontend demarres, **When** Playwright ouvre la Web Publique Client, **Then** il navigue pays, produits, offres, formulaire et confirmation par interaction navigateur reelle.
2. **Given** le Back-office Partenaires/Plateforme, **When** Playwright ouvre le portail Starter et le CRM Pro, **Then** les vues gerent loading, empty, error, acces autorise et acces refuse.
3. **Given** les tests e2e HTTP, **When** ils couvrent consentement, licence expiree, Starter, CRM, read-only et audit, **Then** ils prouvent les routes NestJS reelles et non des services appeles directement.

### Edge Cases

- Pays desactive ou waitlist-only: les endpoints publics doivent masquer ou bloquer les donnees et la demande de devis, sans transmission.
- Produit desactive, quote-disabled ou comparison-disabled: le runtime bloque l'exposition ou la soumission selon le flag le plus restrictif.
- Consentement absent, expire, retire ou hors scope: la demande ne cree aucun routage transmissif et cree un audit de refus.
- Courtier inactif, non autorise, over-quota ou licence expiree/suspendue/invalide: le routage refuse ce courtier et conserve la raison.
- Offre expiree, brouillon, non validee, suspendue ou hors pays/produit: elle n'est jamais retournee comme disponible par l'API publique.
- `broker_crm_enabled` absent ou false: le CRM est refuse par defaut, y compris pour un plan Pro/Enterprise.
- Module reglemente sensible absent ou false: paiements, e-signature, emission de police, sinistres et API assureur restent inaccessibles.
- Utilisateur non authentifie, sans MFA, mauvais role, mauvais tenant ou read-only: l'acces ou la mutation est refuse sans fuite de donnees.
- Cache Redis indisponible ou incoherent: les decisions sensibles echouent ferme ou basculent vers la source persistante sans exposer plus que permis.
- BullMQ indisponible: l'endpoint public ne doit pas bloquer sur un traitement lourd, mais l'echec de job doit etre visible et retryable selon politique.
- Migration depuis base vide: aucun ordre implicite ou type manquant ne doit empecher la reconstruction.
- Tests: les adaptateurs memoire ne sont autorises que dans des tests isoles qui l'annoncent clairement; les tests runtime critiques utilisent les vrais endpoints.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme DOIT exposer une API HTTP NestJS reelle pour les capacites deja specifiees dans 001, 002, 003 et 004, sans ajouter de nouvelle fonctionnalite metier.
- **FR-002**: `AppModule` DOIT declarer les imports, controllers et providers requis par le runtime NestJS, et ne DOIT PAS se limiter a `@Module({})` avec instanciation manuelle des modules metier hors tests.
- **FR-003**: Les modules metier DOIVENT etre cables comme modules NestJS reels avec dependances injectees, exports explicites et frontieres conformes au pattern du repo.
- **FR-004**: Les controllers HTTP DOIVENT utiliser les decorateurs NestJS requis: `@Controller`, `@Get`, `@Post`, `@Patch`, `@Delete` si necessaire, `@Body`, `@Param`, `@Query`, `@Headers` si necessaire et `@UseGuards`.
- **FR-005**: Les controllers DOIVENT rester fins et deleguer la logique aux services applicatifs existants ou adaptes au runtime.
- **FR-006**: Le systeme DOIT brancher les DTOs existants ou equivalents aux controllers et appliquer une validation stricte des bodies, params, query params et headers utiles.
- **FR-007**: Le systeme DOIT standardiser les erreurs HTTP et mapper les erreurs metier vers 400, 401, 403, 404, 409, 422 ou 500 selon le cas.
- **FR-008**: Le systeme DOIT exposer les routes auth necessaires a login, logout/session, utilisateur courant, MFA enroll/verify et transformation en ActorContext fiable.
- **FR-009**: Toutes les routes broker/admin DOIVENT etre protegees par auth, RBAC, tenant isolation et MFA lorsque le role ou la constitution l'exige.
- **FR-010**: Le systeme DOIT garantir qu'un courtier ne voit que les leads de son tenant et que les agents ne voient que leur perimetre autorise.
- **FR-011**: Le systeme DOIT garantir qu'un courtier Starter ne peut acceder a aucun endpoint CRM, meme via URL directe ou requete fabriquee.
- **FR-012**: Le systeme DOIT garantir qu'un role read-only peut lire uniquement son scope autorise et ne peut pas muter, assigner, exporter sans permission ou changer de statut.
- **FR-013**: Le systeme DOIT exposer les endpoints publics pays, produits, offres, formulaires, demandes de devis et statut visiteur minimal prevus par 002.
- **FR-014**: Les endpoints publics DOIVENT appliquer flags globaux, pays, produit, offre, consentement, validation stricte, rate limiting, anti-spam et detection doublon.
- **FR-015**: Le systeme DOIT refuser toute demande de devis sans consentement valide, sans creer de LeadAssignment routable ni notification courtier.
- **FR-016**: Le systeme DOIT refuser l'affichage public des offres expirees, non validees, suspendues ou hors scope.
- **FR-017**: Le systeme DOIT exposer les endpoints broker Starter deja prevus par 003 avec auth, tenant isolation, actions minimales, export controle et audit.
- **FR-018**: Le systeme DOIT exposer les endpoints CRM Pro/Enterprise deja prevus par 004 avec flag `broker_crm_enabled`, plan Pro/Enterprise, permissions CRM, tenant isolation et audit.
- **FR-019**: Le systeme DOIT exposer les endpoints admin minimaux deja prevus pour pays, produits, offres, demandes, leads, partenaires, licences, feature flags, consentements, audits et sante systeme.
- **FR-020**: PrismaService DOIT utiliser un PrismaClient runtime reel hors tests et DOIT exposer une transaction/requete compatible avec les repositories runtime.
- **FR-021**: Les repositories ou services actuellement bases sur tableaux memoire DOIVENT etre remplaces par des repositories Prisma ou des adaptateurs runtime persistants, sauf dans des tests explicitement isoles.
- **FR-022**: Les migrations DOIVENT reconstruire une base fraiche depuis zero, avec `0001` creant les types/tables necessaires avant les migrations 002, 003 et 004.
- **FR-023**: `schema.prisma`, migrations, services, DTOs et contrats DOIVENT etre alignes sur les entites utilisees par les routes runtime.
- **FR-024**: Les feature flags DOIVENT etre lus depuis la source persistante prevue, caches avec Redis lorsque configure, et refuser par defaut les flags sensibles absents.
- **FR-025**: `broker_crm_enabled`, `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled` et `insurer_api_enabled` DOIVENT rester desactives par defaut.
- **FR-026**: AuditLogWriter DOIT persister les audits en base hors tests et conserver actor, action, cible, scope, resultat, raison, timestamp et correlationId lorsque disponible.
- **FR-027**: Le systeme DOIT auditer consentement, creation demande de devis, routage, refus de routage, acces detail lead, action Starter, action CRM, export, changement de statut, assignation, refus RBAC important et tentative sans consentement.
- **FR-028**: Redis DOIT utiliser un client runtime reel hors tests pour cache, flags, rate limiting, anti-spam, doublons, locks temporaires et idempotence.
- **FR-029**: BullMQ DOIT utiliser Redis runtime hors tests pour les jobs/notifications deja prevus et ne DOIT PAS bloquer les endpoints publics sur des traitements lourds synchrones.
- **FR-030**: Les adaptateurs memoire Redis, queue, audit, repositories ou Prisma ne DOIVENT etre utilises que dans des tests explicitement configures.
- **FR-031**: Les contrats OpenAPI DOIVENT correspondre aux vrais controllers exposes, chemins, methodes, params, bodies, reponses et erreurs.
- **FR-032**: Les tests contractuels DOIVENT appeler les routes HTTP reelles lorsque le contrat declare un endpoint runtime.
- **FR-033**: La Web Publique Client DOIT remplacer les mocks critiques par des appels API reels pour pays, produits, offres, formulaires, demandes de devis et statut visiteur minimal.
- **FR-034**: La Web Publique Client DOIT gerer loading, error, empty state et fallback explicite sans appeler d'API broker/admin.
- **FR-035**: Le Back-office Partenaires/Plateforme DOIT remplacer les mocks Starter/CRM critiques par des clients API reels pour liste, detail, actions, dashboard, pipeline et refus d'acces deja implementes.
- **FR-036**: Le Back-office Partenaires/Plateforme DOIT gerer loading, error, empty state et acces refuse sans exposer de route publique.
- **FR-037**: Les tests e2e HTTP DOIVENT couvrir GET pays publics, GET produits publics, GET offres publiques, POST demande avec consentement, POST demande sans consentement refuse, licence expiree, Starter, tenant isolation, CRM Pro, CRM flag false, read-only refuse et audit persiste.
- **FR-038**: Les tests Playwright DOIVENT naviguer dans les apps via navigateur reel et ne DOIVENT PAS se limiter a `readFileSync` ou verification de fichiers statiques.
- **FR-039**: Les endpoints publics ne DOIVENT PAS executer de traitement lourd synchrone; notifications, IA optionnelle et travaux differables doivent etre asynchrones.
- **FR-040**: Le systeme DOIT conserver la separation applicative entre Web Publique Client et Back-office Partenaires/Plateforme dans routes, layouts, clients API, variables d'environnement et politiques d'acces.

### Non-Functional Requirements

- **NFR-001**: 95% des lectures publiques pays/produits/offres actives doivent retourner un contenu utilisable en moins de 2 secondes dans les tests d'acceptation.
- **NFR-002**: 95% des soumissions publiques valides doivent retourner un etat de confirmation en moins de 5 secondes, hors livraison asynchrone de notifications et IA optionnelle.
- **NFR-003**: Les listes broker/admin doivent etre paginees, filtrees et bornees pour eviter les exports ou lectures massives non controles.
- **NFR-004**: Les logs applicatifs, queues, audits et erreurs doivent minimiser ou masquer la PII brute.
- **NFR-005**: Les decisions critiques de flags, consentement, licence, RBAC et tenant doivent echouer ferme lorsque leur etat ne peut pas etre verifie.
- **NFR-006**: La reconstruction d'une base de test depuis zero doit etre repetable sans etape manuelle.
- **NFR-007**: Les tests de refus doivent demontrer zero fuite de donnees broker/admin vers l'application publique et zero lecture cross-tenant reussie.
- **NFR-008**: Le runtime doit pouvoir fonctionner avec des services reels configurables en local, test d'integration, staging et production-like sans secrets commits.

### Runtime Wiring Rules

- `AppModule` doit importer les modules NestJS reels et laisser le conteneur resoudre les dependances.
- Chaque module metier doit declarer ses controllers, providers et exports necessaires au runtime.
- Les services applicatifs ne doivent pas construire eux-memes leurs repositories, queues, Redis clients ou AuditLogWriter hors factories de test.
- Les controllers doivent utiliser DTOs valides et guards explicites.
- Les guards auth/RBAC/MFA/tenant doivent recevoir un ActorContext issu de la requete authentifiee, pas d'une valeur statique.
- Les filtres d'erreur et pipes de validation doivent etre branches globalement ou par controller de maniere testable.
- Les tests unitaires peuvent instancier des services directement, mais les tests e2e/contractuels doivent passer par l'application NestJS et Supertest ou equivalent.

### HTTP Endpoints To Expose

Les endpoints ci-dessous sont les surfaces runtime a rendre coherentes avec les specs 001-004 et les contrats existants. Ils ne creent pas de nouvelles capacites metier.

| Area | Method | Endpoint | Caller | Required controls |
|------|--------|----------|--------|-------------------|
| Auth | POST | `/auth/login` | Public account users | DTO validation, rate limit, audit on sensitive failure |
| Auth | POST | `/auth/logout` | Authenticated users | Auth |
| Auth | GET | `/auth/me` | Authenticated users | Auth, ActorContext |
| Auth | POST | `/auth/mfa/enroll` | Admins, brokers | Auth, RBAC, MFA policy |
| Auth | POST | `/auth/mfa/verify` | Admins, brokers | Auth, MFA challenge |
| Public Countries | GET | `/countries` | Public | Public flags, cache, fail closed |
| Public Countries | GET | `/countries/:countryCode` | Public | Country flags, public wording |
| Public Products | GET | `/countries/:countryCode/products` | Public | Country/product flags |
| Public Products | GET | `/countries/:countryCode/products/:productKey` | Public | Product flags, compliance wording |
| Public Offers | GET | `/countries/:countryCode/products/:productKey/offers` | Public | Valid offers only, sponsorship labels |
| Public Offers | GET | `/offers/:offerId` | Public | Valid offer only |
| Public Quote Form | GET | `/countries/:countryCode/products/:productKey/quote-form` | Public | Quote flags, consent text |
| Public Quote Request | POST | `/quote-requests` | Public | Validation, consent, anti-spam, duplicate, routing |
| Public Quote Status | GET | `/quote-requests/:publicReference` | Public with reference/token | Minimal visitor status only |
| Broker Starter | GET | `/broker/starter/dashboard` | Authenticated broker | Auth, MFA, Starter flag, tenant |
| Broker Starter | GET | `/broker/starter/leads` | Authenticated broker | Tenant, RBAC, pagination |
| Broker Starter | GET | `/broker/starter/leads/:leadId` | Authenticated broker | Tenant, assignment, audit detail access |
| Broker Starter | POST | `/broker/starter/leads/:leadId/accept` | Authenticated broker | Tenant, permission, status |
| Broker Starter | POST | `/broker/starter/leads/:leadId/reject` | Authenticated broker | Tenant, reason, permission |
| Broker Starter | POST | `/broker/starter/leads/:leadId/dispute` | Authenticated broker | Tenant, reason, permission |
| Broker Starter | GET | `/broker/starter/leads/:leadId/history` | Authenticated broker | Tenant, RBAC |
| Broker Starter | GET | `/broker/starter/notifications` | Authenticated broker | Tenant, RBAC |
| Broker Starter | POST | `/broker/starter/notifications/:notificationId/read` | Authenticated broker | Tenant, RBAC |
| Broker Starter | GET | `/broker/starter/leads/export.csv` | Authenticated broker | Export permission, volume, audit |
| Broker Starter | GET | `/broker/starter/plan-capabilities` | Authenticated broker | Plan and flags |
| Broker CRM | GET | `/broker/crm/dashboard` | Pro/Enterprise broker | Auth, MFA, CRM flag, tenant |
| Broker CRM | GET | `/broker/crm/leads` | Pro/Enterprise broker | CRM RBAC, tenant, pagination |
| Broker CRM | GET | `/broker/crm/leads/kanban` | Pro/Enterprise broker | CRM RBAC, tenant |
| Broker CRM | GET | `/broker/crm/leads/:leadId` | Pro/Enterprise broker | CRM RBAC, tenant, audit detail access |
| Broker CRM | POST | `/broker/crm/leads/:leadId/status` | Pro/Enterprise broker | Mutation permission, transition policy |
| Broker CRM | POST | `/broker/crm/leads/:leadId/notes` | Pro/Enterprise broker | Mutation permission, tenant |
| Broker CRM | POST | `/broker/crm/leads/:leadId/tasks` | Pro/Enterprise broker | Mutation permission, tenant |
| Broker CRM | POST | `/broker/crm/leads/:leadId/reminders` | Pro/Enterprise broker | Mutation permission, tenant |
| Broker CRM | POST | `/broker/crm/leads/:leadId/assign` | Pro/Enterprise broker | Same-tenant advisor, permission |
| Broker CRM | POST | `/broker/crm/leads/:leadId/documents` | Pro/Enterprise broker | Internal-only, permission |
| Broker CRM | POST | `/broker/crm/leads/:leadId/proposals` | Pro/Enterprise broker | Non-contractual, permission |
| Broker CRM | POST | `/broker/crm/leads/:leadId/disputes` | Pro/Enterprise broker | Reason, permission |
| Broker CRM | GET | `/broker/crm/leads/export.csv` | Pro/Enterprise broker | Export permission, volume, audit |
| Broker CRM | GET | `/broker/crm/notifications` | Pro/Enterprise broker | Tenant |
| Admin | GET/PATCH | `/admin/feature-flags` and `/admin/feature-flags/:id` | Authorized admins | RBAC, audit, persistent flags |
| Admin | GET | `/admin/audit-logs` | Super/Compliance admins | RBAC, filters, PII minimization |
| Admin | GET/CRUD | `/admin/countries`, `/admin/products`, `/admin/offers` | Authorized admins | RBAC, audit |
| Admin | GET/CRUD | `/admin/partners`, `/admin/partners/:partnerId/licenses` | Authorized admins | RBAC, license audit |
| Admin | GET | `/admin/quote-requests`, `/admin/lead-assignments` | Authorized admins | Scope, PII, pagination |
| Admin | GET | `/admin/system/health` | Super/Support admins | Auth, RBAC |

### Impacted NestJS Modules

- `AppModule`: real imports/providers/controllers, no manual module graph outside tests.
- `ConfigModule`: validated runtime config for database, Redis, BullMQ, auth secrets, public/back-office origins and feature defaults.
- `AuthModule`: login/session/JWT strategy, MFA service, guards, ActorContext extraction.
- `UsersModule`: users, roles, scopes and broker/admin actor resolution.
- `CountriesModule`, `ProductsModule`, `OffersModule`, `QuoteFormsModule`: public/admin controllers and Prisma-backed catalog repositories.
- `QuoteRequestsModule`: public quote submission, consent enforcement, anti-spam, duplicate detection, routing and async notification dispatch.
- `ConsentModule`: ConsentText and ConsentRecord persistence and lookup.
- `LeadsModule`: routing, LeadAssignment, Starter portal and CRM controllers/services.
- `PartnersModule`, `PartnerLicensesModule`: partner eligibility and license checks used by routing and broker access policies.
- `FeatureFlagsModule`: persistent flags, precedence, Redis cache, fail-closed defaults.
- `AuditLogsModule`: persistent writer and admin search controller.
- `NotificationsModule`, `QueuesModule`: BullMQ-backed notifications and job status visibility.
- `RedisModule`: real Redis client provider and test-only memory adapter boundary.
- `RoutingModule`, `AIModule`, `DocumentsModule`, `Admin/SystemHealthModule`: wire existing minimal surfaces only where already specified.

### Impacted Providers

- `PrismaService` must extend or wrap real PrismaClient outside tests.
- `AuditLogWriter` must write to durable AuditLog storage outside tests.
- Redis client provider must be configurable and real outside tests.
- Queue provider must use BullMQ with Redis outside tests.
- Feature flag resolver/cache must read persistent flags and cache by scope.
- Public catalog repositories must read Prisma data, not static arrays.
- Quote submission, duplicate detection, anti-spam and rate limit providers must use persistent data and Redis where required.
- Routing and broker eligibility providers must use partner, authorization, quota and license data from durable storage.
- Broker Starter and Broker CRM services must use durable LeadAssignment/CRM data and shared access policies.
- Auth/RBAC/MFA guards must be executable Nest guards, not inert helper classes.
- Error response filter and validation pipe must be wired into runtime requests.

### Prisma Models And Migration Impact

- `schema.prisma` and migrations must cover the durable entities from specs 001-004: users, roles, partner tenants, countries, regulatory regimes, products, offers, quote form definitions, prospects, quote requests, consent texts, consent records, lead assignments, lead histories/actions, broker CRM state/activity, feature flags, audit logs, notifications/jobs, partner licenses and documents.
- Migration `0001` must create all base enums/types/tables required by later migrations.
- Migrations 002, 003 and 004 must apply cleanly after `0001` on a fresh database.
- Migration validation must include rebuild from empty database, Prisma schema validation and at least one seed/test fixture path for e2e HTTP tests.
- Existing in-memory-only identifiers must be reconciled with stable database identifiers and non-guessable public/broker references.
- Audit, consent and lead evidence must follow the existing 10-year default retention unless country/regime rules override it.

### Redis And BullMQ Strategy

- Redis runtime is required outside tests for flag cache, public catalog cache, rate limits, anti-spam, duplicate fingerprints, idempotency and routing locks.
- Redis keys must not contain raw PII; email/phone duplicate keys use non-reversible fingerprints.
- Feature flag cache must fail closed for sensitive or missing values.
- BullMQ runtime is required outside tests for visitor/broker notifications, optional IA summary work already specified, operational retry and job status visibility.
- Public endpoints return after durable state is written and jobs are enqueued; they do not wait for notification delivery or IA completion.
- Memory Redis/queue adapters are allowed only in unit tests or explicitly isolated test modules.

### Durable Audit Strategy

- Audit entries must be persisted for sensitive successes and refusals.
- Required actions include consent accepted/refused, quote request created/refused, routing evaluated/refused, lead assigned, lead detail viewed, Starter actions, CRM actions, export requested/completed/refused, status changes, assignment, feature flag changes, RBAC refusals, license/routing blockers and attempts without consent.
- Each audit entry includes actor when available, anonymous/public reference when not authenticated, target type/id, action, scope, result, reason, timestamp and correlationId.
- Audit context must be PII-minimized and searchable by authorized compliance/admin roles.
- A sensitive action whose audit write fails must fail or be flagged for operational review according to severity.

### Auth, RBAC And MFA Strategy

- Auth runtime must produce a trusted ActorContext with actor id, roles, tenant, scopes, MFA state and correlationId.
- Broker/admin routes require auth. Public routes must not depend on broker/admin auth state.
- MFA is required for administrators and brokers before sensitive routes.
- RBAC must check role, permission, tenant, plan, country/product scope and action type.
- Tenant checks must be performed before resource existence is revealed for broker resources.
- Starter plan cannot access CRM permissions or endpoints.
- CRM requires Pro/Enterprise, `broker_crm_enabled=true`, CRM permission and tenant scope.
- Read-only roles cannot mutate, assign, export without explicit export permission or change status.
- Important refusals are audited without leaking PII or confirming inaccessible resource existence.

### Web Publique Client Impact

- Replace critical mocks/static reads with API clients for countries, products, offers, quote form, quote submission and public status.
- Preserve public-only routing, layout and environment variables.
- Add loading, error, empty and disabled-state handling for API failures and flags.
- Do not import or call broker/admin API clients, auth state, RBAC policy, CRM routes or back-office layouts.
- Keep public copy compliant: indicative offers, partner broker responsibility, no direct sale/subscription wording.

### Back-office Partenaires/Plateforme Impact

- Replace critical Starter/CRM mocks with authenticated API clients.
- Wire Starter lead list, detail, actions, notifications, export and dashboard to real endpoints.
- Wire CRM dashboard, list, Kanban, detail, pipeline actions, notes, tasks, reminders, assignment, documents, proposals, disputes, notifications and export to real endpoints where already implemented by 004.
- Handle loading, error, empty state, unauthorized, forbidden, MFA required and feature disabled states.
- Keep all back-office routes behind auth and outside the Web Publique Client.

### OpenAPI And Contract Impact

- Contracts must be regenerated or corrected from the actual controllers or validated against them.
- Each documented route must have matching method, path, params, query, body, response and error schema.
- Contract tests must boot the Nest application and call HTTP routes, not only validate Zod schemas or service functions.
- Deprecated or non-runtime contracts must be marked as reserved/not exposed or removed from runtime contract expectations.

### Test Impact

- Add e2e HTTP tests with Nest testing module and Supertest or equivalent for the mandatory public, broker, CRM, flag, consent, license, read-only and audit scenarios.
- Add contract tests against real routes for public, broker Starter, CRM and admin minimal endpoints.
- Add migration rebuild tests from empty database.
- Add Redis/BullMQ integration tests or controlled runtime adapter tests proving memory adapters are not used outside test mode.
- Add Playwright smoke tests that navigate real public and back-office apps.
- Existing tests that only read files or call services directly must remain unit tests or be replaced for runtime acceptance.

### Migration Scenarios

- Fresh local/test database: apply all migrations from zero, seed minimal countries/products/offers/brokers/licenses/flags/users and pass e2e HTTP tests.
- Existing development database: apply new runtime alignment migrations without deleting user data, then run smoke checks.
- Missing or stale feature flags: create required flag records with safe disabled defaults and audit the migration/seed action when applicable.
- In-memory audit/queue/cache data: no production migration is required for memory-only historical test data, but runtime must start with durable stores.
- Failed migration: rollback or stop startup before exposing partial routes.

### Risks

- Existing services may encode business state only in memory, requiring careful repository replacement without changing behavior.
- Existing OpenAPI contracts may diverge from code and require endpoint naming reconciliation.
- Dirty or partially implemented 004 artifacts may need integration decisions during planning.
- Real Redis/BullMQ/Prisma tests may increase setup complexity and runtime duration.
- Auth/RBAC/MFA may reveal hidden assumptions because previous guards were not protecting real routes.
- Frontend mock replacement may expose missing loading/error UX states.

### Out Of Scope

- New business features, new commercial modules or changes to eligibility/routing business rules beyond making existing rules executable.
- Payment, premium collection, subscription, policy issuance, attestation, e-signature, claims, advanced insurer API, advanced webhooks and advanced AI.
- Full UI redesign or total architecture rewrite.
- Public exposure of broker/admin data.
- Activating `broker_crm_enabled` by default or activating any regulated module by default.

### Key Entities *(include if feature involves data)*

- **RuntimeModuleGraph**: The effective set of modules, controllers and providers registered in the NestJS application.
- **ActorContext**: Trusted authenticated actor with roles, tenant, scopes, MFA state and correlationId.
- **HttpController**: Decorated NestJS controller exposing a real route with guards, DTO validation and error mapping.
- **PrismaRepository**: Runtime data adapter backed by PrismaClient for durable entities.
- **FeatureFlag**: Persistent activation record with global, country, product, partner, plan and module scope, cached safely.
- **ConsentRecord**: Durable proof required before lead transmission.
- **QuoteRequest**: Visitor request created after validation and consent checks.
- **LeadAssignment**: Durable assignment to an eligible broker tenant.
- **BrokerCrmRecord**: Durable CRM state/activity for Pro/Enterprise brokers when allowed by plan and flag.
- **AuditLog**: Durable compliance event for sensitive successes and refusals.
- **QueueJobRecord**: Persistent/observable async job status for notification and optional jobs.
- **RedisRuntimeState**: Cache, rate limit, duplicate, idempotency and lock state backed by Redis outside tests.
- **OpenApiContract**: Runtime-aligned contract for clients and contract tests.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The backend exposes at least one real HTTP route for every included area: auth, public countries, public products, public offers, quote requests, public status, Starter broker, CRM broker, feature flags, audit/admin minimal and health.
- **SC-002**: 100% of documented runtime endpoints in this spec either pass contract tests against real HTTP routes or are explicitly marked not exposed before planning completion.
- **SC-003**: 100% of e2e HTTP tests for no consent, expired license, Starter CRM denial, CRM flag false, cross-tenant read, read-only mutation and audit persistence pass.
- **SC-004**: 0 public-app Playwright routes load or call broker/admin routes, clients, layouts, auth state or privileges.
- **SC-005**: 0 cross-broker lead reads, mutations, exports or notifications succeed in RBAC regression tests.
- **SC-006**: 100% of sensitive actions listed in the audit strategy create durable AuditLog evidence in acceptance tests.
- **SC-007**: A fresh database can be rebuilt from migrations and used by the HTTP e2e suite without manual SQL fixes.
- **SC-008**: In non-test runtime configuration, Prisma, Redis, BullMQ and AuditLog persistence are real adapters, and memory adapters are rejected or not registered.
- **SC-009**: 95% of public catalog reads return usable content in under 2 seconds and 95% of valid quote submissions return confirmation in under 5 seconds in acceptance testing.
- **SC-010**: `broker_crm_enabled`, payments, e-signature, policy issuance, claims and insurer API remain disabled by default in persisted flag state and runtime behavior.

## Assumptions

- Specs 001, 002, 003 and 004 remain the source of business behavior; this spec only makes their runtime integration executable.
- The repo continues with a modular NestJS backend, Prisma/PostgreSQL, Redis and BullMQ as stated in the constitution.
- The existing two web applications are `apps/public` for Web Publique Client and back-office apps under `apps/broker` and `apps/admin` for partners/platform users.
- JWT or session choice follows the existing auth implementation during planning; the required outcome is a trusted ActorContext and protected routes.
- Test environments may use isolated memory adapters only where the test explicitly targets unit behavior; runtime/e2e acceptance uses real HTTP and durable stores.
- Default retention for audit, consent and lead evidence follows the 10-year foundation default unless a country/regime rule overrides it.
- Any endpoint listed here that was already reserved by a previous spec but not yet implemented must be implemented only to the behavior previously specified, not extended with new business scope.
