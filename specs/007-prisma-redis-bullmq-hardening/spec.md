# Feature Specification: Prisma Redis BullMQ Hardening AssurMatch

**Feature Branch**: `007-prisma-redis-bullmq-hardening`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "Creer la specification technique 007-prisma-redis-bullmq-hardening pour AssurMatch. Remplacer progressivement les derniers comportements memoire/stub par des integrations runtime reelles et testables avec PostgreSQL/Prisma, Redis et BullMQ, tout en conservant des adaptateurs memoire uniquement pour les tests. Ne genere pas encore le plan. Ne genere pas tasks.md. N'implemente pas."
**Validation State**: Draft
**Continuous Workflow Eligible**: No - the user requested specification only and explicitly asked not to generate plan, tasks or implementation yet.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette specification durcit l'infrastructure runtime des capacites deja prevues et implementees dans 001 a 006. Elle n'ajoute aucune vente directe, souscription, encaissement de prime, emission de police, attestation, sinistre, paiement, signature electronique, API assureur avancee, SSO externe, webhook avance ou conseil personnalise engageant par AssurMatch.
- **Impacted application(s)**: Backend API: oui. Packages partages: oui si des contrats, types d'adaptateurs, DTOs ou fixtures de test doivent etre alignes. Web Publique Client: non, sauf ajustement mineur strictement necessaire pour continuer a consommer les API existantes. Back-office Partenaires/Plateforme: non, sauf ajustement mineur strictement necessaire pour compatibilite avec les API existantes.
- **Affected scopes**: Prisma/PostgreSQL, migrations, seed minimal de developpement, repositories runtime, audit logs, feature flags, Redis, BullMQ, rate limiting, anti-spam, detection doublon, verrous de routage, notifications, health/configuration runtime, tests de base fraiche, tests HTTP et tests constitutionnels.
- **Frontend separation**: Aucun nouveau parcours frontend n'est cree. Les eventuels ajustements frontend doivent rester separes entre Web Publique Client et Back-office Partenaires/Plateforme, sans import de session, route, layout, privilege ou client back-office dans l'application publique.
- **Required feature flags**: Les flags existants restent les controles applicables: flags globaux, pays, produit, partenaire, plan et IA definis par la constitution. `broker_crm_enabled` reste false par defaut en absence de valeur persistante explicite. Les modules reglementes (`payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled` et equivalents) restent false par defaut.
- **Consent and transmission**: Aucun lead ne peut etre transmis sans ConsentRecord durable, valide et scope. Les refus de consentement, consentements absents ou consentements hors scope doivent etre bloques, persistes/audites selon le cas et ne doivent jamais enqueuer de notification courtier.
- **Partner license controls**: Les controles runtime doivent refuser tout routage ou action sensible vers un courtier inactif, non autorise pour le pays/produit, hors quota ou dont la licence est expiree, suspendue, invalide ou absente pour le scope requis.
- **Audit and data history**: Les actions sensibles doivent creer des AuditLogs durables en PostgreSQL via le repository runtime. Les donnees critiques doivent conserver timestamps, auteur lorsque applicable, raison de refus, correlationId lorsque disponible et historique de changement pour flags, licences, offres, routage, Starter et CRM.
- **Security and RBAC**: Les adaptateurs memoire sont interdits en runtime normal et production. Le backend doit echouer ferme ou declarer explicitement un mode degrade documente lorsque PostgreSQL, Redis ou BullMQ requis est absent. Les donnees personnelles ne doivent pas apparaitre en clair dans logs, cles Redis, payloads de jobs inutiles, erreurs ou snapshots. RBAC, MFA et isolation tenant restent obligatoires.
- **Routing impact**: Les regles de routage existantes ne changent pas fonctionnellement, mais leurs dependances runtime doivent etre durables: consentements, prospects, quote requests, partenaires, licences, autorisations, quotas, lead assignments, decisions, audits et verrous temporaires Redis.
- **AI impact**: Aucun module IA avance n'est active. Les flags IA restent false par defaut lorsqu'absents. Les jobs IA deja prevus restent controles par flags et ne peuvent pas executer d'appel modele lorsque l'IA est desactivee par scope.
- **UX/content restrictions**: Aucun nouveau contenu marketing ou parcours public n'est cree. Les ajustements eventuels ne doivent pas introduire les formulations interdites ni presenter une offre comme contrat, garantie acceptee ou recommandation officielle.
- **Workflow continuity**: Non eligible a l'enchainement automatique dans cet etat Draft. Apres validation explicite et absence de marqueur de clarification, cette feature de durcissement runtime pourra passer a `/speckit.plan`, puis `/speckit.tasks`, puis implementation, sauf conflit constitutionnel, risque securite/conformite/donnees, activation interdite ou validation bloquante. Aucun commit automatique n'est autorise.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Utiliser la persistance durable hors tests (Priority: P1)

Une equipe technique demarre le backend AssurMatch en environnement hors test et constate que les domaines critiques utilisent PostgreSQL/Prisma comme source de verite au lieu de tableaux memoire ou de stubs.

**Why this priority**: La conformite, l'audit, le routage, les consentements et l'exploitation ne sont fiables que si les donnees critiques survivent au redemarrage et peuvent etre reconstruites depuis une base fraiche.

**Independent Test**: Demarrer le backend en mode runtime normal avec une base fraiche migree et verifier, par tests HTTP et repository, que les creations/lectures critiques persistent apres redemarrage sans adaptateur memoire.

**Acceptance Scenarios**:

1. **Given** un environnement hors test avec `DATABASE_URL` valide, **When** le backend demarre, **Then** les repositories runtime critiques utilisent Prisma/PostgreSQL et aucun repository memoire n'est enregistre pour countries, products, offers, prospects, quote requests, lead assignments, consent records, partners, partner users, partner licenses, feature flags, audit logs, notifications, actions Starter/CRM ou documents metadata deja prevus.
2. **Given** une base vide, **When** les migrations sont appliquees dans l'ordre et le seed minimal de developpement est execute, **Then** les tables, enums, contraintes, index, flags par defaut fermes et donnees minimales permettent de lancer les tests HTTP critiques sans SQL manuel.
3. **Given** une donnee critique creee par un endpoint runtime, **When** le backend redemarre, **Then** cette donnee reste retrouvable via le repository ou endpoint autorise.
4. **Given** un environnement de test unitaire explicitement isole, **When** un service est teste sans base reelle, **Then** un adaptateur memoire peut etre utilise uniquement sous boundary de test nommee et impossible a activer silencieusement en production.

---

### User Story 2 - Auditer durablement les actions sensibles (Priority: P1)

Un compliance admin ou operateur autorise doit pouvoir prouver qu'une action sensible reussie ou refusee a produit un AuditLog durable et exploitable.

**Why this priority**: La constitution impose une preuve d'acces, de consentement, de routage, de refus et d'administration pour les donnees critiques et les actions reglementees.

**Independent Test**: Executer les actions sensibles couvertes par la spec, puis interroger la source durable d'audit avec un role autorise et verifier actor, action, cible, scope, resultat, raison et correlationId lorsque disponible.

**Acceptance Scenarios**:

1. **Given** une demande de devis valide avec consentement, **When** elle est creee et evaluee pour routage, **Then** les evenements quote request, consentement, routage et notification enqueued sont audites durablement.
2. **Given** une demande sans consentement, un refus de consentement ou un consentement hors scope, **When** une transmission est tentee, **Then** aucune transmission ni notification courtier n'est faite et un AuditLog durable de refus est cree.
3. **Given** un utilisateur broker/admin authentifie, **When** il consulte un detail lead, accepte/rejette/conteste Starter, change un statut CRM, cree note/tache/rappel CRM, assigne en interne ou exporte, **Then** l'action sensible est auditee durablement avec tenant et resultat.
4. **Given** un acces RBAC refuse ou une lecture/modification admin sensible refusee, **When** l'action est bloquee, **Then** le refus est audite sans exposer PII ni existence de ressource hors tenant.

---

### User Story 3 - Controler les flags persistants avec cache Redis ferme (Priority: P1)

Un operateur plateforme gere les feature flags persistants tandis que le runtime lit ces flags efficacement avec cache Redis et refuse par defaut les modules sensibles absents.

**Why this priority**: Les flags controlent l'activation progressive, la separation des modules reglementes et l'acces CRM; un fallback ouvert creerait un risque de conformite.

**Independent Test**: Creer, modifier et supprimer des flags persistants dans des scopes globaux, pays, produit, partenaire et plan, puis verifier cache hit, cache miss, invalidation/TTL et fallback ferme.

**Acceptance Scenarios**:

1. **Given** un flag sensible absent, **When** le runtime evalue `broker_crm_enabled` ou un module reglemente, **Then** la decision est false par defaut.
2. **Given** un flag persistant false, **When** le cache Redis est vide, **Then** le runtime lit PostgreSQL, met en cache la valeur false et refuse l'action concernee.
3. **Given** un flag persistant true explicitement autorise, **When** le cache Redis contient la valeur valide, **Then** le runtime peut servir la decision depuis cache dans le scope exact.
4. **Given** un flag est modifie par un admin autorise, **When** la modification est persistee, **Then** l'historique et l'audit sont crees et le cache est invalide ou expire selon une TTL documentee.

---

### User Story 4 - Utiliser Redis runtime pour cache, abus, doublons et verrous (Priority: P1)

Le runtime utilise Redis hors tests pour les caches publics, limitations, anti-spam, detection de doublons, verrous temporaires de routage et OTP/MFA si deja prevu.

**Why this priority**: Les endpoints publics et le routage doivent resister aux abus, aux repetitions et aux courses concurrentes sans dependance a une memoire locale volatile.

**Independent Test**: Executer des tests controles avec client Redis runtime ou adapter de test Redis compatible, puis verifier que le mode normal n'utilise pas `InMemoryRedisClient`.

**Acceptance Scenarios**:

1. **Given** des pays, produits et offres publics actifs, **When** ils sont lus plusieurs fois, **Then** les caches pays actifs, produits actifs et offres publiques utilisent Redis avec invalidation ou TTL explicite.
2. **Given** un visiteur depasse le seuil d'un endpoint public, **When** il soumet des requetes supplementaires, **Then** le rate limiting Redis refuse ou ralentit l'abus et produit un audit lorsque l'action est sensible.
3. **Given** des soumissions spammy ou doublons selon les regles existantes, **When** elles arrivent dans la fenetre definie, **Then** Redis participe a l'anti-spam et a la detection doublon sans stocker de PII brute dans les cles.
4. **Given** deux routages concurrents pour la meme quote request, **When** ils tentent d'assigner un lead, **Then** un verrou temporaire Redis empeche la double assignation et le refus/conflit est trace.

---

### User Story 5 - Enqueuer les notifications et jobs avec BullMQ runtime (Priority: P1)

Les traitements asynchrones deja prevus sont enqueues dans BullMQ hors tests et les queues memoire restent limitees aux tests explicites.

**Why this priority**: Les endpoints publics ne doivent pas executer de traitement lourd synchronement et les notifications doivent etre observables, retryables et decouplees.

**Independent Test**: Soumettre les parcours qui declenchent notifications/jobs et verifier que les jobs attendus sont ajoutes dans l'adaptateur runtime BullMQ avec payload minimal, idempotence et references durables.

**Acceptance Scenarios**:

1. **Given** une demande de devis visiteur valide, **When** la confirmation est creee, **Then** un job de notification confirmation visiteur est enqueued dans BullMQ.
2. **Given** un lead route vers un courtier eligible, **When** le LeadAssignment est persiste, **Then** un job de notification nouveau lead courtier est enqueued dans BullMQ.
3. **Given** une action Starter/CRM qui prevoit une notification, **When** l'action reussit, **Then** la notification correspondante est enqueued sans bloquer la reponse HTTP.
4. **Given** l'environnement hors test ne dispose pas de configuration BullMQ/Redis requise, **When** le backend demarre, **Then** il echoue ferme ou expose un mode degrade explicitement documente qui ne pretend pas livrer les jobs.

---

### User Story 6 - Valider configuration, migrations et protections constitutionnelles (Priority: P2)

Une equipe plateforme doit savoir quelles variables configurer, comment reconstruire localement le runtime, et disposer de validations qui prouvent que les invariants constitutionnels restent vrais.

**Why this priority**: Le durcissement runtime augmente les dependances operationnelles; elles doivent etre explicites, testees et reproductibles.

**Independent Test**: Executer le quickstart local documente, les tests de migration/base fraiche, les tests integration adapters et les tests constitutionnels existants, puis verifier que les adaptateurs memoire sont rejetes en runtime normal.

**Acceptance Scenarios**:

1. **Given** `.env.example` et la documentation runtime, **When** un developpeur configure PostgreSQL, Redis et BullMQ, **Then** les variables obligatoires, modes de test, modes degrades et interdictions production sont clairs.
2. **Given** `NODE_ENV=production` ou un mode runtime normal equivalent, **When** `DATABASE_URL` ou `REDIS_URL` requis est absent, **Then** le backend ne bascule pas silencieusement en memoire.
3. **Given** les tests de regression constitutionnels, **When** ils sont executes apres le durcissement, **Then** aucun module reglemente n'est active par defaut, aucun CRM n'est accessible sans flag true, aucun lead n'est transmis sans consentement, aucun routage vers courtier ineligible ne reussit et aucun tenant ne fuit.

### Edge Cases

- Base fraiche reconstruite depuis migrations: `0001_foundation` et les migrations suivantes doivent creer toutes les tables, enums et contraintes attendues sans intervention manuelle.
- Base de developpement existante: les corrections de migrations doivent etre compatibles ou documenter une strategie de reset uniquement locale, sans perte silencieuse de donnees.
- `DATABASE_URL` absent hors tests: demarrage refuse ou mode degrade explicite sans endpoints dependants de persistance.
- Redis absent hors tests: caches non sensibles peuvent retomber vers source persistante si documente; decisions sensibles, rate limit, anti-spam, doublons, locks, OTP/MFA et queues doivent echouer ferme ou signaler indisponibilite.
- BullMQ indisponible: les jobs ne doivent pas etre declares envoyes; l'echec doit etre observable et retryable selon la strategie documentee.
- Flag absent, stale ou corrompu: fallback false pour flags sensibles et modules reglementes.
- Cache Redis incoherent: invalidation, TTL ou relecture persistante doit empecher une activation non autorisee durable.
- Donnees PII dans cles Redis ou payloads jobs: interdit; utiliser references internes ou empreintes non reversibles lorsque necessaire.
- Doublon quote request concurrent: une seule demande routable/assignable selon les regles existantes; les autres sont marquees duplicate ou refusees de maniere auditee.
- Routage concurrent: un verrou temporaire empeche double assignation et conserve la raison de conflit.
- Audit durable indisponible pendant action sensible: action bloquee ou marquee pour revue operationnelle selon severite, sans perdre l'information critique.
- Adaptateur memoire importe par runtime normal: cas bloquant de validation.
- Tests unitaires sans services externes: adaptateurs memoire autorises uniquement via factories de test nommees.
- Web Publique Client ou Back-office touche par compatibilite: aucun changement ne doit brouiller la separation applicative.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le runtime hors tests DOIT utiliser un PrismaClient reel pour les repositories critiques et NE DOIT PAS utiliser de tableaux memoire, stubs ou repositories memoire pour les chemins applicatifs normaux.
- **FR-002**: Les repositories Prisma DOIVENT couvrir ou completer les domaines critiques: countries, products, offers, prospects, quote requests, lead assignments, consent records, partner licenses, partners, partner users, feature flags, audit logs, broker starter actions, broker CRM actions, notifications et documents metadata si deja prevu.
- **FR-003**: Les repositories memoire PEUVENT exister uniquement dans tests unitaires, fixtures ou adapters explicitement marques test, avec une boundary empechant leur enregistrement silencieux en runtime normal/production.
- **FR-004**: `schema.prisma`, migrations, services runtime, DTOs et contrats partages DOIVENT etre alignes sur les champs et contraintes effectivement utilises.
- **FR-005**: Les migrations DOIVENT permettre de reconstruire une base fraiche depuis zero, y compris les enums, tables, index, contraintes et valeurs requises par les migrations 0002 a 0004.
- **FR-006**: Le projet DOIT fournir un seed minimal de developpement pour pays, produits, offres indicatives valides, partenaires, licences, utilisateurs broker/admin, flags fermes par defaut, consent texts et donnees minimales de test HTTP.
- **FR-007**: La strategie transactionnelle DOIT etre documentee pour creation quote request + consentement + routage + lead assignment + audit + enqueue notification, ainsi que pour actions Starter/CRM sensibles.
- **FR-008**: Les AuditLogs DOIVENT etre persistes en PostgreSQL via Prisma hors tests.
- **FR-009**: Les actions sensibles suivantes DOIVENT produire un audit durable lorsque le chemin existe: login/logout si applicable, creation demande devis, consentement, refus consentement, routage, refus routage, acces detail lead, acceptation/rejet/contestation Starter, changement statut CRM, creation note/tache/rappel CRM, assignation interne, export, tentative RBAC refusee, lecture ou modification admin sensible.
- **FR-010**: Les feature flags DOIVENT etre lus depuis PostgreSQL et caches dans Redis avec invalidation ou TTL explicite.
- **FR-011**: Les flags sensibles absents, invalides ou illisibles DOIVENT echouer ferme: `broker_crm_enabled=false` par defaut et modules reglementes false par defaut.
- **FR-012**: Le runtime normal DOIT remplacer `InMemoryRedisClient` par un client Redis reel ou un adapter Redis runtime equivalent.
- **FR-013**: Redis DOIT couvrir au minimum cache pays actifs, cache produits actifs, cache offres publiques, cache feature flags, rate limiting, anti-spam, detection doublon, verrous temporaires de routage et OTP/MFA si deja prevu.
- **FR-014**: Les cles Redis et payloads caches NE DOIVENT PAS contenir de PII brute; les identifiants sensibles doivent etre references, tronques ou haches de maniere non reversible selon le besoin.
- **FR-015**: Le runtime normal DOIT brancher BullMQ reel hors tests et conserver la queue memoire uniquement dans les tests explicitement isoles.
- **FR-016**: BullMQ DOIT couvrir au minimum notification confirmation visiteur, notification courtier nouveau lead, notification action Starter/CRM si prevue, et jobs d'audit/rapport si deja prevus.
- **FR-017**: Les tests DOIVENT prouver que les jobs attendus sont enqueued dans l'adaptateur runtime et que les endpoints publics ne bloquent pas sur leur livraison.
- **FR-018**: Le rate limiting, l'anti-spam et la detection doublon DOIVENT utiliser Redis en runtime normal et rester testables sans dependance Redis reelle dans les tests unitaires.
- **FR-019**: Les endpoints publics DOIVENT refuser ou ralentir les abus selon les regles existantes, sans fuite de donnees ni contournement par redemarrage applicatif.
- **FR-020**: La detection doublon quote request DOIT appliquer les regles existantes et conserver une trace durable/auditable du resultat.
- **FR-021**: Les verrous temporaires de routage DOIVENT empecher les assignations concurrentes incompatibles et expirer selon une TTL documentee.
- **FR-022**: La configuration runtime DOIT documenter et valider les variables PostgreSQL, Redis, BullMQ, mode test, mode production, seeds, migrations et quickstart local.
- **FR-023**: Le runtime production DOIT interdire l'utilisation silencieuse d'adaptateurs memoire; en cas de dependance obligatoire manquante il DOIT fail fast ou exposer un mode degrade explicitement documente et teste.
- **FR-024**: `.env.example` DOIT etre adapte si necessaire pour refleter les variables PostgreSQL, Redis, BullMQ et interdictions memoire.
- **FR-025**: Les tests DOIVENT inclure repositories unitaires, integrations Prisma/Redis/BullMQ, HTTP persistance chemins critiques, base fraiche/migrations, feature flags persistants/cache, audit durable, rate limiting/anti-spam/doublon, tenant isolation et tests constitutionnels.
- **FR-026**: Les tests DOIVENT verifier que le runtime normal n'utilise pas l'in-memory par defaut pour Prisma, Redis, BullMQ, AuditLog, feature flags, rate limiting, anti-spam, doublons et notifications.
- **FR-027**: Les ajustements aux packages partages DOIVENT rester limites aux contrats/types necessaires au runtime et aux tests; ils ne doivent pas ajouter de nouvelle fonctionnalite metier.
- **FR-028**: Les ajustements Web Publique Client ou Back-office, s'ils sont necessaires, DOIVENT etre mineurs, compatibles avec les API existantes et preserves par tests de separation.
- **FR-029**: Le durcissement NE DOIT PAS activer de nouvelles fonctionnalites metier, paiement, souscription, police, attestation, e-signature, sinistre, IA avancee, SSO/OAuth externe, refresh token avance, webhook avance ou API assureur avancee.
- **FR-030**: Les validations finales de cette feature DOIVENT prouver les invariants constitutionnels: aucun module reglemente active par defaut, aucun CRM si flag absent/false, aucune transmission sans consentement, aucun routage vers courtier ineligible, isolation tenant, audit durable, RBAC strict, PII protegee et adaptateurs memoire interdits en runtime normal.

### Non-Functional Requirements

- **NFR-001**: Le backend doit demarrer de maniere deterministe: les dependances obligatoires manquantes produisent une erreur claire avant exposition des routes concernees.
- **NFR-002**: Les operations critiques doivent etre idempotentes ou protegees contre les repetitions lorsque des jobs, retries, doublons ou verrous sont impliques.
- **NFR-003**: Les caches doivent avoir une strategie explicite de TTL, invalidation ou relecture source pour eviter l'activation persistante d'un etat interdit.
- **NFR-004**: Les tests d'integration runtime doivent rester reproductibles localement et en CI, avec isolation des donnees et nettoyage des ressources.
- **NFR-005**: Les erreurs techniques Redis/BullMQ/PostgreSQL doivent etre journalisees de facon exploitable sans PII ni secrets.
- **NFR-006**: Les changements doivent minimiser le blast radius frontend et ne pas imposer de refonte UI.
- **NFR-007**: Les performances percues des parcours existants ne doivent pas regresser de maniere significative: les lectures publiques cachees restent rapides et les soumissions valides retournent une confirmation sans attendre la livraison notification.

### Runtime Rules

- Hors tests, PostgreSQL/Prisma est la source de verite des donnees critiques.
- Hors tests, Redis est le composant runtime pour caches, flags caches, rate limiting, anti-spam, doublons, locks temporaires et OTP/MFA si deja prevu.
- Hors tests, BullMQ est le composant runtime pour jobs asynchrones deja prevus.
- Les adaptateurs memoire ne peuvent etre selectionnes que par factories ou modules de test explicites, jamais par absence silencieuse de configuration en runtime normal.
- Toute decision sensible doit privilegier le fallback ferme: refuser plutot qu'autoriser lorsque flag, consentement, licence, tenant, RBAC, audit ou lock est incertain.
- Les endpoints publics ecrivent d'abord l'etat durable minimal requis avant d'enqueuer les jobs asynchrones.
- Les jobs asynchrones transportent des references internes et un contexte minimal, pas de PII brute inutile.
- Les health checks distinguent database, Redis, BullMQ, feature flags et audit durable afin de rendre les modes degrades visibles.

### Test Adapter And Fallback Rules

- Les repositories memoire, Redis memoire et queues memoire sont autorises uniquement pour tests unitaires ou tests de service explicitement nommes.
- Les tests HTTP, migration, runtime adapter et constitutionnels doivent utiliser des adapters Prisma/Redis/BullMQ reels ou des test adapters controles qui exposent le meme contrat runtime et prouvent l'absence de fallback memoire par defaut.
- Les variables de bypass test doivent etre refusees en production et documentees comme dangereuses hors test.
- Les tests peuvent mocker une panne Redis/BullMQ/PostgreSQL pour verifier fail fast, mode degrade explicite, retries ou erreurs utilisateur non sensibles.
- Tout test qui utilise une implementation memoire doit porter un nom ou une configuration qui empeche de le confondre avec une validation runtime.

### Impacted Prisma Models

- **Catalog and activation**: `Country`, `ProductCategory`, `Product`, `CountryProduct`, `Offer`, `OfferHistory`, `QuoteFormDefinition`, `RegulatoryRegime`.
- **Partners and access**: `PartnerTenant`, `PartnerCountryAuthorization`, `PartnerProductAuthorization`, `PartnerLicense`, `AccreditationDocument`, `User`, `Role`, `Permission`, `UserRole`, `RolePermission`.
- **Consent, prospects and quote flow**: `ConsentText`, `ConsentRecord`, `Prospect`, `QuoteRequest`, `RoutingPrecheck`, `RoutingDecision`, `LeadAssignment`.
- **Starter and CRM**: `LeadActionHistory`, `BrokerCrmLeadState`, `BrokerCrmPipelineHistory`, `BrokerCrmNote`, `BrokerCrmTask`, `BrokerCrmReminder`, `BrokerCrmDocument`, `BrokerCrmProposal`, `BrokerCrmDispute`, `BrokerCrmAiAssistRequest`.
- **Runtime operations**: `FeatureFlag`, `FeatureFlagHistory`, `AuditLog`, `Notification`, `QueueJobRecord`, `EnvironmentSetting`.
- **AI and documents already planned**: `AIModuleConfig`, `AIInteraction`, `QuoteAISummary`, document metadata models already present or represented by CRM document metadata.

### Migration Impact

- `0001_foundation` must be corrected or regenerated so a fresh database receives the base enums, tables, constraints and indexes required before later migrations.
- `0002_comparator_quote`, `0003_broker_starter_portal` and `0004_broker_crm_pro` must apply cleanly after `0001_foundation` on an empty database.
- Migration validation must include schema validation, apply-from-empty, reset/rebuild equivalent, and seed minimal verification.
- Any migration repair must avoid masking production data-loss risks; local reset-only guidance must be clearly limited to local development/test.
- Required default flags must be created with safe disabled values, not active values.
- The durable audit, notification/job and feature flag histories must remain queryable after migrations.

### Redis Strategy

- Redis key namespaces must distinguish public catalog cache, feature flags, rate limits, anti-spam fingerprints, duplicate fingerprints, routing locks, notification idempotency and OTP/MFA if applicable.
- TTLs must be documented per namespace; sensitive flags and locks require short, explicit TTL or active invalidation.
- Public catalog caches must be invalidated or expire when countries, products or offers change.
- Feature flag cache must be invalidated on admin mutation and must fail closed when cache/source is unavailable for sensitive flags.
- Duplicate and anti-spam keys must use non-reversible fingerprints for email/phone/IP/device-like signals.
- Routing locks must be scoped to quote request or lead assignment and expire automatically.
- Redis errors must not expose secrets, URLs with credentials or PII.

### BullMQ Strategy

- BullMQ queues must be configured from runtime Redis settings and named per domain or job class in a stable namespace.
- The minimum jobs are visitor quote confirmation, broker new lead notification, Starter/CRM action notification when already planned, and audit/report jobs if already planned.
- Jobs must use idempotency keys where repeated enqueue is possible.
- Jobs must reference durable `Notification`, `QueueJobRecord`, `QuoteRequest`, `LeadAssignment` or audit identifiers rather than embedding full PII.
- Failed jobs must update observable status or logs suitable for support/admin diagnosis.
- Memory queues are reserved for unit tests only and must not be registered by default in runtime normal.

### Durable Audit Strategy

- Audit writes for sensitive actions are part of the acceptance criteria, not best-effort logging.
- Required audit fields include actor when available, public/anonymous context when not authenticated, target type/id, action, scope, result, reason/error category, timestamp and correlationId when available.
- Audit context must be PII-minimized and searchable only by authorized admin/compliance roles.
- Audit failure during high-risk actions must block the action or create an explicit operational failure state; it must not silently succeed without evidence.
- Auth/session audits from 006 remain applicable when login/logout paths exist in the runtime.

### Feature Flag Strategy

- PostgreSQL is the source for flags; Redis is an acceleration layer.
- Precedence must be deterministic across global, country, product, partner, plan and AI scopes.
- Missing flags for sensitive or regulated modules are false.
- `broker_crm_enabled` is false when absent or false even for Pro/Enterprise brokers.
- Flag mutations require RBAC, audit, history and cache invalidation/expiry.
- Tests must cover absent, false, true, cache hit, cache miss, stale cache/invalidation and Redis unavailable cases.

### Expected Tests

- Unit tests for Prisma repositories and service boundaries with test-only memory alternatives where useful.
- Integration tests for Prisma-backed repositories using migrated schema or equivalent robust database test strategy.
- Redis adapter tests for cache, TTL/invalidation, rate limiting, anti-spam, duplicate detection, routing locks and feature flag cache.
- BullMQ adapter tests proving jobs are enqueued in runtime adapter and memory queue is test-only.
- HTTP tests for durable persistence on quote request, consent, routing/refusal, lead detail access, Starter actions, CRM actions, admin sensitive actions and audit search.
- Migration/base-fresh tests applying all migrations from zero and executing seed minimal.
- Feature flag tests for absent, false, true, cache hit, cache miss and fail-closed sensitive flags.
- Durable audit tests proving persistent writes for all covered sensitive actions and refusals.
- Abuse tests for public rate limiting, anti-spam and duplicate quote request handling.
- Tenant isolation tests proving no cross-broker read, mutation, export, notification or CRM action succeeds.
- Constitutional regression tests proving consent, license, flags, RBAC, PII protection, routing and frontend separation invariants remain green.

### Key Entities *(include if feature involves data)*

- **PrismaRuntimeRepository**: Repository backed by Prisma/PostgreSQL for durable runtime data outside tests.
- **TestMemoryRepository**: Explicitly test-only repository used for isolated unit tests and forbidden in runtime normal.
- **RuntimeConfig**: Validated configuration for PostgreSQL, Redis, BullMQ, test adapters, production fail-fast and local quickstart.
- **FeatureFlag**: Persistent activation record resolved by deterministic scope precedence and cached in Redis.
- **FeatureFlagCacheEntry**: Redis representation of a flag decision with scope, TTL/version and fail-closed semantics.
- **AuditLog**: Durable compliance event for sensitive success/refusal, searchable by authorized roles.
- **RedisRuntimeState**: Cache, rate-limit counter, anti-spam marker, duplicate fingerprint, routing lock, notification idempotency or OTP/MFA state.
- **BullMQJob**: Runtime async job for notification or already planned background work, tied to durable records and retry/status handling.
- **QueueJobRecord**: Durable or observable job metadata used to correlate enqueue, processing, failure and retry.
- **QuoteRequest**: Durable visitor request whose creation, duplicate status, consent, routing and notifications must survive restart.
- **LeadAssignment**: Durable assignment to eligible broker tenant with strict tenant isolation and action history.
- **ConsentRecord**: Durable proof required before any lead transmission.
- **PartnerLicense**: Durable eligibility evidence that blocks inactive, expired, suspended, invalid or out-of-scope brokers.
- **Notification**: Durable notification metadata whose delivery is processed asynchronously.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of runtime-normal repository bindings for critical domains use durable Prisma-backed repositories or documented runtime adapters, with 0 memory repositories registered outside tests.
- **SC-002**: A fresh database can be rebuilt from migrations and seed minimal, then pass critical HTTP persistence tests without manual SQL fixes.
- **SC-003**: 100% of sensitive actions listed in this spec create durable AuditLog evidence in acceptance tests or are explicitly marked not applicable because the path is not implemented.
- **SC-004**: 100% of sensitive flags tested fail closed when absent, false, invalid, cache-missed or source-unavailable; `broker_crm_enabled` and regulated modules remain false by default.
- **SC-005**: 100% of runtime-normal Redis-dependent features tested use Redis or a contract-compatible runtime test adapter, with 0 default `InMemoryRedisClient` usage outside unit tests.
- **SC-006**: 100% of required notification/job scenarios enqueue a BullMQ job in runtime adapter tests and return HTTP responses without waiting for delivery.
- **SC-007**: Public abuse tests prove rate limiting, anti-spam and duplicate quote request controls block or mark 100% of configured abuse scenarios without requiring a real Redis dependency in unit tests.
- **SC-008**: Tenant isolation regression tests report 0 successful cross-broker lead reads, mutations, exports, notifications or CRM actions.
- **SC-009**: Configuration validation tests prove production/runtime-normal startup refuses silent memory fallbacks when PostgreSQL, Redis or BullMQ dependencies required by enabled paths are missing.
- **SC-010**: Existing constitutional tests remain green: no transmission without consent, no routing to ineligible broker, no CRM without `broker_crm_enabled=true`, no regulated module active by default, RBAC strict and PII protected.

## Assumptions

- Specs 001 a 006 sont implementees et commitees; cette spec ne change pas leurs regles metier, elle durcit leurs integrations runtime.
- Le backend reste NestJS modulaire avec PostgreSQL/Prisma comme source durable, Redis pour cache/abus/locks et BullMQ pour jobs comme defini par la constitution.
- Le schema Prisma actuel contient deja la majorite des modeles necessaires, mais certaines migrations ou repositories peuvent etre incomplets ou non alignes avec le runtime.
- Les tests unitaires peuvent conserver des adaptateurs memoire explicitement marques test, mais les tests runtime critiques doivent verifier les adapters reels ou contract-compatible.
- Les notifications couvertes sont celles deja prevues par les specs precedentes; cette spec n'ajoute pas de nouveaux canaux commerciaux.
- Les documents metadata sont inclus uniquement lorsqu'ils sont deja modelises ou prevus par les specs precedentes; aucun stockage documentaire avance n'est ajoute.
- Le mode degrade, s'il existe, est uniquement explicite, documente, teste et interdit pour autoriser une decision sensible de maniere ouverte.

## Risks

- La migration `0001_foundation` peut etre insuffisante pour reconstruire une base fraiche et necessiter une correction prudente de l'historique local.
- Certains services peuvent instancier directement des dependances memoire, ce qui demandera une refonte de boundary sans changer les regles metier.
- Les tests Prisma/Redis/BullMQ peuvent allonger la CI et necessiter une strategie de services de test fiable.
- Des divergences entre `schema.prisma`, migrations SQL et services peuvent reveler des champs manquants ou inutilises.
- Une mauvaise gestion de cache flag pourrait activer trop longtemps une fonctionnalite interdite apres modification.
- Enqueue BullMQ et audit durable dans les transactions critiques peuvent introduire des problemes d'idempotence ou de retry si la strategie n'est pas explicite.
- Le durcissement fail-fast peut faire apparaitre des environnements locaux incomplets qui fonctionnaient seulement grace aux fallbacks memoire.

## Out Of Scope

- Nouvelles fonctionnalites metier.
- Refonte UI.
- Paiement, encaissement de prime, souscription, emission de police, emission d'attestation, signature electronique, sinistres.
- IA avancee, recommandation IA officielle, decision reglementee automatisee ou broker assistant avance.
- Webhooks avances, API assureur avancee, SSO/OAuth externe et refresh token avance.
- Nouveaux canaux de notification non deja prevus.
- Changement des regles de routage, scoring, quotas, plans ou eligibilite au-dela de leur persistance et verification runtime.
- Activation par defaut de `broker_crm_enabled` ou d'un module reglemente.
