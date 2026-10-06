# Feature Specification: Réponse du courtier au visiteur et suite donnée par le visiteur

**Feature Branch**: `claude/inspiring-maxwell-58e67d`
**Created**: 2026-10-03
**Status**: Validated (workflow continu autorisé par l'utilisateur le 2026-10-03 : il ne doit être sollicité que pour une décision métier)
**Input**: PRD v0.3, EPIC E (E-02, E-04 à E-07) et EPIC F (F-01 à F-03), scénarios SC-06 et SC-07. Décisions : D-2 (coordonnées complètes visibles dès l'affectation, consultation auditée), D-5 (le Starter répond par une proposition simple ; constitution 1.3.0), D-9 (messagerie libre après le lancement).
**Validation State**: Validated
**Continuous Workflow Eligible**: Yes

## Why this spec exists

Dernière étape du scénario cible : « le courtier répond ». Aujourd'hui :

- **Proposition invisible.** Le CRM enregistre une « proposition », qui se résume à une référence, un montant et une note. Elle n'a ni fichier ni écran, et le visiteur ne la voit jamais.
- **Starter muet.** Le courtier Starter ne peut rien répondre.
- **Coordonnées masquées en Pro.** La fiche CRM Pro affiche l'e-mail et le téléphone masqués, même pour le courtier affecté : il ne peut pas appeler le visiteur.
- **Fonctions CRM sans écran.** L'assignation à un conseiller et les documents du lead ont des routes, mais aucun écran. Les documents sont une simple clé de stockage, sans fichier.
- **Pas de suite visiteur.** Le visiteur ne peut ni dire qu'il est intéressé, ni décliner, ni poser une question.

La spec 054 a livré l'espace de suivi, avec un statut « Proposition disponible » réservé. Cette spec y branche la réponse du courtier et la suite donnée par le visiteur.

## Constitutional Scope & Compliance

- **Technical platform role**:
  - Une proposition émane toujours du courtier nommé.
  - Elle est marquée « proposition indicative non contractuelle, à confirmer par le courtier ».
  - AssurMatch ne compare pas les propositions, ne les classe pas et ne les recommande pas.
  - La réponse « intéressé » du visiteur est une demande de rappel. Elle ne vaut ni souscription ni acceptation de contrat.
  - Aucune signature ni aucun paiement.
- **Impacted application(s)**: Broker Back-office (Starter et CRM Pro/Enterprise) ; Web Publique Client (espace de suivi) ; Backend API ; notifications ; base de données ; packages partagés.
- **Frontend separation**: Le visiteur répond depuis son espace public, avec son jeton de la spec 054. Le courtier agit dans son portail authentifié.
- **Required feature flags**: Aucun nouveau flag. Le multi-courtiers reste fermé : chaque proposition reste liée à son affectation.
- **Consent and transmission**: Une proposition n'est visible que pour la demande dont le consentement est actif. Après un retrait, les propositions sont masquées et ne peuvent plus être envoyées.
- **Partner license controls**: Seul le courtier affecté, actif ou en lecture seule pour la consultation, peut voir le lead. Seul un courtier non suspendu peut envoyer une proposition.
- **Audit and data history**:
  - **Propositions** : versionnées par création ; une proposition envoyée est immuable. Historique : brouillon, envoyée, vue, réponse du visiteur, retirée.
  - **Coordonnées** : chaque consultation est auditée (D-2).
  - **Réponses du visiteur** : historisées et opposables.
- **Security and RBAC**:
  - un courtier ne voit que ses affectations ;
  - un agent ne voit que les leads qui lui sont assignés (règle CRM existante) ;
  - un compte en lecture seule ou suspendu ne peut pas écrire ;
  - le visiteur ne voit que les propositions de sa demande, et seulement celles envoyées ;
  - les fichiers sont analysés par l'antivirus et ne sont jamais servis s'ils sont infectés ;
  - téléchargement côté visiteur avec son jeton, côté courtier avec sa session ; chaque téléchargement est audité.
- **Routing impact**: Aucun.
- **AI impact**: N/A. Aucune rédaction automatique de proposition.
- **UX/content restrictions**: Garde des formulations interdites sur tout le texte saisi par le courtier. Mentions non contractuelles imposées. Aucun libellé « acceptée », « contrat » ni « souscrire » côté visiteur.

## User Scenarios & Testing

### User Story 1 - Le courtier voit et contacte le visiteur (Priority: P1)
Dès l'affectation, le courtier affecté (Starter ou Pro) voit les coordonnées complètes du visiteur. Chaque consultation est auditée (D-2). Un lead réaffecté ou clôturé pour retrait du consentement redevient masqué pour l'ancien courtier.

**Acceptance**:
1. **Given** un lead affecté à X (Pro), **When** l'agent assigné ouvre la fiche, **Then** il voit l'e-mail et le téléphone complets, et la consultation est auditée.
2. **Given** un lead réaffecté de X vers Y, **Then** X ne voit plus que des coordonnées masquées et ne peut plus agir sur le lead.
3. **Given** un consentement retiré, **Then** les coordonnées sont masquées pour tous les courtiers.

### User Story 2 - Le courtier envoie une proposition (Priority: P1)
Le courtier, Starter ou Pro, rédige une proposition et l'envoie. Une proposition comporte :

- un message ;
- une prime indicative ou une fourchette, avec sa devise ;
- les principales garanties ;
- une date de validité ;
- un PDF facultatif, analysé par l'antivirus.

Le visiteur reçoit un e-mail. Dans son espace, il voit « Proposition disponible » et peut consulter la proposition. En CRM Pro, le statut du lead passe à « devis envoyé ».

**Acceptance**:
1. **Given** un lead accepté par X, **When** X envoie une proposition, **Then** le visiteur reçoit un e-mail (dans sa langue, avec un lien neuf), et son espace affiche la proposition avec la mention non contractuelle.
2. **Given** un lead non accepté, **When** X tente d'envoyer, **Then** c'est refusé : le lead doit d'abord être accepté.
3. **Given** un texte contenant une formulation interdite, **Then** l'envoi est refusé avec la formulation identifiée.
4. **Given** un fichier infecté, **Then** l'envoi est refusé, et le fichier n'est jamais servi.
5. **Given** un compte suspendu, un agent non assigné ou un compte en lecture seule, **Then** c'est refusé.
6. **Given** une proposition envoyée, **When** X veut la corriger, **Then** il la retire et en envoie une nouvelle. Une proposition envoyée n'est jamais modifiée.
7. **Given** un courtier Starter, **Then** il dispose de « Répondre au visiteur », sans aucune fonction CRM (constitution 1.3.0).

### User Story 3 - Le visiteur donne suite (Priority: P1)
Depuis son espace, le visiteur répond à une proposition :

- « Je suis intéressé, rappelez-moi », avec un créneau facultatif ;
- « Je ne donne pas suite », avec un motif facultatif choisi dans une liste ;
- une question (texte court).

Le courtier est notifié dans son portail et par e-mail. La réponse apparaît dans l'historique du lead. Le statut CRM n'est jamais changé automatiquement : le courtier se voit seulement proposer le statut suivant.

**Acceptance**:
1. **Given** une proposition envoyée, **When** le visiteur clique sur « intéressé », **Then** le courtier est notifié, et le visiteur voit « Le courtier vous recontactera ».
2. **Given** une proposition expirée ou retirée, **Then** le visiteur ne peut plus y répondre.
3. **Given** une question du visiteur, **Then** elle est transmise au courtier (texte limité à 500 caractères, sans fichier), et le courtier y répond par une nouvelle proposition ou hors plateforme. La messagerie libre relève de D-9 (après le lancement).
4. **Given** plusieurs réponses du visiteur à la même proposition, **Then** seule la dernière fait foi, et toutes sont historisées.

### User Story 4 - Outils CRM complétés (Priority: P2)
En CRM Pro et Enterprise :

- assigner un lead à un conseiller depuis la fiche (route existante) ;
- joindre des documents internes au lead, avec un vrai téléversement analysé par l'antivirus ;
- voir les propositions et les réponses du visiteur dans la chronologie ;
- utiliser la vue Kanban (route existante).

**Acceptance**:
1. **Given** un manager, **When** il assigne un lead à un agent, **Then** l'agent le voit, et un autre agent ne le voit pas.
2. **Given** un document interne au lead, **Then** il n'est jamais visible du visiteur.

### Edge Cases
- **Consentement retiré** : propositions masquées pour le visiteur, envoi impossible.
- **Lead réaffecté** : les propositions de l'ancien courtier restent dans l'historique de la demande. Côté visiteur, elles sont marquées « clôturée » et ne peuvent plus recevoir de réponse.
- **Courtier suspendu** : lecture seule ; ses propositions déjà envoyées restent visibles et le visiteur peut encore y répondre ; aucune nouvelle proposition.
- **Licence expirée** : le courtier ne reçoit plus de nouveaux leads. Il peut continuer à traiter un lead en cours s'il n'est pas suspendu ; c'est la règle existante.
- **Données anonymisées (spec 046)** : propositions et réponses anonymisées selon la même politique.
- **Entrées** : formulations interdites, montant minimal supérieur au maximal, validité passée, fichier de plus de 5 Mo ou de type invalide, plus de 10 propositions actives par lead.

## Requirements

- **FR-001**: Les coordonnées complètes du visiteur MUST être visibles du courtier affecté (Starter et Pro/Enterprise) dès l'affectation. Elles MUST être masquées pour tout autre courtier, après une réaffectation ou après un retrait du consentement. Chaque consultation MUST être auditée.
- **FR-002**: Le courtier affecté, ayant accepté le lead et non suspendu, MUST pouvoir créer et envoyer une proposition avec :
  - un message (2 000 caractères au maximum) ;
  - une prime indicative ou une fourchette, et une devise ;
  - les principales garanties (20 au maximum) ;
  - une date de validité future ;
  - un PDF facultatif (antivirus, 5 Mo au maximum).
- **FR-003**: Une proposition envoyée MUST être immuable. Le courtier peut la retirer et en envoyer une nouvelle. Statuts : envoyée, vue, réponse du visiteur, retirée, expirée.
- **FR-004**: Toute proposition MUST porter la mention « Proposition indicative non contractuelle, à confirmer par le courtier » (FR et EN) et passer la garde des formulations interdites.
- **FR-005**: L'espace de suivi MUST afficher, pour chaque affectation, ses propositions envoyées non retirées : contenu, validité, fichier téléchargeable avec le jeton. Il MUST passer au statut public « Proposition disponible » quand une proposition active existe.
- **FR-006**: Le visiteur MUST pouvoir répondre « intéressé » (créneau facultatif), « pas de suite » (motif facultatif, liste fermée) ou poser une question (500 caractères au maximum). Le débit est limité. Chaque réponse est historisée et notifiée au courtier, dans son portail et par e-mail.
- **FR-007**: Une réponse du visiteur MUST ne jamais changer automatiquement le statut CRM. Le portail propose au courtier le statut suivant.
- **FR-008**: Le visiteur MUST recevoir un e-mail (FR ou EN, lien neuf) à chaque nouvelle proposition. Le courtier MUST recevoir une notification à chaque réponse du visiteur.
- **FR-009**: Le courtier Starter MUST disposer de l'action « Répondre au visiteur » (FR-002 à FR-004), et de rien d'autre du CRM.
- **FR-010**: En CRM Pro/Enterprise, l'assignation à un conseiller, les documents internes (vrai fichier analysé, jamais visible du visiteur), la chronologie des propositions et réponses, et le Kanban MUST être disponibles dans l'interface.
- **FR-011**: L'envoi d'une proposition MUST faire passer le statut CRM à « devis envoyé » (Pro/Enterprise) et l'affectation à « contacté », s'ils sont moins avancés.
- **FR-012**: Après un retrait du consentement, les propositions MUST être masquées pour le visiteur, et tout envoi MUST être refusé.

## Key Entities
- **LeadProposal** (évolution de `BrokerCrmProposal`) : affectation, courtier, auteur, message, montants, devise, garanties, validité, document, statut, dates d'envoi, de vue et de retrait.
- **VisitorProposalResponse** : proposition, type (intéressé, pas de suite, question), créneau, motif, texte, date.
- **LeadDocument** : document interne au lead, avec fichier analysé (évolution de `BrokerCrmDocument`).
- **Notification** : types `visitor_proposal_available` et `broker_visitor_response`.
- **AuditLog**.

## Success Criteria
- **SC-001**: Un courtier envoie une proposition avec PDF en moins de 3 minutes. Le visiteur la voit en moins d'une minute.
- **SC-002**: 0 proposition visible d'un autre visiteur ou d'un autre courtier (tests d'isolation).
- **SC-003**: 0 changement automatique de statut CRM par une réponse du visiteur.
- **SC-004**: 100 % des consultations de coordonnées et des téléchargements sont audités.
- **SC-005**: 0 fichier infecté servi.

## Assumptions
- **Langue des propositions** : celle saisie par le courtier. Seules la mention non contractuelle et les libellés sont traduits.
- **Créneau de rappel** : texte libre court (100 caractères) plutôt qu'un agenda.
- **Motifs de « pas de suite »** : prix, garanties, délai, déjà assuré, autre.
- **Stockage et antivirus** : ceux des specs 033 et 051 sont réutilisés.
