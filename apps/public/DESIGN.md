---
name: AssurMatch public site
description: "La signalétique: a plain wayfinding sign system for an indicative insurance comparison, phone first."
colors:
  sign-navy: "#0b2a5c"
  sign-navy-deep: "#071c40"
  action-blue: "#1650b8"
  action-blue-pressed: "#123e86"
  focus-blue: "#2a66d1"
  route-tint: "#f1f5fd"
  route-tint-rule: "#cbd9f5"
  sign-ink-muted: "#c7d3ea"
  sign-focus-yellow: "#ffd75e"
  ground-white: "#ffffff"
  band-grey: "#eef1f4"
  rule-grey: "#e1e5eb"
  rule-grey-strong: "#c9d0da"
  ink: "#12161d"
  ink-muted: "#4e5868"
  ink-subtle: "#5f6a7c"
  confirm-green: "#237a35"
  confirm-green-tint: "#eef7ef"
  logo-green: "#4fb832"
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
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "clamp(34px, 1.55rem + 2.5vw, 58px)"
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "clamp(30px, 1.45rem + 1.7vw, 46px)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.012em"
  section:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "clamp(24px, 1.25rem + 0.95vw, 34px)"
    fontWeight: 800
    lineHeight: 1.18
    letterSpacing: "-0.012em"
  title:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "clamp(19px, 1.12rem + 0.2vw, 21px)"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.006em"
  row-title:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
  lead:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "clamp(17px, 1rem + 0.3vw, 19px)"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "clamp(16px, 0.98rem + 0.12vw, 17px)"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0"
  caption:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  figure:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, Segoe UI, Arial, sans-serif"
    fontSize: "clamp(28px, 1.4rem + 1vw, 36px)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.012em"
    fontFeature: "\"tnum\" 1"
rounded:
  xs: "2px"
  sm: "4px"
  panel: "6px"
  pill: "999px"
spacing:
  space-4: "4px"
  space-8: "8px"
  space-12: "12px"
  space-16: "16px"
  space-20: "20px"
  space-24: "24px"
  space-32: "32px"
  space-40: "40px"
  space-48: "48px"
  space-64: "64px"
  gutter-phone: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "32px"
  header-phone: "56px"
  header-desktop: "68px"
  directory-row: "64px"
  tile-phone: "44px"
  tile-desktop: "48px"
  section: "clamp(48px, 4.6vw, 96px)"
  section-compact: "clamp(36px, 3vw, 56px)"
components:
  sign-panel:
    backgroundColor: "{colors.sign-navy}"
    textColor: "{colors.ground-white}"
    padding: "24px 0 40px"
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.ground-white}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-pressed}"
    textColor: "{colors.ground-white}"
  button-secondary:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.action-blue}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.route-tint}"
    textColor: "{colors.action-blue-pressed}"
  button-tertiary:
    textColor: "{colors.action-blue}"
    height: "44px"
  button-on-sign:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.sign-navy}"
    rounded: "{rounded.sm}"
    height: "48px"
  button-whatsapp:
    backgroundColor: "{colors.whatsapp-green}"
    textColor: "{colors.whatsapp-ink}"
    rounded: "{rounded.sm}"
    height: "48px"
  directory-row:
    textColor: "{colors.sign-navy}"
    typography: "{typography.row-title}"
    padding: "10px 16px"
    height: "64px"
  directory-row-hover:
    backgroundColor: "{colors.route-tint}"
  pictogram-tile:
    backgroundColor: "{colors.sign-navy}"
    textColor: "{colors.ground-white}"
    rounded: "{rounded.sm}"
    size: "44px"
  icon-tile:
    backgroundColor: "{colors.band-grey}"
    textColor: "{colors.sign-navy}"
    rounded: "{rounded.sm}"
    size: "44px"
  card:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "20px"
  offer-card:
    backgroundColor: "{colors.ground-white}"
    rounded: "{rounded.sm}"
    padding: "16px"
  price-plate:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.sign-navy}"
    rounded: "{rounded.sm}"
    padding: "16px"
  field:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "48px"
  badge-confirmed:
    backgroundColor: "{colors.confirm-green}"
    textColor: "{colors.ground-white}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
  badge-sponsored:
    backgroundColor: "{colors.sponsored-tint}"
    textColor: "{colors.sponsored-ink}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
  badge-pilot:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.sign-navy}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
  score-pill:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.sign-navy}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
    height: "30px"
  notice:
    backgroundColor: "{colors.route-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "16px"
  notice-indicative:
    backgroundColor: "{colors.ground-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "16px"
  notice-error:
    backgroundColor: "{colors.error-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "16px"
---

# Design System: AssurMatch public site

## Overview

**Creative North Star: "La signalétique"**

The public site is a wayfinding sign system for an insurance decision, drawn after airport and bus-station signage rather than after a comparator landing page. Every page opens on a flat navy sign that says where you are; every list is a directory of ruled rows you walk; every price says who confirms it. The visitor is an adult making a money decision on a phone in daylight, so the system is built for legibility first: one hyperlegible face, large tap targets, high-contrast pairs, and nothing that moves on its own.

Density is moderate and phone-led (designed at 390px, then widened). Surfaces are a white ground, pale cool-grey bands and navy signs; structure comes from 1px rules and near-square 4px corners, never from shadow, gradient or glass. Colour is a law, not a mood: each hue carries one meaning on every page. The state language is literal: what is indicative is outlined with a dashed line, what a broker confirmed is filled solid.

The world is deliberately plain. The confirmed anti-reference is a themed costume site (painted metaphors, condensed all-caps display, rendered metal plates): the signage here is the honest municipal kind, not a stage set.

**Key Characteristics:**
- Navy sign panel at the top of every page, carrying the location line, the title and one lead.
- Directories of 64px ruled rows (tile, bold name, short line, arrow) instead of icon-card grids.
- The « Vous êtes ici » route strip on journey signs: Pays, Produit, Offres, Demande, Courtier.
- One family, Atkinson Hyperlegible Next, at 400 / 700 / 800.
- Flat: 1px rules, 4px corners, no page shadows, no gradients.
- Dashed = indicative, solid = confirmed, everywhere.
- Almost no motion: the only authored move is the directory arrow nudging 4px.

## Colors

A navy-and-blue hue family on white and cool grey, with three signal colours that each mean one thing.

### Primary
- **Sign Navy** (sign-navy): where you are. Sign panels (hero, navy sections, footer), headings on white, pictogram tiles, the route line, the current-page bar under a nav link, list markers. White on it is 14:1.
- **Action Blue** (action-blue): what you can do. Links, primary buttons, the secondary button stroke, field focus, directory arrows, checkbox accent. 7.3:1 on white.
- **Action Blue Pressed** (action-blue-pressed): hover and pressed state of every blue action and link.
- **Route Tint** (route-tint) with **Route Tint Rule** (route-tint-rule): the pale blue of hover rows, secondary-button hover, the default notice and brand cards.

### Secondary
- **Confirm Green** (confirm-green) on **Confirm Green Tint** (confirm-green-tint): confirmed or done. Solid "confirmé" badges, ticks, success notices, the route stop where the broker confirms.

### Tertiary
- **Sponsored Orange** (sponsored-orange), **Sponsored Ink** (sponsored-ink), **Sponsored Tint** (sponsored-tint): sponsorship and nothing else. The sponsored badge (always with the word) and the outline of a sponsored offer card.
- **Error Red** (error-red), **Error Ink** (error-ink), **Error Tint** (error-tint): field errors, error notices, the required asterisk.

### Neutral
- **Ground White** (ground-white): the page ground, cards, fields, and the inverted button on a sign.
- **Band Grey** (band-grey): alternating section bands (filters, muted sections) and the pale icon tile.
- **Rule Grey** (rule-grey) and **Rule Grey Strong** (rule-grey-strong): every 1px rule, card border and divider; the strong grey outlines offer cards and outline cards.
- **Ink** (ink): running text. **Ink Muted** (ink-muted): secondary text, field hints. **Ink Subtle** (ink-subtle): captions, placeholders and the 1px field stroke (4.5:1+ on white).
- **Sign Ink Muted** (sign-ink-muted): secondary text, breadcrumbs and passed route stops on navy (9.3:1).
- **Sign Focus Yellow** (sign-focus-yellow): the focus ring inside navy panels only, where blue would vanish.

### Channel exception
- **WhatsApp Green** (whatsapp-green) with **WhatsApp Ink** (whatsapp-ink): the WhatsApp button only; a channel colour, never the confirmation green.
- **Logo Green** (logo-green): inside the logo mark only.

### Named Rules
**The Palette Law Rule.** Navy = where you are, blue = what you can do, green = confirmed or done, orange = sponsored, red = error. Nothing is decorative; a colour that appears must carry its meaning.

**The Green Is Earned Rule.** Green appears only where a broker confirmed something or a step is done. A high score is a heavier navy outline, never green.

**The Inverting Sign Rule.** Inside a navy panel the same components invert: headings, links and primary buttons turn white, rules turn translucent white (22%), the focus ring turns yellow. A light plate set on a sign (card, notice, field, plated directory) returns to the light-page colours.

## Typography

**Display Font:** Atkinson Hyperlegible Next (with system-ui, Segoe UI, Arial)
**Body Font:** Atkinson Hyperlegible Next (same family)

**Character:** One face drawn for legibility, with distinct letterforms and open counters, used at three weights: 400 for text, 700 for labels and small headings, 800 for sign titles. It reads like the lettering of a public sign: bold, sentence case, never condensed, never tracked capitals.

### Hierarchy
- **Display** (800, clamp 34–58px, 1.06): the large page sign (home and acquisition heroes) only.
- **Headline** (800, clamp 30–46px, 1.1): page titles on standard signs; capped near 22ch.
- **Section** (800, clamp 24–34px, 1.18): section titles on white or grey bands.
- **Title** (700, clamp 19–21px, 1.3): card titles, offer names, route stop titles.
- **Row Title** (700, 18px, 1.3): the name in a directory row.
- **Lead** (400, clamp 17–19px, 1.55): the one sentence under a title; measure 34em.
- **Body** (400, clamp 16–17px, 1.6): running text; prose measures set in em (34em ≈ 75 characters), because the face's wide zero makes ch-based measures run long.
- **Label** (700, 15px, 1.5, no tracking): field labels, button text at small size, fact labels.
- **Caption** (400, 14px, 1.45): meta lines, hints, fine print. Nothing renders below 14px.
- **Figure** (800, clamp 28–36px, tabular): counters and stats; every number uses tabular figures.

### Named Rules
**The Sentence Case Sign Rule.** Headings and labels are sentence case at zero or negative tracking. No uppercase tracked labels and nothing set above a heading as an eyebrow; a status that needs saying above a title is a Badge.

**The Fourteen Floor Rule.** No text below 14px, anywhere, including legal fine print.

## Layout

Containers run at 1180px (wide 1280px, narrow 740px for reading pages) with gutters of 16px on phones, 24px from 600px and 32px from 1100px. The header is a white sticky strip, 56px on phones and 68px from 1100px; the burger menu takes over under 1100px. Sections alternate white ground and grey bands with vertical padding of clamp(48px, 4.6vw, 96px) (compact: 36–56px); two white sections in a row share a 1px rule instead of doubling their padding.

The spacing scale is a 4px base stepped 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64. Vertical rhythm comes from stacks (16 / 24 / 32 gaps), button rows from wrapping clusters (12px gap), and grids from auto-fit columns with a minimum width rather than fixed breakpoints.

Pages are judged at 390px first. At desktop the sign spans the container and the product directory goes two columns inside the same frame; a hero may hold a second column only from 980px, and the home sign never becomes a split hero. Offer cards keep a fixed fact grid (two columns on a phone, three from 1000px) so columns read across a list of equal-width cards. The route of "how it works" runs vertically on phones and horizontally from 900px.

**The Columns Never Move Rule.** Every offer card has the same structure in the same order and the same label grid; a missing fact stays in its cell as "not provided", it never collapses the grid.

## Elevation & Depth

The page is flat. Depth is conveyed by tone (navy sign over white ground, grey band under white cards) and by 1px rules, never by shadow. Shadow tokens on the page resolve to none. A single soft navy-tinted shadow exists for things that float above the page: the menu drawer and the sticky comparison bar. Two functional gradients survive and are not decoration: the horizontal scroll cue on overflowing tables and the loading skeleton shimmer.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 12px 32px rgba(7, 28, 64, 0.18)`): the menu drawer and the comparison bar only.
- **Current-stop halo** (`box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.22)`): the ring around the current stop of the route strip on a navy sign; a mark, not a lift.
- **Selection inset** (`box-shadow: inset 0 0 0 1px` action blue): a 2px-looking stroke on a focused field, a selected radio card or a selected offer card; it thickens the border, it does not lift.

### Named Rules
**The Flat Sign Rule.** Nothing on the page casts a shadow. If an element seems to need lift, give it a rule, a band or a navy panel instead.

## Shapes

Sign panels are nearly square. Buttons, fields, cards, notices, tiles and plates use a 4px radius; badges and score pills use 2px, reading as stamped labels; the only round forms are route dots, route-strip marks, the radio and the knob of a switch. Borders are 1px (2px for buttons and the high score band, 4px for the route line and the current-nav bar). The dashed 1px stroke is a semantic shape, not a style: it marks the indicative price plate, the indicative notice, the dashed card and the pilot badge.

**The Dashed Means Indicative Rule.** A dashed outline says "à confirmer"; a solid fill says "confirmé". Never use a dashed line for decoration or a solid green fill for something the broker has not confirmed.

## Components

### Buttons
Plain, heavy and unmistakable: blue fill, bold label, square-ish corners.
- **Shape:** gently squared (4px), 2px border in the fill colour, minimum height 48px (40px small, 56px large; icon-only buttons square at the same sizes).
- **Primary:** action-blue fill, white bold text, 10px 20px padding.
- **Hover / Focus / Active:** hover deepens to action-blue-pressed; focus is a 3px blue outline offset 2px; active drops 1px. Colour transitions at 160ms.
- **Secondary:** white with the blue 2px stroke and blue text; hover fills route-tint.
- **Tertiary:** an underlined link with button weight, 44px tap target kept at every size.
- **Ghost:** transparent, ink text, grey-band hover (menus and utilities).
- **On a sign:** primary inverts to white fill with navy text; secondary becomes a white outline on navy.
- **WhatsApp:** the channel button, WhatsApp green with dark ink; the only place that green appears.

### Chips and badges
- **Style:** rectangular labels (2px radius, 1px border, 14px bold), grey by default.
- **States:** confirmed is solid green with white text; sponsored is orange-outlined on orange tint with the word written out; pilot is a dashed navy outline; new is route-tint; soon is a grey outline. Guarantee pills on offer cards are small ruled labels with a tick (included) or a dash (not included).

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** ground white; muted cards sit on band grey with no border; navy cards are signs.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px rule grey; strong grey for outline and offer cards; 2px navy for the featured card; dashed for indicative content.
- **Internal Padding:** 20px (16px small, 24–32px large).
- **Interactive:** border turns action blue and the ground turns route-tint on hover or focus-within. Cards are never nested and never used as a grid of icon + title + text for page structure.

### Inputs / Fields
- **Style:** white, 1px ink-subtle stroke, 4px radius, 48px minimum height, 10px 12px padding, body-size text; label above in 15px bold; hint below in 14px.
- **Focus:** stroke turns action blue with a 1px inset blue line, plus the 3px blue focus outline.
- **Error / Disabled:** error is a red stroke with inset red line and a bold error line with icon below; disabled is grey band with a grey stroke. Selects carry a navy chevron. Checkboxes and radios are 22px with the blue accent.

### Navigation
- **Header:** white sticky strip with a 1px bottom rule (strong grey once scrolled). Logo left, links centred in navy 700, utilities right (country selector, FR / EN switch, the "Comparer les offres" button). Link hover is blue with a 2px underline; the current page is a 4px navy bar on the strip's lower edge.
- **Mobile:** under 1100px a burger opens a right-hand drawer (max 400px) with ruled link rows; under 480px the compare action collapses to a 44px icon button whose label lives in aria-label.
- **Footer:** a navy sign: white headings in body size, muted link columns, the regulatory statement and the legal links, yellow focus ring.

### Directory (signature)
The main list component: rows of destinations (products, countries, guides, brokers, insurers). Each row is one link at least 64px high: a navy pictogram tile, a bold navy name with an optional muted line, and a blue arrow. Rows are separated by 1px rules; a plated directory sits in a white 4px frame (used on navy signs). Hover tints the row route-tint; hover and focus nudge the arrow 4px toward its destination (220ms). From 900px a directory may run two columns.

### Pictogram tiles (signature)
Product pictograms drawn from a few flat planes in one colour on a 24px grid, the way airport pictograms are drawn, set on a 44px (48px desktop) navy tile with 4px corners, or a white tile on a navy sign. Interface glyphs (arrows, ticks, menus) are stroke icons and sit on the pale grey icon tile; the two drawing systems never share a tile.

### Route and route strip (signature)
- **Route:** numbered stops on a 4px navy line, 40px navy dots with white tabular numerals; the stop where the broker confirms is green. Vertical on phones, horizontal from 900px.
- **Route strip « Vous êtes ici »:** on every journey sign, five equal columns (Pays, Produit, Offres, Demande, Courtier) on a 2px translucent line. Passed stops are small filled muted marks with links back, stops ahead are small open rings, and the current stop is the strongest mark: a 22px solid white disc with a soft white halo and a bold white label. Under 360px only the current label stays visible.

### Offer card and price plate (signature)
A white card with a strong grey border (orange border when sponsored, blue inset when selected for comparison). Head: offer name, update date, score pill. Body: a dashed navy price plate (label, 800-weight amount, "à confirmer par le courtier partenaire") beside the fixed fact grid of label / value cells on 1px rules. Then guarantee pills, the score disclosure, a disclaimer, and a ruled foot with the compare checkbox and the two actions.

### Score pill
An indicative score, so outlined, never filled: 2px radius, tabular 800 figures; the high band is a 2px navy outline, the mid band a blue outline, the low band grey.

### Notice
Never closable. Default is route-tint with a route-tint-rule border and a navy icon; indicative is white with a dashed navy outline; success is green tint; error is red tint.

## Do's and Don'ts

### Do:
- **Do** open every page on a navy sign panel with the location line, one title and one lead.
- **Do** present lists of destinations as Directory rows (64px, tile, name, arrow), not as card grids.
- **Do** put the « Vous êtes ici » route strip on every journey page, with passed stops linking back.
- **Do** mark every indicative price or guarantee with a dashed outline and say who confirms it; fill solid only what a broker confirmed.
- **Do** keep each colour to its single meaning (navy where you are, blue action, green confirmed, orange sponsored, red error).
- **Do** use 4px corners, 1px rules, 48px buttons and fields, and 44px minimum tap targets.
- **Do** set every number in tabular figures and every prose measure in em (34em).
- **Do** invert components inside navy panels and switch the focus ring to yellow there.

### Don't:
- **Don't** use shadows, gradients or glass on the page; the overlay shadow is for the menu drawer and the comparison bar only.
- **Don't** set an eyebrow or kicker above a heading, or any uppercase tracked label.
- **Don't** use green for a high score, a decoration or anything not confirmed; don't use the WhatsApp or logo green anywhere else.
- **Don't** build a soft gradient hero, a split hero on the home sign, a form-in-a-card hero, or rows of icon cards.
- **Don't** nest cards or close notices.
- **Don't** render text below 14px.
- **Don't** add entrance animation, scroll reveals, staggers or count-ups; the arrow nudge is the only authored move.
- **Don't** put a stroke icon on a navy tile or a flat-plane pictogram on a pale tile.
- **Don't** theme the signage into a costume (condensed all-caps display, painted or metal textures).
