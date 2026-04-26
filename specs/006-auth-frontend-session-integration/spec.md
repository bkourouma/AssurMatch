# Feature Specification: Auth Frontend Session Integration AssurMatch

**Feature Branch**: `006-auth-frontend-session-integration`
**Created**: 2026-04-26
**Status**: Validated
**Input**: User description: "Connecter l'application Back-office Partenaires/Plateforme a l'authentification reelle par Bearer token, supprimer la dependance aux headers dev cote frontend, preparer une session frontend utilisable par les courtiers et admins, sans generer le plan, tasks.md ni implementation."
**Validation State**: Explicitly approved by user on 2026-04-26
**Continuous Workflow Eligible**: Yes - the user explicitly requested `/speckit.plan` then `/speckit.tasks` then `/speckit.implement` without intermediate confirmation, and no `[NEEDS CLARIFICATION]` markers remain.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette specification concerne uniquement l'acces authentifie au back-office. Elle n'ajoute aucune vente directe, souscription, encaissement de prime, emission de police, attestation, sinistre, API assureur avancee, paiement, e-signature ou conseil personnalise engageant par AssurMatch.
- **Impacted application(s)**: Back-office Partenaires/Plateforme: oui, incluant les surfaces broker et admin. Backend API: oui uniquement pour ajustements mineurs auth/session necessaires. Packages partages: oui si les contrats auth/session ou types de profil doivent etre alignes. Web Publique Client: non, sauf tests de separation ou composant partage strictement necessaire sans route, layout ni etat auth back-office.
- **Affected scopes**: Auth, session back-office, profils utilisateurs, roles, permissions, MFA, clients API broker/admin, routes protegees Starter, CRM et admin, tests HTTP/front-end. Pays, produits, offres, lead routing et IA ne changent pas fonctionnellement.
- **Frontend separation**: La Web Publique Client ne doit charger aucun ecran login back-office, token, profil broker/admin, privilege, client API broker/admin, layout back-office ou route protegee. Le back-office porte seul la session des courtiers et administrateurs.
- **Required feature flags**: Aucun nouveau feature flag requis. Les flags existants restent applicables aux surfaces protegees: `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled`, flags pays/produit/partenaire/plan si deja utilises par les routes appelees. Les modules exclus restent desactives.
- **Consent and transmission**: N/A pour cette feature: aucune collecte visiteur ni transmission de lead n'est creee. Les routes back-office qui affichent des leads doivent continuer a respecter le consentement, le tenant et les audits definis par les specs precedentes.
- **Partner license controls**: La feature ne change pas l'eligibilite de routage ni les licences. Les profils broker et acces aux leads doivent toutefois conserver les blocages existants pour partenaires inactifs, non autorises ou licence invalide lorsque ces informations conditionnent les actions back-office.
- **Audit and data history**: Les evenements sensibles de session doivent etre auditables selon les capacites runtime existantes: login reussi/echec sensible, logout, refus 401/403 significatif, MFA requis/valide/echec et acces a profil courant. Les tokens, mots de passe et secrets ne doivent jamais etre journalises.
- **Security and RBAC**: Les routes broker/admin doivent utiliser `Authorization: Bearer <token>` issu d'un login reel. Les headers `x-assurmatch-*` ne doivent plus etre envoyes par les clients frontend en runtime normal. RBAC, MFA, tenant, plan et permissions restent controles par l'API a partir du token verifie.
- **Routing impact**: Aucun changement de routage. La session frontend ne doit pas donner acces a des leads hors tenant ni contourner les refus de routage/licence existants.
- **AI impact**: N/A: aucune fonction IA, prompt, scoring ou assistant n'est ajoute. Les flags IA existants restent inchanges et aucun appel modele n'est introduit.
- **UX/content restrictions**: Les ecrans back-office doivent afficher des etats login, session expiree, acces refuse et MFA sans promesse publique de vente, souscription, contrat valide, attestation ou conseil reglemente. La Web Publique Client ne doit afficher aucune donnee admin/broker.
- **Workflow continuity**: Eligible apres validation explicite utilisateur dans la demande `/speckit.plan`. La suite peut enchainer `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement` -> validations finales sans confirmation intermediaire, sauf conflit constitutionnel, risque securite/conformite/donnees ou validation bloquante. Aucun commit automatique n'est autorise.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Se connecter au back-office avec une session reelle (Priority: P1)

Un courtier ou administrateur ouvre le back-office, saisit ses identifiants, obtient une session authentifiee et voit son profil courant recupere depuis l'API avant d'acceder aux pages protegees.

**Why this priority**: Sans login et profil reels, le back-office ne peut pas fonctionner apres la securisation runtime de l'API 005.

**Independent Test**: Depuis une page login back-office, soumettre des identifiants valides, verifier l'appel a `/auth/login`, verifier que `/auth/me` retourne le profil courant avec le Bearer token, puis acceder a une route autorisee.

**Acceptance Scenarios**:

1. **Given** un utilisateur broker ou admin actif avec identifiants valides, **When** il soumet le login back-office, **Then** le back-office appelle `/auth/login`, recoit une session valide et recupere le profil via `/auth/me` avant d'afficher les surfaces autorisees.
2. **Given** des identifiants invalides ou un compte suspendu/verrouille, **When** l'utilisateur tente le login, **Then** aucun token utilisable n'est conserve, un message non sensible est affiche et aucune route protegee n'est appelee avec des headers dev.
3. **Given** une reponse indiquant MFA requis, **When** le login est accepte mais non complet, **Then** le back-office presente l'etape MFA prevue et ne donne acces aux routes protegees qu'apres validation MFA.

---

### User Story 2 - Utiliser Bearer token dans les clients API broker et admin (Priority: P1)

Les pages broker et admin appellent les endpoints proteges avec `Authorization: Bearer <token>` et ne dependent plus des headers de simulation `x-assurmatch-*` en runtime normal.

**Why this priority**: L'API 005 ignore les headers dev en runtime normal; le back-office doit donc porter l'authentification reelle au lieu de simuler un acteur.

**Independent Test**: Intercepter les requetes des clients API broker/admin pendant une session valide et confirmer que chaque route protegee contient `Authorization: Bearer <token>` et aucun header `x-assurmatch-*` hors tests explicitement isoles.

**Acceptance Scenarios**:

1. **Given** une session broker valide, **When** le portail Starter appelle `/broker/starter/leads`, **Then** la requete contient un Bearer token valide et ne contient aucun header runtime `x-assurmatch-*`.
2. **Given** une session Pro/Enterprise valide avec CRM autorise, **When** le CRM appelle `/broker/crm/dashboard` ou `/broker/crm/leads`, **Then** l'API identifie acteur, tenant, plan, roles et MFA depuis le token verifie.
3. **Given** une session admin valide, **When** une page admin appelle `/admin/system/health` ou une route admin existante, **Then** la requete utilise Bearer token et laisse l'API appliquer RBAC admin.
4. **Given** un test ou fixture explicitement isole, **When** des headers `x-assurmatch-*` sont utilises, **Then** ils sont limites au mode test et ne peuvent pas etre importes par les clients frontend runtime.

---

### User Story 3 - Gerer expiration, invalidite et logout proprement (Priority: P1)

Un utilisateur dont la session expire, devient invalide ou choisit de se deconnecter est ramene vers le login sans fuite de donnees ni appel persistant avec ancien token.

**Why this priority**: La session frontend doit etre fiable dans les cas normaux d'expiration et d'invalidation, sinon les pages back-office affichent des erreurs confuses ou des donnees obsoletes.

**Independent Test**: Forcer un token expire, un token invalide et un logout, puis verifier redirection, nettoyage de session et absence de donnees sensibles visibles.

**Acceptance Scenarios**:

1. **Given** un token expire, **When** une page broker/admin appelle une route protegee, **Then** la reponse 401 nettoie la session locale et redirige vers login avec un etat session expiree.
2. **Given** un token invalide ou falsifie, **When** le client tente `/auth/me` ou une route protegee, **Then** le back-office supprime le token, n'affiche aucune donnee protegee et renvoie vers login.
3. **Given** un utilisateur authentifie, **When** il demande logout, **Then** le back-office appelle `/auth/logout`, nettoie le token et le profil, puis bloque tout acces protege jusqu'a nouveau login.

---

### User Story 4 - Refuser proprement les acces non autorises (Priority: P1)

Un utilisateur authentifie mais insuffisamment autorise voit un etat acces refuse au lieu d'une page vide, d'une redirection trompeuse ou d'une fuite de donnees.

**Why this priority**: La constitution impose RBAC strict, tenant isolation, MFA et plan Starter sans CRM.

**Independent Test**: Utiliser des profils broker Starter, broker Pro, read-only et admin avec permissions controlees, puis verifier les etats 403 et les surfaces masquees.

**Acceptance Scenarios**:

1. **Given** un courtier Starter authentifie, **When** il tente d'ouvrir une route CRM, **Then** le back-office affiche acces refuse et aucune donnee CRM n'est visible.
2. **Given** un broker authentifie, **When** il tente une route admin, **Then** l'acces est refuse, sans exposer donnees admin ni menu admin exploitable.
3. **Given** un admin sans permission suffisante, **When** il tente une route admin specialisee, **Then** l'acces est refuse avec message clair et sans masquer une erreur 403 en succes partiel.
4. **Given** un utilisateur non authentifie, **When** il ouvre une URL protegee broker/admin, **Then** il est redirige vers login avant tout chargement de donnees protegees.

---

### User Story 5 - Preserver la separation public/back-office (Priority: P2)

Les changements de session ne doivent toucher la Web Publique Client que par des tests ou packages strictement partages sans embarquer d'etat back-office.

**Why this priority**: La constitution exige deux applications web separees et interdit tout affichage de donnees admin/broker dans le public.

**Independent Test**: Inspecter les imports, bundles ou tests de navigation de l'application publique et verifier qu'aucune route, layout, token, profil ou client API back-office n'est charge.

**Acceptance Scenarios**:

1. **Given** la Web Publique Client, **When** un visiteur navigue les routes publiques, **Then** aucun appel `/auth/me`, `/broker/*` ou `/admin/*` n'est effectue.
2. **Given** un composant ou package partage, **When** il est utilise par les deux applications, **Then** il ne transporte ni token back-office, ni politique RBAC admin/broker, ni route protegee.
3. **Given** une tentative d'acces back-office depuis une URL publique, **When** le visiteur n'est pas authentifie ni autorise, **Then** aucune donnee partenaire/admin n'est exposee.

### Edge Cases

- Token absent au chargement d'une page protegee: redirection vers login avant tout fetch broker/admin.
- Token expire pendant la navigation: nettoyage session, retour login et message session expiree.
- Token invalide, falsifie ou signe avec un secret incorrect: 401 traite comme session invalide, sans retry infini.
- Compte suspendu, verrouille, supprime ou roles retires apres login: prochain `/auth/me` ou appel protege refuse et session frontend invalidee.
- MFA requis mais non verifie: l'utilisateur reste dans l'etape MFA et les routes protegees broker/admin restent bloquees.
- Broker Starter tente CRM: 403/access denied, aucun CRM visible.
- Broker tente admin: 403/access denied, aucun menu ou donnee admin visible.
- Admin sans permission tente une page specialisee: 403/access denied, aucun fallback avec donnees partielles.
- Reponse 403 sur une page deja chargee: l'UI retire les donnees sensibles de l'etat courant et affiche acces refuse.
- `/auth/logout` indisponible temporairement: le frontend nettoie quand meme sa session locale et bloque les appels proteges.
- Stockage token inaccessible ou efface par le navigateur: l'utilisateur est traite comme non authentifie.
- Headers `x-assurmatch-*` trouves dans le runtime frontend: cas bloquant, sauf fichiers de tests, mocks ou fixtures explicitement isoles.
- Web Publique Client importe une session back-office ou client broker/admin: cas bloquant de separation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le back-office DOIT fournir un parcours login pour les utilisateurs broker et admin, distinct des parcours de la Web Publique Client.
- **FR-002**: Le login back-office DOIT appeler `/auth/login` avec des identifiants utilisateur et traiter les reponses succes, echec, compte interdit et MFA requis.
- **FR-003**: Apres login valide, le back-office DOIT recuperer le profil courant via `/auth/me` avant d'afficher les routes protegees.
- **FR-004**: Les clients API broker et admin DOIVENT envoyer `Authorization: Bearer <token>` sur toutes les routes protegees.
- **FR-005**: Les clients frontend runtime NE DOIVENT PAS envoyer `x-assurmatch-actor-id`, `x-assurmatch-roles`, `x-assurmatch-partner-tenant-id`, `x-assurmatch-partner-plan`, `x-assurmatch-country-scopes`, `x-assurmatch-product-scopes` ou `x-assurmatch-mfa-verified`.
- **FR-006**: Les headers `x-assurmatch-*` PEUVENT rester uniquement dans tests, mocks, fixtures ou mode explicitement test, avec isolation qui empeche leur import par les clients runtime.
- **FR-007**: Le frontend DOIT gerer 401 par invalidation de session, nettoyage du token/profil et redirection vers login.
- **FR-008**: Le frontend DOIT gerer 403 par un etat acces refuse qui ne revele aucune donnee protegee non autorisee.
- **FR-009**: Le frontend DOIT gerer token expire, token invalide, token absent et profil courant inaccessible sans retry infini ni affichage de donnees obsoletes.
- **FR-010**: Le logout DOIT appeler `/auth/logout` lorsqu'une session existe, puis supprimer le token, le profil et tout etat local protege du back-office.
- **FR-011**: Un utilisateur non authentifie DOIT etre redirige vers login avant tout chargement de donnees broker/admin.
- **FR-012**: Un courtier Broker Owner Starter, Broker Manager, Broker Agent ou Broker Read-only NE DOIT jamais acceder aux routes admin sans role admin explicite.
- **FR-013**: Un courtier Starter NE DOIT jamais acceder aux routes ou donnees CRM.
- **FR-014**: Les roles read-only DOIVENT conserver les refus de mutation, export non autorise, assignation et changement de statut imposes par l'API.
- **FR-015**: L'etat MFA requis DOIT etre visible cote UI lorsque l'API le signale et DOIT bloquer les routes protegees jusqu'a verification.
- **FR-016**: La session frontend DOIT conserver les informations de profil necessaires a l'affichage autorise: identite, roles, tenant broker si present, plan si present, etat MFA et permissions/scopes exposes par l'API.
- **FR-017**: Le stockage du token DOIT etre choisi et documente pour limiter l'exposition aux scripts, eviter les logs, eviter les URL, et permettre logout et expiration fiables.
- **FR-018**: Les erreurs auth/session NE DOIVENT jamais afficher ou journaliser mot de passe, token complet, secrets de signature, PII non necessaire ou details internes.
- **FR-019**: La Web Publique Client NE DOIT importer aucun client API broker/admin, contexte session back-office, layout back-office, route protegee ou politique RBAC admin/broker.
- **FR-020**: Les tests DOIVENT prouver que les routes broker/admin appelees par le frontend utilisent Bearer token et non les headers `x-assurmatch-*`.
- **FR-021**: Les ajustements Backend API, si necessaires, DOIVENT rester limites a auth/session, profil courant, logout, MFA ou contrats partages, sans etendre le perimetre metier.
- **FR-022**: La compatibilite avec les gardes runtime 005 DOIT etre conservee: les headers dev restent ignores en runtime normal et seul le token verifie produit l'acteur fiable.
- **FR-023**: Les pages back-office DOIVENT afficher loading, non authentifie, MFA requis, acces refuse, erreur session et etat autorise de maniere distincte.
- **FR-024**: Les donnees broker/admin deja chargees DOIVENT etre supprimees de l'etat visible lorsqu'une reponse 401/403 invalide l'acces courant.

### Non-Functional Requirements

- **NFR-001**: La session ne DOIT pas degrader la separation applicative entre Web Publique Client et Back-office Partenaires/Plateforme.
- **NFR-002**: Les decisions d'acces finales restent cote API; le frontend peut masquer ou rediriger, mais ne doit pas etre la source d'autorisation.
- **NFR-003**: Les tokens, secrets, mots de passe et headers d'autorisation doivent etre exclus des logs applicatifs, erreurs UI, traces de test et snapshots.
- **NFR-004**: Les ecrans de login, MFA, expiration et acces refuse doivent rester utilisables sans exposer de details sensibles.
- **NFR-005**: Les appels back-office proteges doivent echouer ferme si la session est absente, incomplete, expiree ou invalide.
- **NFR-006**: La mise en place de session ne doit pas activer paiements, souscription, police, attestation, sinistres, API assureur, SSO externe ou IA avancee.
- **NFR-007**: Les tests de separation frontend doivent rester rapides et reproductibles en CI ou environnement local.

### Auth And Session Rules

- La source d'identite runtime du back-office est le Bearer token verifie par l'API.
- Les headers `x-assurmatch-*` ne sont pas une authentification runtime et ne doivent pas etre construits par les clients frontend de production/developpement normal.
- Le profil courant affiche par le back-office doit provenir de `/auth/me`, pas de variables d'environnement dev.
- Les roles, tenant, plan, scopes et MFA utilises pour autoriser une route doivent provenir de l'API apres verification du token.
- La session frontend doit distinguer au minimum: inconnu/loading, non authentifie, login en cours, MFA requis, authentifie, session expiree, acces refuse et erreur recuperable.
- Une reponse 401 invalide la session locale.
- Une reponse 403 n'invalide pas forcement la session, mais bloque la surface demandee et retire les donnees non autorisees de l'affichage.
- Le logout doit etre idempotent du point de vue utilisateur.
- Les tokens ne doivent jamais etre places dans query string, fragment partageable, logs, messages d'erreur ou snapshots publics.

### Impacted Endpoints

| Area | Method | Endpoint | Expected use in this feature |
|------|--------|----------|------------------------------|
| Auth | POST | `/auth/login` | Login back-office broker/admin, reception session et etat MFA |
| Auth | GET | `/auth/me` | Profil courant, roles, tenant, plan, scopes, MFA et verification session |
| Auth | POST | `/auth/logout` | Fin de session et nettoyage frontend |
| Auth/MFA | POST | `/auth/mfa/verify` | Verification MFA si deja exposee par l'API |
| Auth/MFA | POST | `/auth/mfa/enroll` | Preparation UI MFA si deja prevue par l'API et autorisee |
| Broker Starter | GET/POST | `/broker/starter/*` | Appels avec Bearer token pour portail Starter |
| Broker CRM | GET/POST | `/broker/crm/*` | Appels avec Bearer token, plan Pro/Enterprise, `broker_crm_enabled` |
| Admin | GET/PATCH/POST | `/admin/*` | Appels avec Bearer token et RBAC admin |
| Public | Any | `/countries`, `/products`, `/offers`, `/quote-requests` | Non impacte, sauf verification qu'aucune session back-office n'est requise |

### Impacted Frontend Components

- Back-office login page: nouvelle page ou route dediee pour login broker/admin.
- Back-office MFA step: preparation UI si l'API renvoie MFA requis ou challenge MFA existant.
- Back-office protected route boundary: redirection vers login si non authentifie.
- Back-office access denied view: affichage 403 pour roles, plan ou permissions insuffisants.
- Broker home and Starter pages: `apps/broker/app/page.tsx`, `apps/broker/app/leads/page.tsx`, `apps/broker/app/leads/[leadAssignmentId]/page.tsx`.
- Broker CRM pages: `apps/broker/app/crm/page.tsx`, `apps/broker/app/crm/leads/page.tsx`, `apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx`.
- Admin pages already calling protected API: `apps/admin/app/page.tsx`, `apps/admin/app/catalog/page.tsx`, `apps/admin/app/compliance/page.tsx`, `apps/admin/app/feature-flags/page.tsx`, `apps/admin/app/lead-assignments/page.tsx`, `apps/admin/app/offers/page.tsx`, `apps/admin/app/operations/page.tsx`, `apps/admin/app/operations/quote-review/page.tsx`, `apps/admin/app/partners/page.tsx`, `apps/admin/app/prospects/page.tsx`, `apps/admin/app/quote-form-definitions/page.tsx`, `apps/admin/app/quote-requests/page.tsx`, `apps/admin/app/quote-requests/[quoteRequestId]/page.tsx`, `apps/admin/app/users/page.tsx`.
- Public app components: non impactes fonctionnellement; uniquement tests ou controles d'absence d'import back-office.

### Impacted API Clients

- `apps/broker/app/lib/broker-api.ts`: remplacer les headers dev runtime par Bearer token, et ajouter gestion 401/403/session.
- `apps/admin/app/lib/admin-api.ts`: remplacer les headers dev runtime par Bearer token, et ajouter gestion 401/403/session.
- Shared auth/session contract if needed: `packages/shared/contracts/auth.contracts.ts` pour aligner login, MFA, profil courant ou types de session.
- Backend auth/session support if needed: `/auth/login`, `/auth/me`, `/auth/logout`, `/auth/mfa/verify`, sans changer les regles metier back-office.
- Test-only helpers may keep dev simulation headers under backend/frontend test utilities with names explicites.

### Test Requirements

- Frontend unit/component tests for login success, invalid credentials, MFA required, logout, expired session and access denied.
- Frontend tests proving broker/admin clients send `Authorization: Bearer <token>` on protected calls.
- Frontend tests proving broker/admin runtime clients do not send `x-assurmatch-*`.
- HTTP/e2e tests for `/auth/login`, `/auth/me`, `/auth/logout`, token expired, token invalid and MFA path if available.
- HTTP/e2e tests proving Starter cannot access CRM and broker cannot access admin.
- HTTP/e2e tests proving admin RBAC denial returns 403 and does not expose protected data.
- Separation tests proving `apps/public` imports no broker/admin API clients, back-office session context or protected layouts.
- Regression tests allowing `x-assurmatch-*` only in tests, mocks or fixtures explicitly isolated.
- Playwright or equivalent smoke tests for login -> profile -> broker Starter page, login -> admin health/page, 401 redirect and 403 access denied.

### Key Entities *(include if feature involves data)*

- **BackOfficeSession**: Frontend representation of authentication state, token presence, profile, MFA state and expiration handling.
- **AccessToken**: Signed bearer credential returned by login and attached to protected back-office requests.
- **CurrentUserProfile**: API-derived view of actor id, roles, tenant, plan, scopes, permissions and MFA state required by UI.
- **MfaChallenge**: Temporary state used when the API requires MFA verification before protected access.
- **ProtectedRouteState**: UI state that decides loading, redirect to login, MFA step, access denied or authorized content.
- **BrokerApiClient**: Back-office broker client that must attach Bearer token and handle 401/403.
- **AdminApiClient**: Back-office admin client that must attach Bearer token and handle 401/403.
- **TestAuthSimulationHeaders**: Test-only mechanism for `x-assurmatch-*`, explicitly forbidden in normal frontend runtime.
- **AuditLog**: Evidence for sensitive auth/session events and refusals when supported by the API.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of runtime broker/admin frontend API calls to protected routes include `Authorization: Bearer <token>` in acceptance tests.
- **SC-002**: 0 runtime broker/admin frontend API calls include `x-assurmatch-*` headers outside files or modes explicitly marked test/mock/fixture.
- **SC-003**: 100% of unauthenticated visits to protected broker/admin pages redirect to login before protected data is rendered.
- **SC-004**: 100% of expired or invalid token scenarios clear session state and return the user to login without showing protected data.
- **SC-005**: 100% of 403 scenarios tested display access denied and do not expose admin, CRM or cross-tenant broker data.
- **SC-006**: A Starter broker has 0 successful CRM accesses in frontend and HTTP regression tests.
- **SC-007**: A broker user has 0 successful admin route accesses in frontend and HTTP regression tests unless also granted an explicit admin role.
- **SC-008**: 0 Web Publique Client routes import or call back-office session, broker/admin clients or protected routes in separation tests.
- **SC-009**: Login -> `/auth/me` -> authorized broker/admin page succeeds for the seeded/fixture back-office users in smoke tests.
- **SC-010**: Logout removes local session state and prevents further protected fetches until a new successful login in 100% of logout tests.

## Assumptions

- Spec 005 has already made protected API routes require a signed Bearer token in normal runtime and ignore `x-assurmatch-*` outside explicit test mode.
- The back-office may remain split across `apps/broker` and `apps/admin`, both belonging to the Back-office Partenaires/Plateforme surface.
- `/auth/login`, `/auth/me`, `/auth/logout` and MFA endpoints exist or require only minor alignment in the Backend API.
- The exact token storage mechanism will be selected during planning according to the current app architecture and security tradeoffs; this spec requires secure handling outcomes rather than prescribing a single storage primitive.
- External IdP, OAuth, SSO and advanced refresh-token lifecycle are intentionally outside this feature unless already present and needed for minimal compatibility.
- Existing backend RBAC/MFA/tenant checks remain authoritative; the frontend only reflects their result and improves navigation/session handling.
- Existing tests may keep simulation headers only when clearly isolated from normal frontend runtime.

## Risks

- Storing Bearer tokens in a browser-accessible place can increase exposure if not planned carefully.
- Current broker/admin pages may be server-rendered, client-rendered or mixed, which affects the safest session propagation approach.
- A partial migration from dev headers to Bearer could leave some pages working only in tests and failing in normal runtime.
- Treating 403 as a generic error could hide authorization bugs or leave stale protected data visible.
- Shared auth utilities could accidentally be imported by the Web Publique Client if boundaries are not tested.
- MFA support may need small API/UI alignment if the current response shapes are incomplete.

## Out Of Scope

- Full external IdP integration.
- Google/Microsoft OAuth.
- Enterprise SSO.
- Advanced refresh-token rotation if not already planned.
- Complete security architecture redesign.
- Payments, subscription, premium collection, policy issuance, attestation, e-signature, claims and insurer API.
- Public quote flow changes, lead routing changes, offer ranking changes or new broker business actions.
- Advanced AI, AI lead scoring changes or broker AI assistant.
- Full visual redesign of broker/admin apps.
