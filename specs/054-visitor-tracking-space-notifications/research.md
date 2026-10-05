# Research: 054 — Espace de suivi visiteur et notifications

## Constats (audit du code, 2026-10-03)

| # | Constat | Preuve |
|---|---|---|
| C1 | Le jeton visiteur (`crypto.randomUUID`) est haché en SHA-256 sans sel, sans expiration ni renouvellement. Il est comparé avec `!==` et n'est montré qu'une fois. | `quote-submission.service.ts:256-262,328,400-431` |
| C2 | `GET /quote-requests/:ref` renvoie `{status, brokerName:"courtier partenaire"}`, sans limite de débit. | wiring `:1650`, service `:404-412` |
| C3 | La page de suivi n'appelle pas l'API de statut : sa frise est figée. Pas de page `/suivi`, `/avis` ni `/feedback`. | `apps/public/app/[locale]/quote-requests/[publicReference]/page.tsx` |
| C4 | `Notification` n'a ni charge utile ni langue ; `payloadReference` est un identifiant texte. Le dédoublonnage passe par un `Set` en mémoire. Le worker ne rend que 3 types, sans la langue. | `schema.prisma:873-887`, `quote-notification.service.ts`, `quote-notification-delivery.service.ts:7-16,139-153` |
| C5 | Le lien de l'e-mail n'a ni jeton ni chemin localisé. Une demande en revue manuelle est annoncée « transmise ». | `quote-email-template.service.ts:38-75,126-129` |
| C6 | Le lien de l'enquête de satisfaction contient `tokenHash.slice(0,16)`, qui ne peut jamais être vérifié. Les pages `/avis` et `/en/feedback` n'existent pas. La langue est lue dans `payload.locale`. | `satisfaction-surveys-drain.service.ts:90`, `satisfaction-survey-email-template.service.ts:14-18`, `satisfaction-survey-trigger.service.ts:78-80` |
| C7 | Évènements de lead : l'affectation publie `lead.assigned` et la clôture publie `lead.status_changed`, mais acceptation et rejet ne publient rien. La réaffectation modifie la même affectation, qui reçoit le nouveau partenaire. Le CRM publie `lead.status_changed` sur `crmStatus`. Il n'y a qu'un seul bus, `partnerWebhookEvents.onEvent`. | `lead-assignment.service.ts`, `broker-starter-lead-actions.service.ts:39-87`, `broker-crm-pipeline.service.ts`, `lead-reassignment.service.ts`, `assurmatch-runtime.ts:147-162` |
| C8 | `robots.ts` n'exclut pas `/en/quote-requests/`. Aucun en-tête `X-Robots-Tag` ni `Referrer-Policy`. | `apps/public/app/robots.ts`, `next.config.ts` |

## Décisions

### R1 — Jetons d'accès
- **Decision**: Nouvelle table `VisitorAccessToken` : `id`, `quoteRequestId`, `tokenHash` (SHA-256 du jeton de 32 octets aléatoires en base64url, comparé en temps constant), `purpose` (`tracking`), `issuedAt`, `expiresAt` (30 jours, configurable par `ASSURMATCH_VISITOR_TOKEN_TTL_DAYS`), `revokedAt?`, `lastUsedAt?`.
  - Le service `VisitorAccessService` porte `issue(quoteRequestId)` (renvoie le jeton en clair une seule fois) et `verify(publicReference, token)`.
  - `verify` accepte un jeton de la table valide, ou l'ancien `verificationTokenHash` tant que la date de bascule n'est pas passée : création de la demande plus 90 jours, ou `ASSURMATCH_LEGACY_VISITOR_TOKEN_UNTIL`. La comparaison est en temps constant.
  - Toutes les routes visiteur existantes passent par `verify` : statut, documents, retrait du consentement.
  - Un refus de jeton est audité. Au plus un enregistrement « dernier usage » par minute, pour limiter les écritures.

### R2 — Jeton dans les e-mails asynchrones
- **Decision**: Le jeton est émis **au moment du rendu** par le worker : `issue()`, puis le lien. Aucun jeton en clair n'est stocké dans `Notification`. Le dédoublonnage en mémoire est remplacé par une clé d'unicité persistée (`dedupeKey`).

### R3 — Données d'évènement
- **Decision**: Nouvelles colonnes de `Notification` :
  - `dedupeKey String? @unique` : `{type}:{quoteRequestId}:{assignmentId|-}:{seq}` ;
  - `eventPayload Json?` : identifiants et noms non sensibles, comme `assignmentId`, `partnerTenantId`, `previousPartnerTenantId`.

  `payloadReference` reste l'identifiant de la demande. La langue est lue sur `QuoteRequest.language`.

### R4 — Nouveaux types de notification
- **Decision**: Valeurs ajoutées à `NotificationType` : `visitor_quote_received`, `visitor_quote_in_review`, `visitor_quote_transmitted`, `visitor_quote_accepted`, `visitor_quote_reassigned`, `visitor_quote_closed`, `visitor_consent_withdrawn`, et `visitor_tracking_link` (renvoi de lien).
  - Les types existants `visitor_quote_confirmation` et `visitor_quote_non_routable` restent rendables pour les lignes déjà présentes.
  - Les nouvelles demandes produisent `received` ou `in_review`, puis `transmitted` par affectation, ou `non_routable`.
  - `EmailPurpose` reçoit les finalités correspondantes.

### R5 — Statut public (projection pure)
- **Decision**: Fonction pure `projectPublicQuoteStatus(quote, assignments, crmStates, history)`, partagée dans `packages/shared/contracts/public-quote-status.ts`. Statuts globaux : `received`, `in_review`, `transmitted`, `in_progress`, `proposal_available` (réservé à 055), `closed`, `not_transmitted`.

  Statut par affectation (`{partnerName, status, since}`) :

  | Source | Statut public |
  |---|---|
  | `assigned`, `broker_notified`, `seen` | `transmitted` |
  | `accepted`, `received`, `contacted` et CRM `accepte`…`negociation` | `in_progress` |
  | CRM `devis_envoye` / `negociation` (marquage 055) | `in_progress` (passe à `proposal_available` en 055 seulement si une proposition visible existe) |
  | `closed`, `rejected` sans réaffectation, CRM `gagne`, `perdu`, `doublon`, `injoignable`, `hors_cible`, `rejete_conteste` | `closed` |

  Statut global :
  - `cancelled` (retrait) → `closed` ;
  - `non_routable` → `not_transmitted` ;
  - `manual_review` ou `pending_manual_assignment` → `in_review` ;
  - `routed` → le statut d'affectation le plus avancé parmi les affectations non closes, sinon `closed` ;
  - `created` → `received`.

  La chronologie est construite à partir de l'historique des affectations et des dates de la demande. Les libellés internes ne sont jamais exposés.

### R6 — Évènements
- **Decision**: Le bus existant (`partnerWebhookEvents.onEvent`) reçoit un abonné `VisitorQuoteNotifier`. Nouvelles publications ajoutées :
  - `lead.accepted` et `lead.rejected` (actions Starter) ;
  - `lead.reassigned` (réaffectation, avec l'ancien partenaire) ;
  - `lead.status_changed` du CRM : seuls `accepte`, `gagne` et `perdu` déclenchent une notification visiteur ;
  - retrait du consentement, notifié directement.

  Ces évènements internes ne sont pas transmis aux webhooks partenaires, sauf le type existant `lead.status_changed` : l'émetteur filtre les types autorisés pour les webhooks.

### R7 — Renvoi de lien
- **Decision**: `POST /quote-requests/tracking-link`, corps `{ publicReference, email, locale }`.
  - Abus : nouveau scope `tracking_link_resend` (5 par heure et par IP) et clé Redis par référence (3 par heure).
  - Correspondance : `emailFingerprint` du prospect, recalculé à partir de l'e-mail saisi.
  - Si tout correspond et que la demande n'est pas anonymisée, une notification `visitor_tracking_link` est mise en file.
  - La réponse est toujours `202 { accepted: true }`.
  - L'envoi passe par le worker, ce qui garde le même délai de réponse dans tous les cas.

### R8 — Pages publiques
- **Pages** :
  - **Espace** (`/demandes-de-devis/[ref]` et `/en/quote-requests/[ref]`) : appelle `GET /quote-requests/:ref?token=` (statut public), et affiche chronologie, courtiers, documents et retrait.
  - **`/suivi` et `/en/track`** : formulaire de renvoi de lien.
  - **`/avis/[ref]` et `/en/feedback/[ref]`** : enquête de satisfaction, branchée sur les routes existantes `/satisfaction-surveys`.
- **Protection du jeton** :
  - en-têtes `Referrer-Policy: no-referrer` et `X-Robots-Tag: noindex, nofollow` sur ces chemins (`next.config.ts`) ;
  - `robots.ts` exclut `/en/quote-requests/`, `/avis/` et `/en/feedback/`.
- **Expiration** : un jeton absent ou expiré mène au formulaire de renvoi.

### R9 — Enquête de satisfaction
- **Decision**: Correction de C6.
  - Le jeton en clair est émis au moment du **rendu** de l'e-mail. `satisfactionSurveysDrain` régénère jeton et empreinte (rotation), puis envoie.
  - La langue est lue sur `QuoteRequest.language`.
  - Le chemin passe à `/avis/{ref}` et `/en/feedback/{ref}` : il existe désormais.

### R10 — Liens et langue dans les e-mails
- **Decision**: Le constructeur de liens est localisé. FR : `${PUBLIC_APP_URL}/demandes-de-devis/{ref}?token=` ; EN : `/en/quote-requests/{ref}?token=`. Gabarits FR et EN pour chaque type, garde de formulations, aucune réponse du formulaire. Le message de revue manuelle est distinct de celui de transmission.

### R11 — Migration 0023
- **Contenu** : table `VisitorAccessToken`, valeurs ajoutées à `NotificationType`, colonnes `Notification.dedupeKey` (unique) et `eventPayload`. Additive.

### R12 — Hors périmètre
SMS et WhatsApp ; propositions et réponses du visiteur (spec 055) ; correction de la revue manuelle admin (spec 056) ; planification du worker en production (spec 057).
