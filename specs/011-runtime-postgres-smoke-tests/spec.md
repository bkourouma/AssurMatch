# Feature Specification: Runtime PostgreSQL Smoke Tests AssurMatch

**Feature Branch**: `011-runtime-postgres-smoke-tests`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "Creer la specification technique 011-runtime-postgres-smoke-tests pour prouver end-to-end que le runtime Prisma reel fonctionne avec PostgreSQL hors NODE_ENV=test, via smoke tests HTTP, migrations, seed minimal, verifications directes en base et garde-fous contre les adapters memoire. Ne genere pas le plan, ne genere pas tasks.md, n'implemente rien."
**Validation State**: Draft
**Continuous Workflow Eligible**: No - cette invocation est limitee a la specification; le user a explicitement demande de ne pas generer le plan, les taches ni l'implementation.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette specification est technique et transversale. Elle ajoute une preuve runtime PostgreSQL pour des comportements deja prevus et n'ajoute aucune vente directe, souscription, encaissement de prime, emission de police, attestation, sinistre, paiement, signature electronique, API assureur avancee, webhook avance, IA avancee ou conseil personnalise engageant par AssurMatch.
- **Impacted application(s)**: Backend API et tests sont les scopes principaux. Docker, scripts dev/test et documentation de lancement peuvent etre touches si necessaire. Web Publique Client et Back-office Partenaires/Plateforme ne sont pas impactes fonctionnellement et ne recoivent aucun nouvel ecran, layout, route frontend ou politique d'acces.
- **Affected scopes**: Runtime NestJS hors test, providers repository Prisma-runtime, configuration d'environnement smoke, migrations Prisma, seeds smoke, appels HTTP backend, verification directe PostgreSQL, nettoyage/isolement des donnees smoke, scripts npm, Docker Compose PostgreSQL optionnel et CI optionnelle.
- **Frontend separation**: Aucun frontend n'est modifie. Les parcours publics et broker/admin restent separes applicativement; les smoke tests appellent uniquement les routes HTTP backend existantes dans leurs scopes public, broker ou admin.
- **Required feature flags**: Les flags existants restent applicables: `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_crm_enabled`, flags pays, flags produit, flags partenaire/plan si deja modelises, et flags IA existants. Les flags sensibles restent fermes par defaut, notamment `payments_enabled`, `e_signature_enabled`, `policy_issuance_enabled`, `claims_enabled`, `insurer_api_enabled`, flags IA sensibles et `broker_crm_enabled` tant qu'il n'est pas explicitement active pour le scenario CRM.
- **Consent and transmission**: Tout scenario de demande de devis transmise doit prouver qu'un `ConsentRecord` valide existe avant transmission. Le scenario sans consentement doit prouver qu'aucune creation non conforme, aucun routage et aucun assignment valide ne sont persistants.
- **Partner license controls**: Les smoke tests broker/routing doivent seed ou verifier des courtiers actifs, autorises et licencies pour les scenarios positifs, et conserver le blocage des courtiers non eligibles lorsque le comportement est observe.
- **Audit and data history**: Les actions sensibles et refus critiques doivent produire un `AuditLog` durable ou echouer ferme si l'audit requis est indisponible. Les verifications directes en base doivent confirmer les lignes critiques creees, avec timestamps et references stables lorsque le schema les expose.
- **Security and RBAC**: Les routes broker/admin smoke doivent utiliser des acteurs ou tokens valides dedies au smoke, conserver RBAC, plan, tenant isolation, MFA lorsque applicable au mode testable, masquage PII et erreurs non sensibles. Les secrets smoke ne doivent pas pointer vers une base de production.
- **Routing impact**: Les tests ne changent pas les regles de routage. Ils prouvent que consentement, activation pays/produit, courtier actif, autorisation pays/produit, licence, quota/capacite, feature flags et trace de decision fonctionnent avec persistance runtime.
- **AI impact**: Aucun appel IA nouveau. Les flags IA restent fermes par defaut et la suite smoke ne doit pas activer scoring, recommandation, assistant broker avance ou decision automatisee IA.
- **UX/content restrictions**: Aucun contenu public nouveau. Les routes existantes doivent continuer a presenter les offres comme indicatives lorsque ce contenu est expose par les contrats actuels et ne doivent pas introduire de formulation interdite.
- **Workflow continuity**: Apres validation explicite et absence de marqueur de clarification, cette feature technique standard pourra passer a `/speckit.plan`, puis `/speckit.tasks`, puis `/speckit.implement`, sauf conflit constitutionnel, risque securite/conformite/donnees, activation interdite, decision produit non couverte ou validation bloquante. Aucun commit automatique apres implementation sans demande explicite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prouver le demarrage runtime PostgreSQL hors test (Priority: P1)

Une equipe technique lance une commande smoke dediee avec une `DATABASE_URL` smoke explicite; l'application demarre hors `NODE_ENV=test`, utilise les repositories Prisma-runtime et refuse tout adapter memoire prioritaire.

**Why this priority**: Les tests HTTP actuels prouvent les routes, mais ils tournent principalement avec adapters memoire. La preuve manquante est le runtime reel avec PostgreSQL et Prisma hors environnement test.

**Independent Test**: Lancer le script smoke dans un environnement dedie non-test, verifier le demarrage backend, appeler l'endpoint health/runtime existant et inspecter les providers ou garde-fous pour confirmer l'absence d'adapters memoire critiques.

**Acceptance Scenarios**:

1. **Given** une `DATABASE_URL` smoke valide et non-production, **When** le script runtime PostgreSQL smoke est lance, **Then** l'application demarre hors `NODE_ENV=test` avec repositories Prisma-runtime.
2. **Given** `NODE_ENV=test` est detecte pour cette suite, **When** le script smoke tente de demarrer, **Then** il echoue avec un message indiquant que la suite doit tourner dans un environnement dedie comme `runtime-smoke`.
3. **Given** un provider memoire prioritaire est tente hors test, **When** le runtime smoke valide les repositories, **Then** le test echoue avant de valider les parcours HTTP.
4. **Given** l'application smoke demarre, **When** `GET /admin/system/health` ou l'endpoint health equivalent est appele, **Then** la reponse confirme un runtime sain sans exposer de secret ni detail sensible.

---

### User Story 2 - Verifier le catalogue public depuis PostgreSQL (Priority: P1)

Une suite smoke cree ou seed un pays actif, un produit actif et une offre indicative active non expiree; elle appelle les routes publiques existantes et confirme que les reponses correspondent aux lignes PostgreSQL.

**Why this priority**: Le catalogue public est le parcours visiteur de base. Il doit prouver que les endpoints ne lisent pas un seed memoire ou un etat process.

**Independent Test**: Seed des donnees catalogue identifiees par un prefixe smoke unique, appeler les trois routes publiques, puis relire les lignes via un client de verification direct pour comparer identifiants, codes, statuts et validite.

**Acceptance Scenarios**:

1. **Given** un pays smoke actif est persiste, **When** `GET /countries` est appele, **Then** le pays apparait selon les flags publics et correspond a la ligne PostgreSQL.
2. **Given** un produit smoke actif est rattache au pays, **When** `GET /countries/:countryCode/products` est appele, **Then** le produit apparait selon les flags produit/pays et correspond a la ligne PostgreSQL.
3. **Given** une offre indicative smoke active et non expiree existe, **When** `GET /countries/:countryCode/products/:productKey/offers` est appele, **Then** l'offre apparait et correspond a la ligne PostgreSQL.
4. **Given** une offre smoke expiree ou inactive existe, **When** les offres publiques sont appelees, **Then** elle n'est pas exposee comme disponible.
5. **Given** les donnees smoke sont modifiees ou supprimees en base, **When** les routes sont rappelees, **Then** les reponses changent en consequence, prouvant la source PostgreSQL.

---

### User Story 3 - Verifier une demande de devis consentie et durable (Priority: P1)

Un visiteur soumet une demande de devis avec consentement valide; le smoke test confirme le succes HTTP puis verifie directement les lignes critiques en base.

**Why this priority**: Prospect, consentement, demande, routage, lead et audit sont des preuves critiques pour conformite, support et responsabilite broker.

**Independent Test**: Seed le catalogue, un texte de consentement publie et un courtier eligible, soumettre `POST /quote-requests`, puis verifier directement `Prospect`, `ConsentRecord`, `QuoteRequest`, `LeadAssignment`, `AuditLog` et `RoutingDecision` ou trace equivalente si le schema la prevoit.

**Acceptance Scenarios**:

1. **Given** pays, produit, offre, consentement et courtier eligible sont seedes, **When** `POST /quote-requests` est appele avec consentement valide, **Then** la reponse HTTP indique un succes selon le contrat existant.
2. **Given** la demande consentie a reussi, **When** la base smoke est interrogee directement, **Then** `Prospect`, `ConsentRecord` et `QuoteRequest` existent et sont relies selon le schema.
3. **Given** un courtier eligible est seed, **When** le routage aboutit, **Then** un `LeadAssignment` durable existe pour ce courtier.
4. **Given** le flux cree ou evalue une decision de routage, **When** la base est interrogee, **Then** un `RoutingDecision` ou une trace equivalente existe si le domaine le prevoit.
5. **Given** la demande consentie est une action sensible, **When** la base ou l'endpoint audit applicable est consulte, **Then** un `AuditLog` durable existe.

---

### User Story 4 - Refuser une demande sans consentement sans persistance non conforme (Priority: P1)

Un visiteur tente de soumettre une demande sans consentement; le smoke test confirme le refus HTTP et l'absence de creation non conforme en base.

**Why this priority**: L'absence de consentement est un invariant constitutionnel. La preuve runtime doit montrer que PostgreSQL ne conserve pas de lead routable ou transmis sans consentement.

**Independent Test**: Appeler `POST /quote-requests` avec un payload smoke sans consentement, verifier le refus HTTP, puis interroger directement les tables critiques pour confirmer l'absence d'une demande valide, d'un assignment et d'une notification broker non conforme.

**Acceptance Scenarios**:

1. **Given** un payload de demande sans consentement, **When** `POST /quote-requests` est appele, **Then** la reponse HTTP refuse la demande selon le contrat existant.
2. **Given** la demande sans consentement est refusee, **When** la base est interrogee, **Then** aucun `LeadAssignment` valide et aucun lead transmis ne sont crees.
3. **Given** la demande sans consentement est refusee, **When** les enregistrements quote/prospect eventuels sont inspectes, **Then** aucune creation non conforme ou routable n'est persistante.
4. **Given** le refus est sensible, **When** l'audit est consulte, **Then** un audit ou une trace de refus existe si le comportement actuel le prevoit.

---

### User Story 5 - Verifier le portail Broker Starter et l'isolation tenant (Priority: P1)

Un courtier Starter actif consulte ses leads persistants; il voit uniquement son tenant, tandis qu'un autre courtier ne peut pas voir ces leads.

**Why this priority**: Les leads contiennent des donnees personnelles et commerciales sensibles. La suite smoke doit prouver l'isolation tenant en runtime Prisma.

**Independent Test**: Seed deux courtiers Starter actifs, un lead assigne au courtier A, obtenir ou fabriquer des acteurs/tokens valides dedies au smoke, appeler `GET /broker/starter/leads` pour A et B, puis comparer avec la base.

**Acceptance Scenarios**:

1. **Given** un courtier Starter A a un lead persistant, **When** A appelle `GET /broker/starter/leads`, **Then** le lead est visible dans sa reponse.
2. **Given** un courtier Starter B n'a pas ce lead, **When** B appelle `GET /broker/starter/leads`, **Then** le lead de A n'est pas visible.
3. **Given** les leads de A et B existent en base, **When** chaque courtier appelle son endpoint, **Then** chaque reponse correspond uniquement aux lignes de son tenant.
4. **Given** un acteur invalide ou sans scope tenant appelle l'endpoint, **When** la route est appelee, **Then** l'acces est refuse sans fuite de donnees.

---

### User Story 6 - Verifier Broker CRM Pro et le flag persistant (Priority: P1)

Un courtier Pro accede au CRM uniquement lorsque `broker_crm_enabled` est explicitement actif; l'acces est refuse lorsque le flag est absent ou false.

**Why this priority**: Le CRM Pro est un module back-office sensible. Il doit rester fail-closed et sa preuve runtime doit venir de la persistance/cache runtime, pas de la memoire test.

**Independent Test**: Seed un courtier Pro actif, un lead assigne, activer explicitement `broker_crm_enabled`, appeler `GET /broker/crm/leads`, puis desactiver ou retirer le flag et verifier le refus.

**Acceptance Scenarios**:

1. **Given** un courtier Pro actif, un lead assigne et `broker_crm_enabled=true`, **When** `GET /broker/crm/leads` est appele avec un acteur valide, **Then** l'acces est autorise et le lead est visible.
2. **Given** `broker_crm_enabled` est absent, false ou invalide, **When** le meme courtier Pro appelle `GET /broker/crm/leads`, **Then** l'acces est refuse.
3. **Given** le flag est modifie dans la persistance smoke, **When** l'endpoint CRM est rappele apres invalidation/cache runtime attendue, **Then** le comportement suit la valeur persistante.
4. **Given** un courtier d'un autre tenant appelle le CRM, **When** la route retourne des leads, **Then** aucun lead hors tenant n'est visible.

---

### User Story 7 - Verifier les feature flags sensibles fail-closed (Priority: P2)

La suite smoke confirme que les flags sensibles sont fermes par defaut et que seules les activations explicites necessaires aux scenarios smoke ouvrent les parcours correspondants.

**Why this priority**: Les feature flags controlent l'activation progressive et les modules reglementes. Un smoke runtime doit detecter toute activation accidentelle.

**Independent Test**: Interroger ou exercer les parcours dependants des flags smoke, confirmer les defaults fermes en persistance runtime, activer uniquement les flags necessaires au scenario et verifier le changement attendu.

**Acceptance Scenarios**:

1. **Given** une base smoke fraiche ou nettoyee, **When** les flags sensibles sont lus, **Then** ils sont absents ou false par defaut.
2. **Given** `broker_crm_enabled` n'est pas explicitement true, **When** un courtier Pro appelle le CRM, **Then** l'acces est refuse.
3. **Given** un flag necessaire au smoke est explicitement active dans la base smoke, **When** le parcours correspondant est teste, **Then** l'autorisation vient de la persistance/cache runtime.
4. **Given** paiement, souscription, emission, signature, sinistres, API assureur ou IA sensible restent fermes, **When** la suite smoke s'execute, **Then** aucun scenario ne les active.

---

### User Story 8 - Verifier l'audit durable et sa consultation admin si applicable (Priority: P2)

Une action sensible produit un audit durable; si un endpoint admin audit logs existe, la suite smoke confirme aussi que l'API retourne les donnees persistantes.

**Why this priority**: L'audit est une preuve opposable de conformite. Il doit etre durable en PostgreSQL et visible par les mecanismes admin existants lorsque disponibles.

**Independent Test**: Executer une soumission consentie, un refus sans consentement ou une action broker sensible, interroger directement `AuditLog`, puis appeler l'endpoint admin audit applicable avec un acteur autorise.

**Acceptance Scenarios**:

1. **Given** une action sensible smoke reussit, **When** la base est interrogee, **Then** un `AuditLog` durable existe avec action, cible, resultat et correlation lorsque disponible.
2. **Given** un refus sensible smoke est produit, **When** l'audit est interroge, **Then** un audit ou trace de refus existe si le comportement actuel le prevoit.
3. **Given** un endpoint admin audit logs existe, **When** un admin autorise l'appelle, **Then** les audits smoke persistants sont retournables selon pagination et droits existants.
4. **Given** un acteur non autorise tente de lire l'audit, **When** l'endpoint admin est appele, **Then** l'acces est refuse sans fuite de donnees.

### Edge Cases

- `DATABASE_URL` absente, vide, invalide, partagee avec production ou non marquee smoke: le script doit refuser de demarrer.
- `NODE_ENV=test`: la suite smoke doit echouer car cet environnement force ou autorise les adapters memoire.
- Environnement `runtime-smoke` sans `ASSURMATCH_RUNTIME_SMOKE=true` ou signal equivalent: le script doit refuser de demarrer si ce signal est requis pour eviter toute execution accidentelle.
- Docker Compose PostgreSQL indisponible: la documentation doit decrire une alternative avec base PostgreSQL existante et `DATABASE_URL` explicite.
- Migrations non appliquees ou schema incompatible: la suite doit echouer avant les parcours HTTP, avec une erreur actionnable.
- Base smoke deja peuplee: les donnees doivent etre isolees par identifiant/prefixe/correlation smoke ou nettoyees avant/apres la suite.
- Nettoyage partiel apres echec: la prochaine execution doit pouvoir identifier et supprimer ou ignorer les donnees smoke restantes sans toucher aux donnees hors smoke.
- Adapter memoire resolu pour un repository critique hors test: le smoke doit echouer immediatement.
- Cache de feature flags stale: le smoke doit invalider, attendre ou contourner le cache par mecanisme runtime documente avant d'affirmer la valeur persistante.
- Pays, produit ou offre desactivee/expiree: le catalogue smoke ne doit pas les exposer comme disponibles.
- Consentement absent, hors scope ou texte non publie: aucun lead transmis et aucune persistance non conforme.
- Courtier inactif, non autorise, sans licence valide, hors quota ou mauvais plan: aucun assignment eligible ne doit etre cree.
- Acteur broker/admin invalide, tenant absent, role insuffisant ou read-only: les routes protegees doivent refuser sans fuite.
- Endpoint equivalent absent pour health ou audit admin: la spec accepte l'endpoint existant equivalent ou la verification directe DB documentee, sans creer de nouvelle route metier.
- Erreur pendant un flux multi-entites: aucune preuve de succes partielle ne doit etre consideree valide; la suite doit verifier l'etat final durable attendu.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme DOIT fournir une suite de smoke tests runtime PostgreSQL dediee, lancee par un script npm explicite tel que `npm run test:runtime:postgres` ou nom equivalent documente.
- **FR-002**: La suite smoke NE DOIT PAS tourner avec `NODE_ENV=test` si cela force ou autorise les adapters memoire.
- **FR-003**: La suite smoke DOIT utiliser un environnement dedie comme `NODE_ENV=runtime-smoke`, `ASSURMATCH_RUNTIME_SMOKE=true` ou signal equivalent documente.
- **FR-004**: La suite smoke DOIT exiger une `DATABASE_URL` explicite dediee au smoke et refuser toute URL absente, vide, suspecte de production ou non conforme aux garde-fous documentes.
- **FR-005**: La suite smoke DOIT demarrer l'application backend avec la configuration runtime non-test controlee.
- **FR-006**: La suite smoke DOIT appliquer les migrations Prisma ou valider qu'elles sont deja appliquees avant d'executer les appels HTTP.
- **FR-007**: La suite smoke DOIT echouer si les migrations ne reconstruisent pas le schema attendu ou si la validation Prisma/runtime equivalent echoue.
- **FR-008**: La suite smoke DOIT interdire explicitement les adapters memoire pour les repositories critiques hors test.
- **FR-009**: La suite smoke DOIT verifier que les repositories critiques resolus en runtime sont Prisma-runtime, notamment les 12 domaines critiques confirms par l'audit post-010.
- **FR-010**: La suite smoke DOIT appeler `GET /admin/system/health` ou l'endpoint health/runtime equivalent et verifier un etat sain sans fuite de secrets.
- **FR-011**: La suite smoke DOIT seed ou creer un pays actif identifie comme donnees smoke.
- **FR-012**: La suite smoke DOIT seed ou creer un produit actif rattache au pays smoke.
- **FR-013**: La suite smoke DOIT seed ou creer une offre indicative active, publiee et non expiree rattachee au produit smoke.
- **FR-014**: La suite smoke DOIT appeler `GET /countries` et verifier que les donnees retournees correspondent aux lignes PostgreSQL smoke.
- **FR-015**: La suite smoke DOIT appeler `GET /countries/:countryCode/products` et verifier que les donnees retournees correspondent aux lignes PostgreSQL smoke.
- **FR-016**: La suite smoke DOIT appeler `GET /countries/:countryCode/products/:productKey/offers` et verifier que les donnees retournees correspondent aux lignes PostgreSQL smoke.
- **FR-017**: La suite smoke DOIT seed le minimum necessaire a une demande de devis consentie, incluant texte de consentement publie et destinataire prevu lorsque requis.
- **FR-018**: La suite smoke DOIT appeler `POST /quote-requests` avec consentement valide et verifier un succes HTTP conforme au contrat existant.
- **FR-019**: Apres une demande consentie, la suite smoke DOIT verifier directement en base la creation de `Prospect`, `ConsentRecord` et `QuoteRequest`.
- **FR-020**: Lorsqu'un courtier eligible est seed, la suite smoke DOIT verifier directement en base la creation de `LeadAssignment`.
- **FR-021**: Lorsque le domaine routage le prevoit, la suite smoke DOIT verifier directement en base la creation de `RoutingDecision` ou trace equivalente.
- **FR-022**: Apres une demande consentie ou action sensible, la suite smoke DOIT verifier directement en base la creation d'un `AuditLog` durable.
- **FR-023**: La suite smoke DOIT appeler `POST /quote-requests` sans consentement et verifier un refus HTTP conforme au contrat existant.
- **FR-024**: Apres une demande sans consentement, la suite smoke DOIT verifier qu'aucune demande valide routable, aucun `LeadAssignment` et aucune notification broker non conforme ne sont persistants.
- **FR-025**: Si le comportement existant trace les refus sans consentement, la suite smoke DOIT verifier l'audit ou la trace de refus durable.
- **FR-026**: La suite smoke DOIT seed un courtier Starter actif et un lead assigne a ce courtier.
- **FR-027**: La suite smoke DOIT appeler `GET /broker/starter/leads` avec un acteur ou token valide du courtier Starter et verifier que le lead assigne est visible.
- **FR-028**: La suite smoke DOIT appeler le meme endpoint avec un autre courtier et verifier l'isolation tenant.
- **FR-029**: La suite smoke DOIT seed un courtier Pro actif et un lead assigne pour le scenario CRM.
- **FR-030**: La suite smoke DOIT activer explicitement `broker_crm_enabled` pour le scenario CRM positif.
- **FR-031**: La suite smoke DOIT appeler `GET /broker/crm/leads` avec un acteur Pro valide et verifier un succes lorsque `broker_crm_enabled=true`.
- **FR-032**: La suite smoke DOIT desactiver, retirer ou rendre false `broker_crm_enabled`, puis verifier que l'acces CRM est refuse.
- **FR-033**: La suite smoke DOIT verifier que les flags sensibles sont fermes par defaut en base smoke fraiche ou nettoyee.
- **FR-034**: La suite smoke DOIT verifier que la lecture des feature flags vient de la persistance ou du cache runtime associe, pas d'un adapter memoire test.
- **FR-035**: Si un endpoint admin audit logs existe, la suite smoke DOIT verifier qu'il retourne les audits smoke persistants pour un admin autorise.
- **FR-036**: La suite smoke DOIT nettoyer les donnees smoke apres test ou les isoler de facon deterministicement reutilisable.
- **FR-037**: Le nettoyage NE DOIT PAS supprimer de donnees non-smoke et DOIT utiliser des identifiants, prefixes, timestamps, tags ou correlation ids propres a la suite.
- **FR-038**: La documentation quickstart DOIT expliquer comment lancer la suite localement avec PostgreSQL reel, `DATABASE_URL` smoke, migrations, seed minimal, nettoyage et erreurs courantes.
- **FR-039**: La documentation quickstart DOIT expliquer l'usage optionnel de Docker Compose PostgreSQL si le projet le fournit ou si son ajout est retenu plus tard.
- **FR-040**: La documentation DOIT decrire une strategie CI optionnelle pour provisionner PostgreSQL, appliquer/valider les migrations, lancer le script smoke et collecter les logs.
- **FR-041**: La suite smoke NE DOIT PAS ajouter de fonctionnalite metier ni modifier les routes HTTP existantes sauf necessite justifiee dans un futur plan.
- **FR-042**: La suite smoke NE DOIT PAS activer paiement, souscription, emission, signature, sinistres, API assureur avancee, IA avancee ou tout module interdit par la constitution.

### Configuration Requirements

- **CFG-001**: Un environnement smoke doit etre identifiable par `NODE_ENV=runtime-smoke` ou valeur equivalente documentee, et ne doit pas etre traite comme `test`.
- **CFG-002**: `ASSURMATCH_RUNTIME_SMOKE=true` ou signal equivalent doit pouvoir confirmer que l'operateur souhaite lancer une suite destructrice/isolee sur une base smoke.
- **CFG-003**: `DATABASE_URL` doit pointer vers PostgreSQL smoke dedie, jamais production, staging partage ou developpement non isole.
- **CFG-004**: Les variables necessaires aux acteurs/tokens smoke doivent etre documentees ou generables par seed smoke sans exposer de secret permanent.
- **CFG-005**: Les flags actives pour les scenarios doivent etre explicites, minimaux et remis a l'etat attendu par nettoyage ou isolation.
- **CFG-006**: Les commandes de migration/validation doivent etre documentees pour une base vide et pour une base deja migree.
- **CFG-007**: Les logs smoke doivent inclure correlation id ou run id sans journaliser de PII brute ni secret.

### Security Requirements

- **SEC-001**: La suite smoke doit refuser toute URL de base contenant un indicateur de production connu, sauf override impossible ou explicitement interdit par la spec.
- **SEC-002**: Les donnees smoke doivent etre synthetiques et ne doivent pas reutiliser de PII reelle.
- **SEC-003**: Les tokens, mots de passe, secrets ou credentials smoke ne doivent pas etre commits en clair.
- **SEC-004**: Les appels broker/admin doivent verifier l'authentification, le role, le tenant, le plan et les flags applicables.
- **SEC-005**: Les erreurs de refus tenant/RBAC ne doivent pas confirmer l'existence d'une ressource hors scope.
- **SEC-006**: Les sorties CI et locales ne doivent pas exposer `DATABASE_URL`, tokens, secrets ou payloads PII.
- **SEC-007**: Les endpoints publics utilises par la suite doivent conserver validation stricte, anti-spam/rate-limit selon configuration smoke et absence de traitement lourd nouveau.

### Cleanup Requirements

- **CLN-001**: Chaque execution smoke doit produire un identifiant de run permettant de retrouver ses donnees.
- **CLN-002**: Les enregistrements smoke doivent etre tagues, prefixes ou relies a un correlation id afin de permettre un nettoyage cible.
- **CLN-003**: Le nettoyage doit couvrir catalogue smoke, consentements, prospects, quote requests, routing decisions, lead assignments, CRM state, feature flags scenario, notifications, job traces et audits lorsque le schema autorise la suppression.
- **CLN-004**: Lorsque la suppression d'audit ou de preuve durable n'est pas acceptable, l'isolation par run id et retention dediee doit etre documentee.
- **CLN-005**: Un echec de test ne doit pas empecher une execution suivante de nettoyer ou isoler les donnees precedentes.
- **CLN-006**: Le nettoyage ne doit jamais utiliser de suppression large sans filtre smoke explicite.

### Script And Docker Impact Requirements

- **SCR-001**: Un script npm dedie doit exister ou etre prevu pour lancer uniquement cette suite smoke runtime PostgreSQL.
- **SCR-002**: Le script doit echouer clairement quand la configuration smoke minimale est absente.
- **SCR-003**: Le script doit pouvoir etre lance localement sans demarrer les applications frontend.
- **SCR-004**: Si Docker Compose PostgreSQL est disponible ou ajoute ulterieurement, la documentation doit preciser le service, le port, le volume et les commandes de demarrage/arret/nettoyage.
- **SCR-005**: Si Docker Compose n'est pas utilise, la documentation doit decrire le contrat minimal d'une instance PostgreSQL externe.
- **SCR-006**: Les scripts existants de test standard ne doivent pas etre remplaces; cette suite est additionnelle et cible le runtime PostgreSQL non-test.

### CI Strategy Requirements *(optional but specified)*

- **CI-001**: Une integration CI future peut provisionner un service PostgreSQL dedie pour cette suite.
- **CI-002**: La CI doit utiliser une `DATABASE_URL` ephemeral et non-production.
- **CI-003**: La CI doit appliquer ou valider les migrations avant les smoke tests.
- **CI-004**: La CI doit collecter les logs applicatifs et resultats smoke sans exposer de secrets.
- **CI-005**: La suite CI peut etre separee des tests rapides si sa duree ou sa dependance PostgreSQL le justifie.

### Key Entities *(include if feature involves data)*

- **SmokeRun**: Identifiant logique d'une execution smoke, utilise pour prefixer, taguer, correler et nettoyer les donnees.
- **RuntimeEnvironment**: Configuration non-test controlee qui demarre le backend avec PostgreSQL reel et repositories Prisma-runtime.
- **DatabaseUrlSmoke**: URL PostgreSQL dediee au smoke, explicitement fournie et protegee contre les environnements production.
- **RepositoryRuntimeGuard**: Verification que les repositories critiques sont Prisma-runtime et non memory-test hors `NODE_ENV=test`.
- **MigrationState**: Etat des migrations appliquees ou validees avant les appels HTTP.
- **Country**: Pays actif seed pour catalogue public smoke avec flags applicables.
- **Product**: Produit actif seed et rattache au pays smoke.
- **Offer**: Offre indicative active, publiee et non expiree, verifiee en base.
- **ConsentRecord**: Preuve de consentement valide pour la demande positive.
- **Prospect**: Prospect synthetique cree par la demande consentie.
- **QuoteRequest**: Demande publique creee ou refusee selon consentement.
- **LeadAssignment**: Attribution durable creee uniquement pour courtier eligible et consentement valide.
- **RoutingDecision**: Trace durable de decision ou refus de routage lorsque le domaine la prevoit.
- **Partner/Broker**: Courtier Starter ou Pro seed pour scenarios broker et CRM.
- **PartnerLicense**: Licence valide ou blocker potentiel pour routage eligible.
- **FeatureFlag**: Flags persistants verifies fail-closed ou explicitement actives.
- **AuditLog**: Preuve durable d'action sensible, succes ou refus critique.
- **SmokeCleanupTarget**: Ensemble de lignes ou scopes identifies comme appartenant a une execution smoke.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% des executions smoke avec `DATABASE_URL` valide demarrent l'application hors `NODE_ENV=test` avec repositories Prisma-runtime.
- **SC-002**: 100% des tentatives d'utiliser un adapter memoire prioritaire hors test font echouer la suite smoke.
- **SC-003**: 100% des executions sans `DATABASE_URL` smoke explicite, avec `NODE_ENV=test` ou avec URL suspecte de production echouent avant creation de donnees.
- **SC-004**: 100% des scenarios catalogue smoke comparent les reponses HTTP aux lignes PostgreSQL seedes pour pays, produits et offres.
- **SC-005**: 100% des demandes consenties smoke verifient directement en base `Prospect`, `ConsentRecord` et `QuoteRequest`.
- **SC-006**: 100% des demandes consenties smoke avec courtier eligible verifient directement en base un `LeadAssignment`.
- **SC-007**: 100% des scenarios de demande sans consentement verifient un refus HTTP et 0 assignment ou lead transmis conforme en base.
- **SC-008**: 100% des scenarios Starter prouvent que le courtier A ne voit pas les leads du courtier B.
- **SC-009**: 100% des scenarios CRM Pro prouvent le refus quand `broker_crm_enabled` est absent ou false, et le succes quand il est explicitement true.
- **SC-010**: 100% des checks de flags sensibles confirment des defaults fermes pour les modules interdits ou non actives.
- **SC-011**: 100% des actions sensibles smoke retenues verifient un `AuditLog` durable ou documentent un refus ferme si l'audit requis est indisponible.
- **SC-012**: 100% des executions terminees nettoient ou isolent leurs donnees smoke sans supprimer de donnees hors smoke.
- **SC-013**: La documentation quickstart permet a un developpeur de lancer la suite localement avec PostgreSQL reel en moins de 15 minutes sur une machine deja equipee de Node et PostgreSQL ou Docker.
- **SC-014**: 0 route HTTP existante n'est renommee ou changee fonctionnellement par cette spec.
- **SC-015**: 0 activation de paiement, souscription, emission, signature, sinistres, API assureur avancee ou IA avancee n'est introduite par cette suite.

## Assumptions

- La spec 010 a rendu conformes les bindings source: les 12 repositories critiques sont Prisma-runtime hors `NODE_ENV=test`, les adapters memoire sont test-only, les TODO Prisma et messages de transition sont a 0.
- Les endpoints HTTP cites existent ou disposent d'un endpoint equivalent deja present; cette spec ne demande pas de nouvelle route metier.
- Les tests smoke peuvent utiliser des helpers internes de seed et des acteurs/tokens synthetiques dedies au smoke, tant qu'ils passent par les routes HTTP pour les parcours verifies.
- Les verifications directes en base utilisent un client de verification limite a la base smoke et ne remplacent pas les assertions HTTP.
- Les donnees smoke sont synthetiques et identifiables par run id, prefixe, correlation id ou autre marqueur dedie.
- Les audits peuvent etre nettoyes seulement si le schema et la politique de test l'autorisent; sinon ils restent isoles et identifiables comme donnees smoke.
- La CI runtime PostgreSQL est optionnelle dans cette spec; elle peut etre planifiee comme suite separee si le cout ou la duree le justifie.
- Docker Compose PostgreSQL est autorise si disponible ou utile, mais une instance PostgreSQL externe avec `DATABASE_URL` explicite reste acceptable.
- Cette spec documente une preuve technique de runtime; elle n'approuve pas l'activation de nouveaux pays, produits, offres, paiements, souscriptions, attestations, signatures, sinistres ou IA avancee.

## Risks

- Une configuration locale pourrait pointer accidentellement vers une base non-smoke; les garde-fous de `DATABASE_URL` sont donc critiques.
- Les migrations peuvent etre lentes ou dependantes de l'etat local; la documentation doit distinguer base vide, base deja migree et nettoyage.
- Les caches runtime de feature flags peuvent masquer les changements persistants si la suite ne documente pas l'invalidation ou l'attente necessaire.
- Les acteurs/tokens smoke broker/admin peuvent devenir fragiles si l'authentification evolue; ils doivent rester dedies, synthetiques et documentes.
- Le nettoyage d'audit peut entrer en tension avec l'historique opposable; l'isolation par run id peut etre preferable a la suppression.
- Les tests HTTP existants peuvent passer en memoire alors que le smoke echoue avec PostgreSQL; c'est un signal attendu de non-conformite runtime.
- Les endpoints equivalents de health ou audit peuvent varier; la suite doit s'appuyer sur les routes existantes sans creer de nouvelle fonctionnalite.
- L'execution CI peut augmenter la duree du pipeline; elle peut etre optionnelle ou separee tout en restant reproductible.

## Out Of Scope

- Generation de `plan.md`, generation de `tasks.md`, implementation ou commit automatique dans cette invocation.
- Nouvelles fonctionnalites metier.
- Nouveaux ecrans frontend, refonte UI, landing page ou modification des applications Web Publique Client et Back-office Partenaires/Plateforme.
- Changement des routes HTTP existantes sauf necessite future justifiee par le plan.
- Paiement, encaissement de prime, souscription, emission de police, emission d'attestation, signature electronique et sinistres.
- API assureur avancee, webhooks avances, white label, facturation complete ou routage multi-broker avance non deja prevu.
- IA avancee, recommandation IA, decisioning IA, scoring IA ou activation de modules IA.
- Remplacement des suites de tests unitaires/integration existantes.
- Utilisation d'une base production, staging partagee ou donnees personnelles reelles.
- Suppression large de donnees sans filtre smoke explicite.
- Changement de stack, reecriture totale du backend ou suppression brutale des adapters memoire de test.
