# Feature Specification: Écarts PRD du back-office courtier (KPI, Kanban glisser-déposer, CRM, alertes, vue multi-agences)

**Status**: Validated (lot 3 « écarts PRD », mandaté par le superviseur du projet le 2026-10-21 ; spec standard, aucun `[NEEDS CLARIFICATION]`)
**Input**: PRD §6.3, §10.2, §19 (CRM-002, CRM-006, CRM-015), §20 (KPI, DASH-B-001..009), §23 (notifications courtier) ; specs 012, 035, 040, 041, 061, 064. Dépend des specs 040 (Enterprise), 053 (équipe), 060 (facturation), 061 (alertes), 064 (rôles personnalisés et filtre agence).
**Impacted surfaces**: Backend API (tableau de bord courtier, IA courtier, alertes planifiées, liste CRM), Broker Back-office (tableau de bord, liste CRM, Kanban, fiche lead), shared packages (contrats dashboard, IA, ops), feature flags (un flag IA fermé par défaut). **Web Publique Client : aucun changement. Back-office Plateforme : aucun changement. Base de données : aucune migration.**

## Why
Le PRD §20 liste des indicateurs que le tableau de bord courtier n'expose pas (taux de contact, délai de premier contact, taux de qualification, devis envoyés, sources performantes, coût par lead) et définit la conversion comme leads gagnés / leads reçus alors que le produit calcule acceptés / reçus. Le CRM n'a ni glisser-déposer, ni sélecteur de conseillers (l'identifiant brut est saisi), ni filtres serveur paginés (filtrage sur la première page seulement), ni score de priorité IA, ni vue consolidée Enterprise, et deux notifications courtier du PRD §23 manquent.

## User stories
1. **(P1) Courtier Pro/Enterprise.** Le tableau de bord affiche les KPI §20, la conversion correcte (gagnés / reçus), les sources performantes et le coût par lead ; l'export CSV (DASH-B-005) les contient.
2. **(P1) Courtier Pro/Enterprise.** Dans le Kanban, il glisse une carte vers une autre colonne (ou utilise le menu clavier « Déplacer vers… ») ; le changement suit les mêmes règles, le même historique et le même audit que le formulaire de la fiche ; un rôle sans droit ne peut pas déplacer.
3. **(P1) Courtier habilité à assigner.** Il choisit le conseiller dans la liste de l'équipe de son cabinet (noms, jamais l'identifiant brut).
4. **(P1) Courtier Pro/Enterprise.** Les filtres de la liste (statut, produit, dates, conseiller, agence, recherche) sont appliqués par l'API et paginés ; le tri par date, statut et priorité porte sur tout le jeu filtré.
5. **(P1) Courtier Pro/Enterprise.** Une colonne « Priorité IA » apparaît, triable, uniquement pour les leads dont le score a été calculé ET validé par un humain ; flag IA fermé, opt-out ou Starter : colonne absente.
6. **(P1) Courtier Pro/Enterprise.** Il reçoit une notification « lead proche de l'expiration » et, si le flag est ouvert, un résumé hebdomadaire.
7. **(P1) Propriétaire/manager Enterprise.** Une vue consolidée compare les agences (volumes, contact, conversion, délais).
8. **(P2) Courtier Pro/Enterprise.** Un « résumé IA de performance » (DASH-B-009) est généré à la demande, étiqueté « assistance IA » et soumis à validation humaine ; l'Enterprise dispose en plus de l'« assistant manager » (§10.2).

## Requirements
- **FR-001 (KPI).** Section `crm` du tableau de bord courtier (jamais pour le Starter) : `conversionRate` et `rate` par produit = gagnés / reçus ; `kpis` = taux de contact, délai moyen de premier contact, taux de qualification, devis/propositions envoyés, sources performantes, coût par lead (estimation selon le plan et les tarifs de facturation). Calculés sur le périmètre filtré (fenêtre, produit, pays, conseiller, agence). Les contrats sont additifs.
- **FR-002 (export).** Les KPI et la table des agences sont exportés dans le CSV du tableau de bord ; aucune identité de prospect.
- **FR-003 (vue multi-agences).** `GET /broker/dashboard/agencies` : une ligne par agence du tenant (+ « sans agence »), plan Enterprise uniquement, rôles voyant tout le tenant, audité.
- **FR-004 (IA).** Types `performance_summary` (Pro, Enterprise) et `manager_assistant` (Enterprise) via la passerelle IA centrale : flags, plan, opt-out partenaire, minimisation, validation humaine, aucun appel modèle si coupé. `GET /broker/crm/ai/priority-scores` : scores `lead_score` approuvés uniquement, vide si flag fermé.
- **FR-005 (Kanban).** Glisser-déposer et menu clavier ; `POST /broker/crm/leads/:id/status` inchangé (autorité, audit, 403 pour les rôles sans droit) ; motif exigé pour les statuts de sortie ; annulation du déplacement en cas de refus.
- **FR-006 (assignation).** Sélecteur alimenté par `GET /broker/team` (borné au tenant) ; l'API refuse tout conseiller d'un autre cabinet.
- **FR-007 (liste serveur).** La page liste transmet statut, produit, pays, dates, conseiller, agence, urgence, source, recherche, tri et pagination à `GET /broker/crm/leads` ; le tri `priority` est calculé côté serveur.
- **FR-008 (alertes).** `broker_lead_expiring` (une alerte par lead, clé persistée) et `broker_weekly_summary` (une par semaine ISO et par tenant, flag `broker_weekly_ai_summary_enabled` fermé par défaut), via le worker `scheduled-alerts` (spec 061), Pro/Enterprise uniquement.
- **FR-009 (non-régression).** Starter sans CRM ni IA commerciale ; rôles personnalisés (spec 064) et filtre agence appliqués sur chaque nouvelle route.

## Décisions techniques
- **D1** Expiration d'un lead : échéance = `assignedAt` + cible SLA de première action (contractuelle `slaTargetMinutes`, sinon cible du courtier, sinon 240 min). « Proche » = 80 % du délai consommé (`ASSURMATCH_ALERT_LEAD_EXPIRY_WARNING_PERCENT`), annonce possible jusqu'à 3 jours après l'échéance.
- **D2** Source marketing : aucune donnée UTM n'est capturée ; la source CRM du lead (`comparator`, `quote_request`, `manual_import`, `partner_referral`, `support`) sert de « source de la demande ».
- **D3** Coût par lead : estimation `perLeadPrice` du plan et du pays (leads partagés au multiplicateur) ; ce n'est pas une facture.
- **D4** Résumé hebdomadaire : texte IA si la passerelle l'autorise, sinon texte déterministe ; flag fermé par défaut.

## Hors périmètre
- Capture UTM / source marketing publique ; restriction d'accès par agence ; migration de base de données.

## Success criteria
- Chaque KPI testé, dont la conversion gagnés / reçus ; glisser-déposer audité et refusé aux rôles sans droit ; sélecteur limité à l'équipe ; filtres serveur paginés ; tri par score IA ; deux alertes idempotentes ; vue multi-agences Enterprise ; rien de visible pour le Starter.
