# Feature Specification: Socle plateforme AssurMatch

**Feature Branch**: `001-socle-plateforme`
**Created**: 2026-04-25
**Status**: Draft
**Input**: User description: "Creer la premiere specification fonctionnelle du socle AssurMatch a partir de la constitution ratifiee et du PRD projet."

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Ce socle definit AssurMatch comme plateforme technique B2B2C de comparaison indicative et de mise en relation avec des courtiers agrees. Il doit empecher toute vente directe, souscription directe, collecte de primes en V1, emission de contrat, emission d'attestation ou conseil personnalise engageant. Les modules commerciaux avances restent desactives tant qu'ils ne sont pas couverts par une specification et une validation conformite dediees.
- **Affected scopes**: Tous les pays, regimes reglementaires, produits, partenaires courtiers, licences, documents d'agrement, roles, permissions, comptes utilisateurs, back-office admin, fondations portail courtier, feature flags, consentements, audit logs, notifications techniques, configuration d'environnement, base du routage et base du module IA.
- **Required feature flags**: Le socle doit prevoir les flags globaux `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled`, `billing_enabled`, `ai_lead_scoring_enabled`, `ai_summary_enabled`, `ai_duplicate_detection_enabled`, `ai_recommendation_enabled`, `ai_broker_assistant_enabled`, `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, `whatsapp_enabled`, `sponsored_offers_enabled`, `multi_broker_routing_enabled`; les flags pays `country_public_enabled`, `country_waitlist_enabled`, `country_quote_enabled`, `country_comparison_enabled`, `country_broker_onboarding_enabled`, `country_ai_enabled`; les flags produit `product_public_enabled`, `product_quote_enabled`, `product_comparison_enabled`, `product_document_upload_enabled`, `product_sensitive_data_enabled`, `product_manual_review_required`, `product_ai_scoring_enabled`, `product_ai_form_assistant_enabled`; et des interrupteurs operationnels permettant de suspendre rapidement un partenaire ou un module.
- **Consent and transmission**: La transmission de leads n'est pas incluse dans cette spec. Le socle doit toutefois fournir les objets, textes versionnes et controles necessaires pour exiger un ConsentRecord valide avant toute transmission future. Toute tentative de transmission sans consentement valide doit etre bloquee et auditee.
- **Partner license controls**: Un partenaire courtier ne peut etre active ou rendu eligible a un routage futur que si ses licences et documents d'agrement sont presents, valides, non expires et scopes sur les pays et produits concernes. Une licence expiree, suspendue, invalide ou manquante bloque automatiquement le partenaire pour le scope concerne.
- **Audit and data history**: Les entites critiques doivent conserver createdAt, updatedAt, createdBy lorsque applicable, statut courant, historique exploitable et periode de validite si necessaire. Les actions sensibles doivent creer un AuditLog avec acteur, action, cible, contexte, resultat, horodatage et correlationId lorsque disponible.
- **Security and RBAC**: Le socle doit appliquer HTTPS sur les environnements exposes, MFA obligatoire pour administrateurs et courtiers, RBAC strict, isolation partenaire, limites d'export, masquage PII dans les logs, validation stricte des entrees, rate limiting et anti-spam sur les points publics ou sensibles.
- **Routing impact**: Le routage complexe est exclu. Le socle doit fournir les preconditions de routage: consentement valide, pays actif, produit actif, partenaire actif, autorisation pays/produit, licence valide, quotas/capacites configurables, exclusions et raison de non-routage auditee.
- **AI impact**: Le module IA est structurel seulement. Les fonctions de scoring, recommandation, assistant courtier, detection avancee et routage assiste restent desactivees par defaut. Tout appel IA futur devra passer par le module centralise, respecter les flags, minimiser les PII, auditer prompts/resultats et presenter les sorties comme assistance soumise a validation humaine lorsque sensible.
- **UX/content restrictions**: Les surfaces publiques et transactionnelles doivent employer les formulations autorisees telles que "Comparer les offres", "Demander un devis", "Etre rappele par un courtier agree", "offre indicative" et "prix a confirmer". Les formulations "acheter maintenant", "souscrire maintenant", "contrat valide", "garantie acceptee", "meilleure assurance du marche" et equivalents sont interdites.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initialiser le socle multi-pays et multi-produits (Priority: P1)

Un Super Admin veut creer les premiers pays, regimes reglementaires et produits dans un back-office controle afin de preparer l'expansion tout en gardant l'exposition publique desactivee par defaut.

**Why this priority**: Le catalogue pays/produits et les regimes reglementaires sont les fondations de toutes les futures activations commerciales.

**Independent Test**: Creer un pays pilote, son regime reglementaire, deux produits et leurs flags; verifier que les donnees sont visibles aux administrateurs mais non exposees publiquement tant que les flags publics restent desactives.

**Acceptance Scenarios**:

1. **Given** un Super Admin authentifie avec MFA et permissions completes, **When** il cree un pays, un regime reglementaire et un produit associe, **Then** les entites sont en statut interne ou brouillon, historisees, auditables et non publiques par defaut.
2. **Given** un pays avec `country_public_enabled` a false, **When** une interface publique ou un endpoint public demande ce pays, **Then** le pays n'est pas expose comme disponible et aucune demande de devis ne peut etre initiee.
3. **Given** un produit avec `product_public_enabled` ou `product_quote_enabled` a false, **When** un visiteur tente d'acceder a ce produit, **Then** le produit est masque ou bloque selon le flag, sans creation de demande ni transmission.

---

### User Story 2 - Gerer les partenaires courtiers et leurs agrements (Priority: P1)

Un Compliance Admin veut enregistrer des courtiers partenaires, leurs licences, pays, produits autorises et documents d'agrement afin que seuls les partenaires conformes puissent etre actives.

**Why this priority**: La validite des partenaires agrees est un pre-requis constitutionnel avant toute activation ou transmission future.

**Independent Test**: Creer un partenaire, ajouter une licence valide et un document d'agrement, activer le partenaire pour un pays/produit, puis verifier qu'une licence expiree ou suspendue bloque l'activation.

**Acceptance Scenarios**:

1. **Given** un partenaire avec licence valide, document d'agrement present, pays et produit autorises, **When** un Compliance Admin approuve son activation, **Then** le partenaire devient actif uniquement pour le scope approuve et un AuditLog est cree.
2. **Given** une licence expiree, suspendue, invalide ou hors scope pays/produit, **When** un admin tente d'activer le partenaire ou de le rendre eligible au routage, **Then** l'action est refusee, la raison est visible aux admins autorises et l'evenement est audite.
3. **Given** un utilisateur courtier appartenant a un partenaire, **When** il consulte les donnees de son organisation, **Then** il ne peut jamais voir les donnees, documents ou statuts internes d'un autre partenaire.

---

### User Story 3 - Administrer les utilisateurs, roles et permissions (Priority: P1)

Un Super Admin veut creer des utilisateurs internes et partenaires, leur assigner des roles et controler leurs permissions par pays, produit, partenaire et module.

**Why this priority**: Le RBAC strict et l'isolation partenaire conditionnent tous les modules sensibles du produit.

**Independent Test**: Assigner chaque role principal a un utilisateur de test et verifier qu'il peut uniquement lire, modifier ou exporter les ressources autorisees par son role et son scope.

**Acceptance Scenarios**:

1. **Given** un utilisateur admin sans MFA activee, **When** il tente d'acceder a une action sensible, **Then** l'acces est refuse jusqu'a activation et validation MFA.
2. **Given** un Broker Agent d'un partenaire A, **When** il tente de consulter ou modifier une ressource du partenaire B, **Then** l'acces est refuse, aucune donnee sensible n'est retournee et la tentative est auditee.
3. **Given** un Support Admin sans permission d'export, **When** il tente d'exporter des utilisateurs, documents, consentements ou journaux, **Then** l'export est refuse, limite a zero donnee retournee et audite.

---

### User Story 4 - Controler les feature flags et les desactivations rapides (Priority: P1)

Un Admin Pays ou Super Admin veut activer ou desactiver rapidement un pays, produit, partenaire ou module afin de respecter une contrainte reglementaire, operationnelle ou de securite.

**Why this priority**: Le principe "construire large, activer petit" repose sur des interrupteurs fiables et auditables.

**Independent Test**: Changer un flag global, pays et produit; suspendre un partenaire; verifier que les surfaces et actions concernees sont bloquees sans modifier les donnees sources.

**Acceptance Scenarios**:

1. **Given** `quote_request_enabled` a false, **When** un parcours futur tente de creer une demande de devis, **Then** l'action est bloquee avant tout traitement commercial et un message non trompeur est disponible.
2. **Given** un pays public rendu suspendu par un Admin Pays autorise, **When** un visiteur tente d'utiliser ce pays, **Then** le parcours est bloque ou redirige vers une attente selon configuration, sans transmission de lead.
3. **Given** un module IA desactive globalement, par pays, par produit, par partenaire ou par plan, **When** une fonctionnalite future demande une assistance IA, **Then** aucun appel modele n'est effectue et le fallback non IA est utilise ou l'action est bloquee.

---

### User Story 5 - Tracer les consentements, audits et documents critiques (Priority: P2)

Un Compliance Admin veut consulter les preuves de consentement, les changements sensibles et les documents d'agrement afin de pouvoir repondre a un controle, litige ou incident.

**Why this priority**: La preuve opposeable est indispensable avant les modules de devis, routage et portail courtier.

**Independent Test**: Creer un texte de consentement versionne, simuler un ConsentRecord, modifier une licence et telecharger un document; verifier l'historique, les droits d'acces et les AuditLogs.

**Acceptance Scenarios**:

1. **Given** un texte de consentement publie avec pays, produit, finalite et version, **When** un ConsentRecord est enregistre par un module futur, **Then** la preuve conserve le texte, la version, le destinataire prevu, le canal, le pays, le produit et l'horodatage.
2. **Given** une action sensible sur licence, role, permission, feature flag, document, consentement, IA ou routage, **When** l'action reussit ou echoue, **Then** un AuditLog exploitable est cree avec resultat et contexte.
3. **Given** un utilisateur sans permission document, **When** il tente de consulter ou telecharger un document d'agrement, **Then** l'acces est refuse et aucune URL ou donnee sensible n'est exposee.

---

### User Story 6 - Preparer les services techniques Redis, BullMQ, notifications, IA et routage (Priority: P2)

Un operateur technique ou admin autorise veut disposer d'un socle observable pour caches, files de jobs, notifications techniques, IA structurelle et pre-controles de routage sans activer les modules commerciaux avances.

**Why this priority**: Les futures phases dependront de caches coherents, de traitements asynchrones, de notifications minimales et de garde-fous IA/routage deja alignes sur la constitution.

**Independent Test**: Modifier un flag ou un produit et verifier l'invalidation cache; declencher une notification technique minimale; executer un pre-controle de routage non transmissif; verifier que les modules IA restent inactifs par defaut.

**Acceptance Scenarios**:

1. **Given** un flag pays ou produit modifie, **When** la modification est enregistree, **Then** le cache operationnel correspondant est invalide ou rafraichi et le changement devient coherent pour les lectures publiques et admin.
2. **Given** une notification technique de licence bientot expiree ou de job echoue, **When** l'evenement est emis, **Then** il est traite de maniere asynchrone, visible aux admins autorises et audite si sensible.
3. **Given** un pre-controle de routage pour un partenaire non autorise ou licence invalide, **When** l'eligibilite est evaluee sans transmission de lead, **Then** le partenaire est exclu, la raison est conservee et aucun courtier n'est notifie.

### Edge Cases

- Pays desactive ou waitlist-only: les surfaces publiques doivent masquer ou rediriger selon configuration, bloquer devis et routage, et conserver une trace d'administration du changement.
- Produit desactive, devis desactive ou revue humaine obligatoire: le produit doit etre masque, bloquer la demande ou forcer une revue humaine selon ses flags, sans promettre de couverture.
- Consentement manquant, expire ou hors scope destinataire: aucune transmission future ne doit etre possible; la tentative doit produire une raison de blocage auditable.
- Courtier inactif, non autorise, suspendu ou au-dessus de ses quotas: il doit etre exclu de toute eligibilite de routage et ne recevoir aucune notification de lead.
- Licence courtier expiree, suspendue, invalide ou hors pays/produit: activation et routage doivent etre bloques pour le scope concerne; une alerte de conformite doit etre disponible.
- Offre expiree, sponsorisee ou indicative: les offres commerciales sont hors perimetre de cette spec; le socle doit toutefois reserver les statuts, flags et audits necessaires pour que les specs futures n'affichent jamais une offre expiree comme disponible et signalent toute sponsorisation.
- IA desactivee globalement, par pays, produit, partenaire ou plan: aucun appel IA ne doit etre possible; les fonctions avancees doivent rester invisibles ou bloquees.
- Utilisateur sans permission de lecture, mutation ou export: l'action doit etre refusee sans fuite PII et auditee lorsque la ressource est sensible.
- Entree publique ou admin spammy, malformee, rate-limited ou doublon: la requete doit etre refusee avec message adapte, sans traitement lourd synchrone ni journalisation de PII brute.
- File de jobs indisponible ou notification echouee: l'echec doit etre visible aux admins autorises, retryable selon politique et ne doit pas masquer un blocage de conformite.
- Cache incoherent apres changement de flag: la lecture critique doit privilegier la securite et bloquer l'exposition jusqu'a coherence verifiee.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a modular foundation covering auth, users, RBAC, countries, regulatory regimes, products, partners, partner licenses, feature flags, consent, audit logs, documents, technical notifications, base AI, base routing, configuration, security conventions and test conventions.
- **FR-002**: System MUST align module boundaries with the ratified AssurMatch target architecture: NestJS modular backend, PostgreSQL as source of truth with Prisma, Redis for cache/locks/rate limits/flags, and BullMQ for asynchronous jobs.
- **FR-003**: System MUST keep comparator, complete quote request creation, Starter portal, Pro CRM, advanced dashboard, billing, premium payment, e-signature, attestation, policy issuance, claims, advanced partner API, advanced webhooks, AI recommendation/scoring and advanced multi-broker routing out of active scope.
- **FR-004**: System MUST default all public, commercial, payment, issuance, claims, insurer API, WhatsApp, sponsored offer, advanced AI and multi-broker routing flags to disabled unless explicitly activated by an authorized role.
- **FR-005**: System MUST block any action or label that implies direct sale, direct subscription, contract validity, attestation issuance, V1 premium collection or binding personalized advice by AssurMatch.
- **FR-006**: System MUST support user authentication, session/account lifecycle, MFA enrollment and MFA enforcement for all administrator and broker roles before sensitive access.
- **FR-007**: System MUST provide RBAC with roles, permissions, scope constraints and tenant isolation by partner, country, product and module where applicable.
- **FR-008**: System MUST verify role, permission, tenant, country, product, partner and plan scope before each sensitive read, mutation, export or administrative action.
- **FR-009**: System MUST allow authorized admins to create, update, suspend and retire countries with ISO code, currency, languages, timezone, regulatory family, operational status and activation flags.
- **FR-010**: System MUST allow authorized admins to manage regulatory regimes with country scope, legal texts, consent text dependencies and activation readiness status.
- **FR-011**: System MUST allow authorized admins to create product categories and products, associate products to countries, define product status, sensitivity, document requirements, manual review requirement and activation flags.
- **FR-012**: System MUST prevent a country or product from becoming public unless required legal text, consent configuration, activation flags and authorized admin approval are present.
- **FR-013**: System MUST allow authorized admins to create partner broker records with legal identity, plan, contact channels, status, authorized countries/products, quotas/capacities and operational suspension reason.
- **FR-014**: System MUST allow Compliance Admins to record partner licenses with license number/reference, issuing authority, country/product scope, status, effective date, expiration date and validation owner.
- **FR-015**: System MUST automatically block partner activation and routing eligibility when a required license is missing, expired, suspended, invalid or out of scope.
- **FR-016**: System MUST support partner accreditation document metadata, secure storage references, document type, status, expiration date, review status and access permissions.
- **FR-017**: System MUST support feature flags at global, country and product levels, plus operational suspend controls for partner and module-level shutdowns.
- **FR-018**: System MUST make feature flag changes auditable, attributable, reversible through recorded history, and reflected in public/admin reads within a measurable operational delay.
- **FR-019**: System MUST use Redis-backed operational capabilities for active country/product/flag cache, rate limiting, anti-spam controls, temporary routing locks, duplicate prevention hooks and job coordination where relevant.
- **FR-020**: System MUST invalidate or refresh affected cached reads when countries, products, partners, licenses or feature flags change.
- **FR-021**: System MUST define BullMQ-backed asynchronous job categories for technical notifications, document processing hooks, future IA jobs, future routing jobs and maintenance tasks without executing heavy work synchronously in public endpoints.
- **FR-022**: System MUST expose job status, failure reason, retry eligibility and audit context to authorized admins for critical technical jobs.
- **FR-023**: System MUST provide consent text management with purpose, country, product, channel, recipient category, language, version, publication status and effective dates.
- **FR-024**: System MUST provide ConsentRecord structure able to retain consent purpose, text version, country, product, channel, intended recipient, timestamp, source and withdrawal/anonymization status where applicable.
- **FR-025**: System MUST block and audit any future lead transmission attempt without a valid ConsentRecord scoped to the intended recipient, country, product and purpose.
- **FR-026**: System MUST create AuditLog entries for sensitive successes and failures, including auth events, MFA changes, role/permission changes, country/product changes, regulatory changes, partner changes, license changes, document access, consent text publication, consent record access, feature flag changes, routing pre-checks, AI configuration changes, exports, anonymization and queue/job intervention.
- **FR-027**: System MUST retain audit logs with actor, action, target, scope, timestamp, result, reason, correlationId when available and enough context to support compliance review without exposing unnecessary PII.
- **FR-028**: System MUST provide technical notifications for minimum operational events: license expiration warning, license blocked, partner suspended, feature flag changed, critical job failed, consent text changed and security-sensitive admin change.
- **FR-029**: System MUST allow authorized recipients to view notification status and delivery failures without exposing unrelated partner data.
- **FR-030**: System MUST provide a base AI module registry with AI feature flags, module status, allowed scopes, prompt/template metadata, quota hooks, audit categories and guardrail status, while keeping advanced AI functions inactive.
- **FR-031**: System MUST prevent any AI output from being treated as official recommendation, underwriting decision, binding advice, pricing decision, eligibility decision or routing decision.
- **FR-032**: System MUST audit future AI interactions with minimized input metadata, prompt/template reference, output metadata, guardrail result, human validation status and reason when sensitive.
- **FR-033**: System MUST provide a base routing configuration model for eligibility pre-checks, exclusions, quotas/capacity, country/product authorization, license validation, consent requirement and non-routable reasons without implementing advanced multi-broker routing.
- **FR-034**: System MUST ensure routing pre-checks are deterministic for mandatory blockers: no consent, disabled country, disabled product, inactive partner, unauthorized partner, expired/suspended/invalid license, over-quota partner and disabled routing module.
- **FR-035**: System MUST support environment configuration conventions for local, test, staging and production-like environments with secrets separated from committed configuration, HTTPS required on exposed environments and safe defaults for disabled modules.
- **FR-036**: System MUST standardize error responses for blocked actions so users receive clear non-sensitive explanations and admins receive traceable reasons.
- **FR-037**: System MUST protect PII by masking or excluding it from technical logs, limiting exports by permission/scope/volume and recording export attempts.
- **FR-038**: System MUST require pagination or bounded result sets for administrative lists of users, partners, countries, products, consent records, documents, notifications and audit logs.
- **FR-039**: System MUST provide health/readiness visibility for the foundation domains needed before later phases can be planned: database, cache, jobs, notifications, documents, auth and feature flags.
- **FR-040**: System MUST provide test conventions for unit, integration, RBAC, feature flags, audit, consent, license blocking, AI guardrails, Redis cache behavior, BullMQ job behavior and constitutional regression cases.

### Role Permissions

| Role | Foundation permissions |
|------|------------------------|
| Super Admin | Full platform administration, role assignment, emergency disable, all scopes, all audit reads, all configuration except no bypass of audit or constitutional blockers. |
| Admin Pays | Manage countries, country-product activation, local partners and local operational flags within assigned countries; cannot validate own compliance override without Compliance Admin permission. |
| Compliance Admin | Manage regulatory regimes, consent texts, partner licenses, accreditation documents, compliance alerts, audit review and compliance suspension. |
| Support Admin | Read limited operational data, assist account issues and view notification status; cannot modify licenses, critical flags, permissions or exports without explicit permission. |
| Broker Owner Starter | Access own partner account foundation data, own users and minimal notifications; no CRM, no cross-partner data and no advanced export by default. |
| Broker Owner Pro | Access own partner account foundation data, manage own users within partner scope and view plan-enabled module availability; CRM features remain out of scope. |
| Broker Manager | Manage assigned partner users and operational notifications when delegated; no platform-wide data or license validation. |
| Broker Agent | Authenticate and access only assigned partner foundation resources when later modules allow it; no admin configuration. |
| Broker Read-only | Read own partner foundation resources and allowed notifications; no mutation or export unless explicitly granted. |
| Finance Admin | Manage plan metadata and billing readiness flags; full billing and payment flows remain excluded. |
| Content Admin | Manage non-binding legal/support content and consent text drafts when allowed; cannot publish compliance text without required approval. |
| AI Admin | Manage base AI module configuration, prompt/template metadata and AI audit views; cannot activate regulated AI use without required flags and compliance approval. |

### Foundation API Endpoints

The following endpoints define the minimum API surface the foundation must make available or reserve for planning. They describe functional contracts, not implementation code.

| Area | Method | Endpoint | Primary roles | Purpose |
|------|--------|----------|---------------|---------|
| Auth | POST | `/auth/login` | All users | Authenticate a user and begin required MFA flow when applicable. |
| Auth | POST | `/auth/logout` | All users | End the active session. |
| Auth | GET | `/auth/me` | All users | Return current identity, roles, scopes and MFA status. |
| Auth | POST | `/auth/mfa/enroll` | Admins, brokers | Enroll MFA for eligible account. |
| Auth | POST | `/auth/mfa/verify` | Admins, brokers | Verify MFA before sensitive access. |
| Users | GET | `/admin/users` | Super Admin, scoped admins | List users with pagination and scope filters. |
| Users | POST | `/admin/users` | Super Admin, scoped admins | Create a user within permitted scope. |
| Users | PATCH | `/admin/users/:id` | Super Admin, scoped admins | Update account status, profile or scope. |
| RBAC | GET | `/admin/roles` | Super Admin, Compliance Admin | List roles and permissions. |
| RBAC | PATCH | `/admin/users/:id/roles` | Super Admin | Assign or revoke roles with audit. |
| Countries | GET | `/countries` | Public, admins | Return only public or waitlist-eligible countries to public callers. |
| Countries | CRUD | `/admin/countries` | Super Admin, Admin Pays | Manage country records, statuses and activation flags. |
| Regimes | CRUD | `/admin/regulatory-regimes` | Super Admin, Compliance Admin, Admin Pays | Manage regulatory regime records and country scope. |
| Products | GET | `/products?country=:code` | Public, admins | Return products visible for the requested country and caller scope. |
| Products | CRUD | `/admin/products` | Super Admin, Admin Pays | Manage product catalog and country-product association. |
| Partners | CRUD | `/admin/partners` | Super Admin, Admin Pays, Compliance Admin | Manage partner broker records and operational status. |
| Licenses | CRUD | `/admin/partners/:partnerId/licenses` | Compliance Admin | Manage partner licenses, scopes and validation state. |
| Documents | POST | `/admin/partners/:partnerId/documents` | Compliance Admin, authorized partner owners | Register or upload accreditation document metadata/file. |
| Documents | GET | `/admin/documents/:id` | Authorized admins, scoped partner owners | Retrieve authorized document metadata or access reference. |
| Feature Flags | GET | `/admin/feature-flags` | Super Admin, Admin Pays, Compliance Admin, AI Admin | List flags by scope. |
| Feature Flags | PATCH | `/admin/feature-flags/:id` | Super Admin, scoped authorized admins | Change a flag with reason, scope and audit. |
| Consent | CRUD | `/admin/consent-texts` | Compliance Admin, Content Admin with approval | Manage versioned consent texts. |
| Consent | GET | `/admin/consent-records` | Compliance Admin, Support Admin scoped | Search consent evidence with strict scope. |
| Audit | GET | `/admin/audit-logs` | Super Admin, Compliance Admin | Search audit logs with filters and export controls. |
| Notifications | GET | `/admin/notifications` | Authorized admins, scoped brokers | View technical notifications by scope. |
| Notifications | POST | `/admin/notifications/test` | Super Admin, Admin Pays | Send or queue a technical test notification. |
| Routing Base | POST | `/admin/routing/precheck` | Super Admin, Admin Pays, Compliance Admin | Evaluate non-transmissive routing eligibility and reasons. |
| AI Base | GET | `/admin/ai/modules` | Super Admin, AI Admin, Compliance Admin | List AI module status, flags and guardrails. |
| AI Base | PATCH | `/admin/ai/modules/:id` | AI Admin with compliance scope | Configure base AI module state without activating advanced features. |
| System | GET | `/admin/system/health` | Super Admin, Support Admin | View foundation health/readiness signals. |

### Rapid Disable Rules

- Disabling a global module flag must block the module across all countries, products, partners and plans, even if lower-scope flags remain enabled.
- Disabling `country_public_enabled` must remove the country from public availability and block quote/routing actions for that country.
- Enabling `country_waitlist_enabled` may show a non-commercial waitlist path only if no lead transmission occurs without a later consented flow.
- Disabling `product_public_enabled` must hide the product publicly; disabling `product_quote_enabled` must block any quote request creation for that product.
- Suspending a partner must make the partner ineligible for activation, routing, lead notification and future portal access beyond allowed account/compliance views.
- Expiring, suspending or invalidating a partner license must automatically block that partner for the affected country/product scope.
- Disabling an AI flag at any scope must prevent model calls and generated AI output for that scope.
- Emergency disable actions must require an authorized role, a reason, timestamped audit, and visible status for admins who operate the affected scope.

### Audit Rules

- Audit logs are mandatory for both successful and refused sensitive actions.
- Every audit entry must include at minimum actor, action, target type, target id or stable reference, scope, result, reason when refused, timestamp and correlationId when available.
- PII in audit context must be minimized, masked or replaced by stable references unless a compliance use case requires access and the actor is authorized.
- Audit logs must be searchable by date, actor, target, country, product, partner, action and result.
- Audit history must record before/after state summaries for feature flags, statuses, roles, permissions, licenses, consent text publication and partner activation.
- Export, anonymization and deletion requests must be audited even when refused.

### Tests To Cover Later

- Unit tests for role permission decisions, feature flag resolution, country/product status logic, partner eligibility, license expiry, consent validity and routing pre-check blockers.
- Integration tests for auth/MFA, scoped user administration, country/product public visibility, partner/license workflows, document access, consent text publication and audit log creation.
- RBAC regression tests proving that each role can access only allowed resources and that cross-partner access always fails.
- Feature flag tests for global, country, product, partner/module suspend controls and cache invalidation behavior.
- Compliance tests for no consent, expired license, disabled country, disabled product, unauthorized partner, unauthorized export and forbidden public wording.
- Redis behavior tests for cache refresh/invalidation, rate limiting, anti-spam hooks, temporary locks and duplicate-prevention hooks.
- BullMQ behavior tests for queued technical notifications, failure visibility, retry policy and no heavy public synchronous work.
- AI guardrail tests proving disabled AI makes no model call, outputs are assistance only, PII is minimized, sensitive output requires human validation and no official recommendation is produced.
- Data history tests proving createdAt, updatedAt, createdBy, validity periods and status history are present for critical entities.
- Operational readiness tests for health status, environment configuration, secrets absence from committed config and safe disabled defaults.

### Key Entities *(include if feature involves data)*

- **User**: Authenticated person with identity, account status, MFA status, assigned roles, scopes and audit history references.
- **Role**: Named access profile such as Super Admin, Admin Pays, Compliance Admin, Support Admin, Broker Owner Starter, Broker Owner Pro, Broker Manager, Broker Agent, Broker Read-only, Finance Admin, Content Admin and AI Admin.
- **Permission**: Fine-grained allowed action with resource, operation, scope and export sensitivity.
- **PartnerTenant**: Isolation boundary for a broker partner and its users, documents, notifications and future leads.
- **Country**: Country record with ISO code, currency, languages, timezone, regulatory family, operational status and public/waitlist/quote/comparison/onboarding/AI flags.
- **RegulatoryRegime**: Compliance framework associated with one or more countries, legal text dependencies, consent requirements and activation readiness.
- **ProductCategory**: Product grouping such as auto, health, travel, habitation, enterprise, transport, agriculture, school, microinsurance, credit/caution, cyber, event or construction.
- **Product**: Insurance product definition with country availability, sensitivity, required documents, manual review rule and public/quote/comparison/document/sensitive-data/AI flags.
- **Partner/Broker**: Broker partner record with legal identity, plan, status, allowed countries/products, contact channels, quotas, capacity and suspension reason.
- **PartnerLicense**: License or authorization with issuing authority, reference, country/product scope, status, effective date, expiration date and validation history.
- **AccreditationDocument**: Partner document metadata and secure file reference with type, status, expiration date, review owner and access restrictions.
- **FeatureFlag**: Activation record with key, scope type, scope id, value, default, reason, owner, history and cache invalidation state.
- **ConsentText**: Versioned text for a specific purpose, country, product, channel, language and recipient category.
- **ConsentRecord**: Evidence of a user's consent with purpose, text version, country, product, channel, intended recipient, timestamp, source and withdrawal/anonymization state.
- **AuditLog**: Immutable compliance event with actor, action, target, scope, context, result, reason and correlationId.
- **Notification**: Technical notification event with recipient scope, type, status, delivery channel, retry state and related audit reference.
- **QueueJobRecord**: Operational view of asynchronous job category, status, failure reason, retry eligibility and correlationId.
- **AIModuleConfig**: AI module registry entry with enabled state, allowed scopes, guardrails, prompt/template references, audit policy and quota hooks.
- **AIInteraction**: Future auditable AI event containing minimized input metadata, prompt/template reference, output metadata, guardrail result and human validation status.
- **RoutingPrecheck**: Non-transmissive eligibility evaluation with country, product, partner, consent state, license state, quotas, result and refusal reasons.
- **EnvironmentSetting**: Non-secret operational configuration reference with environment scope, safe default, owner and audit history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized admin can configure one pilot country, one regulatory regime, two products, one partner, one valid license and required foundation flags in under 30 minutes without making the country or products public by default.
- **SC-002**: 100% of sensitive actions listed in Audit Rules produce an AuditLog for both accepted and refused outcomes during acceptance testing.
- **SC-003**: 0 future or simulated lead transmissions are allowed without a valid ConsentRecord scoped to the intended country, product, purpose and recipient.
- **SC-004**: 0 cross-partner reads, mutations or exports succeed across the RBAC acceptance tests for broker roles.
- **SC-005**: Emergency disable of a country, product, partner or AI/module flag prevents the affected public exposure or sensitive execution within 2 minutes of the authorized change in acceptance testing.
- **SC-006**: 100% of activation or routing eligibility checks block partners with missing, expired, suspended, invalid or out-of-scope licenses.
- **SC-007**: 95% of public catalog reads for enabled countries/products return the correct enabled/disabled status to users in under 1 second during acceptance testing.
- **SC-008**: 95% of technical notification jobs reach a visible queued, delivered, failed or retryable state within 5 minutes during operational acceptance testing.
- **SC-009**: 0 AI model calls occur when the relevant global, country, product, partner or plan AI flag is disabled in acceptance testing.
- **SC-010**: The planned test suite covers 100% of applicable constitutional blockers: disabled country, disabled product, no consent, expired license, unauthorized broker, disabled AI, unauthorized export and non-routable lead.

## Assumptions

- The first public launch remains limited by explicit activation; all countries, products and commercial modules are internal or disabled until approved.
- This spec prepares Phase 1 "Socle plateforme" and does not activate the public comparator, full quote request flow, Starter portal, Pro CRM, advanced dashboard, billing, payments, e-signature, policy issuance, claims, partner API, advanced webhooks, AI recommendation/scoring or advanced routing.
- The PRD is the primary business source, but the constitution is authoritative whenever scope, wording, compliance or activation rules diverge.
- Consent management is included as foundation data and control logic; real visitor quote submission and lead transmission will be specified later.
- Partner documents are stored and controlled as accreditation evidence; legal review workflow may be expanded in later specs.
- Notifications are limited to technical and compliance operations such as license warnings, job failures, security-sensitive changes and flag changes.
- API endpoints listed here are foundation contracts to plan; detailed schemas, transport security and implementation details belong to the planning phase.
- Data retention and anonymization rules are configurable by country/regime and will follow the compliance policy validated for each market.
