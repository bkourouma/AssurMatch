# Redesign des back-offices (admin plateforme + courtier)

Date: 2026-10-08. Branche: `055-public-redesign-patron` (le site public n'est pas touche).
Cadre: Impeccable, mode Operer. Contrat de direction: `apps/admin/.impeccable/surfaces/apps-admin-app-page-tsx.md`.
Produit: `PRODUCT.md` (racine). Decision du proprietaire (2026-10-08): rupture totale avec le monde visuel du site
public (« Le patron »), standard SaaS soigne joue droit, un seul systeme avec un accent par app.

## 1. Direction

Niveau de finition vise: Linear, Stripe Dashboard, HubSpot/Pipedrive (CRM courtier), Vercel/GitHub.

| Element | Decision |
| --- | --- |
| Surface | Gris neutre froid (`--bo-ground`), panneaux blancs, filets 1px (`--bo-line`), aucune ombre sauf menus et dialogues, aucun degrade |
| Rail | Barre laterale claire (plus de bleu marine), entree active = fond teinte accent + texte accent, pas de liseré lateral |
| Accent | Admin: azur (`oklch(0.54 0.2 258)`). Courtier: prune (`oklch(0.5 0.16 345)`). Pose par `data-app` sur `<html>`. Porte boutons primaires, entree active, liens, focus, etiquette d'app. |
| Statuts | Vert confirme, ambre attention/sponsorise, rouge erreur/bloque, ardoise info. Teinte douce + point + libelle, jamais la couleur seule. |
| Typo | Geist (UI et titres, 600) + Geist Mono (references, identifiants, montants). 14px minimum, 15px corps/champs, 24px titre de page. |
| Forme | Panneaux 8px, controles 6px, dialogues 12px, pastilles 999px seulement pour avatar/compteur |
| Compte | Menu utilisateur en pied de rail (plus de topbar sur desktop); la topbar n'existe que sous 900px (tiroir) |

Refuse: kicker au-dessus du titre, grille de cartes KPI identiques, cartes qui repetent l'en-tete, liseré colore sur une carte, monospace decoratif.

## 2. Systeme partage (packages/ui) — livre par le superviseur

- `styles/backoffice.css` reecrit (jetons `--bo-*`, plus de dependance a `tokens.css`; `tokens.css` reste pour le public).
- `backoffice-fonts.ts` (Geist, Geist Mono) exporte en `@assurmatch/ui/backoffice-fonts`.
- `AppShell`: rail clair, logo couleur, etiquette d'app, badge d'environnement dans le rail, `UserMenu placement="up"` en pied de rail.
- `PageHeader`: la prop `kicker` est acceptee mais n'est plus rendue.
- Nouveaux composants: `StatStrip` (plusieurs chiffres dans un seul panneau), `AttentionList` (« A traiter », une ligne par file, lignes vides en bas).
- Badge: point automatique devant chaque etat. Classe `.bo-ref` pour les references en mono.
- Les deux layouts posent `data-app` et les polices; l'admin affiche le role (pas l'UUID) dans le menu compte.

## 3. Vagues

| Vague | Proprietaire | Perimetre ecriture | Etat |
| --- | --- | --- | --- |
| 0 Fondation + 2 dashboards | superviseur | `packages/ui/**`, layouts, `apps/*/app/page.tsx`, `apps/admin/app/dashboard/page.tsx`, view-models dashboards | fait |
| 1a Ecrans admin | agent `admin_screens` | `apps/admin/app/**` sauf `lib/*-actions.ts`, `lib/admin-api.ts`, `lib/backoffice-*`; `apps/admin/tests/**` | fait |
| 1b Ecrans courtier | agent `broker_screens` | `apps/broker/app/**` sauf `lib/*-actions.ts`, `lib/broker-api.ts`, `lib/backoffice-*`; `apps/broker/tests/**` | fait |
| 2 Verification | superviseur | captures 1440/1024/390, typecheck, lint, tests statiques, `impeccable detect`, relecteur de fin, DESIGN.md | fait |

Regle: un seul proprietaire par fichier; les agents n'editent pas `packages/ui` (ils signalent les manques). Aucun changement de server action, de client API, d'auth, de route, de libelle reglementaire ni de `data-testid`.

## 4. Regles ecran (vagues 1a/1b)

1. **En-tete**: titre court + une phrase; pas de kicker; le fil d'Ariane reste. Une seule action primaire a droite.
2. **Liste**: `FilterBar` puis `DataTable` directement (pas de carte qui repete le titre). Reference/identifiant en `.bo-ref`. Etat vide qui dit quoi faire.
3. **Chiffres**: plusieurs indicateurs = `StatStrip`; jamais une grille de `KpiCard` de meme taille. Une file a traiter = `AttentionList`.
4. **Cartes d'explication** (regles, droits, avertissements permanents): une `Notice` compacte sous l'en-tete, ou une `DescriptionList` dans la colonne laterale; jamais deux cartes de texte avant les donnees.
5. **Detail d'un objet**: en-tete avec statut (`StatusBadge`) + actions, puis `Tabs` ou deux colonnes (`Split`): faits a gauche, actions a droite.
6. **Formulaires**: `Form`/`FormSection`/`Field`, un formulaire par carte, bouton primaire seul en bas a droite, actions destructives via `ConfirmDialog`. Pas de `style={{}}`.
7. **Etats**: chaque ecran garde chargement, vide, erreur, refus d'acces (textes existants conserves).
8. Aucun texte ne passe sous 14px; aucune couleur ne porte seule un statut.

## 5. Validation

```
npm run typecheck
npm run lint
npx playwright test apps/admin/tests apps/broker/tests
impeccable detect --json <fichiers modifies>
```

Puis captures du rail, du dashboard, d'une liste, d'une fiche et d'un formulaire a 1440, 1024 et 390 px pour chaque app.
Hors perimetre de ce lot: theme sombre (jetons deja semantiques), refonte du modele de saisie des formulaires (champs UUID).
