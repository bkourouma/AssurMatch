# Research: 062

Décisions techniques prises avant la phase 1. Chaque entrée : décision, raison, alternative rejetée.

## R1. Identité d'une conversation
- **Décision** : une conversation = un couple (affectation, courtier). Une réaffectation (`LeadAssignmentService.reassign`) **modifie la même ligne d'affectation** (changement de `partnerTenantId`), donc la clé est `(leadAssignmentId, partnerTenantId)`. L'identifiant exposé `conversationId` est un hachage opaque de ce couple (jamais l'identifiant de tenant).
- **Raison** : E-07 (le nouveau courtier ne voit aucun message de l'ancien) sans table de conversation supplémentaire ; le visiteur voit une conversation par courtier.
- **Rejeté** : table `LeadConversation` (état dérivé suffisant : ouverte si l'affectation courante est acceptée, lead ouvert, consentement actif).

## R2. Ajout seul et opposabilité
- **Décision** : aucune route de modification/suppression ; le dépôt n'expose que `append`, `markRead` et `anonymize`. Test de dépôt qui prouve l'absence de `update(body)`. Audits sans contenu.
- **Raison** : constitution VI, PRD E-03.

## R3. Pièces jointes
- **Décision** : réutiliser `storeScannedFile` (`lead-proposals/scanned-upload.ts`, ports de stockage et d'antivirus des specs 033/051). Limites : 5 Mo, PDF/JPEG/PNG, 3 par message, refus global si une pièce n'est pas saine.
- **Demandes de documents** : le fichier du visiteur est enregistré comme `QuoteRequestDocument` (module `quote-documents`, spec 033) avec un nouveau lien `documentRequestId` ; il est partagé avec l'affectation courante pour que le courtier le télécharge via une route courtier dédiée et auditée.
- **Rejeté** : second pipeline de stockage.

## R4. Garde de formulations
- **Décision** : `findForbiddenWordingAnyLanguage` reste la garde unique, **renforcée** de façon additive : (a) comparaison insensible aux accents (« contrat validé » = « contrat valide »), (b) motifs à frontière de mot pour « garanti(e)(s) » employé seul (« remboursement garanti », « garanti à vie ») sans bloquer « garanties », (c) équivalents EN (`guaranteed`, `contract validated`, `subscribe now`). Aucune formulation déjà bloquée ne passe désormais.
- **Raison** : la décision produit cite explicitement « contrat validé » et « garanti » ; la liste actuelle ne reconnaît pas l'accent de « validé ».
- **Risque** : faux positifs sur « garanti » ; le courtier voit l'expression et reformule.

## R5. Drapeau de fonctionnalité
- **Décision** : `broker_visitor_messaging_enabled` dans `GLOBAL_FEATURE_FLAG_DEFAULTS` avec défaut `true` (première valeur `true` de la liste : le test d'inventaire des drapeaux et le seed sont mis à jour) ; clé non sensible (aucun fragment réglementé, absente de la liste protégée) donc modifiable depuis l'écran des drapeaux sans changement d'interface.
- **Lecture** : résolveur global existant, évalué à chaque écriture (jamais en cache de processus).
- **Comportement coupé** : écritures refusées (`MESSAGING_DISABLED`), lectures conservées.

## R6. Notifications
- **Décision** : nouveaux types d'énumération (migration `ALTER TYPE … ADD VALUE`), traités par le worker existant (`DELIVERABLE_TYPES`), gabarits FR/EN pointeur sans contenu. Idempotence par `dedupeKey` avec tranche de 15 minutes pour limiter le volume d'e-mails (la notification in-app et l'e-mail sont regroupés par tranche, via `BrokerAlertNotifier` pour le courtier ; le compteur de non lus de l'interface reste exact).
- `broker_document_received` (055) est réutilisé pour les pièces fournies par le visiteur.
- Préférences de canal (spec 038) et désinscription : appliquées par le même chemin que `broker_visitor_response`.

## R7. SLA (E-08)
- **Constat** : le SLA existant lit des colonnes de `LeadAssignment` (`seenAt`, `acceptedAt`, `lastBrokerActionAt`, `crmUpdatedAt`) dans `enterprise.service`, `broker-dashboard.service`, le SQL d'agrégat de `lead-assignments.repository` et l'admin SLA des partenaires.
- **Décision** : ajouter `firstVisibleReplyAt` (nullable) sur `LeadAssignment`, renseigné par un unique appel `LeadAssignmentService.recordFirstVisibleReply(id, at)` (idempotent : ne s'écrit qu'une fois, remis à `null` à la réaffectation comme les autres horodatages courtier). Appelé à l'envoi de la **première proposition** (055) ou du **premier message du courtier**. Les calculs existants gagnent des champs additifs `firstVisibleReply*` (moyenne, nombre mesuré, taux dans la cible) calculés à partir de cette colonne ; les champs « premier geste » existants ne changent pas.
- **Rejeté** : recalculer à la volée en joignant propositions et messages (quatre calculs à modifier, risque de divergence).
- **DÉCISION À CONFIRMER** : la cible SLA contractuelle s'applique-t-elle désormais à la première réponse visible ? Livré en additif.

## R8. Demandes de données (D-10)
- **Décision** : `DataRequest` créée par le visiteur (jeton 054) ; référence `DR-` aléatoire de 8 caractères base32 ; accusé par notification `visitor_data_request_acknowledged` ; traitement dans l'admin « Rétention » par `compliance_admin` / `super_admin`.
- **Effacement** : l'action `start-erasure` appelle `DataRetentionService.previewErasure({ publicReference })` (spec 046) et enregistre `erasureBatchId` ; l'approbation et l'exécution du lot restent dans le flux existant, derrière `retention_purge_enabled`. **Aucune suppression directe** depuis la demande de données.
- **Accès et rectification** : traitement manuel hors plateforme ; la conformité clôture avec une note.
- **Rejeté** : exécution automatique de l'effacement à la création.

## R9. Isolation et RBAC
- Accès courtier : mêmes politiques que les propositions (`BrokerStarterAccessPolicy` / `BrokerCrmAccessPolicy`), plus la vérification que `message.partnerTenantId === assignment.partnerTenantId` (courant).
- Accès visiteur : `VisitorAccessService.verify` ; réponse neutre 404 pour tout échec.
- Accès admin : permissions du rôle (`compliance_admin`, `support_admin`) ; support masqué ; audité.
- Tests obligatoires : voir `tasks.md`.

## R10. Frontières d'application
- Visiteur : app publique uniquement, routes `/api/quote-requests/…` pour les fichiers (relais serveur avec jeton), aucune chaîne `backoffice`/`/broker/`/`/admin/` dans le code public (garde existante).
- Courtier : formulaires serveur + route handlers (relais multipart), comme `ProposalPanel`.
- Admin : pages serveur ; actions `use server`.

## R11. Anti-spam
- `PublicAbuseGuardService.assertAllowed` par IP ; compteur Redis par conversation ; champ piège `website` ; refus des doublons exacts consécutifs sur 5 minutes ; plafond de 300 messages.
