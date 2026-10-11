# AssurMatch public design system (`apps/public`): "Le patron"

Redesign of 2026-10-08 (branch `055-public-redesign-patron`). It replaces the 2026-10-05 "La
signalétique" system (navy sign panels, directory rows with arrow chips), which is retired, and before
it the 2026-09-20 "premium" system. The owner asked for a new visual world with more expressivity than
before, as long as the site stays credible and clear on price and consent. Anti-references:
`D:\APP\MedicProWeb` (themed costume site) and the retired signage world.

Durable record for design tooling: `apps/public/DESIGN.md` (+ `apps/public/.impeccable/design.json`).
Product truth: `apps/public/PRODUCT.md`. Direction contract: `apps/public/.impeccable/surfaces/`.
This file is the developer guide. Source: `apps/public/app/styles/*.css`, `apps/public/app/components/ui/*`.

## 0. The idea in one paragraph

A tailor's pattern. You pick the cloth first (compare), then the broker takes your measurements
(quote). Every page opens on **indigo cloth** with a pale **pattern sheet** laid on it (a dotted stitch
line inset from the edge, notches bitten out of its border); journey pages carry a yellow **measuring
tape** above the sheet that counts the steps. Lists are **pieces**: rows outlined in 2px indigo. The footer is the cloth again, hemmed with a strip of tape. Square corners,
no shadows, no gradients, one authored move (the arrow nudge).

## 1. Non-negotiables

| Rule | Why |
| --- | --- |
| **Palette law**: indigo = the cloth, structure and headings; indigo link = what you can follow; **tape yellow = the action** (primary buttons, the tape); green = confirmed or done; orange = sponsored; red = error | Colour is information. |
| **State language**: a solid line is cut (confirmed); a **dashed** 1px line is only marked (indicative / to be confirmed). The sheet's stitch is **dotted**, never dashed | "Offre indicative" and "à confirmer" are constitutional; the line says it too. |
| Sponsored = `warning-800` on `warning-50`, border/icon `warning-600`, always with the word | Constitution VIII. |
| Every text/background pair >= 4.5:1 (section 4) | WCAG 2.2 AA. |
| Nothing below 14px; tap targets >= 44px | Phones first (390px). |
| One yellow action per view: do not add a second primary button next to the page's main action | Yellow stops meaning "action" otherwise. |
| No eyebrow/kicker above a heading | `Hero`/`Section` ignore their `kicker` prop. |
| No card grids of icon + title + text as page structure; never nested cards | Use `Directory`, ruled lists, `Route`, tables. |
| No coloured `border-left/right` > 1px on cards, callouts or list items | |
| Notices are never closable | |
| Reduced motion kills everything | `base.css` keeps the single switch. |
| The page never scrolls sideways | `html, body { overflow-x: clip }`. |
| No `route.ts(x)` file under `app/` | Next treats it as an API route; the component is `route-line.tsx`. |

## 2. Tokens (`styles/tokens.css`)

The shared back-office socle `@assurmatch/ui/tokens.css` is imported and **never edited**; the public
file re-declares or extends it. Historical names keep resolving: `--am-primary-800` is now the indigo
cloth (it was the navy sign), `--am-primary-600` the indigo link colour, `--am-sign*` the cloth
surface and its inks; the gradient names hold flat colours and the glow/shadow names `none`.

- **Indigo** `--am-primary-50…900`: `600 #3730a8` links, `700 #2b2590` hover, `800 #25207a` the cloth,
  `900 #181456` the cloth in shadow.
- **Tape** `--am-tape #f2c230`, `--am-tape-deep #e3ae0e` (hover), `--am-tape-wash #fff8dc` (row hover),
  `--am-tape-ink` (indigo on yellow, 8.1:1). **Sheet** `--am-sheet #fafbff`, **cut** `--am-cut #8f89d8`.
- **Neutrals** (tinted from the indigo) `--am-neutral-0…900`; `100 #f1f1f8` is the band.
- **Green** `--am-success-*` (`700` text and solid confirmations; `500` logo only). **Orange**
  `--am-warning-*` sponsored only. **Red** `--am-danger-*` errors only.
- **Logo** `--am-logo-blue #1650b8` and `--am-logo-green #4fb832` pin the mark's own colours.
- **Semantic aliases (prefer these)**: `--am-canvas`, `--am-band`, `--am-surface`, `--am-sign`,
  `--am-sign-ink`, `--am-sign-ink-muted`, `--am-sign-rule`, `--am-rule`, `--am-border`, `--am-text`,
  `--am-text-muted`, `--am-text-subtle`, `--am-heading`, `--am-link`, `--am-link-hover`, `--am-action`.
- **Radii**: 2px almost everywhere (`xs`…`field`, `card`), 4px `xl`/`panel`, `pill` for dots only.
- **Elevation**: none on the page. `--am-shadow-overlay` for things that float (drawer, compare bar).
- **Type**: two faces, `app/fonts.ts`. **Bricolage Grotesque** (`--font-am-display`, behind
  `--am-font-heading`) sets headings, row titles and large figures at 750-800. **Atkinson Hyperlegible
  Next** (`--font-am-sign`, behind `--am-font-body`) sets every sentence at 400 / 700 / 800.
  Fluid sizes `--am-display-size … --am-caption-size` (14px floor).
- **Layout**: `--am-content 1180`, `--am-content-wide 1280`, `--am-content-narrow 740`,
  `--am-gutter` 16/24/32, `--am-header` 56/68, `--am-row 64px`, `--am-tile` 44/48.
- **Motion**: durations 100-320ms. Used for state changes only.
- **Drawn assets** (custom properties in `components.css`): `--am-tape-ticks` (ruler ticks),
  `--am-notch-left/right/top/bottom` (12x20 triangles in the cloth colour), `--am-cloth-weave` (a
  tone-on-tone lattice, 5% white, never behind body text).

### On the cloth

`.am-sign`, `.am-hero`, `Section tone="navy"` and `Card tone="navy"` remap the text tokens to the
cloth inks and switch the **button variables** (`--am-btn-primary-*`, `--am-btn-secondary-*`,
`--am-btn-ghost-*`) so the same markup is right everywhere. The pattern sheet (`.am-hero__sheet`) and the
plates placed on the cloth (`Card`, `Notice`, `.am-entry`, fields, empty states, tables) reset to the
light-page tokens, including `--am-sign-ink*`, so page CSS written for "the sign" stays legible on the
sheet. Focus rings on the cloth are tape yellow.

## 3. Components

All in `app/components/ui/`, exported from `components/ui/index.ts`.

| Component | Role |
| --- | --- |
| `Hero` | The page opening: cloth, then the sheet with title, lead and what the page needs. `breadcrumb` = the location line on the cloth; `route` = the journey tape (it replaces the breadcrumb on screen; the breadcrumb stays for AT and JSON-LD). `kicker`, `tone` ignored. `size` sm/md/lg. |
| `Section` | White, `muted` (band), `brand` (primary-50), `navy` (cloth). `kicker` ignored. |
| `Directory` | Pieces: rows with a 2px indigo outline and a numbered indigo tag on the top-right corner (CSS counter, decorative), tile (pictogram, icon or free), title, one line, aside, arrow that nudges 4px on hover/focus. `columns={2}`. `surface="plate"` is now identical to the default. |
| `Route` (`route-line.tsx`) | Numbered stops joined by a yellow tape; vertical on phones, a row from 900px. Tags are indigo squares with yellow numerals; `state: "confirm"` makes the tag green. |
| `RouteStrip` (`route-line.tsx`) | The measuring tape of journey pages: Pays, Produit, Offres, Demande, Courtier; current stop printed in reverse, done stops link back. Also on the home page, with `current="start"` (no stop reversed yet). Messages: `Route` namespace. Fed by `JourneyRoute`. |
| `Pictogram`, `productPictogram()` | Flat product pictograms; `tile` = indigo tile with yellow planes. Stroke icons (`Icon`) stay for interface glyphs. |
| `Logo` | Flat SVG mark (umbrella, shield, person) in its own blue/green + wordmark set in type, `variant="white"` on the cloth. |
| `Button` | Primary tape yellow with indigo ink and a 2px indigo border; secondary white with indigo outline; tertiary underlined link; ghost; whatsapp. 40/48/56px. |
| `EntrySelector` | Country + product GET form; `emphasis="secondary"` when the page already has its main action. |
| `Card` | A plain bordered panel for one real object. `muted`, `brand`, `navy`, `outline`, `dashed` (indicative), `featured`, `interactive`. No shadow. |
| `Notice` | `indicative` = white with dashed indigo outline; `info`; `success`; `error`. |
| `Badge` | Rectangular label: `approved` solid green, `sponsored` orange, `pilot` dashed, `new`, `soon`. |
| `ScorePill` | Outlined (a score is indicative). |
| `Field`, `RadioCards`, `.am-checkline`, `.am-switch` | 48px controls, 1px `neutral-500` border, indigo focus. |
| `ProgressBar` | Form steps as square tags joined by yellow tape once taken; labels collapse to the current one under 480px. |
| `EmptyState` | Dashed outline: nothing confirmed here yet. |
| `.am-faq`, `.am-table`, `Stat` | Ruled accordion; indigo 2px header rule; plain figure. |
| `.am-tape` | A standalone yellow band with ruler ticks (the footer hem). |
| `Reveal`, `CountUp` | Inert: they render their content as is. New code should not use them. |

## 4. Measured contrast pairs

| Pair | Ratio |
| --- | --- |
| White on the cloth `#25207a` | 13.4:1 |
| `--am-sign-ink-muted #cfcdf2` on the cloth | 8.4:1 |
| Cloth indigo on tape yellow `#f2c230` | 8.1:1 |
| Tape yellow on the cloth (tile glyphs, current stop) | 8.1:1 |
| Link indigo `#3730a8` on white | 9.7:1 |
| Text `#14132a` on white | 17.9:1 |
| Muted `#4f4e69` on white | 7.4:1 |
| Subtle `#646380` on white / on band | 5.8:1 / 5.2:1 |
| White on `success-700` (approved badge) | 5.4:1 |
| `warning-800` on `warning-50` (sponsored) | 6.8:1 |
| `danger-700` on `danger-50` | 8.2:1 |
| WhatsApp ink on WhatsApp green | 7.1:1 |

The dotted stitch `#8f89d8` and the ruler ticks are decoration only.

## 5. Stylesheet order (`app/globals.css`)

`tokens` → `base` → `motion` → `components` → `chrome`. Page sheets (`styles/pages/home.css`,
`journey.css`, `institutional.css`, `quote.css`, `styles/brokers.css`) are imported by their page or
layout module, after everything above.

## 6. Do / don't

**Do**: open every page on a `Hero` with its breadcrumb or tape · use `Directory` for any list of
destinations · use `Route` for any sequence the visitor goes through · keep `Notice
tone="indicative"` wherever prices are shown · put every number in `.am-tabular` · keep one yellow action
per view.

**Don't**: no gradient, glow, glass, shadow on page content · no eyebrow · no green that is not a
confirmation, no orange that is not a sponsorship · no dashed line that is not indicative · no font size
under 14px · no raw hex outside `tokens.css` (and the drawn-asset SVG data URIs in `components.css`) ·
don't edit `packages/ui/styles/tokens.css` · don't duplicate a primitive's CSS in a page sheet: add a
modifier to `components.css` instead.
