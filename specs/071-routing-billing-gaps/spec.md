# Spécification fonctionnelle : Lot 5 — routage et facturation (écarts PRD §17, §24, §6.4)

**Branche** : `orch/2026-10-21-ecarts-prd-lot-5` (base `integration/recos-1-4`)
**Créée le** : 2026-10-21
**Statut** : Validée — lot confié par le superviseur (audit PRD des écarts routage / facturation). Aucun marqueur `[NEEDS CLARIFICATION]` : les points métier non tranchés sont fixés par les hypothèses H3 et H4 du superviseur ou marqués **DÉCISION À CONFIRMER**.
**Workflow continu** : oui.

## Pourquoi cette spec

L'audit PRD a relevé, après les specs 042, 049, 051, 053, 060 et 063, les écarts suivants :

1. **Contrôles de routage manquants (PRD §17, 12 contrôles)** : le moteur ne vérifie ni le statut du plan commercial (11), ni le contrat enregistré et non expiré (9), ni la disponibilité / SLA (10), ni le score qualité du lead (12).
2. **Quota non protégé contre la concurrence (ROUTE-003)** : le quota mensuel est lu puis consommé plus tard ; deux soumissions simultanées peuvent le dépasser. L'événement d'audit `routing.broker_excluded` est défini mais jamais émis (ROUTE-008).
3. **Mode « IA assistée » absent (PRD §17 mode 9, §31, §32.8)**.
4. **Facturation (PRD §24, §6.4)** : le frais d'installation existe en base (`BillingPlanPrice.setupFee`) mais n'est jamais facturé ; les add-ons API / marque blanche / IA n'existent pas ; le critère « lead non doublon » ignore `duplicateStatus` de la demande.
5. **G-06** : le courtier n'a aucun moyen de demander un changement de plan.

## Surfaces impactées

| Surface | Impact |
|---|---|
| Web Publique Client | Aucun. |
| Back-office Plateforme / Admin | `/billing` (prix et affectation des add-ons, état d'abonnement, demandes de changement de plan, libellés des nouvelles lignes) ; `/routing` (mode « IA assistée », file manuelle enrichie, raisons d'exclusion). |
| Broker Back-office | `/billing` : demande de changement de plan et historique ; libellés des nouvelles lignes du relevé. |
| Backend API | Éligibilité et routage (contrôles 9 à 12, verrou de quota, audit d'exclusion, mode `ai_assisted`), facturation (setup fee, add-ons, non-doublon, plan effectif), demandes de changement de plan, abonnement. |
| Shared packages | `routing-rule.contracts.ts`, `billing.contracts.ts`, nouveaux `billing-addons.contracts.ts` et `billing-plan-change.contracts.ts`, matrice RBAC. |
| Base de données / Prisma | Migration additive `0035_routing_billing_gaps`. |
| Runtime / Docker | Aucun nouveau service ; variables d'environnement optionnelles (seuil qualité). Pas de Docker. |

Les parcours visiteur et les parcours authentifiés admin / courtier restent séparés : aucune route ni écran de ce lot n'entre dans l'application publique.

## Cadre constitutionnel

- **Principe VII (routage responsable)** : tous les contrôles ajoutés sont déterministes ; ils journalisent leur résultat dans `RoutingDecision`. Un lead n'est jamais transmis si l'abonnement est inactif ou le contrat absent / expiré (contrôles 9 et 11).
- **Principe V (IA)** : le mode `ai_assisted` n'applique jamais la suggestion ; il parque la demande en affectation manuelle, la suggestion étant jointe, et l'admin valide. Fermé par défaut (flag `ai_assisted_routing_enabled`), audité, sans donnée personnelle envoyée à un modèle.
- **Principe VI (historique opposable)** : décisions de routage, affectations d'add-ons, changements d'abonnement et décisions de plan sont audités ; rien n'est supprimé.
- **Principe I / III** : aucune collecte en ligne ; les mutations de prix et d'add-ons restent derrière `billing_enabled`.

## Hypothèses métier appliquées

- **H3 — lead sous le seuil de qualité** : revue manuelle admin, jamais exclusion automatique. Seuil par défaut 30/100 (0 désactive), variable `ASSURMATCH_ROUTING_LEAD_QUALITY_MIN_SCORE`.
- **H4 — frais d'installation et add-ons** : le frais d'installation est facturé une seule fois, sur la première facture du courtier ; les add-ons API, marque blanche et IA sont des forfaits mensuels optionnels par pays et plan, désactivés par défaut, affectés à un courtier par la finance (audité) et ajoutés aux brouillons de facture.

## Exigences fonctionnelles

- **FR-01** Contrôle 11 : un courtier dont l'abonnement est suspendu ou résilié est exclu (`subscription_inactive`).
- **FR-02** Contrôle 9 : un courtier sans contrat enregistré (`contract_missing`) ou dont le contrat est expiré (`contract_expired`) est exclu.
- **FR-03** Contrôle 10 : un courtier en dépassement de SLA est dégradé dans le classement, jamais exclu ; la dégradation est tracée dans la décision.
- **FR-04** Contrôle 12 : score qualité déterministe ; sous le seuil, la demande passe en revue manuelle admin.
- **FR-05** Les contrôles 9 à 12 sont visibles dans `RoutingDecision` (`excludedCandidates`, `controlDetails`).
- **FR-06** Deux soumissions simultanées ne dépassent pas le quota (verrou par courtier, re-vérification sous verrou).
- **FR-07** `routing.broker_excluded` est émis pour chaque courtier exclu pertinent.
- **FR-08** Mode `ai_assisted` : suggestion parmi les éligibles, jamais appliquée seule, fermé par défaut, audité.
- **FR-09** Frais d'installation facturé une seule fois ; add-ons dans les brouillons et l'estimation courtier ; non-doublon fondé sur `duplicateStatus`.
- **FR-10** G-06 : demande de changement de plan par le propriétaire, décision admin auditée, effet au prochain cycle (facturation).
- **FR-11** Aucune régression des contestations et des avoirs (spec 063).

## Décisions techniques

Voir `plan.md`.

## DÉCISIONS À CONFIRMER

Voir la section finale de `plan.md` (propriété de la date d'expiration du contrat, effet d'accès d'un changement de plan, branchement de l'IA sur la passerelle, dépôt `possible_duplicate`).
