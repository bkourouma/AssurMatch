# Feature Specification: Runtime Smoke Docker Compose

**Feature Branch**: `020-runtime-smoke-docker-compose`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "Creer la specification technique 020-runtime-smoke-docker-compose pour AssurMatch. Objectif: rendre le smoke PostgreSQL runtime entierement reproductible en local et en CI grace a une configuration Docker Compose dediee qui demarre PostgreSQL et Redis smoke sur des ports non conflictuels, fournit une DATABASE_URL correcte, et evite les erreurs liees au PostgreSQL local de la machine. Ne genere pas le plan. Ne genere pas tasks.md. N'implemente rien."
**Validation State**: Draft
**Continuous Workflow Eligible**: No - cette invocation est limitee a la specification; le user a explicitement demande de ne pas generer le plan, les taches ni l'implementation.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Cette feature est un durcissement runtime et outillage de smoke test. Elle ne cree aucune vente directe, souscription, encaissement de prime, emission de contrat, attestation, sinistre, signature, paiement, API assureur avancee, recommandation engageante ou conseil personnalise par AssurMatch.
- **Impacted application(s)**: Backend API, runtime operations, scripts npm/shell de test, configuration locale/CI et documentation. Web Publique Client et Back-office Partenaires/Plateforme ne sont pas impactes fonctionnellement et ne recoivent aucun nouvel ecran, route, layout ou privilege.
- **Affected scopes**: Suite runtime PostgreSQL smoke issue de la spec 011, environnement local/CI Docker Compose dedie, PostgreSQL smoke, Redis smoke, variables `DATABASE_URL`/`REDIS_URL`, garde-fous d'environnement, documentation `docs/runtime-postgres-smoke.md` et quickstart de feature.
- **Frontend separation**: Aucun frontend n'est modifie. Les parcours visiteurs publics et les parcours partenaires/admins authentifies restent separes applicativement; la feature ne charge aucun etat back-office depuis l'application publique.
- **Required feature flags**: Aucun feature flag metier ou reglemente n'est active. Les flags existants testes par le smoke restent fail-closed sauf activation explicite deja requise par les scenarios smoke de la spec 011.
- **Consent and transmission**: La feature ne change pas les regles de consentement ni de transmission de leads. Les tests runtime existants qui touchent une demande de devis doivent conserver l'exigence `ConsentRecord` avant toute transmission.
- **Partner license controls**: La feature ne change pas les controles de licence courtier. Les scenarios smoke existants doivent continuer a bloquer tout courtier inactif, non autorise ou sans licence valide lorsque ces cas sont exerces.
- **Audit and data history**: Les actions de demarrage, refus de configuration et nettoyage doivent etre observables dans les logs smoke sans exposer de secrets. Les preuves metier/audit existantes de la spec 011 restent intactes.
- **Security and RBAC**: Les credentials smoke doivent etre non sensibles, synthetiques et limites a l'environnement smoke. Les sorties terminal/CI ne doivent pas exposer de secret reel. Les routes broker/admin eventuellement appelees par la suite runtime conservent RBAC, tenant isolation, plan et MFA lorsque applicable.
- **Routing impact**: Aucun changement de routage. L'environnement smoke sert uniquement a executer les regles existantes avec PostgreSQL et Redis dedies.
- **AI impact**: N/A. Aucun module IA, prompt, appel modele, scoring, recommandation ou validation humaine IA n'est introduit.
- **UX/content restrictions**: Aucun contenu public, CTA ou wording commercial n'est ajoute. La feature ne doit pas introduire les formulations interdites par la constitution.
- **Workflow continuity**: Apres validation explicite et absence de marqueur de clarification, cette feature technique standard pourra passer a `/speckit.plan`, puis `/speckit.tasks`, puis `/speckit.implement`, sauf conflit constitutionnel, risque securite/conformite/donnees, activation interdite, decision produit non couverte ou validation bloquante. Aucun commit automatique apres implementation sans demande explicite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Demarrer un environnement smoke dedie (Priority: P1)

Comme developpeur ou operateur CI, je veux lancer un environnement smoke isole afin que PostgreSQL et Redis utilises par la suite runtime ne dependent jamais des services locaux de la machine.

**Why this priority**: L'echec rencontre pendant 019 venait d'un PostgreSQL Windows deja present sur `127.0.0.1:5432` avec des credentials incompatibles. La premiere valeur de cette feature est d'eliminer cette ambiguite.

**Independent Test**: Lancer le script de demarrage smoke sur une machine disposant de Docker, verifier que PostgreSQL smoke ecoute sur `55432`, Redis smoke sur `56379`, et que les variables documentees pointent vers ces services dedies.

**Acceptance Scenarios**:

1. **Given** Docker est disponible, **When** l'operateur lance le script smoke, **Then** PostgreSQL smoke demarre sur `55432` et Redis smoke demarre sur `56379`.
2. **Given** un PostgreSQL local existe deja sur `127.0.0.1:5432`, **When** l'environnement smoke est demarre, **Then** ce PostgreSQL local n'est pas utilise par defaut.
3. **Given** les ports smoke dedies sont deja occupes, **When** le demarrage smoke est lance, **Then** l'operateur recoit une erreur claire indiquant le conflit de ports et aucune execution de test ne continue contre une cible ambigue.
4. **Given** Docker n'est pas disponible, **When** l'operateur tente de lancer l'environnement smoke Docker, **Then** le script echoue avec une explication actionnable et ne bascule pas silencieusement vers `localhost:5432`.

---

### User Story 2 - Executer le smoke PostgreSQL avec une URL sure (Priority: P1)

Comme developpeur, je veux que la suite `test:runtime:postgres` utilise automatiquement une base smoke dediee afin de reproduire les validations runtime sans collision avec ma base locale.

**Why this priority**: La suite 011 fonctionne lorsque la base est fraiche et correctement provisionnee. Elle doit donc etre lancee avec une `DATABASE_URL` standardisee et verifiee avant toute migration, seed ou test.

**Independent Test**: Demarrer l'environnement smoke, lancer la suite runtime PostgreSQL, puis verifier que la base cible contient `smoke` dans son nom, utilise le port smoke dedie et refuse les configurations interdites.

**Acceptance Scenarios**:

1. **Given** l'environnement smoke est demarre, **When** `npm run test:runtime:postgres` est lance, **Then** le test utilise la base smoke dediee.
2. **Given** `DATABASE_URL` pointe vers une base dont le nom contient `smoke`, **When** le smoke demarre, **Then** les migrations, seeds et tests peuvent continuer contre cette base.
3. **Given** `DATABASE_URL` ne contient pas `smoke` dans le nom de base, **When** le smoke demarre, **Then** il est refuse avant toute action destructrice ou migration.
4. **Given** `DATABASE_URL` contient `?schema=runtime_smoke`, **When** le smoke demarre, **Then** il est refuse avec un message clair expliquant que le schema query-string ne remplace pas une base dediee.
5. **Given** `DATABASE_URL` pointe vers `localhost:5432` ou `127.0.0.1:5432` sans autorisation explicite documentee, **When** le smoke demarre, **Then** il est refuse afin d'eviter le PostgreSQL local par defaut.

---

### User Story 3 - Refuser les environnements dangereux (Priority: P1)

Comme mainteneur, je veux que le smoke refuse les modes d'execution incompatibles afin d'eviter les faux positifs, les adapters memoire et les cibles non-smoke.

**Why this priority**: La suite runtime doit prouver le comportement hors test. `NODE_ENV=test`, une base non-smoke ou une URL ambigue invalident cette preuve.

**Independent Test**: Lancer le smoke avec les configurations interdites et confirmer que chaque tentative echoue avant le demarrage applicatif, les migrations ou la creation de donnees.

**Acceptance Scenarios**:

1. **Given** `NODE_ENV=test`, **When** le smoke demarre, **Then** il est refuse.
2. **Given** `DATABASE_URL` est absente, vide ou mal formee, **When** le smoke demarre, **Then** il est refuse avec une erreur de configuration actionnable.
3. **Given** `DATABASE_URL` contient un indicateur production, preproduction partagee ou staging non dedie, **When** le smoke demarre, **Then** il est refuse avant toute connexion destructrice.
4. **Given** une configuration tente d'utiliser une base smoke via query schema au lieu d'un nom de base smoke, **When** le guardrail s'execute, **Then** le refus mentionne explicitement l'interdiction de `?schema=runtime_smoke`.
5. **Given** un override autorise explicitement `localhost:5432`, **When** il est utilise, **Then** le message de lancement doit rendre cette exception visible et auditable dans les logs smoke.

---

### User Story 4 - Arreter et nettoyer proprement l'environnement smoke (Priority: P2)

Comme developpeur ou CI, je veux arreter et nettoyer les containers smoke afin que les executions suivantes repartent d'un etat maitrise sans laisser de services orphelins.

**Why this priority**: Un environnement reproductible doit couvrir le cycle complet demarrage, execution, arret et cleanup, surtout en CI et sur les postes de developpement.

**Independent Test**: Apres une execution smoke reussie ou echouee, lancer le script stop/cleanup et verifier que les containers smoke sont arretes et que l'etat persistant est traite selon l'option documentee.

**Acceptance Scenarios**:

1. **Given** le smoke est termine, **When** l'operateur lance stop/cleanup, **Then** les containers smoke sont arretes proprement.
2. **Given** une execution smoke a echoue en cours de route, **When** stop/cleanup est lance, **Then** il reste idempotent et nettoie les containers smoke sans toucher aux autres services du projet.
3. **Given** l'operateur choisit un nettoyage complet, **When** cleanup est lance, **Then** les volumes ou donnees smoke dedies peuvent etre supprimes sans supprimer de donnees non-smoke.
4. **Given** l'operateur veut conserver les donnees pour diagnostic, **When** l'option de conservation documentee est utilisee, **Then** les containers peuvent etre arretes sans perte immediate de la base smoke.

---

### User Story 5 - Documenter le quickstart local et CI (Priority: P2)

Comme nouvel arrivant ou mainteneur CI, je veux une documentation claire afin de lancer, diagnostiquer et nettoyer le smoke runtime PostgreSQL de facon identique en local et en pipeline.

**Why this priority**: La reproductibilite depend autant du contrat d'environnement que de la commande. La documentation doit eviter le retour a des commandes ad hoc pointant vers le PostgreSQL local.

**Independent Test**: Suivre le quickstart depuis une machine equipee de Docker et Node, puis verifier que les commandes demarrent les services smoke, lancent la suite et nettoient l'environnement sans connaissance implicite.

**Acceptance Scenarios**:

1. **Given** Docker et Node sont disponibles, **When** un developpeur suit le quickstart, **Then** il peut demarrer l'environnement smoke, lancer le test runtime PostgreSQL et arreter les services.
2. **Given** un pipeline CI doit executer le smoke, **When** il suit les commandes documentees, **Then** il provisionne PostgreSQL/Redis smoke dedies sans utiliser `localhost:5432` par defaut.
3. **Given** une erreur connue apparait, comme port occupe, `NODE_ENV=test`, base non-smoke ou `?schema=runtime_smoke`, **When** l'operateur consulte la documentation, **Then** il trouve la cause et la correction attendue.
4. **Given** `docs/runtime-postgres-smoke.md` existe deja, **When** cette feature est implementee plus tard, **Then** cette documentation est mise a jour pour pointer vers le workflow Docker Compose dedie.

### Edge Cases

- Docker indisponible ou daemon inaccessible: le demarrage smoke echoue clairement sans fallback silencieux vers une base locale.
- Port `55432` occupe: le demarrage PostgreSQL smoke echoue clairement et ne retente pas automatiquement `5432`.
- Port `56379` occupe: le demarrage Redis smoke echoue clairement et ne retente pas automatiquement `6379`.
- PostgreSQL local sur `127.0.0.1:5432`: non utilise par defaut et refuse par guardrail si `DATABASE_URL` le cible sans override explicite.
- `NODE_ENV=test`: refuse car la preuve runtime doit rester hors environnement test.
- `DATABASE_URL` absente, vide, mal formee ou sans nom de base `smoke`: refuse avant migrations, seed ou tests.
- `DATABASE_URL` avec `?schema=runtime_smoke`: refuse car la base elle-meme doit etre dediee et contenir `smoke` dans son nom.
- `DATABASE_URL` contenant un mot-cle production, prod, staging partage ou preproduction non dediee: refuse avant toute action destructive.
- Credentials smoke manquants ou differents du contrat documente: refus ou message clair, sans impression de secret reel.
- Redis smoke indisponible: la suite echoue ou degrade uniquement si le contrat runtime le permet explicitement, sans pointer vers Redis local par defaut.
- Cleanup apres echec partiel: idempotent, cible uniquement les containers, volumes et reseaux smoke.
- Execution CI parallele: les noms de projet, containers, reseaux ou volumes doivent pouvoir eviter les collisions ou documenter la contrainte d'unicite.
- Logs CI: ils ne doivent pas afficher une `DATABASE_URL` complete avec mot de passe, meme non sensible, afin de conserver une discipline de secret handling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le systeme DOIT fournir une configuration Docker Compose dediee au smoke runtime, nommee `docker-compose.runtime-smoke.yml` ou equivalent documente.
- **FR-002**: La configuration smoke DOIT demarrer un PostgreSQL dedie sur le port hote `55432` par defaut.
- **FR-003**: La configuration smoke DOIT demarrer un Redis dedie sur le port hote `56379` par defaut.
- **FR-004**: La base PostgreSQL smoke DOIT avoir un nom contenant `smoke`, par exemple `assurmatch_runtime_smoke`.
- **FR-005**: L'utilisateur et le mot de passe PostgreSQL smoke DOIVENT etre non sensibles, synthetiques et documentes comme locaux/CI uniquement.
- **FR-006**: Le workflow smoke DOIT fournir une `DATABASE_URL` correcte pointant vers le PostgreSQL smoke dedie, avec port `55432` par defaut et nom de base contenant `smoke`.
- **FR-007**: Le workflow smoke DOIT fournir une `REDIS_URL` correcte pointant vers Redis smoke dedie, avec port `56379` par defaut lorsque Redis est requis par le runtime.
- **FR-008**: Un script npm ou shell DOIT demarrer l'environnement smoke dedie.
- **FR-009**: Un script npm ou shell DOIT arreter les containers smoke proprement.
- **FR-010**: Un script npm ou shell DOIT proposer un cleanup idempotent des ressources smoke, incluant containers et volumes dedies lorsque le nettoyage complet est demande.
- **FR-011**: `npm run test:runtime:postgres` ou la commande runtime equivalente DOIT utiliser par defaut la configuration smoke dediee documentee, pas le PostgreSQL local `5432`.
- **FR-012**: Le smoke DOIT refuser `NODE_ENV=test` avant toute connexion, migration, seed ou appel HTTP.
- **FR-013**: Le smoke DOIT refuser toute `DATABASE_URL` dont le nom de base ne contient pas `smoke`.
- **FR-014**: Le smoke DOIT refuser toute `DATABASE_URL` contenant `?schema=runtime_smoke`, avec un message expliquant qu'un schema query-string ne suffit pas.
- **FR-015**: Le smoke DOIT refuser `localhost:5432` et `127.0.0.1:5432` par defaut, sauf autorisation explicite documentee et visible dans les logs smoke.
- **FR-016**: Le smoke DOIT verifier que le PostgreSQL cible repond avec la base smoke attendue avant migrations ou seed destructif.
- **FR-017**: Le smoke DOIT verifier que Redis cible, lorsqu'il est requis, correspond au service smoke dedie et non a un Redis local par defaut.
- **FR-018**: Le workflow DOIT echouer clairement lorsque les ports smoke dedies sont occupes.
- **FR-019**: Le workflow DOIT rester compatible avec une execution locale et une execution CI sans dependance a un service PostgreSQL ou Redis preexistant sur la machine.
- **FR-020**: Les scripts existants de tests standards NE DOIVENT PAS etre remplaces; cette feature ajoute ou specialise le workflow runtime smoke.
- **FR-021**: Le quickstart de feature DOIT documenter demarrage, variables attendues, lancement du smoke, arret, cleanup et erreurs courantes.
- **FR-022**: `docs/runtime-postgres-smoke.md` DOIT etre mis a jour pour decrire le workflow Docker Compose smoke dedie et les garde-fous contre `5432`.
- **FR-023**: Les commandes npm DOIVENT etre mises a jour si necessaire pour exposer un parcours operateur simple: start, test, stop et cleanup.
- **FR-024**: Le workflow NE DOIT PAS modifier le schema Prisma, les regles metier, les routes frontend ou les comportements de paiement, souscription, emission, signature, sinistres, SMTP reel ou CI/CD global.
- **FR-025**: Un test, guardrail ou validation executable DOIT prouver le refus de `localhost:5432` par defaut lorsque l'autorisation explicite n'est pas presente.

### Configuration Requirements

- **CFG-001**: Le port PostgreSQL smoke par defaut est `55432`.
- **CFG-002**: Le port Redis smoke par defaut est `56379`.
- **CFG-003**: Le nom de base PostgreSQL smoke doit contenir `smoke`.
- **CFG-004**: Les credentials par defaut doivent etre non sensibles et limites a l'usage smoke local/CI.
- **CFG-005**: `DATABASE_URL` doit pointer vers la base smoke dediee et ne doit pas dependre de `?schema=runtime_smoke`.
- **CFG-006**: `REDIS_URL` doit pointer vers Redis smoke dedie lorsque Redis est active pour le runtime smoke.
- **CFG-007**: `NODE_ENV` doit etre une valeur non-test appropriee au smoke runtime, par exemple `runtime-smoke`.
- **CFG-008**: Les scripts doivent pouvoir definir ou exporter les variables minimales sans masquer les erreurs de configuration fournies par l'operateur.
- **CFG-009**: Les noms de containers, reseaux et volumes doivent etre reconnaissables comme smoke afin d'eviter les suppressions accidentelles hors scope.
- **CFG-010**: Toute autorisation exceptionnelle de `localhost:5432` doit etre explicite, documentee et absente du comportement par defaut.

### Security Requirements

- **SEC-001**: Aucune configuration smoke ne doit contenir de secret production, preproduction partagee ou credential personnel.
- **SEC-002**: Les logs et sorties CI ne doivent pas afficher de `DATABASE_URL` complete avec mot de passe.
- **SEC-003**: Le smoke doit refuser les cibles dont le nom, l'hote ou les variables indiquent production, prod, staging partage ou preproduction non dediee.
- **SEC-004**: Le cleanup doit cibler uniquement les ressources identifiees smoke et ne doit jamais supprimer des ressources Docker generiques sans filtre.
- **SEC-005**: Les donnees de test doivent rester synthetiques; aucune PII reelle ne doit etre requise pour lancer le smoke.
- **SEC-006**: Les guardrails doivent echouer ferme avant migration, seed ou suppression lorsqu'une configuration est ambigue.
- **SEC-007**: Les exceptions de securite, notamment l'autorisation d'un port local par defaut, doivent etre visibles dans les logs smoke afin de faciliter la revue.

### Documentation Requirements

- **DOC-001**: Le quickstart de feature DOIT expliquer les pre-requis Docker/Node et la sequence start -> test -> stop -> cleanup.
- **DOC-002**: Le quickstart DOIT inclure les valeurs attendues de `DATABASE_URL`, `REDIS_URL`, `NODE_ENV` et tout signal smoke requis.
- **DOC-003**: Le quickstart DOIT documenter les messages de refus pour `NODE_ENV=test`, base non-smoke, `?schema=runtime_smoke`, port occupe et `localhost:5432`.
- **DOC-004**: `docs/runtime-postgres-smoke.md` DOIT expliquer que `5432` n'est plus la cible par defaut du smoke runtime.
- **DOC-005**: La documentation DOIT decrire la strategie CI minimale sans refonte globale du pipeline.
- **DOC-006**: La documentation DOIT indiquer comment conserver temporairement les donnees smoke pour diagnostic puis les nettoyer.

### Key Entities *(include if feature involves data)*

- **RuntimeSmokeEnvironment**: Ensemble logique compose de PostgreSQL smoke, Redis smoke, variables d'environnement et scripts de cycle de vie.
- **SmokePostgresService**: Service PostgreSQL dedie au smoke, expose sur `55432`, avec base contenant `smoke` et credentials non sensibles.
- **SmokeRedisService**: Service Redis dedie au smoke, expose sur `56379`, utilise par le runtime lorsque Redis est requis.
- **SmokeDatabaseUrl**: URL PostgreSQL validee par guardrails avant toute execution destructive ou test runtime.
- **SmokeRedisUrl**: URL Redis dediee au service smoke, distincte du Redis local par defaut.
- **RuntimeSmokeGuardrail**: Validation executable qui refuse `NODE_ENV=test`, base non-smoke, `?schema=runtime_smoke`, cible production et `localhost:5432` non autorise.
- **SmokeLifecycleCommand**: Commande operateur pour start, stop, cleanup et test runtime.
- **SmokeCleanupScope**: Ensemble des containers, reseaux, volumes et donnees identifies comme smoke et seuls eligibles au nettoyage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% des lancements smoke avec Docker disponible demarrent PostgreSQL sur `55432` et Redis sur `56379`, ou echouent avec un message clair si ces ports sont occupes.
- **SC-002**: 100% des executions de la suite runtime PostgreSQL utilisent une base dont le nom contient `smoke`.
- **SC-003**: 100% des tentatives avec `NODE_ENV=test` sont refusees avant connexion a la base.
- **SC-004**: 100% des tentatives avec `?schema=runtime_smoke` sont refusees avec un message explicite.
- **SC-005**: 100% des tentatives non autorisees visant `localhost:5432` ou `127.0.0.1:5432` sont refusees par defaut.
- **SC-006**: 0 execution smoke par defaut ne depend d'un PostgreSQL ou Redis local preexistant sur les ports standards.
- **SC-007**: 100% des commandes stop/cleanup terminees arretent les containers smoke sans toucher aux services non-smoke.
- **SC-008**: Un developpeur equipe de Docker et Node peut suivre le quickstart et lancer start -> test -> stop en moins de 15 minutes.
- **SC-009**: 0 secret production, credential personnel, token ou `DATABASE_URL` complete avec mot de passe n'apparait dans la documentation, les scripts ou les logs attendus.
- **SC-010**: 0 changement de schema Prisma, regle metier, paiement, souscription, emission, signature, sinistre, SMTP reel ou refonte CI/CD globale n'est introduit par cette feature.

## Assumptions

- La suite runtime PostgreSQL de la spec 011 existe et fonctionne lorsqu'elle recoit une base PostgreSQL fraiche correctement provisionnee.
- L'echec observe pendant 019 sur `127.0.0.1:5432` est traite comme un probleme d'environnement local standardisable, pas comme un bug metier.
- Docker Compose est l'option cible pour rendre l'environnement local/CI reproductible; une alternative equivalente reste acceptable seulement si elle preserve les memes ports, guardrails et garanties de non-collision.
- Les valeurs `55432` et `56379` sont les ports par defaut retenus car elles evitent les ports standards `5432` et `6379`.
- La base smoke dediee peut etre detruite ou recreee sans perte de donnees reelles.
- Les credentials smoke sont publics/non sensibles mais restent masques dans les logs par discipline de securite.
- La CI pourra consommer ces commandes sans refonte globale; l'ajout d'un workflow complet ou d'une matrice CI est hors scope de cette specification.

## Risks

- Un operateur pourrait forcer manuellement une `DATABASE_URL` dangereuse; les guardrails doivent donc echouer avant toute action destructive.
- Les ports smoke choisis peuvent etre occupes sur certaines machines; la documentation doit rendre le diagnostic simple sans retomber sur les ports standards.
- Redis peut etre percu comme optionnel si certains scenarios ne l'utilisent pas; la spec impose un service dedie pour maintenir la reproductibilite runtime.
- Des logs trop verbeux pourraient exposer des credentials, meme non sensibles; la discipline de masquage reste requise.
- Le cleanup Docker peut etre dangereux s'il n'est pas strictement filtre sur les ressources smoke.

## Out Of Scope

- Generation de `plan.md`, generation de `tasks.md`, implementation ou commit automatique dans cette invocation.
- Nouvelle fonctionnalite metier.
- Changement du schema Prisma.
- Changement des regles metier, de consentement, de routage ou de licence courtier.
- Paiement, souscription, encaissement, emission de police, attestation, signature electronique, sinistres ou SMTP reel.
- Refonte globale CI/CD, matrice complete de pipeline ou migration d'infrastructure.
- Modification fonctionnelle des applications Web Publique Client ou Back-office Partenaires/Plateforme.
- Activation de modules IA, recommandation, scoring ou decision automatisee.
- Utilisation de donnees personnelles reelles ou d'une base production/preproduction partagee.
