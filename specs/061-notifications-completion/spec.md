# Feature Specification: Notifications courtier et admin restantes, rappels d'expiration

**Status**: Validated (workflow continu autorisé par l'utilisateur le 2026-10-03)
**Input**: PRD v0.3 (I-03, I-04, I-05, A-11, C-05) et PRD v0.2 §23. Dépend des specs 051, 052, 054, 055 et 057 (worker).
**Impacted surfaces**: Backend API (notifications, worker), Broker Back-office (préférences), Back-office Plateforme (centre d'alertes), Web Publique Client (désinscription des messages non transactionnels), base de données.

## Why
Une partie des notifications prévues par le PRD n'existe pas :
- **Côté courtier** : lead réaffecté, document reçu, rappel de tâche, quota atteint, facture disponible (couverte par la spec 060), réponse du visiteur (couverte par la spec 055), licence ou offre bientôt expirée.
- **Côté admin** : licence expirante, offre expirée, pays sans courtier actif, pic de leads non routés, taux de litige élevé, échec du worker.

Enfin, les rappels d'expiration n'ont pas d'ordonnanceur.

## User stories
1. **(P1) Courtier.** Il reçoit dans son portail, et par e-mail selon ses préférences, une alerte pour : lead réaffecté vers lui, document ajouté par un visiteur, rappel de tâche à échéance, quota mensuel atteint à 80 % puis 100 %, licence expirant à J-60, J-30 et J-7, offre expirant à J-15.
2. **(P1) Admin.** Le centre d'alertes et l'e-mail de l'équipe conformité signalent : licence expirante (J-60, J-30, J-7), offre expirée, pays public sans courtier actif public, plus de N leads non routés en 24 h, taux de litige supérieur au seuil, worker inactif.
3. **(P2) Visiteur.** Il peut se désinscrire de l'enquête de satisfaction (message non transactionnel) depuis le lien de l'e-mail.

## Requirements
- **FR-001** Tâche planifiée dans le worker de la spec 057 (`scheduled-alerts`) : idempotente par jour et par cible, avec des seuils configurables par variables d'environnement.
- **FR-002** Nouveaux types de notification et gabarits FR (back-office) avec garde de formulations ; les e-mails ne contiennent qu'un lien vers le portail.
- **FR-003** Les préférences de canal du courtier (spec 038) s'appliquent. L'in-app est toujours actif.
- **FR-004** Centre d'alertes admin (page existante du tableau de bord), avec acquittement des alertes et audit.
- **FR-005** Jeton de désinscription signé dans l'e-mail d'enquête et page publique de confirmation, sans authentification.
- **FR-006** Tests : génération idempotente, seuils, préférences, isolation par courtier, désinscription.

## Success criteria
- 0 alerte dupliquée par jour et par cible.
- 100 % des licences expirantes signalées à J-60, J-30 et J-7.
