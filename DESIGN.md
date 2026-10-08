---
name: AssurMatch Back-offices (admin and courtier)
description: One calm, hairline-ruled SaaS back-office system, shared by the admin and broker apps, with one action accent per app (azure, plum).
colors:
  ground: "#f6f7f9"
  surface: "#ffffff"
  surface-2: "#f9fafb"
  rail: "#f3f4f6"
  hover: "#eff0f3"
  line: "#e3e5e8"
  line-strong: "#cbced3"
  ink: "#16181d"
  ink-2: "#4a4e57"
  ink-3: "#666b75"
  accent-azure: "#2f5fe0"
  accent-azure-hover: "#1f48c4"
  accent-azure-soft: "#eef2fd"
  accent-azure-line: "#bccbf5"
  accent-azure-ink: "#2140a8"
  accent-plum: "#a8337f"
  accent-plum-hover: "#8c2468"
  accent-plum-soft: "#fcf0f6"
  accent-plum-line: "#efbfd9"
  accent-plum-ink: "#7d2160"
  success: "#1d6a35"
  success-soft: "#ebf8ee"
  success-line: "#b9e0c3"
  success-dot: "#3ba75a"
  warning: "#7a4e0a"
  warning-soft: "#fdf5dc"
  warning-line: "#f0dc9a"
  warning-dot: "#e0a21a"
  danger: "#a82a22"
  danger-soft: "#fcebe9"
  danger-line: "#f0bfba"
  danger-dot: "#dc3a2f"
  info: "#1a5a80"
  info-soft: "#eef6fb"
  info-line: "#bfdcec"
  info-dot: "#2a8ac0"
typography:
  title:
    fontFamily: "Geist, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "32px"
    letterSpacing: "-0.02em"
  section:
    fontFamily: "Geist, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.011em"
  card:
    fontFamily: "Geist, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "-0.011em"
  stat:
    fontFamily: "Geist, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  body:
    fontFamily: "Geist, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
  data-ref:
    fontFamily: "Geist Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "0.93em"
    fontWeight: 400
    letterSpacing: "-0.01em"
rounded:
  control: "6px"
  panel: "8px"
  dialog: "12px"
  pill: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  sidebar: "248px"
  topbar: "52px"
  content-max: "1360px"
components:
  button-primary:
    backgroundColor: "{colors.accent-azure}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-azure-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "16px"
  stat-strip:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "16px"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.control}"
    height: "24px"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.control}"
    height: "24px"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    height: "24px"
  badge-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    rounded: "{rounded.control}"
    height: "24px"
  notice-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "12px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "38px"
  nav-link:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    height: "34px"
  nav-link-current:
    backgroundColor: "{colors.accent-azure-soft}"
    textColor: "{colors.accent-azure-ink}"
  table-header:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-3}"
    padding: "10px 16px"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.dialog}"
    padding: "24px"
---

# Design System: AssurMatch Back-offices

Scope: `apps/admin` and `apps/broker`, styled by `packages/ui/styles/backoffice.css` (all classes `bo-` prefixed) with components in `packages/ui/backoffice`. The public site (`apps/public`) has its own DESIGN.md and shares nothing with this one. Color values in the front matter are hex approximations of the shipped OKLCH source; the OKLCH canonicals are in `.impeccable/design.json`.

## Overview

**Creative North Star: "The Well-Kept Ledger"**

This is the category standard played straight: a refined, familiar SaaS back-office at the level of Linear, Stripe Dashboard, HubSpot and Vercel. There is no concept and no costume. One cool, almost chroma-less neutral surface carries everything; structure comes from 1px hairlines, not from boxes, shadows or fills; one action colour per app does the pointing. Operators read tables for hours, so the system is dense but calm, and every screen leads with what needs doing, then with the numbers.

Admin and broker are two rooms in one building. They share every token, component and status colour, and differ only by accent: admin is azure, broker is plum. The accent is switched by `data-app="admin"` or `data-app="broker"` on the root element and never changes a status colour.

Confirmed rejections: no borrowing from the public site's "Le patron" world (indigo cloth, yellow tape, cut-paper devices, display face); no themed or concept-piece look (the MedicProWeb anti-reference).

**Key Characteristics:**
- Cool neutral ground, white panels, 1px hairline structure, no decorative shadow.
- One accent per app, spent only on primary action, current navigation, links, focus and sort state.
- Shared status palette; a state always carries a label and a dot, never colour alone.
- Geist for everything readable, Geist Mono for references and identifiers.
- Nothing below 14px; 15px body.

## Colors

A near-monochrome cool grey system with a single saturated accent per app and four semantic status hues that are identical in both apps.

### Primary
- **Admin Azure** (accent-azure, #2f5fe0 approx): primary buttons, current nav entry (on soft azure with the darker ink), links, focus ring, switch on-state, selected tab underline, avatar. Hover darkens to accent-azure-hover; soft/line/ink variants fill current-nav, scope tag, selection and filter-count chips.
- **Broker Plum** (accent-plum, #a8337f approx): the same roles inside `[data-app="broker"]`, via the same five variables (accent, hover, soft, line, ink). This is what keeps the broker space unmistakable from the admin.

### Neutral
- **Ground** (#f6f7f9 approx): page background behind panels.
- **Surface** (#ffffff): cards, tables, inputs, dialogs, menus, topbar.
- **Surface 2** (#f9fafb): table header, card footer, muted card, row hover, input-group affixes.
- **Rail** (#f3f4f6 approx): the sidebar background.
- **Hover** (#eff0f3 approx): hover fill for nav links, menu items, secondary and tertiary buttons.
- **Line** (#e3e5e8 approx): every hairline: panel borders, row dividers, header rules.
- **Line Strong** (#cbced3 approx): control borders, dashed empty-state border, switch-off track, neutral dots.
- **Ink** (#16181d approx): primary text. **Ink 2** (#4a4e57): nav labels, secondary text. **Ink 3** (#666b75): descriptions, helpers, table headers, placeholders; the lightest text colour allowed on white.

### Status (shared by both apps)
Each status has four steps: text colour, soft fill, line, and a brighter dot. Success green = validated or confirmed; warning amber = sponsored or caution; danger red = error or blocked; info blue-teal = informational. A disabled or unavailable state is a dashed outline, transparent, with a hollow dot.

### Named Rules
**The One Accent Rule.** Each app has exactly one accent hue. It is never used to express status, and status hues are never used for action.
**The Label-With-Colour Rule.** A status is never colour alone: badges carry a dot plus text, stat cells carry a dot plus label, attention rows carry a dot plus label and count.
**The Same State, Same Look Rule.** A status tone looks identical in admin and broker; only the accent differs.

## Typography

**Display Font:** none; headings use the same face as the UI.
**Body Font:** Geist (with system-ui, Segoe UI, Arial), loaded through `packages/ui/backoffice-fonts.ts`, with stylistic sets `cv11` and `ss01` on.
**Label/Mono Font:** Geist Mono (with ui-monospace, Cascadia Mono, Consolas), reserved for references, identifiers and amounts.

**Character:** One workhorse sans carries headings, labels and data, set tight on headings and tabular on numbers. The mono face marks anything copyable as data.

### Hierarchy
- **Title** (600, 24px, 32px line, -0.02em): page title, one per page.
- **Section** (600, 20px, 28px line): dialog and auth titles, attention-row counts.
- **Card title** (600, 16px, 24px line): card, empty-state, topbar titles.
- **Stat** (600, 28px, 1.15 line, -0.02em, tabular figures): headline figures in the stat strip and KPI.
- **Body** (400, 15px, 1.5 line): default text, page descriptions (max 68ch), form values, definition values.
- **Label** (500 to 600, 14px): nav, buttons (600), table cells and headers (500), badges, helpers, breadcrumb, field labels (600).
- **Reference** (mono, 0.93em, -0.01em): `bo-ref` identifiers, never wrapped mid-token unless the wrap variant is applied.

### Named Rules
**The Fourteen Floor Rule.** No text under 14px anywhere; 14px is the label and helper size and 15px the reading size. On phones (<= 760px) form controls go to 16px.
**The Tabular Numbers Rule.** Every figure in a table, stat or count uses tabular numerals.
**The Mono Is Data Rule.** Geist Mono is only for references, identifiers and amounts, not for decoration.

## Layout

Shell is a two-column grid: a 248px sticky rail (grouped navigation, account menu in the footer) and a fluid main column. Content is centred, max 1360px, padded 32px (24px under 1100px, 16px under 900px). Pages are a vertical grid with 24px gaps; groups of panels use 16px gaps. Spacing scale is 4, 8, 12, 16, 24, 32.

A page is: breadcrumb, title with optional description and actions, then the "A traiter" attention card, a stat strip, then recent-work cards in a two-column grid. Split layouts are 2fr/1fr. Metric grids are auto-fit with 176 to 220px minimums.

Responsive: at 900px the rail becomes a slide-in drawer with a scrim, and a 52px topbar (menu button, title) appears; two-column grids collapse; at 760px stat strips go two columns, attention rows drop the "go" link, tables stop wrapping and scroll horizontally inside their wrapper, buttons and controls grow to 44px tall. Must work at 1024px without horizontal page scroll; the broker space must be usable at phone width.

Authentication screens render outside the shell: a centred 432px panel on the ground colour.

## Elevation & Depth

Flat. Depth is conveyed by a white panel on a grey ground plus 1px hairlines, and by tonal fills on hover. There are no card shadows. The only shadows are on floating layers.

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 8px 24px oklch(0.2 0.012 260 / 0.14), 0 1px 3px oklch(0.2 0.012 260 / 0.1)`): the account menu and the confirm dialog only. Dialog backdrop and mobile scrim are ink at 45% opacity.
- **Focus halo** (`0 0 0 3px` in the accent soft colour, danger soft when invalid): input focus ring, alongside the 1px accent border. Global focus-visible is a 2px accent outline with 2px offset.

### Named Rules
**The Flat Panel Rule.** Panels, tables, stat strips, notices and badges carry no shadow. The stat strip's cell dividers are drawn with a 1px inset line, which is a hairline, not elevation.

## Shapes

Small, quiet radii. Controls (buttons, inputs, badges, nav links, menu items) are 6px; panels (cards, tables, notices, stat strip, filters, menus) are 8px; dialogs and the auth panel are 12px; dots, avatars, switches and chips are fully round. Panels are 1px bordered with line colour; the empty state is a 1px dashed line-strong border. Tables inside a card run edge to edge and take the card's frame rather than adding a second border; an attention list or stat strip alone in a card does the same.

## Components

### Shell (rail and topbar)
Rail: surface Rail colour, 1px right hairline. Top: logo, a scope tag (accent soft fill, accent line, accent ink, 24px, 600) and optional meta such as the local environment badge (warning tone). Middle: grouped navigation, group titles in 14px ink-3 medium (no uppercase, no letter-spacing). Footer: account menu button with a 30px round accent avatar, name and role; its menu opens upward as a popover. Nav link: 34px tall, 6px radius, 18px stroke icon, ink-2; hover on Hover fill; current page is accent soft fill with accent ink text, 600 weight and an accent icon. Sublinks sit under a 1px line-strong left rule. Disabled entries are dimmed to 62% with a not-allowed cursor and carry their reason. Topbar exists only under 900px.

### Buttons
- **Shape:** 6px radius, 36px tall (30px small, 44px on phones), 14px 600 text, 14px side padding.
- **Primary:** accent fill and border, white text; hover to accent-hover. **Secondary:** white, line-strong border, ink text, Hover fill on hover. **Tertiary:** transparent, ink-2. **Danger:** danger fill, darker on hover.
- **States:** 0.5px press shift, disabled 50% opacity, pending shows a 14px spinner at 75% opacity. Transitions 0.12s on the standard ease. One primary button per view region.

### StatStrip
Several headline figures in one bordered 8px panel, split by hairlines, replacing a wall of equal KPI boxes. Each cell: 8px status dot plus 14px ink-3 label, a 28px tabular value, an optional helper. A cell with an href becomes one whole-cell link with a surface-2 hover. Auto-fit columns of 176px minimum.

### AttentionList
"What needs doing now", placed inside a card titled "A traiter", rows edge to edge with hairlines. Each row: status dot, 15px 600 label with 14px helper, a 20px tabular count, and an accent "go" link; the whole row is clickable and takes a surface-2 hover. Min height 56px. An all-quiet state is a plain text row.

### DataTable
Sticky 14px header on Surface 2 with ink-3 500 text, 10px/16px padding; body cells 12px/16px, tabular numerals, hairline row dividers, row hover on Surface 2, middle aligned. Right/center alignment by attribute; dense variant; optional sticky first column; sort control shows a 14px chevron that turns accent when active. Wrapper scrolls horizontally. Empty state shows a centred message with optional description; footer carries count and pagination. References use the mono `bo-ref`. Row actions use a quiet native details/summary button that turns accent soft when open.

### Badge
24px tall, 6px radius, 1px border, 14px 500 text, always preceded by a 6px status dot. Tones: neutral (surface-2, line), success, warning, danger, info (soft fill, line, text colour, bright dot), disabled (dashed, transparent, hollow dot). Text may wrap rather than overflow.

### Notice
8px panel with 1px border, 14px text, a leading 2px-offset icon and a 600 title; tones info, success, warning, danger use the soft fill and line with the strong colour on the icon only. Default is surface-2 with a line border. Text stays ink.

### Forms
Fields are stacked: 14px 600 label, optional hint in ink-3, control, then error in danger 600. Controls are 38px, 6px radius, line-strong border, 15px text; hover darkens the border to ink-3; focus gives an accent border plus 3px accent-soft halo; invalid gives a danger border and danger-soft halo; disabled uses Surface 2. Textarea min 96px; select has a custom chevron. Checkboxes are 18px with the accent colour; switches are 36x20, track line-strong off and accent on. Fieldsets are 8px bordered panels. Form actions sit in a right-aligned row under a top hairline. Two-column forms from 760px.

### Cards, Filters, Tabs, Dialog, Empty state
Card: white, 1px line, 8px; header min 52px with title, optional ink-3 description and actions, hairline bottom; body 16px padding; footer on Surface 2 right-aligned. Filter bar: white 8px panel, auto-fit 176px controls, accent-soft count chip. Tabs: 14px, ink-3, a 2px accent underline and ink 600 when current. Dialog: 480px, 12px radius, 24px padding, popover shadow, ink backdrop. Empty state: dashed line-strong 8px panel, centred, with a title, ink-3 description and one action.

## Do's and Don'ts

### Do:
- **Do** lead each dashboard with the "A traiter" attention card, then the StatStrip, then recent-work tables.
- **Do** give every status a label and a dot, with the same tone in both apps.
- **Do** keep primary action, current nav, links and focus in the app's accent only (azure for admin, plum for broker).
- **Do** use 1px line hairlines for structure, and let tables and lists run edge to edge inside their card.
- **Do** set references and identifiers in Geist Mono (`bo-ref`) and all figures in tabular numerals.
- **Do** keep every text at 14px or larger, with controls 36 to 38px tall and 44px on phones.
- **Do** respect `prefers-reduced-motion`: spinners, pulses and transitions turn off.
- **Do** write French copy with amounts in FCFA and dates like `24 septembre 2026`.

### Don't:
- **Don't** put a kicker, eyebrow or uppercase tracked label above titles or groups; page headings carry their own weight. (The shipped `bo-kicker` class is retired and hidden; the `kicker` prop remains in `page-header.tsx` as legacy and should not be used.)
- **Don't** use a side stripe (a thick coloured left or right border) on cards, rows, notices or alerts; tone is carried by soft fill, line and a dot. The thin left rule under nav sublinks is a tree guide, not a status stripe.
- **Don't** add box-shadows to panels, cards, buttons or badges; shadows exist only on popovers and dialogs (plus the input focus halo).
- **Don't** set any text below 14px.
- **Don't** let the accent express status, or let a status hue become an action colour.
- **Don't** import `--am-*` tokens, the public display face, indigo/yellow identity or any cut-paper device into the back-offices.
- **Don't** replace a stat strip with a wall of equal boxed KPI cards.
- **Don't** merge the two apps' looks: a broker screen must never take azure, and an admin screen never plum.
