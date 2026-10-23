# Spécification fonctionnelle : Lot 1 — correctifs critiques (MFA, contestations, IA visiteur, flags)

**Branche** : `063-critical-fixes`
**Créée le** : 2026-10-15
**Statut** : Validée — arbitrages produit du 2026-10-15 transmis par le product owner (MFA appareil de confiance, contestations de leads, flags par défaut). Audit PRD du 2026-10-15 (lacunes MFA, litiges, IA visiteur, flags §9.1).
**Workflow continu** : oui. Aucun marqueur `[NEEDS CLARIFICATION]` : les points non couverts par les arbitrages sont tranchés dans « Décisions techniques » ou marqués **DÉCISION À CONFIRMER**.

## Pourquoi cette spec

L'audit PRD a mis au jour quatre écarts critiques entre le produit livré et le PRD / la constitution :

1. **Contournement MFA (constitution IV, « MFA obligatoire pour les administrateurs et les courtiers »)** : `AuthService.login()` signe un jeton avec `mfaVerified = (mfaStatus === "verified")` à partir du seul mot de passe. Après la première inscription MFA, le statut reste `verified` à vie : le second facteur n'est plus jamais demandé. Pire, `POST /auth/mfa/enroll` accepte un jeton sans MFA et **ré-enrôle** un secret : un attaquant qui connaît le mot de passe peut enrôler son propre secret.
2. **Contestations de leads (CRM-012, PRD §19 / §24)** : le courtier Starter « conteste » un lead sans trace de contestation exploitable, le CRM Pro n'a aucun bouton, aucune route admin ne tranche, et le brouillon de facture crédite des contestations `accepted` que rien ne peut produire. Aucun délai de contestation n'est appliqué.
3. **Assistant IA visiteur** : `quote-form.tsx` passe `answers={{}}` aux deux assistants (synthèse et cohérence) : l'IA travaille à vide.
4. **Flags par défaut** : `starter_portal_enabled`, `broker_crm_enabled` et `broker_dashboard_enabled` sont `false` par défaut, alors que le PRD §9.1 les fixe à `True`.

## Surfaces impactées

| Surface | Impact |
|---|---|
| Web Publique Client | **Item C uniquement** : `quote-form.tsx` transmet les réponses courantes aux assistants IA. Aucune route, aucun layout ni privilège back-office n'entre dans l'application publique. |
| Back-office Plateforme (admin) | Écran MFA (case « appareil de confiance »), page « Sécurité du compte » (révoquer les appareils), onglet « Contestations » dans `/billing`, cookie d'appareil `assurmatch_admin_device`. |
| Broker Back-office | Écran MFA, « Sécurité du compte » (`/account`), action « Contester » dans le détail du lead CRM Pro, statut et décision de contestation sur les leads (Starter et Pro) et sur `/billing`, cookie `assurmatch_broker_device`. |
| Backend API | Appareils de confiance, durcissement login / enrôlement MFA, service de contestations (fenêtre, décision, crédit), avoirs partiels, notifications, routes admin et courtier. |
| Shared packages | `auth.contracts.ts`, `quote.contracts.ts`, `billing.contracts.ts`, nouveau `lead-disputes.contracts.ts`, `error-codes.ts`, matrice RBAC (`billing:dispute_read`, `billing:dispute_decide`). |
| Base de données / Prisma | Migration `0030_critical_fixes` : `TrustedDevice`, colonnes de décision sur `BrokerCrmDispute`, colonnes de crédit partiel sur `CreditNote`. |
| Runtime / Docker | Aucun nouveau service. Défauts des flags (`default-flags.ts`, seeds, `.env*.example`, checklist go-live). |

Les parcours visiteur et les parcours authentifiés admin / courtier restent séparés applicativement : le cookie d'appareil est propre à chaque application (jamais partagé), l'application publique n'en lit aucun.

## Cadre constitutionnel

- **Principe IV (sécurité)** : MFA obligatoire pour admins et courtiers, RBAC testé, PII hors logs. L'item A **restaure** cette obligation. L'appareil de confiance est un assouplissement borné (30 jours, par appareil, révocable) décidé par le product owner.
- **Principe II / VI (audit, historique opposable)** : chaque création, usage, rejet et révocation d'appareil de confiance, chaque ouverture et chaque décision de contestation, chaque avoir de contestation sont audités (acteur, cible, raison, résultat). Les décisions sont conservées avec motif ; les lignes ne sont jamais supprimées.
- **Principe I (positionnement)** : la facturation reste une prestation technique B2B ; aucun encaissement en ligne (`payments_enabled` reste `false`). Un avoir de contestation est un document comptable, pas un remboursement.
- **Principe III (activation progressive)** : les mutations de contestation restent derrière `billing_enabled` (désactivé par défaut). Les trois flags de l'item D passent à `true` par défaut **sur arbitrage explicite du product owner et du PRD §9.1** ; ils ne figurent pas parmi les modules réglementés interdits d'activation (paiement, e-signature, police, sinistres, API assureur, IA avancée). L'admin peut toujours les couper (écran flags, audité).
- **Principe V (IA)** : item C — les réponses du formulaire sont transmises à la passerelle IA telle qu'elle est déjà contractée (minimisation PII conservée : aucun champ de contact, aucune donnée sensible ne quitte la passerelle). Aucun nouvel appel hors du module IA.
- **Contrainte « contenu »** : aucun « acheter / souscrire maintenant ». Les textes de contestation parlent de « contestation » et d'« avoir », jamais de remboursement de prime.
- **Pas de fail-closed imposé** : la constitution liste ces trois flags comme obligatoires (existence, désactivables) mais n'impose aucune valeur par défaut `false` ; l'item D n'entre donc pas en conflit constitutionnel.

## Décisions produit déjà arbitrées (2026-10-15)

1. **MFA** : le code à 6 chiffres est demandé à chaque connexion des admins et des courtiers, **sauf** sur un appareil de confiance pendant 30 jours.
2. **Contestations** : décision par le `finance_admin` (et `super_admin`), accepter ou rejeter, **motif obligatoire**, audité. Acceptée : crédit sur le prochain brouillon de facture si le lead n'est pas encore facturé ; si le lead figure déjà sur une facture émise, **avoir automatique** (réutilisation des avoirs spec 060), idempotent. Le courtier ne peut contester que **dans les 30 jours après la réception du lead** (date d'affectation).
3. **Flags** : `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled` sont `true` par défaut (PRD §9.1) ; l'admin peut les couper depuis l'écran des flags.

## Exigences fonctionnelles

### A — Correctif MFA et appareils de confiance

- **FR-A01** `POST /auth/login` ne délivre un jeton `mfaVerified=true` que si **aucun second facteur n'est exigible** : l'utilisateur présente un jeton d'appareil de confiance valide. Dans tous les autres cas où le MFA est enrôlé ou à enrôler, la réponse est `mfaRequired=true` avec un jeton **sans** MFA (accès limité aux routes d'authentification : `/auth/me`, `/auth/mfa/*`, `/auth/logout`).
- **FR-A02** `POST /auth/mfa/verify` accepte `trustDevice: boolean` (défaut `false`) et `deviceLabel` facultatif. Si `trustDevice=true` et le code est valide, l'API crée un appareil de confiance et renvoie `trustedDevice: { token, expiresAt }` **une seule fois**.
- **FR-A03** Le jeton d'appareil est un aléa de 256 bits. Il n'est stocké que **haché** (SHA-256) côté serveur avec `userId`, `createdAt`, `expiresAt` (+30 jours), `lastUsedAt`, libellé d'agent utilisateur (assaini, tronqué à 120 caractères), `revokedAt` et motif. Le jeton en clair n'est jamais journalisé ni audité.
- **FR-A04** Chaque application stocke le jeton dans son propre cookie `httpOnly`, `Secure` en production, `SameSite=Strict`, `path=/`, `maxAge` 30 jours : `assurmatch_admin_device` (admin) et `assurmatch_broker_device` (courtier). Le cookie est lu uniquement par les server actions de l'application et transmis à l'API dans le corps de `/auth/login`. Un jeton refusé par l'API (`trustedDeviceRejected=true`) est effacé du navigateur.
- **FR-A05** Un jeton d'appareil n'est valable que pour **l'utilisateur** auquel il a été délivré, tant qu'il n'est ni expiré ni révoqué, et uniquement si le compte est `active` (l'état suspendu / verrouillé / supprimé est déjà refusé avant). Le mot de passe est toujours exigé : l'appareil de confiance remplace uniquement le second facteur.
- **FR-A06** Révocation **automatique** de tous les appareils de l'utilisateur lors de : changement de mot de passe, réinitialisation / activation par mot de passe, réinitialisation du MFA par un admin, ré-enrôlement MFA, suspension, verrouillage (manuel ou après échecs), suppression, désactivation d'un membre par le propriétaire du cabinet. Un utilisateur peut aussi **révoquer tous ses appareils** (`DELETE /auth/trusted-devices`) et les lister (`GET /auth/trusted-devices`), depuis la page « Sécurité du compte » des deux applications.
- **FR-A07** Plafond de 10 appareils actifs par utilisateur : au-delà, le plus ancien est révoqué (audité).
- **FR-A08** `POST /auth/mfa/enroll` est **refusé** (403 `MFA_REQUIRED`) si un secret est déjà enrôlé et que le jeton n'est pas `mfaVerified`. Un utilisateur MFA vérifié peut ré-enrôler (révoque ses appareils de confiance).
- **FR-A09** Audit : `user.trusted_device_created`, `user.trusted_device_used`, `user.trusted_device_rejected` (jeton inconnu, expiré, révoqué ou d'un autre utilisateur), `user.trusted_device_revoked` (avec motif : `password_change`, `password_reset`, `mfa_reset`, `mfa_reenrolled`, `suspended`, `locked`, `deleted`, `deactivated`, `user_request`, `limit_reached`).
- **FR-A10** Les limites de débit existantes (`/auth/login`, `/auth/mfa/verify`) et le verrouillage après échecs restent appliqués ; le chemin « appareil de confiance » partage la limite de `/auth/login`.
- **FR-A11** L'écran MFA des deux applications : sans enrôlement, il propose l'enrôlement ; **avec** enrôlement, il ne propose que la vérification (l'action d'enrôlement n'est plus exposée à un jeton sans MFA). La case « Faire confiance à cet appareil pendant 30 jours » est décochée par défaut.

### B — Contestations de leads de bout en bout (CRM-012)

- **FR-B01** Fenêtre de contestation : **30 jours** à partir de `assignedAt`. Au-delà, la contestation est refusée (409 `DISPUTE_WINDOW_EXPIRED`, audit `refused`) sur la route **Starter** et la route **CRM**. Les DTO de détail exposent `disputeWindow: { deadline, open }` pour masquer / désactiver l'action côté interface.
- **FR-B02** Les deux routes créent une contestation (enregistrement unique `BrokerCrmDispute`, source `starter` ou `crm`) au statut `opened`, avec `countryCode` du lead. **Une seule contestation par lead** (une contestation `opened`, `accepted` ou `rejected` existante → 409 `DISPUTE_ALREADY_EXISTS`).
- **FR-B03** Admin : `GET /admin/billing/disputes` (filtres `status`, `partnerId`, `countryCode`, `from`, `to`, pagination), `GET /admin/billing/disputes/:id`, `POST /admin/billing/disputes/:id/decision` `{ decision: "accept" | "reject", reason }`. RBAC : `billing:dispute_read` / `billing:dispute_decide` pour `finance_admin` et `super_admin`. MFA vérifiée. Un admin limité par pays ne voit et ne tranche que ses pays. `support_admin` et les autres rôles : 403 audité. Courtier : 403.
- **FR-B04** La décision exige un **motif** (10 à 1000 caractères), n'est possible que sur une contestation `opened` (sinon 409 `DISPUTE_ALREADY_DECIDED`, sauf rejeu identique, idempotent), et exige `billing_enabled` (422 sinon). Toute décision est auditée (acteur, contestation, lead, décision, motif, mode de crédit).
- **FR-B05** Décision **rejet** : statut `rejected`, aucun crédit. Le lead reste facturable.
- **FR-B06** Décision **acceptation**, selon l'état de facturation de la période du lead (mois UTC de `assignedAt`) :
  - aucune facture active pour cette période → `creditMode = "draft_invoice"` : le lead est crédité sur le brouillon de la période (le brouillon existant, `draft-invoice.service.ts`, crédite déjà les contestations `accepted`) ;
  - une facture active (non annulée) existe → `creditMode = "credit_note"` : un **avoir partiel** est émis automatiquement (numéro de la série avoir de la spec 060, PDF, notification courtier), lié à la contestation par une contrainte d'unicité (`disputeId`) qui garantit l'idempotence ; le montant HT est le prix unitaire du lead figé sur la facture, la TVA au taux de la facture ;
  - aucun prix unitaire exploitable sur la facture (lead couvert par un crédit pack, ligne absente) → `creditMode = "none"` et le motif est tracé : la finance traite hors plateforme (**DÉCISION À CONFIRMER** D-B3).
- **FR-B07** Un avoir partiel ne change ni le statut ni les montants de la facture (immuable). Les paiements sont plafonnés au **reste dû net** (total − avoirs partiels − payé) ; l'état des comptes comptabilise l'avoir en crédit. L'annulation totale ultérieure d'une facture porte sur le **reste net** (total − avoirs partiels), pour ne pas créditer deux fois.
- **FR-B08** Le courtier est notifié de la décision : notification in-app (modèle `dispute_decided`) et e-mail **pointeur** sans contenu de lead (« une décision est disponible dans Facturation > Contestations »). Un échec de notification est audité et ne bloque pas la décision.
- **FR-B09** Courtier (Starter et Pro) : le détail du lead affiche le statut de la contestation (ouverte, acceptée, rejetée), le motif de décision et le mode de crédit. Le CRM Pro gagne l'action « Contester » (motif obligatoire parmi une liste + commentaire facultatif), protégée par `broker_crm:update`, le flag `broker_crm_enabled` et la fenêtre. `GET /broker/billing/disputes` (rôles `billing:read_own`) alimente une section « Contestations » sur la page `/billing` courtier.
- **FR-B10** Admin UI : onglet « Contestations » dans `/billing` : liste filtrée, détail, formulaire de décision avec motif obligatoire, lien vers l'avoir.

### C — Assistant IA visiteur : réponses réelles

- **FR-C01** `quote-form.tsx` passe aux deux `VisitorAiAssistant` les réponses courantes du formulaire (mises à jour à chaque saisie), sous la même forme que celle envoyée à la création de la demande, **sans** champ de contact ni consentement ; la passerelle IA continue d'appliquer sa minimisation. Un test prouve que `answers` n'est plus `{}` et qu'aucun champ de contact n'est transmis.

### D — Flags par défaut

- **FR-D01** `GLOBAL_FEATURE_FLAG_DEFAULTS` : `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled` = `true`. Le seed de référence (`seeds/reference/feature-flags.defaults.json`) reflète ces valeurs et **n'écrase jamais** une valeur existante au rejeu. Les `.env*.example` et la checklist go-live (« activés par défaut ; pour les couper : écran Feature flags, motif, ou variable ») sont à jour. Les tests qui supposaient `false` sont réécrits (la coupure explicite reste testée).
- **FR-D02** Les environnements déjà initialisés conservent leurs lignes existantes (les valeurs `false` en base ne sont pas modifiées) ; la checklist rappelle d'activer explicitement les flags sur ces environnements.

## Scénarios et critères d'acceptation

### A

1. **Given** un courtier dont le MFA est vérifié, **When** il se connecte avec e-mail et mot de passe sans cookie d'appareil, **Then** `mfaRequired=true`, le jeton a `mfaVerified=false` et toute route protégée (MFA) répond 403.
2. **Given** le même courtier, **When** il vérifie son code avec `trustDevice=true`, **Then** un appareil de confiance est créé (audit), le jeton est renvoyé une fois, et **When** il se reconnecte avec ce jeton, **Then** `mfaRequired=false`, `mfaVerified=true`, `lastUsedAt` mis à jour, audit `trusted_device_used`.
3. **Given** un jeton d'appareil, **When** le mot de passe est changé, le MFA réinitialisé, le compte suspendu / verrouillé / supprimé, **Then** le jeton est révoqué et la connexion suivante exige le code.
4. **Given** un jeton d'appareil expiré (31 jours), révoqué, inconnu ou émis pour un autre utilisateur, **When** il est présenté au login, **Then** `mfaRequired=true`, `trustedDeviceRejected=true`, audit `trusted_device_rejected`, aucun détail sur la cause.
5. **Given** un jeton sans MFA d'un compte déjà enrôlé, **When** il appelle `POST /auth/mfa/enroll`, **Then** 403 et le secret existant est inchangé.
6. **Given** un utilisateur MFA vérifié avec 3 appareils, **When** il révoque tous ses appareils, **Then** `revoked=3` (audités) et la connexion suivante exige le code.
7. **Given** un mot de passe erroné avec un jeton d'appareil valide, **Then** la connexion échoue (le jeton ne remplace pas le mot de passe) et compte pour le verrouillage.

### B

1. **Given** un lead affecté il y a 31 jours, **When** le courtier Starter ou Pro conteste, **Then** 409 `DISPUTE_WINDOW_EXPIRED`, audit `refused`, aucune contestation créée. **Given** 29 jours, **Then** la contestation est créée au statut `opened`.
2. **Given** une contestation ouverte, **When** un `support_admin` ou un courtier tente de trancher, **Then** 403 audité. **When** le `finance_admin` tranche sans motif, **Then** 422.
3. **Given** `billing_enabled` actif et une contestation ouverte sur un lead non facturé, **When** la finance accepte avec motif, **Then** statut `accepted`, `creditMode=draft_invoice`, le brouillon recalculé porte une ligne « Leads contestés acceptés » ; le courtier reçoit la notification in-app et l'e-mail pointeur.
4. **Given** un lead figurant sur une facture émise `CI-2026-000001`, **When** la finance accepte, **Then** un avoir partiel `CI-AV-2026-00000N` est émis, lié à la contestation, l'état des comptes du courtier baisse du montant TTC du lead ; **When** la décision est rejouée à l'identique, **Then** aucun second avoir (200 idempotent) ; **When** elle est rejouée avec l'autre décision, **Then** 409.
5. **Given** une facture avec avoir partiel, **When** la finance enregistre un paiement supérieur au reste net, **Then** 409 ; **When** elle annule la facture par avoir total, **Then** l'avoir d'annulation porte le reste net uniquement.
6. **Given** une contestation rejetée, **Then** le lead reste facturable et le courtier voit le statut `rejetée` et le motif sur le lead et sur `/billing`.
7. **Given** un admin `admin_pays` limité à un pays, **Then** il ne voit pas les contestations des autres pays.
8. **Given** un courtier d'un autre cabinet, **When** il lit les contestations, **Then** il ne voit que celles de son tenant.
9. **Given** un second dépôt sur le même lead, **Then** 409 `DISPUTE_ALREADY_EXISTS`.

### C

1. **Given** un visiteur qui renseigne le formulaire de devis, **When** l'assistant « synthèse » ou « cohérence » est sollicité, **Then** le corps envoyé contient les réponses saisies (jamais `{}` si des champs sont remplis) et aucun champ de contact.

### D

1. **Given** une base vierge, **When** le service de flags démarre, **Then** les trois flags valent `true` et `billing_enabled`, `payments_enabled` et tous les autres modules réglementés restent `false`.
2. **Given** un flag existant en base à `false`, **When** le seed de référence est rejoué, **Then** la valeur n'est pas modifiée.

## Décisions techniques

- **DT-1** Les jetons d'appareil sont transmis par le corps de `/auth/login` (le navigateur parle aux server actions Next, pas directement à l'API) ; aucun cookie n'est lu ni posé par l'API.
- **DT-2** Le jeton d'appareil n'est pas renouvelé à l'usage (expiration fixe à 30 jours après création, comme annoncé à l'utilisateur).
- **DT-3** La contestation reste portée par `BrokerCrmDispute` (étendue) pour les deux sources, afin de ne pas dupliquer le modèle ni casser le brouillon de facture existant.
- **DT-4** Les avoirs de contestation sont des **avoirs partiels** (`CreditNote.kind = 'dispute'`, `disputeId` unique, `invoiceId` n'est plus unique ; l'unicité de l'avoir d'annulation devient un index partiel `WHERE kind = 'cancellation'`).
- **DT-5** Le statut du lead (`disputed`) n'est pas modifié par la décision : la décision est portée par la contestation.

## Décisions à confirmer

- **D-B1 — CONFIRMÉE (PO 2026-10-16)** : une seule contestation par lead, rejet définitif sur la plateforme (tout désaccord relève du contrat de partenariat). Garanti en base par un index unique partiel (`createdAt >= 2026-10-16`, migration 0030) en plus du service.
- **D-B2 — ACCEPTÉE** : après un rejet, le lead garde le statut `disputed` côté assignation (exempté du quota mensuel, comme aujourd'hui). Une réintégration au quota n'est pas spécifiée.
- **D-B3 — CHANGÉE (PO 2026-10-16)** : acceptation sur un lead couvert par un pack de leads prépayé : 1 lead est automatiquement restitué au pack (`creditMode = pack_credit`, ligne `LeadPack` liée à la contestation, idempotente, auditée, visible courtier et admin). Lead sans prix ni pack : aucun effet automatique (`none`, traitement manuel). **DÉCISION À CONFIRMER** : on ne sait pas quel lead un pack a couvert ; heuristique : tant que la facture montre des crédits pack non restitués, la contestation acceptée restitue un crédit pack, sinon avoir partiel.
- **D-B4 — ACCEPTÉE** : une contestation acceptée dont la facture a déjà été payée produit un solde créditeur sur l'état des comptes ; le remboursement ou la compensation est opéré hors plateforme (aucun remboursement en ligne : `payments_enabled=false`).
- **D-B5 — ACCEPTÉE** : la décision exige `billing_enabled` actif (cohérence avec les autres mutations de facturation).
- **D-A1 — ACCEPTÉE** : pas de renouvellement glissant du jeton d'appareil (30 jours fixes) ; plafond de 10 appareils actifs par utilisateur.
- **D-D1 — ACCEPTÉE** : sur les environnements déjà initialisés (preprod), les lignes de flags existantes à `false` ne sont pas modifiées ; l'activation y est manuelle depuis l'écran des flags.

- **DT-6** (revue sécurité) `GET /auth/me.mfaEnrolled` signifie « secret confirmé par un code valide » : un secret généré mais jamais confirmé peut être régénéré avec un jeton sans MFA (sinon l'utilisateur qui quitte l'écran d'enrôlement serait verrouillé) ; un secret confirmé ne peut être remplacé que par une session MFA vérifiée.
- **DT-7** (revue sécurité) Le compteur d'échecs n'est pas remis à zéro au succès du mot de passe tant que le second facteur est requis (pas de contournement du verrouillage MFA) ; les réponses `/auth/login`, `/auth/mfa/verify`, `/auth/activate` n'exposent plus les hachages ni le secret MFA.
- **DT-8** (revue sécurité) Écriture de décision conditionnelle (compare-and-set sur le statut `opened`) ; un rejet est refusé si un avoir a déjà été émis par une acceptation interrompue ; un avoir de contestation n'est jamais émis au-delà du nombre de leads facturés ; un lead crédité par avoir sur une facture ensuite annulée est crédité sur la facture ré-émise.

## Risques résiduels connus

- L'unicité « une contestation par lead » n'est pas garantie par la base (données existantes) : verrou en processus uniquement, risque de doublon entre deux instances API. L'avoir reste protégé par l'unicité de `disputeId`.
- Course entre un avoir de contestation et l'annulation totale de la même facture : pas de `SELECT ... FOR UPDATE` (non testable sans PostgreSQL ici) ; à vérifier au test de charge / smoke PostgreSQL.
- Les jetons d'accès déjà émis restent valides jusqu'à 15 minutes après une révocation.
- Dépôts Prisma (appareils de confiance, contestations, avoirs partiels) vérifiés par types et faux délégués, pas sur une vraie base.

## Hors périmètre

- Application d'un second facteur via WebAuthn / passkeys, notification de nouvel appareil par e-mail.
- Appel d'une décision rejetée, contestation partielle, contestation d'un lead rejeté.
- Remboursement ou paiement en ligne (J-04).
- Restitution automatique d'un crédit pack.
- Modification de l'assistant IA visiteur au-delà de la transmission des réponses.
