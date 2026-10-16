# Feature Specification: Corrections issues du parcours E2E (spec 066)

**Statut** : implémentée sur la branche `fix/e2e-findings`.
**Surfaces impactées** : Backend API (prospects, demandes de devis), Back-office Courtier (middleware, tableau de bord, agences Enterprise), Web Publique Client (texte de la fiche pays pilote), dépôt (`.gitattributes`). Aucun changement Prisma ni migration. Les parcours visiteur public et courtier/admin restent séparés.
**Références** : constitution (II conformité et consentement, minimisation des données), spec 054 (espace de suivi visiteur), spec 046 (rétention et effacement), spec 051 (courtier suspendu en lecture seule).

## F1 — Un téléphone connu ne doit plus rediriger les messages d'un autre visiteur (confidentialité)

**Constat.** `createOrLink` retrouvait un profil `Prospect` existant sur l'empreinte du courriel **ou** celle du téléphone, dans le même pays et pour le même produit. Un second visiteur partageant le téléphone d'un premier (famille, bureau, numéro relais) reprenait donc le profil du premier : le courriel de confirmation et le lien de suivi magique partaient vers l'adresse du premier visiteur, le second ne recevait rien, et le courtier voyait les coordonnées du premier.

**Exigences.**
- FR-001 : tout message visiteur et tout lien de suivi d'une demande sont adressés uniquement aux coordonnées saisies dans cette soumission.
- FR-002 : un profil n'est réutilisé que pour une identité strictement identique (courriel, téléphone et nom normalisés identiques) ; sinon un profil distinct est créé. Aucune donnée d'un autre profil n'est écrasée.
- FR-003 : une correspondance de téléphone seule alimente uniquement un signal de doublon non bloquant (`possible_duplicate`), sans fusion d'identité.
- FR-004 : le comportement existant est conservé pour même courriel + même téléphone : blocage en doublon dans la fenêtre de 30 jours et réutilisation du profil au-delà.
- FR-005 : le courtier voit les coordonnées de cette demande ; l'envoi du lien de suivi, l'enquête de satisfaction, le retrait de consentement et l'effacement ne peuvent ni adresser ni exposer une autre personne.

**Conception retenue** : pas de colonne « snapshot » sur la demande ni de migration. Le profil porte exactement le contact de la soumission ; il est réutilisé seulement quand il serait identique, ce qui garde un seul modèle de lecture pour tous les consommateurs (notifications, `/suivi`, courtier, enquête, effacement par courriel) et reste le moins invasif.

**Limite connue.** Les demandes créées avant ce correctif pointent encore vers un profil partagé : leurs coordonnées ne sont corrigées par aucune migration. La signature de l'auteur reste retrouvable (`ConsentRecord.subjectReference` = empreinte du courriel du soumissionnaire, distincte de `Prospect.emailFingerprint` pour ces cas) ; un script de détection ou une remise à zéro des bases de recette est recommandé avant toute mise en production. Course théorique : deux soumissions identiques simultanées peuvent créer deux profils de même contact (sans fuite).

## F3 — Modifier une agence Enterprise (back-office courtier)
Action « Modifier » sur la liste des agences (nom, ville, statut ; pays non modifiable) appelant `PATCH /broker/enterprise/agencies/:id` avec motif obligatoire. RBAC inchangé (propriétaire Enterprise côté API ; action masquée pour un cabinet suspendu via `TenantWriteGuard`).

## F4 — Courtier Starter sur `/crm/*`
Le middleware conserve la session et redirige vers `/?notice=crm_requires_pro`, où le tableau de bord affiche « Le CRM est réservé aux formules Pro et Enterprise. ». Les refus de l'API sont inchangés.

## F5 — Texte pays pilote
La fiche d'un pays pilote ne promet plus d'offres visibles : les offres comparables n'apparaissent qu'à l'ouverture publique du pays (`country_public_enabled`). FR et EN.

## F6 — Fins de ligne des scripts shell
`.gitattributes` : `*.sh text eol=lf` pour éviter les builds Docker cassés par du CRLF issu d'un checkout Windows.

## Critères d'acceptation
Même téléphone + courriels différents : chaque visiteur reçoit ses courriels et son jeton, le courtier voit le bon contact. Même téléphone + même courriel : doublon inchangé. Tests unitaires et d'intégration ajoutés ; typecheck, lint, vitest, Playwright et scan de secrets verts.
