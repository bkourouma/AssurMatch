# Plan d'implémentation : Lot 1 — correctifs critiques (063)

**Spec** : `specs/063-critical-fixes/spec.md` · **Branche** : `063-critical-fixes` · **Migration** : `0030_critical_fixes`

## Surfaces impactées

Back-office Plateforme (admin), Broker Back-office, Backend API, packages partagés, base de données / Prisma / migration, Web Publique Client (item C seulement), runtime / env examples / docs go-live (item D). Pas de Docker ni de launcher modifiés.

## Constitution Check (avant et après conception)

| Principe | Verdict |
|---|---|
| I Positionnement | OK : facturation B2B technique, aucun encaissement, textes « contestation / avoir ». |
| II Conformité & audit | OK : audit de chaque appareil de confiance, ouverture / décision de contestation, avoir ; refus audités. |
| III Activation progressive | OK : mutations de contestation derrière `billing_enabled` ; les 3 flags passent à `true` sur arbitrage PO + PRD §9.1, sans toucher aux modules réglementés interdits. |
| IV Sécurité | Restaure « MFA obligatoire admin + courtier ». Appareil de confiance : jeton haché, httpOnly / Strict, révocation systématique. RBAC testé. |
| V IA | OK : réponses transmises uniquement via la passerelle (minimisation existante conservée). |
| VI Historique | OK : décisions et avoirs append-only, jamais supprimés. |
| VII Routage | Aucun impact. |
| IX Tests | Tests des cas interdits (jeton expiré / révoqué / autre utilisateur, fenêtre dépassée, mauvais rôle, tenant étranger, idempotence). |

Aucun conflit constitutionnel ; les points non couverts sont marqués **DÉCISION À CONFIRMER** dans la spec.

## Conception

### A — MFA / appareils de confiance (backend `modules/auth`, `modules/users`)

- `TrustedDeviceService` (`modules/auth/trusted-device.service.ts`) + `TrustedDevicesRepository` (mémoire pour les tests, Prisma pour le runtime, `trusted-devices.repository.ts`). Fonctions : `issue(userId, label)`, `consume(userId, token)` (→ `valid | rejected`), `listActive(userId)`, `revokeAll(userId, reason)`, plafond de 10.
- `AuthService.login` : mot de passe d'abord (inchangé), puis `mfaVerified = trustedDeviceValid`, `mfaRequired = !trustedDeviceValid`. Réponse enrichie : `trustedDeviceRejected?`. `verifyMfa` accepte `trustDevice` et renvoie `trustedDevice` une fois.
- `enrollMfa` : refusé si un secret existe et que le jeton n'est pas `mfaVerified`.
- Révocation : `UsersService` reçoit un port `TrustedDeviceRevoker` (injection optionnelle) appelé dans `setPassword`, `consumePasswordReset`, `activateWithPassword`, `setMfaEnrollment` (ré-enrôlement), `resetMfa`, `lock`, `suspend`, `softDelete` ; le service de l'équipe courtier (désactivation d'un membre) passe par ces méthodes ou appelle le port.
- Routes (`runtime-http.controller.ts`, groupe auth) : `GET /auth/trusted-devices`, `DELETE /auth/trusted-devices` (jeton MFA vérifié).
- `me` expose `mfaEnrolled` pour que l'écran MFA masque l'enrôlement.
- Apps (admin + courtier) : server actions `loginAction` / `verifyMfaAction` lisent / posent `assurmatch_<app>_device`, transmettent `trustedDeviceToken`, effacent le cookie sur `trustedDeviceRejected` et au « révoquer », page « Sécurité du compte » (liste + « Révoquer tous les appareils »).

### B — Contestations (backend `modules/leads`, `modules/billing`)

- `LeadDisputesService` (nouveau, `modules/leads/lead-disputes.service.ts`) : `open(...)` (fenêtre 30 j, unicité, création, audit, statut d'assignation `disputed`), `listForAdmin`, `detailForAdmin`, `decide`, `listForBroker`, `forLead`. Les services Starter (`dispute`) et CRM (`addDispute`) lui délèguent.
- Dépôt : `CrmActivityRepository` étendu (`updateDispute`, `findDispute`, `listDisputes(filter)`), mémoire + Prisma.
- `InvoicingService.issueDisputeCreditNote(...)` : calcule le montant depuis les lignes figées de la facture, émet un avoir partiel (`kind='dispute'`, `disputeId` unique → idempotent), PDF réutilisant `renderCreditNotePdf` (libellé « Avoir partiel — contestation »), notification `credit_note_issued` ; `recordPayment` plafonne au reste net ; `issueCreditNote` (annulation totale) porte le reste net ; `buildStatement` inchangé (somme de tous les avoirs).
- `DraftInvoiceService` : continue de créditer les contestations `accepted`, uniquement lorsque `creditMode = 'draft_invoice'`, pour que l'avoir et le brouillon ne comptent jamais deux fois le même lead.
- Routes admin (`runtime-http-wiring.module.ts`, blocs `// Spec 063`) : `AdminLeadDisputesController` ; route courtier `GET /broker/billing/disputes`.
- Notifications : in-app via `InvoiceInAppPublisher` / dispatch spec 038 ; e-mail pointeur via le canal e-mail existant (spec 061), sans contenu de lead.
- UI admin : onglet « Contestations » (`apps/admin/app/billing`). UI courtier : bouton « Contester » (CRM détail), statut / décision (Starter + Pro), section « Contestations » (`apps/broker/app/billing`).

### C — Assistant IA visiteur (`apps/public`)

- Le formulaire expose ses réponses courantes (état dérivé de la même source que la soumission) ; `VisitorAiAssistant` les reçoit via `answers`. Vérifier le contrat de la passerelle IA (`ai-gateway.service.ts`, PII) avant d'envoyer ; exclure contact et consentements.

### D — Flags (`default-flags.ts`, seeds, env, docs)

- `GLOBAL_FEATURE_FLAG_DEFAULTS` + `feature-flags.defaults.json` + `.env*.example` + `docs/go-live/checklist-mise-en-production.md` ; tests supposant `false` adaptés ; le seed Prisma de développement n'écrase pas les lignes existantes (comportement conservé).

## Données (migration `0030_critical_fixes`, additive)

- `TrustedDevice` (id, userId, tokenHash unique, label, createdAt, expiresAt, lastUsedAt, revokedAt, revokedReason).
- `BrokerCrmDispute` : `source`, `countryCode`, `decidedAt`, `decidedById`, `decisionReason`, `creditMode`, `creditNoteId`, `creditAmount`, index `(status, createdAt)`.
- `CreditNote` : `kind`, `disputeId` unique, `leadAssignmentId`, `invoiceId` n'est plus unique (index partiel unique pour `kind='cancellation'`).
- Risque données : aucun DROP de colonne ; seul l'index unique `CreditNote_invoiceId_key` est remplacé par un index partiel équivalent pour les avoirs d'annulation existants (tous `cancellation`). Pas d'index unique sur `BrokerCrmDispute.leadAssignmentId` (données existantes possiblement dupliquées) : unicité garantie par le service.

## Contrats

Voir `packages/shared/contracts/auth.contracts.ts`, `lead-disputes.contracts.ts`, `quote.contracts.ts` (détails Starter / CRM : `disputeWindow`, `dispute`), `billing.contracts.ts` (`creditNote.kind`), `error-codes.ts` (`DISPUTE_*`).

Routes :

| Route | Rôles | Notes |
|---|---|---|
| `POST /auth/login` | public | `trustedDeviceToken?` → `mfaRequired`, `trustedDeviceRejected?` |
| `POST /auth/mfa/verify` | jeton sans MFA | `trustDevice`, `deviceLabel` → `trustedDevice?` |
| `GET` / `DELETE /auth/trusted-devices` | MFA vérifié | liste / révoque tout |
| `GET /admin/billing/disputes` · `GET /admin/billing/disputes/:id` | `billing:dispute_read` | filtres status / partner / country / period |
| `POST /admin/billing/disputes/:id/decision` | `billing:dispute_decide` | motif obligatoire |
| `GET /broker/billing/disputes` | `billing:read_own` | tenant propre |
| `POST /broker/starter/leads/:id/dispute` · `POST /broker/crm/leads/:id/disputes` | existantes | fenêtre 30 j, unicité |

## Stratégie de tests

- Unit : `TrustedDeviceService` (émission, expiration, révocation, autre utilisateur, plafond), `AuthService.login/verifyMfa/enrollMfa`, révocations de `UsersService`, `LeadDisputesService` (fenêtre J-1 / J+1, unicité, décision, idempotence, pays), calcul du montant d'avoir partiel, paiement plafonné, annulation du reste net.
- Intégration HTTP runtime : login → mfaRequired → verify (trust) → login avec jeton ; routes protégées refusent un jeton sans MFA ; enrôlement refusé ; RBAC des routes de contestation ; tenant isolé ; bout en bout contestation → avoir.
- Contrat / source : specs des apps (`apps/*/tests`) pour cookies `httpOnly` / `Strict`, case MFA, onglet, bouton ; public : test du corps envoyé à l'assistant.
- Flags : tests de défauts et de coupure explicite ; validations finales (`typecheck`, `lint`, `test`, `test:web`, `prisma validate`, `secret-scan`).
