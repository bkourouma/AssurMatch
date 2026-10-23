# Plan d'implémentation : Lot 5 — routage et facturation (071)

**Spec** : `specs/071-routing-billing-gaps/spec.md` · **Migration** : `0035_routing_billing_gaps` (additive)

## Surfaces impactées

Back-office Plateforme (admin), Broker Back-office, Backend API, packages partagés, base de données / Prisma / migration. Pas d'impact sur le Web Publique Client, ni Docker.

## Constitution Check

| Principe | Verdict |
|---|---|
| I Positionnement | OK : aucune collecte en ligne ; demande de changement de plan traitée par l'admin, sans paiement. |
| III Activation progressive | OK : mutations de prix / add-ons derrière `billing_enabled` ; mode `ai_assisted` derrière `ai_assisted_routing_enabled` (faux par défaut). |
| V IA | OK : suggestion jamais appliquée seule, validation humaine par affectation manuelle, audit métadonnées seulement, aucune donnée personnelle fournie au suggesteur. |
| VI Historique | OK : `RoutingDecision.controlDetails`, audits `routing.*` et `billing.*`. |
| VII Routage | Renforcé : contrôles 9 et 11 excluent, 10 dégrade, 12 envoie en revue manuelle ; verrou de quota. |

## Conception

### Routage (backend `modules/leads`, `modules/routing`)

- `BrokerEligibilityPolicy` : raisons `subscription_inactive` (11), `contract_missing` / `contract_expired` (9) via le port `commercialState` (`PartnerSubscription`, aucune ligne = actif) ; `recheckQuota` pour la vérification sous verrou.
- SLA (10) : **décision technique** — un courtier ayant des leads `assigned` / `broker_notified` sans action depuis plus de `slaTargetMinutes` (30 derniers jours) est **dégradé** (classé après les sains dans tous les modes classés), jamais exclu. Sans `slaTargetMinutes`, jamais dégradé. Tracé dans `controlDetails.degradedCandidates` et audit `routing.broker_degraded`.
- Qualité (12) : grille déterministe sur 100 (contact joignable 40, second canal 10, réponses jusqu'à 30, consentement 20), seuil 30 (`ASSURMATCH_ROUTING_LEAD_QUALITY_MIN_SCORE`, 0 désactive). Sous le seuil : `pending_manual_assignment` + raison `lead_quality_below_threshold` (H3).
- Verrou de quota : `routing/quota-lock.ts`, mutex en processus + Redis `SET NX EX` avec jeton propriétaire, une clé par courtier à quota, clés triées, quota revérifié sous verrou, repli sur le candidat suivant ; délai dépassé => revue manuelle (`quota_lock_timeout`), jamais de dépassement.
- Audit `routing.broker_excluded` : un événement par courtier exclu avec ses raisons, sauf courtier non autorisé pour le pays ou le produit de la demande (qui reste dans `excludedCandidates`).
- Mode `ai_assisted` : `TemplateAiRoutingSuggester` (sans appel modèle), suggestion dans `controlDetails.aiSuggestion`, demande parquée en file manuelle, audits `generated` / `validated` / `diverged`.

### Facturation (backend `modules/billing`)

- `setup_fee` : ligne de brouillon une seule fois (aucune facture active ne la porte, aucun autre brouillon d'une autre période ne la porte) ; `add_on` : une ligne par add-on actif de la période dont un prix activé existe pour le plan effectif et le pays.
- `BillingAddOnsService`, `PartnerSubscriptionsService` (permission `billing:plan_manage`, MFA, audits).
- Non-doublon : `crmStatus === "doublon"` OU demande `blocked_duplicate` / statut `duplicate` ; `possible_duplicate` reste facturable.
- G-06 : `PlanChangeRequestsService` ; effet de **facturation** au premier jour du mois UTC suivant (`effectivePlan`), sans modifier `PartnerTenant.plan`.

### Front

- Admin `/billing?tab=modules` (prix et affectation des add-ons, abonnement, demandes de plan), `/routing` (mode IA assistée, file enrichie, raisons traduites). Courtier `/billing` : section « Changer de plan » réservée aux propriétaires.

## DÉCISIONS À CONFIRMER

1. L'expiration du contrat est portée par `PartnerSubscription.contractExpiresAt` (finance) et non par `PartnerContract` (spec 051, hors périmètre).
2. Un changement de plan accepté n'agit que sur la facturation ; l'alignement de `PartnerTenant.plan`, des rôles propriétaire et de `partnerPlan` des comptes reste à décider.
3. Branchement du suggesteur sur l'AiGateway (type d'assistance dédié) non fait.
4. `possible_duplicate` facturable.
5. Les partenaires actifs sans contrat enregistré sont exclus dès que le port `commercialState` est câblé (contrôle 9).
6. En mode `priority`, la dégradation SLA passe avant les priorités contractuelles.
