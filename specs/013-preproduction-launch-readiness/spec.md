# Feature Specification: Preproduction Launch Readiness AssurMatch

**Feature Branch**: `013-preproduction-launch-readiness`
**Created**: 2026-04-26
**Updated**: 2026-04-26 (rescoped from "lancement pilote restreint" to "mise en preproduction complete et activation controlee par feature flags")
**Status**: Draft
**Input**: User description: "Creer la specification technique et operationnelle 013-preproduction-launch-readiness pour AssurMatch. Preparer un environnement de preproduction COMPLET, representatif de la plateforme cible: catalogue pays complet, catalogue produits complet, partenaires/courtiers configurables par pays et produit, toutes les fonctionnalites prevues dans l'architecture, tous les modules configurables, tous les plans courtiers, toutes les surfaces (Web Publique Client, Back-office Partenaires/Plateforme, Backend API). L'activation publique reste controlee par feature flags. Ne pas ajouter de fonctionnalite metier. Respecter strictement la constitution. Ne genere pas le plan, ne genere pas tasks.md, n'implemente rien."
**Validation State**: Draft
**Continuous Workflow Eligible**: No - cette invocation est limitee a la specification; l'utilisateur a explicitement demande de ne pas generer le plan, les taches ni l'implementation. Cette feature est sensible (mise en preproduction, exposition externe, secrets, conformite multi-pays). Toute continuation `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement` requiert une validation explicite produit/conformite, et un arbitrage prealable des questions ouvertes (hebergeur, domaines, fournisseurs SMTP/storage/monitoring, strategie d'import des partenaires).

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette specification prepare un environnement de preproduction complet, representatif de la plateforme cible AssurMatch. Elle ne change PAS le positionnement: AssurMatch reste plateforme technique. Aucune vente directe, aucune souscription directe, aucun encaissement de prime sans validation reglementaire, aucune emission de police par AssurMatch, aucune attestation par AssurMatch, aucune signature electronique par AssurMatch, aucun sinistre actif en V1 sans validation, aucun conseil personnalise engageant, aucune recommandation officielle IA. Les offres restent indicatives. Devis fermes et souscriptions relevent uniquement des courtiers/assureurs agrees.
- **Impacted application(s)**: Backend API (configuration runtime, sante, logs, scripts, smoke), Web Publique Client (URL API, domaine public, SSL, parcours visiteur), Back-office Partenaires/Plateforme (URL API, domaine, auth, comptes admin/courtiers, RBAC, gestion des catalogues), Base PostgreSQL (instance preprod, migrations, seed des donnees de reference, sauvegardes, restauration), Redis/BullMQ (configuration, sante, queues, monitoring), packages partages si necessaire, scripts/CI deployment si applicable.
- **Affected scopes**: Environnements `local`, `runtime-smoke`, `staging` (preproduction complete), reservation conceptuelle pour `production`. Le scope vise le **catalogue complet**: tous les pays cibles AssurMatch (CIMA, FANAF, hors CIMA si prevus), tous les produits prevus dans le PRD (auto, moto, sante, voyage, habitation, vie/epargne, entreprise, transport, agricole, scolaire, microassurance, credit/caution, cyber, evenementiel, construction et tout autre produit prevu), tous les plans courtiers (Starter, Pro, Enterprise), tous les roles broker (Owner Starter, Owner Pro, Manager, Agent, Read-only) et tous les roles admin (Super Admin, Admin Pays, Compliance Admin, Support Admin, Finance Admin, Content Admin, AI Admin). L'activation publique d'un pays/produit/partenaire reste controlee par feature flags et activation explicite, pas par limitation arbitraire de la spec.
- **Frontend separation**: Les deux applications web (publique et back-office) DOIVENT rester separees applicativement. Domaines, routes, layouts, env vars et CORS DOIVENT etre distincts. Cette spec exige des URL API et des domaines distincts pour `apps/public/`, `apps/admin/` et `apps/broker/`. Aucun pont d'authentification ni partage de session entre public et back-office.
- **Required feature flags**: La spec definit la matrice de flags pour la preproduction. **Flags sensibles fail-closed par defaut** (ne PAS activer en preprod sauf validation reglementaire explicite et limitee dans le temps): `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, `ai_recommendation_enabled`, `ai_lead_scoring_enabled`, `ai_summary_enabled`, `ai_broker_assistant_enabled`, `whatsapp_enabled`, `sponsored_offers_enabled`, `multi_broker_routing_enabled` (selon decision produit), `billing_enabled`. **Flags fonctionnels principaux activables a large echelle apres revue conformite**: `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled`, `country_public_enabled` par pays (cible: tous les pays prets), `product_public_enabled` par produit/pays (cible: tous les produits prets), `country_quote_enabled`, `country_comparison_enabled`, `country_broker_onboarding_enabled`, `product_quote_enabled`, `product_comparison_enabled`, `product_document_upload_enabled`. Les flags sont gouvernes globalement, par pays, par produit, par partenaire et par plan.
- **Consent and transmission**: Aucune transmission de demande sans `ConsentRecord` valide. Les textes de consentement DOIVENT etre publies par pays/produit avant activation publique du couple correspondant. La spec exige un seed des textes de consentement pour TOUS les pays/produits configures, et une verification smoke qu'un POST /quote-requests sans consentement est refuse pour tout couple actif.
- **Partner license controls**: Les licences des courtiers DOIVENT etre valides, datees, scopees au pays/produit autorise et chargees en base avant l'activation publique du scope correspondant. Le routage DOIT bloquer toute licence expiree, suspendue ou invalide. La spec exige un test smoke "licence expiree => exclusion" sur l'ensemble du catalogue. Le seed peut contenir des donnees exemples non sensibles; les vrais courtiers et licences sont importes hors Git via scripts securises ou back-office.
- **Audit and data history**: AuditLog DOIT etre durable (Prisma-runtime) sur preprod. Les actions sensibles DOIVENT etre auditees: changements de feature flag (par pays, produit, partenaire, plan, global), activation/desactivation pays/produit/partenaire, changements de licence, refus de routage, refus RBAC, acces dashboard admin, refus consentement, imports de donnees operationnelles confidentielles. Les `createdAt`/`updatedAt`/`createdBy` DOIVENT etre presents sur les entites critiques.
- **Security and RBAC**: HTTPS obligatoire, CORS strict, cookies securises (HttpOnly, Secure, SameSite), rate limiting actif, anti-spam actif, validation DTO (zod) active, RBAC strict, MFA admin obligatoire, MFA broker selon role, headers de securite (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy), logs sans PII inutile, exports controles, secrets hors Git, backups chiffres si possible, isolation tenant verifiee.
- **Routing impact**: Aucun changement de regles de routage. La spec exige seulement que les regles existantes soient testees en preprod sur un perimetre representatif: consentement, activation pays/produit, autorisation partenaire, validite licence, quotas, decision tracee, multi-broker_routing si decide.
- **AI impact**: Aucune fonctionnalite IA activee en preprod ni en production sauf validation explicite. Tous les flags IA restent fermes par defaut. Les modules IA DOIVENT etre prepares (config, garde-fous, audit, marquage assistance) mais NON actives sans approbation reglementaire.
- **UX/content restrictions**: Toutes les surfaces publiques DOIVENT afficher: "AssurMatch est une plateforme technique de comparaison", "AssurMatch n'est ni courtier ni assureur", "offre indicative", "prix a confirmer par le courtier partenaire". Aucune formulation interdite ("Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance du marche"). Mentions legales, politique de confidentialite, conditions d'utilisation, contact support/conformite DOIVENT etre publies par pays avant activation publique du pays correspondant.
- **Workflow continuity**: Cette spec EST sensible (mise en preproduction representative, exposition externe possible, secrets, conformite multi-pays). L'enchainement automatique `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement` necessite une validation explicite produit/conformite avant chaque etape. Les decisions hebergeur, domaines, fournisseur SMTP/storage/monitoring, procedures de backup, strategie d'import des partenaires/courtiers/licences, perimetre des activations publiques DOIVENT etre tranchees au plan, pas decidees autonomement par Code AI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurer un environnement de preproduction complet (Priority: P1)

L'equipe technique configure un environnement preprod avec backend, application publique et back-office, base PostgreSQL et Redis dedies, secrets generes hors Git, domaines distincts et SSL actif. L'environnement supporte le catalogue complet (pays, produits, partenaires) et toutes les fonctionnalites prevues, avec activation controlee par feature flags.

**Why this priority**: Sans preprod representative, la mise en ligne ne peut pas etre testee de bout en bout. La conformite exige une preuve de fonctionnement sur un environnement proche de la production cible.

**Independent Test**: Demarrer preprod avec les variables documentees, executer la checklist smoke et confirmer que tous les services repondent aux health checks, que les domaines sont separes, et que toutes les surfaces fonctionnelles (publique, broker, admin) sont operationnelles tout en restant gouvernees par flags.

**Acceptance Scenarios**:

1. **Given** un environnement preprod avec les variables obligatoires fournies, **When** le backend, l'application publique et le back-office demarrent, **Then** chaque service expose ses URLs et CORS conformes a la matrice documentee, sans credentials en clair dans les logs.
2. **Given** une base preprod vide, **When** les migrations Prisma sont appliquees, **Then** le schema est cree sans erreur et `npx prisma validate` passe.
3. **Given** Redis et BullMQ disponibles en preprod, **When** le backend demarre, **Then** les sondes de sante confirment la connexion et la file de notifications est prete.
4. **Given** SSL actif sur les domaines preprod, **When** un client charge l'application publique ou le back-office, **Then** la reponse est servie en HTTPS avec un certificat valide.
5. **Given** les secrets sont stockes hors Git, **When** le repo est inspecte, **Then** aucun secret reel n'est present dans les fichiers committes.

---

### User Story 2 - Configurer le catalogue pays complet et controler l'activation publique (Priority: P1)

Un Super Admin ou Admin Pays configure le catalogue de tous les pays cibles d'AssurMatch (CIMA, FANAF, hors CIMA si prevus). Chaque pays peut etre configure, active, desactive, mis en attente, rendu visible publiquement ou non, ouvert ou non aux demandes de devis.

**Why this priority**: AssurMatch doit etre prepare des le depart pour son catalogue cible complet. Limiter la preprod a un seul pays a ete identifie comme erreur de cadrage. L'activation publique reste contrelee par flags par pays.

**Independent Test**: Importer/seeder le catalogue pays complet (avec devise, langues, fuseau, regime reglementaire, regles de consentement et de routage par pays). Pour chaque pays: verifier qu'il n'apparait publiquement que si `country_public_enabled=true` et que les flags pays (`country_quote_enabled`, `country_comparison_enabled`, `country_broker_onboarding_enabled`, `country_ai_enabled`) gouvernent les sous-fonctions.

**Acceptance Scenarios**:

1. **Given** le catalogue pays configure (tous les pays cibles seedeses ou importeses), **When** un Super Admin liste les pays, **Then** tous les pays prevus sont presents avec devise, langues, fuseau et regime reglementaire renseignes.
2. **Given** un pays configure mais avec `country_public_enabled=false`, **When** un visiteur ouvre l'application publique, **Then** le pays n'est pas expose.
3. **Given** un pays avec `country_public_enabled=true` et `country_quote_enabled=true`, **When** un visiteur consulte le pays, **Then** les produits actifs pour ce pays sont visibles et le formulaire de devis fonctionne.
4. **Given** un pays mis en attente (`country_waitlist_enabled=true`), **When** un visiteur tente le parcours public, **Then** la waitlist est affichee selon configuration sans transmission de lead.
5. **Given** un Admin Pays scope a un pays X, **When** il modifie un autre pays Y, **Then** la requete est refusee 403 et auditee.

---

### User Story 3 - Configurer le catalogue produits complet et leurs liens pays (Priority: P1)

Un Super Admin ou Content Admin configure tous les produits prevus dans le PRD (auto, moto, sante, voyage, habitation, vie/epargne, entreprise, transport, agricole, scolaire, microassurance, credit/caution, cyber, evenementiel, construction, et tout autre produit prevu). Chaque produit peut etre associe a un ou plusieurs pays, active/desactive par pays, rendu visible publiquement ou non, lie a ses formulaires dynamiques, documents requis, disclaimers, regles de comparaison et regles IA si autorisees.

**Why this priority**: Le catalogue produits doit refleter l'ambition cible. La preprod doit pouvoir tester n'importe quel produit, pas un sous-ensemble arbitraire.

**Independent Test**: Importer/seeder le catalogue produits, associer chacun a ses pays, configurer les formulaires/documents/disclaimers, puis verifier que chaque produit suit ses flags d'activation publique et ses regles propres.

**Acceptance Scenarios**:

1. **Given** le catalogue produits complet seede/importe, **When** un Super Admin liste les produits, **Then** tous les produits prevus sont presents avec leurs metadata (nom, description, sensibilite, regles IA si applicables).
2. **Given** un produit associe a plusieurs pays, **When** un visiteur consulte un de ces pays, **Then** le produit apparait uniquement si `product_public_enabled=true` ET `country_public_enabled=true` pour ce couple.
3. **Given** un produit avec `product_quote_enabled=false` pour un pays, **When** un visiteur tente une demande de devis pour ce couple, **Then** la demande est bloquee.
4. **Given** un produit lie a son formulaire dynamique et ses documents, **When** un visiteur ouvre le formulaire, **Then** les champs et obligations documentaires sont coherents avec la configuration produit.
5. **Given** un produit avec `product_manual_review_required=true`, **When** une demande est soumise, **Then** le routage applique la revue manuelle conformement aux regles existantes.

---

### User Story 4 - Configurer les partenaires/courtiers par pays et produit (Priority: P1)

Un Super Admin ou Compliance Admin configure les partenaires courtiers, leurs plans (Starter, Pro, Enterprise), leurs licences (avec dates d'expiration), leurs documents d'agrement, leurs quotas, leurs autorisations par pays/produit, leurs utilisateurs et leurs statuts (actif, suspendu, expire, test, public). L'architecture et les scripts supportent le catalogue complet, sans limitation arbitraire de nombre.

**Why this priority**: La capacite de gerer le catalogue partenaire complet est un prerequis a l'activation publique multi-pays multi-produits. La spec doit garantir que rien dans le code ou les scripts ne limite a un petit nombre de partenaires.

**Independent Test**: Importer un catalogue de partenaires representatif (au moins quelques exemples par plan, par pays et par produit) via un script securise hors Git ou via le back-office; verifier autorisations, licences, routage, RBAC et audit pour chacun.

**Acceptance Scenarios**:

1. **Given** un partenaire configure avec plan Starter et licence valide pour un pays X et un produit Y, **When** un visiteur soumet une demande consentie pour X/Y, **Then** le routage peut creer un `LeadAssignment` pour ce partenaire si eligible.
2. **Given** un partenaire avec licence expiree, **When** le routage l'evalue, **Then** il est exclu et un audit "license_expired" est cree.
3. **Given** un partenaire en statut "test", **When** un visiteur public navigue, **Then** le partenaire n'est pas reference publiquement et n'apparait que dans les flux de test internes.
4. **Given** plusieurs partenaires eligibles pour un pays/produit, **When** le routage s'execute, **Then** les regles de selection (quotas, capacite, priorites, exclusions) sont appliquees conformement au domaine existant; `multi_broker_routing_enabled` peut etendre la selection si autorise.
5. **Given** un partenaire Pro avec `broker_crm_enabled=true`, **When** un Owner Pro se connecte, **Then** il accede au CRM scope a son tenant uniquement.
6. **Given** un import en masse de partenaires via script securise hors Git, **When** l'import s'execute, **Then** chaque ligne produit un `Partner`, ses `PartnerLicense`, ses utilisateurs et un `AuditLog` import.

---

### User Story 5 - Activer toutes les fonctionnalites prevues sous controle de feature flags (Priority: P1)

L'equipe technique prepare l'ensemble des fonctionnalites deja construites ou prevues dans l'architecture (comparateur public, demande de devis, consentement, routage, portail Starter, CRM Pro/Enterprise, dashboards courtier/admin, audit logs, feature flags, notifications, documents, facturation B2B si prevue, modules IA encadres si prevus, API/webhooks si prevus, paiements/signature/emission/sinistres prepares mais desactives). Tout reste gouverne par flags fail-closed par defaut sur les modules sensibles.

**Why this priority**: La preprod doit etre representative de la plateforme cible: pas seulement le coeur fonctionnel, mais aussi les modules avances configurables. Cela permet la validation conformite et la repetition operationnelle.

**Independent Test**: Verifier que chaque module configurable est present, configurable, mais NON active publiquement tant que son flag n'est pas explicitement ouvert par un acteur autorise et auditable. Les modules reglementes sensibles (paiements, signature, emission, sinistres, IA recommandation, API assureur) restent fermes.

**Acceptance Scenarios**:

1. **Given** un environnement preprod fraichement initialise, **When** les flags sensibles sont consultes, **Then** `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, `ai_recommendation_enabled`, `ai_lead_scoring_enabled`, `ai_summary_enabled`, `ai_broker_assistant_enabled`, `whatsapp_enabled`, `sponsored_offers_enabled`, `billing_enabled` sont tous a `false`.
2. **Given** un module documents ou notifications prepare, **When** son flag est ouvert par un Super Admin authentifie, **Then** la fonction est exposee aux roles autorises et l'activation est auditee.
3. **Given** un module IA prepare avec garde-fous (audit prompt, minimisation PII, marquage assistance, validation humaine), **When** un acteur tente de l'activer sans validation reglementaire, **Then** l'activation est refusee ou demande une justification auditee.
4. **Given** les API/webhooks prepares mais non publies, **When** un client externe tente d'acceder, **Then** l'acces est refuse tant que les flags `insurer_api_enabled` ou equivalents ne sont pas ouverts.
5. **Given** un module paiement/signature/emission/sinistres prepare en code mais ferme par flag, **When** un visiteur ou un courtier tente d'utiliser une route correspondante, **Then** la route est introuvable ou refusee, et aucun appel reel a un fournisseur tiers n'est emis.

---

### User Story 6 - Verifier les invariants constitutionnels sur le perimetre complet (Priority: P1)

L'equipe technique execute la checklist smoke preprod sur le catalogue complet: consentement, RBAC multi-role multi-tenant, isolation, refus sans consentement, blocage licence expiree, refus broker -> admin, fail-closed des modules reglementes, audit durable.

**Why this priority**: Chaque invariant constitutionnel doit etre verifiable sur la preprod representative, pas sur un sous-ensemble.

**Independent Test**: Suivre la checklist smoke sur plusieurs combinaisons pays/produit/partenaire/plan/role et confirmer chaque invariant.

**Acceptance Scenarios**:

1. **Given** un visiteur soumet une demande sans consentement, **When** `POST /quote-requests` est appele, **Then** la demande est refusee, aucun lead transmis n'est cree et aucun module reglemente n'est declenche.
2. **Given** un courtier tente d'atteindre une route admin, **When** la requete arrive, **Then** elle est refusee 403 et auditee.
3. **Given** un courtier de tenant A tente de lire des donnees d'un tenant B via parametres forges, **When** la requete s'execute, **Then** aucune donnee de B n'est exposee, le refus est audite.
4. **Given** un visiteur non authentifie tente d'ouvrir le back-office, **When** la requete arrive, **Then** elle est refusee.
5. **Given** une activation pays/produit/partenaire, **When** un Super Admin l'effectue, **Then** un AuditLog est cree avec acteur, scope et motif.
6. **Given** une desactivation rapide d'un pays/produit/offre/partenaire, **When** l'operateur applique le runbook correspondant, **Then** l'application publique cesse d'exposer le scope concerne et un audit est cree.

---

### User Story 7 - Operer la preprod via runbooks et monitoring (Priority: P2)

Un operateur utilise des runbooks documentes pour deployer preprod, lancer migrations, lancer smoke tests, importer/configurer le catalogue (pays, produits, partenaires, licences), activer/desactiver pays/produit/partenaire/flag, gerer une licence expiree, restaurer un backup et tourner les secrets.

**Why this priority**: L'operabilite reduit le risque humain et accelere la reponse aux incidents sur le perimetre complet.

**Independent Test**: Suivre chaque runbook documente en preprod et confirmer le resultat attendu; documenter les ecarts.

**Acceptance Scenarios**:

1. **Given** une defaillance de deploiement preprod, **When** l'operateur suit le runbook rollback, **Then** l'environnement revient a un etat stable connu sans perte de donnees protegees.
2. **Given** un import de catalogue partenaires, **When** l'operateur suit le runbook import, **Then** les partenaires/licences/utilisateurs sont crees en base avec audit, sans secret commit.
3. **Given** un pays a desactiver rapidement, **When** l'operateur suit le runbook desactivation, **Then** `country_public_enabled=false` et `country_quote_enabled=false` pour ce pays, l'audit est cree.
4. **Given** une licence courtier expiree, **When** l'operateur suit le runbook gestion licence, **Then** le partenaire est bloque pour le scope concerne et un audit est cree.
5. **Given** un besoin de rotation de secret, **When** l'operateur suit le runbook rotation, **Then** les secrets sont remplaces sans interruption durable et les logs ne contiennent pas les valeurs.

---

### User Story 8 - Sauvegardes et restauration verifiees (Priority: P2)

L'equipe technique configure une sauvegarde reguliere de PostgreSQL preprod et execute un test de restauration au moins une fois.

**Why this priority**: Sans test de restauration, la sauvegarde n'est qu'une supposition. La conformite multi-pays exige la preuve qu'un retour arriere est possible.

**Independent Test**: Declencher une sauvegarde, restaurer la base sur un environnement temporaire et verifier l'integrite des entites critiques (audit, consent, licences, leads, catalogues).

**Acceptance Scenarios**:

1. **Given** une politique de sauvegarde definie pour preprod, **When** une sauvegarde est declenchee, **Then** le fichier est produit, chiffre si possible, et stocke hors machine d'execution.
2. **Given** une sauvegarde recente, **When** une restauration test est executee sur un environnement separe, **Then** l'integrite des entites critiques est verifiee et documentee.
3. **Given** une retention definie, **When** une sauvegarde depasse la retention, **Then** elle est purgee selon la regle.

---

### User Story 9 - Checklist go/no-go d'activation publique (Priority: P1)

Un responsable produit/conformite execute la checklist go/no-go avant toute activation publique d'un pays, d'un produit ou d'un partenaire en preprod ou en production future. La checklist couvre le perimetre complet et bloque l'activation si un invariant n'est pas verifie pour le scope concerne.

**Why this priority**: La checklist est le filet de securite avant exposition externe. Elle doit etre executable par scope (pays, produit, partenaire) et globalement.

**Independent Test**: Parcourir la checklist sur preprod pour un scope donne et confirmer que chaque item critique est verifie ou que l'activation est bloquee.

**Acceptance Scenarios**:

1. **Given** la checklist go/no-go par scope, **When** un item critique echoue (catalogue pays configure, catalogue produits configure, courtiers valides, licences valides, regles de routage configurees, modules interdits desactives, feature flags valides, smoke tests, conformite, support, backup, rollback), **Then** l'activation est bloquee et l'echec est documente.
2. **Given** tous les items critiques valides pour un scope, **When** le responsable conformite valide explicitement, **Then** l'activation publique du scope est autorisee et auditee.
3. **Given** une activation publique effective, **When** un incident est detecte, **Then** le runbook desactivation rapide est applicable et previsible pour ce scope.

---

### Edge Cases

- Variables d'environnement obligatoires absentes (DATABASE_URL, REDIS_URL, JWT_SECRET, SESSION_SECRET, API_BASE_URL, PUBLIC_APP_URL, BACKOFFICE_APP_URL, CORS_ORIGINS): les services DOIVENT refuser de demarrer avec un message clair sans exposer les valeurs presentes.
- DATABASE_URL pointant vers une base autre que preprod (production, dev partage, smoke): les services DOIVENT refuser de demarrer ou refuser les seeds/migrations destructives.
- Migrations non appliquees ou schema drift: le backend DOIT refuser de demarrer en preprod tant que `prisma migrate status` n'est pas vert.
- Redis indisponible: le backend DOIT degrader les fonctionnalites dependantes en fail-closed sur les flags sensibles ou refuser de demarrer selon la criticite documentee.
- Cookies non securises ou HTTPS absent: la spec impose le refus de demarrer en preprod sans HTTPS valide.
- CORS trop permissif (wildcard ou domaines hors liste): la spec impose un CORS strict par environnement.
- Comptes admin avec mot de passe par defaut: la spec interdit l'usage de mots de passe par defaut en preprod et exige une rotation initiale.
- MFA admin desactivee: la spec interdit la desactivation de la MFA admin sur preprod et production.
- Logs contenant PII brute, secrets, tokens, ou DATABASE_URL: la spec impose un masquage et une revue.
- Acces Web Publique Client tentant de charger un ecran back-office: la spec impose qu'aucune route back-office ne soit chargeable depuis la publique.
- Acces back-office tentant d'utiliser une route publique pour atteindre des donnees admin: la spec impose un refus.
- Pays/produit/partenaire active sans license valide: la spec impose le blocage avec audit.
- Texte de consentement non publie pour le scope active: la spec impose le blocage des demandes consenties pour ce scope.
- Notifications activees sans fournisseur SMTP/SMS configure: la spec impose la desactivation des notifications correspondantes ou la configuration explicite.
- Stockage documents (S3) configure mais credentials invalides: la spec impose la desactivation des documents ou un refus de demarrage selon la criticite.
- Sauvegarde non chiffree alors que requis par la politique: la spec impose un blocage et une remediation.
- Restauration test echouee: la spec impose un blocage du go/no-go.
- Domaines public et back-office partages ou mal configures: la spec impose des domaines distincts et une verification.
- Comptes courtiers/admin avec roles incorrects: la spec impose une revue RBAC.
- AuditLog non durable (memory-test detecte hors test): la spec impose un blocage immediat.
- Secrets dans le repo: la spec impose un blocage et une remediation (revocation + rotation).
- Versions de Node/TypeScript/Prisma en deca du minimum: la spec impose les versions du `package.json` (Node >=24.15.0; TypeScript 6.0.3 strict; Prisma 7.8.0; NestJS 11.1.19; Next.js 16.2.4; React 19.2.5; Vitest 4.1.5; Playwright 1.59.1; Redis 5.12.1; BullMQ 5.76.2).
- Import en masse de partenaires depuis un fichier source: la spec exige un script securise (chiffrement en transit et au repos, audit, validation des champs).
- Activation simultanee de plusieurs pays/produits: la spec exige une procedure tracee et bornee, et une verification des smoke tests sur chaque scope.
- Reglementation locale specifique non couverte par les textes seedeses: la spec impose le blocage de l'activation publique du pays correspondant.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme DOIT supporter quatre environnements: `local`, `runtime-smoke`, `staging` (preproduction complete), et reserver le concept `production` sans l'activer.
- **FR-002**: Chaque environnement DOIT avoir une matrice de variables documentee (APP_ENV, NODE_ENV, DATABASE_URL, REDIS_URL, JWT_SECRET, SESSION_SECRET, ENCRYPTION_KEY si prevu, API_BASE_URL, PUBLIC_APP_URL, BACKOFFICE_APP_URL, CORS_ORIGINS, FEATURE_FLAGS_BOOTSTRAP_MODE si applicable, SMTP_*, SMS/WHATSAPP_* si prevu mais desactive, S3_* si documents prevus, SENTRY/MONITORING_* si prevu).
- **FR-003**: Le backend DOIT refuser de demarrer si une variable obligatoire de l'environnement courant est absente, vide ou clairement non conforme; le message d'erreur DOIT etre actionnable et NE DOIT PAS afficher les valeurs presentes.
- **FR-004**: Le backend DOIT detecter et refuser une `DATABASE_URL` manifestement de production lorsqu'il tourne en `staging`, `runtime-smoke` ou `local`.
- **FR-005**: Le backend DOIT verifier `prisma migrate status` au demarrage preprod et refuser de servir si le schema n'est pas a jour.
- **FR-006**: Le backend DOIT exposer `GET /admin/system/health` accessible aux super admins authentifies, retournant l'etat PostgreSQL, Redis et files BullMQ sans exposer de secrets.
- **FR-007**: Le systeme DOIT supporter le seed/import du **catalogue pays complet** prevu par AssurMatch (CIMA, FANAF, hors CIMA si prevus), avec devise, langues, fuseau, regime reglementaire, regles de consentement et de routage, et tous les flags pays initialises a `false` par defaut.
- **FR-008**: Le systeme DOIT supporter le seed/import du **catalogue produits complet** prevu (auto, moto, sante, voyage, habitation, vie/epargne, entreprise, transport, agricole, scolaire, microassurance, credit/caution, cyber, evenementiel, construction, et tout autre produit prevu dans le PRD), avec metadata, formulaires dynamiques, documents requis, disclaimers et regles de comparaison.
- **FR-009**: Le systeme DOIT supporter la configuration de **partenaires courtiers par pays et produit, sans limite arbitraire de nombre**, avec plans (Starter, Pro, Enterprise), licences valides datees, documents d'agrement, quotas, autorisations par pays/produit, utilisateurs courtiers et statuts (actif, suspendu, expire, test, public).
- **FR-010**: Les donnees de reference (pays, produits, statuts, devises, langues, categories, feature flag definitions) DOIVENT pouvoir etre seedeses dans le repo de facon synthetique et publiable; les **donnees operationnelles confidentielles** (vrais courtiers, licences, contacts, offres reelles, documents) DOIVENT etre importees hors Git via scripts securises ou via le back-office, avec audit complet.
- **FR-011**: Aucune donnee sensible reelle NE DOIT etre committee. Les donnees seed publiables DOIVENT etre clairement identifiables (prefixe, statut "test"/"sample", marqueur metadata).
- **FR-012**: Les flags sensibles DOIVENT rester fermes par defaut en preprod fraichement initialisee: `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, `ai_lead_scoring_enabled`, `ai_summary_enabled`, `ai_recommendation_enabled`, `ai_broker_assistant_enabled`, `multi_broker_routing_enabled` (selon decision produit), `whatsapp_enabled`, `sponsored_offers_enabled`, `billing_enabled`.
- **FR-013**: Les flags fonctionnels principaux DOIVENT etre activables explicitement et auditement par un Super Admin (ou role autorise): `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled`, `country_public_enabled` par pays, `product_public_enabled` par produit/pays, `country_quote_enabled`, `country_comparison_enabled`, `country_broker_onboarding_enabled`, `country_ai_enabled`, `product_quote_enabled`, `product_comparison_enabled`, `product_document_upload_enabled`, `product_manual_review_required`, `product_ai_scoring_enabled`, `product_ai_form_assistant_enabled`.
- **FR-014**: Le backend DOIT enforcer HTTPS obligatoire en preprod (redirection HTTP -> HTTPS si terminator HTTP existe) et refuser les cookies non securises (HttpOnly, Secure, SameSite=Lax ou Strict).
- **FR-015**: Le backend DOIT appliquer un CORS strict par environnement, base sur `CORS_ORIGINS` (liste explicite de domaines autorises sans wildcards en preprod et production).
- **FR-016**: Le backend DOIT servir les headers de securite suivants: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, et une CSP basique en preprod et production.
- **FR-017**: La MFA admin DOIT etre obligatoire en preprod et production. La MFA broker DOIT etre obligatoire pour les roles Owner et Manager au minimum.
- **FR-018**: Le rate limiting et l'anti-spam DOIVENT etre actifs en preprod sur les endpoints publics; les seuils DOIVENT etre documentes au plan.
- **FR-019**: Les exports DOIVENT rester gouvernes par les permissions existantes (specs 003/004) et DOIVENT etre auditees.
- **FR-020**: Aucune route back-office NE DOIT etre chargeable depuis l'application publique; la verification DOIT etre testable.
- **FR-021**: Aucune donnee broker/admin NE DOIT etre exposee publiquement; la verification DOIT etre testable via Playwright source-marker checks.
- **FR-022**: Le systeme DOIT generer et stocker tous les secrets hors Git. Le repo DOIT contenir uniquement `.env.example` ou equivalent documente.
- **FR-023**: Une revue de secrets DOIT etre executee sur le repo (recherche de chaines suspectes, history scan ponctuel) et documentee dans le plan.
- **FR-024**: Le systeme DOIT supporter une procedure de rotation des secrets sans interruption durable des services, documentee en runbook.
- **FR-025**: Les sauvegardes PostgreSQL preprod DOIVENT etre planifiees a frequence documentee, chiffrees si possible, retenues selon politique documentee, et au moins une restauration test DOIT etre executee et documentee.
- **FR-026**: Les sauvegardes des fichiers/documents DOIVENT etre planifiees si le stockage S3 est active; sinon le module documents DOIT etre desactive en preprod.
- **FR-027**: Le smoke preprod DOIT couvrir au minimum: backend health, connexion DB, migrations appliquees, Redis si actif, `GET /countries` (catalogue complet), `GET /countries/:code/products` (sur plusieurs pays representatifs), `GET /countries/:code/products/:key/offers`, `POST /quote-requests` consenti puis non consenti refuse, portail Starter, CRM Pro avec `broker_crm_enabled=true`, dashboard courtier si `broker_dashboard_enabled=true`, dashboard admin, audit durable, flags fail-closed, tenant isolation, blocage licence expiree, refus broker -> admin, refus visiteur -> back-office.
- **FR-028**: Le smoke preprod PEUT reutiliser `npm run test:runtime:postgres` adapte pour cibler la base preprod via `DATABASE_URL` dediee preprod avec garde-fous (le plan precisera).
- **FR-029**: Les runbooks suivants DOIVENT exister: deployer preprod, rollback, lancer migrations, lancer smoke tests, importer/configurer le catalogue pays, importer/configurer le catalogue produits, importer/configurer partenaires/licences (script securise hors Git), creer comptes admin et courtiers, activer un pays, activer un produit, activer un partenaire, activer/desactiver un feature flag (par scope), desactiver rapidement un pays/produit/offre/partenaire, gerer une licence expiree, consulter audit logs, restaurer un backup, rotation secrets, gerer une activation publique progressive ou globale.
- **FR-030**: Une checklist go/no-go par scope DOIT exister et bloquer l'activation publique d'un pays/produit/partenaire si un item critique echoue (catalogue configure, courtiers valides, licences valides, regles de routage configurees, modules interdits desactives, feature flags valides, smoke tests, conformite, support, backup, rollback, communication).
- **FR-031**: Les mentions legales, politique de confidentialite, conditions d'utilisation et contact support/conformite DOIVENT etre publies par pays avant activation publique du pays correspondant.
- **FR-032**: Toutes les pages publiques DOIVENT afficher le positionnement "AssurMatch est une plateforme technique" et "ni courtier ni assureur".
- **FR-033**: Aucun module reglemente NE DOIT etre active sans validation reglementaire explicite (paiement, souscription, emission, attestation, signature, sinistres, API assureur avancee, IA recommandation officielle).
- **FR-034**: Le systeme DOIT logger en format structure (JSON) avec correlation id si disponible et masquer les PII et secrets.
- **FR-035**: Le monitoring DOIT couvrir: erreurs backend, echec jobs, migrations failed, stockage documents si actif, alertes licence expirante, uptime des trois applications, sondes par pays/produit critiques.
- **FR-036**: Le journal d'exploitation DOIT etre tenu (incidents, mises a jour, changements de flags, activations) et accessible aux operateurs autorises.
- **FR-037**: Les comptes admin et courtiers DOIVENT etre crees individuellement, avec MFA enrolement obligatoire et mot de passe initial a changer au premier login.
- **FR-038**: Le systeme DOIT permettre une **activation publique progressive ou globale** par scope (pays, produit, partenaire) controlee par feature flags, avec audit. Aucune limitation arbitraire de la spec ne doit empecher l'activation simultanee de plusieurs pays/produits/partenaires des lors que les conditions go/no-go sont reunies pour chaque scope.

### Configuration Requirements

- **CFG-001**: Un fichier `.env.example` DOIT lister toutes les variables, sans valeurs reelles, avec commentaires d'usage.
- **CFG-002**: Le repo NE DOIT PAS contenir de fichier `.env` reel; un `.gitignore` DOIT empecher leur commit.
- **CFG-003**: Les valeurs reelles DOIVENT etre stockees hors Git: gestionnaire de secrets de l'hebergeur, vault, ou variables d'environnement de la plateforme.
- **CFG-004**: La generation de secrets DOIT utiliser des sources d'entropie cryptographiques et la longueur DOIT etre suffisante (>=32 octets pour JWT/SESSION).
- **CFG-005**: Les feature flags initiaux en preprod DOIVENT etre seeded via un script ou via l'endpoint admin existant, jamais en mutation directe SQL non auditee.
- **CFG-006**: La matrice de variables par environnement DOIT etre documentee dans le plan et reproductible dans `docs/`.
- **CFG-007**: Le seed des donnees de reference (pays, produits, langues, devises, statuts, definitions de flags) DOIT etre versionne dans le repo et reproductible.
- **CFG-008**: L'import des donnees operationnelles confidentielles (partenaires reels, licences reelles, contacts reels, offres reelles, documents) DOIT passer par un script securise (chiffrement source, validation des champs, audit), JAMAIS par commit direct dans le repo.

### Security Requirements

- **SEC-001**: HTTPS obligatoire sur preprod et production.
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
- **SEC-018**: Imports de donnees confidentielles via canal chiffre + audit; pas de fichier brut commit.

### Compliance Requirements

- **COMP-001**: Mention "AssurMatch est une plateforme technique" presente sur les pages publiques et dans les emails transactionnels.
- **COMP-002**: Mention "AssurMatch n'est ni courtier ni assureur" presente sur les pages publiques.
- **COMP-003**: Toutes les offres affichees publiquement portent le marqueur "offre indicative" et "prix a confirmer par le courtier partenaire".
- **COMP-004**: Le visiteur DOIT pouvoir consulter mentions legales, politique de confidentialite et conditions d'utilisation accessibles depuis chaque page publique. Les textes DOIVENT etre publies pour chaque pays active publiquement.
- **COMP-005**: Un point de contact support/conformite DOIT etre documente et accessible.
- **COMP-006**: Les `ConsentRecord` DOIVENT etre crees pour chaque transmission de demande, avec version du texte, date, finalite, pays, produit, canal et destinataire prevu.
- **COMP-007**: Les `AuditLog` DOIVENT etre crees pour les actions sensibles (changement flag par scope, activation pays/produit/partenaire, changement licence, refus consentement, refus RBAC, tentatives inter-tenant, acces admin dashboard, imports confidentiels, activations publiques).
- **COMP-008**: Les licences courtiers DOIVENT etre verifiees avant activation et avant routage; toute licence expiree, suspendue ou invalide bloque le partenaire pour le scope concerne.
- **COMP-009**: Aucune formulation interdite n'apparait dans le contenu public ("Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance du marche").
- **COMP-010**: Les offres sponsorisees, si presentes, sont clairement indiquees; en preprod, `sponsored_offers_enabled` reste `false` sauf decision explicite.
- **COMP-011**: Les modules reglementes (paiement, souscription, emission, attestation, signature, sinistres, IA avancee, API assureur) restent fermes par defaut en preprod et ne DOIVENT etre actives qu'apres validation reglementaire explicite, par scope.
- **COMP-012**: La validation conformite DOIT etre effectuee par pays et par produit avant toute activation publique du couple correspondant (regulateur local, mentions legales locales, langue, regles de consentement specifiques).

### Operational Requirements

- **OPS-001**: Les runbooks listes dans FR-029 existent et sont versionnes dans `docs/runbooks/` ou equivalent.
- **OPS-002**: Le journal d'exploitation est tenu et accessible aux operateurs autorises.
- **OPS-003**: Une alerte est emise pour: erreurs backend recurrentes, echec de migration, echec de job critique, indisponibilite Redis prolongee, indisponibilite PostgreSQL, certificat SSL expirant, licences expirantes.
- **OPS-004**: Un canal de support (email ou ticket) est documente pour les courtiers.
- **OPS-005**: Une revue post-activation publique est planifiee a une echeance documentee, par scope.
- **OPS-006**: La strategie d'activation publique (progressive par scope ou globale) DOIT etre documentee, tracee et auditee.

### Backup Requirements

- **BAK-001**: Sauvegarde PostgreSQL planifiee a frequence documentee (par defaut quotidienne preprod, plus frequente production).
- **BAK-002**: Sauvegardes chiffrees si l'hebergeur le supporte ou via outil dedie.
- **BAK-003**: Retention documentee (par defaut 7 a 30 jours preprod, plus longue production selon conformite).
- **BAK-004**: Au moins un test de restauration execute et documente avant le go.
- **BAK-005**: Sauvegardes des documents/objets si stockage active.
- **BAK-006**: Acces aux sauvegardes restreint et audite.

### Monitoring Requirements

- **MON-001**: `GET /admin/system/health` operationnel et autorise aux super admins.
- **MON-002**: Logs structures avec correlation id.
- **MON-003**: Alerting branche sur erreurs critiques sans dependance bloquante a l'IA.
- **MON-004**: Tableaux de bord de base si l'outillage est choisi (Sentry, Grafana, Uptime Kuma, monitoring de l'hebergeur). Le plan tranchera.
- **MON-005**: Surveillance des activations/desactivations publiques par scope (pays, produit, partenaire).

### Key Entities *(read or seeded)*

- **Country**: Catalogue complet (CIMA, FANAF, hors CIMA si prevus); activation publique controlee par flags par pays.
- **Product**: Catalogue complet (auto, moto, sante, voyage, habitation, vie/epargne, entreprise, transport, agricole, scolaire, microassurance, credit/caution, cyber, evenementiel, construction, autres prevus); associes a un ou plusieurs pays.
- **Offer**: Offres indicatives, validees, non expirees; importees via back-office ou script securise hors Git pour les vrais partenaires.
- **Partner / Broker**: Configurables par pays/produit, sans limite arbitraire; plans Starter/Pro/Enterprise; statuts actif/suspendu/expire/test/public.
- **PartnerLicense**: Licences valides datees, scopees pays/produit; importees via canal securise.
- **AccreditationDocument**: Documents d'agrement scopees au partenaire/license.
- **ConsentText / ConsentRecord**: Textes de consentement publies par pays/produit; ConsentRecord cree a chaque demande consentie.
- **QuoteFormDefinition**: Formulaires dynamiques par pays/produit.
- **QuoteRequest / Prospect**: Crees uniquement avec consentement valide.
- **LeadAssignment / RoutingDecision**: Crees pour les leads eligibles routes; refus traces pour les autres.
- **FeatureFlag**: Persistes Prisma-runtime; portee globale, pays, produit, partenaire, plan; fail-closed par defaut sur les sensibles.
- **AuditLog**: Durable Prisma-runtime; couvre toutes les actions sensibles, imports inclus.
- **User**: Comptes admin et courtiers, avec MFA selon role.
- **RegulatoryRegime**: Regimes reglementaires lies aux pays.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% des variables obligatoires manquantes provoquent un refus de demarrage clair (test sur chaque variable).
- **SC-002**: 0 secret reel commit dans le repo (verification automatisee).
- **SC-003**: 100% des migrations Prisma appliquables sur une base preprod vide sans erreur.
- **SC-004**: 100% des endpoints critiques de la checklist smoke repondent en preprod.
- **SC-005**: 100% des flags sensibles fermes par defaut sur preprod fraichement initialisee.
- **SC-006**: 100% des activations pays/produit/partenaire passent par un Super Admin authentifie et sont auditees.
- **SC-007**: 100% des demandes sans consentement refusees, sans persistance non conforme, sur le perimetre teste.
- **SC-008**: 100% des routages avec licence expiree bloques.
- **SC-009**: 0 module reglemente actif par defaut (paiement, signature, emission, sinistres, IA recommandation, API assureur).
- **SC-010**: 0 acces back-office depuis l'application publique.
- **SC-011**: 0 fuite tenant via parametre forge dans les tests.
- **SC-012**: 100% des audits sensibles durables.
- **SC-013**: 1 sauvegarde testee et restauree avant le go global.
- **SC-014**: 1 runbook par operation critique listee dans FR-029.
- **SC-015**: 1 checklist go/no-go executee par scope avant chaque activation publique.
- **SC-016**: 100% des contenus publics conformes au vocabulaire constitutionnel (verification source ou Playwright).
- **SC-017**: 0 wildcard CORS en preprod et production.
- **SC-018**: HTTPS et HSTS verifies sur les domaines preprod.
- **SC-019**: 100% des comptes admin avec MFA enroled.
- **SC-020**: 100% des comptes operationnels avec mot de passe initial change.
- **SC-021**: Catalogue pays cible 100% importable et configurable; chaque pays a un statut, des flags initialises et un regime reglementaire renseignes.
- **SC-022**: Catalogue produits cible 100% importable et configurable; chaque produit est associable a au moins un pays et possede formulaire/documents/disclaimers.
- **SC-023**: Architecture et scripts d'import des partenaires supportent le catalogue complet sans limite arbitraire (test avec un volume representatif).
- **SC-024**: Toutes les fonctionnalites prevues sont presentes dans l'environnement preprod (configurables), avec flags fail-closed pour les sensibles.

## Assumptions

- L'hebergeur cible n'est pas encore tranche; la spec reste neutre (Docker, VPS, Coolify, Dokploy, Render, Railway, Fly.io, serveur Linux ou autre auto-hebergement). Le plan tranchera selon les contraintes du projet.
- Le catalogue pays cible est connu de l'equipe produit et conformite (CIMA, FANAF, hors CIMA si prevus); la liste exacte sera figee au plan.
- Le catalogue produits cible est connu de l'equipe produit (PRD); la liste exacte sera figee au plan.
- Les partenaires reels et leurs licences sont importes hors Git via canal securise; aucun fichier brut ne transite par le repo.
- Les notifications email peuvent etre desactivees au depart si aucun fournisseur SMTP n'est encore choisi; sinon SMTP via fournisseur transactionnel a definir.
- Le stockage documents (S3) peut rester desactive si non requis; sinon credentials dedies par environnement.
- Le monitoring outils n'est pas encore choisi; la spec reste neutre.
- La revue secrets se fait au plan via outil ou audit manuel.
- Les migrations Prisma existantes sont appliquables proprement sur base vide en preprod.
- Les feature flags persistes via spec 011 sont fonctionnels.
- L'audit durable est garanti par les specs 010/011.
- Le seed reference peut s'appuyer sur les services existants (CountriesService, ProductsService, OffersModule, PartnersService, PartnerLicensesService, ConsentService, FeatureFlagsService, UsersService, AuthModule).
- L'activation publique d'un pays/produit/partenaire reste decoupee du seed et passe systematiquement par un Super Admin authentifie + audit.

## Risks

- Mauvaise configuration des domaines/CORS provoquant un melange entre application publique et back-office.
- Secret commit accidentellement; mitigation via revue + scan + pre-commit hook au plan.
- Sauvegarde non testee donnant une fausse assurance; mitigation via test obligatoire au go.
- Activation d'un module reglemente par erreur (paiement/signature/emission); mitigation via fail-closed et seed audit.
- Cache de feature flag stale masquant une desactivation rapide; mitigation via documentation et test.
- Auth admin sans MFA en cas de mauvaise configuration; mitigation via verification go/no-go.
- Stockage documents active sans backup associe; mitigation via desactivation par defaut.
- Notifications partant vers des adresses reelles en preprod; mitigation via desactivation des envois en preprod ou domaine de redirection.
- Compte admin avec mot de passe par defaut; mitigation via politique de premier login.
- Donnees confidentielles (partenaires reels, licences reelles) commit accidentellement; mitigation via scripts d'import securises hors Git, gitignore strict, revue.
- Hebergeur non tranche conduisant a re-travail au plan; mitigation via decision rapide en plan kickoff.
- Outils de monitoring non choisis; mitigation via decisions au plan.
- Volumetrie reelle catalogues sous-estimee; mitigation via tests de charge sur les endpoints d'agregation et import.
- Reglementation locale specifique non couverte par les seeds (langue, mentions, regulateur); mitigation via blocage activation publique tant que la conformite n'est pas validee pour ce pays.
- Activation publique simultanee mal cadree; mitigation via runbook activation progressive et go/no-go par scope.

## Open Questions for the Plan

- Quel hebergeur/orchestrateur pour preprod (Docker, VPS, Coolify, Dokploy, Render, Railway, Fly.io, autre)?
- Quels domaines pour public et back-office preprod?
- Quel fournisseur SMTP (ou notifications desactivees au depart)?
- Stockage documents requis (S3 compatible ou desactive) et politique de cycle de vie?
- Quel outil de monitoring/erreur (Sentry/Grafana/Uptime Kuma/hebergeur)?
- Quelle frequence de sauvegarde et duree de retention preprod?
- Quelle politique de mots de passe initiaux (longueur, expiration)?
- Quelles adresses email destinataires des alertes operationnelles?
- Quels seuils de rate limiting publics?
- Quelle CSP detaillee preprod et production?
- **Liste des pays cibles a importer/configurer** (CIMA, FANAF, hors CIMA), avec mentions legales locales et regulateurs?
- **Liste complete des produits a importer/configurer** (PRD), avec formulaires, documents et disclaimers?
- **Strategie d'import securise des partenaires/courtiers/licences** (format source, canal chiffre, validation des champs, audit) - script ou back-office?
- **Strategie d'activation publique** (progressive par scope ou globale) - critere de declenchement par pays, produit, partenaire?
- **Validation conformite par pays et par produit** - qui signe, sur quels criteres, quelle tracabilite?
- **Strategie de donnees de reference vs donnees sensibles** - quelles donnees publiables au repo, lesquelles strictement hors Git?
- Comptes admin operationnels (Super Admin, Admin Pays, Compliance Admin, Support Admin, Finance Admin, Content Admin, AI Admin) - qui les detient?
- Plan d'audit secrets et frequence (commit hook, scanner CI)?
- Procedure de communication avec courtiers (canal, frequence, contenu) lors d'activations publiques?
- Decision sur `multi_broker_routing_enabled` (active ou non par defaut) et conditions?
- Strategie pour modules reglementes prepares mais fermes (paiement, signature, emission, sinistres) - calendrier de validation reglementaire envisage par scope?

## Out Of Scope

- Generation de `plan.md`, `tasks.md`, implementation ou commit automatique.
- Nouvelles fonctionnalites metier non deja prevues dans l'architecture.
- Vente directe d'assurance par AssurMatch.
- Souscription directe par AssurMatch.
- Encaissement de prime sans validation reglementaire.
- Emission de police par AssurMatch.
- Attestation par AssurMatch.
- Signature electronique par AssurMatch.
- Sinistres en V1 actif sans validation.
- Conseil personnalise engageant.
- Recommandation officielle IA.
- Refonte UI complete.
- Acquisition marketing.
- Automatisation juridique complete.
- Multi-tenant white label.
- Multi-broker routing avance non deja prevu (sauf decision explicite au plan).
- Activation publique de modules reglementes sans validation reglementaire explicite.
