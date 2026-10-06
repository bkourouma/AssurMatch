# Research: 055 — Réponse du courtier au visiteur et suite donnée par le visiteur

## Constats (audit du code, 2026-10-03)

| # | Constat | Preuve |
|---|---|---|
| C1 | La « proposition » CRM se résume à `reference`, `amountIndicative`, `notes`. Pas de fichier, pas de statut, jamais visible du visiteur. Aucune route Starter. | `broker-crm-activity.service.ts:addProposal`, `BrokerCrmProposal` (`schema.prisma`) |
| C2 | Le détail CRM et le détail Starter renvoient déjà le `contact` complet au tenant affecté, mais l'écran CRM n'affiche que la version masquée. Aucune consultation n'est auditée en tant que telle ; rien ne masque après un retrait du consentement. | `broker-crm-leads.service.ts:detail`, `apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx` |
| C3 | Le dépôt Prisma n'enrichit le contact qu'en mode Prisma ; en mémoire (tests) l'affectation n'a pas de contact. | `lead-assignments.repository.ts:enrichMany`, `quote-routing.service.ts:assignmentScope` |
| C4 | `BrokerCrmLeadState` n'est jamais écrit : un changement de statut CRM est perdu en PostgreSQL. | `grep brokerCrmLeadState` (lecture seule) |
| C5 | La réaffectation modifie la même affectation (nouveau `partnerTenantId`) ; l'ancien courtier perd l'accès par le filtre de tenant. | `lead-assignment.service.ts:reassign` |
| C6 | Documents CRM : `storageKey` libre, aucun fichier ni antivirus. Stockage et antivirus existent (specs 033/051) : `DocumentStoragePort`, `VirusScannerPort`, `matchesFileSignature`. | `documents.module.ts`, `quote-documents/*` |
| C7 | Le statut public `proposal_available` est réservé (054) ; la vue n'a pas de champ `proposals`. Les e-mails visiteur sont idempotents par `dedupeKey`, avec jeton émis au rendu. | `public-quote-status.ts`, `quote-notification.service.ts` |
| C8 | Le détail Starter marque le lead « vu » à la première ouverture même s'il est déjà accepté, ce qui le ferait reculer. | `broker-starter-leads.service.ts:detail` |
| C9 | Les routes Kanban et assignation existent sans écran. | `runtime-http-wiring.module.ts`, `apps/broker/app/crm/*` |

## Décisions

### R1 — Modèle de proposition
- **Decision**: Nouvelle table `LeadProposal` (évolution fonctionnelle de `BrokerCrmProposal`, conservée telle quelle pour les références internes existantes). Une proposition est créée **et** envoyée en une seule opération (pas de brouillon éditable). Le contenu est immuable ; seules les colonnes de cycle de vie changent (`status`, `viewedAt`, `respondedAt`, `withdrawnAt`, `withdrawnById`, `withdrawReason`). Le dépôt n'expose que `updateLifecycle`.
- **Statuts**: stockés `sent | viewed | responded | withdrawn` ; `expired` est calculé depuis `validUntil` (jamais stocké). Côté visiteur : `sent | viewed | responded | expired | closed`, une proposition retirée n'est jamais montrée.
- **Rationale**: immutabilité garantie par construction ; historisation « par création » (FR-003).

### R2 — Propriété et réaffectation
- **Decision**: `LeadProposal.partnerTenantId` = courtier émetteur. Le courtier ne voit que ses propositions (`partnerTenantId === assignment.partnerTenantId`). Après réaffectation, les propositions de l'ancien courtier restent dans l'espace visiteur avec le statut `closed` (aucune réponse) et ne sont jamais montrées au nouveau courtier.

### R3 — Un seul service, deux canaux
- **Decision**: `LeadProposalsService` sert Starter (`/broker/starter/...`, politique `BrokerStarterAccessPolicy`) et CRM (`/broker/crm/...`, `BrokerCrmAccessPolicy`). Le canal CRM seul fait avancer le pipeline (FR-011) ; les deux font passer l'affectation à `contacted`. Starter : le statut `contacted` est présenté comme « accepté » (statut Starter).
- **Conditions d'envoi**: lead accepté (affectation `accepted|received|contacted` ou statut CRM ouvert différent de `nouveau`), non clôturé, consentement actif, partenaire non suspendu (`brokerWriteActor` + garde du service), rôle en écriture, ≤ 10 propositions actives, garde de formulations FR + EN, PDF sain.

### R4 — Fichiers
- **Decision**: `storeScannedFile` réutilise stockage, signature et antivirus des specs 033/051 : PDF ≤ 5 Mo pour la proposition ; PDF/JPEG/PNG ≤ 5 Mo pour les documents internes. Analyse **synchrone** ; un fichier infecté ou non analysable est supprimé et l'envoi refusé (`DOCUMENT_QUARANTINED`) : jamais référencé, donc jamais servi. Téléchargements : jeton visiteur ou session courtier, `no-store`, `nosniff`, audités.

### R5 — Statut public
- **Decision**: `ProjectionAssignment.activeProposalAt` (proposition active du courtier courant) ⇒ statut courtier `proposal_available` (sauf affectation clôturée) ; le statut global prend le plus avancé. La vue reçoit `proposals` (défaut `[]`, rétrocompatible). Ouvrir l'espace marque les propositions `sent` comme `viewed` (audité). Après retrait du consentement : `proposals: []`.

### R6 — Réponse du visiteur
- **Decision**: Table `VisitorProposalResponse` en ajout seul ; la dernière fait foi. Types `interested` (créneau ≤ 100), `declined` (motif fermé), `question` (≤ 500). Limites : 10/h par IP (`proposal_response`) et 5/h par proposition (Redis). Refus `PROPOSAL_NOT_RESPONDABLE` (409) si retirée, expirée, clôturée ou consentement retiré ; 404 neutre pour un jeton faux ou une proposition d'une autre demande. **Aucun changement de statut CRM** ; la liste courtier porte `suggestedNextStatus` (intéressé/question → `negociation`, pas de suite → `perdu`), CRM seulement.

### R7 — Notifications
- **Decision**: `visitor_proposal_available` (e-mail visiteur FR/EN, `dedupeKey` `{type}:{quote}:{assignment}:{proposalId}`, jeton émis au rendu) ; `broker_visitor_response` (ligne e-mail + boîte in-app du courtier, une par réponse). L'e-mail courtier est un pointeur : ni question ni créneau (même règle que spec 044 D1).

### R8 — Coordonnées (D-2)
- **Decision**: `LeadContactPolicy.reveal()` : coordonnées complètes au courtier affecté (Starter et CRM), audit `broker_lead.contact_revealed` à chaque consultation ; masquées (`emailMasked`, `phoneMasked` seulement) après retrait du consentement ou anonymisation (`broker_lead.contact_masked`). Un autre courtier, l'ancien courtier après réaffectation et un agent non assigné restent refusés (403) par les politiques existantes. Le contact manquant d'une affectation en mémoire est lu depuis le prospect (parité avec Prisma).

### R9 — Corrections annexes nécessaires
- `BrokerCrmLeadState` est désormais écrit (upsert) par `updateCrmMetadata` et vidé à la réaffectation (FR-011 en PostgreSQL).
- Le premier affichage Starter ne fait plus reculer un lead accepté à « vu ».
- Anonymisation (spec 046) : message, garanties, motif de retrait, nom de fichier, créneau et question effacés ; montants, dates, types conservés.

## Alternatives rejetées
- Étendre `BrokerCrmProposal` : casse les données et tests existants (référence interne) et mêle deux usages.
- Brouillon modifiable : contredit l'immutabilité et ajoute un état sans besoin exprimé.
- Analyse antivirus asynchrone (comme les documents visiteur) : l'envoi doit être refusé immédiatement si le fichier est infecté (US2-4).
