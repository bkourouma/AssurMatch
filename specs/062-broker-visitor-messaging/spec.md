# Feature Specification: Messagerie courtier ↔ visiteur, demandes de documents, SLA de première réponse et demandes de données personnelles

**Feature Branch**: `062-broker-visitor-messaging`
**Created**: 2026-10-15
**Status**: Validated (décisions produit du 2026-10-15 ci-dessous ; workflow continu autorisé, arrêt uniquement sur conflit constitutionnel ou décision métier non couverte)
**Input**: PRD v0.3, EPIC D (D-04, D-10) et EPIC E (E-03, E-05, E-07, E-08), décisions D-3, D-5, D-9 ; §10 ligne 062. Prérequis livrés : 054 (espace de suivi, lien magique), 055 (propositions, réponse du visiteur, isolation), 033 (documents du visiteur), 046 (rétention), 038/061 (notifications).
**Validation State**: Validated
**Continuous Workflow Eligible**: Yes

## Décisions produit prises par le propriétaire du produit (2026-10-15)

1. **D-9 est levée.** La décision « messagerie après le lancement » est annulée : la messagerie est livrée maintenant. Une note datée est ajoutée à côté de D-9 dans le PRD v0.3.
2. **Périmètre** : messages texte et pièces jointes (antivirus), liés au lead, pour **tous les plans** (Starter, Pro, Enterprise). Le visiteur y accède par l'espace de suivi à lien magique (aucun compte, D-3). Les e-mails portent un pointeur, **jamais le contenu du message**. S'y ajoutent les demandes de documents du courtier (E-05) et le SLA jusqu'à la première réponse visible (E-08).
3. **Formulations interdites** : toute formulation interdite saisie par un courtier (liste partagée FR + équivalents EN : « souscrire maintenant », « contrat validé », « garanti »…) **bloque l'envoi**. Le courtier voit l'expression fautive et réécrit.
4. **Demande de données en libre-service (D-10 de l'EPIC D)** : depuis l'espace de suivi, le visiteur peut déposer une demande d'accès, de rectification ou d'effacement. Elle est traitée par la conformité dans l'admin « Rétention ». **Jamais d'effacement automatique** : l'effacement passe par le flux « effacement sur demande » de la spec 046, après approbation de la conformité. E-mail d'accusé de réception avec une référence. Tout est audité.

Décisions techniques du superviseur : drapeau global **non sensible** `broker_visitor_messaging_enabled` (défaut `true`, modifiable depuis l'écran des drapeaux) ; messages en ajout seul ; accès limité aux courtiers actuellement affectés ; conformité/support en lecture seule auditée.

## Why this spec exists

La spec 055 permet au courtier de répondre par une **proposition** et au visiteur de répondre à cette proposition (intéressé, pas de suite, une question de 500 caractères sans fichier). Il manque :

- **Un échange libre.** Le courtier ne peut pas poser une question ou préciser un point ; le visiteur ne peut pas écrire sans proposition préalable.
- **La collecte de pièces après coup.** Le visiteur ne téléverse des documents qu'à la soumission. Le courtier ne peut pas lui en réclamer.
- **Une mesure fidèle du délai.** Le SLA ne tient compte que du premier geste, pas de la première réponse que le visiteur voit.
- **Le libre-service RGPD.** Un visiteur qui veut accéder à ses données, les corriger ou les faire effacer doit écrire au contact : traitement manuel, sans traçabilité.

## Constitutional Scope & Compliance

- **Technical platform role** : le courtier nommé est l'auteur de tout message. AssurMatch ne rédige, ne modère pas le fond, ne recommande ni ne classe. Un bandeau fixe rappelle dans la conversation : « Échange avec {courtier}. AssurMatch est une plateforme technique : ces messages ne constituent ni un contrat ni une garantie. » Aucune souscription, signature ni paiement.
- **Impacted application(s)** (surfaces) : **Backend API** ; **base de données** (migration `0031_broker_visitor_messaging`) ; **packages partagés** (contrats, mots interdits, types de notification, codes d'erreur) ; **Web Publique Client** (espace de suivi : conversation, demandes de documents, formulaire de demande de données) ; **Back-office Courtier** (conversation et demandes de documents sur la fiche du lead, Starter et CRM ; notifications) ; **Back-office Plateforme** (file des demandes de données dans « Rétention » ; vue de conversation en lecture seule pour conformité/support) ; **notifications et worker**.
- **Frontend separation** : le visiteur agit avec son jeton 054 sur des routes publiques ; courtier et admin agissent avec leur session back-office. Aucun écran, rôle ni layout back-office dans l'app publique.
- **Required feature flags** : nouveau drapeau global non sensible `broker_visitor_messaging_enabled`, défaut `true`. Désactivé : plus aucune écriture (message, demande de documents, téléversement) ; l'historique reste lisible (valeur probante). Les demandes de données (D-10) ne dépendent pas de ce drapeau : c'est un droit du visiteur.
- **Consent and transmission** : une conversation n'existe que pour une affectation acceptée dont le consentement est actif. Après un retrait du consentement ou la clôture du lead, la conversation devient **en lecture seule** ; le visiteur peut toujours la lire avec un jeton valide. Elle reste masquée pour l'ancien courtier dès la réaffectation.
- **Partner license controls** : un courtier suspendu ne peut pas écrire (même garde que les propositions) ; en lecture seule il consulte sans écrire.
- **Audit and data history** : messages et demandes en **ajout seul** (jamais de modification ni de suppression ; seuls l'accusé de lecture et l'anonymisation 046 changent une ligne). Audits sans contenu de message. Historique opposable.
- **Security and RBAC** (E-07) :
  - un courtier ne lit et n'écrit que les conversations de ses affectations **actuelles** ; un courtier réaffecté ou désaffecté perd l'accès immédiatement ; un agent CRM ne voit que les leads qui lui sont assignés ;
  - le visiteur ne voit que les conversations de **sa** demande, avec son jeton ; réponse neutre `VISITOR_ACCESS_DENIED` sinon ;
  - conformité et support : lecture seule, auditée, masquage du support (voir règles existantes) ;
  - pièces jointes : antivirus, aucun fichier non sain servi, téléchargement audité, `no-store` et `nosniff` ;
  - limitation de débit côté visiteur (Redis) et anti-spam (champ piège, doublons) ; validation stricte (texte brut, jamais interprété comme HTML).
- **Routing impact** : aucun.
- **AI impact** : N/A. Aucune rédaction ni modération par IA.
- **UX/content restrictions** : garde des formulations interdites sur tout texte saisi par le courtier (messages, motif et note d'une demande de documents). Libellés visiteur sans « acheter », « souscrire », « contrat validé ». E-mails : pointeur seulement.
- **Data protection** : contenu des messages, noms de fichiers et notes de demande de données sont des données personnelles ; jamais dans les logs, jamais dans les e-mails ; ajoutés aux catégories de rétention de la spec 046 avec **durées provisoires, en attente de validation juridique**.

## User Scenarios & Testing

### User Story 1 - Le courtier écrit au visiteur (Priority: P1)
Le courtier affecté (Starter ou Pro), après avoir accepté le lead, ouvre l'onglet « Conversation » de la fiche, écrit un message (texte jusqu'à 2 000 caractères, jusqu'à 3 pièces jointes) et l'envoie. Le visiteur est averti par un e-mail pointeur.

**Acceptance**:
1. **Given** un lead accepté par X, **When** X envoie un message, **Then** le message apparaît dans la conversation, le visiteur reçoit un e-mail (FR ou EN, selon la langue de la demande, lien neuf, sans le texte du message), et l'envoi compte comme première réponse visible pour le SLA s'il est le premier.
2. **Given** un message contenant « contrat validé » (ou « guaranteed »), **When** X l'envoie, **Then** l'envoi est refusé (422 `FORBIDDEN_WORDING`) et l'expression est citée ; le brouillon reste dans la zone de saisie.
3. **Given** un lead non accepté, clôturé, au consentement retiré, ou un courtier suspendu / en lecture seule / agent non assigné / autre tenant / ancien courtier, **Then** l'envoi est refusé et rien n'est écrit.
4. **Given** une pièce jointe infectée, **Then** l'envoi entier est refusé ; aucun fichier non sain n'est jamais servi.
5. **Given** le drapeau `broker_visitor_messaging_enabled` à `false`, **Then** l'envoi est refusé (`MESSAGING_DISABLED`) et la conversation reste lisible.

### User Story 2 - Le visiteur lit et répond dans son espace (Priority: P1)
Le visiteur ouvre son espace de suivi par le lien magique. Il voit une conversation par courtier, écrit (texte jusqu'à 2 000 caractères, jusqu'à 3 pièces jointes) et lit les réponses. Il voit l'accusé de lecture du courtier.

**Acceptance**:
1. **Given** un visiteur avec un jeton valide, **When** il envoie un message, **Then** le courtier affecté est notifié (in-app + e-mail pointeur) et le message figure dans l'historique du lead.
2. **Given** le jeton d'une autre demande, un jeton expiré ou révoqué, **Then** 404 neutre `VISITOR_ACCESS_DENIED`.
3. **Given** un lead réaffecté, **Then** la conversation avec l'ancien courtier reste lisible pour le visiteur, marquée « clôturée », sans possibilité d'écrire ; le nouveau courtier ne voit aucun message de l'ancien.
4. **Given** un consentement retiré, **Then** la conversation passe en lecture seule.
5. **Given** plus de 20 messages par heure pour une conversation, ou 30 par heure pour une IP, **Then** 429. Un message identique au précédent du même visiteur dans les 5 minutes est refusé (409 `DUPLICATE_MESSAGE`).
6. **Given** l'ouverture d'une conversation, **Then** les messages du courtier sont marqués lus (accusé de lecture) ; de même côté courtier.

### User Story 3 - Le courtier demande des documents (Priority: P1)
Le courtier crée une ou plusieurs demandes de documents (intitulé court, note facultative, échéance facultative). Le visiteur reçoit un e-mail pointeur, voit les demandes ouvertes dans son espace, y téléverse ses fichiers (même pipeline antivirus et mêmes limites que la spec 033) et la demande passe à « fournie ». Le courtier est notifié et télécharge le fichier.

**Acceptance**:
1. **Given** une demande « Carte grise », **When** le visiteur téléverse un PDF sain, **Then** la demande passe à `fulfilled`, le courtier est notifié et télécharge le fichier (audité).
2. **Given** un fichier infecté ou de type interdit, **Then** il est refusé et la demande reste ouverte.
3. **Given** une note contenant une formulation interdite, **Then** la demande est refusée.
4. **Given** un courtier qui annule une demande ouverte, **Then** elle passe à `cancelled` (historisée) et le visiteur ne peut plus y téléverser.
5. **Given** un lead clôturé, un consentement retiré ou un courtier réaffecté, **Then** plus aucun téléversement ; les demandes ouvertes passent en lecture seule.
6. **Given** un maximum de 10 demandes ouvertes par affectation, **Then** la 11e est refusée (409).

### User Story 4 - Le visiteur dépose une demande de données (Priority: P1)
Depuis son espace de suivi, le visiteur choisit « Accès à mes données », « Rectifier mes données » ou « Effacer mes données », ajoute un détail facultatif (≤ 1 000 caractères) et confirme. Il reçoit un accusé de réception par e-mail avec une référence (`DR-…`) et voit la demande, son statut et sa référence dans son espace. La conformité la traite dans l'admin « Rétention ».

**Acceptance**:
1. **Given** un jeton valide, **When** le visiteur dépose une demande d'effacement, **Then** une demande `received` est créée, l'accusé part avec la référence, la conformité est alertée, l'action est auditée ; **aucune donnée n'est effacée**.
2. **Given** une demande d'un même type déjà ouverte pour cette demande de devis, **Then** 409 `DATA_REQUEST_ALREADY_OPEN` avec la référence existante.
3. **Given** un compliance admin, **When** il approuve une demande d'effacement, **Then** le flux « effacement sur demande » de la spec 046 est lancé (jamais automatique) et la demande est liée à ce flux ; **When** il rejette, **Then** un motif est obligatoire.
4. **Given** une demande d'accès ou de rectification, **Then** la conformité la traite manuellement et la clôture avec une note ; l'extraction elle-même se fait hors plateforme (DÉCISION À CONFIRMER).
5. **Given** la clôture ou le rejet, **Then** le visiteur reçoit un e-mail pointeur (sans détail) et voit le statut final.
6. **Given** un rôle non conformité (courtier, support, finance…), **Then** la file des demandes est inaccessible ; le support peut au plus lire le statut sans le détail.

### User Story 5 - Le SLA reflète la première réponse visible (Priority: P2)
Le SLA existant du courtier et de l'admin mesure désormais le délai entre l'affectation (premier contact) et la **première réponse visible** : la première proposition envoyée **ou** le premier message du courtier.

**Acceptance**:
1. **Given** une affectation avec un message courtier à t+2h et une proposition à t+5h, **Then** le délai de première réponse visible est de 2 h.
2. **Given** aucun message ni proposition, **Then** l'affectation est comptée comme sans réponse visible et reste hors des moyennes.
3. **Given** un message du visiteur, **Then** il n'entre jamais dans le SLA courtier.

### User Story 6 - Conformité et support relisent un échange (Priority: P2)
Un compliance admin ou un support admin ouvre, en lecture seule, la conversation d'un lead depuis l'admin. Chaque ouverture est auditée. Le support voit les corps de message masqués selon les règles de masquage existantes.

**Acceptance**:
1. **Given** un compliance admin, **When** il ouvre la conversation, **Then** il lit les messages (jamais de zone de saisie) et un audit `lead_messaging.admin_viewed` est écrit.
2. **Given** un courtier ou un visiteur, **Then** la route admin est refusée.

### Edge Cases
- **Réaffectation** : la conversation de l'ancien courtier est figée ; ses demandes de documents ouvertes sont closes (`cancelled` par le système) ; le visiteur conserve la lecture.
- **Lead clôturé (gagné, perdu, rejeté…)** : conversation en lecture seule.
- **Courtier suspendu** : lecture seule ; messages déjà envoyés restent visibles ; le visiteur peut encore répondre dans une conversation ouverte (comme pour les propositions).
- **Visiteur anonymisé (spec 046)** : corps des messages, noms de fichiers et détails de demandes remplacés par un marqueur ; horodatages, type d'auteur et références conservés.
- **Fichier** : > 5 Mo ou type invalide, plus de 3 pièces jointes, antivirus indisponible → envoi refusé, aucun message partiel.
- **Plafond** : 300 messages par conversation (409 `THREAD_LIMIT_REACHED`).
- **Concurrence** : deux envois simultanés produisent deux messages ordonnés par `createdAt` puis `id`.
- **Spam de notifications** : les notifications de message sont regroupées par tranche de 15 minutes, par destinataire et par conversation (une notification in-app et un e-mail pointeur par tranche) ; le compteur de messages non lus de l'interface reste exact.
- **Langue** : e-mails visiteur dans la langue de la demande ; contenu des messages tel que saisi.
- **Drapeau coupé** : lecture seule globale, y compris pour les téléversements de pièces demandées.

## Requirements

- **FR-001**: Le système MUST permettre au courtier actuellement affecté, lead accepté et ouvert, consentement actif, non suspendu, d'envoyer un message texte (1–2 000 caractères) avec 0 à 3 pièces jointes, pour les plans Starter et CRM.
- **FR-002**: Le système MUST permettre au visiteur, avec un jeton 054 valide, d'envoyer un message (mêmes limites) dans une conversation ouverte de sa demande.
- **FR-003**: Les messages MUST être en ajout seul : aucune route de modification ni de suppression ; seuls l'accusé de lecture du destinataire et l'anonymisation 046 modifient une ligne. Chaque message porte type d'auteur (`broker`/`visitor`), auteur (utilisateur courtier), horodatage et accusé de lecture.
- **FR-004**: Tout texte saisi par le courtier (message, intitulé et note de demande de documents) MUST passer la garde de formulations interdites (liste partagée FR + EN) ; en cas de match l'envoi MUST être refusé avec l'expression citée.
- **FR-005**: Les pièces jointes MUST réutiliser le pipeline de stockage et d'antivirus des documents de devis (limites de taille et de type existantes) ; un fichier non sain MUST n'être jamais servi ; chaque téléchargement MUST être audité.
- **FR-006**: Une conversation MUST être rattachée à une affectation. Un courtier non actuellement affecté (autre tenant, réaffecté, désaffecté, agent non assigné) MUST n'avoir aucun accès, ni en lecture ni en écriture. Le visiteur MUST ne voir que les conversations de sa demande.
- **FR-007**: Une conversation MUST passer en lecture seule en cas de retrait du consentement, de clôture du lead, de réaffectation (pour l'ancien courtier) ou de drapeau coupé ; le visiteur MUST pouvoir la lire avec un jeton valide.
- **FR-008**: Le courtier MUST pouvoir créer une demande de documents (intitulé 1–120, note ≤ 500, échéance facultative), l'annuler, et lister ses demandes ; le visiteur MUST pouvoir téléverser une ou plusieurs pièces pour une demande ouverte, ce qui la passe à `fulfilled`. Maximum 10 demandes ouvertes par affectation.
- **FR-009**: Les notifications MUST être créées de façon idempotente et traitées par le worker existant : visiteur (`visitor_broker_message`, `visitor_documents_requested`) en e-mail bilingue **sans contenu** ; courtier (`broker_visitor_message`, `broker_document_received`) en boîte in-app + e-mail pointeur. Elles MUST respecter les préférences de canal du courtier (spec 038) et ne jamais contenir le texte du message, le nom d'un fichier ni de donnée du visiteur.
- **FR-010**: Le SLA MUST utiliser comme « première réponse visible » le minimum entre la première proposition envoyée et le premier message du courtier de l'affectation, dans le calcul et les tableaux de bord courtier et admin existants (aucun calcul dupliqué).
- **FR-011**: Le visiteur MUST pouvoir déposer une demande d'accès, de rectification ou d'effacement (détail ≤ 1 000 caractères) ; le système MUST créer une demande `received` avec une référence unique `DR-…`, envoyer un accusé de réception (FR/EN) avec la référence, alerter la conformité et auditer. Une seule demande ouverte par type et par demande de devis.
- **FR-012**: La conformité MUST disposer dans « Rétention » d'une file des demandes (filtres statut/type, pagination), d'un détail, des actions « prendre en charge », « clôturer » (note) et « rejeter » (motif obligatoire) ; pour l'effacement, l'approbation MUST lancer le flux d'effacement sur demande de la spec 046 et MUST NEVER effacer directement. Chaque transition est auditée et notifie le visiteur par e-mail pointeur.
- **FR-013**: Conformité et support MUST pouvoir lire en lecture seule la conversation d'un lead depuis l'admin ; chaque lecture est auditée ; le support voit les corps masqués ; aucun autre rôle n'y accède.
- **FR-014**: Messages, demandes de documents et demandes de données MUST être ajoutés aux catégories de rétention (spec 046) avec des durées provisoires marquées « en attente de validation juridique », et MUST être anonymisés avec la demande de devis.
- **FR-015**: Les routes publiques d'écriture MUST être limitées par débit (Redis), protégées par un champ piège, validées strictement, et ne MUST effectuer aucun traitement lourd synchrone au-delà de l'analyse antivirus des pièces déjà utilisée par les specs 033/055.
- **FR-016**: Le drapeau `broker_visitor_messaging_enabled` (global, non sensible, défaut `true`) MUST être déclaré, semé, visible et modifiable sur l'écran des drapeaux, audité par le mécanisme existant.
- **FR-017**: Les statuts internes CRM MUST ne jamais être exposés au visiteur (E-06) ; la conversation ne change aucun statut CRM.
- **FR-018**: Les interfaces visiteur MUST exister en français et en anglais (`[locale]`), avec accents corrects en français ; aucune formulation interdite par la constitution VIII.

## Key Entities
- **LeadMessage** : message d'une conversation (affectation), auteur, corps, accusé de lecture.
- **LeadMessageAttachment** : pièce jointe analysée d'un message.
- **LeadDocumentRequest** : demande de documents du courtier, statut, échéance.
- **QuoteDocument** (existant, étendu) : pièces fournies par le visiteur en réponse à une demande.
- **DataRequest** : demande d'accès, de rectification ou d'effacement du visiteur, traitée par la conformité.
- **Notification** : quatre types courtier/visiteur de messagerie et deux types de demande de données.
- **AuditLog**, **FeatureFlag** (`broker_visitor_messaging_enabled`).

## Success Criteria
- **SC-001**: 0 message, pièce jointe ou demande lisible par un courtier non affecté ou par un autre visiteur (tests d'isolation).
- **SC-002**: 0 e-mail contenant le texte d'un message ou le nom d'une pièce jointe.
- **SC-003**: 0 effacement exécuté sans approbation de la conformité.
- **SC-004**: 100 % des ouvertures admin, téléchargements de pièces et transitions de demandes de données sont audités.
- **SC-005**: 0 fichier infecté servi.
- **SC-006**: Le SLA de première réponse visible est identique dans le tableau de bord courtier et admin.

## Assumptions
- **Qui peut ouvrir l'échange** : courtier et visiteur peuvent écrire dès que l'affectation est acceptée.
- **Pièces jointes** : types et taille de la spec 033 (5 Mo, PDF/JPEG/PNG), 3 par message.
- **Accusé de lecture** : horodatage de première lecture par le destinataire, affiché des deux côtés.
- **Réaffectation** : le nouveau courtier repart d'une conversation vide (minimisation) ; le visiteur voit les deux.

## DÉCISIONS À CONFIRMER (aucune ne bloque la livraison ; choix conservateurs appliqués)
1. **Durées de rétention** des messages, demandes de documents et demandes de données : valeurs provisoires, en attente de validation juridique (avis L-08 et cabinet juridique).
2. **Délai légal de réponse** à une demande de données : 30 jours affichés à la conformité comme échéance indicative, à confirmer par pays (ARTCI / CDP).
3. **Remise des données pour une demande d'accès** : traitée hors plateforme par la conformité (aucun export automatique), vérification d'identité par l'adresse e-mail liée au jeton uniquement.
4. **Comportement du drapeau coupé** : écritures bloquées, lecture conservée (valeur probante).
5. **Ouverture de l'échange par le visiteur** avant la première réponse du courtier : autorisée dès l'acceptation du lead.
6. **Nouveau courtier après réaffectation** : ne voit pas l'ancien échange.
7. **Plafonds** (300 messages par conversation, 3 pièces jointes, 20/h par conversation et 30/h par IP côté visiteur, 10 demandes de documents ouvertes) : valeurs de départ.
8. **Mise en ligne par défaut** (`true`) alors que le PRD §8 demande l'avis juridique L-08 pour E-02/E-03 : le drapeau permet de couper sans déploiement ; l'avis reste un prérequis de lancement.
9. **E-mail de clôture** d'une demande de données : envoyé en pointeur (statut final dans l'espace), sans motif de rejet.
