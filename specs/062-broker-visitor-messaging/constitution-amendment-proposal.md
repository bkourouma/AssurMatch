# Amendement constitutionnel v1.4.0 (RATIFIÉ le 2026-10-16) — critère d'acceptation n°1 (Courtier Starter)

**Statut** : ratifié par le propriétaire du produit le 2026-10-16 et intégré à `.specify/memory/constitution.md` (v1.4.0, MINOR). Ce document conserve le raisonnement de l'amendement.

## Conflit constaté

Critère n°1 (v1.3.0) : le courtier Starter voit **uniquement** ses leads reçus, le détail du lead, accepter, rejeter, contester, « répondre au visiteur par une proposition simple (message et document facultatif, marquée non contractuelle) », l'historique minimal, le dashboard basique et les notifications configurées.

La décision produit du 2026-10-15 (point 2 : messagerie, pièces jointes et demandes de documents pour **tous les plans**, Starter compris) dépasse cette liste fermée : un échange texte bidirectionnel avec pièces jointes, des demandes de documents (jusqu'à 10 ouvertes) et le téléchargement des fichiers fournis par le visiteur. Le plan.md de la spec 062 ne peut donc pas se contenter de les qualifier de « sous-ensemble » de « répondre au visiteur » : il s'agit d'une extension matérielle (amendement MINOR, procédure de gouvernance de la constitution et précédent D-5 / v1.3.0).

## Texte proposé (v1.3.0 -> v1.4.0, MINOR)

Critère n°1, remplacer « repondre au visiteur par une proposition simple (message et document facultatif, marquee non contractuelle) » par :

> « repondre au visiteur par une proposition simple (message et document facultatif, marquee non contractuelle), echanger par messages ecrits avec le visiteur (pieces jointes analysees, historique en ajout seul, formulations reglementees bloquees), demander des documents au visiteur et telecharger ceux qu'il fournit, »

Les exclusions Starter restent inchangées : Kanban, pipeline avancé, assignation équipe, tâches, rappels et IA commerciale non incluse.

**Sync Impact Report à ajouter** : version 1.3.0 -> 1.4.0 ; principe modifié : critère d'acceptation n°1 ; approbateur : propriétaire du produit (décision du 2026-10-15, spec 062) ; revalidation : à la revue de la spec 062 ; templates : revus, sans changement.

## Atténuation en attendant la ratification
- Le drapeau global non sensible `broker_visitor_messaging_enabled` coupe toutes les écritures (messages, demandes de documents, téléversements) sans déploiement ; la lecture de l'historique reste possible.
- Les exclusions CRM du Starter restent testées (`broker-starter-exclusions.spec.ts`).
