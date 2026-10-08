---
name: AssurMatch Back-offices (admin and courtier)
description: A dark spectrogram on a viewing box. Charcoal continuum, bone legends, and colour only as thin emission lines whose form carries state. One system for admin (cyan) and courtier (violet).
colors:
  ground: "#141517"
  surface: "#1d1f22"
  surface-2: "#191b1e"
  rail: "#101113"
  inset: "#0f1012"
  hover: "#272a2e"
  line: "#34373c"
  line-strong: "#4d5157"
  control-line: "#82868d"
  ink: "#e8e5da"
  ink-2: "#c4c1b6"
  ink-3: "#a6a395"
  accent-admin-cyan: "#56d3e6"
  accent-broker-violet: "#b79cf2"
  success: "#78db8c"
  warning: "#ebd95f"
  danger: "#f0817a"
  info: "#8fb3ee"
typography:
  title:
    fontFamily: "Archivo, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "36px"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 114"
  section:
    fontFamily: "Archivo, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.4
    fontVariation: "'wdth' 108"
  card-title:
    fontFamily: "Archivo, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Archivo, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "'wdth' 96"
  label:
    fontFamily: "Archivo, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.08em"
    fontVariation: "'wdth' 88-90"
  stat:
    fontFamily: "Spline Sans Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "40px"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "-0.03em"
    fontFeature: "tabular-nums"
  data:
    fontFamily: "Spline Sans Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums"
rounded:
  control: "2px"
  panel: "3px"
  dialog: "4px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "#ffffff"
    textColor: "{colors.ground}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.accent-admin-cyan}"
    rounded: "{rounded.control}"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
  field:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "38px"
  nav-link:
    textColor: "{colors.ink-2}"
    height: "34px"
    padding: "6px 16px 6px 44px"
  nav-link-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    padding: "24px"
---

# Design System: AssurMatch Back-offices (admin and courtier)

## Overview

**Creative North Star: "Raie d'emission"**

A spectrogram lying on a viewing box. The ground is a charcoal continuum, the plates are slightly lighter ash, the legends are bone. Colour is not a surface here: it exists only as thin emission lines, the way a spectral line sits on a dark band. State is carried by the form of the line (solid, dashed, double, half-height, struck), so every status reads with the hue removed; the hue only repeats the form.

The system is one build for two apps. Admin and courtier share every token and component and are told apart by their lead wavelength (admin cyan, courtier violet, selected by `data-app` on the root) and by the app tag in the rail. It is dark only, dense and desk-oriented, with a 14px floor for every text. It refuses the default back-office: light grey panels, pastel status pills, a card grid of KPIs.

This replaces the earlier light "standard SaaS" back-office entirely. It is a replacement world, not an extension of it.

**Key Characteristics:**
- Charcoal ground, ash plates, bone ink; no colour fills anywhere except the primary action's bone plate.
- State grammar by line form; hue is redundancy.
- A ruler across every page and a tick rail in the navigation both express position.
- One grotesque (Archivo) at different widths; mono (Spline Sans Mono) for data.
- Square 2 to 4px corners; shadows on popovers only; native controls rendered dark.

## Colors

A cold charcoal continuum (hue 250, near-zero chroma) read through warm bone ink (hue 95), with a handful of spectral lines as the only chroma. Hex values in the frontmatter are approximations; the exact OKLCH source is in the sidecar and in the stylesheet tokens.

### Primary
- **Admin Cyan, 486nm** (`--bo-accent`, oklch(0.82 0.12 210)): the admin lead wavelength. Lights the open nav tick, the page-ruler mark, links, the focus ring, the app-tag underline, tertiary buttons, sort indicators, the checked switch.
- **Courtier Violet, 405nm** (`--bo-accent`, oklch(0.78 0.13 295), lifted for contrast): same roles in the broker app, set by `[data-app="broker"]`. Each app has exactly one lead wavelength.

### Neutral
- **Charcoal Ground** (`--bo-ground`): page background and the ruler.
- **Rail Charcoal / Inset** (`--bo-rail`, `--bo-inset`): the sidebar and topbar are darker than the ground; form fields sink below the plate.
- **Ash Plate** (`--bo-surface`, `--bo-surface-2`): cards, tables, stat strips, dialogs; the second step is for table headers, card footers, notices and disabled fields.
- **Hover Ash** (`--bo-hover`): row, nav and menu hover.
- **Hairline and Strong Hairline** (`--bo-line`, `--bo-line-strong`): 1px dividers and plate borders; the strong step is for tick marks, tabs rail, secondary button borders and popover rings.
- **Control Line** (`--bo-control-line`): the border of every input, switch and input-group; kept brighter than hairlines so fields read as controls.
- **Bone Ink** (`--bo-ink`) with two muted bones (`--bo-ink-2`, `--bo-ink-3`): primary text, secondary text, and descriptions/labels/placeholders. `ink-3` is the floor for text on plates.

### Emission lines (state)
Success green 546nm, warning sodium yellow 589nm, danger red 656nm, info blue 436nm. Each has a text-lifted colour, a `-dot` colour for marks, and `-soft`/`-line` variants used only for focus halos and borders. They colour a 3px mark, an icon or a text figure; never a fill.

### Named Rules
**The Emission Only Rule.** Hue appears as a line, a mark or an icon glyph, never as a filled surface. If you reach for a coloured background, draw a line instead.
**The Form Before Hue Rule.** Every state must be distinguishable in greyscale: solid is success, dashed is warning, double is danger (do first), half-height is info or neutral, struck is disabled. The hue repeats the form and never replaces it.
**The One Wavelength Rule.** An app has one lead wavelength (cyan or violet). Do not use it for state, and do not mix both in a screen.

## Typography

**Display / Body Font:** Archivo, variable width axis (with system-ui, Segoe UI, Arial)
**Label/Mono Font:** Spline Sans Mono (with ui-monospace, Cascadia Mono, Consolas)

**Character:** One grotesque used at different widths instead of two families: semi-wide and light where the page blooms, semi-condensed where the screen is dense. Mono carries everything that is data.

### Hierarchy
- **Title** (300, 36px, 1.1, width 114%, -0.015em; 30px under 900px): the open page title only.
- **Section** (400, 20px, width 108%): dialog and auth titles; also the attention count in mono.
- **Card title** (600, 16px): card headings, empty-state titles, topbar title.
- **Body** (400, 15px, 1.5, width 96%): default text and field values; descriptions are `ink-3`, capped at 68ch.
- **Label** (600, 14px, 0.08em, uppercase, width 88-90%): section titles, nav group titles, table headers, app tag, definition terms.
- **Stat** (mono 300, 40px, 1.1, -0.03em, tabular; 34px under 900px): headline figures.
- **Data** (mono, 14px, tabular): references, identifiers, amounts, user role, numeric cells; never wrapped mid-token.

### Named Rules
**The 14px Floor Rule.** Nothing is set below 14px; compact means narrower width, not smaller size. Form fields go to 16px on phones.
**The Mono Is Data Rule.** Mono is for figures, references and amounts only. Prose, labels and buttons stay in Archivo.
**The Width Is Hierarchy Rule.** Hierarchy comes from width and weight (wide and light up top, condensed and semibold in tables), not from adding families.

## Layout

A two-column shell: a 256px sticky rail and a main column capped at 1440px with 32px padding (24px under 1100px, 16px under 900px). Rhythm is a 4px scale (4, 8, 12, 16, 24, 32); page sections sit 24px apart, card bodies pad 16px. Pages are stacks of plates: a page header (title left, actions right), then an attention list, a stat strip, then tables and forms. The KPI grid auto-fits at 220px, the stat strip at 176px, filters at 176px; two-thirds/one-third splits collapse under 1100px.

Under 900px the rail becomes a drawer behind a scrim with a 52px topbar, the ruler sticks below it, touch targets rise to 40 to 44px, and attention rows drop their scale onto a second line. Tables scroll horizontally inside their plate and never widen the page.

### The Ruler
A 22px graduated scale is sticky across the top of every page: minor ticks every 8px, major every 64px, in hairline tones. One 2px lit tick in the lead wavelength travels along it with the scroll (scroll-driven animation where supported); elsewhere and under reduced motion it rests at the open section's position.

### Named Rules
**The Shared Scale Rule.** Quantities that compare must sit on one scale. The attention list positions each queue's line at its share of the largest queue; do not size each row independently.
**The Ruled Not Boxed Rule.** Group with hairlines and spacing; a table or filter bar inside a card inherits the card frame instead of adding a second border.

## Elevation & Depth

Flat and tonal. Depth is the step from ground to rail to plate to hover, plus 1px hairlines; plates have no shadow at rest. The only shadow in the system is the popover/dialog treatment, a dark drop shadow combined with a 1px strong-line ring, used for the user menu and dialogs. The one other box-shadow is the field focus halo (3px soft lead-wavelength ring), and the stat strip's hairline cell dividers (1px shadows used as rules).

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 10px 28px oklch(0.05 0.004 250 / 0.6), 0 0 0 1px oklch(0.43 0.008 250)`): menus and dialogs only. Scrims are charcoal at 72%.

### Named Rules
**The Popover Only Rule.** A shadow means "floats above the page". Nothing that sits in the flow gets one.

## Shapes

Square and ruled. Corners are 2px on controls, 3px on plates, 4px on dialogs and the auth panel. Round is reserved for avatars, counters (filter count) and the switch. The signature shapes are lines: 3px by 14px state marks, 1px ticks, 2px lit underlines (app tag, active tab, active nav tick). Native controls are set to dark (`color-scheme: dark`) so scrollbars, checkboxes and date pickers match; checkboxes take the lead wavelength via `accent-color`.

### The Emission Mark
The state grammar, used identically in badges, KPI labels, stat-cell dots and attention-row lines:
- **Solid** 3x14 bar: success, live, confirmed.
- **Dashed** (4px on, 2px off) bar: warning, pending, attention.
- **Double** 7px-wide pair of bars: danger, urgent, do first.
- **Half-height** 3x8 bar: info and neutral (the default when no tone is set).
- **Struck** 10x1 line with struck-through label in `ink-3`: disabled.

## Components

### Buttons
- **Shape:** 2px corners, 36px high (30px small; 44px on phones), 14px semibold at width 94%.
- **Primary:** a solid bone plate (`ink` fill, charcoal text, 16px side padding); hover goes to pure white. There is one per view.
- **Secondary:** transparent, strong-hairline border, bone text; hover fills with hover ash.
- **Tertiary:** transparent, lead-wavelength text.
- **Danger:** the build carries a solid red plate with white text for destructive actions. It contradicts the Emission Only Rule and is not part of the system; new destructive actions should use the secondary button with a danger-coloured label until it is resolved.
- **Focus / disabled:** 2px lead-wavelength outline with 2px offset; disabled is 45% opacity, not-allowed.

### Cards / Containers
Ash plate, 1px hairline, 3px corners. Header 52px minimum with a hairline underneath, 16px body padding, footer on `surface-2` with right-aligned actions. Muted variant uses `surface-2`.

### Inputs / Fields
Inset charcoal field, 1px control-line border, 2px corners, 38px high, 15px text. Hover brightens the border to `ink-2`; focus switches to the lead wavelength with a 3px soft halo; invalid uses the danger border and a danger-soft halo with a semibold error message beneath. Selects are custom-chevroned (drawn in a literal bone-grey), switches fill with the lead wavelength when on.

### Navigation
A tick rail. Every entry owns a hairline tick at the left edge of the rail, shortened to 30% of its width; hover lengthens it to 55%; the open entry extends its tick to full length at 2px in the lead wavelength, sits on an ash plate, and colours its icon. Group titles are uppercase labels at width 88%. Sub-links indent to 72px; the active sub-link takes the accent ink. Disabled entries have a dashed tick and 60% opacity. Entries are 34px high (40px on phones).

### Attention List
The signature view of "what needs doing". Each row: label and helper left, a 28px graduated scale in the middle with a state line positioned at the queue's share of the largest queue, the count in mono at the right, then a lead-wavelength "go" link whose pseudo-element makes the whole row clickable. Info/neutral rows use the half-height line. Rows fill the card edge to edge and hairline-separate.

### Stat Strip
One plate holding several figures (mono 40px light) with a state mark beside each label, cells separated by hairlines, and an overlay link per cell. Prefer this to a grid of separate KPI cards.

### Badge
No fill and no border: an emission mark followed by the label (14px, width 94%, medium). Disabled is struck.

### Notice
An ash-2 plate with a strong hairline on every tone; the tone appears only on the leading icon colour. Title semibold.

### Tables
Plate with 1px hairline. Header row on `surface-2`, uppercase label type, sticky; body at 14px, width 92%, tabular figures, 12px row padding, hover ash on rows; numeric cells in mono and right-aligned; optional dense and sticky-first-column modes; sort icon turns lead wavelength when active. Row actions are native details/summary disclosures styled as quiet 30px buttons.

### Tabs, Dialog, Empty State
Tabs: a strong hairline rail, 2px lead-wavelength underline on the active tab. Dialog: ash plate, 4px corners, popover shadow, 480px maximum, light-weight wide title. Empty state: a dashed strong-hairline box on the plate, muted copy, one action.

## Do's and Don'ts

### Do:
- **Do** express every state with the line grammar (solid, dashed, double, half-height, struck) and let the hue repeat it.
- **Do** keep the primary action a bone plate with charcoal text, one per view.
- **Do** set figures, references and amounts in Spline Sans Mono with tabular numerals; set titles light and wide, tables semi-condensed.
- **Do** keep text at 14px or above, with `ink-3` as the lowest text tone on plates.
- **Do** use hairlines (1px `line`) and the 4px spacing scale to group; keep corners at 2, 3 or 4px.
- **Do** keep native controls dark (`color-scheme: dark`) and give every interactive element the 2px lead-wavelength focus ring.
- **Do** put the ruler on every page and let the open nav entry carry the long lit tick.
- **Do** honour reduced motion: the ruler mark rests at its section position and transitions are removed.

### Don't:
- **Don't** fill a surface, pill or row with a state colour; state is never a coloured background.
- **Don't** use a border-left or border-right stripe wider than 1px as an accent; the only thick lines are the 2px underlines of the app tag, active tab and active nav tick.
- **Don't** add a kicker or eyebrow above titles (the legacy kicker class is retired and hidden).
- **Don't** add shadows to anything in the flow; shadows belong to popovers and dialogs.
- **Don't** introduce a light theme or a theme switch; the build is dark only until a light variant is specified.
- **Don't** round things (beyond 4px) other than avatars, counters and the switch.
- **Don't** add a second type family, or set prose in mono.
- **Don't** mix both lead wavelengths on one screen, or use the lead wavelength to signal state.
- **Don't** read the public site's tokens or styles; the back-office stylesheet is `bo-` scoped and self-contained.
