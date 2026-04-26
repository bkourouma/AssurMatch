# Feature Specification: API HTTP Wiring AssurMatch

**Feature Branch**: `008-api-http-wiring`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "Creer la specification technique 008-api-http-wiring pour transformer le runtime HTTP NestJS actuel en API robuste, idiomatique et durable avec vrais modules metiers, controllers decores, repositories Prisma, ActorContext fiable, audit durable, feature flags persistants, frontends branches reellement et tests HTTP/Playwright runtime. Ne genere pas le plan, ne genere pas tasks.md, n'implemente rien."
**Validation State**: Draft
**Continuous Workflow Eligible**: No - cette invocation est limitee a la specification; le user a explicitement demande de ne pas generer le plan, les taches ni l'implementation.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette specification recable les capacites HTTP deja exposees. Elle n'ajoute aucune vente directe, souscription, encaissement de prime, emission de police, attestation, sinistre, paiement, signature electronique, API assureur avancee, webhook avance, IA avancee ou conseil personnalise engageant par AssurMatch.
- **Impacted application(s)**: Multiple scopes. Backend API: impact principal. Web Publique Client: branchement reel du formulaire de demande de devis et erreurs visibles. Back-office Partenaires/Plateforme: appels broker/admin strictement authentifies et erreurs visibles. Packages partages: DTOs, contrats HTTP, schemas de validation et helpers de test si necessaire.
- **Affected scopes**: API publique, API broker, API admin, modules NestJS metiers, controllers HTTP, ActorContext, Auth/RBAC/MFA, tenant isolation, Prisma repositories, audit logs, feature flags, public quote form, clients API frontend, tests HTTP e2e et Playwright.
- **Frontend separation**: Les parcours visiteurs restent dans `apps/public` et ne doivent appeler que les endpoints publics. Les parcours authentifies broker/admin restent dans `apps/broker` et `apps/admin` et ne doivent appeler que les endpoints broker/admin. Aucun layout, etat d'authentification, privilege, route ou client back-office ne doit etre charge par l'application publique.
- **Required feature flags**: Les flags existants restent les controles applicables: `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, flags pays, flags produit, flags partenaire/plan si existants et flags IA. `broker_crm_enabled`, `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled` et tout module reglemente restent false par defaut lorsqu'absents.
- **Consent and transmission**: Un ConsentRecord durable, valide et scope est obligatoire avant toute transmission de lead. Une demande sans consentement doit etre refusee, ne doit pas etre routee et doit creer une preuve d'audit durable.
- **Partner license controls**: Les routes et services qui exposent ou routent des leads doivent verifier qu'un courtier est actif, autorise pour le pays/produit, dans son quota applicable et couvert par une licence valide, non expiree, non suspendue et non invalide.
- **Audit and data history**: Les actions sensibles et refus importants doivent produire des AuditLogs durables avec acteur, action, cible, scope, resultat, raison, timestamp et correlationId lorsque disponible. Les endpoints admin d'audit lisent la persistance durable, jamais un buffer memoire.
- **Security and RBAC**: Toutes les routes broker/admin exigent authentification, RBAC strict, MFA lorsque le role ou l'action le demande, ActorContext fiable et tenant isolation. Les donnees PII ne doivent pas fuiter dans les erreurs, logs, caches, payloads de jobs, tests ou messages frontend.
- **Routing impact**: Les regles de routage existantes ne changent pas. Le recablage doit continuer a bloquer tout lead non routable: absence consentement, pays/produit desactive, offre expiree ou non validee, courtier inactif, non autorise, licence invalide/expiree, quota ou regle de routage non satisfaite.
- **AI impact**: Aucun usage IA nouveau. Les flags IA restent fermes par defaut et aucun appel modele ne doit etre introduit par cette specification.
- **UX/content restrictions**: Le frontend public conserve le vocabulaire conforme: "Comparer les offres", "Demander un devis", "etre rappele par un courtier agree", "offre indicative", "prix indicatif", "a confirmer par le courtier partenaire". Les formulations interdites comme "acheter maintenant", "souscrire maintenant", "contrat valide" ou equivalents ne doivent pas etre introduites.
- **Workflow continuity**: Apres validation explicite et absence de marqueur de clarification, cette feature technique standard pourra passer a `/speckit.plan`, puis `/speckit.tasks`, puis `/speckit.implement`, sauf conflit constitutionnel, risque securite/conformite/donnees, activation interdite, decision produit non couverte ou validation bloquante. Aucun commit automatique apres implementation sans demande explicite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initialiser une API NestJS modulaire (Priority: P1)

Une equipe technique demarre l'application backend et constate que les domaines HTTP critiques sont cables via de vrais modules NestJS importes dans AppModule, avec controllers declares et providers injectes.

**Why this priority**: L'API ne peut pas etre maintenable ni testable durablement si les routes restent principalement portees par une facade programmatique unique et de l'instanciation manuelle.

**Independent Test**: Demarrer AppModule dans un test HTTP runtime et verifier que les controllers de domaine repondent aux routes concernees sans dependre exclusivement de RuntimeHttpController.

**Acceptance Scenarios**:

1. **Given** l'application demarre, **When** Nest initialise AppModule, **Then** les modules metiers reels sont importes et exposent leurs controllers/providers via `@Module`.
2. **Given** un endpoint public pays, **When** un visiteur appelle `GET /countries`, **Then** un vrai controller NestJS decore repond via le module Countries.
3. **Given** RuntimeHttpController existe encore pendant la transition, **When** un endpoint migre est teste, **Then** l'acceptance prouve qu'il n'est plus servi uniquement par la facade programmatique.
4. **Given** un service metier a besoin d'une dependance, **When** le module est initialise, **Then** la dependance est injectee par Nest et non instanciee manuellement hors test.

---

### User Story 2 - Soumettre une demande de devis publique reelle (Priority: P1)

Un visiteur remplit le formulaire de demande de devis dans Web Publique Client, donne son consentement explicite et recoit une confirmation avec reference publique issue de la creation durable de la demande.

**Why this priority**: Le parcours public central ne doit plus etre un formulaire statique ou trompeur; il doit prouver consentement, validation, persistance et absence de fuite d'information sensible.

**Independent Test**: Lancer l'API et l'application publique en mode e2e, soumettre le formulaire par navigateur reel, puis verifier l'appel `POST /quote-requests`, la reponse `publicReference` et l'affichage de confirmation.

**Acceptance Scenarios**:

1. **Given** un pays, produit, offre indicative et courtier eligible sont actifs, **When** un visiteur soumet le formulaire avec consentement, **Then** `POST /quote-requests` cree une demande persistante et retourne une confirmation avec `publicReference`.
2. **Given** une demande sans consentement, **When** `POST /quote-requests` est appele, **Then** la demande est refusee, aucun lead n'est transmis et le refus est audite durablement.
3. **Given** le pays ou produit est desactive pour le public ou le devis, **When** le visiteur tente de soumettre, **Then** la demande est refusee avec message non sensible et sans transmission.
4. **Given** aucune offre ou aucun courtier eligible n'est disponible, **When** la demande est soumise, **Then** le visiteur voit un refus explicite non sensible et aucun detail broker/admin n'est expose.
5. **Given** le visiteur est rate-limited, **When** il soumet a nouveau, **Then** le frontend affiche l'erreur et l'API ne masque pas l'echec par un fallback silencieux.

---

### User Story 3 - Proteger les parcours broker par acteur fiable (Priority: P1)

Un courtier authentifie accede uniquement a ses propres leads et capacites autorisees, avec refus des acces sans acteur valide, inter-courtier, read-only non autorises et CRM hors plan/flag.

**Why this priority**: Les donnees de leads et CRM sont sensibles; la constitution impose RBAC, MFA, tenant isolation et interdiction CRM pour Starter ou flag absent/false.

**Independent Test**: Executer des tests HTTP e2e sur les routes broker avec tokens/acteurs valides et invalides, puis verifier les statuts HTTP, audits de refus et absence de fuite cross-tenant.

**Acceptance Scenarios**:

1. **Given** aucun acteur valide, **When** une route `GET /broker/starter/leads` ou `GET /broker/crm/leads` est appelee, **Then** l'acces est refuse.
2. **Given** un courtier Starter, **When** il appelle une route CRM, **Then** l'acces est refuse, audite et aucun objet CRM n'est retourne.
3. **Given** `broker_crm_enabled` false ou absent, **When** un courtier Pro appelle le CRM, **Then** l'acces est refuse meme si son plan serait eligible.
4. **Given** un courtier A, **When** il tente d'acceder aux leads du courtier B, **Then** l'acces est refuse, audite et la reponse ne confirme pas l'existence de la ressource.
5. **Given** un utilisateur read-only, **When** il tente une action de mutation broker, **Then** l'action est refusee sans modifier la persistance.

---

### User Story 4 - Administrer flags, audit et sante via API durable (Priority: P1)

Un administrateur autorise consulte et modifie les controles operationnels sensibles via des endpoints admin proteges qui lisent et ecrivent des donnees durables.

**Why this priority**: Les decisions de production doivent etre auditables, persistantes et fermees par defaut; les endpoints admin ne peuvent pas lire des tableaux memoire ou bypasser RBAC/MFA.

**Independent Test**: Appeler les endpoints admin avec roles autorises et non autorises, modifier un flag, produire une action sensible, puis verifier que l'audit et le flag viennent de la persistance durable.

**Acceptance Scenarios**:

1. **Given** un admin autorise, **When** il appelle `GET /admin/audit-logs`, **Then** les logs viennent de la persistance durable.
2. **Given** une action sensible reussie, **When** l'admin consulte les audit logs, **Then** un AuditLog durable avec correlationId disponible est consultable.
3. **Given** un admin non autorise, **When** il appelle `GET /admin/feature-flags` ou `PATCH /admin/feature-flags/:id`, **Then** l'acces est refuse et le refus important est audite.
4. **Given** un flag sensible absent, **When** l'API runtime l'evalue, **Then** la decision est false par defaut.
5. **Given** un admin modifie un flag, **When** l'operation reussit, **Then** le changement, son historique, son audit et l'invalidation/cache associee sont observables.

---

### User Story 5 - Remplacer les tests structurels par des validations runtime (Priority: P2)

Une equipe qualite dispose de tests HTTP et Playwright qui executent les controllers reels et les frontends reels lorsque l'environnement e2e est configure, au lieu de seulement lire les fichiers source.

**Why this priority**: Les guardrails structurels restent utiles, mais ils ne prouvent pas que l'API NestJS, les guards, la persistance et le frontend fonctionnent ensemble.

**Independent Test**: Executer la suite e2e documentee avec API et frontends lances, puis verifier les parcours publics, broker et admin par requetes HTTP reelles et navigation Playwright.

**Acceptance Scenarios**:

1. **Given** les variables d'environnement e2e sont presentes, **When** les tests Playwright sont lances, **Then** ils naviguent reellement dans Web Publique Client et Back-office selon leur scope.
2. **Given** l'environnement e2e API est disponible, **When** les tests HTTP s'executent, **Then** ils utilisent AppModule et les controllers reels, pas uniquement RuntimeHttpController.
3. **Given** une API indisponible, **When** le frontend charge les donnees, **Then** un etat d'erreur visible est affiche au lieu d'un fallback silencieux `[]` ou `{}`.
4. **Given** des tests structurels existent encore, **When** l'objectif est e2e, **Then** ils ne peuvent pas etre les seuls tests d'acceptance runtime.

### Edge Cases

- Pays public desactive, waitlist-only ou devis desactive: les endpoints publics doivent refuser ou rediriger selon configuration sans transmission de lead.
- Produit desactive, quote-disabled, comparison-disabled ou manual-review-required: le frontend et l'API doivent bloquer l'action publique concernee.
- Consentement manquant, refuse, expire ou hors scope: aucune transmission, refus non sensible, AuditLog durable.
- Offre expiree, non validee publiquement ou sponsorisee: elle ne doit pas etre affichee comme disponible ni justifier une promesse de prix; sponsorisation visible lorsque applicable.
- Courtier inactif, non autorise, licence expiree/suspendue/invalide ou quota depasse: aucune assignation ni notification lead.
- `broker_crm_enabled` absent, false, stale ou source indisponible: CRM refuse par defaut.
- Role sans permission, MFA manquante ou session invalide: routes broker/admin refusees avec mapping HTTP coherent et audit lorsque l'action est sensible.
- ActorContext absent ou simule hors mode autorise: acces broker/admin refuse; les controllers ne re-parsent pas eux-memes les headers de simulation.
- Cross-tenant broker: aucune lecture, mutation, export, notification ou reponse confirmant l'existence hors tenant.
- Audit durable indisponible pour une action critique: l'action doit echouer ferme ou produire un etat operationnel explicite selon criticite.
- Redis/cache feature flag indisponible: les flags sensibles restent fermes; aucun module reglemente n'est active.
- API publique indisponible ou reponse non-OK: les frontends affichent un etat d'erreur explicite et n'utilisent pas de fallback trompeur.
- Rate limit, spam, doublon quote request ou entree malformee: refus non sensible, validation serveur, audit lorsque pertinent.
- Test e2e sans variables requises: la suite doit skip/documenter clairement le manque d'environnement au lieu de passer par lecture source uniquement.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: AppModule DOIT importer de vrais modules NestJS de domaine pour les surfaces publiques, broker et admin concernees.
- **FR-002**: Chaque module NestJS de domaine DOIT declarer ses controllers, providers, repositories et exports necessaires via `@Module`.
- **FR-003**: RuntimeHttpController PEUT rester temporairement comme facade de transition, mais aucun endpoint d'acceptance migre ne doit rester uniquement servi par sa decoration programmatique.
- **FR-004**: L'instanciation manuelle de services, controllers, guards, repositories ou writers DOIT etre supprimee des chemins runtime normaux lorsque Nest peut injecter la dependance; elle PEUT rester dans tests ou fixtures explicitement nommes.
- **FR-005**: Les controllers HTTP de domaine DOIVENT utiliser des decorateurs NestJS explicites: `@Controller`, `@Get`, `@Post`, `@Patch`, `@Param`, `@Query`, `@Body`, `@UseGuards` et `@Headers` uniquement lorsque necessaire.
- **FR-006**: Les controllers suivants DOIVENT etre crees ou corriges comme controllers NestJS decores: `AuthController`, `PublicCountriesController`, `PublicProductsController`, `PublicOffersController`, `PublicQuoteRequestsController`, `BrokerStarterController`, `BrokerCrmController`, `AdminFeatureFlagsController`, `AdminAuditLogsController`, `AdminHealthController`.
- **FR-007**: Les controllers admin minimaux deja exposes DOIVENT etre conserves ou corriges lorsque necessaires aux endpoints existants: quote requests, lead assignments, users/roles, countries, products, offers, partners, partner licenses, quote forms, consent, notifications, routing precheck, AI modules et system health.
- **FR-008**: Les controllers DOIVENT rester fins: validation, mapping HTTP, appel application/service et construction de reponse; la logique metier ne doit pas vivre dans le controller.
- **FR-009**: Tous les inputs HTTP DOIVENT etre valides par DTOs ou schemas partages avant execution applicative.
- **FR-010**: Le mapping d'erreurs HTTP DOIT etre coherent: validation entree 400, authentification absente/invalide 401, RBAC/MFA/tenant/flag/plan refuse 403, ressource non disponible ou non exposee 404 lorsque cela evite la fuite, conflit/doublon/concurrence 409, payload semantiquement non traitable 422 lorsque retenu par les conventions locales, rate limit 429, erreur serveur 500 sans PII.
- **FR-011**: Les endpoints publics DOIVENT eviter d'exposer des raisons internes sensibles, noms de courtiers non transmis, tenants, roles, permissions, statut licence detaille ou existence de ressource back-office.
- **FR-012**: ActorContext DOIT etre construit par guard, middleware ou request context fiable et rendu disponible aux controllers via une boundary commune.
- **FR-013**: Les controllers broker/admin NE DOIVENT PAS re-parser eux-memes les headers de simulation pour construire l'acteur.
- **FR-014**: Les headers de simulation d'acteur DOIVENT etre acceptes uniquement dans les tests ou dans un mode developpement explicitement autorise, documente et refuse en production.
- **FR-015**: Toutes les routes broker/admin DOIVENT appliquer les guards NestJS appropries directement sur le controller ou la route.
- **FR-016**: Les routes broker/admin DOIVENT refuser les acces sans acteur valide, sans roles, sans tenant lorsque requis, sans MFA lorsque requis ou avec token invalide.
- **FR-017**: Les routes broker DOIVENT verifier le tenant partenaire sur chaque ressource lead, action Starter, action CRM, notification, export et dashboard.
- **FR-018**: Les routes CRM DOIVENT refuser les courtiers Starter et tout courtier dont `broker_crm_enabled` est false, absent ou illisible.
- **FR-019**: Les routes broker/admin DOIVENT respecter les roles read-only: les lectures autorisees restent possibles, les mutations/export non autorises sont refusees.
- **FR-020**: Les routes broker/admin DOIVENT interdire tout acces inter-courtier et auditer les refus importants sans confirmer l'existence de la ressource cible.
- **FR-021**: Les actions sensibles reservees aux roles sensibles DOIVENT exiger MFA selon la politique existante issue de l'auth/session.
- **FR-022**: Les repositories Prisma DOIVENT remplacer l'etat memoire pour les domaines critiques en runtime normal: countries, products, offers, quote requests, prospects, lead assignments, feature flags, audit logs et CRM activities principales deja modelisees.
- **FR-023**: Les repositories Prisma DOIVENT aussi couvrir les domaines requis par les controles de securite et routage: consent records, partners, partner licenses, partner users/users/roles, routing decisions, notifications et queue/job metadata lorsque deja modelises.
- **FR-024**: Les adaptateurs memoire DOIVENT rester uniquement dans tests unitaires, fixtures ou environnement explicitement test; ils ne doivent pas etre selectionnes par absence silencieuse de configuration.
- **FR-025**: Les endpoints runtime DOIVENT lire les feature flags depuis un repository persistant ou un cache Redis alimente depuis la persistance; ils ne doivent pas lire uniquement un tableau memoire.
- **FR-026**: Les flags sensibles DOIVENT etre fermes par defaut: `broker_crm_enabled`, `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled` et flags IA sensibles.
- **FR-027**: Toute mutation admin de feature flag DOIT verifier RBAC/MFA applicable, persister l'historique, auditer l'action et invalider/rafraichir le cache.
- **FR-028**: Les actions sensibles DOIVENT persister un AuditLog durable en runtime normal.
- **FR-029**: Les erreurs d'audit sur actions critiques DOIVENT etre remontees, refuser l'action ou produire un etat operationnel explicite selon criticite; elles ne doivent pas etre silencieusement ignorees.
- **FR-030**: `GET /admin/audit-logs` DOIT lire depuis la persistance durable et appliquer RBAC, MFA si applicable, pagination ou limites et masquage PII.
- **FR-031**: Les AuditLogs DOIVENT conserver `correlationId` lorsque disponible.
- **FR-032**: `POST /quote-requests` DOIT creer une demande persistante lorsque pays, produit, consentement, activation, offre/courtier eligible et controles anti-abus sont satisfaits.
- **FR-033**: `POST /quote-requests` DOIT refuser une demande sans consentement, sans transmission et avec AuditLog durable.
- **FR-034**: `POST /quote-requests` DOIT refuser les pays desactives, produits desactives, absence d'offre/courtier eligible, rate limit, spam, doublon bloquant et entree invalide avec reponses non sensibles.
- **FR-035**: La reponse publique de creation de demande DOIT inclure une reference publique stable (`publicReference`) et aucune donnee broker/admin sensible.
- **FR-036**: Le formulaire Web Publique Client DOIT soumettre reellement vers `POST /quote-requests`.
- **FR-037**: Le formulaire Web Publique Client DOIT valider cote client les champs obligatoires et le consentement, tout en laissant le serveur comme autorite finale.
- **FR-038**: Le formulaire Web Publique Client DOIT afficher une confirmation reelle avec `publicReference` apres succes.
- **FR-039**: Le formulaire Web Publique Client DOIT afficher des erreurs visibles pour pays desactive, produit desactive, absence consentement, aucune offre/courtier disponible, rate limit, validation et API indisponible.
- **FR-040**: Les clients frontend NE DOIVENT PAS remplacer silencieusement une erreur API par `[]`, `{}` ou un etat qui laisse croire que le chargement a reussi.
- **FR-041**: Web Publique Client DOIT appeler uniquement les API publiques: pays, produits, offres, quote forms/status publics et quote requests publiques.
- **FR-042**: Back-office Partenaires/Plateforme DOIT appeler uniquement les API broker/admin avec session/token back-office et ne doit pas consommer d'API publique pour contourner l'authentification.
- **FR-043**: Les tests HTTP e2e DOIVENT tester les controllers reels importes dans AppModule et ne doivent pas se limiter a RuntimeHttpController.
- **FR-044**: Les tests HTTP e2e DOIVENT couvrir public countries/products/offers, `POST /quote-requests`, refus sans consentement, refus pays/produit desactive, Starter sans CRM, CRM flag false/absent, cross-broker denied, audit durable et admin audit logs durable.
- **FR-045**: Les tests HTTP e2e DOIVENT executer une configuration runtime proche du reel avec Prisma/persistance, feature flags persistants, guards et ActorContext fiables.
- **FR-046**: Les tests structurels qui lisent seulement les fichiers source PEUVENT rester comme guardrails, mais ils NE DOIVENT PAS etre l'acceptance principale des objectifs e2e.
- **FR-047**: Les tests Playwright DOIVENT naviguer reellement dans les applications lorsque les variables d'environnement e2e sont presentes.
- **FR-048**: Le projet DOIT documenter le mode de lancement des tests e2e reels: dependances, variables d'environnement, serveurs API/frontend, donnees de seed et commandes.
- **FR-049**: La separation public/back-office DOIT etre testee: aucune route publique ne charge privileges/session back-office, aucune route back-office n'est accessible a un visiteur non authentifie.
- **FR-050**: Cette feature NE DOIT PAS ajouter de nouvelles fonctionnalites metier, nouveaux modules reglementes ou changement de stack.

### Non-Functional Requirements

- **NFR-001**: L'API doit etre maintenable: modules, controllers, services et repositories sont organises par domaine et nommes de facon stable.
- **NFR-002**: L'initialisation backend doit etre deterministe; les dependances runtime obligatoires manquantes produisent une erreur claire ou un mode degrade explicitement documente et teste.
- **NFR-003**: Les reponses publiques doivent rester non sensibles et coherentes meme en cas d'erreur interne.
- **NFR-004**: Les controles RBAC, MFA, tenant, flags, consentement et licence doivent echouer ferme lorsque le contexte est absent, incertain ou illisible.
- **NFR-005**: Les logs, audits, erreurs frontend et payloads de test ne doivent pas exposer PII brute, secrets, tokens ou details de tenant hors scope.
- **NFR-006**: Les tests e2e doivent etre reproductibles localement et en CI avec donnees de test isolees.
- **NFR-007**: Les modifications frontend doivent rester ciblees sur branchement API, gestion d'etats et separation; aucune refonte UI complete n'est incluse.
- **NFR-008**: Les endpoints publics ne doivent pas executer de traitement lourd synchronement; la creation de demande retourne apres etat durable et orchestration prevue par les specs precedentes.
- **NFR-009**: Les listes admin/broker exposees par HTTP doivent etre limitees ou paginees pour eviter fuite et surcharge.
- **NFR-010**: Les contrats partages doivent rester compatibles avec les frontends separes et les tests runtime.

### Progressive Migration Rules From RuntimeHttpController

- La migration DOIT etre progressive par domaine: public catalog, quote requests, auth, broker Starter, broker CRM, admin flags/audit/health, puis autres admin minimaux.
- Chaque route migree DOIT avoir un controller NestJS decore, un module importable dans AppModule, des providers injectes et un test HTTP qui prouve le chemin cible.
- RuntimeHttpController PEUT deleguer temporairement ou rester pour routes non encore migrees, mais il ne doit pas porter la logique durable finale des domaines acceptes.
- Aucune suppression de facade temporaire ne doit casser la compatibilite des chemins HTTP existants sans justification et tests de non-regression.
- Les routes publiques migrees DOIVENT etre testees sans ActorContext authentifie et sans dependency back-office.
- Les routes broker/admin migrees DOIVENT etre testees avec guards reels, ActorContext request-scoped et refus sans acteur valide.
- La fin de transition DOIT etre mesurable: liste des endpoints encore servis par RuntimeHttpController, raison temporaire et test cible de remplacement.

### Endpoints Concerned

- **Auth**: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/mfa/enroll`, `POST /auth/mfa/verify`.
- **Public countries/products/offers**: `GET /countries`, `GET /countries/:countryCode`, `GET /countries/:countryCode/products`, `GET /countries/:countryCode/products/:productKey`, `GET /countries/:countryCode/products/:productKey/offers`, `GET /offers/:offerId`.
- **Public quote**: `GET /countries/:countryCode/products/:productKey/quote-form`, `POST /quote-requests`, `GET /quote-requests/:publicReference`.
- **Broker Starter**: `GET /broker/starter/dashboard`, `GET /broker/starter/leads`, `GET /broker/starter/leads/export.csv`, `GET /broker/starter/leads/:leadId`, `GET /broker/starter/leads/:leadId/history`, `POST /broker/starter/leads/:leadId/accept`, `POST /broker/starter/leads/:leadId/reject`, `POST /broker/starter/leads/:leadId/dispute`, `GET /broker/starter/notifications`, `POST /broker/starter/notifications/:notificationId/read`, `GET /broker/starter/plan-capabilities`.
- **Broker CRM**: `GET /broker/crm/dashboard`, `GET /broker/crm/leads`, `GET /broker/crm/leads/kanban`, `GET /broker/crm/leads/export.csv`, `GET /broker/crm/leads/:leadId`, `POST /broker/crm/leads/:leadId/status`, `POST /broker/crm/leads/:leadId/notes`, `POST /broker/crm/leads/:leadId/tasks`, `POST /broker/crm/leads/:leadId/reminders`, `POST /broker/crm/leads/:leadId/assign`, `POST /broker/crm/leads/:leadId/documents`, `POST /broker/crm/leads/:leadId/proposals`, `POST /broker/crm/leads/:leadId/disputes`, `GET /broker/crm/notifications`, `GET /broker/crm/ai-foundations`.
- **Admin core**: `GET /admin/feature-flags`, `PATCH /admin/feature-flags/:id`, `GET /admin/audit-logs`, `GET /admin/system/health`.
- **Admin support/minimal**: admin quote requests, lead assignments, countries, products, offers, partners, partner licenses, users/roles, consent, quote forms, notifications and routing precheck endpoints already exposed by previous specs.

### Impacted NestJS Modules

- **AppModule**: imports domain modules and stops depending only on RuntimeHttpController.
- **AuthModule**: owns AuthController, auth token/session services, guards and MFA policy.
- **CountriesModule, ProductsModule, OffersModule**: own public catalog controllers, admin controllers where existing, services, repositories and cache dependencies.
- **QuoteRequestsModule, QuoteFormsModule, ProspectsModule, ConsentModule**: own public quote form/submission/status, validation, consent, prospect and quote persistence.
- **LeadsModule, RoutingModule, PartnersModule, PartnerLicensesModule**: own broker Starter/CRM controllers, tenant isolation, eligibility, routing, assignments and license checks.
- **FeatureFlagsModule**: owns persistent flag repository, resolver/cache, admin controller and history/audit.
- **AuditLogsModule**: owns durable audit writer/repository and admin audit controller.
- **UsersModule**: owns roles, permissions, read-only policy, admin users/roles and export policy support.
- **Admin/SystemHealthModule**: owns health controller that reflects database, Redis/cache, queues where applicable, flags and audit durability.
- **CommonModule or shared backend common areas**: own request context, validation pipes, exception filters, pagination, rate limit guard, Prisma, Redis and queue providers.

### Controllers To Create Or Correct

- `AuthController`: decorated auth endpoints, DTO validation, auth errors, MFA endpoints and no manual header parsing outside guard-provided context.
- `PublicCountriesController`: decorated `GET /countries` and `GET /countries/:countryCode`, public-only dependencies, flag-aware output.
- `PublicProductsController`: decorated country-scoped product endpoints, public flags and disabled product refusal.
- `PublicOffersController`: decorated public offer list/detail, indicative offer constraints, expired/non-validated offer blocking.
- `PublicQuoteRequestsController`: decorated `POST /quote-requests` and public status as applicable, consent validation, anti-abuse and public response.
- `BrokerStarterController`: decorated Starter dashboard/leads/actions/notifications/capabilities, guards, tenant isolation and read-only policy.
- `BrokerCrmController`: decorated CRM dashboard/list/kanban/actions/notifications/AI foundations, Pro/Enterprise plan, `broker_crm_enabled`, tenant isolation and read-only policy.
- `AdminFeatureFlagsController`: decorated list/update, RBAC/MFA, durable repository, history, audit and cache invalidation.
- `AdminAuditLogsController`: decorated search/list, RBAC/MFA, durable repository, pagination and PII minimization.
- `AdminHealthController`: decorated health endpoint, protected for platform admin, durable dependencies visible without leaking secrets.
- Other admin controllers remain in scope only to the extent needed to preserve existing endpoints and remove RuntimeHttpController-only wiring.

### Prisma Repositories To Create Or Correct

- `CountriesRepository`: country activation, public list/detail inputs and history fields where applicable.
- `ProductsRepository`: products, country/product activation, public quote/comparison flags.
- `OffersRepository`: offers, validity period, public validation, sponsorship metadata and offer history.
- `QuoteRequestsRepository`: quote request creation, status, public reference, duplicate/non-routable state and list for admin.
- `ProspectsRepository`: prospect identity, contact fingerprints and PII-safe lookups.
- `ConsentRecordsRepository`: durable consent evidence, purpose, text version, recipient/scope and timestamp.
- `LeadAssignmentsRepository`: lead assignment, tenant ownership, statuses, routing outcome and broker-visible reads.
- `RoutingRepository`: prechecks, decisions, refusal reasons and deterministic eligibility traces when already modeled.
- `PartnersRepository` and `PartnerLicensesRepository`: partner status, authorizations, plan, license status and expiration checks.
- `Users/RolesRepository`: actor lookup support, roles, permissions, read-only policy and MFA flags when persisted.
- `FeatureFlagsRepository`: source of truth for flags, history, mutation metadata and cache version.
- `AuditLogsRepository`: durable writes and admin reads/search.
- `BrokerCrmActivitiesRepository`: CRM status, notes, tasks, reminders, assignment, documents/proposals/disputes where already modeled.
- `Notifications/QueueJobRepository`: notification and job metadata where already modeled by 007.
- Memory repositories are accepted only as explicit unit-test adapters.

### ActorContext, Auth, RBAC, MFA And Tenant Isolation

- ActorContext must be request-scoped or otherwise tied to the current HTTP request.
- Bearer token or session-derived actor is the trusted source for broker/admin routes.
- Simulation headers are test/development aids only and must be gated by explicit environment controls.
- Guards must attach the ActorContext once; controllers consume it through a common decorator/provider/request context.
- Broker routes require actorId, role, partnerTenantId and MFA where applicable.
- Admin routes require actorId, admin role, permission and MFA where applicable.
- Tenant checks are enforced at repository/service boundary and tested at HTTP boundary.
- Denied access must not leak whether a cross-tenant resource exists.
- Refusals for sensitive access, CRM blocked by plan/flag, read-only mutation attempts and admin denials must be auditable.

### Durable Audit Impact

- Sensitive success events include auth/session events when applicable, quote request creation, consent capture, routing/assignment, lead detail reads, Starter accept/reject/dispute, CRM status/note/task/reminder/assignment/document/proposal/dispute, feature flag mutation, admin sensitive reads/mutations and exports.
- Sensitive refusal events include missing consent, disabled country/product, no eligible broker/offer, expired/invalid license, RBAC denied, MFA missing, tenant mismatch, Starter CRM attempt, CRM flag absent/false, read-only mutation attempt and rate limit/refusal when linked to quote submission.
- Audit writes must be awaited or otherwise confirmed for critical actions.
- Audit context must be PII-minimized and include correlationId when present.
- Admin audit reads must be paginated/limited and permission-gated.

### Feature Flags Impact

- Persistent flags are source of truth; Redis/cache may accelerate decisions but cannot be the only source.
- Sensitive flags fail closed on absent, invalid, stale, cache miss or source failure.
- `broker_crm_enabled` is required true for CRM access in addition to plan/role/tenant checks.
- Public quote and comparator routes must respect global, country and product flags.
- Flag mutations require reason, actor, history, audit and cache invalidation/expiry.
- Regulated module flags remain false by default and are not activated by this feature.

### Frontend Web Publique Client Impact

- The public quote form must submit a real HTTP request to `POST /quote-requests`.
- The form must block obvious client-side missing fields and missing consent, while relying on server validation as authority.
- Success must show `publicReference` from the API response.
- Errors must be explicit for disabled country, disabled product, no consent, no eligible offer/broker, validation, rate limit and API unavailable.
- Public data loaders must represent API errors visibly; empty states must only mean true empty data, not hidden transport failure.
- The public app must not import back-office auth/session utilities or call broker/admin endpoints.

### Frontend Back-office Partenaires/Plateforme Impact

- Broker UI calls only `/broker/...` endpoints with authenticated back-office session/token.
- Admin UI calls only `/admin/...` endpoints with authenticated back-office session/token.
- Broker/admin screens must show unauthenticated, forbidden, MFA required, read-only and API unavailable states visibly.
- Fallback data for protected leads/CRM/admin health must not make an API failure appear as a successful empty result.
- Public app and back-office apps may share safe contracts/components, but not routes, layouts, privileges or auth state.

### HTTP And Playwright Test Impact

- HTTP e2e tests must bootstrap AppModule and exercise real decorated controllers.
- HTTP e2e tests must use supertest, fetch or equivalent real HTTP request path against Nest.
- Tests must cover successful public quote submission and persistence.
- Tests must cover no-consent refusal and durable audit.
- Tests must cover broker Starter CRM denial, CRM flag false/absent denial and cross-broker denial.
- Tests must cover admin audit read from durable persistence.
- Tests must assert that AppModule imports real domain modules.
- Tests may inspect metadata as secondary guardrails, but runtime behavior is the acceptance proof.
- Playwright tests must navigate real pages when `ASSURMATCH_E2E_PUBLIC_URL`, `ASSURMATCH_E2E_BROKER_URL`, `ASSURMATCH_E2E_ADMIN_URL` or equivalent configured variables are present.
- Playwright tests must submit the public quote form when API and seed data are configured.
- Test documentation must state how to run API, public app, broker/admin app and seed fixtures for e2e.

### Key Entities *(include if feature involves data)*

- **ActorContext**: Request-bound identity, roles, tenant, plan, scopes, MFA state and correlationId used by guards and services.
- **DomainModule**: NestJS module owning controllers, providers, repositories and exports for a bounded API surface.
- **DecoratedController**: HTTP controller with explicit NestJS decorators and thin mapping responsibilities.
- **PrismaRepository**: Durable repository for runtime-normal domain state.
- **TestMemoryRepository**: Explicit test-only repository forbidden in production/runtime-normal binding.
- **FeatureFlag**: Persistent activation decision with scope, default-false sensitive behavior, history and cache version.
- **AuditLog**: Durable compliance record for sensitive success/refusal.
- **ConsentRecord**: Durable proof required before lead transmission.
- **QuoteRequest**: Public request with validation, consent link, publicReference, routing state and persistence.
- **Prospect**: Visitor/prospect identity and contact data handled with PII minimization.
- **Offer**: Indicative public offer with validity and public eligibility.
- **LeadAssignment**: Durable broker assignment tied to tenant isolation and action history.
- **Partner/Broker**: Partner tenant, plan, status, authorizations and quotas.
- **PartnerLicense**: License status, scope and expiration data required for eligibility.
- **BrokerCrmActivity**: CRM status, notes, tasks, reminders, assignments and related activity records already modeled.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of endpoints listed as P1 acceptance paths are served by decorated domain controllers imported through real NestJS modules, with RuntimeHttpController not required as their only route source.
- **SC-002**: `GET /countries` succeeds through a real public countries controller in HTTP e2e tests.
- **SC-003**: `POST /quote-requests` persists a valid consented request and returns a `publicReference` in HTTP e2e tests.
- **SC-004**: 100% of no-consent quote submissions tested are refused, produce no lead transmission and create durable audit evidence.
- **SC-005**: 100% of tested broker/admin routes reject missing actor, invalid actor, missing MFA where required, missing permission and cross-tenant access.
- **SC-006**: 100% of tested Starter CRM attempts and `broker_crm_enabled` absent/false CRM attempts are refused.
- **SC-007**: 100% of tested sensitive actions listed for acceptance produce durable AuditLogs visible through authorized admin audit endpoints.
- **SC-008**: 100% of tested sensitive flags fail closed when absent or false, including CRM and regulated module flags.
- **SC-009**: The public quote form e2e path performs a real API call and displays the returned `publicReference`.
- **SC-010**: Frontend API-unavailable tests show visible error states rather than silent `[]` or `{}` success-like fallbacks.
- **SC-011**: Playwright e2e tests navigate real pages when e2e URLs are configured and skip with explicit documentation when they are not.
- **SC-012**: Structural source-reading tests are not the sole proof for any P1 runtime acceptance scenario.

## Assumptions

- Specs 001 a 004 delivered the core business flows; specs 005 et 006 delivered API/runtime auth/session foundations; spec 007 hardened Prisma, Redis, BullMQ, audit, feature flags and migrations.
- The current backend already contains domain files for many controllers/modules, but several are not yet idiomatic NestJS modules imported through AppModule or still depend on manual instantiation/memory state.
- Existing HTTP paths should remain stable unless a path is proven unsafe or inconsistent; compatibility is preferred because both frontends already know these paths.
- The request is technical and transversal; it is acceptable for this specification to name NestJS, controllers, Prisma repositories, guards and Playwright as explicit requirements because the user asked for this technical scope.
- The feature does not decide new product behavior, pricing, routing policy, plan packaging, notification channels or regulated activation.
- Existing shared contracts and schemas can be reused or extended only to support already exposed HTTP behavior and validation.
- E2E runtime tests may require documented environment variables and seed data; absence of e2e environment may skip Playwright navigation but must not be reported as runtime success.

## Risks

- Some source files may already contain classes named as controllers/modules without NestJS decorators; migrating them requires care so acceptance tests prove runtime behavior, not names only.
- Replacing RuntimeHttpController route by route can temporarily duplicate paths if module imports are not controlled.
- Moving ActorContext construction out of controllers can break tests that rely on simulation headers unless test-only mode is documented and gated.
- Durable audit failure semantics can affect existing flows if fire-and-forget logging previously hid errors.
- Persistent feature flag reads can expose stale cache or missing seed issues if defaults are not explicitly false.
- Frontend removal of silent fallbacks may reveal real API availability issues that previous tests masked.
- Playwright runtime tests may require reliable seed data and port orchestration for public, broker and admin apps.
- Broad module import changes can affect dependency cycles unless module boundaries are kept domain-focused.

## Out Of Scope

- New business functionality.
- Payment, premium collection, subscription, policy issuance, attestation issuance, e-signature, claims.
- Advanced insurer API, advanced webhooks, SSO/OAuth expansion or advanced refresh token work.
- Advanced AI, AI recommendation, AI decisioning or broker assistant activation.
- UI redesign or new marketing/landing pages.
- Change of stack or total backend rewrite.
- Changes to routing business rules, pricing rules, broker eligibility rules or plan packaging beyond enforcing existing rules durably.
- Activation by default of CRM, payments, e-signature, policy issuance, claims, insurer API or AI-sensitive modules.
- Automatic commit, plan generation, tasks generation or implementation in this invocation.
