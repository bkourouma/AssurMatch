# Feature Specification: Comparateur public et demande de devis AssurMatch

**Feature Branch**: `002-comparateur-demande-devis`
**Created**: 2026-04-25
**Status**: Draft
**Input**: User description: "Creer la specification fonctionnelle 002-comparateur-demande-devis pour AssurMatch: parcours public permettant a un visiteur de selectionner un pays, choisir un produit, consulter des offres indicatives, comparer les offres disponibles, demander un devis, donner son consentement explicite et creer un lead routable vers un courtier partenaire autorise."

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette feature expose AssurMatch comme plateforme technique de comparaison indicative et de mise en relation avec des courtiers partenaires autorises. Elle ne doit jamais vendre directement une assurance, encaisser une prime, permettre une souscription, emettre une police, emettre une attestation, donner un conseil personnalise engageant ou presenter une offre comme un choix officiel. Toutes les offres et prix publics doivent rester "offre indicative", "prix a confirmer" et "a confirmer par le courtier partenaire".
- **Affected scopes**: Site public pays, site public produits, catalogue produits actifs par pays, offres indicatives actives, formulaires de demande de devis, prospects, QuoteRequest, LeadAssignment, ConsentRecord, partenaires courtiers, licences partenaires, routage simple, notifications minimales visiteur/courtier, audit logs, Redis anti-spam/rate limiting/doublons, BullMQ notifications/IA, module IA resume optionnel, back-office de suivi minimal pour demandes non routables.
- **Required feature flags**: Globaux `public_comparator_enabled`, `quote_request_enabled`, `sponsored_offers_enabled`, `ai_summary_enabled`, `ai_duplicate_detection_enabled` si utilise pour assistance interne seulement; pays `country_public_enabled`, `country_quote_enabled`, `country_comparison_enabled`, `country_ai_enabled`; produit `product_public_enabled`, `product_quote_enabled`, `product_comparison_enabled`, `product_sensitive_data_enabled`, `product_manual_review_required`, `product_ai_form_assistant_enabled` uniquement si un assistant de formulaire futur est active; partenaire/statut operationnel actif; les flags `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, `multi_broker_routing_enabled` restent hors perimetre et doivent rester sans effet sur ce parcours.
- **Consent and transmission**: Un ConsentRecord `lead_transmission` valide, versionne, horodate et scope sur le pays, le produit, le canal public web, la finalite et le destinataire prevu est obligatoire avant toute transmission a un courtier. Sans consentement explicite coche ou confirme par le visiteur, la demande est refusee, aucun LeadAssignment n'est cree, aucun courtier n'est notifie et le refus est audite.
- **Partner license controls**: Le routage ne peut choisir qu'un courtier partenaire actif, autorise pour le pays et le produit, sous quota/capacite disponible, avec licence valide, non expiree, non suspendue, non invalide et couvrant le scope concerne. Le courtier responsable doit etre identifiable dans la confirmation de transmission lorsque la demande est routee.
- **Audit and data history**: Les actions sensibles doivent creer un AuditLog exploitable: exposition ou refus de parcours par flags, refus de produit/pays, tentative de demande sans consentement, validation consentement, creation QuoteRequest, creation Prospect, evaluation de routage, exclusion de courtier, absence de courtier disponible, creation LeadAssignment, notification visiteur/courtier, detection doublon, rate limit, anti-spam, appel IA et sortie IA. Les entites critiques doivent conserver createdAt, updatedAt, createdBy lorsque applicable, statut, raison de refus et correlationId.
- **Security and RBAC**: Les endpoints publics doivent appliquer validation stricte, rate limiting, anti-spam, protection contre doublons et masquage PII dans les logs. Les endpoints internes de consultation ou correction des demandes sont soumis au RBAC, au tenant partenaire, au pays, au produit, au plan et a la MFA pour courtiers/admins. Un courtier ne peut voir que les leads qui lui sont assignes.
- **Routing impact**: Le routage est simple et deterministe: selectionner au plus un courtier eligible selon les preconditions obligatoires, puis creer un LeadAssignment. Le routage multi-courtiers avance, les priorites complexes, les encheres, les webhooks avances et les API assureur sont exclus. Tout lead non routable reste non transmis avec raison conservee.
- **AI impact**: Le resume IA de la demande est optionnel, non bloquant et execute seulement si tous les flags IA applicables sont actifs. Il doit minimiser les PII, passer par le module IA centralise, creer une trace AIInteraction/AuditLog, etre marque comme assistance et ne jamais recommander officiellement une offre, un prix, un courtier, une couverture, une acceptation ou un refus.
- **UX/content restrictions**: Les CTA publics autorises sont "Comparer les offres", "Demander un devis" et "Etre rappele par un courtier partenaire". Les pages et notifications doivent eviter "acheter", "souscrire maintenant", "contrat valide", "garantie acceptee", "meilleure assurance du marche" et toute formulation equivalente. Les offres sponsorisees doivent etre clairement identifiees et ne doivent pas masquer le caractere indicatif du classement.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Selectionner un pays et un produit public (Priority: P1)

Un visiteur arrive sur AssurMatch, choisit un pays actif puis consulte les produits d'assurance actifs et comparables pour ce pays afin de demarrer un parcours public conforme.

**Why this priority**: Le pays et le produit determinent les flags, les textes de consentement, les offres, les validations et les courtiers eligibles. Sans ce filtrage, le parcours risque d'exposer un marche non active ou un produit interdit.

**Independent Test**: Activer un pays pilote et deux produits publics, laisser un pays et un produit desactives, puis verifier que seuls les elements autorises apparaissent au visiteur.

**Acceptance Scenarios**:

1. **Given** `public_comparator_enabled`, `country_public_enabled` et `country_comparison_enabled` sont actifs pour un pays, **When** le visiteur ouvre la page pays, **Then** il voit la page publique du pays avec le role technique d'AssurMatch et les produits actifs disponibles.
2. **Given** un pays avec `country_public_enabled` a false, **When** le visiteur tente d'ouvrir la page pays ou une URL profonde du comparateur, **Then** le parcours est bloque ou redirige vers une attente configuree, sans afficher d'offres ni creer de demande.
3. **Given** un produit avec `product_public_enabled` a false, **When** le visiteur consulte les produits du pays, **Then** ce produit n'est pas affiche publiquement.
4. **Given** un produit public mais `product_comparison_enabled` a false, **When** le visiteur ouvre la page produit, **Then** le produit peut etre decrit sans comparaison d'offres et sans promesse de devis si `product_quote_enabled` est aussi false.

---

### User Story 2 - Comparer des offres indicatives actives (Priority: P1)

Un visiteur consulte les offres indicatives actives pour un pays et un produit, applique des filtres simples, trie les resultats et ouvre le detail d'une offre sans recevoir de conseil engageant.

**Why this priority**: Le coeur public du comparateur doit apporter de la transparence tout en evitant l'affichage d'offres expirees, non validees ou trompeuses.

**Independent Test**: Publier plusieurs offres actives, une offre expiree, une offre non validee et une offre sponsorisee; verifier l'affichage, les filtres, le tri, le detail et les mentions obligatoires.

**Acceptance Scenarios**:

1. **Given** des offres actives, validees et dans leur periode de validite pour le pays et le produit, **When** le visiteur consulte la page produit, **Then** il voit uniquement ces offres avec les mentions "offre indicative", "prix a confirmer" et "courtier partenaire".
2. **Given** une offre expiree ou non validee, **When** le visiteur consulte le comparateur ou le detail d'offre, **Then** cette offre n'est jamais affichee comme disponible.
3. **Given** une offre sponsorisee active, **When** elle apparait dans une liste ou un detail, **Then** la sponsorisation est clairement identifiee et ne se substitue pas aux criteres de tri choisis par le visiteur.
4. **Given** des filtres simples disponibles, **When** le visiteur filtre par fourchette de prix indicatif, type de garanties ou courtier partenaire, **Then** les resultats affiches respectent le filtre sans masquer les mentions obligatoires.
5. **Given** des tris simples disponibles, **When** le visiteur trie par prix indicatif, nom d'offre, date de mise a jour ou sponsorisation explicite, **Then** l'ordre change sans presenter le premier resultat comme une recommandation officielle.

---

### User Story 3 - Demander un devis avec formulaire dynamique et consentement explicite (Priority: P1)

Un visiteur remplit une demande de devis adaptee au pays et au produit, valide son email et son telephone selon le pays, donne son consentement explicite, puis soumet une demande routable.

**Why this priority**: La collecte de demande est la bascule entre information publique et donnees personnelles; elle doit etre validee, consentie et auditee avant transmission.

**Independent Test**: Configurer un formulaire pays/produit avec champs obligatoires, soumettre une demande valide avec consentement, puis soumettre des variantes sans consentement, email invalide, telephone invalide et produit quote-disabled.

**Acceptance Scenarios**:

1. **Given** `quote_request_enabled`, `country_quote_enabled` et `product_quote_enabled` sont actifs, **When** le visiteur ouvre le formulaire de demande de devis pour le pays et le produit, **Then** il voit les champs dynamiques requis et les mentions de transmission au courtier partenaire.
2. **Given** un email ou telephone invalide pour le pays selectionne, **When** le visiteur soumet le formulaire, **Then** la demande est refusee avec un message non sensible et aucune transmission n'est effectuee.
3. **Given** la case de consentement explicite n'est pas cochee ou le texte de consentement publie est indisponible, **When** le visiteur soumet le formulaire, **Then** aucun QuoteRequest routable, Prospect ni LeadAssignment n'est cree, aucun courtier n'est notifie et un AuditLog de refus est cree.
4. **Given** un formulaire valide et un ConsentRecord `lead_transmission` cree avec la version du texte, **When** le visiteur confirme sa demande, **Then** le systeme cree un QuoteRequest et un Prospect associes avec statut initial traceable.

---

### User Story 4 - Router simplement vers un courtier eligible (Priority: P1)

Apres consentement, le systeme evalue les courtiers partenaires et transmet la demande a un seul courtier actif, autorise et licencie, ou conserve la demande comme non routable si aucun courtier n'est disponible.

**Why this priority**: Le routage est une decision sensible qui engage la conformite, la valeur du lead et la responsabilite du courtier partenaire.

**Independent Test**: Configurer un courtier eligible, un courtier inactif, un courtier sans licence valide et un courtier non autorise; verifier que seul le courtier eligible peut recevoir un LeadAssignment.

**Acceptance Scenarios**:

1. **Given** un QuoteRequest valide avec consentement et un courtier actif, autorise pour le pays/produit, sous capacite et avec licence valide, **When** le routage simple s'execute, **Then** un LeadAssignment est cree pour ce courtier et la decision est auditee.
2. **Given** un courtier inactif, **When** le routage evalue les candidats, **Then** ce courtier est exclu, aucun lead ne lui est transmis et la raison est journalisee.
3. **Given** un courtier sans licence valide, avec licence expiree, suspendue, invalide ou hors scope, **When** le routage evalue les candidats, **Then** ce courtier est exclu, aucun lead ne lui est transmis et la raison est journalisee.
4. **Given** aucun courtier eligible n'est disponible, **When** le routage s'execute, **Then** aucun LeadAssignment n'est cree, aucun courtier n'est notifie, le QuoteRequest passe en statut non routable ou en attente operationnelle, et le visiteur recoit une confirmation adaptee.

---

### User Story 5 - Confirmer et notifier minimalement (Priority: P2)

Le visiteur recoit une confirmation claire et le courtier assigne recoit une notification minimale sans exposition excessive de donnees personnelles.

**Why this priority**: Les notifications ferment la boucle utilisateur et donnent au courtier l'information necessaire pour recontacter le prospect, sans transformer AssurMatch en vendeur ou assureur.

**Independent Test**: Soumettre une demande routee et une demande non routable; verifier les messages visiteur, la notification courtier, l'absence de notification pour courtier non eligible et les statuts de livraison.

**Acceptance Scenarios**:

1. **Given** une demande routee, **When** le LeadAssignment est cree, **Then** le visiteur recoit une confirmation indiquant que la demande sera traitee par un courtier partenaire identifie, sans promesse de prix ferme ou d'acceptation.
2. **Given** une demande routee, **When** la notification courtier est preparee, **Then** seul le courtier assigne recoit une notification minimale avec reference de lead, pays, produit, informations utiles consenties et consignes de traitement.
3. **Given** une demande non routable faute de courtier eligible, **When** la confirmation visiteur est envoyee, **Then** elle indique que la demande ne peut pas etre transmise a un courtier partenaire pour le moment et ne promet pas de rappel.
4. **Given** une notification echoue, **When** le statut de livraison est mis a jour, **Then** l'echec est visible aux roles autorises et retryable selon la politique operationnelle, sans dupliquer la transmission du lead.

---

### User Story 6 - Bloquer spam, doublons et entrees non conformes (Priority: P2)

Le systeme protege le parcours public contre les abus, les soumissions repetitives, les doublons simples et les donnees malformees.

**Why this priority**: La qualite des leads et la protection des donnees dependent de controles publics robustes avant creation et routage.

**Independent Test**: Simuler des soumissions rapides, un doublon par email/telephone, un formulaire malforme et une tentative depassant les limites par IP; verifier les refus, statuts et audits.

**Acceptance Scenarios**:

1. **Given** un visiteur depasse la limite de soumission configuree, **When** il soumet une nouvelle demande, **Then** la demande est refusee ou retardee, aucun courtier n'est notifie et un AuditLog non-PII est cree.
2. **Given** une demande recente existe avec le meme pays, produit et empreinte email/telephone, **When** le visiteur soumet une demande similaire, **Then** le systeme la marque comme doublon potentiel ou la bloque selon la politique, sans creer un second LeadAssignment actif vers un courtier.
3. **Given** une entree spammy, malformee ou contenant des donnees inattendues, **When** le formulaire est soumis, **Then** la validation refuse l'entree avant traitement lourd et sans journaliser de PII brute.

---

### User Story 7 - Generer un resume IA optionnel de la demande (Priority: P3)

Lorsque les flags IA sont actifs, le systeme peut produire un resume operationnel de la demande pour aider le courtier ou le support, sans influencer officiellement le choix d'offre ni le routage.

**Why this priority**: Le resume IA peut accelerer la prise en charge, mais il est secondaire et doit rester strictement encadre.

**Independent Test**: Activer puis desactiver les flags IA globaux/pays/produit; verifier la presence ou l'absence d'appel modele, l'audit, le marquage assistance et l'absence de recommandation.

**Acceptance Scenarios**:

1. **Given** `ai_summary_enabled`, `country_ai_enabled` et les flags produit applicables sont actifs, **When** une demande consentie est creee, **Then** un resume IA peut etre genere en tache asynchrone avec PII minimisee, audit et marquage assistance.
2. **Given** un flag IA applicable est desactive, **When** une demande est creee, **Then** aucun appel modele n'est effectue et le parcours se poursuit sans resume IA.
3. **Given** un resume IA contient une formulation de recommandation, tarification ferme ou eligibilite, **When** les garde-fous l'evaluent, **Then** la sortie est rejetee ou marquee en revue humaine et ne devient pas visible comme decision.

### Edge Cases

- Pays desactive, suspendu ou waitlist-only: la page pays et les URLs profondes doivent bloquer comparaison, devis et routage, ou rediriger vers une attente non commerciale selon configuration.
- Produit desactive, comparaison desactivee, devis desactive ou revue manuelle obligatoire: le produit est masque ou limite selon ses flags; la demande est bloquee ou creee en statut revue manuelle sans transmission automatique.
- Consentement manquant, non coche, retire, expire, hors finalite ou hors destinataire: aucune transmission ni LeadAssignment; refus audite.
- Courtier inactif, suspendu, hors capacite, non autorise pour le pays/produit ou non visible selon plan: courtier exclu, pas de notification, raison auditee.
- Licence courtier manquante, expiree, suspendue, invalide, revoquee ou hors pays/produit: courtier exclu et alerte conformite exploitable.
- Offre expiree, non validee, suspendue, hors pays/produit ou hors periode de validite: offre jamais publique ni utilisable comme reference de demande.
- Offre sponsorisee: badge ou libelle visible dans liste, detail et tout tri sponsorise; aucune confusion avec recommandation.
- Aucun courtier disponible: demande non transmise, confirmation visiteur adaptee, suivi operationnel possible par roles autorises, pas de notification courtier.
- Donnees visiteur invalides: refus clair, non sensible, avec possibilite de correction; aucune PII brute dans les logs.
- Soumission spammy, rate-limited ou doublon: blocage ou marquage sans traitement lourd et sans second lead actif.
- File de notification indisponible: creation de lead conservee si deja conforme; notification en echec visible et retryable; aucun envoi multiple non controle.
- Cache de flags, produits ou offres incoherent: fail closed sur exposition publique et routage jusqu'a resolution.
- IA desactivee ou en erreur: aucun appel modele si desactive; si erreur, la demande reste valide et le resume est omis ou marque en echec.
- Utilisateur courtier non assigne ou sans permission: aucun acces au lead, refus RBAC audite.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose public country pages only when `public_comparator_enabled` and `country_public_enabled` allow public access.
- **FR-002**: System MUST expose public product pages only for products active in the selected country and allowed by `product_public_enabled`.
- **FR-003**: System MUST list products by country using country/product associations from the foundation and hide inactive, suspended or non-public products from public visitors.
- **FR-004**: System MUST allow a public visitor to navigate from country selection to product selection to offer comparison without authentication.
- **FR-005**: System MUST block quote request initiation when `quote_request_enabled`, `country_quote_enabled` or `product_quote_enabled` is disabled.
- **FR-006**: System MUST block offer comparison when `country_comparison_enabled` or `product_comparison_enabled` is disabled.
- **FR-007**: System MUST display only offers that are active, validated, associated with the selected country/product and inside their validity period.
- **FR-008**: System MUST never display expired, retired, suspended, draft, non-validated or out-of-scope offers as public available offers.
- **FR-009**: System MUST mark every public offer and price with the required wording "offre indicative", "prix a confirmer" and "courtier partenaire" or equivalent approved wording.
- **FR-010**: System MUST clearly identify sponsored offers anywhere they are displayed, including list cards, comparison tables, detail pages and sponsored sort modes.
- **FR-011**: System MUST provide simple offer filters for at least price range, coverage/category attributes where available, partner broker and sponsored/non-sponsored visibility.
- **FR-012**: System MUST provide simple offer sorting for at least indicative price, offer name, last updated date and explicit sponsored placement where enabled.
- **FR-013**: System MUST ensure sorting and filtering never imply official recommendation, best contract, guaranteed eligibility or binding advice.
- **FR-014**: System MUST provide an offer detail view with offer scope, indicative price, key guarantee summary, exclusions/limits summary when available, validity period, sponsor label when applicable and broker partner responsibility wording.
- **FR-015**: System MUST provide a dynamic quote request form determined by country, product and product sensitivity.
- **FR-016**: System MUST keep dynamic form fields bounded to information necessary for indicative quote handling and lead routing.
- **FR-017**: System MUST validate required fields, email format and phone format according to the selected country before creating business records.
- **FR-018**: System MUST normalize valid phone numbers to an international format or store a country-scoped phone representation sufficient for broker contact.
- **FR-019**: System MUST present the applicable published consent text before submission, including finality, country, product, channel, text version and intended recipient or recipient category.
- **FR-020**: System MUST require an explicit affirmative consent action before creating a routable QuoteRequest, Prospect or LeadAssignment.
- **FR-021**: System MUST reject submission without valid consent and create an AuditLog for the refused transmission attempt.
- **FR-022**: System MUST create a ConsentRecord for accepted consent before transmitting any request to a broker.
- **FR-023**: System MUST create a QuoteRequest for each valid, consented quote request with stable public/internal reference, country, product, source channel, selected offer reference when applicable, request payload reference, status and timestamps.
- **FR-024**: System MUST create or link a Prospect for each valid request using normalized contact data and duplicate-detection results.
- **FR-025**: System MUST store PII in controlled fields and avoid raw PII in technical logs, audit context, queue payloads and AI prompts.
- **FR-026**: System MUST run simple duplicate detection using country, product and normalized contact identifiers before creating a new active LeadAssignment.
- **FR-027**: System MUST block or mark potential duplicate requests according to configured policy and preserve a non-PII duplicate reason for authorized review.
- **FR-028**: System MUST apply public rate limiting and anti-spam controls before expensive validation, routing, notification or AI work.
- **FR-029**: System MUST audit rate-limited and anti-spam refusals with minimized context.
- **FR-030**: System MUST evaluate routing only after consent, valid country/product flags, valid request payload and duplicate policy have passed.
- **FR-031**: System MUST route a request to at most one broker in this feature.
- **FR-032**: System MUST consider only brokers that are active, not suspended, authorized for the country, authorized for the product and operationally available.
- **FR-033**: System MUST verify valid broker license for the selected country/product immediately before LeadAssignment creation.
- **FR-034**: System MUST exclude and audit brokers with missing, expired, suspended, invalid, revoked or out-of-scope licenses.
- **FR-035**: System MUST exclude and audit brokers that are inactive, non-authorized, over quota or operationally blocked.
- **FR-036**: System MUST create a LeadAssignment only when an eligible broker is found and the request has valid consent.
- **FR-037**: System MUST persist LeadAssignment with unique stable identifier, assigned broker, assignment status, assignment reason, source QuoteRequest, country, product and audit reference.
- **FR-038**: System MUST set QuoteRequest status to routed when LeadAssignment succeeds and to non-routable or pending manual review when no eligible broker is available.
- **FR-039**: System MUST never notify a broker unless the broker is the assigned eligible broker for that LeadAssignment.
- **FR-040**: System MUST notify the assigned broker minimally with lead reference, country, product, consented contact data required for follow-up and no unrelated offer or cross-partner data.
- **FR-041**: System MUST notify the visitor minimally after submission with the request reference, indicative nature of displayed offers, and either the assigned broker identity or the non-routable state.
- **FR-042**: System MUST avoid any visitor confirmation wording that promises a firm price, coverage acceptance, contract creation, attestation, subscription or guaranteed callback when no broker is available.
- **FR-043**: System MUST create AuditLog entries for QuoteRequest creation, Prospect creation/linking, ConsentRecord creation, routing decision, routing refusal, LeadAssignment creation and notification scheduling.
- **FR-044**: System MUST expose authorized internal views for QuoteRequest, Prospect and LeadAssignment search with pagination, filters and scoped access.
- **FR-045**: System MUST expose broker access only to leads assigned to that broker tenant and must audit refused cross-broker access.
- **FR-046**: System MUST make all sensitive list endpoints paginated and bounded.
- **FR-047**: System MUST support manual operational review for non-routable or duplicate requests without allowing unsupported sale, underwriting, issuance or advice.
- **FR-048**: System MUST ensure disabled global, country or product flags fail closed for public display, request creation and routing.
- **FR-049**: System MUST ensure every public page and transactional notification uses approved wording and avoids constitutionally forbidden phrases.
- **FR-050**: System MUST support optional AI request summary only when `ai_summary_enabled`, country AI and applicable product/partner/plan AI flags allow it.
- **FR-051**: System MUST generate AI summary asynchronously and non-blockingly after the compliant request has been created.
- **FR-052**: System MUST prevent AI from determining routing eligibility, selecting the broker, ranking offers as official recommendation, pricing, underwriting or deciding acceptance.
- **FR-053**: System MUST audit AI prompt/template reference, minimized input reference, output reference, guardrail result and visibility state.
- **FR-054**: System MUST reject or quarantine AI output that contains official recommendation, firm price, legal advice, discriminatory content, PII leakage or unsupported eligibility decision.
- **FR-055**: System MUST keep payment, subscription, policy issuance, attestation, claims, insurer API, advanced webhooks, billing and advanced multi-broker routing outside the active scope of this feature.

### Non-Functional Requirements

- **NFR-001**: 95% of enabled public country, product and offer-list page loads MUST provide visible primary content in under 2 seconds under acceptance-test load.
- **NFR-002**: 95% of valid quote submissions MUST return a visitor confirmation state in under 5 seconds excluding asynchronous notification delivery and optional AI summary.
- **NFR-003**: Public reads and submissions MUST degrade safely: when flags, offer cache, consent text, routing eligibility or license status cannot be verified, the system blocks exposure or transmission.
- **NFR-004**: Public pages and forms MUST be usable on mobile and desktop and meet accessibility expectations for form labels, errors, focus order and consent controls.
- **NFR-005**: All user-facing copy MUST be localized or prepared for localization by country language, with approved fallback text that preserves compliance wording.
- **NFR-006**: Public forms MUST protect PII in logs, queues, metrics and errors, and must show non-sensitive error messages to visitors.
- **NFR-007**: Notification jobs MUST be observable by authorized roles with queued, delivered, failed or retryable status.
- **NFR-008**: Duplicate detection and anti-spam checks MUST avoid storing reversible raw email or phone values in Redis keys.
- **NFR-009**: Audit, consent and lead evidence MUST follow the foundation retention default of 10 years unless a country/regime rule overrides it.
- **NFR-010**: The feature MUST be testable by country, product, broker, license, offer, consent, flag, AI and routing state without requiring real insurer integrations.

### Business Rules

- **BR-001**: A visitor can compare only countries and products whose global, country and product flags are active for public comparison.
- **BR-002**: A visitor can request a quote only when global, country and product quote flags are active.
- **BR-003**: An offer is public only if it is active, validated, in validity period and scoped to the selected country/product.
- **BR-004**: Every public price is indicative and must be confirmed by the courtier partenaire.
- **BR-005**: Sponsored offers must be labelled wherever they influence display.
- **BR-006**: The first result in any list is never an official recommendation by AssurMatch.
- **BR-007**: A request without explicit consent cannot create a LeadAssignment or trigger broker notification.
- **BR-008**: Consent must be versioned and scoped to lead transmission for the selected country/product and intended recipient or recipient category.
- **BR-009**: A broker must be active, authorized for country and product, within capacity and licensed before receiving a lead.
- **BR-010**: A broker with expired, suspended, invalid, revoked, missing or out-of-scope license is never eligible.
- **BR-011**: If no broker is eligible, the request remains non-routed and the visitor is informed without promise of broker callback.
- **BR-012**: Duplicate requests cannot create multiple active lead assignments for the same country/product/contact window.
- **BR-013**: AI can summarize a request but cannot recommend an offer, choose a broker, decide eligibility or state a firm price.
- **BR-014**: All sensitive decisions and refusals are auditable.
- **BR-015**: Feature flags at a broader scope override lower-scope enables when disabled.

### Key Entities *(include if feature involves data)*

- **Country**: Existing foundation entity controlling public, quote, comparison and AI activation by country.
- **Product**: Existing foundation entity controlling public, quote, comparison, sensitivity, manual review and AI form behavior.
- **CountryProduct**: Existing association that determines which products are active for a country and which flags apply at the association level.
- **Offer**: New or extended public indicative offer entity with country, product, broker/partner owner or sponsor metadata, validation status, active status, validity period, indicative price data, guarantee summary and public display rules.
- **QuoteFormDefinition**: New or extended configuration for dynamic fields by country/product, validation rules, sensitivity, required consent text and display order.
- **QuoteRequest**: New request entity created after valid form submission and consent, with public reference, country, product, selected offer reference where applicable, source, payload reference, status, duplicate status, routing status and timestamps.
- **Prospect**: New visitor/prospect entity or profile reference containing normalized contact information, country/product context, consent links and deduplication references.
- **LeadAssignment**: New assignment entity linking a QuoteRequest to a single eligible broker partner, with status, assignedAt, assignment reason, broker notification status and audit reference.
- **PartnerTenant / Broker**: Existing foundation partner entity whose status, plan, capacity and suspension state determine eligibility.
- **PartnerCountryAuthorization**: Existing authorization entity proving broker country scope.
- **PartnerProductAuthorization**: Existing authorization entity proving broker product scope.
- **PartnerLicense**: Existing license entity proving active authorization for country/product and blocking routing when invalid.
- **ConsentText**: Existing versioned text entity used to display the exact consent wording before submission.
- **ConsentRecord**: Existing proof entity required before lead transmission.
- **AuditLog**: Existing immutable evidence entity for sensitive actions and refusals.
- **FeatureFlag**: Existing activation entity for global, country, product, partner, plan, module and AI controls.
- **Notification**: Existing operational notification entity for visitor and broker delivery status.
- **QueueJobRecord**: Existing async job visibility entity for notification and optional AI summary work.
- **AIModuleConfig**: Existing AI module configuration controlling optional summaries.
- **AIInteraction**: Existing AI audit entity for prompt/result metadata and guardrail outcome.
- **RoutingPrecheck**: Existing foundation concept extended or reused to evaluate deterministic routing blockers before LeadAssignment.

### API Endpoints

The following endpoints are functional contracts for planning and testing. They must preserve the constitutional wording, flag checks, RBAC and audit behavior described above.

| Area | Method | Endpoint | Caller | Purpose |
|------|--------|----------|--------|---------|
| Public Countries | GET | `/countries` | Public | List public or waitlist-eligible countries according to country flags. |
| Public Countries | GET | `/countries/:countryCode` | Public | Return public country page data, legal/technical positioning and enabled journey state. |
| Public Products | GET | `/countries/:countryCode/products` | Public | List active public products for the selected country. |
| Public Products | GET | `/countries/:countryCode/products/:productKey` | Public | Return product page data, flags, quote availability and required compliance wording. |
| Public Offers | GET | `/countries/:countryCode/products/:productKey/offers` | Public | Return active indicative offers with filters, sorting and sponsored labels. |
| Public Offers | GET | `/offers/:offerId` | Public | Return detail for a public active offer with indicative and broker wording. |
| Public Quote Form | GET | `/countries/:countryCode/products/:productKey/quote-form` | Public | Return dynamic quote form definition and published consent text reference when quote is enabled. |
| Public Quote Request | POST | `/quote-requests` | Public | Validate form, consent, anti-spam, duplicate rules, create QuoteRequest/Prospect, evaluate routing and return confirmation state. |
| Public Quote Status | GET | `/quote-requests/:publicReference` | Public with verification token/reference | Return minimal confirmation status without exposing broker/internal data beyond the visitor's request. |
| Broker Leads | GET | `/broker/leads` | Authenticated broker roles | List only leads assigned to the broker tenant with pagination and scope checks. |
| Broker Lead Detail | GET | `/broker/leads/:leadAssignmentId` | Assigned broker roles | Read an assigned lead detail and AI assistance if visible to that broker. |
| Broker Lead Status | PATCH | `/broker/leads/:leadAssignmentId/status` | Assigned broker roles | Mark minimal handling status such as received/contacted/rejected when allowed by portal scope. |
| Admin Quote Requests | GET | `/admin/quote-requests` | Super Admin, Admin Pays, Compliance Admin, Support Admin scoped | Search requests with pagination, country/product filters and PII scope restrictions. |
| Admin Prospects | GET | `/admin/prospects` | Authorized admins scoped | Search prospects with strict PII/RBAC controls. |
| Admin Lead Assignments | GET | `/admin/lead-assignments` | Authorized admins scoped | Search routing outcomes, assigned broker and refusal reasons. |
| Admin Lead Assignment Detail | GET | `/admin/lead-assignments/:id` | Authorized admins scoped | Inspect assignment, audit trail and notification state. |
| Admin Non-Routable | PATCH | `/admin/quote-requests/:id/review-status` | Authorized admins scoped | Mark non-routable or duplicate requests for manual operational review without transmission bypass. |
| Admin Offers | CRUD | `/admin/offers` | Super Admin, Admin Pays, Compliance/Content scoped | Manage indicative offers, validation state, validity period, sponsorship and public wording. |
| Routing Internal | POST | `/admin/routing/precheck` | Authorized admins scoped | Reuse foundation non-transmissive eligibility diagnostics for a request or broker candidate. |
| Notifications | GET | `/admin/notifications` | Authorized admins/brokers scoped | View notification status for visitor/broker messages within scope. |
| Audit | GET | `/admin/audit-logs` | Super Admin, Compliance Admin scoped | Search audit evidence for quote, consent, routing, notifications, spam and AI events. |

### Redis Impacts

- Feature flag and public catalog reads SHOULD use the foundation Redis cache for global, country and product flag resolution, with fail-closed behavior when state is stale or unverifiable.
- Public country/product/offer lists MAY be cached by country/product/filter/sort, but cache entries MUST respect offer validity windows and be invalidated when offers, flags, country/product status or sponsorship state changes.
- Rate limiting MUST use Redis-backed counters scoped at minimum by IP/session fingerprint, country, product and quote submission path.
- Anti-spam controls MUST use short-lived Redis keys for honeypot/challenge outcomes, burst detection and suspicious submission fingerprints.
- Duplicate detection MUST use non-reversible hashed fingerprints for normalized email/phone plus country/product, with a default 30-day detection window unless a country/regime rule overrides it.
- Routing MUST use short-lived locks keyed by QuoteRequest to prevent concurrent duplicate LeadAssignment creation.
- Queue idempotency keys MUST prevent duplicate broker/visitor notification jobs for the same QuoteRequest and LeadAssignment.
- Redis keys MUST NOT contain raw PII, offer free-text form contents or full phone/email values.

### BullMQ Impacts

- Visitor confirmation notifications MUST be queued asynchronously after QuoteRequest state is persisted.
- Broker lead notifications MUST be queued asynchronously only after LeadAssignment is successfully created for an eligible broker.
- Optional AI summary generation MUST be queued asynchronously after compliant QuoteRequest creation and must be skipped when IA flags are disabled.
- Duplicate review or non-routable follow-up jobs MAY be queued for authorized operational review, but they MUST NOT transmit the lead to an ineligible broker.
- Notification jobs MUST record QueueJobRecord/Notification status as queued, delivered, failed or retryable.
- Job payloads MUST contain stable references and minimized data, not raw full PII unless strictly required for the notification channel and protected by channel-specific controls.
- Public endpoints MUST NOT wait for broker notification delivery or AI summary completion before returning visitor confirmation.

### AI Impacts

- AI is limited to an optional operational summary of the request.
- AI MUST be controlled by `ai_summary_enabled`, country AI, applicable product AI, partner/plan AI visibility and AIModuleConfig status.
- AI MUST receive minimized request content, excluding unnecessary PII and avoiding raw documents unless a future spec explicitly authorizes documents.
- AI output MUST be marked as assistance and visible only to authorized internal users or the assigned broker if enabled for that scope.
- AI MUST NOT choose offers, rank offers as best, select brokers, decide eligibility, price risk, approve/reject coverage or write official advice to the visitor.
- AI failures MUST be non-blocking for QuoteRequest and routing when all non-AI requirements pass.
- AI interactions MUST be audited with prompt/template reference, minimized input reference, output reference, guardrail result, model/provider metadata where policy allows, and human validation state when sensitive.

### Security and Compliance Impacts

- Consent is a hard precondition for any broker transmission.
- Public endpoints require validation, rate limiting, anti-spam, duplicate controls and non-sensitive error responses.
- Email and phone validation must be country-aware and must avoid accepting obviously malformed or disposable values where anti-spam rules flag them.
- Broker and admin endpoints require authentication, MFA where applicable, RBAC, tenant isolation, country/product scope and pagination.
- Broker users can access only LeadAssignments assigned to their PartnerTenant.
- PII must be masked in logs, audit contexts, queue payloads, metrics and errors except where a controlled delivery channel requires contact data.
- All sensitive successes and failures must create AuditLog entries.
- Public content must preserve AssurMatch's technical platform role and avoid forbidden sale/subscription/contract wording.
- Data retention follows foundation defaults unless country/regime rules override; deletion/anonymization must preserve minimum compliance evidence where legally allowed.
- No payment, policy issuance, attestation, e-signature, insurer API or claims data is collected or activated by this feature.

### Test Scenarios

- Public country visibility: enabled country appears; disabled/suspended/waitlist-only country blocks comparison and quote.
- Product visibility: active product appears for its country; disabled quote/comparison flags block the correct parts of the journey.
- Offer visibility: active validated offer appears; expired, draft, suspended, non-validated and out-of-scope offers never appear.
- Offer wording: every list/detail/confirmation contains "offre indicative", "prix a confirmer" and "courtier partenaire" where applicable.
- Sponsored display: sponsored offer is visibly labelled in list, detail and sponsored sort.
- Filters and sorting: price/guarantee/broker/sponsored filters and price/name/date/sponsored sorts return expected sets without recommendation wording.
- Form validation: missing required fields, invalid email, invalid phone and malformed payload are rejected before QuoteRequest creation.
- Consent blocker: no consent or missing published consent text blocks QuoteRequest routability, LeadAssignment and broker notification.
- Consent success: valid consent creates ConsentRecord with purpose, country, product, channel, version and intended recipient.
- Quote creation: valid consented submission creates QuoteRequest and Prospect with expected status and audit logs.
- Duplicate detection: repeat request within duplicate window is blocked or marked duplicate and does not create a second active LeadAssignment.
- Rate limiting: rapid repeated submissions are blocked with non-sensitive response and no broker notification.
- Routing success: eligible active authorized licensed broker receives one LeadAssignment.
- Inactive broker blocker: inactive/suspended broker is excluded and audited.
- Unauthorized broker blocker: broker missing country or product authorization is excluded and audited.
- Expired license blocker: missing/expired/suspended/invalid/revoked/out-of-scope license excludes broker and audits reason.
- No broker available: no LeadAssignment, no broker notification, non-routable status and visitor confirmation.
- Notification success/failure: visitor and broker notifications are queued, status is visible and failures are retryable without duplicate lead transmission.
- Broker RBAC: assigned broker can read assigned lead; another broker receives refused access and audit log.
- Admin RBAC: scoped admins see only allowed countries/products/partners and paginated results.
- AI disabled: disabled AI flags produce zero model calls.
- AI enabled summary: summary job creates assistance-only output and AIInteraction audit.
- AI guardrail: recommendation, firm price, eligibility or routing decision in AI output is rejected/quarantined.
- Fail-closed flags/cache: uncertain flag, offer, consent or license state blocks public exposure or transmission.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of public quote submissions in acceptance testing either produce an explicit ConsentRecord before broker transmission or are refused without LeadAssignment.
- **SC-002**: 0 LeadAssignments are created for inactive brokers, unauthorized brokers or brokers with missing, expired, suspended, invalid, revoked or out-of-scope licenses.
- **SC-003**: 0 expired, draft, suspended, non-validated or out-of-scope offers are visible in public comparison results.
- **SC-004**: 100% of displayed public offers and visitor confirmations include approved indicative-price and broker-partner wording where applicable.
- **SC-005**: A visitor can complete the happy-path journey from country selection to confirmation in under 4 minutes during usability acceptance testing.
- **SC-006**: 95% of enabled country/product/offer public reads return visible primary content in under 2 seconds under acceptance-test load.
- **SC-007**: 95% of valid quote submissions return a confirmation state in under 5 seconds, excluding asynchronous delivery and optional AI completion.
- **SC-008**: 100% of routing decisions, refusals, duplicate detections, rate-limit refusals and consent outcomes create searchable AuditLog evidence in acceptance testing.
- **SC-009**: 95% of visitor and broker notification jobs reach queued, delivered, failed or retryable status within 5 minutes.
- **SC-010**: 0 cross-broker lead reads succeed in RBAC regression tests.
- **SC-011**: 0 AI model calls occur when any applicable global, country, product, partner or plan AI flag is disabled.
- **SC-012**: 0 AI outputs presented to users or brokers contain official recommendation, firm price, binding advice, eligibility decision or broker-routing decision in guardrail tests.

## Assumptions

- The socle 001 is implemented and remains the source for countries, products, partners, licenses, consent, audit logs, feature flags, Redis, BullMQ, notifications, routing prechecks and AI controls.
- The first activation may involve a limited set of countries, products and brokers; all public exposure remains controlled by flags.
- Offer administration and validation are included only to the level needed for public indicative comparison; insurer API synchronization is excluded.
- Dynamic quote form definitions are configured by country/product before public activation and reviewed for data minimization.
- Phone validation uses country-aware rules and stores a normalized international representation when possible.
- Duplicate detection defaults to a 30-day country/product/contact fingerprint window unless a country/regime rule overrides it.
- Visitor notification uses available transactional channels configured by the platform; no public/commercial WhatsApp flow is activated unless separately flagged and approved.
- Manual operational review can inspect non-routable or duplicate requests but cannot bypass consent, license, authorization or activation blockers.
- The default retention rule from the socle applies: 10 years for audit, consent and lead evidence unless country/regime rules define an override.
