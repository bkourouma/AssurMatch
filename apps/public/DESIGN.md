---
name: AssurMatch public site
description: "Le patron: a tailor's pattern sheet laid on indigo cloth, with a yellow measuring tape that counts the steps, for an indicative insurance comparison."
colors:
  cloth-indigo: "#25207a"
  cloth-indigo-deep: "#181456"
  link-indigo: "#3730a8"
  link-indigo-pressed: "#2b2590"
  indigo-wash: "#f3f2fd"
  indigo-rule: "#cdcaf3"
  cut-line-violet: "#8f89d8"
  cloth-ink-muted: "#cfcdf2"
  pattern-sheet: "#fafbff"
  tape-yellow: "#f2c230"
  tape-yellow-deep: "#e3ae0e"
  tape-wash: "#fff8dc"
  ground-white: "#ffffff"
  band-lavender-grey: "#f1f1f8"
  rule-lavender-grey: "#e3e3ef"
  rule-lavender-strong: "#cbcbdd"
  ink: "#14132a"
  ink-muted: "#4f4e69"
  ink-subtle: "#646380"
  confirm-green: "#237a35"
  confirm-green-tint: "#eef7ef"
  logo-green: "#4fb832"
  logo-blue: "#1650b8"
  logo-accent-on-cloth: "#9fdc8c"
  sponsored-orange: "#c2610a"
  sponsored-ink: "#8a4303"
  sponsored-tint: "#fff6eb"
  error-red: "#b42318"
  error-ink: "#8f1c13"
  error-tint: "#fdf3f2"
  whatsapp-green: "#25d366"
  whatsapp-ink: "#06331a"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "clamp(34px, 1.35rem + 3.3vw, 68px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "Bricolage Grotesque, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(32px, 1.55rem + 2vw, 52px)"
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: "-0.022em"
  title:
    fontFamily: "Bricolage Grotesque, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(26px, 1.3rem + 1.1vw, 38px)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.022em"
  piece-title:
    fontFamily: "Bricolage Grotesque, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "clamp(16px, 0.98rem + 0.12vw, 17px)"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.45
  reference-mono:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "0.9em"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  tape-tick: "1px"
  hair: "2px"
  panel: "4px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "clamp(52px, 5vw, 104px)"
  row: "64px"
components:
  button-primary:
    backgroundColor: "{colors.tape-yellow}"
    textColor: "{colors.cloth-indigo}"
    rounded: "{rounded.hair}"
    padding: "10px 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.tape-yellow-deep}"
  button-secondary:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.cloth-indigo}"
    rounded: "{rounded.hair}"
    padding: "10px 20px"
    height: "48px"
  button-whatsapp:
    backgroundColor: "{colors.whatsapp-green}"
    textColor: "{colors.whatsapp-ink}"
    rounded: "{rounded.hair}"
  pattern-sheet:
    backgroundColor: "{colors.pattern-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hair}"
    padding: "48px"
  pattern-sheet-body:
    backgroundColor: "{colors.pattern-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hair}"
    padding: "48px"
  offer-piece:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hair}"
    padding: "24px"
  directory-piece:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.cloth-indigo}"
    rounded: "{rounded.hair}"
    padding: "12px 16px"
    height: "64px"
  directory-piece-hover:
    backgroundColor: "{colors.tape-wash}"
  badge-confirmed:
    backgroundColor: "{colors.confirm-green}"
    textColor: "{colors.ground-white}"
    rounded: "{rounded.hair}"
  badge-sponsored:
    backgroundColor: "{colors.sponsored-tint}"
    textColor: "{colors.sponsored-ink}"
    rounded: "{rounded.hair}"
  field:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hair}"
    padding: "10px 12px"
    height: "48px"
  notice:
    backgroundColor: "{colors.indigo-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hair}"
    padding: "16px"
  route-tag:
    backgroundColor: "{colors.cloth-indigo}"
    textColor: "{colors.tape-yellow}"
    rounded: "{rounded.hair}"
    size: "44px"
---

# Design System: AssurMatch public site

## Overview

**Creative North Star: "Le patron"**

The public site is a tailor's pattern. You choose the cloth first (compare), then the broker takes your measurements (quote). Every page opens on saturated indigo cloth. A pale pattern sheet is laid on it, drawn with a dotted cut line and notches bitten out of its edge. A yellow measuring tape counts the journey steps and marks the action. Pieces are cut square, outlined or ruled, never rounded and never shadowed. The footer closes the page on the same cloth, hemmed with a strip of tape.

The register is plain and credible on price and consent, but allowed some character: the one expressive device is the cut paper and the tape, and the display face carries the rest. Flat colour only; the retired gradient and glow names still resolve to flat values or `none`. A solid line means cut (confirmed); a dashed line means only marked (indicative, to be confirmed).

**Key Characteristics:**
- Indigo cloth (with a barely visible lozenge weave) opens and closes every page.
- Pale pattern sheet with a 2px dotted cut line and four triangular notches carries the headline, one lead and the main action. The same sheet, with two notches, carries the quote, apply and track forms on a grey band.
- Cut pieces (offer cards, home role groups) carry one notch on the left edge.
- Yellow is the action and the tape; nothing else is yellow-filled.
- Square corners (2px), 1px or 2px lines, no shadows on the page.
- Two faces (plus a mono stack for code and references): Bricolage Grotesque for headings and figures, Atkinson Hyperlegible Next for every sentence.
- Nothing renders below 14px; text pairs are at least 4.5:1.

## Colors

Cold lavender-tinted neutrals around one saturated indigo, with a single measuring-tape yellow for what you can do. Green, orange and red are reserved meanings.

### Primary
- **Cloth Indigo** (`cloth-indigo`): the cloth, page openings, the footer, headings, structure, outlines of list pieces, the ink on yellow. White on it is 13.4:1. Holds the historical token name `--am-primary-800`.
- **Cloth Indigo Deep** (`cloth-indigo-deep`): the cloth in shadow, hover ink on the tape.
- **Link Indigo** (`link-indigo`): what you can follow: underlined links, focus ring, selected rows, field focus border (9.7:1 on white). Pressed state `link-indigo-pressed`.

### Secondary
- **Tape Yellow** (`tape-yellow`): what you can do: primary buttons, the measuring tape strip and footer hem, the number on the route tags and the current-step marker. Hover `tape-yellow-deep`; a hover wash for rows is `tape-wash`. Also the text selection and the focus ring on the cloth.

### Tertiary
- **Confirm Green** (`confirm-green`): confirmed or done: "confirmed by the broker" badge, ticks, the broker step tag in the route.
- **Sponsored Orange** (`sponsored-orange`, ink `sponsored-ink`, tint `sponsored-tint`): the sponsored label and nothing else.
- **Error Red** (`error-red`, ink `error-ink`, tint `error-tint`): errors only.
- **WhatsApp Green** (`whatsapp-green`, ink `whatsapp-ink`): a channel brand colour used only on the WhatsApp button.
- **Logo Blue / Logo Green** (`logo-blue`, `logo-green`): only inside the logo mark. **Logo accent on cloth** (`logo-accent-on-cloth`): a lighter green for the logo word accent on the cloth, white logo variant only.

### Neutral
- **Pattern Sheet** (`pattern-sheet`): the cold white paper laid on the cloth; **Cut Line Violet** (`cut-line-violet`) draws its dotted line.
- **Ground White** (`ground-white`): the page canvas and plates. **Band Lavender Grey** (`band-lavender-grey`): muted sections, and the grey band a body pattern sheet is laid on. **Indigo Wash** (`indigo-wash`): notices, selected rows, brand sections.
- **Rule Lavender Grey** / **Strong** (`rule-lavender-grey`, `rule-lavender-strong`): hairlines and borders.
- **Ink** (`ink`), **Ink Muted** (`ink-muted`, 7.4:1), **Ink Subtle** (`ink-subtle`, 5.8:1): text on light. **Cloth Ink Muted** (`cloth-ink-muted`, 8.4:1): secondary text on the cloth.

### Named Rules
**The One Meaning Rule.** Each colour keeps one meaning everywhere: indigo = cloth and structure, link indigo = followable, yellow = doable, green = confirmed, orange = sponsored, red = error.
**The Cut-or-Marked Rule.** Confirmed things get a solid line; indicative or to-be-confirmed things get a dashed line.
**The Yellow Is Action Rule.** Do not use yellow as decoration or as a highlight; a yellow fill must be a button, the tape, or a number on a route tag.

## Typography

**Display Font:** Bricolage Grotesque (variable weight and optical size, with Atkinson, system-ui, Segoe UI, Arial)
**Body Font:** Atkinson Hyperlegible Next (400, 700, 800; with system-ui, Segoe UI, Arial)
**Code / Reference Font:** ui-monospace, Cascadia Mono, Consolas (kbd, code and reference codes only)

**Character:** A grotesque with a little tailoring in its joins sets headings and large figures; a face built for legibility sets every sentence, read on a phone in daylight. Atkinson Hyperlegible Next draws a slashed zero by design and no stylistic set changes it: a documented limitation, not a defect to patch.

### Hierarchy
- **Display** (800, clamp 34px to 68px, 1.02): the home headline on the sheet.
- **Headline** (800, clamp 32px to 52px, 1.06): h1 of every other page opening; small openings use clamp 30px to 44px.
- **Title** (800, clamp 26px to 38px, 1.12): section titles (h2).
- **Piece title** (750, 20px, 1.2; 22px for home product rows): directory row names, route titles, h3 (clamp 20px to 23px).
- **Price figure** (800, clamp 22px to 28px, 1.15, heading face): the offer price amount in the dashed price box.
- **Body** (400, clamp 16px to 17px, 1.6): all prose; lead is 17px to 19px at 1.55, hero lead capped at 34em; FAQ answers at 34em.
- **Label** (700, 14px to 15px, 1.45): badges, field labels, captions, tape labels. h4 to h6 use the body face at 18px, 700.

### Named Rules
**The Two Faces Rule.** Headings, figures and the numbers on route tags use the display face; everything a person reads as a sentence uses the body face.
**The 14px Floor Rule.** Nothing renders below 14px.
**The Tabular Where Aligned Rule.** Tabular numerals only where figures line up in a column or a code (table cells, scores, references, ceilings); a single display figure such as the price is set in the heading face without them.

## Layout

A content column of 1180px (wide 1280px, narrow 740px) with gutters of 16px, 24px (from 600px) and 32px (from 1100px). The header is a sticky white strip, 56px tall (68px from 1100px). Spacing runs on a 2/4/6/8/10/12/16/20/24/28/32/40/48/56/64/80/96px scale; sections breathe at clamp(52px, 5vw, 104px), compact at clamp(36px, 3vw, 56px). The unit for any list item is the 64px row (76px for the home product rows), which doubles as the tap target; interactive controls are at least 44px, buttons 48px.

Phone first (390px): the opening is a full cloth block with the location line in white, then the sheet with the headline and the product pieces as stacked rows. From 900px to 980px the hero splits in two columns (1.35fr / 320px+) and directories can run in two columns; the sheet spans the container, never a centred hero. The route runs vertically on a phone and horizontally from 900px. Journey pages carry the yellow tape strip above the sheet, at full sheet width with no cap; the home page carries it too, with the Pays stop marked current. Pattern sheets in the body (quote, apply, track) are laid on a muted grey band, max 920px wide and centred; padding 32px/20px, 48px from 768px.

## Elevation & Depth

Flat. Depth is conveyed by the cloth against the pale sheet, by 1px to 2px outlines and by notches, not by shadow. Every page-level shadow token resolves to `none`. The only shadows are two overlay-only values for floating UI such as the docked comparison bar.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 12px 32px rgba(24, 20, 86, 0.2)`): the comparison bar docked at the bottom, and other floating overlays. The scrim (0.45) and the table-scroll edge shade (0.14) use the same deep indigo rgba(24, 20, 86, *), not a neutral black or navy.
- **Focus ring** (`0 0 0 2px #fff, 0 0 0 4px #3730a8`; on cloth `0 0 0 2px #25207a, 0 0 0 4px #f2c230`): in practice focus is a 3px outline offset 2px in link indigo, tape yellow on the cloth.

### Named Rules
**The No Shadow On The Page Rule.** Cards, pieces, buttons and sheets never carry a shadow; a piece lifts by a change of border or wash, not by shadow.

## Shapes

Pieces are cut, not moulded: 2px corners everywhere (4px for panels, pills only for small dots and the switch; 1px only for the tape tick and the square list dot). The sheet's signature is geometry: a 2px dotted inset line (8px in from the edge, 12px from 900px) and four notches, small triangles bitten from the edge (left at 26%, right at 68%, top at 34%, bottom at 78%) filled with the cloth colour. The tape is a 22px yellow band with a tick pattern along its lower edge (a longer tick every fifth), reused by the journey strip and the footer hem. These shapes are custom properties drawn as inline SVG backgrounds. Cut pieces below the hero use a single left notch (offer cards 52px down, home role groups 36px down); a sheet in the body keeps the dotted line (8px in, 12px from 768px) with two notches (left at 72px, right at 180px).

### Named Rules
**The Cut Corner Rule.** Corners stay at 2px (1px only for the tape tick and the square list dot); round shapes are reserved for dots and switches.
**The Notch Rule.** The cut line and multiple notches belong to pattern sheets. The only other notch is the single left-edge notch on offer cards and home role groups; never on rows, buttons, badges or fields.

## Components

### Buttons
- **Shape:** 2px corners, 2px border, minimum 48px tall (40px small, 56px large), weight 800.
- **Primary:** tape yellow fill, cloth indigo ink and border; on the cloth the border turns yellow. Hover is deeper yellow.
- **Secondary:** white (transparent on the cloth) with a 2px indigo (white on cloth) outline and indigo wash on hover.
- **Tertiary / Ghost:** a link with weight (underlined, 1px, 2px on hover) and a plain ghost with a pale hover.
- **WhatsApp:** channel green with dark green ink, only for the WhatsApp action. Disabled is grey with a grey border.

### Pattern Sheet (hero)
Pale paper on the cloth with the dotted cut line and notches; holds the h1, one lead and the page's main action. Components placed on it return to light-page colours. Padding 32px/24px on a phone, 48px from 900px.

### Pattern Sheet (body)
Paper (`pattern-sheet`) with a 1px indigo-100 border, the dotted cut line and two notches, laid on a muted grey band; it holds a whole form (quote, broker application, tracking). A form card inside it is frameless (no border, padding or fill), so the sheet is the only frame.

### Offer card and role group
White offer card with a 1px strong-lavender border and 2px corners, one notch bitten into the left edge; a sponsored card outlines in orange, a selected card in link indigo with an inset 1px line. The price sits in a dashed box (indicative). Home role groups are sheet-coloured with a 1px indigo-100 border and the same single notch.

### Directory piece
A list row that is one pattern piece: 2px indigo outline, 2px corners, white fill, 64px minimum height. A tile (indigo square with yellow pictogram), a Bricolage name, one muted line, and a trailing arrow icon in indigo that nudges 4px toward the destination on hover. Hover washes the row pale tape yellow; when prefers-reduced-motion is not set, hover and keyboard focus also lift the row 2px (220ms). Rows are 8px apart.

### Route and route strip
Route: numbered square tags (44px, indigo with yellow Bricolage numeral) joined by a vertical or horizontal tape band (12px yellow between 1.5px indigo lines); the confirmation stop is green. Route strip: the full-width yellow tape with ticks above journey pages (the marker slide of the earlier build is gone); the current stop is a label printed in reverse (indigo with yellow text), passed stops are links back, later stops are plain; under 360px only the current label shows.

### Badges, scores, pills
Rectangular labels, 2px corners, 14px bold. Confirmed is solid green with white text; sponsored is orange outline on orange tint, always with the word; pilot is dashed indigo; scores are outlined (2px indigo outline for high). Green is never used for a score.

### Notice, empty state, AI box
Notice: indigo wash with indigo-rule border, never closable; indicative variant is white with a dashed indigo outline; success and error use green and red. Empty state and AI box use dashed outlines.

### Fields
48px tall, 1px strong lavender-grey border, 2px corners, white fill; hover darkens the border, focus turns it link indigo with a 1px inset line; errors turn red with an inset red line. Choice rows (radio cards) take the indigo wash and inset line when selected.

### Code and keys
kbd and code use the mono stack on a 1px neutral border, 2px corners.

### Navigation and footer
Header: white strip with a 1px bottom rule, flat logo mark and wordmark, indigo bold links, current page marked by a 4px indigo bar; the compare button is icon-only under 480px and outlined. Footer: cloth with weave, a 22px tape hem along the top, muted cloth ink for text, white outline secondary buttons.

## Do's and Don'ts

### Do:
- **Do** open every page on the cloth with the pattern sheet laid on it, and close it on the cloth footer with the tape hem.
- **Do** keep yellow for the one real action per view, the tape and the route numbers.
- **Do** use a dashed 1px outline for anything indicative, a solid line for what is confirmed.
- **Do** build list items as 2px-indigo-outlined pieces at least 64px tall.
- **Do** set headings and figures in Bricolage Grotesque and sentences in Atkinson Hyperlegible Next, 14px minimum.
- **Do** respect reduced motion: the 2px row lift is the one authored movement and exists only under no-preference.
- **Do** print "sponsored" in words with the orange label, and green only on what the broker confirmed.

### Don't:
- **Don't** add shadows, gradients, glass or glows to page surfaces.
- **Don't** round corners beyond 2px (4px for panels) or nest cards in cards.
- **Don't** reuse the previous system: navy sign panels with a directory of icon rows, or the comparator default of a blue hero over a search box with icon cards and trust-badge strips.
- **Don't** make the site read as a themed costume (the MedicProWeb anti-reference): the pattern devices stay on the sheet, the tape and the route.
- **Don't** use the logo blue or green outside the logo, or WhatsApp green outside the WhatsApp button.
- **Don't** set tabular numerals on a lone display figure, or add notches to rows and controls.
- **Don't** put text over the cloth weave other than headings and short lines; body copy sits on the sheet or white.

<!-- Not canonized: see the report. The directory arrow in the build is a bare indigo arrow icon, not the yellow arrow chip described in the surface brief and the developer guide; the plain build is recorded. Stale comments in tokens.css still say "dashed cut line", "row arrow chip" and "the yellow bar under a row" for what the build draws as a dotted line, a bare arrow and a 2px lift. -->
