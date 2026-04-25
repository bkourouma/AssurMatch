# Feature Specification: Portail Starter Courtier

**Feature Branch**: `003-portail-starter-courtier`
**Created**: 2026-04-25
**Status**: Draft
**Input**: User description: "Creer la specification fonctionnelle 003-portail-starter-courtier pour AssurMatch. Mettre en place le portail courtier Starter, sans CRM complet, pour permettre aux courtiers partenaires de consulter et traiter simplement les leads recus."

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Le portail permet uniquement a un courtier partenaire agree de consulter et traiter des leads qui lui ont deja ete transmis. Il ne permet pas de vendre une assurance, souscrire, encaisser une prime, emettre un contrat, emettre une attestation, gerer un sinistre ou produire un conseil personnalise engageant au nom d'AssurMatch.
- **Affected scopes**: Portail courtier, plan Broker Owner Starter et utilisateurs rattaches au tenant courtier, roles Broker Owner Starter, Broker Agent et Broker Read-only lorsque applicables, leads issus du comparateur public et de la demande de devis, notifications minimales, exports controles, audit logs.
- **Required feature flags**: `starter_portal_enabled` et `broker_dashboard_enabled` doivent controler l'exposition du portail Starter et du dashboard basique. `broker_crm_enabled`, `ai_broker_assistant_enabled`, `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, `webhooks` ou equivalents doivent rester inactifs ou invisibles pour le plan Starter. Les flags pays et produits applicables restent pris en compte pour l'affichage des leads.
- **Consent and transmission**: Le portail ne cree pas le consentement initial, mais chaque lead visible doit etre relie a une demande transmise avec ConsentRecord valide et LeadAssignment cree vers le courtier connecte. Aucun lead sans preuve de consentement et d'assignation ne doit etre affiche.
- **Partner license controls**: Le portail affiche seulement les leads deja assignes au courtier connecte. Si le courtier, son pays, son produit ou sa licence deviennent invalides, suspendus, expires ou desactives apres assignation, les actions de traitement doivent etre bloquees ou limitees selon politique operationnelle, avec message adapte et audit.
- **Audit and data history**: Toute consultation de liste, detail avec donnees personnelles, export, marquage vu, acceptation, rejet, contestation et tentative refusee doit produire un AuditLog horodate avec acteur, tenant courtier, action, cible, resultat, contexte minimal et correlationId si disponible. L'historique minimal du lead doit conserver les actions visibles au courtier.
- **Security and RBAC**: L'acces est authentifie, MFA obligatoire pour les courtiers selon constitution, RBAC strict, isolation par tenant courtier, verification de l'assignation avant toute lecture ou mutation, pagination obligatoire, PII masquee dans logs, export limite par permission, scope et volume. Un courtier ne doit jamais voir les leads d'un autre courtier.
- **Routing impact**: Cette feature ne modifie pas le routage initial. Elle consomme les LeadAssignment produits par la feature 002 et ajoute les etats de traitement Starter sans rerouter le lead ni contourner consentement, licence, quota ou eligibility.
- **AI impact**: N/A pour le Starter. Aucune IA commerciale avancee, score commercial, assistant courtier ou recommandation ne doit etre activee dans ce portail. Si un resume IA existe deja sur le lead, le plan Starter ne doit pas l'exposer sans flag et droit explicites.
- **UX/content restrictions**: Les ecrans doivent rappeler le role technique d'AssurMatch et le fait que le courtier partenaire reste responsable de la suite commerciale. Les messages doivent eviter "acheter maintenant", "souscrire maintenant", "contrat valide", "garantie acceptee", "meilleure assurance" ou equivalent. Les blocages Starter doivent indiquer simplement que le CRM complet n'est pas inclus dans le plan Starter.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consulter les leads assignes (Priority: P1)

Un courtier Starter connecte consulte une liste simple des leads qui lui ont ete assignes, avec filtres basiques et indicateurs essentiels pour prioriser son suivi.

**Why this priority**: La valeur principale du portail Starter est de rendre les leads transmis visibles et actionnables sans CRM complet.

**Independent Test**: Creer deux courtiers avec des leads assignes distincts, connecter un utilisateur Starter au premier courtier, verifier que sa liste affiche uniquement ses leads et que les filtres statut, produit, pays et date retournent uniquement son scope.

**Acceptance Scenarios**:

1. **Given** un courtier Starter authentifie avec MFA et des leads assignes a son tenant, **When** il ouvre la liste des leads, **Then** il voit uniquement les leads assignes a son courtier avec statut, produit, pays, date d'assignation et indicateur vu/non vu.
2. **Given** un lead assigne a un autre courtier, **When** le courtier Starter tente de le faire apparaitre par filtre, URL directe ou recherche, **Then** aucune donnee personnelle ni commerciale du lead n'est retournee et une tentative refusee est auditee.
3. **Given** `starter_portal_enabled` desactive ou plan courtier non Starter eligible, **When** le courtier tente d'ouvrir le portail, **Then** l'acces est refuse avec un message non sensible et un AuditLog est cree.

---

### User Story 2 - Voir le detail et marquer un lead comme vu (Priority: P1)

Un courtier Starter ouvre le detail d'un lead assigne pour consulter les informations utiles a la prise de contact, puis le lead est marque comme vu.

**Why this priority**: Le courtier doit comprendre le besoin transmis et prouver que le lead a ete consulte, tout en respectant la separation stricte des donnees.

**Independent Test**: Ouvrir un lead assigne, verifier les champs visibles, le changement vu/non vu, l'historique minimal et l'audit de consultation.

**Acceptance Scenarios**:

1. **Given** un lead assigne au courtier connecte et issu d'une demande consentie, **When** le courtier ouvre le detail, **Then** il voit les donnees personnelles strictement necessaires, le pays, le produit, la demande, le statut, l'historique minimal et les mentions de responsabilite du courtier.
2. **Given** un lead assigne non encore vu, **When** le courtier ouvre son detail pour la premiere fois, **Then** le lead est marque vu, l'evenement apparait dans l'historique minimal et la consultation est auditee.
3. **Given** un lead sans assignation valide au courtier connecte, **When** le courtier tente d'ouvrir le detail, **Then** l'acces est refuse sans fuite de PII et la tentative est auditee.

---

### User Story 3 - Accepter, rejeter ou contester un lead (Priority: P1)

Un courtier Starter traite un lead avec trois actions simples : accepter, rejeter avec motif ou contester avec motif.

**Why this priority**: Ces actions donnent a AssurMatch et au courtier une trace minimale de traitement sans introduire pipeline avance ni CRM Pro.

**Independent Test**: Executer les trois actions sur des leads assignes, verifier les transitions autorisees, les motifs obligatoires pour rejet/contestation, l'historique et les AuditLogs.

**Acceptance Scenarios**:

1. **Given** un lead assigne et non cloture, **When** le courtier l'accepte, **Then** le statut passe a accepte, l'action est horodatee, visible dans l'historique minimal et auditee.
2. **Given** un lead assigne et non cloture, **When** le courtier le rejette sans motif, **Then** l'action est refusee avec un message clair et aucune transition de statut n'est effectuee.
3. **Given** un lead assigne et non cloture, **When** le courtier le rejette ou le conteste avec un motif autorise et un commentaire optionnel, **Then** le statut, le motif, l'auteur et la date sont historises et audites.
4. **Given** un courtier Starter, **When** il tente d'ajouter des notes commerciales avancees, taches, rappels, devis joints ou pipeline, **Then** la fonctionnalite n'est pas accessible et un message indique que le CRM complet n'est pas inclus dans le plan Starter.

---

### User Story 4 - Suivre l'activite via un dashboard Starter basique (Priority: P2)

Un courtier Starter consulte un tableau de bord simple qui resume les leads recus et leur traitement minimal.

**Why this priority**: Le dashboard donne une vue operationnelle utile sans entrer dans le reporting Pro avance.

**Independent Test**: Avec un jeu de leads de plusieurs statuts, verifier les compteurs par statut, produit, pays et periode, puis verifier qu'aucune vue Pro n'est disponible.

**Acceptance Scenarios**:

1. **Given** un courtier Starter avec des leads assignes sur une periode, **When** il ouvre le dashboard Starter, **Then** il voit des compteurs basiques de leads recus, vus, acceptes, rejetes et contestes, filtrables par produit, pays et date.
2. **Given** un courtier Starter, **When** il tente d'acceder a un dashboard Pro, pipeline, Kanban, performance commerciale avancee ou IA commerciale, **Then** l'acces est bloque et l'interface indique que ces fonctions ne sont pas incluses dans le plan Starter.
3. **Given** aucun lead assigne sur la periode, **When** le dashboard est ouvert, **Then** les compteurs affichent un etat vide sans suggerer une indisponibilite technique.

---

### User Story 5 - Exporter les leads si autorise (Priority: P2)

Un courtier Starter disposant de la permission d'export telecharge un CSV simple des leads assignes dans le scope filtre.

**Why this priority**: Certains partenaires ont besoin d'un export operationnel leger, mais la constitution impose des limites strictes.

**Independent Test**: Tester un utilisateur avec permission d'export et un autre sans permission, verifier scope, volume, colonnes, filtrage, absence de leads tiers et audit.

**Acceptance Scenarios**:

1. **Given** un utilisateur courtier Starter avec permission d'export et des filtres appliques, **When** il demande un export CSV, **Then** le fichier contient uniquement les leads assignes a son courtier dans le scope demande, avec colonnes limitees et sans donnees hors permission.
2. **Given** un utilisateur sans permission d'export, **When** il tente d'exporter les leads, **Then** l'export est refuse, aucune donnee sensible n'est retournee et la tentative est auditee.
3. **Given** une demande d'export depassant les limites de volume ou de periode, **When** le courtier lance l'export, **Then** l'action est refusee ou reduite au scope autorise avec message clair et AuditLog.

---

### User Story 6 - Recevoir des notifications minimales (Priority: P3)

Un courtier Starter recoit des notifications in-app minimales lorsqu'un nouveau lead lui est assigne ou lorsqu'une action importante demande attention.

**Why this priority**: Les notifications ameliorent la reactivite mais ne doivent pas devenir un module CRM complet.

**Independent Test**: Assigner un lead au courtier, verifier une notification minimale visible dans le portail, son marquage lu et l'absence de notifications hors tenant.

**Acceptance Scenarios**:

1. **Given** un nouveau LeadAssignment pour le courtier connecte, **When** le courtier ouvre le portail, **Then** une notification in-app minimale lui signale le nouveau lead sans exposer de PII dans des canaux non autorises.
2. **Given** une notification liee a un lead, **When** le courtier l'ouvre ou la marque lue, **Then** l'etat de notification est mis a jour et l'action est auditee si elle revele une ressource sensible.
3. **Given** une notification liee a un autre courtier, **When** le courtier connecte tente d'y acceder, **Then** l'acces est refuse sans fuite de donnees et audite.

### Edge Cases

- Si le pays du lead est desactive apres assignation, le lead reste consultable uniquement si la politique de conservation l'autorise, mais les actions de traitement peuvent etre bloquees avec message de conformite et AuditLog.
- Si le produit du lead est desactive, quote-disabled ou passe en revue manuelle, aucune nouvelle action Starter ne doit contourner cette restriction; les donnees deja assignees restent soumises au scope autorise.
- Si le ConsentRecord est manquant, expire, retire ou incoherent, le lead ne doit pas etre visible dans le portail courtier et l'anomalie doit etre auditee pour revue autorisee.
- Si le courtier est inactif, non autorise pour le pays/produit, hors quota ou avec licence expiree, suspendue ou invalide, les nouvelles actions sur les leads concernes doivent etre bloquees ou limitees et auditees.
- Les offres et prix visibles eventuellement dans le detail doivent rester indicatifs et ne jamais devenir un devis ferme ou une promesse contractuelle.
- Si une fonction IA est desactivee globalement, par pays, produit, partenaire ou plan, aucun contenu IA commercial avance ne doit etre expose dans le portail Starter.
- Si un utilisateur manque de permission pour lire, muter ou exporter, l'action est refusee sans fuite de PII et avec AuditLog.
- Les filtres invalides, dates incoherentes, volumes excessifs, tentatives de pagination abusive ou identifiants non devinables invalides doivent echouer de facon non sensible.
- Les contestations multiples doivent etre historisees; la politique peut autoriser une nouvelle contestation seulement si le statut courant le permet.
- Les fonctionnalites Pro/Enterprise doivent etre invisibles ou bloquees pour le plan Starter, y compris par URL directe.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme DOIT exposer le portail courtier Starter uniquement aux utilisateurs courtiers authentifies dont le tenant et le plan autorisent cet acces.
- **FR-002**: Le systeme DOIT appliquer `starter_portal_enabled`, le plan courtier, le role, le tenant, le produit et le pays avant toute liste, lecture, mutation ou export de leads.
- **FR-003**: Le systeme DOIT lister uniquement les LeadAssignments assignes au tenant courtier connecte, avec pagination et filtres simples par statut, produit, pays et plage de dates.
- **FR-004**: Le systeme DOIT afficher le detail d'un lead uniquement lorsque le LeadAssignment appartient au tenant courtier connecte et que l'utilisateur possede le role requis.
- **FR-005**: Le systeme DOIT afficher les donnees personnelles uniquement pour les leads assignes au tenant courtier connecte et au niveau minimal necessaire au suivi courtier.
- **FR-006**: Le systeme DOIT marquer un lead assigne comme vu lorsqu'un utilisateur courtier autorise ouvre le detail pour la premiere fois, et DOIT conserver la date et l'acteur.
- **FR-007**: Le systeme DOIT prendre en charge les statuts minimaux Starter: assigne/nouveau, vu, accepte, rejete, conteste et cloture/archive lorsque applicable.
- **FR-008**: Le systeme DOIT permettre a un utilisateur courtier autorise d'accepter un lead assigne et non final, avec conservation de l'acteur, de la date et du statut precedent.
- **FR-009**: Le systeme DOIT exiger un motif avant tout rejet; les motifs acceptes DOIVENT provenir d'une allowlist couvrant qualite du lead, demande hors scope, prospect injoignable, doublon ou enjeu de conformite.
- **FR-010**: Le systeme DOIT exiger un motif avant toute contestation et DOIT historiser chaque contestation, y compris les contestations repetees lorsque la politique l'autorise.
- **FR-011**: Le systeme DOIT empecher les utilisateurs Starter de modifier les donnees sensibles de demande, prospect, consentement, routage, licence, offre ou proprietaire d'assignation hors actions autorisees sur le lead.
- **FR-012**: Le systeme DOIT maintenir un historique minimal visible par les courtiers autorises, incluant assignation, vu, acceptation, rejet, contestation, changements de statut et evenements d'export lorsque pertinents.
- **FR-013**: Le systeme DOIT fournir un dashboard Starter avec compteurs basiques de leads recus, vus, acceptes, rejetes et contestes, filtrables par produit, pays et date.
- **FR-014**: Le systeme DOIT bloquer les capacites CRM Pro et Enterprise pour les utilisateurs Starter, notamment Kanban, pipeline avance, taches, rappels, assignation d'equipe, notes commerciales avancees, devis joints, dashboards avances et IA commerciale avancee.
- **FR-015**: Le systeme DOIT afficher des messages UX indiquant que le plan Starter ne comprend pas le CRM complet lorsqu'une capacite Pro bloquee est atteinte par navigation, URL directe ou controle desactive.
- **FR-016**: Le systeme DOIT creer des notifications in-app ou minimales pour les nouveaux leads assignes lorsque les notifications sont activees pour le tenant courtier et l'utilisateur.
- **FR-017**: Le systeme DOIT garantir que les notifications revelent uniquement des ressources assignees au tenant courtier connecte et n'exposent pas de PII hors vues autorisees.
- **FR-018**: Le systeme DOIT autoriser l'export CSV uniquement lorsque l'utilisateur connecte possede une permission explicite d'export des leads courtier.
- **FR-019**: Le systeme DOIT limiter l'export CSV au tenant courtier connecte, aux filtres actifs, aux colonnes autorisees et aux limites de volume/date configurees.
- **FR-020**: Le systeme DOIT refuser l'export CSV pour les utilisateurs sans permission, scopes trop larges ou filtres invalides, sans retourner de donnees sensibles.
- **FR-021**: Le systeme DOIT creer des AuditLogs pour acces liste, acces detail, refus cross-tenant, marquage vu, acceptation, rejet, contestation, acces notification, export reussi et export refuse.
- **FR-022**: Le systeme DOIT eviter de journaliser la PII brute dans les logs applicatifs, contextes AuditLog, payloads de notification ou contextes d'audit export.
- **FR-023**: Le systeme DOIT verifier que chaque lead visible possede un LeadAssignment valide vers le courtier connecte et provient d'une demande eligible a transmission avec preuve de consentement.
- **FR-024**: Le systeme DOIT bloquer ou limiter les actions sensibles sur lead lorsque le tenant courtier, l'autorisation, le pays, le produit ou la licence n'est plus valide, et DOIT auditer la decision.
- **FR-025**: Le systeme DOIT fournir des identifiants de leads stables et non devinables dans les URLs et exports courtier.
- **FR-026**: Le systeme DOIT garantir la coherence des resultats liste, detail, dashboard et export avec les memes regles d'isolation tenant et de permission.
- **FR-027**: Le systeme DOIT presenter AssurMatch comme une plateforme technique et le courtier comme partenaire responsable du suivi lorsque pertinent.
- **FR-028**: Le systeme NE DOIT PAS exposer ni activer vente directe, souscription directe, paiement, e-signature, emission de police, attestation, sinistres, API partenaire ou webhook via ce portail Starter.

### Non-Functional Requirements

- **NFR-001**: 95% des vues liste, detail et dashboard courtier DOIVENT fournir une reponse utilisable en moins de 2 secondes pour les volumes Starter normaux.
- **NFR-002**: L'export CSV DOIT se terminer ou fournir une reponse controlee comprehensible par l'utilisateur dans le cadre des limites de volume Starter configurees.
- **NFR-003**: Tous les ecrans leads courtier DOIVENT rester utilisables sur desktop et mobile sans chevauchement de texte, controles inaccessibles ou messages de conformite masques.
- **NFR-004**: Les tests de controle d'acces DOIVENT demontrer zero lecture, mutation, notification ou export cross-courtier reussi.
- **NFR-005**: La creation d'AuditLog DOIT etre suffisamment fiable pour qu'une action sensible sans preuve d'audit soit traitee comme echouee ou signalee en revue operationnelle.
- **NFR-006**: Les messages d'erreur DOIVENT etre clairs pour les utilisateurs autorises tout en evitant de reveler si un lead inaccessible existe.
- **NFR-007**: La feature DOIT permettre un rollout Starter par tenant, pays et produit sans activer les capacites Pro/Enterprise.
- **NFR-008**: Les donnees affichees et exportees DOIVENT suivre la minimisation par defaut et inclure seulement les champs necessaires au traitement du lead.

### Business Rules

- **BR-001**: Un utilisateur courtier peut voir uniquement les leads assignes au tenant courtier de sa session courante.
- **BR-002**: Un plan Starter peut acceder uniquement a la liste des leads, au detail, a accepter, rejeter, contester, statut vu, historique minimal, dashboard basique, export autorise et notifications minimales.
- **BR-003**: Le rejet et la contestation exigent un motif controle; les commentaires libres sont optionnels, sanitises et traites avec attention PII.
- **BR-004**: Un lead rejete ou conteste ne peut pas etre retire silencieusement de l'historique.
- **BR-005**: Un lead final ou archive ne peut pas etre modifie sauf par action explicitement autorisee pour son statut courant.
- **BR-006**: Les utilisateurs Starter ne peuvent pas creer ni modifier donnees de devis, consentements, decisions de routage, licences partenaires, offres, factures, polices, attestations ou sinistres.
- **BR-007**: La permission d'export est separee de la permission de lecture.
- **BR-008**: Les entrees UI Pro et Enterprise ne doivent pas devenir accessibles par URL directe, favori ou requete fabriquee pour les utilisateurs Starter.
- **BR-009**: Tout conflit entre confort commercial et restrictions constitutionnelles doit echouer ferme et etre auditable.
- **BR-010**: Le portail ne doit pas laisser entendre qu'AssurMatch valide, recommande, vend ou garantit un contrat d'assurance.

### Key Entities *(include if feature involves data)*

- **BrokerTenant / Partner**: Courtier partenaire connecte, statut, plan Starter, pays et produits autorises, activation portail.
- **BrokerUser**: Utilisateur rattache au courtier, role, MFA, permissions de lecture, action et export.
- **PartnerLicense**: Licence du courtier, statut, expiration, pays et produit couverts; utilisee pour bloquer ou limiter les actions sensibles si invalide.
- **QuoteRequest**: Demande d'origine du lead, pays, produit, payload minimal, statut de transmission, reference non devinable.
- **LeadAssignment**: Assignation du lead a un courtier, identifiant stable, statut Starter, dates d'assignation, vu, action et notification.
- **LeadActionHistory**: Historique minimal des evenements Starter: assignment, viewed, accepted, rejected, disputed, status change, export mention when applicable.
- **LeadRejectionReason**: Motif allowliste pour rejet, associe au lead, acteur, date et commentaire optionnel.
- **LeadDisputeReason**: Motif allowliste pour contestation, associe au lead, acteur, date, commentaire optionnel et etat de revue si applicable.
- **Notification**: Notification in-app minimale liee a un LeadAssignment et au tenant courtier autorise.
- **ExportPermission / ExportEvent**: Permission d'export par role ou utilisateur, trace d'export, scope, filtre, volume, colonnes et resultat.
- **ConsentRecord**: Preuve que la demande a ete consentie avant transmission; referencee pour autoriser l'affichage du lead.
- **AuditLog**: Journal opposable des consultations, actions, refus et exports.
- **FeatureFlag**: Activation globale, plan, pays, produit et module pour le portail Starter et les restrictions CRM.

## API Endpoints

La surface API courtier suivante est incluse pour la planification et la validation contractuelle; tous les endpoints exigent authentification, controles MFA/RBAC lorsque applicables, isolation tenant et couverture audit.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/broker/starter/dashboard` | Retourner les compteurs Starter basiques du tenant courtier connecte avec filtres statut, produit, pays et date. |
| GET | `/broker/starter/leads` | Lister les leads pagines assignes au tenant courtier connecte avec filtres simples. |
| GET | `/broker/starter/leads/:leadId` | Retourner le detail d'un lead assigne au tenant courtier connecte et le marquer vu lorsque applicable. |
| POST | `/broker/starter/leads/:leadId/accept` | Accepter un lead assigne et enregistrer l'historique minimal. |
| POST | `/broker/starter/leads/:leadId/reject` | Rejeter un lead assigne avec motif allowliste obligatoire et commentaire optionnel sanitise. |
| POST | `/broker/starter/leads/:leadId/dispute` | Contester un lead assigne avec motif allowliste obligatoire et commentaire optionnel sanitise. |
| GET | `/broker/starter/leads/:leadId/history` | Retourner l'historique minimal d'un lead assigne. |
| GET | `/broker/starter/notifications` | Lister les notifications in-app minimales limitees au tenant courtier connecte. |
| POST | `/broker/starter/notifications/:notificationId/read` | Marquer comme lue une notification in-app autorisee. |
| GET | `/broker/starter/leads/export.csv` | Exporter le CSV autorise des leads assignes dans le scope filtre demande. |
| GET | `/broker/starter/plan-capabilities` | Retourner la carte des capacites Starter et des capacites CRM bloquees pour le gating UX. |

Les endpoints hors scope doivent rester indisponibles pour les utilisateurs Starter, notamment CRM Kanban, pipeline, taches, rappels, assignation d'equipe, notes avancees, devis joints, dashboard avance, assistant IA courtier, billing, paiements, emission de police, attestations, sinistres, API partenaire et webhooks.

## Security & Compliance Impact

- Chaque requete doit rattacher l'utilisateur authentifie a un seul contexte tenant courtier avant toute recherche de lead.
- La recherche d'une ressource doit verifier la propriete de l'assignation avant de retourner existence, detail, statut ou historique.
- La MFA est requise pour l'acces courtier selon la constitution; son absence bloque les vues/actions sensibles.
- L'affichage PII est limite aux leads assignes et aux contextes detail/export autorises.
- L'export CSV doit appliquer permission, tenant, filtres, allowlist de colonnes, limites volume/date et audit avant toute transmission de donnees.
- L'acces par URL directe aux ecrans Pro/Enterprise par des utilisateurs Starter doit echouer ferme.
- Les mutations sensibles doivent verifier plan courant, licence/autorisation courante et statut courant du lead.
- Les logs, contextes AuditLog et notifications ne doivent jamais inclure contacts bruts, payloads libres ou reponses completes de demande sauf autorisation explicite pour le detail consulte.
- La feature n'introduit aucun module reglemente: pas de vente, souscription, encaissement de prime, paiement, e-signature, emission de police, attestation, sinistre, API partenaire, webhook ou conseil engageant.

## Audit Log Impact

Audit actions to standardize:

- `broker_starter.portal_opened`
- `broker_starter.dashboard_viewed`
- `broker_starter.lead_list_viewed`
- `broker_starter.lead_detail_viewed`
- `broker_starter.lead_marked_seen`
- `broker_starter.lead_accepted`
- `broker_starter.lead_rejected`
- `broker_starter.lead_disputed`
- `broker_starter.history_viewed`
- `broker_starter.notification_viewed`
- `broker_starter.notification_read`
- `broker_starter.export_requested`
- `broker_starter.export_completed`
- `broker_starter.export_refused`
- `broker_starter.cross_tenant_refused`
- `broker_starter.pro_feature_blocked`
- `broker_starter.action_blocked_license_or_scope`

Chaque AuditLog doit inclure acteur, tenant courtier, action, type de cible, identifiant cible lorsque autorise, resultat, code de refus lorsque applicable, scope pays/produit lorsque applicable, timestamp et correlationId lorsque disponible. Le contexte doit etre minimise en PII.

## Frontend Broker Portal Impact

- Ajouter une vue d'accueil/dashboard Starter centree sur des compteurs operationnels, pas marketing.
- Ajouter une liste de leads avec filtres compacts par statut, produit, pays et date; inclure pagination et etats vides.
- Ajouter une vue detail lead avec donnees coeur de demande, references de preuve consentement/assignation lorsque utiles, statut, etat vu et historique minimal.
- Ajouter les controles accepter, rejeter et contester; rejet/contestation exigent une selection de motif avant soumission.
- Ajouter un point d'entree notifications pour les nouveaux leads assignes et l'etat lu/non lu.
- Ajouter un controle d'export CSV visible seulement lorsque la permission existe et expliquant clairement les refus.
- Bloquer ou masquer les entrees CRM Pro; l'acces direct doit afficher un message plan Starter sans exposer les ecrans Pro.
- Le contenu doit expliquer que Starter inclut le traitement simple des leads et que le CRM complet n'est pas inclus.
- L'interface doit eviter le vocabulaire reglemente interdit et ne pas laisser entendre qu'AssurMatch vend, souscrit ou garantit un contrat.

## Test Scenarios

- Tests unitaires de politique d'acces lead: tenant assigne autorise, autre tenant refuse, assignation manquante refusee, tenant inactif refuse.
- Tests unitaires de politique capacites Starter: actions Starter autorisees, fonctions Pro/Enterprise bloquees, feature flag desactive bloque le portail.
- Tests unitaires de transitions de statut: accepter, rejeter avec motif, rejet sans motif refuse, contestation avec motif, mutation d'un statut final refusee.
- Tests unitaires de politique export: permission obligatoire, scope tenant, allowlist de colonnes, limites date/volume.
- Tests d'integration des compteurs dashboard scopes au tenant courtier connecte.
- Tests d'integration des filtres liste lead par statut, produit, pays et date avec pagination.
- Tests d'integration du detail lead marquant la premiere vue comme vue et ne dupliquant pas l'historique vu ensuite.
- Tests d'integration des endpoints accepter/rejeter/contester produisant LeadActionHistory et AuditLog.
- Tests d'integration des lectures URL directes cross-tenant, actions, acces notification et tentatives d'export ne retournant aucune PII.
- Tests d'integration licence expiree/suspendue/partenaire inactif bloquant ou limitant les actions sensibles avec audit.
- Tests d'integration export CSV reussi et cas de refus.
- Tests d'integration notifications creees, listees, lues et isolees par tenant.
- Tests garde-fous confirmant aucun acces Starter a Kanban, pipeline, taches, rappels, assignation d'equipe, notes avancees, devis joints, dashboard avance, IA avancee, billing, paiements, emission de police, attestations, sinistres, API partenaire et webhooks.
- Tests conformite verifiant l'absence de PII brute dans contexte AuditLog, logs applicatifs et payloads de notification.
- Tests smoke UX desktop et mobile pour liste lead, detail, dialogues d'action, dashboard, controles export, liste notifications et message CRM bloque.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% des lectures, mutations, notifications et exports de leads courtier dans les tests d'acces automatises sont limites au tenant courtier connecte.
- **SC-002**: 100% des actions courtier sensibles produisent un AuditLog avec acteur, tenant, action, cible, resultat et timestamp.
- **SC-003**: Les utilisateurs Starter autorises peuvent trouver et ouvrir un lead assigne depuis le dashboard ou la liste en moins de 3 actions utilisateur.
- **SC-004**: Les utilisateurs Starter autorises peuvent accepter, rejeter ou contester un lead assigne en moins de 2 minutes, avec saisie du motif obligatoire pour rejet ou contestation.
- **SC-005**: 0 capacite CRM Pro/Enterprise est atteignable par les utilisateurs Starter dans les tests de route, navigation et permission.
- **SC-006**: 95% des interactions normales liste, detail et dashboard lead presentent une information utilisable en moins de 2 secondes.
- **SC-007**: 100% des tentatives d'export non autorisees ne retournent aucune donnee sensible et creent un evenement d'audit de refus export.
- **SC-008**: 100% des contestations conservent une entree d'historique immuable visible pour le courtier autorise et la revue operations.
- **SC-009**: Au moins 90% des utilisateurs courtiers Starter pilotes peuvent completer la revue d'un lead et une action de traitement sans intervention support durant les tests d'acceptation.

## Assumptions

- Le socle plateforme 001 fournit authentification, utilisateurs, tenants partenaires, roles, MFA, feature flags et fondations AuditLog.
- La feature 002 comparateur et demande de devis fournit QuoteRequest, ConsentRecord et creation de LeadAssignment vers les courtiers eligibles.
- Starter est un plan courtier payant ou configure distinct de Pro/Enterprise, avec gating explicite des capacites.
- Les notifications in-app suffisent pour cette feature; les canaux externes email/SMS/WhatsApp ne sont pas requis sauf s'ils existent deja et sont autorises.
- L'export est synchrone pour les petits volumes Starter et peut etre limite par plage de dates et nombre de lignes.
- Les allowlists de motifs de rejet et contestation seront affinees durant la planification, mais doivent au minimum couvrir qualite du lead, mauvais scope, prospect injoignable, doublon et enjeu de conformite.
- La retention des donnees suit la politique AssurMatch existante et le regime pays/reglementaire applicable; cette spec n'introduit pas de retention plus courte.
- Une revue admin ou operations des contestations peut exister ailleurs, mais cette feature exige seulement la capture cote courtier et l'historique.
