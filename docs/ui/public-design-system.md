# AssurMatch public design system (`apps/public`): "La signalétique"

Redesign of 2026-10-05 (branch `051-public-redesign-plain`). It replaces the 2026-09-20 "premium"
system (gradients, glows, scroll reveals, count-ups), which is retired. The owner's brief was a
complete redesign that is *not fancy*; the anti-reference is a heavily themed site. The chosen
direction is a wayfinding sign system.

Durable record for design tooling: `apps/public/DESIGN.md` (+ `apps/public/.impeccable/design.json`).
Product truth: `apps/public/PRODUCT.md`. Direction contract: `apps/public/.impeccable/surfaces/`.
This file is the developer guide. Source: `apps/public/app/styles/*.css`, `apps/public/app/components/ui/*`.

## 0. The idea in one paragraph

Every page opens on a **navy sign** that says where you are (the `Hero`). Every list is a
**directory** of rows you walk (`Directory`). Journeys are **routes** with numbered stops (`Route`,
`RouteStrip`). Every price says who confirms it. White ground, pale cool-grey bands, 1px rules,
4px corners, one typeface. No shadows on the page, no gradients, no glass, no entrance animation.

## 1. Non-negotiables

| Rule | Why |
| --- | --- |
| **Palette law**: navy = where you are; blue = what you can do; green = confirmed or done; orange = sponsored; red = error | Colour is information. A colour used for decoration stops meaning anything. |
| **State language**: solid fill = confirmed; dashed 1px outline = indicative / to be confirmed | "Offre indicative" and "à confirmer" are constitutional; the line says it too. |
| Sponsored = `warning-800` on `warning-50`, border/icon `warning-600`, always with the word | Constitution VIII: sponsorship clearly indicated. |
| Every text/background pair >= 4.5:1 (measured in section 4) | WCAG 2.2 AA. |
| Nothing below 14px; tap targets >= 44px | Phones first (390px). |
| No eyebrow/kicker above a heading | `Hero`/`Section` ignore their `kicker` prop now. |
| No card grids of icon + title + text as page structure; never nested cards | Use `Directory`, ruled lists, `Route`, tables. |
| No coloured `border-left/right` > 1px on cards, callouts or list items | |
| Notices are never closable | Unchanged. |
| Reduced motion kills everything | `base.css` keeps the single switch. |
| The page never scrolls sideways | `html, body { overflow-x: clip }`. |
| No `route.ts(x)` file under `app/` | Next treats it as an API route; the route component is `route-line.tsx`. |

## 2. Tokens (`styles/tokens.css`)

The shared back-office socle `@assurmatch/ui/tokens.css` is imported and **never edited**; the public
file re-declares or extends it. Historical names keep resolving: the gradient names now hold flat
colours and the glow/shadow names `none`, so a page written before the redesign renders flat.

- **Navy/blue** `--am-primary-50…900`: `600 #1650b8` action blue, `700 #123e86` action hover,
  `800 #0b2a5c` sign navy, `900 #071c40`.
- **Neutrals** (cool, tinted from the navy) `--am-neutral-0…900`; `100 #eef1f4` is the band.
- **Green** `--am-success-*`: `700 #237a35` text and solid confirmations; `500 #4fb832` logo only.
- **Orange** `--am-warning-*` sponsored only. **Red** `--am-danger-*` errors only.
- **Semantic aliases (prefer these)**: `--am-canvas` (white), `--am-band`, `--am-surface`,
  `--am-sign`, `--am-sign-ink`, `--am-sign-ink-muted`, `--am-sign-rule`, `--am-rule`, `--am-border`,
  `--am-border-strong`, `--am-text`, `--am-text-muted`, `--am-text-subtle`, `--am-heading`,
  `--am-link`, `--am-link-hover`, `--am-action`, `--am-action-hover`.
- **Radii**: 2px (`xs`), 4px (`sm`, `md`, `lg`, `field`, `card`), 6px (`xl`, `panel`), `pill` for dots.
- **Elevation**: none on the page. `--am-shadow-overlay` for things that float (drawer, compare bar).
- **Type**: one family, **Atkinson Hyperlegible Next** (`app/fonts.ts`, variable, exposed as
  `--font-am-sign` behind `--am-font-heading` and `--am-font-body`). Weights 400 / 700 / 800.
  Fluid sizes `--am-display-size … --am-caption-size` (14px floor).
- **Layout**: `--am-content 1180`, `--am-content-wide 1280`, `--am-content-narrow 740`,
  `--am-gutter` 16/24/32, `--am-header` 60/68, `--am-row 64px` (directory row), `--am-tile` 44/48.
- **Motion**: durations 100-320ms, `--am-ease-out` exponential. Used for state changes only.

### Inside a navy panel

`.am-sign`, `.am-hero`, `Section tone="navy"` and `Card tone="navy"` remap the text tokens to the
sign inks. Plates placed on a sign (`Card`, `Notice`, `.am-entry`, `Directory surface="plate"`,
fields, empty states, tables) automatically get the light-page tokens back. Buttons on a sign invert
(primary = white fill, navy text; secondary = white outline). Focus rings on navy are yellow
`#ffd75e` (10:1).

## 3. Components

All in `app/components/ui/`, exported from `components/ui/index.ts`.

| Component | Role in the sign system |
| --- | --- |
| `Hero` | The page sign. `breadcrumb` = the location line; `route` = the journey strip (it replaces the breadcrumb on screen; the breadcrumb stays for AT and JSON-LD). `kicker`, `tone` ignored. `size` sm/md/lg. |
| `Section` | White, `muted` (band), `brand` (primary-50), `navy` (a sign). Two white sections in a row share a 1px rule. `kicker` ignored. |
| `Directory` *(new)* | Rows of destinations: tile (pictogram, icon or free), title, one line, aside, arrow that nudges 4px on hover/focus. `columns={2}`, `surface="plate"`. The list component of the site. |
| `Route` *(new, `route-line.tsx`)* | Numbered stops on a 4px navy line; vertical on phones, a row from 900px. `state: "confirm"` paints the stop green (the broker confirms). |
| `RouteStrip` *(new, `route-line.tsx`)* | « Vous êtes ici » on journey signs: Pays, Produit, Offres, Demande, Courtier. Done stops link back. Messages: `Route` namespace. |
| `Pictogram`, `productPictogram()` *(new)* | Flat product pictograms (auto, moto, santé, habitation, voyage, vie, generic), `tile` = navy tile. Stroke icons (`Icon`) stay for interface glyphs. |
| `Logo` | Flat SVG mark (umbrella, shield, person) + wordmark set in type, `variant="white"` on navy. The retired tagline is gone. The PNG logos in `public/` remain for e-mails. |
| `Button` | Primary solid blue, secondary blue outline (2px), tertiary underlined link, ghost, whatsapp. 40/48/56px. |
| `Card` | A plain bordered panel for one real object. `muted`, `brand`, `navy`, `outline`, `dashed` (indicative), `featured` (2px navy), `interactive`. No shadow. |
| `Notice` | `indicative` = white with dashed navy outline; `info` = primary-50; `success`; `error`. |
| `Badge` | Rectangular label: `approved` solid green, `sponsored` orange, `pilot` dashed, `new`, `soon`, `neutral`. |
| `ScorePill` | Outlined (a score is indicative): green outline >= 75, blue >= 50, grey below. |
| `Field`, `RadioCards`, `.am-checkline`, `.am-switch` | 48px controls, 1px `neutral-500` border (5.5:1), blue focus. |
| `ProgressBar` | Form steps as route stops; labels collapse to the current one under 480px. |
| `EmptyState` | Dashed outline: nothing confirmed here yet. |
| `.am-faq` | Ruled accordion with a plus/minus. |
| `.am-table` | Navy 2px header rule, scroll-shadow hints. |
| `Stat` | A plain figure (icon hidden). Prefer a figures line (see the home page) to a row of metric cards. |
| `Reveal`, `CountUp` | Inert since the redesign: they render their content as is. New code should not use them. |

## 4. Measured contrast pairs

| Pair | Ratio |
| --- | --- |
| White on sign navy `#0b2a5c` | 14.0:1 |
| `--am-sign-ink-muted #c7d3ea` on navy | 9.3:1 |
| Action blue `#1650b8` on white (and white on it) | 7.3:1 |
| Text `#12161d` on white | 18.1:1 |
| Muted `#4e5868` on white / on band | 7.2:1 / 6.3:1 |
| Subtle `#5f6a7c` on white / on band (also input borders) | 5.5:1 / 4.8:1 |
| White on `success-700` (approved badge) | 5.4:1 |
| `success-700` on `success-50` | 4.9:1 |
| `warning-800` on `warning-50` (sponsored) | 6.8:1 |
| `danger-700` on `danger-50` | 8.2:1 |
| Navy on primary-50 (info notice, row hover) | 12.8:1 |
| Focus yellow `#ffd75e` on navy | 10.1:1 |
| WhatsApp ink on WhatsApp green | 7.1:1 |

## 5. Stylesheet order (`app/globals.css`)

`tokens` → `base` → `motion` → `components` → `chrome`. Page sheets (`styles/pages/home.css`,
`journey.css`, `institutional.css`, `quote.css`, `styles/brokers.css`) are imported by their page or
layout module, after everything above.

## 6. Do / don't

**Do**: open every page on a `Hero` with its breadcrumb · use `Directory` for any list of
destinations · use `Route` for any sequence the visitor goes through · keep `Notice
tone="indicative"` wherever prices are shown · put every number in `.am-tabular` · keep one primary
action per page.

**Don't**: no gradient, glow, glass, shadow on page content · no eyebrow · no green that is not a
confirmation, no orange that is not a sponsorship · no font size under 14px · no raw hex outside
`tokens.css` · don't edit `packages/ui/styles/tokens.css` · don't duplicate a primitive's CSS in a page
sheet: add a modifier to `components.css` instead.
