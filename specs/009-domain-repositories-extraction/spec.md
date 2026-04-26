# Feature Specification: Domain Repositories Extraction AssurMatch

**Feature Branch**: `009-domain-repositories-extraction`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "Creer la specification technique 009-domain-repositories-extraction pour extraire progressivement les repositories et providers par domaine hors de AssurMatchRuntime, brancher de vrais providers NestJS et faire reposer les fonctionnalites publiques et broker existantes sur des repositories Prisma/domain services testables, injectables et durables. Ne genere pas le plan. Ne genere pas tasks.md. N'implemente rien."
**Validation State**: Draft
**Continuous Workflow Eligible**: No - cette invocation est limitee a la specification; le user a explicitement demande de ne pas generer le plan, les taches ni l'implementation.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette specification est technique et transversale. Elle ameliore la persistance, l'injection de dependances et la maintenabilite des fonctionnalites deja livrees. Elle n'ajoute aucune vente directe, souscription, encaissement de prime, emission de police, attestation, sinistre, paiement, signature electronique, API assureur avancee, webhook avance, IA avancee ou conseil personnalise engageant par AssurMatch.
- **Impacted application(s)**: Backend API: oui, impact principal. Packages partages: oui si un contrat, type ou schema deja expose doit etre stabilise pour les repositories/services. Web Publique Client: non, sauf ajustement mineur et compatible si un contrat deja existant doit etre corrige. Back-office Partenaires/Plateforme: non, sauf ajustement mineur et compatible si un contrat deja existant doit etre corrige.
- **Affected scopes**: Countries, products, offers, prospects, quote requests, consent records, lead assignments, partners, partner licenses, routing decisions, Starter leads, CRM leads and activities, notifications, durable audit, feature flags, runtime provider wiring, repository guardrails and tests.
- **Frontend separation**: Les deux applications web restent separees applicativement. La spec ne cree pas de nouveaux ecrans ni de nouveaux parcours frontend. Les ajustements eventuels de contrat ne doivent pas faire importer d'etat, de routes, de layouts, de privileges ou de clients back-office dans Web Publique Client, et ne doivent pas permettre aux applications broker/admin d'utiliser les endpoints publics pour contourner l'authentification ou le RBAC.
- **Required feature flags**: Les flags existants restent les controles applicables: `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, flags pays, flags produit, flags partenaire/plan si deja modelises et flags IA existants. `broker_crm_enabled`, `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled` et tout flag IA sensible restent false par defaut lorsqu'absents, invalides ou illisibles.
- **Consent and transmission**: Un `ConsentRecord` durable, valide, scope pays/produit/finalite/destinataire est obligatoire avant toute transmission de lead. Une demande sans consentement ne doit pas creer de persistance non conforme, ne doit pas declencher de routage, ne doit pas notifier de courtier et doit produire une preuve d'audit durable de refus lorsque le parcours atteint la decision de transmission.
- **Partner license controls**: Le routage, l'exposition des leads et les controles d'eligibilite broker doivent continuer a verifier partenaire actif, autorisation pays/produit, plan, quota/capacite et licence valide, non expiree, non suspendue, non invalide. Aucun courtier inactif, non autorise ou a licence expiree ne peut recevoir ou consulter un lead hors scope.
- **Audit and data history**: Les actions sensibles et refus importants doivent produire des `AuditLog` durables avec acteur, action, cible, scope, resultat, raison, timestamp et `correlationId` lorsque disponible. Les historiques existants de lead, CRM, consentement, offre, feature flag, routage et notification doivent rester reconstruisibles depuis la persistance durable ou depuis des traces explicitement documentees.
- **Security and RBAC**: Les routes broker/admin conservees ou touchees exigent authentification, RBAC strict, MFA lorsque requis, tenant isolation, controle du plan, refus read-only, pagination/limites et erreurs PII-safe. Les repositories ne doivent pas permettre de lire ou muter des donnees d'un autre tenant par defaut.
- **Routing impact**: Les regles de routage existantes ne changent pas. La spec deplace la responsabilite de lecture/ecriture vers repositories/services durables, tout en conservant les blockers constitutionnels: pas de consentement, pays/produit desactive, offre expiree ou non validee, courtier inactif, non autorise, licence invalide/expiree, quota/capacite ou regle de routage non satisfaite.
- **AI impact**: Aucun nouvel usage IA. Les modules IA existants restent controles par flags et ne doivent pas etre actives par cette extraction. Les traces IA existantes restent testees uniquement si deja modelisees par les specs precedentes.
- **UX/content restrictions**: Aucun nouveau contenu public n'est introduit. Les contrats publics existants doivent continuer a porter le positionnement indicatif: "offre indicative", "prix indicatif", "a confirmer par le courtier partenaire", et eviter les formulations interdites comme "acheter maintenant", "souscrire maintenant", "contrat valide" ou equivalents.
- **Workflow continuity**: Apres validation explicite et absence de marqueur de clarification, cette feature technique standard pourra passer a `/speckit.plan`, puis `/speckit.tasks`, puis `/speckit.implement`, sauf conflit constitutionnel, risque securite/conformite/donnees, activation interdite, decision produit non couverte ou validation bloquante. Aucun commit automatique apres implementation sans demande explicite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initialiser les repositories comme providers runtime (Priority: P1)

Une equipe technique demarre le backend et constate que les domaines critiques ne sont plus portes par des tableaux memoire internes a `AssurMatchRuntime`, mais par des repositories de domaine injectes comme providers runtime.

**Why this priority**: Sans providers injectables, les controllers mis en place par la spec 008 restent difficiles a tester et a faire evoluer; la source de verite durable n'est pas garantie.

**Independent Test**: Demarrer le module backend dans un test runtime et verifier que les tokens de repositories critiques resolvent des implementations runtime durables, tandis que les implementations memoire sont refusees hors environnement de test.

**Acceptance Scenarios**:

1. **Given** le backend demarre en runtime normal, **When** les modules NestJS sont initialises, **Then** `CountriesRepository`, `ProductsRepository`, `OffersRepository`, `ProspectsRepository`, `QuoteRequestsRepository`, `LeadAssignmentsRepository` et `ConsentRecordsRepository` sont injectes comme vrais providers.
2. **Given** `NODE_ENV` n'est pas `test`, **When** un repository memoire est selectionne pour un domaine extrait, **Then** le demarrage echoue ou un test de garde echoue avec un message explicite.
3. **Given** un service de domaine extrait, **When** il lit ou ecrit l'etat metier principal, **Then** il passe par son repository injecte et non par un tableau conserve dans `AssurMatchRuntime`.
4. **Given** une suite de tests unitaires, **When** elle isole un service de domaine, **Then** elle peut utiliser une implementation memoire explicitement nommee test-only.

---

### User Story 2 - Lire le catalogue public depuis les repositories (Priority: P1)

Un visiteur consulte les pays, produits et offres publics existants; les reponses continuent a respecter flags, statuts et validite, mais les donnees viennent de repositories de domaine durables.

**Why this priority**: Le catalogue public est le premier parcours visiteur et doit etre fiable, reconstructible et coherent avec la base durable.

**Independent Test**: Preparer des pays, produits et offres dans la persistance de test, appeler les endpoints publics existants et verifier que les donnees proviennent des repositories, avec blocage des statuts non publics.

**Acceptance Scenarios**:

1. **Given** des pays publics persistants, **When** `GET /countries` est appele, **Then** la liste provient de `CountriesRepository` et non d'un tableau memoire.
2. **Given** un pays public et des produits publics persistants, **When** les produits du pays sont consultes, **Then** `ProductsRepository` et l'association pays/produit sont la source de verite.
3. **Given** une offre validee, active et dans sa periode de validite, **When** le visiteur consulte les offres publiques, **Then** `OffersRepository` la retourne comme offre indicative.
4. **Given** une offre expiree, non validee ou suspendue, **When** le visiteur consulte les offres publiques, **Then** elle n'est pas exposee comme disponible.
5. **Given** un pays ou produit desactive par flag, **When** un endpoint public le consulte, **Then** la reponse est bloquee ou vide selon le contrat existant, sans exposition broker/admin.

---

### User Story 3 - Persister une demande de devis consentie via repositories (Priority: P1)

Un visiteur soumet une demande existante avec consentement; le systeme cree ou relie le prospect, enregistre le consentement et cree la demande via repositories durables avant tout routage.

**Why this priority**: La constitution impose consentement, historique opposable et absence de transmission non conforme; le parcours ne peut pas reposer sur une memoire volatile.

**Independent Test**: Appeler `POST /quote-requests` avec un payload valide et consentement publie, puis verifier l'existence durable de `Prospect`, `ConsentRecord`, `QuoteRequest`, audit et eventuel etat de routage.

**Acceptance Scenarios**:

1. **Given** un visiteur soumet une demande valide avec consentement, **When** `POST /quote-requests` est appele, **Then** `Prospect`, `ConsentRecord` et `QuoteRequest` sont persistants via repositories.
2. **Given** une demande sans consentement valide, **When** `POST /quote-requests` est appele, **Then** aucun routage ni notification broker n'a lieu et aucune persistance non conforme n'est conservee.
3. **Given** le pays ou produit est desactive pour le devis, **When** la demande est soumise, **Then** elle est refusee avant routage et le refus sensible est audite durablement.
4. **Given** une demande marquee doublon, spam ou manual review par les regles existantes, **When** elle est traitee, **Then** l'etat persistant reflete la decision sans changer la regle metier existante.
5. **Given** une action sensible reussit pendant la soumission, **When** l'audit est consulte, **Then** un `AuditLog` durable existe.

---

### User Story 4 - Exposer les leads broker depuis les assignments persistants (Priority: P1)

Un courtier Starter ou Pro consulte ses leads existants; les listes, details, statuts et historiques minimaux proviennent des repositories de lead assignment et d'activite, avec isolation stricte du tenant.

**Why this priority**: Les leads sont des donnees sensibles et commerciales; ils doivent rester durables, isolables par tenant et compatibles avec Starter/CRM.

**Independent Test**: Seed des assignments persistants pour plusieurs courtiers, appeler les endpoints Starter et CRM existants avec acteurs differents et verifier source repository, plan, flag et tenant isolation.

**Acceptance Scenarios**:

1. **Given** un courtier Starter authentifie, **When** `GET /broker/starter/leads` est appele, **Then** les donnees proviennent de `LeadAssignmentsRepository` et restent limitees a son tenant.
2. **Given** un courtier Starter, **When** il tente d'acceder au CRM, **Then** l'acces est refuse et audite; aucun objet CRM n'est retourne.
3. **Given** un courtier Pro avec `broker_crm_enabled` true, **When** `GET /broker/crm/leads` est appele, **Then** les donnees proviennent de `LeadAssignmentsRepository` et des repositories CRM, avec respect tenant, plan et flags.
4. **Given** `broker_crm_enabled` false ou absent, **When** un courtier Pro consulte le CRM, **Then** l'acces est refuse par defaut.
5. **Given** un courtier A, **When** il tente de lire, muter ou exporter un lead du courtier B, **Then** l'acces est refuse sans confirmer l'existence de la ressource.

---

### User Story 5 - Conserver le routage et l'audit durables (Priority: P1)

Le moteur de routage existant continue a appliquer les blockers constitutionnels, mais ses lectures d'eligibilite et ses ecritures de decision/assignment s'appuient sur repositories durables.

**Why this priority**: Le routage engage la responsabilite de la plateforme; la migration de persistance ne doit pas affaiblir consentement, licence, autorisation, quotas ni audit.

**Independent Test**: Executer les cas de routage succes et refus avec donnees persistantes, puis verifier `RoutingDecision`, `LeadAssignment`, `AuditLog`, notifications et absence de transmission interdite.

**Acceptance Scenarios**:

1. **Given** un courtier actif, autorise et avec licence valide, **When** un lead consentant est routable, **Then** le routage cree une decision et un assignment persistants.
2. **Given** un courtier inactif, non autorise ou a licence expiree, **When** le routage evalue le lead, **Then** ce courtier est exclu et la raison est durablement tracee.
3. **Given** aucun courtier eligible, **When** le routage s'execute, **Then** la demande reste non transmise, la raison est conservee et aucun courtier non eligible n'est notifie.
4. **Given** une action de routage reussie ou refusee, **When** les audits sont consultes, **Then** les decisions sensibles sont visibles dans `AuditLog`.

---

### User Story 6 - Reduire AssurMatchRuntime sans rupture brutale (Priority: P2)

Une equipe maintient temporairement `AssurMatchRuntime` comme orchestrateur de transition, mais elle peut identifier ce qui reste a migrer et verifier qu'aucun nouvel etat metier principal n'y est introduit.

**Why this priority**: Une suppression brutale risquerait de casser les routes; une transition controlee reduit le risque tout en imposant une trajectoire durable.

**Independent Test**: Inspecter la documentation/spec de transition et executer un garde-fou qui detecte les nouveaux tableaux memoire pour les domaines deja extraits.

**Acceptance Scenarios**:

1. **Given** `AssurMatchRuntime` existe encore, **When** la feature est implementee, **Then** il orchestre seulement les dependances non migrees ou transitoires et ne porte plus les etats principaux extraits.
2. **Given** un domaine marque extrait, **When** un nouveau tableau memoire y est ajoute en runtime normal, **Then** un test de garde echoue.
3. **Given** un domaine non encore extrait reste temporairement dans la facade, **When** la documentation est consultee, **Then** la raison, le risque et le critere de migration sont explicites.
4. **Given** une route existante, **When** l'extraction est livree, **Then** son contrat HTTP reste compatible sauf exception documentee et testee.

### Edge Cases

- Pays public desactive, waitlist-only ou devis desactive: le catalogue et la soumission publique doivent refuser ou adapter la reponse selon le contrat existant, sans transmission de lead.
- Produit desactive, quote-disabled, comparison-disabled, sensitive data disabled ou manual-review-required: les services doivent conserver les decisions existantes et persister l'etat resultant.
- Consentement manquant, refuse, expire, hors scope ou texte de consentement incoherent: aucune transmission, aucun assignment, refus audite durablement.
- Offre expiree, non validee, suspendue, retiree ou sponsorisee: elle ne doit pas etre exposee comme disponible; la sponsorisation doit rester visible si deja exposee.
- Courtier inactif, suspendu, retire, non autorise pays/produit, licence expiree/suspendue/invalide/revoquee ou quota/capacite bloque: exclusion de routage, pas de notification, raison tracee.
- `broker_crm_enabled` absent, false, stale ou source indisponible: CRM refuse par defaut, meme pour un courtier Pro/Enterprise.
- Role sans permission, MFA manquante, acteur invalide, role read-only ou tenant absent: routes broker/admin refusees avec erreurs non sensibles et audit lorsque l'action est sensible.
- Cross-tenant broker: aucun repository ne doit retourner une ressource hors tenant par defaut; les refus ne confirment pas l'existence de la ressource cible.
- Audit durable indisponible pour une action critique: l'action doit echouer ferme ou produire un etat operationnel explicite deja prevu, jamais masquer le manque de preuve.
- Repository Prisma indisponible ou schema non reconstructible: le backend runtime normal doit echouer clairement plutot que basculer silencieusement en memoire.
- Tests unitaires avec repositories memoire: autorises uniquement sous `NODE_ENV=test` ou module test explicitement nomme.
- Base fraiche: les migrations doivent reconstruire le schema, les flags sensibles restent fermes et les seeds de test ne doivent pas activer de module interdit.
- API publique ou broker existante: les routes et contrats de 002, 003, 004 et 008 doivent rester compatibles.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme DOIT definir des tokens/interfaces de repository par domaine extrait et les exposer comme dependances injectables.
- **FR-002**: Le systeme DOIT fournir des implementations runtime Prisma pour les domaines critiques extraits: countries, products, offers, prospects, quote requests, lead assignments et consent records.
- **FR-003**: Le systeme DOIT fournir ou finaliser des implementations Prisma pour partners, partner licenses, CRM activities, routing decisions et notifications lorsque ces donnees sont necessaires aux routes/routage existants.
- **FR-004**: Chaque implementation Prisma DOIT recevoir le `PrismaService` runtime reel par injection, sans instanciation manuelle silencieuse dans les services de domaine.
- **FR-005**: Les implementations memoire DOIVENT etre explicitement test-only, nommees comme telles et interdites en runtime normal hors `NODE_ENV=test` ou mode explicitement autorise et audite par configuration de test.
- **FR-006**: Les services de domaine extraits NE DOIVENT PAS conserver de tableau ou map memoire comme source de verite runtime pour les entites extraites.
- **FR-007**: `AssurMatchRuntime` PEUT rester comme orchestrateur de transition, mais NE DOIT PAS porter directement les etats metiers principaux des domaines extraits.
- **FR-008**: Le systeme DOIT documenter les responsabilites restantes de `AssurMatchRuntime`, avec liste des domaines/routes encore transitoires, raison, risque et critere de sortie.
- **FR-009**: Le systeme DOIT ajouter un garde-fou de test qui detecte la reintroduction de nouveaux tableaux/maps memoire dans les domaines extraits.
- **FR-010**: Les endpoints publics deja exposes par de vrais controllers NestJS DOIVENT continuer a fonctionner avec les memes routes, sauf exception justifiee, testee et compatible.
- **FR-011**: `GET /countries` DOIT lire les pays publics depuis `CountriesRepository` et appliquer les statuts/flags publics existants.
- **FR-012**: Les lectures produits publiques DOIVENT lire depuis `ProductsRepository` et respecter association pays/produit, statuts et flags de comparaison/devis.
- **FR-013**: Les lectures offres publiques DOIVENT lire depuis `OffersRepository` et filtrer toute offre expiree, non validee publiquement, suspendue ou retiree.
- **FR-014**: `POST /quote-requests` DOIT creer ou relier le prospect via `ProspectsRepository` lorsque la demande est valide et consentie.
- **FR-015**: `POST /quote-requests` DOIT creer un `ConsentRecord` durable via `ConsentRecordsRepository` avant toute transmission de lead.
- **FR-016**: `POST /quote-requests` DOIT creer la `QuoteRequest` via `QuoteRequestsRepository` avec reference publique, statut, statut duplicate/routing, payload minimal et retention.
- **FR-017**: Une demande sans consentement valide DOIT etre refusee avant toute creation d'assignment, notification broker ou transmission.
- **FR-018**: Les decisions de routage existantes DOIVENT lire partenaires, autorisations, licences, quotas/capacites et assignments actifs depuis repositories durables.
- **FR-019**: Le routage DOIT creer ou lire `RoutingDecision` et `LeadAssignment` via repositories durables lorsque ces donnees existent dans le schema.
- **FR-020**: Aucun routage NE DOIT viser un courtier inactif, non autorise pour pays/produit, hors plan/flag applicable, sur quota/capacite bloquee ou a licence expiree/suspendue/invalide.
- **FR-021**: Les lectures Starter DOIVENT lire les leads depuis `LeadAssignmentsRepository`, avec pagination/limites si la route liste des donnees.
- **FR-022**: Les actions Starter existantes DOIVENT muter les statuts via `LeadAssignmentsRepository` et conserver l'historique minimal via repository durable lorsqu'il est modelise.
- **FR-023**: Les lectures CRM DOIVENT lire depuis `LeadAssignmentsRepository` et les repositories CRM existants, et refuser Starter.
- **FR-024**: Les actions CRM existantes DOIVENT persister status, notes, tasks, reminders, assignations, documents, proposals, disputes et pipeline history via repository durable lorsqu'elles sont deja modelisees.
- **FR-025**: Le CRM DOIT rester refuse lorsque `broker_crm_enabled` est false, absent ou illisible.
- **FR-026**: Les repositories broker/CRM DOIVENT appliquer ou permettre au service d'appliquer tenant isolation, plan, role et read-only avant toute lecture/mutation sensible.
- **FR-027**: Les notifications existantes liees aux quotes/leads DOIVENT conserver une trace durable via `NotificationsRepository` et `QueueJobRecord` lorsque deja modelise.
- **FR-028**: Les audits sensibles DOIVENT rester ecrits dans `AuditLog` durable et consultables par les routes/admin services existants autorises.
- **FR-029**: Les feature flags DOIVENT rester persistants; l'extraction NE DOIT PAS remplacer les flags durables par un etat memoire ou un cache seul.
- **FR-030**: Les caches Redis eventuels NE DOIVENT PAS devenir la source de verite des donnees extraites; ils peuvent accelerer une lecture mais doivent avoir source durable, invalidation ou TTL.
- **FR-031**: Les migrations Prisma DOIVENT etre ajoutees uniquement si un modele manque pour persister une donnee deja prevue par specs precedentes.
- **FR-032**: Toute migration ajoutee DOIT conserver la reconstruction base fraiche et les defaults fermes pour les modules sensibles.
- **FR-033**: Les shared packages PEUVENT etre ajustes seulement pour stabiliser des contrats existants; ils NE DOIVENT PAS introduire de nouveau parcours metier.
- **FR-034**: Les controllers DOIVENT rester fins et deleguer aux services de domaine, qui deleguent la persistance aux repositories.
- **FR-035**: Les routes publiques NE DOIVENT PAS dependre d'un acteur, privilege, session ou tenant broker/admin.
- **FR-036**: Les routes broker/admin DOIVENT conserver authentification, RBAC, MFA lorsque requis, tenant isolation et erreurs PII-safe.
- **FR-037**: Les listes broker/admin DOIVENT rester limitees ou paginees pour eviter fuite de donnees et surcharge.
- **FR-038**: Les tests existants de 002, 003, 004, 007 et 008 DOIVENT rester compatibles, sauf ajustement documente de test pour prouver la persistance durable.
- **FR-039**: Le systeme DOIT verifier en test que les domaines extraits n'appellent plus `AssurMatchRuntime` pour lire/ecrire leur etat principal.
- **FR-040**: Le systeme DOIT produire un `git diff` compatible avec la demande d'implementation future, sans plan, tasks ni code dans cette invocation de specification.

### Non-Functional Requirements

- **NFR-001**: Le demarrage backend runtime normal doit etre deterministe; une dependance repository obligatoire manquante doit produire une erreur claire.
- **NFR-002**: Les repositories doivent etre explicites, typables et testables sans exposer de details PII inutiles aux logs, erreurs ou payloads de test.
- **NFR-003**: Les operations publiques critiques doivent rester responsives et ne doivent pas ajouter de traitement lourd synchrone dans les endpoints publics.
- **NFR-004**: Les controles consentement, licence, RBAC, tenant, plan et flags doivent echouer ferme lorsque le contexte ou la source durable est absent, incertain ou illisible.
- **NFR-005**: Les services et repositories doivent eviter la duplication de regles metier sensibles; la persistance ne doit pas redefinir les decisions de routage ou de publication.
- **NFR-006**: Les donnees critiques doivent conserver `createdAt`, `updatedAt`, `createdById` lorsque applicable, retention et historique lorsque deja modelises.
- **NFR-007**: Les tests repositories/services doivent etre reproductibles localement et en CI avec donnees de test isolees.
- **NFR-008**: Les erreurs publiques doivent rester non sensibles et ne jamais exposer details tenant, licence, courtier non selectionne ou privileges.
- **NFR-009**: Les migrations doivent etre idempotentes selon les conventions du projet et valider la reconstruction d'une base fraiche.
- **NFR-010**: L'extraction doit rester progressive et par domaine; aucune reecriture totale du backend n'est requise ni acceptee par cette spec.

### Domain Repositories To Extract

- **CountriesRepository**: lecture publique/admin des pays, recherche par ISO, status, flags, regime, dates et champs d'audit existants.
- **ProductsRepository**: lecture publique/admin des produits, recherche par key, associations pays/produit, flags produit/pays-produit, sensibilite et manual review.
- **OffersRepository**: lecture publique/admin des offres, validite, statut, validation publique, sponsorisation, priorite d'affichage et historique existant.
- **ProspectsRepository**: creation ou liaison de prospect, fingerprints contact, consentRecordIds, retention et recherche PII-safe.
- **QuoteRequestsRepository**: creation, lecture statut public, mise a jour duplicate/routing/status/refusal, liste admin et reference publique.
- **LeadAssignmentsRepository**: creation d'assignments, lecture par id/tenant, listes Starter/CRM, mutations de statut, metadonnees CRM, active count et historique minimum.
- **ConsentRecordsRepository**: creation de preuve de consentement, validation par scope, recherche admin autorisee et conservation du lien texte/finalite/destinataire.
- **PartnerLicensesRepository**: lecture/creation/validation des licences, verification statut, expiration, pays/produits couverts et blocage de routage.
- **PartnersRepository**: lecture partenaire/tenant, statut, plan, quota/capacite, autorisations pays/produit et informations minimales de routage.
- **CRMActivityRepository**: status pipeline, pipeline history, notes, tasks, reminders, documents, proposals, disputes et metadonnees CRM deja modelisees.
- **NotificationsRepository**: notifications quote/lead existantes, statuts de livraison, retry count, reference payload, lien audit/job et lecture admin.
- **RoutingDecisionsRepository**: decisions de routage et refus deja modelises, candidats exclus, raisons, correlationId et lien quote request.
- **FeatureFlagsRepository and AuditLogsRepository**: deja introduits par 007, ils restent durables et doivent etre reutilises ou corriges lorsque l'extraction les touche.

### Expected Repository Interface Contracts

- Chaque interface de repository DOIT exposer des methodes de domaine stables plutot que des acces bruts aux collections ou au client de persistance.
- Chaque repository DOIT declarer un mode runtime ou une metadata equivalente permettant de distinguer `prisma-runtime` et `memory-test`.
- Les methodes de lecture broker DOIVENT prendre le scope tenant ou retourner uniquement des donnees deja filtrees par tenant.
- Les methodes de mutation sensibles DOIVENT accepter un contexte acteur ou des metadonnees d'audit lorsque le service doit produire historique/audit.
- Les repositories de liste DOIVENT supporter limites, pagination ou bornes explicites pour les routes broker/admin.
- Les repositories de quote/consent/assignment DOIVENT pouvoir participer a une operation atomique lorsque la persistance combine creation Prospect, ConsentRecord, QuoteRequest et eventuel routage initial.
- Les interfaces NE DOIVENT PAS exposer de capacite d'export globale non scopee aux services broker.
- Les interfaces NE DOIVENT PAS cacher une creation memoire lorsque la persistance durable echoue en runtime normal.

### Prisma Implementations Expected

- Les implementations Prisma DOIVENT utiliser les modeles existants lorsque disponibles: `Country`, `Product`, `CountryProduct`, `Offer`, `OfferHistory`, `Prospect`, `ConsentRecord`, `QuoteRequest`, `LeadAssignment`, `LeadActionHistory`, `BrokerCrmLeadState`, `BrokerCrmPipelineHistory`, `BrokerCrmNote`, `BrokerCrmTask`, `BrokerCrmReminder`, `BrokerCrmDocument`, `BrokerCrmProposal`, `BrokerCrmDispute`, `PartnerTenant`, `PartnerCountryAuthorization`, `PartnerProductAuthorization`, `PartnerLicense`, `RoutingDecision`, `Notification`, `QueueJobRecord`, `AuditLog`, `FeatureFlag` et `FeatureFlagHistory`.
- Les implementations Prisma DOIVENT mapper les enums et statuts existants sans inventer de nouveaux etats metier.
- Les implementations Prisma DOIVENT appliquer les filtres publics: pays public/waitlist selon flags, produit public/quote/comparison selon flags, offre active/validee/non expiree.
- Les implementations Prisma DOIVENT appliquer les filtres broker: `partnerTenantId`, plan, status, assignment ownership, read limits et absence de cross-tenant.
- Les implementations Prisma DOIVENT conserver les champs de retention, timestamps, correlationId et createdBy lorsque applicable.
- Les implementations Prisma DOIVENT utiliser transaction ou mecanisme equivalent lorsque plusieurs entites critiques doivent etre creees ensemble.
- Les implementations Prisma NE DOIVENT PAS creer de donnees broker/admin visibles publiquement dans les payloads publics.
- Les implementations Prisma NE DOIVENT PAS activer par defaut un module reglemente ou sensible lors des seeds/migrations.

### Test-Only Memory Implementations Expected

- Les implementations memoire DOIVENT etre reservees aux tests unitaires, fixtures et modules explicitement test.
- Les implementations memoire DOIVENT etre nommees de facon explicite, par exemple `Memory...Repository` ou `...TestRepository`, et declarer `mode = "memory-test"` ou equivalent.
- Les providers runtime normaux NE DOIVENT PAS selectionner une implementation memoire par defaut lorsque la configuration durable est absente.
- Le demarrage hors test DOIT echouer si un provider de domaine extrait est lie a une implementation memoire.
- Les tests DOIVENT prouver que les implementations memoire restent utilisables pour isoler les services unitaires sans atteindre la base durable.
- Les tests de garde DOIVENT cibler les domaines extraits et echouer si une nouvelle liste/map memoire devient source de verite runtime.

### Impacted NestJS Modules And Providers

- **AppModule / Runtime wiring**: doit composer les modules de domaine avec providers reels et limiter l'usage de `RuntimeHttpWiringModule` ou `AssurMatchRuntime` aux transitions documentees.
- **CountriesModule, ProductsModule, OffersModule**: doivent fournir repository token, implementation Prisma, service public/admin et controllers existants.
- **QuoteRequestsModule, ProspectsModule, ConsentModule, QuoteFormsModule**: doivent fournir les repositories et services necessaires a la creation durable de demande et au consentement.
- **LeadsModule, RoutingModule, PartnersModule, PartnerLicensesModule**: doivent fournir repositories et services pour eligibility, routing decisions, lead assignments, Starter et CRM.
- **NotificationsModule**: doit utiliser repository durable pour les traces notification/job deja modelisees.
- **AuditLogsModule and FeatureFlagsModule**: doivent rester fournisseurs durables et etre injectes comme dependances, pas recrees manuellement par facade.
- **Common backend providers**: doivent centraliser `PrismaService`, repository guard, tokens et eventuels helpers de transaction/test.
- **Packages shared**: peuvent etre touches uniquement pour types/contrats existants necessaires aux DTOs ou tests.

### Domain Service Impact

- Les services de lecture pays publics doivent utiliser `CountriesRepository`.
- Les services de lecture produits publics doivent utiliser `ProductsRepository`.
- Les services de lecture offres publiques doivent utiliser `OffersRepository`.
- Le service de soumission quote doit utiliser `ProspectsRepository`, `ConsentRecordsRepository`, `QuoteRequestsRepository`, `LeadAssignmentsRepository` et repositories de routage lorsque routage en scope.
- Les services Starter doivent utiliser `LeadAssignmentsRepository` et historique durable au lieu de listes internes.
- Les services CRM doivent utiliser `LeadAssignmentsRepository` et `CRMActivityRepository` pour lecture/mutation/historique.
- Les services de routage doivent utiliser `PartnersRepository`, `PartnerLicensesRepository`, `LeadAssignmentsRepository` et `RoutingDecisionsRepository`.
- Les services de notifications doivent utiliser `NotificationsRepository` pour conserver traces existantes.
- Les services doivent conserver les validations et decisions metier existantes; les repositories ne deviennent pas le lieu principal des regles de conformite complexes.

### Prisma And Migration Impact

- La spec part du principe que le schema Prisma actuel couvre la majorite des donnees requises.
- Une migration est autorisee uniquement si un modele/champ manque pour persister une donnee deja prevue par 001-004, 007 ou 008.
- Toute migration doit inclure defaults fermes pour flags sensibles et ne doit pas introduire de nouvelle fonctionnalite metier.
- La reconstruction base fraiche doit rester valide par migration complete, generation client et tests schema/migrations.
- Les seeds ou fixtures de test doivent rester separes des defaults runtime normaux et ne doivent pas activer CRM, IA, paiement, e-signature, police, sinistre ou API assureur par accident.

### AssurMatchRuntime Transition Rules

- `AssurMatchRuntime` peut orchestrer temporairement des dependances non migrees, mais ne doit plus creer les repositories/services principaux des domaines extraits par `new` en runtime normal.
- Les tableaux/maps de pays, produits, offres, prospects, quote requests, consent records, lead assignments, CRM activities, notifications, partners et licenses doivent sortir de la facade et des services runtime normaux une fois le domaine extrait.
- Les domaines restants dans `AssurMatchRuntime` doivent etre listes dans une section de documentation technique avec raison et prochaine etape.
- Aucune route existante ne doit etre supprimee brutalement pour atteindre cet objectif.
- Les tests doivent distinguer les usages transitoires acceptes des regressions qui reintroduisent la memoire comme source de verite.

### API Alignment

- Les routes publiques deja exposees doivent rester stables: `GET /countries`, lectures produits/offres publiques, quote form si deja exposee, `POST /quote-requests` et statut public si deja expose.
- Les routes Starter doivent rester stables: dashboard, leads, detail, history, accept/reject/dispute, notifications, plan capabilities et export si deja expose.
- Les routes CRM doivent rester stables: dashboard, list, kanban, detail, status, notes, tasks, reminders, assign, documents, proposals, disputes, notifications et AI foundations si deja exposees.
- Les routes admin/support existantes doivent rester compatibles lorsque touchees pour audit, flags, quote requests, lead assignments, countries, products, offers, partners, partner licenses, consent, notifications et routing precheck.
- Les contrats frontend ne doivent changer que si necessaire pour corriger une incoherence deja presente; tout changement doit etre justifie, compatible ou accompagne de tests de non-regression.

### Test Requirements

- Les tests DOIVENT couvrir les repositories Prisma des domaines extraits.
- Les tests DOIVENT couvrir les repositories memoire test-only des domaines extraits.
- Les tests DOIVENT couvrir les services de domaine refactorises avec repositories injectes.
- Les tests DOIVENT couvrir l'interdiction des adaptateurs memoire en runtime normal.
- Les tests DOIVENT verifier creation reelle `QuoteRequest`, `Prospect` et `ConsentRecord` via repositories.
- Les tests DOIVENT verifier lecture pays, produits et offres depuis repositories.
- Les tests DOIVENT verifier lecture leads Starter depuis `LeadAssignmentsRepository`.
- Les tests DOIVENT verifier lecture leads CRM depuis `LeadAssignmentsRepository` et `CRMActivityRepository`.
- Les tests DOIVENT verifier que le routage conserve consentement, flags, autorisations, licences, quotas et no-broker rules.
- Les tests DOIVENT verifier que l'audit sensible reste durable.
- Les tests DOIVENT verifier que les feature flags restent persistants et fail-closed pour flags sensibles.
- Les tests HTTP DOIVENT couvrir non-regression endpoints publics.
- Les tests HTTP DOIVENT couvrir non-regression broker Starter.
- Les tests HTTP DOIVENT couvrir non-regression CRM.
- Les tests DOIVENT couvrir reconstruction base fraiche et migrations.
- Les tests DOIVENT inclure un git diff check ou garde equivalent pour eviter plan/tasks/implementation hors scope lors de cette etape.
- Les validations finales d'implementation future DOIVENT inclure typecheck, lint, build et suites unit/integration/contract/guardrails applicables.

### Key Entities *(include if feature involves data)*

- **RepositoryToken**: Identifiant injectable stable pour une interface de repository de domaine.
- **PrismaRepository**: Implementation runtime durable d'un repository de domaine utilisant la persistance comme source de verite.
- **TestMemoryRepository**: Implementation test-only explicitement interdite en runtime normal.
- **AssurMatchRuntimeResidual**: Responsabilite temporaire encore portee par la facade, documentee avec raison et sortie attendue.
- **Country**: Pays public/admin avec status, flags, regime, timestamps et source repository.
- **Product**: Produit avec status, flags, sensibilite, association pays et disponibilite devis/comparaison.
- **Offer**: Offre indicative avec status, validation, validite, sponsorisation et historique.
- **Prospect**: Contact prospect avec fingerprints, consentements, retention et minimisation PII.
- **ConsentRecord**: Preuve durable de consentement, finalite, texte, pays/produit, destinataire et date.
- **QuoteRequest**: Demande publique avec reference, statut, duplicate/routing status, payload minimal, prospect, consent et retention.
- **RoutingDecision**: Decision/refus de routage avec candidats exclus, raisons et correlationId.
- **LeadAssignment**: Assignment broker durable avec tenant, statut, actions, notification, historique et metadonnees CRM.
- **Partner/Broker**: Tenant partenaire avec plan, status, quotas/capacite et autorisations pays/produit.
- **PartnerLicense**: Licence avec status, pays, produits, dates et validation.
- **CRMActivity**: Etat CRM, pipeline history, notes, tasks, reminders, documents, proposals et disputes deja modelises.
- **Notification**: Trace de notification quote/lead avec statuts livraison, retry, payload reference et job.
- **AuditLog**: Preuve durable des actions sensibles et refus.
- **FeatureFlag**: Decision d'activation persistante avec scope, historique, cache version et default ferme.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% des repositories critiques listes en P1 sont resolus comme providers runtime durables au demarrage backend normal.
- **SC-002**: 0 repository memoire de domaine extrait peut etre utilise en runtime normal sans echec de demarrage ou echec de test de garde.
- **SC-003**: `GET /countries` lit les donnees via `CountriesRepository` dans les tests HTTP de non-regression.
- **SC-004**: 100% des lectures publiques produits/offres testees passent par repositories et excluent les produits/offres non publics, desactives, non valides ou expires.
- **SC-005**: 100% des soumissions quote consenties testees persistent `Prospect`, `ConsentRecord` et `QuoteRequest` via repositories.
- **SC-006**: 100% des soumissions quote sans consentement testees produisent 0 routage, 0 notification broker et 0 assignment.
- **SC-007**: 100% des lectures Starter leads testees proviennent de `LeadAssignmentsRepository` et respectent le tenant.
- **SC-008**: 100% des lectures CRM testees proviennent de repositories lead/CRM et refusent Starter ainsi que `broker_crm_enabled` false ou absent.
- **SC-009**: 100% des cas de routage testes conservent les blockers existants: consentement, pays/produit, offre, partenaire actif, autorisation, licence et quota/capacite.
- **SC-010**: 100% des actions sensibles testees produisent un `AuditLog` durable consultable par un acteur admin autorise.
- **SC-011**: Une base fraiche peut etre reconstruite par les migrations et valider le schema requis pour les domaines extraits.
- **SC-012**: Les tests HTTP de non-regression des comportements 002, 003, 004 et 008 restent verts ou documentent une correction compatible et approuvee.
- **SC-013**: Les tests guardrails detectent toute nouvelle source de verite memoire dans les domaines extraits.
- **SC-014**: Typecheck, lint, build et suites de tests applicables passent lors de l'implementation future.

## Assumptions

- Les specs 001 a 004 ont etabli les fonctionnalites metier principales; 007 a introduit ou renforce Prisma, Redis, BullMQ, audit, feature flags, config et migrations; 008 a introduit les vrais controllers NestJS et reduit la dependance HTTP directe a `RuntimeHttpController`.
- Cette spec part de l'etat apres 008: les routes prioritaires sont mieux cablees, mais la facade `AssurMatchRuntime` et plusieurs services portent encore de l'etat memoire de transition.
- Le schema Prisma existant contient deja la plupart des modeles necessaires; les migrations nouvelles doivent rester exceptionnelles et justifiees.
- Les routes et contrats existants sont preferes et doivent rester compatibles.
- Les implementations memoire restent utiles pour tests unitaires, mais ne sont pas un mode runtime normal.
- Les packages partages peuvent etre ajustes pour types et contrats existants, pas pour ajouter de nouvelles capacites metier.
- Les frontends ne recoivent pas de nouveaux ecrans; tout ajustement frontend est limite a compatibilite de contrat si necessaire.

## Risks

- Des services existants peuvent melanger regles metier et stockage memoire; l'extraction doit eviter de deplacer les regles sensibles dans les repositories.
- Les dependencies cycles peuvent apparaitre lorsque les modules remplacent la composition manuelle de `AssurMatchRuntime`.
- Les tests existants peuvent dependre de seeds memoire; ils devront etre adaptes vers fixtures repository ou modules test explicites.
- Les transactions quote/consent/prospect/routing peuvent reveler des incoherences de schema ou d'ordre d'ecriture non visibles avec tableaux memoire.
- Les filters tenant/plan/flag peuvent etre dupliques entre service et repository si la frontiere n'est pas claire.
- Les migrations tardives peuvent casser reconstruction base fraiche si elles ne suivent pas les conventions Prisma du projet.
- Le refus de fallback memoire en runtime normal peut faire apparaitre des configurations locales incompletes.
- Une suppression trop rapide de `AssurMatchRuntime` peut casser des routes non encore couvertes; la transition doit rester progressive et testee.

## Out Of Scope

- Nouvelles fonctionnalites metier.
- Nouveaux ecrans frontend, refonte UI ou landing page.
- Paiement, encaissement de prime, souscription, emission de police, emission d'attestation, signature electronique et sinistres.
- API assureur avancee, webhooks avances, white label, facturation complete ou routage multi-broker avance non deja prevu.
- IA avancee, recommandation IA, decisioning IA ou activation de modules IA.
- Changement de stack, reecriture totale du backend ou suppression brutale de `AssurMatchRuntime`.
- Changement des regles de routing, pricing, eligibility, plans ou packages broker.
- Activation par defaut de CRM, paiements, e-signature, policy issuance, claims, insurer API ou flags IA sensibles.
- Generation de `plan.md`, generation de `tasks.md`, implementation ou commit automatique dans cette invocation.
