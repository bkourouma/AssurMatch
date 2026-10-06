# Feature Specification: Offres — interface admin, gestion par le courtier, validation, versions et routage vers l'offre choisie

**Feature Branch**: `claude/inspiring-maxwell-58e67d` (branche de session imposée)
**Created**: 2026-10-03
**Status**: Validated by user on 2026-10-03
**Input**: PRD v0.3, EPIC C (C-01 à C-06), scénario SC-04 « Le courtier gère ses offres » et décision D-4 (routage vers le courtier de l'offre choisie s'il est éligible). Décisions du 2026-10-03 :
- tous les plans peuvent gérer leurs offres ; seuls le propriétaire et le manager créent et modifient ;
- modifier une offre publiée crée une nouvelle version à valider, et la version publiée reste en ligne jusqu'à cette validation.

**Validation State**: Validated by user
**Continuous Workflow Eligible**: Yes. Validée par l'utilisateur le 2026-10-03, aucun marqueur `[NEEDS CLARIFICATION]`.

## Why this spec exists

Dans le scénario cible, le courtier ajoute ses produits. Aujourd'hui :

- **Courtier sans accès** : le courtier n'a aucune route ni page pour gérer ses offres. Le PRD v0.2 §13 prévoit pourtant que des « courtiers autorisés » enregistrent des offres.
- **Interface admin statique** : la page admin `/offers` n'affiche rien. Seule une API de création, modification, validation et suspension existe, sans formulaire.
- **Modification non contrôlée** : modifier une offre validée la laisse en ligne sans nouvelle validation. Le contenu public peut donc changer sans contrôle. Il n'y a ni versions ni motif de refus.
- **Validation sans contrôle** : elle ne vérifie ni la complétude de l'offre, ni l'éligibilité du courtier, ni sa couverture, ni ses dates.
- **Périmètre ignoré** : la liste admin des offres ignore le périmètre pays de l'Admin Pays.
- **Offre choisie ignorée** : l'offre choisie par le visiteur est enregistrée sans être vérifiée, et le routage ne la lit pas. Le visiteur peut donc choisir l'offre du courtier X et voir sa demande partir chez le courtier Y.
- **Expiration silencieuse** : elle n'est calculée qu'à l'affichage. Aucune file « offres expirées » n'existe et aucun rappel n'est prévu.

Cette spec rend les offres gérables par le courtier sous contrôle de l'admin. Elle versionne leurs modifications et fait respecter le choix d'offre du visiteur. C'est la dernière condition (« au moins une offre publiable ») avant l'ouverture publique d'un pays.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**:
  - Les offres restent **indicatives** : la mention « offre indicative » et « prix à confirmer par le courtier partenaire » est obligatoire.
  - Le courtier responsable est affiché.
  - Aucune offre ne vaut devis ferme ni contrat.
  - AssurMatch valide la **conformité de présentation** d'une offre, pas son contenu assurantiel.
- **Impacted application(s)**:
  - Broker Back-office (nouvelles pages Offres) ;
  - Back-office Plateforme (interface admin des offres et file de validation) ;
  - Backend API ;
  - packages partagés ;
  - base de données (versions, statuts, type, motif de refus) ;
  - Web Publique Client : formulaire de devis et confirmation qui citent le courtier de l'offre choisie, et cohérence des pages d'offre. Le comparateur ne subit aucun changement visuel majeur.
- **Affected scopes**:
  - offres et versions d'offres ;
  - courtiers en statut « Actif test » ou « Actif public » ;
  - pays et produits couverts par la licence et les autorisations du courtier ;
  - rôles : Owner et Manager courtier (écriture), Agent et Read-only (lecture) ; Admin Pays et Content Admin (préparation) ; Super Admin et Compliance Admin (validation) ;
  - routage.
- **Frontend separation**:
  - les écrans courtier vivent dans l'app courtier et ceux de l'admin dans l'app admin ;
  - le site public ne lit que les versions publiées ;
  - aucune route back-office n'est servie au public.
- **Required feature flags**:
  - Flags existants, inchangés : `public_comparator_enabled`, flags pays et produit de comparaison et de publication, `sponsored_offers_enabled`. Seul l'admin peut sponsoriser une offre, et l'étiquette « sponsorisé » reste toujours visible.
  - Flag pays `country_quote_enabled` pour le routage.
- **Consent and transmission**: Inchangé. Quand le visiteur a choisi une offre, le consentement nomme le courtier de cette offre comme destinataire prévu, si ce courtier est éligible au moment de l'affichage. Sinon, il décrit la règle d'attribution. Le ConsentRecord enregistre le destinataire prévu.
- **Partner license controls**: Un courtier ne peut proposer une offre que sur un couple pays × produit couvert à la fois par une licence valide et par des autorisations actives. Une offre n'est publique que si son courtier est « Actif public » et éligible (règle existante). Une licence qui expire ou est suspendue retire immédiatement ses offres du public.
- **Audit and data history**:
  - chaque version est conservée, avec son auteur, son statut, ses dates de soumission et de décision, le décideur et le motif ;
  - chaque transition produit un AuditLog avant/après ;
  - la décision de routage enregistre l'offre choisie et la raison du choix ou du non-choix du courtier de l'offre.
- **Security and RBAC**:
  - MFA pour l'admin et pour le courtier (existant) ;
  - un courtier ne voit et ne modifie que ses propres offres ;
  - Owner et Manager peuvent écrire, Agent et Read-only ne font que lire ;
  - un courtier suspendu est en lecture seule (garde existante de la spec 051) ;
  - l'Admin Pays est limité à son périmètre pays, en lecture comme en écriture ;
  - seuls la conformité et le Super Admin valident, refusent ou suspendent une offre, ce qui est une restriction de l'existant.
- **Routing impact**: Une demande liée à une offre est routée **en priorité** vers le courtier de cette offre s'il est éligible : actif public, autorisé, licence valide, capacité et quota disponibles, consentement compatible. Sinon, le routage standard s'applique, la raison est journalisée et le visiteur est informé. Les règles déterministes décident toujours de l'éligibilité (principe VII). Le choix d'offre ne contourne jamais un blocage.
- **AI impact**: N/A. Le résumé IA d'offre et le contrôle de cohérence par IA (OFFER-010) restent hors périmètre ; le score de complétude est déterministe.
- **UX/content restrictions**:
  - garde des formulations interdites sur tous les champs texte, côté courtier comme côté admin ;
  - mentions indicatives imposées ;
  - « sponsorisé » toujours affiché ;
  - aucun libellé de type « meilleure offre ».
- **Workflow continuity**: Feature standard. Une fois validée par l'utilisateur, elle enchaîne plan, tâches, implémentation et validations.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Le courtier crée et soumet une offre (Priority: P1)

Le propriétaire ou un manager d'un courtier actif ouvre « Mes offres », crée une offre en brouillon et la soumet à validation. Il ne peut choisir qu'un pays et un produit qu'il est autorisé et licencié à couvrir. L'offre comprend :

- nom commercial, assureur porteur, description ;
- garanties, exclusions, franchise, plafond ;
- documents requis, délai moyen ;
- prime indicative ou fourchette, devise ;
- période de validité, source de l'information.

Un indicateur de complétude l'aide à finaliser l'offre.

**Why this priority**: C'est l'étape « le courtier ajoute ses produits » du scénario cible.

**Independent Test**: Un Owner Pro couvert CI × Auto crée une offre, la soumet. Elle apparaît « En attente de validation » chez lui et dans la file admin. Elle n'apparaît pas au comparateur.

**Acceptance Scenarios**:

1. **Given** un courtier couvert CI × Auto, **When** son Owner crée une offre CI × Auto, **Then** l'offre est créée en brouillon (version 1), rattachée à son courtier, avec les mentions indicatives par défaut.
2. **Given** le même courtier, **When** il tente une offre SN × Auto (non couvert) ou CI × Santé (non autorisé), **Then** c'est refusé avec le motif.
3. **Given** un Agent ou un Read-only, **When** il tente de créer ou modifier une offre, **Then** c'est refusé. Il peut consulter les offres de son courtier.
4. **Given** une offre dont un champ contient « souscrire maintenant », **When** elle est enregistrée, **Then** c'est refusé avec la formulation fautive identifiée.
5. **Given** une offre dont la complétude minimale n'est pas atteinte (nom, assureur, au moins une garantie, prime ou fourchette, validité, source), **When** le courtier la soumet, **Then** la soumission est refusée avec la liste des champs manquants.
6. **Given** un courtier suspendu (spec 051), **When** il tente d'écrire, **Then** c'est refusé (lecture seule).
7. **Given** le courtier X, **When** il tente de lire ou de modifier une offre du courtier Y, **Then** c'est refusé sans révéler l'existence de l'offre.

---

### User Story 2 - L'admin valide, refuse ou suspend (Priority: P1)

Un Compliance Admin ou un Super Admin ouvre la file « Offres à valider ». Il consulte la version soumise et, pour une modification, la compare à la version publiée. Il la valide ou la refuse avec un motif, qui est visible du courtier. Il peut suspendre une offre publiée.

La validation vérifie :

- la complétude minimale ;
- les mentions indicatives ;
- les dates (fin postérieure au début, fin future) ;
- l'éligibilité du courtier pour le pays et le produit.

**Why this priority**: Aucune offre ne doit être publique sans validation (OFFER-007, principe VIII).

**Independent Test**: Valider l'offre soumise en US1. Elle devient visible au comparateur CI × Auto (si les flags sont ouverts), avec le nom du courtier et la date de mise à jour.

**Acceptance Scenarios**:

1. **Given** une offre soumise complète d'un courtier éligible, **When** la conformité la valide, **Then** la version devient publiée, et le courtier en est notifié.
2. **Given** une offre soumise, **When** la conformité la refuse avec un motif, **Then** elle repasse en brouillon côté courtier avec le motif affiché, et rien ne change au public.
3. **Given** une offre dont la date de fin est passée, ou dont le courtier n'est plus éligible, **When** on tente de la valider, **Then** c'est refusé avec la raison.
4. **Given** un Admin Pays ou un Content Admin, **When** il tente de valider ou de suspendre, **Then** c'est refusé. Il peut préparer des offres pour un courtier de son pays, qui seront soumises à la conformité.
5. **Given** un Admin Pays limité à la CI, **When** il liste les offres, **Then** il ne voit que celles de la CI.
6. **Given** une offre publiée, **When** la conformité la suspend avec un motif, **Then** elle disparaît du comparateur en moins d'une minute et le courtier voit le motif.

---

### User Story 3 - Modifier une offre publiée par version (Priority: P1)

Le courtier modifie une offre publiée. Le système crée une nouvelle version en brouillon, puis la soumet. La version publiée reste affichée jusqu'à la validation de la nouvelle, qui la remplace. Un refus laisse la version publiée en place.

**Why this priority**: Aucun contenu public ne doit changer sans validation (décision du 2026-10-03, OFFER-008).

**Independent Test**: Modifier le prix d'une offre publiée. Le comparateur affiche l'ancien prix jusqu'à la validation, puis le nouveau. L'historique liste les deux versions.

**Acceptance Scenarios**:

1. **Given** une offre publiée en version 1, **When** le courtier modifie la prime, **Then** une version 2 est créée en brouillon et le public affiche toujours la version 1.
2. **Given** la version 2 validée, **Then** le public affiche la version 2 et la version 1 est archivée.
3. **Given** la version 2 refusée, **Then** la version 1 reste publiée, et la version 2 revient en brouillon avec le motif.
4. **Given** une version en attente, **When** le courtier tente d'en créer une autre, **Then** il ne peut que modifier ou retirer la version en attente : une seule version en cours à la fois.
5. **Given** une offre publiée, **When** le courtier la retire, **Then** elle disparaît du public et l'historique est conservé.

---

### User Story 4 - Le choix d'offre du visiteur oriente le routage (Priority: P1)

Un visiteur choisit l'offre du courtier X et demande un devis. Le formulaire et le consentement indiquent que la demande sera transmise à X. Si X est éligible au moment du routage, X reçoit la demande. Sinon, le routage standard s'applique, et la confirmation l'explique sans détail sensible.

**Why this priority**: Décision D-4. Le visiteur doit savoir à qui sa demande est transmise (principe VIII), et l'offre affichée doit correspondre au destinataire.

**Independent Test**: Choisir l'offre de X pour une demande CI × Auto. Le lead est affecté à X, la confirmation nomme X, et la décision de routage enregistre « offre choisie : courtier prioritaire retenu ».

**Acceptance Scenarios**:

1. **Given** une offre publiée de X, éligible, **When** le visiteur soumet une demande avec cette offre, **Then** X est retenu en priorité, quelle que soit la règle de routage du pays (y compris en round-robin ou en priorité). La décision enregistre l'offre et la raison.
2. **Given** l'offre de X choisie mais X au quota ou suspendu au moment de la soumission, **Then** le routage standard choisit un autre courtier éligible. La raison « courtier de l'offre indisponible » est journalisée, et la confirmation indique que la demande a été orientée vers un autre courtier partenaire agréé.
3. **Given** un identifiant d'offre inexistant, non publié, expiré, ou d'un autre pays ou produit, **When** le visiteur soumet, **Then** l'offre est ignorée : la demande est traitée sans offre, et cette incohérence est journalisée sans bloquer le visiteur.
4. **Given** une demande avec l'offre de X, **When** le formulaire est affiché, **Then** le consentement désigne X par son nom commercial.
5. **Given** une demande sans offre choisie, **Then** le comportement de routage est inchangé.
6. **Given** le mode multi-courtiers fermé (par défaut), **Then** une demande avec offre n'est jamais envoyée à plus d'un courtier par ce mécanisme.

---

### User Story 5 - Interface admin des offres (Priority: P2)

L'admin dispose d'une liste filtrable des offres (pays, produit, courtier, statut, sponsorisation, expiration sous N jours), d'une fiche d'offre avec historique des versions, et peut créer ou modifier une offre pour le compte d'un courtier. Seul l'admin peut marquer une offre comme sponsorisée (étiquette, priorité d'affichage).

**Why this priority**: Exploitation et préparation du catalogue initial. La validation reste couverte par la US2.

**Independent Test**: Filtrer « expire sous 15 jours » : seules les offres concernées apparaissent.

**Acceptance Scenarios**:

1. **Given** un admin, **When** il marque une offre comme sponsorisée, **Then** cela crée une version à valider, et l'étiquette « sponsorisé » apparaît au public une fois validée, si `sponsored_offers_enabled` est actif.
2. **Given** un courtier, **When** il tente de se marquer sponsorisé, **Then** c'est refusé.
3. **Given** une offre expirée, **Then** elle apparaît dans la liste « expirées », et le courtier la voit « Expirée » avec la possibilité de la renouveler, ce qui crée une nouvelle version avec de nouvelles dates.

### Edge Cases

- **Pays ou produit désactivé** : les offres restent gérables mais ne sont pas affichées. Le routage reste bloqué par les flags.
- **Consentement** : la mention du courtier destinataire dépend de son éligibilité au moment de l'affichage. Si elle change entre l'affichage et la soumission, la demande suit le routage standard et le visiteur est informé à la confirmation.
- **Courtier inactif, non autorisé ou au quota** : l'offre n'est pas publique, ou le courtier n'est pas retenu en priorité. La raison est journalisée.
- **Licence expirée, suspendue ou révoquée** : retrait public immédiat des offres. Validation refusée.
- **Offre expirée** : jamais affichée comme disponible et jamais utilisée pour un routage prioritaire. Une offre sponsorisée reste étiquetée.
- **IA** : sans objet.
- **Permissions** : courtier sur l'offre d'un autre courtier, Agent qui écrit, Admin Pays hors périmètre, Admin Pays ou Content Admin qui valide : tout est refusé et audité. Aucun export n'est ajouté.
- **Séparation des applications** : le public ne voit que les versions publiées, sans route back-office.
- **Entrées** : formulations interdites ; prix minimal supérieur au maximal ; dates incohérentes ; plus de 50 garanties ; identifiant d'offre falsifié à la soumission (US4, scénario 3) ; modification concurrente (refus de la seconde écriture).

## Requirements *(mandatory)*

### Functional Requirements

**Modèle et versions**
- **FR-001**: Une offre MUST avoir un identifiant stable et des versions numérotées. Statuts d'une version :
  - brouillon → soumise → publiée | refusée (retour en brouillon avec motif) ;
  - publiée → archivée (remplacée) | suspendue | retirée.

  Le statut effectif « expirée » est calculé à partir de la date de fin.
- **FR-002**: Au plus une version publiée et au plus une version en cours (brouillon ou soumise) MUST exister par offre. Le public affiche toujours la version publiée.
- **FR-003**: Une version MUST porter les champs du PRD §13 :
  - pays, produit, courtier, assureur porteur, nom commercial ;
  - description, garanties, exclusions, franchise, plafond ;
  - documents requis, délai moyen ;
  - prime indicative ou fourchette, devise, unité ;
  - validité, source de l'information ;
  - mentions indicatives ;
  - sponsorisation (admin seulement) ;
  - type : indicative ou partenaire ;
  - auteur, dates de soumission et de décision, décideur, motif.
- **FR-004**: Le système MUST calculer un score de complétude déterministe et refuser la soumission ou la validation sous le minimum : nom, assureur, au moins une garantie, prime ou fourchette, validité future, source.
- **FR-005**: Le système MUST refuser une prime minimale supérieure à la maximale, une date de fin antérieure ou égale au début, et toute formulation interdite, sur chaque champ texte.

**Courtier**
- **FR-006**: Le portail courtier MUST permettre à l'Owner et au Manager, quel que soit le plan, de lister, créer, modifier, soumettre, retirer et renouveler les offres de leur courtier. L'Agent et le Read-only MUST pouvoir seulement les consulter.
- **FR-007**: Le système MUST refuser une offre sur un pays × produit non couvert par une licence valide et des autorisations actives du courtier.
- **FR-008**: Un courtier MUST ne jamais accéder aux offres d'un autre courtier ; une tentative est refusée comme « introuvable ».
- **FR-009**: La garde de lecture seule d'un courtier suspendu (spec 051) MUST s'appliquer à toutes les écritures d'offres.

**Admin**
- **FR-010**: Le back-office MUST fournir :
  - une liste filtrable (pays, produit, courtier, statut, sponsorisation, expiration sous N jours) qui respecte le périmètre pays ;
  - une fiche avec l'historique des versions et la comparaison entre la version publiée et la version soumise ;
  - une file « à valider » ;
  - la création et la modification pour le compte d'un courtier.
- **FR-011**: Valider, refuser et suspendre MUST être réservés au Compliance Admin et au Super Admin. Le refus et la suspension exigent un motif, visible du courtier.
- **FR-012**: La validation MUST vérifier la complétude, les mentions indicatives, les dates, et l'éligibilité du courtier pour le pays et le produit.
- **FR-013**: Seul l'admin MUST pouvoir sponsoriser une offre. La sponsorisation passe par une version à valider.
- **FR-014**: Toute modification d'une offre publiée MUST créer une nouvelle version, sans changer la version publiée.

**Public et routage**
- **FR-015**: Le comparateur, le détail et la comparaison MUST n'afficher que la version publiée d'une offre éligible, non expirée et non suspendue. Les règles de publication existantes restent valables.
- **FR-016**: À la soumission d'une demande, l'offre choisie MUST être vérifiée : existe, publiée, non expirée, même pays et même produit. Sinon elle est ignorée et l'écart est journalisé.
- **FR-017**: Le routage MUST retenir en priorité le courtier de l'offre choisie s'il est éligible selon les règles déterministes existantes. Sinon, il applique le routage standard. La décision MUST enregistrer l'offre et la raison.
- **FR-018**: Le formulaire de devis lié à une offre MUST afficher le nom du courtier de l'offre. La variable de destinataire du consentement est résolue avec ce nom quand le courtier est éligible à l'affichage.
- **FR-019**: La confirmation et le suivi MUST indiquer si la demande a été transmise au courtier de l'offre, ou orientée vers un autre courtier partenaire agréé. Le nom du courtier retenu est affiché par la spec 054 ; cette spec fournit l'information.

**Transverses**
- **FR-020**: Chaque création, modification, soumission, décision, suspension, retrait et renouvellement MUST produire un AuditLog avant/après. Chaque refus d'accès MUST être audité.
- **FR-021**: Le courtier MUST être notifié (notification in-app existante) de la validation, du refus ou de la suspension d'une de ses offres, et 15 jours avant son expiration.
- **FR-022**: Une modification concurrente d'une même version MUST être refusée (rechargement demandé).

### Key Entities *(include if feature involves data)*

- **Offer** : identifiant stable, clé publique, pays, produit, courtier, version publiée courante, version en cours, dates de création et de mise à jour.
- **OfferVersion** (nouveau) : numéro et statut, plus l'ensemble des champs de contenu de FR-003. Elle porte aussi le score de complétude, l'auteur, la date de soumission, le décideur, la date de décision et le motif.
- **OfferHistory** : conservé pour les événements (journal).
- **QuoteRequest** : offre choisie, validée ou ignorée, avec la raison.
- **RoutingDecision** : offre choisie, courtier prioritaire retenu ou non, raison.
- **Notification** : événements d'offre pour le courtier.
- **AuditLog** : toutes les actions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un Owner crée et soumet une offre complète en moins de 10 minutes. La conformité la valide en moins de 2 minutes.
- **SC-002**: 0 changement de contenu public sans validation (test : modification d'une offre publiée).
- **SC-003**: 0 offre publique d'un courtier non éligible, ou expirée.
- **SC-004**: 100 % des demandes liées à une offre éligible sont affectées au courtier de l'offre, et 100 % des cas non retenus portent une raison journalisée.
- **SC-005**: 0 accès d'un courtier aux offres d'un autre courtier (tests RBAC).
- **SC-006**: Une suspension retire l'offre du public en moins d'une minute.
- **SC-007**: 100 % des actions d'offre sont retrouvables dans les journaux d'audit.

## Assumptions

- Le type « Offre assureur » (validée directement par un assureur) et les « offres privées » sont hors périmètre : aucun accès assureur en V1.
- Le résumé IA et le contrôle de cohérence par IA (OFFER-010) restent hors périmètre ; le score de complétude est déterministe.
- Les offres existantes (seed, tests) sont migrées en version 1 publiée si elles étaient validées, ou en brouillon sinon. Leurs identifiants publics ne changent pas.
- Le nom du courtier affiché à la confirmation et dans le suivi est livré par la spec 054. Cette spec fournit seulement l'information « courtier de l'offre retenu ou non ».
- Le rappel d'expiration à J-15 réutilise les notifications in-app existantes. L'envoi par e-mail relève de la spec 061.
- Une offre en mode multi-courtiers ouvert reste hors périmètre, car le multi-courtiers est fermé par défaut.
- Les seuils de complétude sont fixes en V1 (liste FR-004) et pourront devenir configurables plus tard.
