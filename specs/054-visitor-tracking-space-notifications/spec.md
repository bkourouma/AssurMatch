# Feature Specification: Espace de suivi visiteur, courtier nommé et notifications à chaque étape

**Feature Branch**: `claude/inspiring-maxwell-58e67d` (branche de session imposée)
**Created**: 2026-10-03
**Status**: Validated by user on 2026-10-03
**Input**: PRD v0.3, EPIC D (D-01 à D-09), E-01 et E-06, scénario SC-05 et décision D-3 (pas de compte visiteur : accès par lien magique envoyé par e-mail). Socle pour la spec 055 (réponse du courtier).
**Validation State**: Validated by user
**Continuous Workflow Eligible**: Yes. Validée par l'utilisateur le 2026-10-03, aucun marqueur `[NEEDS CLARIFICATION]`.

## Why this spec exists

Aujourd'hui, une fois sa demande envoyée, le visiteur ne sait plus rien :

- **Jeton.** Il est affiché une seule fois sur l'écran de confirmation. Il n'expire jamais et ne peut être ni renvoyé ni renouvelé.
- **E-mail.** Le lien de suivi de l'e-mail de confirmation n'a pas de jeton : la page s'ouvre sans contenu utile.
- **Page de suivi.** Elle affiche une frise figée et n'interroge jamais le statut réel. Le courtier n'est jamais nommé (« courtier partenaire » codé en dur).
- **Notifications.** Seule la confirmation part. Rien ne prévient le visiteur quand sa demande est transmise, prise en charge, réaffectée ou clôturée.
- **Revue manuelle.** Une demande en revue manuelle reçoit à tort le message « transmise à un courtier ».
- **Langue.** Les e-mails sont en français même pour une demande en anglais.
- **Retrait du consentement.** Il n'est pas confirmé par e-mail.
- **Enquête de satisfaction.** Son lien porte un jeton factice et pointe vers une page `/avis` qui n'existe pas : aucune enquête ne peut aboutir.
- **Fuite du jeton.** La page de suivi en anglais n'est pas exclue des robots, et aucune politique de référent ne protège le jeton présent dans l'adresse.

La constitution exige que le visiteur sache à qui sa demande est transmise et pour quelle finalité (principe VIII), et que le courtier responsable soit identifié (principe I). Cette spec donne au visiteur un espace de suivi fiable, accessible sans compte. Elle prépare aussi la spec 055, où la proposition du courtier s'affichera dans cet espace.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Les statuts publics décrivent l'acheminement de la demande, jamais une décision d'assurance. Les e-mails rappellent que le devis et la souscription relèvent du courtier.
- **Impacted application(s)**:
  - Web Publique Client : pages de suivi, de renvoi de lien et d'avis ;
  - Backend API ;
  - notifications e-mail et worker de diffusion ;
  - base de données : jetons d'accès, nouveaux types de notification, données d'événement ;
  - packages partagés.

  Les back-offices ne sont pas modifiés (lecture seule des données existantes).
- **Affected scopes**: Demandes de devis, affectations de leads, statuts CRM projetés en statuts publics, prospects (e-mail), enquêtes de satisfaction, retrait du consentement. Langues FR et EN.
- **Frontend separation**: L'espace de suivi est une fonction publique, protégée par un jeton visiteur propre à une demande. Il ne dépend d'aucune session back-office et n'en charge aucune.
- **Required feature flags**: Aucun nouveau flag. L'enquête de satisfaction reste sous `satisfaction_survey_enabled` (sensible, fermé par défaut).
- **Consent and transmission**: Inchangé. Le retrait du consentement reste disponible dans l'espace et fait désormais l'objet d'un e-mail de confirmation.
- **Partner license controls**: Seul un courtier réellement affecté est nommé au visiteur.
- **Audit and data history**: Chaque événement est journalisé : émission d'un lien, renvoi, ouverture de l'espace, retrait, et notification envoyée ou en échec. Les e-mails ne contiennent ni les réponses du formulaire ni de données sensibles, seulement un lien (choix de la spec 044 conservé).
- **Security and RBAC**:
  - jetons d'accès aléatoires, conservés seulement sous forme d'empreinte, comparés en temps constant, à durée de vie limitée et révocables ;
  - renvoi de lien limité en débit, avec une réponse identique que la demande existe ou non ;
  - pages de suivi exclues de l'indexation et protégées contre la fuite du jeton par référent ;
  - le visiteur ne voit que sa propre demande ;
  - aucun statut interne du courtier n'est exposé tel quel.
- **Routing impact**: Aucun changement de décision. Le routage et les actions des courtiers émettent désormais les événements qui alimentent le suivi.
- **AI impact**: N/A.
- **UX/content restrictions**: Statuts publics en langage clair, FR et EN. Aucune formulation interdite. « Non transmise » est expliquée sans détail sensible.
- **Workflow continuity**: Feature standard. Une fois validée par l'utilisateur, elle enchaîne plan, tâches, implémentation et validations.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Suivre sa demande depuis un lien sécurisé (Priority: P1)

Après sa demande, le visiteur reçoit un e-mail dans la langue de sa demande. Cet e-mail contient un lien personnel vers son espace de suivi. L'espace affiche :

- le statut public réel ;
- le courtier nommé dès que la demande lui est transmise ;
- la chronologie des étapes ;
- ses documents ;
- le retrait du consentement.

**Why this priority**: C'est le cœur de SC-05 et de la promesse « vous savez à qui votre demande est transmise ».

**Independent Test**: Soumettre une demande routée vers le courtier X. L'e-mail de confirmation contient un lien qui ouvre l'espace avec « Transmise à X » et la chronologie. Le même lien sans jeton ou avec un jeton faux n'affiche rien de la demande.

**Acceptance Scenarios**:

1. **Given** une demande soumise en français et routée vers X, **When** le visiteur ouvre le lien de l'e-mail, **Then** il voit le statut « Transmise à X », la date de chaque étape et le rappel du rôle technique d'AssurMatch.
2. **Given** une demande en anglais, **Then** l'e-mail et le lien utilisent l'adresse anglaise, et l'espace s'affiche en anglais.
3. **Given** un jeton invalide, expiré ou révoqué, **When** la page est ouverte, **Then** aucune donnée de la demande n'est affichée, et un formulaire propose de recevoir un nouveau lien.
4. **Given** une demande envoyée à plusieurs courtiers (multi-courtiers consenti), **Then** chaque courtier est listé avec son propre statut public.
5. **Given** l'espace ouvert, **Then** la page n'est pas indexable, et l'adresse avec le jeton n'est jamais transmise à un site tiers.

---

### User Story 2 - Recevoir un nouveau lien (Priority: P1)

Le visiteur qui a perdu son lien saisit la référence de sa demande et son e-mail sur la page « Suivre ma demande ». Si les deux correspondent, un nouveau lien lui est envoyé. La réponse affichée est toujours la même : « Si ces informations correspondent à une demande, un lien vient d'être envoyé. »

**Why this priority**: Sans renvoi, un lien perdu ou expiré coupe le visiteur de son suivi.

**Independent Test**: Demander un lien avec la bonne référence et le bon e-mail : un e-mail arrive, et l'ancien lien reste valable jusqu'à son expiration. Avec un mauvais e-mail : même message, aucun e-mail.

**Acceptance Scenarios**:

1. **Given** une référence et l'e-mail correspondant, **When** le visiteur demande un lien, **Then** un e-mail contenant un nouveau lien est envoyé dans la langue de la demande.
2. **Given** une référence inconnue ou un e-mail différent, **Then** le message affiché est identique, aucun e-mail n'est envoyé, et la tentative est journalisée sans donnée personnelle.
3. **Given** plus de 5 demandes de lien en une heure depuis la même adresse IP, ou plus de 3 pour la même référence, **Then** les demandes suivantes sont refusées poliment.
4. **Given** une demande anonymisée ou supprimée (spec 046), **Then** aucun lien n'est envoyé.

---

### User Story 3 - Être prévenu à chaque étape (Priority: P1)

Le visiteur reçoit un e-mail, dans sa langue, à chaque étape importante :

- demande reçue, ou demande en vérification si elle passe en revue manuelle ;
- demande transmise au courtier X ;
- demande prise en charge par X ;
- demande réaffectée à Y ;
- demande clôturée ;
- demande non transmise.

Chaque e-mail contient un lien neuf vers son espace.

**Why this priority**: PRD §23 « confirmation de transmission au courtier » et E-01. C'est aussi la base des notifications de proposition de la spec 055.

**Independent Test**: Une demande routée vers X, acceptée par X, puis clôturée produit quatre e-mails (reçue et transmise, prise en charge, clôture), dans la bonne langue et sans réponse du formulaire dans le corps.

**Acceptance Scenarios**:

1. **Given** une demande en revue manuelle, **Then** l'e-mail indique qu'elle est en vérification, jamais qu'elle est transmise.
2. **Given** une demande routée vers X, **Then** l'e-mail nomme X (nom commercial, sinon raison sociale).
3. **Given** X accepte le lead, **Then** le visiteur est prévenu de la prise en charge. Si X le rejette et qu'il est réaffecté à Y, le visiteur reçoit « réaffectée à Y ».
4. **Given** une demande non routable, **Then** l'e-mail l'explique sans détail sensible et indique les suites possibles.
5. **Given** plusieurs changements de statut CRM internes (contact tenté, qualifié…), **Then** aucun e-mail n'est envoyé pour ces étapes internes.
6. **Given** un envoi en échec, **Then** il est réessayé selon la politique existante, puis journalisé en échec. La demande n'est pas affectée.

---

### User Story 4 - Retirer son consentement et recevoir la confirmation (Priority: P2)

Depuis son espace, le visiteur retire son consentement. Il reçoit un e-mail de confirmation, et l'espace affiche « Clôturée : consentement retiré ».

**Why this priority**: D-09 (preuve et confiance). Le retrait existe déjà ; seule la confirmation manque.

**Independent Test**: Retirer le consentement : l'e-mail de confirmation arrive, les affectations sont fermées (comportement existant), et le statut public devient « Clôturée ».

**Acceptance Scenarios**:

1. **Given** une demande active, **When** le visiteur retire son consentement, **Then** un e-mail de confirmation part dans sa langue.
2. **Given** un retrait déjà effectué, **When** il est renouvelé, **Then** aucun second e-mail n'est envoyé.

---

### User Story 5 - Donner son avis (Priority: P2)

Après clôture, si l'enquête de satisfaction est activée, le visiteur reçoit un lien qui fonctionne vers la page « Votre avis » (FR `/avis/{ref}`, EN `/en/feedback/{ref}`). Il y donne une note et un commentaire facultatif.

**Why this priority**: Corrige un parcours aujourd'hui cassé (D-08). Reste conditionné au flag sensible fermé par défaut.

**Independent Test**: Flag ouvert, clôturer une demande puis lancer la diffusion des enquêtes : le lien de l'e-mail ouvre la page, et l'avis est enregistré.

**Acceptance Scenarios**:

1. **Given** un lien d'enquête valide, **Then** la page affiche le formulaire, et l'envoi enregistre l'avis une seule fois.
2. **Given** un lien expiré (plus de 30 jours) ou déjà utilisé, **Then** la page l'indique, sans formulaire.
3. **Given** le flag d'enquête fermé, **Then** aucun e-mail d'enquête n'est envoyé (inchangé).

### Edge Cases

- **Pays ou produit désactivé après la soumission** : l'espace reste consultable. Aucune nouvelle transmission n'a lieu.
- **Consentement retiré** : statut « Clôturée », plus aucune notification sauf la confirmation de retrait.
- **Courtier suspendu ou résilié après l'affectation** : le visiteur voit toujours le nom du courtier qui a reçu sa demande. Si l'admin réaffecte, le visiteur est prévenu.
- **Doublon bloqué à la soumission** : aucune demande n'est créée, donc aucun espace ; le message à l'écran est inchangé.
- **IA** : sans objet.
- **Permissions** : un jeton d'une demande ne donne accès à aucune autre demande. Aucune donnée d'un autre visiteur n'est accessible.
- **Séparation des applications** : aucune session back-office n'est requise ni chargée.
- **Entrées publiques** : renvoi limité en débit, réponses neutres, références mal formées rejetées sans détail.
- **Données anonymisées (spec 046)** : l'espace n'affiche plus de données personnelles ; le lien est refusé.
- **Jeton ancien** : les demandes antérieures à cette spec gardent leur jeton d'origine jusqu'à une date de bascule, puis passent au nouveau modèle par renvoi de lien.

## Requirements *(mandatory)*

### Functional Requirements

**Accès**
- **FR-001**: Le système MUST émettre des jetons d'accès visiteur aléatoires, propres à une demande. Ils sont conservés seulement sous forme d'empreinte, comparés en temps constant, valables 30 jours après leur émission et révocables.
- **FR-002**: Un nouveau jeton MUST être émis à la soumission (montré sur l'écran de confirmation), puis dans chaque e-mail au visiteur. Les jetons précédents restent valables jusqu'à leur expiration.
- **FR-003**: Les jetons émis avant cette spec MUST rester acceptés pendant 90 jours après la mise en production, puis être refusés. Le visiteur peut alors demander un nouveau lien.
- **FR-004**: Le système MUST permettre de demander un nouveau lien avec la référence et l'e-mail. La réponse est identique dans tous les cas. Le débit est limité à 5 demandes par heure et par IP, et à 3 par heure et par référence. Le renvoi est refusé pour une demande anonymisée.

**Statut public**
- **FR-005**: Le système MUST projeter, pour chaque demande et chaque affectation, un statut public parmi : Reçue, En vérification, Transmise à {Courtier}, Prise en charge par {Courtier}, Proposition disponible (réservé à la spec 055), Clôturée, Non transmise. La correspondance suit le PRD v0.3 §7.2. Les statuts CRM internes (injoignable, hors cible, doublon, contesté, notes…) ne sont jamais exposés.
- **FR-006**: Le système MUST exposer au visiteur muni d'un jeton valide :
  - la référence et le pays et produit ;
  - le statut public global et le statut par courtier (nom commercial ou raison sociale) ;
  - la chronologie horodatée des étapes publiques ;
  - les documents de la demande ;
  - l'état du consentement.

  Il MUST ne jamais exposer les réponses du formulaire ni les coordonnées complètes.
- **FR-007**: La page de suivi MUST interroger ce statut et l'afficher, en FR ou en EN selon l'adresse. Elle MUST être exclue de l'indexation (balise et en-tête) et MUST empêcher la transmission de l'adresse complète à un site tiers.

**Notifications**
- **FR-008**: Le système MUST notifier le visiteur par e-mail, dans la langue de sa demande, aux étapes suivantes :
  - reçue ;
  - en vérification (revue manuelle) ;
  - transmise (avec le nom du courtier) ;
  - prise en charge (acceptation par le courtier) ;
  - réaffectée (nouveau courtier) ;
  - clôturée ;
  - non transmise ;
  - consentement retiré (confirmation).

  Il MUST ne pas notifier les étapes CRM internes.
- **FR-009**: Chaque e-mail au visiteur MUST contenir un lien neuf et localisé vers l'espace de suivi (FR `/demandes-de-devis/{ref}`, EN `/en/quote-requests/{ref}`), sans réponse du formulaire ni donnée sensible, et passer la garde des formulations interdites.
- **FR-010**: Le message de revue manuelle et le message de doublon MUST ne jamais dire que la demande est transmise.
- **FR-011**: Les notifications MUST être idempotentes : un seul e-mail par événement, par demande et par courtier. L'échec d'envoi suit la politique de réessai existante, puis est journalisé.
- **FR-012**: Les actions qui changent le statut public MUST émettre un événement consommé par les notifications visiteur : affectation, acceptation, rejet, réaffectation, clôture CRM (gagné, perdu), retrait.

**Avis**
- **FR-013**: Les pages publiques « Votre avis » (FR `/avis/{ref}`, EN `/en/feedback/{ref}`) MUST afficher et enregistrer l'enquête. L'e-mail d'enquête MUST contenir un jeton réel et valide, et la langue de l'enquête MUST être celle de la demande.

**Transverses**
- **FR-014**: Chaque émission ou renvoi de lien, ouverture de l'espace avec un jeton valide, refus de jeton et notification MUST être audité, sans donnée personnelle en clair.
- **FR-015**: Le statut exposé MUST être prêt à afficher, dans la spec 055, les propositions du courtier et les réponses du visiteur, sans changer le contrat de la page.

### Key Entities *(include if feature involves data)*

- **VisitorAccessToken** (nouveau) : demande, empreinte, finalité (suivi), date d'émission, expiration, révocation, dernier usage.
- **QuoteRequest** : langue (existant), date de bascule de l'ancien jeton.
- **PublicQuoteStatus** (projection, non stockée) : statut global, statut par affectation, chronologie.
- **Notification** : nouveaux types visiteur (en vérification, transmise, prise en charge, réaffectée, clôturée, consentement retiré), référence de l'événement (affectation concernée).
- **LeadAssignment / BrokerCrmLeadState** : sources des statuts publics (existant).
- **SatisfactionSurveyRequest** : jeton réel livré dans l'e-mail.
- **AuditLog**.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % des e-mails au visiteur contiennent un lien qui ouvre son espace de suivi, dans la langue de sa demande.
- **SC-002**: Le visiteur connaît le nom du courtier en moins d'une minute après le routage (e-mail et espace).
- **SC-003**: 0 demande en revue manuelle annoncée comme transmise.
- **SC-004**: 0 donnée d'une demande accessible sans jeton valide. 0 différence de réponse observable entre un renvoi de lien valide et invalide.
- **SC-005**: 100 % des liens d'enquête de satisfaction ouvrent une page fonctionnelle.
- **SC-006**: 0 statut CRM interne visible par le visiteur.

## Assumptions

- Les jetons valables 30 jours et la bascule de 90 jours pour les anciens jetons sont des valeurs par défaut, modifiables par configuration.
- Le canal reste l'e-mail. SMS et WhatsApp sont hors périmètre (flags fermés).
- « Proposition disponible » et les réponses du visiteur sont livrées par la spec 055. Cette spec prévoit seulement leur place dans le statut et la page.
- La correction du traitement admin des demandes en revue manuelle, qui n'est pas persisté, relève de la spec 056.
- La fréquence d'exécution du worker de notifications reste celle du runtime local et de l'exploitation (spec 057).
