# Handoff : redesign des back-offices (admin + courtier)

Date : 2026-10-11. Cadre : Impeccable, mode Operer. Fusionne sur `main` par PR (voir en bas).

## Ce qui est livre

- **Systeme partage** `packages/ui` (`@assurmatch/ui`) : `styles/backoffice.css` (jetons `--bo-*`, themes), composants `backoffice/*`, polices `backoffice-fonts.ts` (Archivo variable + Spline Sans Mono).
- **Direction « raie d'emission »** (choisie par le proprietaire apres rejet d'une premiere version « SaaS clair ») : plaque de travail, texte « os », la couleur n'existe que comme traits fins, l'etat se lit dans la forme du trait (plein = confirme, tirete = attention, double = a traiter d'abord, demi-hauteur = info, barre = desactive). Rail a traits, regle graduee collante dont le trait lumineux suit le defilement, files « A traiter » avec echelle par ligne.
- **6 themes** : Clair (defaut), Sable, Sombre, Bleu nuit, Vert foret, Prune. Choix dans le menu du compte (pied du rail), cookie par app (`assurmatch_admin_theme`, `assurmatch_broker_theme`) lu par le layout : rendu serveur sans flash. `<html>` porte `data-app`, `data-theme`, `data-mode`. Admin = trait cyan, courtier = trait violet dans tous les themes.
- **Ecrans** : tous les ecrans admin et courtier restructures (filtres puis tableau, fiches avec statut + actions en en-tete, confirmations sur les actions destructrices). Dashboards : « A traiter » + bandeau de chiffres + dernieres demandes / alertes (admin) ou leads a traiter (courtier).
- **Documents** : `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` a la racine ; plan `docs/ui/backoffice-redesign-plan.md` ; contrat de direction `apps/admin/.impeccable/surfaces/apps-admin-app-page-tsx.md`.
- Validations avant fusion : typecheck admin et courtier, `npm run lint`, `npx playwright test apps/admin/tests apps/broker/tests` (194 passes, 3 ignores). Apres la fusion de `origin/main` (qui ne touche que `apps/public`, scripts et Dockerfiles), les memes verifications n'ont pas pu etre relancees localement (worktree sans `node_modules`) : se fier a la CI de la PR.

## Reste a faire

- Verification visuelle : courtier dans les 6 themes, admin a 1024 px et en mobile, selecteur de theme a l'ecran (verifie par script seulement : cookie et attributs).
- CRM courtier avec `broker_crm_enabled` actif : detail d'un lead CRM et Kanban jamais vus avec de vraies donnees.
- Accents manquants dans les ecrans hors dashboards et menus ; dates encore au format proche ISO.
- Dashboard admin sans bouton principal en haut a droite.
- Echelle « ligne sur une echelle » non etendue aux colonnes quota et expiration de licence des tableaux.
- Classes locales dans `apps/broker/app/lib/ui/broker-screens.module.css` a promouvoir dans `backoffice.css` (`bo-muted`, `bo-pre`, `bo-board`...).
- Theme « suivre le systeme » (prefers-color-scheme) non fait : le defaut est Clair.

## Points OUVERTS (attendent l'utilisateur)

- Lien « Ouvrir le lead » des notifications : va toujours a `/crm/leads/...`, donc un courtier Starter arrive sur la page de refus du CRM. Le corriger change une route : a decider.
- Bouton rouge de confirmation : plaque rouge pleine, contraire a la regle « la couleur n'est que trait » (note dans DESIGN.md) : garder ou remplacer par un bouton secondaire a libelle rouge.
- Defaut Clair confirme ? Sinon « suivre le systeme ».

## Pieges

- Les cookies navigateur sont partages entre ports sur localhost : noms de cookie de session ET de theme propres a chaque app.
- Les constantes de cookie de theme vivent dans `apps/*/app/lib/theme-cookie.ts` (pas dans un composant `"use client"`) : importees depuis un module client, elles deviennent des references et le serveur ne lit plus le cookie.
- Beaucoup de tests statiques lisent les sources et attendent des libelles ou classes exacts : si un libelle change, adapter le test (ne pas supprimer l'assertion).
- Le working tree est en CRLF : editer avec l'outil Edit ou en preservant les fins de ligne.
- La capture d'ecran du panneau navigateur est capricieuse (rognee) : mesurer par script (`scrollWidth`, attributs, styles calcules).
- Les sessions de demo locales expirent : se reconnecter via le select « Compte demo ».
- Le detecteur Impeccable signale la regle graduee comme « fond quadrille » : faux positif (ce sont des graduations).
- `apps/public` a son propre PRODUCT.md/DESIGN.md et son propre monde visuel : ne pas y toucher depuis ce chantier.
