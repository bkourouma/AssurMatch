# Feature Specification: Preproduction Launch Readiness AssurMatch

**Feature Branch**: `013-preproduction-launch-readiness`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "Creer la specification technique et operationnelle 013-preproduction-launch-readiness pour AssurMatch. Preparer un environnement staging puis un lancement pilote controle: configuration, deploiement, variables d'environnement, base PostgreSQL, Redis/BullMQ, securite, feature flags, donnees initiales, comptes pilotes, monitoring, logs, sauvegardes, runbooks, checklist de lancement, validation conformite. Ne pas ajouter de fonctionnalite metier. Respecter strictement la constitution. Ne genere pas le plan, ne genere pas tasks.md, n'implemente rien."
**Validation State**: Draft
**Continuous Workflow Eligible**: No - cette invocation est limitee a la specification; l'utilisateur a explicitement demande de ne pas generer le plan, les taches ni l'implementation. La continuation /speckit.plan -> /speckit.tasks -> /speckit.implement reste possible apres validation explicite, mais cette feature est sensible (mise en preproduction, exposition externe, secrets, conformite) et requiert une validation produit/conformite avant tout enchainement automatique.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette specification prepare un environnement staging puis un pilote controle. Elle ne change PAS le positionnement: AssurMatch reste plateforme technique. Aucune vente directe, aucune souscription directe, aucun encaissement de prime, aucune emission de police, aucune attestation, aucune signature electronique, aucun sinistre, aucun conseil personnalise engageant. Les offres restent indicatives. Devis fermes et souscriptions relevent uniquement des courtiers/assureurs agrees.
- **Impacted application(s)**: Backend API (configuration, runtime, sante, logs, scripts, smoke), Web Publique Client (URL API, domaine public, SSL, parcours visiteur), Back-office Partenaires/Plateforme (URL API, domaine, auth, comptes admin/courtiers pilotes, RBAC), Base PostgreSQL (instance staging, migrations, seed, sauvegardes, restauration), Redis/BullMQ (configuration, sante, queues, monitoring), packages partages si necessaire, scripts/CI deployment si applicable.
- **Affected scopes**: Environnements `local`, `runtime-smoke`, `staging`, et reservation conceptuelle pour un futur `production`. 1 pays pilote (par defaut Cote d'Ivoire si confirme), 1 a 2 produits pilotes, 1 a 3 partenaires courtiers pilotes (Starter/Pro), comptes admin pilotes (Super Admin, Admin Pays, Compliance Admin, Support Admin) et comptes courtiers pilotes. Roles broker (Owner Starter, Owner Pro, Manager, Agent, Read-only) et roles admin sont concernes par les seeds et la verification d'acces.
- **Frontend separation**: Les deux applications web (publique et back-office) DOIVENT rester separees applicativement. Les domaines, routes, layouts, env vars et CORS DOIVENT etre distincts. Cette spec exige des URL API et des domaines distincts pour `apps/public/` et `apps/admin/` et `apps/broker/`. Aucun pont d'authentification ni partage de session entre public et back-office.
- **Required feature flags**: La spec definit la matrice de flags pour staging et le pilote. Par defaut fermes (fail-closed): `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, `ai_lead_scoring_enabled`, `ai_summary_enabled`, `ai_recommendation_enabled`, `ai_broker_assistant_enabled`, `multi_broker_routing_enabled`, `whatsapp_enabled`, `sponsored_offers_enabled`, `billing_enabled`. A activer explicitement (apres validation): `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled` (peut rester ferme jusqu'a validation), `country_public_enabled` pour 1 pays pilote, `product_public_enabled` pour 1 ou 2 produits pilotes.
- **Consent and transmission**: Aucune transmission de demande sans `ConsentRecord` valide. Les textes de consentement DOIVENT etre publies pour le pays/produit pilote avant activation publique. La spec exige un seed des textes de consentement et une verification smoke qu'un POST /quote-requests sans consentement est refuse.
- **Partner license controls**: Toutes les licences des courtiers pilotes DOIVENT etre valides, datees, scopees au pays/produit autorise et chargees en base avant l'activation publique. Le routage DOIT bloquer toute licence expiree, suspendue ou invalide. La spec exige un test smoke "licence expiree => exclusion".
- **Audit and data history**: AuditLog DOIT etre durable (Prisma-runtime) sur staging. Les actions sensibles DOIVENT etre auditees: changements de feature flag, activation de pays/produit/partenaire, changements de licence, refus de routage, refus RBAC, acces dashboard admin, refus consentement. Les `createdAt`/`updatedAt`/`createdBy` DOIVENT etre presents sur les entites critiques.
- **Security and RBAC**: HTTPS obligatoire, CORS strict, cookies securises (HttpOnly, Secure, SameSite), rate limiting actif, anti-spam actif, validation DTO (zod) active, RBAC strict, MFA admin obligatoire, MFA broker selon role, headers de securite (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy), logs sans PII inutile, exports controles, secrets hors Git, backups chiffres si possible.
- **Routing impact**: Aucun changement de regles de routage. La spec exige seulement que les regles existantes soient testees en staging: consentement, activation pays/produit, autorisation partenaire, validite licence, quotas, decision tracee.
- **AI impact**: Aucune fonctionnalite IA activee en staging ni en pilote. Tous les flags IA restent fermes. La spec interdit explicitement l'activation de scoring IA, resume IA, recommandation IA, assistant broker IA durant le pilote.
- **UX/content restrictions**: Le pilote DOIT afficher: "AssurMatch est une plateforme technique de comparaison", "AssurMatch n'est ni courtier ni assureur", "offre indicative", "prix a confirmer par le courtier partenaire". Aucune formulation interdite ("Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance du marche"). Mentions legales, politique de confidentialite, conditions d'utilisation, contact support/conformite DOIVENT etre publies avant activation publique.
- **Workflow continuity**: Cette spec EST sensible (mise en preproduction, exposition externe, secrets, conformite). L'enchainement automatique `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement` necessite une validation explicite produit/conformite avant chaque etape. Les decisions hebergeur, domaines, comptes pilotes, fournisseur SMTP/storage et procedures de backup DOIVENT etre tranchees au plan, pas decidees autonomement par Code AI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurer un environnement staging complet (Priority: P1)

L'equipe technique configure un environnement staging avec backend, application publique et back-office, base PostgreSQL et Redis dedies, secrets generes hors Git, domaines distincts et SSL actif.

**Why this priority**: Sans staging, le pilote ne peut pas etre teste de bout en bout dans des conditions proches de la production. La conformite exige une preuve de fonctionnement avant toute exposition publique.

**Independent Test**: Demarrer staging avec les variables documentees, executer la checklist smoke staging et confirmer que tous les services repondent aux health checks et que les domaines sont separes.

**Acceptance Scenarios**:

1. **Given** un environnement staging avec les variables obligatoires fournies, **When** le backend, l'application publique et le back-office demarrent, **Then** chaque service expose ses URLs et CORS conformes a la matrice documentee, sans credentials en clair dans les logs.
2. **Given** une base staging vide, **When** les migrations Prisma sont appliquees, **Then** le schema est cree sans erreur et `npx prisma validate` passe.
3. **Given** Redis et BullMQ disponibles en staging, **When** le backend demarre, **Then** les sondes de sante confirment la connexion et la file de notifications est prete.
4. **Given** SSL actif sur les domaines staging, **When** un client charge l'application publique ou le back-office, **Then** la reponse est servie en HTTPS avec un certificat valide.
5. **Given** les secrets sont stockes hors Git, **When** le repo est inspecte, **Then** aucun secret reel n'est present dans les fichiers committes.

---

### User Story 2 - Activer un pays/produit/partenaire pilote sous flags fermes par defaut (Priority: P1)

Un Super Admin active explicitement 1 pays pilote, 1-2 produits pilotes et 1-3 partenaires courtiers, avec licences valides, en respectant la fail-closed-par-defaut des flags sensibles.

**Why this priority**: Le pilote ne peut pas exposer un pays/produit/partenaire sans activation explicite tracable. Les invariants constitutionnels (consentement, licence, RBAC, audit) se verifient sur ce scope minimal.

**Independent Test**: Verifier qu'un visiteur ne voit rien d'un pays/produit tant que les flags ne sont pas explicitement actives, puis qu'apres activation par un admin authentifie, le parcours public est accessible et le routage tient compte des licences valides.

**Acceptance Scenarios**:

1. **Given** un pays pilote explicitement active, **When** un visiteur ouvre l'application publique, **Then** le pays apparait uniquement si `country_public_enabled=true` et le produit apparait uniquement si `product_public_enabled=true`.
2. **Given** un courtier pilote avec licence valide, **When** une demande de devis consentie est routee, **Then** le routage cree un `LeadAssignment` et un `RoutingDecision` durable.
3. **Given** un courtier pilote avec licence expiree, **When** le routage tente de lui transmettre un lead, **Then** il est exclu et un audit "license_expired" est cree.
4. **Given** les flags sensibles fermes par defaut (paiement, signature, emission, sinistres, IA recommandation, API assureur), **When** un Super Admin consulte les flags, **Then** chacun reste `false` dans la base staging fraichement initialisee.
5. **Given** des seeds staging clairement identifiables, **When** un admin liste les donnees, **Then** chaque pays/produit/offre/partenaire/licence est tague comme donnee staging et ne contient pas de PII reelle.

---

### User Story 3 - Verifier le parcours public consenti et le refus sans consentement (Priority: P1)

Un visiteur soumet une demande de devis avec consentement valide; un autre tente sans consentement.

**Why this priority**: Le consentement est un invariant constitutionnel. La preuve doit exister en staging avant toute exposition publique, meme limitee.

**Independent Test**: Executer deux POST /quote-requests, l'un avec consentement valide, l'autre sans, et verifier directement en base les entites creees ou absentes ainsi que les audits.

**Acceptance Scenarios**:

1. **Given** un visiteur fournit consentement valide, **When** il appelle `POST /quote-requests`, **Then** la demande est acceptee et `Prospect`, `ConsentRecord`, `QuoteRequest`, `LeadAssignment` (si courtier eligible) et `AuditLog` sont durables.
2. **Given** un visiteur ne fournit pas de consentement, **When** il appelle `POST /quote-requests`, **Then** la demande est refusee, aucun lead transmis n'est cree et le refus est trace si le comportement actuel le prevoit.
3. **Given** un texte de consentement publie pour le pays/produit pilote, **When** la demande est consentie, **Then** la version du texte est referencee dans `ConsentRecord`.
4. **Given** une absence de texte de consentement publie, **When** un visiteur tente une demande, **Then** la demande est refusee en amont du routage.

---

### User Story 4 - Acceder au back-office partenaire avec auth, RBAC, MFA et tenant isolation (Priority: P1)

Un courtier Starter ou Pro et un admin plateforme se connectent au back-office staging via auth + MFA, voient uniquement ce qu'ils sont autorises a voir et n'atteignent jamais les donnees d'un autre tenant ou d'un autre role.

**Why this priority**: La separation des surfaces et l'isolation tenant sont des invariants constitutionnels. La preuve doit exister sur staging avant toute distribution d'identifiants pilotes.

**Independent Test**: Tester chaque role (Owner Starter, Owner Pro, Manager, Agent, Read-only, Super Admin, Admin Pays, Compliance Admin, Support Admin, Finance Admin, Content Admin) sur les endpoints concernes; tenter des acces croises (broker -> admin, tenant A -> tenant B); verifier les refus et les audits.

**Acceptance Scenarios**:

1. **Given** un visiteur non authentifie, **When** il tente d'ouvrir une route back-office, **Then** l'acces est refuse et la route publique reste indemne.
2. **Given** un courtier Starter authentifie avec MFA, **When** il consulte ses leads et son dashboard, **Then** il voit uniquement son tenant et aucune donnee CRM Pro.
3. **Given** un courtier Pro avec `broker_crm_enabled=true`, **When** il accede au CRM, **Then** il voit son tenant uniquement; aucun autre tenant n'apparait quel que soit le parametre forge.
4. **Given** un courtier tente d'atteindre `/admin/dashboard`, **When** la requete arrive, **Then** elle est refusee 403 et auditee `dashboard.admin.refused`.
5. **Given** un Admin Pays scope a un pays X, **When** il interroge des donnees hors X, **Then** la requete est refusee ou bornee selon la regle, avec audit.

---

### User Story 5 - Operer staging via runbooks et monitoring (Priority: P2)

Un operateur utilise des runbooks documentes pour deployer staging, lancer migrations, lancer smoke tests, activer/desactiver pays/produit/partenaire/flag, gerer une licence expiree, restaurer un backup et tourner les secrets.

**Why this priority**: L'operabilite reduit le risque humain et accelere la reponse aux incidents. Sans runbooks, le pilote depend trop de la memoire des operateurs.

**Independent Test**: Suivre chaque runbook documente sur staging et confirmer le resultat attendu; documenter les ecarts.

**Acceptance Scenarios**:

1. **Given** une defaillance de deploiement staging, **When** l'operateur suit le runbook rollback, **Then** l'environnement revient a un etat stable connu sans perte de donnees protegees.
2. **Given** une migration Prisma a appliquer, **When** l'operateur suit le runbook migration, **Then** les migrations sont appliquees en staging et la sante systeme reste verte.
3. **Given** un pays a desactiver rapidement, **When** l'operateur suit le runbook desactivation, **Then** le flag `country_public_enabled` est mis a `false`, l'audit est cree et l'application publique cesse d'exposer le pays.
4. **Given** une licence courtier expiree, **When** l'operateur suit le runbook gestion licence, **Then** le partenaire est bloque pour le scope concerne et un audit est cree.
5. **Given** un besoin de rotation de secret, **When** l'operateur suit le runbook rotation, **Then** les secrets sont remplaces, les services redemarrent sans incident et les logs ne contiennent pas la valeur ancienne ni la nouvelle.

---

### User Story 6 - Sauvegardes et restauration verifiees (Priority: P2)

L'equipe technique configure une sauvegarde reguliere de PostgreSQL staging et execute un test de restauration au moins une fois.

**Why this priority**: Sans test de restauration, la sauvegarde n'est qu'une supposition. La conformite exige la preuve qu'un retour arriere est possible.

**Independent Test**: Declencher une sauvegarde, restaurer la base sur un environnement temporaire et verifier l'integrite des entites critiques (audit, consent, licences, leads).

**Acceptance Scenarios**:

1. **Given** une politique de sauvegarde definie pour staging, **When** une sauvegarde est declenchee, **Then** le fichier est produit, chiffre si possible, et stocke hors machine d'execution.
2. **Given** une sauvegarde recente, **When** une restauration test est executee sur un environnement separe, **Then** l'integrite des entites critiques est verifiee et documentee.
3. **Given** une retention definie, **When** une sauvegarde depasse la retention, **Then** elle est purgee selon la regle.

---

### User Story 7 - Checklist go/no-go pilote (Priority: P1)

Un responsable produit/conformite execute la checklist go/no-go avant toute activation publique pilote.

**Why this priority**: La checklist est le dernier filet de securite avant exposition externe. Elle doit bloquer le lancement si un invariant n'est pas verifie.

**Independent Test**: Parcourir la checklist sur staging et confirmer que chaque item critique est verifie ou que le go/no-go est bloque par un item en echec.

**Acceptance Scenarios**:

1. **Given** la checklist go/no-go, **When** un item critique echoue (tests, smoke, conformite, securite, backup, rollback, support), **Then** le lancement pilote est bloque et l'echec est documente.
2. **Given** tous les items critiques valides, **When** le responsable conformite valide explicitement, **Then** l'activation pilote du pays/produit pilote est autorisee, scopee et auditee.
3. **Given** une activation pilote effective, **When** un incident est detecte, **Then** le runbook desactivation est applicable et previsible.

---

### Edge Cases

- Variables d'environnement obligatoires absentes (DATABASE_URL, REDIS_URL, JWT_SECRET, SESSION_SECRET, API_BASE_URL, PUBLIC_APP_URL, BACKOFFICE_APP_URL, CORS_ORIGINS): les services DOIVENT refuser de demarrer avec un message clair sans exposer les valeurs presentes.
- DATABASE_URL pointant vers une base autre que staging (production, dev partage, smoke): les services DOIVENT refuser de demarrer ou refuser les seeds/migrations destructives.
- Migrations non appliquees ou schema drift: le backend DOIT refuser de demarrer en staging tant que `prisma migrate status` n'est pas vert.
- Redis indisponible: le backend DOIT degrader les fonctionnalites dependantes (cache flags, rate limiting, queues) en fail-closed sur les flags sensibles ou refuser de demarrer selon la criticite documentee.
- Cookies non securises ou HTTPS absent: la spec impose le refus de demarrer en staging sans HTTPS valide.
- CORS trop permissif (wildcard ou domaines hors liste): la spec impose un CORS strict par environnement.
- Comptes admin avec mot de passe par defaut: la spec interdit l'usage de mots de passe par defaut en staging et exige une rotation initiale.
- MFA admin desactivee: la spec interdit la desactivation de la MFA admin sur staging et production.
- Logs contenant PII brute, secrets, tokens, ou DATABASE_URL: la spec impose un masquage et une revue.
- Acces Web Publique Client tentant de charger un ecran back-office: la spec impose qu'aucune route back-office ne soit chargeable depuis la publique.
- Acces back-office tentant d'utiliser une route publique pour atteindre des donnees admin: la spec impose un refus.
- Pays/produit/partenaire active sans license valide: la spec impose le blocage avec audit.
- Texte de consentement non publie pour le scope pilote: la spec impose le blocage des demandes consenties pour ce scope.
- Notifications activees sans fournisseur SMTP/SMS configure: la spec impose la desactivation des notifications correspondantes ou la configuration explicite.
- Stockage documents (S3) configure mais credentials invalides: la spec impose la desactivation des documents ou un refus de demarrage selon la criticite.
- Sauvegarde non chiffree alors que requis par la politique: la spec impose un blocage et une remediation.
- Restauration test echouee: la spec impose un blocage du go/no-go.
- Domaines public et back-office partages ou mal configures: la spec impose des domaines distincts et une verification.
- Comptes pilotes Starter/Pro avec roles incorrects: la spec impose une revue RBAC.
- AuditLog non durable (memory-test detecte hors test): la spec impose un blocage immediat.
- Secrets dans le repo: la spec impose un blocage et une remediation (revocation + rotation).
- Versions de Node/TypeScript/Prisma en deca du minimum: la spec impose les versions du `package.json` (Node >=24.15.0; TypeScript 6.0.3 strict; Prisma 7.8.0; NestJS 11.1.19; Next.js 16.2.4; React 19.2.5; Vitest 4.1.5; Playwright 1.59.1; Redis 5.12.1; BullMQ 5.76.2).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme DOIT supporter quatre environnements: `local`, `runtime-smoke`, `staging`, et reserver le concept `production` sans l'activer.
- **FR-002**: Chaque environnement DOIT avoir une matrice de variables documentee (APP_ENV, NODE_ENV, DATABASE_URL, REDIS_URL, JWT_SECRET, SESSION_SECRET, ENCRYPTION_KEY si prevu, API_BASE_URL, PUBLIC_APP_URL, BACKOFFICE_APP_URL, CORS_ORIGINS, FEATURE_FLAGS_BOOTSTRAP_MODE si applicable, SMTP_*, SMS/WHATSAPP_* si prevu mais desactive, S3_* si documents prevus, SENTRY/MONITORING_* si prevu).
- **FR-003**: Le backend DOIT refuser de demarrer si une variable obligatoire de l'environnement courant est absente, vide ou clairement non conforme; le message d'erreur DOIT etre actionnable et NE DOIT PAS afficher les valeurs presentes.
- **FR-004**: Le backend DOIT detecter et refuser une `DATABASE_URL` manifestement de production lorsqu'il tourne en `staging`, `runtime-smoke` ou `local`.
- **FR-005**: Le backend DOIT verifier `prisma migrate status` au demarrage staging et refuser de servir si le schema n'est pas a jour.
- **FR-006**: Le backend DOIT exposer `GET /admin/system/health` accessible aux super admins authentifies, retournant l'etat PostgreSQL, Redis et files BullMQ sans exposer de secrets.
- **FR-007**: Le systeme DOIT supporter un seed de donnees staging/pilote identifiable: 1 pays pilote, 1 a 2 produits, 1 a 3 offres indicatives, 1 a 3 partenaires courtiers (Starter et Pro), licences valides, comptes admin et courtier, textes de consentement publies, mentions legales, disclaimers "offre indicative", regles de routage simples.
- **FR-008**: Les donnees seed DOIVENT etre synthetiques, taguees `staging` (par exemple via prefixe ou metadata), et NE DOIVENT PAS contenir de PII reelle.
- **FR-009**: Les flags sensibles DOIVENT rester fermes par defaut en staging fraichement initialise: `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, `ai_lead_scoring_enabled`, `ai_summary_enabled`, `ai_recommendation_enabled`, `ai_broker_assistant_enabled`, `multi_broker_routing_enabled`, `whatsapp_enabled`, `sponsored_offers_enabled`, `billing_enabled`.
- **FR-010**: Les flags suivants DOIVENT etre activables explicitement et auditement par un Super Admin: `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled`, `country_public_enabled` pour le pays pilote, `product_public_enabled` pour les produits pilotes.
- **FR-011**: Le backend DOIT enforcer HTTPS obligatoire en staging (redirection HTTP -> HTTPS si terminator HTTP existe) et refuser les cookies non securises (HttpOnly, Secure, SameSite=Lax ou Strict).
- **FR-012**: Le backend DOIT appliquer un CORS strict par environnement, base sur `CORS_ORIGINS` (liste explicite de domaines autorises sans wildcards en staging et production).
- **FR-013**: Le backend DOIT servir les headers de securite suivants: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, et une CSP basique en staging et production.
- **FR-014**: La MFA admin DOIT etre obligatoire en staging et production. La MFA broker DOIT etre obligatoire pour les roles Owner et Manager au minimum.
- **FR-015**: Le rate limiting et l'anti-spam DOIVENT etre actifs en staging sur les endpoints publics; les seuils DOIVENT etre documentes au plan.
- **FR-016**: Les exports DOIVENT rester gouvernes par les permissions existantes (specs 003/004) et DOIVENT etre auditees.
- **FR-017**: Aucune route back-office NE DOIT etre chargeable depuis l'application publique; la verification DOIT etre testable.
- **FR-018**: Aucune donnee broker/admin NE DOIT etre exposee publiquement; la verification DOIT etre testable via Playwright source-marker checks.
- **FR-019**: Le systeme DOIT generer et stocker tous les secrets hors Git. Le repo DOIT contenir uniquement `.env.example` ou equivalent documente.
- **FR-020**: Une revue de secrets DOIT etre executee sur le repo (recherche de chaines suspectes, history scan ponctuel) et documentee dans le plan.
- **FR-021**: Le systeme DOIT supporter une procedure de rotation des secrets sans interruption durable des services, documentee en runbook.
- **FR-022**: Les sauvegardes PostgreSQL staging DOIVENT etre planifiees a frequence documentee, chiffrees si possible, retenues selon politique documentee, et au moins une restauration test DOIT etre executee et documentee.
- **FR-023**: Les sauvegardes des fichiers/documents DOIVENT etre planifiees si le stockage S3 est active; sinon le module documents DOIT etre desactive en staging.
- **FR-024**: Le smoke staging DOIT couvrir au minimum: backend health, connexion DB, migrations appliquees, Redis si actif, `GET /countries`, `GET /countries/:code/products`, `GET /countries/:code/products/:key/offers`, `POST /quote-requests` consenti puis non consenti refuse, portail Starter, CRM Pro avec `broker_crm_enabled=true`, dashboard courtier si `broker_dashboard_enabled=true`, dashboard admin, audit durable, flags fail-closed, tenant isolation.
- **FR-025**: Le smoke staging PEUT reutiliser `npm run test:runtime:postgres` adapte pour cibler la base staging via `DATABASE_URL` dediee staging avec garde-fous (le plan precisera).
- **FR-026**: Les runbooks suivants DOIVENT exister: deployer staging, rollback, lancer migrations, lancer smoke tests, activer un pays, activer un produit, activer un courtier, activer/desactiver un feature flag, desactiver rapidement un pays/produit/offre/partenaire, gerer une licence expiree, consulter audit logs, restaurer un backup, rotation secrets.
- **FR-027**: Une checklist go/no-go DOIT exister et bloquer le lancement pilote si un item critique echoue (tests automatises, smoke, donnees pilotes, courtiers/licences, consentements, routage, notifications testees ou desactivees, feature flags, modules interdits desactives, conformite, support, backup, rollback).
- **FR-028**: Les mentions legales, politique de confidentialite, conditions d'utilisation et contact support/conformite DOIVENT etre publiees pour le pays pilote avant activation publique.
- **FR-029**: La page d'accueil publique pilote DOIT afficher le positionnement "AssurMatch est une plateforme technique" et "ni courtier ni assureur".
- **FR-030**: Aucun module reglemente NE DOIT etre active durant le pilote (paiement, souscription, emission, attestation, signature, sinistres, API assureur avancee, IA recommandation officielle).
- **FR-031**: Le systeme DOIT logger en format structure (JSON) avec correlation id si disponible et masquer les PII et secrets.
- **FR-032**: Le monitoring DOIT couvrir: erreurs backend, echec jobs, migrations failed, stockage documents si actif, alertes licence expirante si deja disponible (via dashboard 012), uptime des trois applications.
- **FR-033**: Le journal d'exploitation DOIT etre tenu (incidents, mises a jour, changements de flags) et accessible aux operateurs autorises.
- **FR-034**: Les comptes admin et courtiers pilotes DOIVENT etre crees individuellement, avec MFA enrolement obligatoire et mot de passe initial a changer au premier login.
- **FR-035**: Le pilote DOIT etre limite dans le temps et dans le scope (1 pays, 1-2 produits, 1-3 partenaires, comptes definis), avec une date de revue documentee.

### Configuration Requirements

- **CFG-001**: Un fichier `.env.example` DOIT lister toutes les variables, sans valeurs reelles, avec commentaires d'usage.
- **CFG-002**: Le repo NE DOIT PAS contenir de fichier `.env` reel; un `.gitignore` DOIT empecher leur commit.
- **CFG-003**: Les valeurs reelles DOIVENT etre stockees hors Git: gestionnaire de secrets de l'hebergeur, vault, ou variables d'environnement de la plateforme.
- **CFG-004**: La generation de secrets DOIT utiliser des sources d'entropie cryptographiques et la longueur DOIT etre suffisante (>=32 octets pour JWT/SESSION).
- **CFG-005**: Les feature flags initiaux en staging DOIVENT etre seeded via un script ou via l'endpoint admin existant, jamais en mutation directe SQL non auditee.
- **CFG-006**: La matrice de variables par environnement DOIT etre documentee dans le plan et reproductible dans `docs/`.

### Security Requirements

- **SEC-001**: HTTPS obligatoire sur staging et production.
- **SEC-002**: CORS strict, sans wildcard, par environnement.
- **SEC-003**: Cookies HttpOnly + Secure + SameSite.
- **SEC-004**: MFA admin obligatoire; MFA broker pour roles Owner/Manager au minimum.
- **SEC-005**: Headers de securite: HSTS, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy=strict-origin-when-cross-origin, CSP basique.
- **SEC-006**: Rate limiting et anti-spam actifs sur les endpoints publics.
- **SEC-007**: PII et secrets masques dans logs.
- **SEC-008**: Aucun secret commit; revue ponctuelle obligatoire.
- **SEC-009**: Secrets en gestionnaire dedie hors Git.
- **SEC-010**: Rotation des secrets documentee et testee.
- **SEC-011**: Backups chiffres au repos lorsque possible.
- **SEC-012**: Acces aux backups restreint aux roles autorises.
- **SEC-013**: Aucune route back-office accessible depuis l'application publique.
- **SEC-014**: Aucune donnee broker/admin exposee publiquement.
- **SEC-015**: Validation DTO via zod active sur tous les endpoints.
- **SEC-016**: Erreurs RBAC sans fuite d'information.
- **SEC-017**: Sessions admin avec timeout court documente; sessions broker selon politique.

### Compliance Requirements

- **COMP-001**: Mention "AssurMatch est une plateforme technique" presente sur les pages publiques et dans les emails transactionnels.
- **COMP-002**: Mention "AssurMatch n'est ni courtier ni assureur" presente sur les pages publiques.
- **COMP-003**: Toutes les offres affichees publiquement portent le marqueur "offre indicative" et "prix a confirmer par le courtier partenaire".
- **COMP-004**: Le visiteur DOIT pouvoir consulter mentions legales, politique de confidentialite et conditions d'utilisation accessibles depuis chaque page publique.
- **COMP-005**: Un point de contact support/conformite DOIT etre documente et accessible.
- **COMP-006**: Les `ConsentRecord` DOIVENT etre crees pour chaque transmission de demande, avec version du texte, date, finalite, pays, produit, canal et destinataire prevu.
- **COMP-007**: Les `AuditLog` DOIVENT etre crees pour les actions sensibles (changement flag, activation pays/produit/partenaire, changement licence, refus consentement, refus RBAC, tentatives inter-tenant, acces admin dashboard).
- **COMP-008**: Les licences courtiers DOIVENT etre verifiees avant activation et avant routage; toute licence expiree, suspendue ou invalide bloque le partenaire pour le scope concerne.
- **COMP-009**: Aucune formulation interdite n'apparait dans le contenu public ("Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance du marche").
- **COMP-010**: Les offres sponsorisees, si presentes, sont clairement indiquees; en pilote, `sponsored_offers_enabled` reste `false` sauf decision explicite.
- **COMP-011**: Les modules reglementes (paiement, souscription, emission, attestation, signature, sinistres, IA avancee, API assureur) restent fermes durant le pilote.

### Operational Requirements

- **OPS-001**: Les runbooks listes dans FR-026 existent et sont versionnees dans `docs/runbooks/` ou equivalent.
- **OPS-002**: Le journal d'exploitation est tenu et accessible aux operateurs autorises.
- **OPS-003**: Une alerte est emise pour: erreurs backend recurrentes, echec de migration, echec de job critique, indisponibilite Redis prolongee, indisponibilite PostgreSQL, certificat SSL expirant.
- **OPS-004**: Un canal de support (email ou ticket) est documente pour les courtiers pilotes.
- **OPS-005**: Une revue post-pilote est planifiee a une echeance documentee.

### Backup Requirements

- **BAK-001**: Sauvegarde PostgreSQL planifiee a frequence documentee (par defaut quotidienne staging, plus frequente production).
- **BAK-002**: Sauvegardes chiffrees si l'hebergeur le supporte ou via outil dedie.
- **BAK-003**: Retention documentee (par defaut 7 a 30 jours staging, plus longue production selon conformite).
- **BAK-004**: Au moins un test de restauration execute et documente avant le go.
- **BAK-005**: Sauvegardes des documents/objets si stockage active.
- **BAK-006**: Acces aux sauvegardes restreint et audite.

### Monitoring Requirements

- **MON-001**: `GET /admin/system/health` operationnel et autorise aux super admins.
- **MON-002**: Logs structures avec correlation id.
- **MON-003**: Alerting branche sur erreurs critiques sans dependance bloquante a l'IA.
- **MON-004**: Tableaux de bord de base si l'outillage est choisi (Sentry, Grafana, Uptime Kuma, monitoring de l'hebergeur). Le plan tranchera.

### Key Entities *(read or seeded)*

- **Country**: Pays pilote, active publiquement par flag.
- **Product**: 1 a 2 produits pilotes.
- **Offer**: 1 a 3 offres indicatives, validees, non expirees.
- **Partner / Broker**: 1 a 3 partenaires Starter/Pro avec licences valides.
- **PartnerLicense**: Licences seedees, scopees au pays/produit pilote.
- **ConsentText / ConsentRecord**: Textes de consentement publies; `ConsentRecord` cree a chaque demande consentie.
- **QuoteRequest / Prospect**: Crees uniquement avec consentement valide.
- **LeadAssignment / RoutingDecision**: Crees pour les leads eligibles routes; refus traces pour les autres.
- **FeatureFlag**: Flags persistes Prisma-runtime, fail-closed par defaut.
- **AuditLog**: Durable Prisma-runtime; couvre les actions sensibles.
- **User**: Comptes admin et courtiers pilotes, avec MFA.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% des variables obligatoires manquantes provoquent un refus de demarrage clair (test sur chaque variable).
- **SC-002**: 0 secret reel commit dans le repo (verification automatisee avant commit).
- **SC-003**: 100% des migrations Prisma appliquables sur une base staging vide sans erreur.
- **SC-004**: 100% des endpoints critiques de la checklist smoke repondent en staging.
- **SC-005**: 100% des flags sensibles fermes par defaut sur staging fraichement initialise.
- **SC-006**: 100% des activations pays/produit/partenaire passent par un Super Admin authentifie et sont auditees.
- **SC-007**: 100% des demandes sans consentement refusees, sans persistance non conforme.
- **SC-008**: 100% des routages avec licence expiree bloques.
- **SC-009**: 0 module reglemente actif durant le pilote (paiement, signature, emission, sinistres, IA avancee, API assureur).
- **SC-010**: 0 acces back-office depuis l'application publique.
- **SC-011**: 0 fuite tenant via parametre forge dans les tests.
- **SC-012**: 100% des audits sensibles durables.
- **SC-013**: 1 sauvegarde testee et restauree avant le go.
- **SC-014**: 1 runbook par operation critique listee dans FR-026.
- **SC-015**: 1 checklist go/no-go executee et signee.
- **SC-016**: 100% des contenus publics conformes au vocabulaire constitutionnel (verification source ou Playwright).
- **SC-017**: 0 wildcard CORS en staging et production.
- **SC-018**: HTTPS et HSTS verifies sur les domaines staging.
- **SC-019**: 100% des comptes admin avec MFA enroled.
- **SC-020**: 100% des comptes pilotes avec mot de passe initial change.

## Assumptions

- L'hebergeur cible n'est pas encore tranche; la spec reste neutre (Docker, VPS, Coolify, Dokploy, Render, Railway, Fly.io, serveur Linux ou autre auto-hebergement). Le plan tranchera selon les contraintes du projet.
- Le pays pilote est Cote d'Ivoire sauf decision contraire au plan; les obligations specifiques CI sont a confirmer (regulateur, mentions legales locales, langue).
- Les notifications email peuvent etre desactivees au pilote si aucun fournisseur SMTP n'est encore choisi; sinon SMTP via fournisseur transactionnel a definir.
- Le stockage documents (S3) peut rester desactive si non requis par les parcours pilotes; sinon credentials dedies par environnement.
- Le monitoring outils n'est pas encore choisi; la spec reste neutre.
- La revue secrets se fait au plan via outil ou audit manuel.
- Le pilote vise un nombre limite d'utilisateurs (max documente) et une duree limitee (max documentee).
- Les migrations Prisma existantes (010/011) sont appliquables proprement sur base vide en staging.
- Les feature flags persistes via spec 011 sont fonctionnels en staging.
- L'audit durable est garanti par les specs 010/011.
- Le seed staging peut s'appuyer sur les services existants (CountriesService, ProductsService, OffersModule, PartnersService, PartnerLicensesService, ConsentService, FeatureFlagsService, UsersService, AuthModule).

## Risks

- Mauvaise configuration des domaines/CORS provoquant un melange entre application publique et back-office.
- Secret commit accidentellement; mitigation via revue + scan + pre-commit hook au plan.
- Sauvegarde non testee donnant une fausse assurance; mitigation via test obligatoire au go.
- Activation d'un module reglemente par erreur (paiement/signature/emission); mitigation via fail-closed et seed audit.
- Cache de feature flag stale masquant une desactivation rapide; mitigation via documentation et test.
- Auth admin sans MFA en cas de mauvaise configuration; mitigation via verification go/no-go.
- Stockage documents active sans backup associe; mitigation via desactivation par defaut au pilote.
- Notifications partant vers des adresses reelles en staging; mitigation via desactivation des envois en staging ou domaine de redirection.
- Compte admin avec mot de passe par defaut; mitigation via politique de premier login.
- Donnees pilotes confondues avec donnees reelles; mitigation via tagging et conventions de nommage.
- Hebergeur non tranche conduisant a re-travail au plan; mitigation via decision rapide en plan kickoff.
- Outils de monitoring non choisis; mitigation via decisions au plan.

## Open Questions for the Plan

- Quel hebergeur/orchestrateur pour staging (Docker, VPS, Coolify, Dokploy, Render, Railway, Fly.io, autre)?
- Quel domaine pour public et back-office staging?
- Quel fournisseur SMTP au pilote (ou notifications desactivees)?
- Stockage documents requis au pilote (S3 compatible ou desactive)?
- Quel outil de monitoring/erreur (Sentry/Grafana/Uptime Kuma/hebergeur)?
- Quelle frequence de sauvegarde et duree de retention staging?
- Quelle politique de mots de passe initiaux (longueur, expiration)?
- Quelles adresses email destinataires des alertes operationnelles?
- Quels seuils de rate limiting publics?
- Quelle CSP detaillee staging et production?
- Pays pilote confirme (Cote d'Ivoire ou autre)?
- Produits pilotes confirmes (auto, sante, multirisque, autre)?
- Liste des partenaires courtiers pilotes confirmes (legal name, plan, scope, licences)?
- Quels comptes admin pilotes (Super Admin, Admin Pays, Compliance Admin, Support Admin)?
- Plan d'audit secrets et frequence (commit hook, scanner CI)?
- Procedure de communication avec courtiers pilotes (canal, frequence, contenu)?

## Out Of Scope

- Generation de `plan.md`, `tasks.md`, implementation ou commit automatique.
- Nouvelles fonctionnalites metier.
- Paiement, encaissement, facturation detaillee.
- Souscription, emission de police, attestation, signature electronique, sinistres.
- Recommandation IA, scoring IA, resume IA, assistant IA.
- Webhooks externes avances, API assureur, integrations externes nouvelles.
- Refonte UI complete.
- Acquisition marketing.
- Automatisation juridique complete.
- Multi-tenant white label.
- Multi-broker routing avance non deja prevu.
