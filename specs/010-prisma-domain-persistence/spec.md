# Feature Specification: Prisma Domain Persistence AssurMatch

**Feature Branch**: `010-prisma-domain-persistence`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "Creer la specification technique 010-prisma-domain-persistence pour implementer progressivement de vrais repositories Prisma async pour les domaines metier critiques AssurMatch, remplacer les repositories transitionnels, persister durablement les donnees publiques, demandes de devis, prospects, consentements, leads et activites CRM en PostgreSQL. Ne genere pas le plan. Ne genere pas tasks.md. N'implemente rien."
**Validation State**: Draft
**Continuous Workflow Eligible**: No - cette invocation est limitee a la specification; le user a explicitement demande de ne pas generer le plan, les taches ni l'implementation.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette specification est technique et transversale. Elle rend durables des donnees et comportements deja prevus par les specs precedentes. Elle n'ajoute aucune vente directe, souscription, encaissement de prime, emission de police, attestation, sinistre, paiement, signature electronique, API assureur avancee, webhook avance, IA avancee ou conseil personnalise engageant par AssurMatch.
- **Impacted application(s)**: Backend API est le scope principal. Packages partages peuvent etre touches uniquement pour contrats, DTOs, types et helpers de tests existants. Web Publique Client et Back-office Partenaires/Plateforme ne recoivent pas de nouveaux ecrans; seules des adaptations de compatibilite contractuelle existante sont autorisees si necessaires.
- **Affected scopes**: Countries, Products, Offers, Prospects, ConsentRecords, QuoteRequests, LeadAssignments, RoutingDecisions, Partners, PartnerLicenses, CRMActivity, Notifications, AuditLogRepository, FeatureFlagRepository, services domaine, controllers existants, tests HTTP, tests unitaires, migrations, seeds et garde-fous runtime.
- **Frontend separation**: Les deux applications web restent separees applicativement. Les parcours visiteurs publics continuent d'appeler uniquement les routes publiques. Les parcours broker/admin restent authentifies, proteges par RBAC, plan, MFA lorsque requis et tenant isolation. Aucun layout, route, privilege, client auth back-office ou etat partenaire/admin ne doit etre embarque dans Web Publique Client.
- **Required feature flags**: Les flags existants restent applicables: `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, flags pays, flags produit, flags partenaire/plan si deja modelises, et flags IA existants. Les flags sensibles, notamment `broker_crm_enabled`, `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled` et flags IA sensibles, restent fermes par defaut lorsqu'absents, invalides ou illisibles.
- **Consent and transmission**: Un `ConsentRecord` durable, valide et scope par finalite, pays, produit, canal, version de texte et destinataire prevu est obligatoire avant toute transmission de lead. Une demande sans consentement ne doit creer aucun routage, aucune notification broker, aucun assignment et aucune persistance non conforme.
- **Partner license controls**: Les repositories Prisma doivent permettre aux services existants de verifier partenaire actif, autorisation pays/produit, plan, quota/capacite et licence valide, non expiree, non suspendue et non invalide avant activation, routage, lecture ou mutation de lead.
- **Audit and data history**: `AuditLogRepository` et `FeatureFlagRepository` sont deja Prisma-runtime et doivent rester durables. Les actions sensibles, refus de consentement/routage, mutations CRM, decisions de routage, notifications et changements d'etat doivent conserver les traces existantes avec acteur, action, cible, contexte, resultat, raison, timestamps et `correlationId` lorsque disponible.
- **Security and RBAC**: Les endpoints broker/admin conservent authentification, RBAC strict, MFA lorsque requis, tenant isolation, controle du plan, refus read-only, pagination/limites, masquage PII et erreurs non sensibles. Les repositories ne doivent pas fournir de lecture ou mutation cross-tenant par defaut.
- **Routing impact**: Les regles de routage existantes ne changent pas. La spec rend durables les lectures d'eligibilite et les ecritures de decisions/assignments, sans assouplir les blockers: consentement absent, pays/produit desactive, offre expiree ou indisponible, courtier inactif, non autorise, licence invalide/expiree, quota/capacite ou regle de routage non satisfaite.
- **AI impact**: Aucun nouvel usage IA et aucun appel modele nouveau. Les flags IA restent fermes par defaut et cette spec ne doit pas activer recommandation, scoring avance, assistant broker avance ou decision automatisee.
- **UX/content restrictions**: Aucun nouveau contenu public n'est introduit. Les contrats publics existants doivent continuer a presenter les offres et prix comme indicatifs et a eviter les formulations interdites comme "acheter maintenant", "souscrire maintenant", "contrat valide" ou equivalents.
- **Workflow continuity**: Apres validation explicite et absence de marqueur de clarification, cette feature technique standard pourra passer a `/speckit.plan`, puis `/speckit.tasks`, puis `/speckit.implement`, sauf conflit constitutionnel, risque securite/conformite/donnees, activation interdite, decision produit non couverte ou validation bloquante. Aucun commit automatique apres implementation sans demande explicite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resoudre les repositories critiques en Prisma runtime (Priority: P1)

Une equipe technique demarre le backend hors test et constate que les domaines metier critiques utilisent des implementations Prisma asynchrones completes, tandis que les adapters memoire restent reserves aux tests.

**Why this priority**: La spec 009 a etabli les ports et les adapters memoire test-only; la production ne doit plus reposer sur des implementations transitionnelles pour les domaines critiques.

**Independent Test**: Demarrer le backend en environnement runtime normal et verifier que chaque repository prioritaire se resout en implementation `prisma-runtime`, puis tenter de lier un adapter memoire hors test et verifier l'echec.

**Acceptance Scenarios**:

1. **Given** le backend demarre hors test, **When** les repositories domaine critiques sont resolus, **Then** ils utilisent des implementations Prisma reelles.
2. **Given** `NODE_ENV` n'est pas `test`, **When** un adapter memoire est tente pour un domaine production, **Then** le demarrage echoue ou le garde-fou echoue avec un message explicite.
3. **Given** un repository Prisma runtime prioritaire, **When** une methode publique est appelee, **Then** elle execute une operation durable ou retourne un resultat valide sans lancer "requires async Prisma service integration", TODO ou non implemente.
4. **Given** une suite unitaire isolee, **When** elle utilise un adapter memoire explicitement test-only, **Then** cet usage reste autorise et borne au test.

---

### User Story 2 - Servir le catalogue public depuis PostgreSQL (Priority: P1)

Un visiteur consulte les pays, produits et offres existants; les donnees viennent de la persistance durable et les filtres publics continuent de respecter flags, statuts, validite et positionnement indicatif.

**Why this priority**: Le catalogue public est un parcours visiteur essentiel et ne doit pas dependre d'une memoire de processus ou d'un seed transitionnel non durable.

**Independent Test**: Preparer pays, produits et offres dans une base de test, appeler les routes publiques existantes, puis verifier que les reponses correspondent aux donnees persistantes et excluent les elements non publics.

**Acceptance Scenarios**:

1. **Given** un visiteur consulte les pays, **When** `GET /countries` est appele, **Then** les donnees viennent de PostgreSQL via Prisma.
2. **Given** un visiteur consulte les produits d'un pays, **When** `GET /countries/:countryCode/products` est appele, **Then** les donnees viennent de PostgreSQL via Prisma.
3. **Given** un visiteur consulte les offres d'un produit, **When** `GET /countries/:countryCode/products/:productKey/offers` est appele, **Then** les donnees viennent de PostgreSQL via Prisma.
4. **Given** une offre expiree, retiree, suspendue ou non validee publiquement, **When** les offres publiques sont consultees, **Then** elle n'est pas exposee comme disponible.
5. **Given** un pays ou produit desactive par flag, **When** un endpoint public le consulte, **Then** la reponse respecte le contrat existant sans exposer de donnees broker/admin.

---

### User Story 3 - Persister durablement une demande de devis consentie (Priority: P1)

Un visiteur soumet une demande de devis avec consentement; le systeme persiste prospect, consentement, demande et assignment initial lorsque le routage est eligible, sans changer les regles metier existantes.

**Why this priority**: Consentement, demande et lead sont des donnees critiques et opposables; leur durabilite conditionne conformite, audit, support et routage responsable.

**Independent Test**: Appeler `POST /quote-requests` avec un payload valide et un consentement explicite, puis verifier durablement `Prospect`, `ConsentRecord`, `QuoteRequest`, `RoutingDecision`, `LeadAssignment` et `AuditLog` selon le resultat attendu.

**Acceptance Scenarios**:

1. **Given** un visiteur soumet une demande avec consentement, **When** `POST /quote-requests` est appele, **Then** `Prospect`, `ConsentRecord`, `QuoteRequest` et `LeadAssignment` sont persistants durablement lorsque le routage aboutit.
2. **Given** une demande sans consentement, **When** `POST /quote-requests` est appele, **Then** aucune creation non conforme n'est persistee.
3. **Given** une demande sans courtier eligible, **When** le routage est evalue, **Then** la demande reste non transmise, une decision de refus est conservee et aucun courtier non eligible n'est notifie.
4. **Given** une erreur apres creation partielle dans un flux multi-entites, **When** la transaction echoue, **Then** aucun etat incoherent prospect/consentement/demande/assignment n'est laisse durablement.
5. **Given** une action sensible reussit ou est refusee, **When** l'audit est consulte, **Then** un `AuditLog` durable existe.

---

### User Story 4 - Lire et muter les leads broker depuis Prisma (Priority: P1)

Un courtier Starter consulte ses leads, et un courtier Pro consulte ou agit dans le CRM; les donnees proviennent des repositories Prisma et respectent tenant, role, plan, flags et read-only.

**Why this priority**: Les leads et activites CRM contiennent des donnees personnelles et commerciales sensibles; la persistance durable ne doit pas affaiblir l'isolation partenaire ni les droits.

**Independent Test**: Creer des leads et activites CRM persistants pour plusieurs tenants, appeler les routes Starter et CRM avec acteurs distincts, puis verifier isolation, plan, flags, RBAC, audit et source durable.

**Acceptance Scenarios**:

1. **Given** un courtier Starter consulte ses leads, **When** `GET /broker/starter/leads` est appele, **Then** les leads viennent de PostgreSQL via Prisma et respectent le tenant.
2. **Given** un courtier Pro consulte le CRM, **When** `GET /broker/crm/leads` est appele, **Then** les leads viennent de PostgreSQL via Prisma et respectent plan, tenant, role et flags.
3. **Given** une action CRM cree une note, tache, rappel ou changement de statut, **When** l'action reussit, **Then** l'activite CRM est persistante durablement.
4. **Given** un Starter ou un Pro sans `broker_crm_enabled`, **When** il tente d'acceder au CRM, **Then** l'acces est refuse par defaut et audite lorsque pertinent.
5. **Given** un courtier A tente de lire, muter ou exporter une ressource du courtier B, **When** la route ou le service est appele, **Then** l'acces est refuse sans confirmer l'existence de la ressource cible.

---

### User Story 5 - Persister routage, partenaires, licences et notifications (Priority: P1)

Le routage et les notifications existants s'appuient sur partenaires, licences, decisions et traces persistantes; aucune notification ou assignment interdit ne peut etre cree.

**Why this priority**: Le routage engage la conformite et la valeur commerciale; ses decisions, exclusions et notifications doivent etre durables et auditables.

**Independent Test**: Executer des cas de routage succes/refus avec partenaires et licences persistants, puis verifier `RoutingDecision`, `LeadAssignment`, `Notification`, `QueueJobRecord` et audits.

**Acceptance Scenarios**:

1. **Given** un partenaire actif, autorise et avec licence valide, **When** un lead consentant est eligible, **Then** le routage peut creer decision, assignment et notification persistants.
2. **Given** un partenaire inactif, non autorise ou a licence expiree, **When** le routage evalue le lead, **Then** ce partenaire est exclu et la raison est durablement tracee.
3. **Given** une notification est creee, **When** le job ou la trace est enregistre, **Then** elle est persistante durablement si le domaine est inclus.
4. **Given** le domaine notification est inclus mais la persistance durable echoue, **When** le service tente de tracer la notification, **Then** il ne bascule pas silencieusement en memoire.
5. **Given** un refus de routage constitutionnel, **When** les notifications sont inspectees, **Then** aucun courtier non eligible n'a ete notifie.

---

### User Story 6 - Reconstituer une base fraiche avec seeds minimaux (Priority: P2)

Une equipe prepare un environnement de developpement ou de test depuis zero; les migrations reconstruisent le schema complet et les seeds minimaux permettent les parcours existants sans activer de module interdit.

**Why this priority**: La durabilite reelle depend d'une base reconstructible et de fixtures explicites, pas de donnees implicites gardees en memoire.

**Independent Test**: Appliquer les migrations sur une base vide, generer le client, lancer les seeds minimaux et executer les tests publics, quote, Starter, CRM, audit, flags et guardrails.

**Acceptance Scenarios**:

1. **Given** les migrations sont appliquees sur une base fraiche, **When** la reconstruction est lancee, **Then** le schema complet est reconstructible.
2. **Given** les seeds minimaux sont appliques, **When** les parcours publics et broker de test sont executes, **Then** ils disposent des donnees necessaires sans dependance a un adapter memoire runtime.
3. **Given** les seeds runtime sont inspectes, **When** les flags sensibles sont absents ou initiaux, **Then** paiement, souscription, emission de police, attestation, signature electronique, sinistres, API assureur avancee et IA sensible restent desactives.
4. **Given** les validations finales sont lancees, **When** typecheck, lint, test, test:web, build, prisma validate, audit et git diff check s'executent, **Then** ils passent avant que l'implementation future soit consideree terminee.

### Edge Cases

- Pays public desactive, waitlist-only, quote-disabled ou comparison-disabled: les routes publiques doivent refuser, vider ou rediriger selon le contrat existant, sans transmission de lead.
- Produit desactive, quote-disabled, comparison-disabled, sensitive-data-disabled ou manual-review-required: les services doivent conserver les decisions existantes et persister l'etat resultant sans nouvelle fonctionnalite.
- Consentement manquant, refuse, expire, hors scope, mauvais texte, mauvaise finalite ou mauvais destinataire: aucun routage, aucun assignment, aucune notification broker et aucun etat non conforme persistant.
- Offre expiree, non validee, suspendue, retiree ou sponsorisee: elle ne doit pas etre exposee comme disponible; la sponsorisation doit rester visible si deja exposee.
- Courtier inactif, suspendu, retire, non autorise pays/produit, licence expiree/suspendue/invalide/revoquee ou quota/capacite bloque: exclusion de routage, pas de notification, raison tracee.
- `broker_crm_enabled` absent, false, stale ou source indisponible: CRM refuse par defaut, meme pour un courtier Pro/Enterprise.
- Role sans permission, MFA manquante, acteur invalide, role read-only ou tenant absent: routes broker/admin refusees avec erreurs non sensibles et audit lorsque l'action est sensible.
- Cross-tenant broker: aucun repository ne doit retourner une ressource hors tenant par defaut; les refus ne confirment pas l'existence de la ressource cible.
- Repository Prisma incomplet: aucune methode runtime prioritaire ne doit lancer un message TODO, non implemente ou "requires async Prisma service integration".
- Schema ou migration insuffisant: l'implementation future doit ajouter une migration limitee au comportement deja specifie, ou bloquer la feature jusqu'a correction.
- Audit durable indisponible pour une action critique: l'action doit echouer ferme ou produire un etat operationnel explicite deja prevu, jamais masquer le manque de preuve.
- Tests unitaires avec repositories memoire: autorises uniquement sous `NODE_ENV=test` ou module test explicitement nomme.
- API publique ou broker existante: routes et contrats de 002, 003, 004, 008 et 009 restent compatibles.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme DOIT rendre Prisma-runtime les repositories prioritaires suivants: Countries, Products, Offers, Prospects, ConsentRecords, QuoteRequests, LeadAssignments, RoutingDecisions, Partners, PartnerLicenses, CRMActivity et Notifications.
- **FR-002**: Chaque repository Prisma runtime DOIT etre asynchrone, complet pour les methodes du port existant et fonctionnel avec la source de verite durable.
- **FR-003**: Aucune methode Prisma runtime prioritaire NE DOIT lancer "requires async Prisma service integration", TODO, non implemente ou erreur equivalente.
- **FR-004**: Tout adapter Prisma incomplet NE DOIT PAS exister comme provider runtime; un repository doit etre completement fonctionnel ou absent du runtime.
- **FR-005**: Les adapters memoire DOIVENT rester disponibles uniquement pour tests unitaires, fixtures et modules explicitement test-only.
- **FR-006**: Le demarrage hors test DOIT echouer lorsqu'un domaine prioritaire tente de lier un adapter memoire en provider production.
- **FR-007**: Les repositories Prisma DOIVENT etre injectes par les modules domaine existants ou leurs successeurs, sans instanciation manuelle d'un client durable par les services metier.
- **FR-008**: Les services domaine DOIVENT etre adaptes pour consommer les ports async et propager correctement les operations asynchrones jusqu'aux controllers lorsque necessaire.
- **FR-009**: Les controllers existants DOIVENT conserver leurs routes HTTP et contrats API, sauf correction compatible, justifiee et testee.
- **FR-010**: `GET /countries` DOIT lire les pays via `CountriesRepository` Prisma et appliquer statuts/flags publics existants.
- **FR-011**: `GET /countries/:countryCode/products` DOIT lire les produits via `ProductsRepository` Prisma, avec association pays/produit et flags applicables.
- **FR-012**: `GET /countries/:countryCode/products/:productKey/offers` DOIT lire les offres via `OffersRepository` Prisma et filtrer validite, statut, publication et disponibilite.
- **FR-013**: `POST /quote-requests` DOIT persister `Prospect`, `ConsentRecord` et `QuoteRequest` via repositories Prisma lorsque la demande est valide et consentie.
- **FR-014**: `POST /quote-requests` DOIT empecher toute creation non conforme lorsque le consentement valide est absent ou hors scope.
- **FR-015**: Le flux quote consentie DOIT utiliser une transaction ou un mecanisme equivalent pour eviter les etats partiels incoherents entre prospect, consentement, demande, routage et assignment.
- **FR-016**: Les decisions de routage DOIVENT etre persistantes via `RoutingDecisionsRepository` Prisma avec raisons de succes/refus, candidats exclus et `correlationId` lorsque disponible.
- **FR-017**: Les assignments de lead DOIVENT etre persistants via `LeadAssignmentsRepository` Prisma et consultables uniquement dans le scope tenant autorise.
- **FR-018**: Les lectures Starter DOIVENT provenir de `LeadAssignmentsRepository` Prisma et conserver les limites fonctionnelles du plan Starter.
- **FR-019**: Les lectures et mutations CRM DOIVENT provenir de `LeadAssignmentsRepository` et `CRMActivityRepository` Prisma et respecter plan, role, tenant, flags et read-only.
- **FR-020**: Les notes, taches, rappels, changements de statut et historiques CRM DOIVENT etre persistants durablement lorsqu'une action reussit.
- **FR-021**: Les repositories `PartnersRepository` et `PartnerLicensesRepository` DOIVENT fournir les donnees necessaires aux controles d'eligibilite, autorisation, plan, quota/capacite et licence.
- **FR-022**: `NotificationsRepository` DOIT persister les notifications et traces de jobs incluses dans cette spec sans modifier les canaux ou capacites notification existants.
- **FR-023**: `AuditLogRepository` et `FeatureFlagRepository` DOIVENT rester Prisma-runtime et ne doivent pas regresser vers une implementation memoire en runtime normal.
- **FR-024**: Les feature flags persistants DOIVENT rester la source de verite runtime; les flags sensibles restent fail-closed lorsque la lecture echoue, est absente ou invalide.
- **FR-025**: Les tests DOIVENT prouver que les donnees publiques, demandes, prospects, consentements, leads, activites CRM, notifications, audit et flags viennent de la persistance durable dans les scenarios runtime.
- **FR-026**: Les migrations Prisma DOIVENT etre ajoutees uniquement si le schema existant est insuffisant pour persister un comportement deja couvert par les specs precedentes.
- **FR-027**: Les seeds minimaux DOIVENT fournir les donnees de developpement et tests necessaires sans activer de fonctionnalite exclue ou reglementee interdite.
- **FR-028**: La reconstruction d'une base fraiche DOIT etre validee par migrations, generation/validation schema et tests pertinents.
- **FR-029**: Les tests HTTP publics, quote requests, Starter, CRM, consentement, tenant isolation, feature flags, audit durable et contrats API DOIVENT etre adaptes aux repositories Prisma.
- **FR-030**: Les garde-fous DOIVENT detecter les adapters Prisma incomplets et les adapters memoire utilises hors test.
- **FR-031**: La documentation technique de la feature DOIT identifier les domaines effectivement Prisma-runtime apres implementation future.
- **FR-032**: Le systeme NE DOIT PAS ajouter de nouvelle fonctionnalite metier, nouveau parcours frontend, paiement, souscription, emission de police, attestation, signature electronique, sinistre, IA avancee, API assureur avancee, webhook avance, facturation complete ou white label.

### Non-Functional Requirements

- **NFR-001**: Les repositories Prisma doivent etre testables isolément par domaine et integrables dans les tests HTTP sans dependance a l'ordre d'execution global.
- **NFR-002**: Les erreurs publiques doivent rester non sensibles et ne jamais exposer details tenant, broker non selectionne, licence, regle interne ou presence d'une ressource cross-tenant.
- **NFR-003**: Les listes publiques, broker et admin doivent rester bornees ou paginees selon les contrats existants.
- **NFR-004**: Les endpoints publics ne doivent pas executer de traitement lourd synchrone nouveau; notification et traitements asynchrones restent delegues aux mecanismes existants.
- **NFR-005**: Les donnees critiques doivent conserver `createdAt`, `updatedAt`, `createdBy` lorsque applicable, references stables, retention et historique deja modelises.
- **NFR-006**: Les operations multi-entites critiques doivent privilegier atomicite, idempotence ou compensation explicite selon le comportement existant.
- **NFR-007**: Les tests repositories, services et HTTP doivent etre reproductibles localement et en CI avec donnees de test isolees.
- **NFR-008**: Les migrations doivent permettre une reconstruction deterministe d'une base vide et ne pas dependre de donnees memoire preexistantes.
- **NFR-009**: Les seeds runtime doivent rester minimaux, explicites et fermer par defaut les flags sensibles.
- **NFR-010**: L'extraction doit rester progressive par domaine; aucune reecriture totale du backend n'est requise ni acceptee.

### Domains Concerned

- **Public catalog**: Countries, Products, CountryProduct associations, Offers and public offer validity.
- **Quote intake**: Prospects, ConsentRecords, QuoteRequests, quote status and public reference.
- **Routing and leads**: RoutingDecisions, LeadAssignments, LeadActionHistory, partner eligibility and refusal reasons.
- **Partner compliance**: Partners, Partner authorizations, PartnerLicenses, status, plan, quota and capacity.
- **Broker Starter**: Starter lead list, detail, actions, minimal history and notifications.
- **Broker CRM**: CRM lead state, pipeline history, notes, tasks, reminders, documents, proposals, disputes and status changes already modeled.
- **Notifications**: Notification records and job traces already included in existing behavior.
- **Support domains**: AuditLogRepository and FeatureFlagRepository, already Prisma-runtime, must remain durable and aligned with the new guardrails.

### Repositories To Make Prisma-Runtime

- **CountriesRepository**: list public countries, lookup by code, admin-safe reads, status/flag fields and timestamps.
- **ProductsRepository**: list products by country, lookup by key, country/product association, product flags, sensitivity and manual review metadata.
- **OffersRepository**: list offers by country/product, validate availability, status/publication/validity, sponsorship metadata and offer history where existing.
- **ProspectsRepository**: create or link prospect, contact fingerprints, PII-safe lookup, retention and consent relationships.
- **ConsentRecordsRepository**: create consent proof, validate scope, link consent text/version, purpose, channel, recipient and timestamp.
- **QuoteRequestsRepository**: create quote request, public reference/status, duplicate/routing/status updates, refusal state and admin-safe reads already exposed.
- **LeadAssignmentsRepository**: create assignment, list by tenant, detail by tenant, update status/action, active counts and minimal lead history.
- **RoutingDecisionsRepository**: persist success/refusal decisions, excluded candidates, reasons, quote request link and correlation id.
- **PartnersRepository**: read partner tenant, status, plan, capacities, quotas and country/product authorizations needed by routing and broker reads.
- **PartnerLicensesRepository**: read and verify license status, expiration, country/product scope, suspension/invalidation and compliance metadata.
- **CRMActivityRepository**: persist CRM lead state, pipeline history, notes, tasks, reminders, documents, proposals, disputes and action metadata already in scope.
- **NotificationsRepository**: persist notification records, delivery status, retry metadata, payload references, job trace links and admin-safe reads if already exposed.
- **AuditLogRepository**: already Prisma-runtime; must remain durable and participate in guardrails.
- **FeatureFlagRepository**: already Prisma-runtime; must remain durable, cached only as designed, and fail closed for sensitive flags.

### Prisma And Migration Impact

- Le schema Prisma existant doit etre analyse avant implementation pour verifier la couverture des domaines prioritaires.
- Les migrations sont autorisees seulement pour combler un champ, index, relation ou contrainte necessaire a un comportement deja specifie.
- Les migrations ne doivent pas introduire de nouveau module metier, de nouveau flux public ou d'activation reglementee.
- Les indexes doivent couvrir les lectures publiques pays/produits/offres, references publiques quote, queries tenant leads/CRM, statut licence, decisions de routage, notifications et audits lorsque necessaire.
- Les champs JSON, enum, date, decimal et PII doivent etre mappes de facon explicite afin de preserver les contrats API existants.
- Les seeds minimaux doivent separer donnees runtime de developpement et fixtures de tests.
- Les seeds ne doivent pas activer paiement, souscription, policy issuance, attestation, e-signature, claims, insurer API, IA avancee ou flags sensibles par accident.

### Service And Controller Impact

- Les services de catalogue doivent devenir async lorsque leurs repositories le sont, sans changer les contrats publics.
- Le service de soumission quote doit orchestrer repositories async pour prospect, consentement, demande, routage, assignment, audit et notification.
- Les services de routage doivent continuer a porter les decisions metier et utiliser les repositories pour lire eligibilite et persister resultats.
- Les services Starter doivent lire et muter les leads via repositories tenant-scopes.
- Les services CRM doivent lire et muter etats/activites via repositories Prisma tout en conservant controles plan/flag/RBAC.
- Les services notifications doivent tracer durablement les notifications et jobs inclus dans le scope.
- Les controllers doivent uniquement s'adapter a l'asynchrone si necessaire et rester fins.
- Les DTOs, schemas de validation et response shapes existants doivent etre preserves sauf correction compatible et documentee.

### Test Requirements

- Les tests DOIVENT couvrir les repositories Prisma de chaque domaine prioritaire.
- Les tests DOIVENT couvrir les adapters memoire test-only et leur usage autorise en tests unitaires.
- Les tests DOIVENT verifier que les adapters memoire sont interdits hors test.
- Les tests DOIVENT verifier qu'aucun repository Prisma runtime prioritaire ne contient de methode TODO, non implemente ou "requires async Prisma service integration".
- Les tests HTTP publics DOIVENT couvrir pays, produits et offres depuis persistance durable.
- Les tests HTTP quote requests DOIVENT couvrir soumission consentie, absence de consentement, pays/produit desactive, doublon/spam/manual review si deja en scope et audit.
- Les tests HTTP broker Starter DOIVENT couvrir liste/detail/actions leads depuis Prisma, tenant isolation et limites Starter.
- Les tests HTTP CRM DOIVENT couvrir liste/detail/kanban/status/notes/tasks/reminders selon routes existantes, plan, flags, RBAC, read-only et tenant isolation.
- Les tests DOIVENT couvrir consentement obligatoire et absence de creation non conforme.
- Les tests DOIVENT couvrir feature flags persistants et fail-closed des flags sensibles.
- Les tests DOIVENT couvrir audit durable pour refus et actions sensibles.
- Les tests DOIVENT couvrir migrations, reconstruction base fraiche, seed minimal et Prisma validate.
- Les tests DOIVENT couvrir non-regression des contrats API existants.
- Les validations finales futures DOIVENT inclure typecheck, lint, test, test:web, build, prisma validate, audit et git diff check.

### Key Entities *(include if feature involves data)*

- **Country**: Pays public/admin avec code, statut, flags, regime, dates et source durable.
- **Product**: Produit avec key, statut, flags, sensibilite, manual review et association pays.
- **Offer**: Offre indicative avec statut, validite, sponsorisation, priorite et historique existant.
- **Prospect**: Contact prospect avec fingerprints, PII minimale, retention et liens de consentement/demandes.
- **ConsentRecord**: Preuve de consentement avec finalite, texte/version, pays, produit, canal, destinataire et timestamp.
- **QuoteRequest**: Demande publique avec reference stable, statut, payload minimal, prospect, consentement, refus/routage et retention.
- **LeadAssignment**: Attribution broker avec tenant, statut, dates, actions, historique minimal et metadata CRM.
- **RoutingDecision**: Decision ou refus de routage avec raisons, candidats, quote request, assignment eventuel et correlation id.
- **Partner**: Tenant partenaire avec statut, plan, quotas, capacite et autorisations pays/produit.
- **PartnerLicense**: Licence avec statut, expiration, pays/produits couverts, suspension/invalidation et preuve compliance.
- **CRMActivity**: Etat CRM, pipeline, notes, tasks, reminders, documents, proposals, disputes et historiques deja prevus.
- **Notification**: Trace de notification avec canal existant, statut, retries, payload reference, job et lien audit lorsque disponible.
- **FeatureFlag**: Activation persistante globale, pays, produit, partenaire, plan et sensible fail-closed.
- **AuditLog**: Preuve durable d'action sensible ou refus avec acteur, action, cible, contexte, resultat et correlation id.
- **RepositoryRuntimeGuard**: Garde-fou distinguant repository `prisma-runtime` et adapter `memory-test`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% des repositories prioritaires listes dans cette spec se resolvent en implementations Prisma runtime completes au demarrage backend hors test.
- **SC-002**: 0 methode Prisma runtime prioritaire ne lance TODO, non implemente ou "requires async Prisma service integration" dans les suites de tests.
- **SC-003**: 0 adapter memoire prioritaire ne peut etre utilise hors `NODE_ENV=test` sans echec de demarrage ou echec de garde-fou.
- **SC-004**: 100% des tests HTTP publics pays, produits et offres utilisent des donnees persistantes et excluent les donnees non publiques, desactivees ou expirees.
- **SC-005**: 100% des soumissions quote consenties testees persistent durablement `Prospect`, `ConsentRecord` et `QuoteRequest`; les assignments sont persistants lorsque le routage aboutit.
- **SC-006**: 100% des soumissions quote sans consentement testees produisent 0 routage, 0 assignment, 0 notification broker et 0 persistance non conforme.
- **SC-007**: 100% des lectures Starter leads testees proviennent de Prisma et respectent le tenant.
- **SC-008**: 100% des lectures CRM testees proviennent de Prisma et respectent plan, tenant, role et flags.
- **SC-009**: 100% des actions CRM reussies testees persistent une activite ou un changement d'etat durable.
- **SC-010**: 100% des cas de routage testes conservent les blockers existants: consentement, pays/produit, offre, partenaire actif, autorisation, licence et quota/capacite.
- **SC-011**: 100% des actions sensibles et refus critiques testes produisent un audit durable ou echouent ferme si l'audit requis est indisponible.
- **SC-012**: Une base fraiche peut etre reconstruite avec migrations et seeds minimaux, puis executer les tests publics, quote, Starter, CRM, flags et audit.
- **SC-013**: Les validations finales futures passent: typecheck, lint, test, test:web, build, prisma validate, audit et git diff check.
- **SC-014**: 0 route publique charge un etat, privilege, layout ou politique d'acces back-office; 0 route back-office devient accessible depuis le public.
- **SC-015**: 0 fonctionnalite exclue ou module reglemente interdit n'est active par cette persistence.

## Assumptions

- La spec 007 a deja durci Prisma, Redis, BullMQ, audit, feature flags et migrations.
- La spec 008 a introduit de vrais controllers NestJS et les routes HTTP existantes doivent rester preservees.
- La spec 009 a introduit les ports repositories domaine et adapters memoire test-only; le commit `d44864d` a fige cette etape transitionnelle.
- `AuditLogRepository` et `FeatureFlagRepository` sont deja Prisma-runtime; cette spec les protege contre regression et les aligne avec les garde-fous.
- Le schema Prisma actuel couvre une partie importante des domaines prioritaires, mais des migrations limitees peuvent etre necessaires pour rendre les repositories complets.
- Les adapters memoire restent utiles pour tests unitaires et ne doivent pas etre supprimes brutalement.
- Les routes et contrats API existants sont la reference et ne changent que si une correction compatible est indispensable.
- Cette spec documente une migration technique de persistance; elle n'approuve pas l'activation de nouveaux pays, produits, offres, plans, paiements, souscriptions, attestations, signatures, sinistres ou IA avancee.

## Risks

- Certains ports issus de 009 peuvent ne pas couvrir toutes les operations necessaires aux services existants; les etendre peut creer des impacts sur tests et contrats.
- Des services peuvent encore melanger decision metier et stockage transitionnel; le passage async peut introduire des regressions si les responsabilites ne restent pas claires.
- Les transactions quote/consent/prospect/routing peuvent reveler des incoherences de schema non visibles avec adapters memoire.
- Les filtres tenant/plan/flag peuvent etre appliques a plusieurs niveaux; une frontiere floue augmente le risque cross-tenant.
- Les migrations peuvent devenir trop larges si l'analyse de schema n'est pas disciplinee.
- Les tests existants peuvent dependre de seeds memoire implicites et devront etre stabilises avec fixtures durables.
- Les notifications et jobs peuvent etre traces durablement sans que leur livraison doive devenir synchrone; confondre trace et delivery pourrait ralentir les endpoints publics.
- Refuser les adapters memoire hors test peut faire apparaitre des configurations locales incompletes, ce qui est voulu mais peut necessiter une documentation claire.

## Out Of Scope

- Nouvelles fonctionnalites metier.
- Nouveaux ecrans frontend, refonte UI ou landing page.
- Paiement, encaissement de prime, souscription, emission de police, emission d'attestation, signature electronique et sinistres.
- API assureur avancee, webhooks avances, white label, facturation complete ou routage multi-broker avance non deja prevu.
- IA avancee, recommandation IA, decisioning IA ou activation de modules IA.
- Changement de stack, reecriture totale du backend ou suppression brutale des adapters memoire de test.
- Changement des routes HTTP existantes sauf correction compatible et justifiee.
- Changement des regles metier de routing, pricing, eligibility, plans ou packages broker.
- Activation par defaut de CRM, paiements, e-signature, policy issuance, claims, insurer API ou flags IA sensibles.
- Generation de `plan.md`, generation de `tasks.md`, implementation ou commit automatique dans cette invocation.
