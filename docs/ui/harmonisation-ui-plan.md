# Plan d'harmonisation UI AssurMatch (public, admin, courtier)

Date: 2026-09-19. Branche: `chore/agentic-speckit-supervisor`.

## 1. Constat

| Surface | Etat actuel | Problemes |
| --- | --- | --- |
| Web publique (`apps/public`) | Design system `am-*` (tokens de marque, Nunito/Inter, 20 composants) | Header deborde a 1280-1440 px (nav sur deux lignes, switcher langue empile), formulaires courtiers moins soignes que le comparateur |
| Admin (`apps/admin`) | `globals.css` 545 lignes, palette navy/teal hors marque, 5 composants (`admin-ui.tsx`) | Pas de logo, 15 entrees de menu a plat, formulaires en `style={{}}` (users, routing, scoring, quote-form, auth), tables sans tri/pagination/etat vide, aucun composant filtre |
| Courtier (`apps/broker`) | Copie de l'admin avec palette vert fonce | Memes manques ; deux CSS quasi identiques a maintenir ; badge de plan absent du shell |

Les trois applications doivent rester separees (routes, layouts, acces) mais peuvent partager un design system (constitution, section "Separation des applications frontend").

## 2. Principes de marque (tires du logo)

- Bleu marque `#12377f` / `#1b4fbf` / `#2e6bd6` : navigation, boutons primaires, titres.
- Vert `#43a82a` / `#2e7d1f` : validation uniquement (succes, coches, score >= 75, badge "actif"). Jamais de fond de page vert, jamais de bouton primaire vert.
- Neutres `#101828` -> `#f2f4f7`, orange `#d97706` pour sponsorise/attention, rouge `#c62828` pour les erreurs.
- Typo : Nunito 700/800 pour les titres, Inter 400-700 pour le corps. Rien sous 14 px.
- Rayons : champs 8 px, cartes 12 px, pastilles 999 px. Ombres `sm`/`md` uniquement.
- Le logo couleur sur fond clair, le logo blanc sur fond bleu marque (sidebar back-office, footer public), le symbole seul en favicon et en sidebar repliee.

## 3. Architecture cible : package partage `packages/ui`

Nouveau workspace `@assurmatch/ui` (meme mecanique que `@assurmatch/shared` : exports vers des `.ts/.tsx`, resolu par le symlink `node_modules/@assurmatch/ui`).

```
packages/ui/
  package.json              exports: ./tokens.css, ./backoffice.css, ./backoffice, ./fonts
  styles/tokens.css         source unique des tokens --am-* (le public l'importe a la place de sa copie)
  styles/backoffice.css     shell + composants back-office (remplace admin/globals.css et broker/globals.css)
  fonts.ts                  Nunito + Inter via next/font, variables --font-am-heading / --font-am-body
  backoffice/               composants React server-safe (pas de "use client" sauf mention)
    index.ts
    shell/app-shell.tsx     AppShell(brand, navigation groupee, user, topbar) -- "use client"
    shell/sidebar-nav.tsx   groupes, icones, aria-current, drawer mobile
    shell/user-menu.tsx     avatar initiales, role/plan, deconnexion (popover natif)
    shell/auth-shell.tsx    ecran auth centre avec logo
    page-header.tsx         kicker, titre, description, fil d'Ariane, actions
    card.tsx                Card + CardHeader(title, actions) + CardFooter
    kpi-card.tsx            valeur, libelle, helper, tendance, tone
    badge.tsx               Badge + StatusBadge(statut -> tone via table partagee)
    notice.tsx              Notice/StateMessage (info/success/warning/danger), role alert/status
    empty-state.tsx
    data-table.tsx          colonnes typees (align, width, sortable), tri par URL (?sort=col&dir=asc),
                            en-tete sticky, premiere colonne sticky en scroll, etat vide, pagination
                            (?page=), densite, colonne actions
    filter-bar.tsx          formulaire GET, champs recherche/select/date, auto-submit sur select
                            (progressive enhancement, "use client"), bouton Reinitialiser, compteur de filtres
    form/field.tsx          Field(label, hint, error, required) + fieldControlProps (port du public)
    form/input.tsx          Input, Select, Textarea, Checkbox, CheckboxGroup, RadioGroup, Switch
    form/form-layout.tsx    Form(grid 1/2 colonnes), FormSection(legend), FormActions
    form/action-notice.tsx  affichage uniforme d'un ActionState {status,message,token?}
    button.tsx              variants primary/secondary/tertiary/danger, size sm/md, pending, icon,
                            rendu <a> si href
    description-list.tsx    DescriptionList(items) 1/2 colonnes
    tabs.tsx                onglets pilotes par URL (?tab=) ou par href
    confirm-dialog.tsx      <dialog> natif pour actions sensibles (suspendre, reinitialiser) -- "use client"
    skeleton.tsx
    icons.tsx               jeu d'icones SVG inline (port des 18 icones publiques + dashboard, leads,
                            crm, bell, building, users, flag, sparkles, shield-check, settings, catalog,
                            route, receipt, plug, message, form, gauge, checklist, chevron, logout)
    logo.tsx                Logo(variant color/white/symbol, height) sur next/image, assets depuis /public
```

Le public garde ses composants `am-*` (couples a next-intl) mais importe `@assurmatch/ui/tokens.css` et `@assurmatch/ui/fonts` pour ne plus dupliquer tokens et polices.

Les logos (`logo-assurmatch.png`, `logo-assurmatch-white.png`, `logo-assurmatch-symbol.png`) sont copies dans `apps/admin/public/` et `apps/broker/public/` (un package ne sert pas d'assets statiques). Favicon = symbole.

## 4. Menus

### Admin (sidebar groupee, icone + libelle, section repliable)

| Groupe | Entrees (route) |
| --- | --- |
| Pilotage | Dashboard (`/`), Operations (`/operations`, sous-liens Demandes de devis `/quote-requests`, Assignations `/lead-assignments`, Prospects `/prospects`, Revue devis `/operations/quote-review`), Conformite (`/compliance`, alertes `/dashboard/compliance-alerts`) |
| Catalogue | Catalogue (`/catalog`, offres `/offers`), Formulaires devis (`/quote-form-definitions`), Scoring (`/scoring`), Routage (`/routing`) |
| Partenaires | Partenaires (`/partners`), Integrations (`/partner-integrations`), Facturation (`/billing`), Messagerie (`/messaging`) |
| Plateforme | Utilisateurs (`/users`), Feature flags (`/feature-flags`), Activation (`/activation-checklist`), Assistance IA (`/ai-assistance`) |

Topbar : bouton menu (mobile), fil d'Ariane (groupe > page), badge d'environnement local, menu utilisateur (initiales, libelle, roles, Deconnexion). Le bouton Deconnexion du bas de sidebar disparait (un seul point de sortie, dans le menu utilisateur, plus un lien secondaire dans le drawer mobile).

### Courtier

| Groupe | Entrees |
| --- | --- |
| Activite | Dashboard (`/`), Leads (`/leads`) |
| CRM | Pipeline (`/crm`), Vue tableau (`/crm/leads`) -- entrees marquees "Pro" si plan Starter (visibles, desactivees, tooltip "Disponible avec le plan Pro"), jamais de Kanban |
| Organisation | Entreprise (`/enterprise`), Equipe (`/team`) -- "Enterprise" si plan inferieur |
| Compte | Notifications (`/notifications`, compteur non lus si l'API l'expose), Compte (`/account`) |

Sidebar : logo blanc, badge de plan (Starter / Pro / Enterprise) sous la marque, nom du tenant si connu. Topbar identique a l'admin.

### Public

- Header a 64 px sur une grille `auto 1fr auto` : logo, nav centree (4 liens, libelles courts : "Comment ca marche", "Pays", "Guides", "Courtiers"), actions a droite groupees dans un `am-header__utilities` (pays compact, langue) + CTA. Point de bascule vers le menu burger remonte a 1100 px pour que rien ne passe sur deux lignes.
- Menu mobile : panneau plein ecran avec logo, liens, selecteur pays, langue, CTA pleine largeur, lien "Espace courtier".
- Footer : logo blanc, colonnes existantes, ligne legale.
- Pages `brokers/*` et formulaires (`contact-form`, `partner-application-form`, `waitlist-form`) alignes sur `Field` + `am-button` ; verifier que tout champ a label, hint, erreur cablee.

## 5. Matrice de migration des ecrans

Chaque page back-office passe sur : `PageHeader` (avec fil d'Ariane) -> `Notice` pour les etats -> `Card`/`KpiCard` -> `FilterBar` + `DataTable` pour les listes -> `Form*` + `Field` pour la saisie -> `DescriptionList` pour les fiches. Zero `style={{}}` a l'arrivee (verifie par grep).

Admin (28 fichiers) : `page.tsx` racine, `dashboard`, `dashboard/compliance-alerts`, `operations`, `operations/quote-review`, `quote-requests` (+ detail), `lead-assignments`, `prospects`, `compliance`, `catalog`, `offers`, `quote-form-definitions` (+ `quote-form-forms.tsx`), `scoring` (+ `scoring-forms.tsx`), `routing` (+ `routing-forms.tsx`), `partners`, `partner-integrations`, `billing`, `messaging`, `users` (+ `users/[userId]`, `user-action-forms.tsx`), `feature-flags`, `activation-checklist`, `ai-assistance`, `login` (+ `dev-account-picker.tsx`), `mfa`, `activate`, `password-change`, `password-reset`, `auth-flow-form.tsx`.

Courtier (17 fichiers) : `page.tsx`, `leads` (+ detail), `crm`, `crm/leads` (+ detail, `lead-ai-panel.tsx`), `notifications`, `enterprise`, `team`, `account`, `login` (+ `dev-account-picker.tsx`), `mfa`, `activate`, `password-change`, `password-reset`, `auth-flow-form.tsx`.

Public : `site-header.tsx`, `mobile-menu.tsx`, `site-footer.tsx`, `components.css` (header/footer/menu), `brokers/*`, `components/forms/*`, `components/brokers/*`.

Les textes metier, libelles reglementaires, `aria-label`, `data-*` de test et le vocabulaire des statuts ne changent pas. Les `DataTable` gardent les memes colonnes ; le tri et la pagination sont ajoutes sans retirer d'information.

## 6. Vagues et delegation

| Vague | Agent (modele) | Perimetre (fichiers en ecriture) | Depend de |
| --- | --- | --- | --- |
| 0 Fondation | `ui_foundation` (Opus 5) | `packages/ui/**`, `apps/admin/public/**`, `apps/broker/public/**`, `apps/public/app/styles/tokens.css` (reduit a un import), `apps/public/app/fonts.ts` (reexport) | - |
| 1a Admin | `admin_backoffice` (Opus 5) | `apps/admin/app/**` sauf `lib/admin-api.ts`, `lib/backoffice-*`, `*/actions.ts` ; `apps/admin/tests/**` | 0 |
| 1b Courtier | `broker_backoffice` (Opus 5) | `apps/broker/app/**` sauf `lib/broker-api.ts`, `lib/backoffice-*`, `lib/*-actions.ts` ; `apps/broker/tests/**` | 0 |
| 1c Public | `public_web` (Sonnet 5) | `apps/public/app/components/site/**`, `apps/public/app/components/forms/**`, `apps/public/app/components/brokers/**`, `apps/public/app/styles/components.css`, `apps/public/app/styles/brokers.css`, `apps/public/app/[locale]/brokers/**`, `apps/public/messages/**` (si libelle court), `apps/public/tests/public-site-shell.spec.ts` | 0 |
| 2 Validation | superviseur + `abracodabra:designer-ui-ux` (lecture seule) | typecheck, lint, tests statiques admin/broker, smoke public, captures des trois apps, reconciliation | 1a, 1b, 1c |

Regles : un seul proprietaire par fichier ; en vague 1 seul `admin_backoffice` peut ajouter un composant a `packages/ui` (le courtier signale les manques au superviseur). Aucun agent ne touche aux server actions, aux clients API, a l'auth, au backend ni aux contrats.

## 7. Validation

```
npm run typecheck
npm run lint
npx playwright test apps/admin/tests apps/broker/tests        # tests statiques (lecture des sources)
npx playwright test apps/public/tests/public-site-shell.spec.ts apps/public/tests/public-brokers.spec.ts
grep -rn "style={{" apps/admin/app apps/broker/app             # doit etre vide
```

Puis verification navigateur sur `http://127.0.0.1:3602` (admin), `3603` (courtier), `3601` (public) a 375, 1024 et 1440 px : menus, tableaux (tri, scroll, vide), formulaires (label/erreur/pending), focus visible, contraste.

Les tests statiques `admin-ux-polish.spec.ts` et `broker-ux-polish.spec.ts` lisent les sources et attendent certains libelles et classes (`data-admin-shell`, `Navigation admin principale`, `.admin-shell`, `@media (max-width: 760px)`, etc.). Ils sont mis a jour par l'agent de la surface concernee pour refleter la nouvelle structure sans affaiblir ce qu'ils protegent (separation admin/courtier, routes auth simplifiees, KPI, etats desactives).

## 8. Risques et garde-fous

- Separation des surfaces : `packages/ui` ne contient ni route, ni logique d'acces, ni texte specifique a une surface ; `apps/public` n'importe jamais `@assurmatch/ui/backoffice`.
- Vocabulaire reglementaire : aucun libelle "recommande", "meilleur", "garanti" ajoute ; les textes existants sont conserves.
- Regressions de tests statiques : couvertes en vague 2.
- CSS global : `backoffice.css` est prefixe `bo-` pour ne pas entrer en collision avec `am-`.

## 9. Bilan d'execution (2026-09-20)

Les vagues 0, 1a, 1b, 1c et 2 sont livrees sur la branche `chore/agentic-speckit-supervisor` (non committe).

- `packages/ui` : tokens, polices, `backoffice.css` (prefixe `bo-`), 45 composants/exports. Les deux `globals.css` back-office sont supprimes.
- Admin : 28 fichiers migres, menu en 4 groupes, tables triables/paginees (users, partners, billing), `FilterBar`, `Tabs`, `ConfirmDialog` sur les actions sensibles.
- Courtier : 17 fichiers migres, menu en 4 groupes avec badge de plan et entrees CRM desactivees en Starter, tables triables/paginees sur `/leads` et `/crm/leads`.
- Public : header sur une ligne de 1024 a 1440 px, switcher FR/EN compact, menu mobile avec logo, pays, langue, CTA et lien "Espace courtier".
- Reconciliation (vague 2) : le fil d'Ariane vit dans l'en-tete de page (la topbar n'affiche que le titre courant sous 900 px) ; l'utilisateur n'apparait que dans le menu de la topbar ; `findActive` prefere la correspondance la plus longue ; les middlewares admin/courtier laissent passer les fichiers logo et le favicon ; barre de filtres et tableau ne doublent plus le cadre d'une carte ; les liens "Retour" des fiches lead sont dans les actions de l'en-tete.
- Validation : typecheck et lint propres, `npx playwright test` = 131 reussis, 11 ignores (tests conditionnes par des variables d'environnement de smoke), zero `style={{}}` dans les back-offices, controle navigateur des trois apps a 375 et 1440 px.
- Reste a faire : supprimer le bloc "Legacy aliases" de `backoffice.css` apres une derniere relecture ; ajouter un `exact` sur `NavItem` si un autre cas de prefixe apparait ; passer les pages stubs admin (quote-requests, lead-assignments, prospects, offers) en `DataTable` quand elles auront une source de donnees.
