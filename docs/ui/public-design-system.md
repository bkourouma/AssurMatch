# AssurMatch public design system (`apps/public`)

Wave 0 foundation. Everything below already exists in the repository; pages compose it, they do not
re-invent it. Source: `apps/public/app/styles/*.css` and `apps/public/app/components/ui|motion/*`.

**Import once:** `import { Button, Card, Section, ... } from "../components/ui";` (the barrel
re-exports `Reveal` and `CountUp` too). Plain CSS, no Tailwind, no CSS modules.

## 0. Non-negotiables

| Rule | Why |
| --- | --- |
| Green (`--am-success-*`) = validation only | Never a page/section background, never a primary button. Only ticks, the `approved` badge, a score >= 75, a done step. One documented exception: the WhatsApp green (`--am-whatsapp`), which is a *channel* colour, not a validation signal — see 3.bis. |
| Sponsored = `warning-800` on `warning-50`, border and icon `warning-600` | `<Badge tone="sponsored">`. Never green, never the brand blue. |
| Every text/background pair >= 4.5:1 | Measured, not guessed. The checked pairs are listed in 3.bis. |
| Nothing below 14px | `--am-caption-size` (14px) is the floor. Body 16-17px, small 15px. |
| Notices are never closable | `<Notice>` has no close affordance and must not be given one. |
| No global `button {}`, `label {}`, `[role="alert"] {}` | They are gone. Unclassed elements get a `:not([class])` safety net; add `.am-button` / `.am-field__control` to opt into the real thing. |
| Reduced motion kills everything | `base.css` and `motion.css` both carry the switch. Never re-enable an animation past it. |
| The page never scrolls sideways | `base.css` sets `html, body { overflow-x: clip }` (see 2). |

## 1. Tokens (`styles/tokens.css`)

The shared back-office socle `@assurmatch/ui/tokens.css` is imported and **never edited**; the public
file extends it. Old names still resolve.

**Colour scales** — `--am-primary-50…900` (600 = brand, 700 = deep, 750 `#10336f` — the last stop of
`--am-gradient-navy`, 800 `#0d2a63`, 900 `#081b45` navy), `--am-neutral-0…900`,
`--am-success-50/100/500/600/700/800`, `--am-warning-50/100/500/600/700/800`, `--am-danger-*`,
`--am-info-*`, `--am-whatsapp` / `--am-whatsapp-dark` / `--am-whatsapp-ink`.

`--am-success-800` `#256718` and `--am-warning-800` `#8a4303` are **text** steps: they exist so the
approved and sponsored badges clear 4.5:1 (600/700 on a 100 background did not). No raw hex outside
this file — if a component needs a shade that is not here, add the token rather than inlining it.

**Semantic aliases — prefer these:** `--am-canvas` `#f6f8fc` (page), `--am-surface` (white card),
`--am-surface-muted`, `--am-surface-brand`, `--am-surface-navy`, `--am-border` `#e3e8f0`,
`--am-border-strong` `#cfd7e3`, `--am-text`, `--am-text-muted`, `--am-text-subtle`,
`--am-text-invert`, `--am-link`, `--am-link-hover`.

**Gradients** — `--am-gradient-brand` (buttons), `--am-gradient-brand-strong` (hover),
`--am-gradient-navy` (dark bands), `--am-gradient-hero`, `--am-gradient-mesh` /
`--am-gradient-mesh-navy` (radial glows behind a hero), `--am-gradient-sheen`.

**Elevation** — `--am-shadow-xs|sm|md|lg|xl`, `--am-shadow-glow` (primary-tinted, CTA hover),
`--am-shadow-glow-soft`, `--am-ring` (focus ring: white gap + primary-500), `--am-ring-invert`.

**Radii** — `--am-radius-xs 4`, `-sm 8`, `-md 12`, `-lg 16`, `-xl 24`, `-pill`; aliases
`--am-radius-field` (10, inputs/buttons), `--am-radius-card` (16), `--am-radius-panel` (24).

**Spacing** — `--am-space-2…128` (2,4,6,8,10,12,16,20,24,28,32,40,48,56,64,80,96,112,128).

**Type** — fluid `clamp()`: `--am-display-size`, `--am-h1-size`, `--am-h2-size`, `--am-h3-size`,
`--am-h4-size`, `--am-lead-size`, `--am-body-size`, `--am-small-size` (15), `--am-caption-size` (14),
`--am-stat-size`; matching `*-line` are unitless line-heights. Tracking:
`--am-tracking-tight` (-0.02em, headings), `--am-tracking-snug`, `--am-tracking-wide` (kickers).

**Motion** — `--am-duration-instant 120ms`, `-fast 200ms`, `-base 320ms`, `-slow 520ms`;
`--am-ease-out cubic-bezier(.2,.8,.2,1)`, `--am-ease-in-out`, `--am-ease-spring`; `--am-transition`
(= fast + ease-out), `--am-stagger 70ms`.

**Layout / z-index** — `--am-content 1200`, `--am-content-wide 1320`, `--am-content-narrow 760`,
`--am-gutter`, `--am-header 72px`, `--am-section` / `--am-section-compact` (fluid);
`--am-z-base|raised|sticky|header|overlay|modal|toast|skip`.

## 2. Layout and text utilities (`styles/base.css`)

| Class | Purpose |
| --- | --- |
| `.am-container` | Centred 1200px column with the gutter. `--wide` (1320) and `--narrow` (760) modifiers. |
| `.am-stack` | Vertical grid; override `--gap`, or use `--lg` / `--xl`. |
| `.am-cluster` | Wrapping horizontal row (buttons, badges); `--between`, `--end`. |
| `.am-grid` | `auto-fit` grid; set `--min` (default 260px) or use `--2` / `--3` / `--4`. |
| `.am-eyebrow` | Uppercase brand kicker above a title (14px). |
| `.am-lead` | 68ch intro paragraph, `--am-lead-size`, muted. |
| `.am-muted` `.am-subtle` `.am-small` `.am-caption` | Text colour / size helpers. |
| `.am-tabular` | Tabular figures — use on every number. |
| `.am-balance` | `text-wrap: balance`. |
| `.am-visually-hidden` | Screen-reader-only text. |
| `.am-skip-link` | The layout's skip link. |

**`html, body { overflow-x: clip }`** — `clip`, deliberately, not `hidden`: `hidden` would make the
root a scroll container and break `position: sticky` and `scroll-padding-top`. It absorbs the few
pixels a `Reveal from="left|right"` pre-state pushes past the viewport (the offset is 16px), which
used to flash a horizontal scrollbar on load below 1024px. It is a safety net for that transient
state, not a licence to ship a too-wide element: a settled page must still fit its container on its
own.

## 3. Components

### Button — `variant` `size` `loading` `iconOnly`
```tsx
<Button href="/comparer" icon={<Icon name="search" />}>Comparer les offres</Button>
<Button variant="secondary" size="lg" iconAfter={<Icon name="arrow-right" />}>Voir le detail</Button>
<Button type="submit" loading={pending} fullWidth>Envoyer la demande</Button>
<Button variant="ghost" iconOnly icon={<Icon name="close" />} aria-label="Fermer">Fermer</Button>
```
Props: `variant` `primary|secondary|tertiary|ghost|whatsapp`, `size` `sm|md|lg`, `href` (typed i18n
route), `externalHref`, `type`, `icon`, `iconAfter`, `fullWidth`, `disabled`, `iconOnly`, `loading`,
`onClick` (honoured only on the `<button>` rendering, i.e. without `href`/`externalHref`), `name`
`value` `form` `title` `rel` `target` `aria-label` `className`. A client form uses the primitive —
never a hand-written `<button className="am-button">`.
CSS: `.am-button` + `[data-variant]` `[data-size]` `[data-full]` `[data-icon-only]` `[data-loading]`,
`.am-button__spinner`. Primary = brand gradient, hover lifts 1px onto `--am-shadow-glow`.

### Card — `CardHeader` `CardTitle` `CardBody` `CardFooter` `CardMeta`
```tsx
<Card as="li" tone="surface" interactive>
  <CardHeader><CardTitle>Assurance auto</CardTitle><Badge tone="new">Nouveau</Badge></CardHeader>
  <CardBody><p>Couverture indicative, confirmee par le courtier partenaire.</p></CardBody>
  <CardFooter><Button size="sm" href="/pays/CI">Voir</Button></CardFooter>
</Card>
```
Props: `as`, `tone` `surface|muted|brand|navy|outline|dashed`, `interactive`, `raised`, `featured`,
`padding` `sm|md|lg`, `className`, `id`.
CSS: `.am-card` + `--muted --brand --navy --outline --dashed --flat --raised --featured
--interactive --pad-sm --pad-lg`, `.am-card__header|__title|__body|__footer|__meta`.

### Stat (count-up)
```tsx
<Stat icon="globe" label="Pays ouverts" value={12} locale={locale} hint="Au 20 septembre 2026" />
```
Props: `label`, `value` (a `number` animates; a string/node does not), `icon`, `iconTone`, `hint`,
`locale`, `format` (`Intl.NumberFormatOptions`), `tone` `default|invert`, `className`.
CSS: `.am-stat`, `__icon __value __label __hint`, `[data-tone="invert"]` on navy.

### IconTile
```tsx
<IconTile name="shield-check" tone="success" size="lg" />
```
`tone` `brand|success|warning|danger|neutral|navy|invert`, `size` `sm|md|lg` (36/44/56px).
CSS: `.am-icontile[data-tone][data-size]`.

### Badge
```tsx
<Badge tone="approved" icon={<Icon name="badge-check" size={16} />}>Agree</Badge>
<Badge tone="sponsored">Sponsorise</Badge>
<Badge dot tone="pilot" size="lg">Pilote</Badge>
```
`tone` `approved|sponsored|new|pilot|soon|neutral`, `icon`, `dot`, `size` `sm|lg`, `title`,
`className`. CSS: `.am-badge[data-tone][data-size]`, `.am-badge__dot`.

### Notice (auto icon per tone, never closable)
```tsx
<Notice tone="indicative">Offre indicative, prix indicatif, a confirmer par le courtier partenaire.</Notice>
<Notice tone="error" role="alert" title="Envoi impossible">{message}</Notice>
```
`tone` `indicative|info|success|error`, `title`, `role` `alert|status|note`, `icon` (override),
`compact`, `className`. CSS: `.am-notice[data-tone][data-compact]`, `__icon __title __body`.
A standalone notice keeps a 16px bottom margin; inside a parent that already owns the rhythm
(`.am-stack`, `.am-cluster`, `.am-grid`, `.am-hero__inner`, any `*__stack`) and as the last child of
its container, that margin is cancelled — never add a wrapper just to fix the spacing.

### Field + `fieldControlProps` (unchanged API)
```tsx
<Field id="email" label={t("email")} hint={t("emailHint")} error={errors.email} required requiredLabel={forms("required")} leading="mail">
  <input {...fieldControlProps("email", { hint, error, required: true })} name="email" type="email" />
</Field>
```
`leading` (optional `IconName`) and `className` are the only additions. CSS: `.am-field`,
`__label __required __control __wrap __leading __hint __error`. `select.am-field__control` gets the
design-system chevron. Checkbox rows: `.am-checkline` (44px tap target) — or leave the `<label>`
unclassed and the same style applies. Optional `.am-switch`, `.am-fieldset`, `.am-legend`.

### RadioCards
```tsx
<RadioCards name="profile" legend={t("legend")} options={[{ value: "visitor", label: t("visitor"), description: t("visitorHint"), icon: "user" }]} />
```
CSS: `.am-radiocards`, `__legend __list`, `.am-radiocard`, `__icon __body __label __description`
(checked = primary ring + primary-50).

### Table
```tsx
<div className="am-table-wrap"><table className="am-table am-table--striped">…</table></div>
```
Rounded frame, scroll-shadow hints, sticky uppercase header, hover row.

### FAQ / accordion
```tsx
<div className="am-faq">
  <details className="am-faq__item"><summary>{q}</summary><p className="am-faq__answer">{a}</p></details>
</div>
```
CSS-drawn chevron rotates on open; `::details-content` animates the height where supported.
`.pub-score` (score/FAQ disclosures already in the pages) gets the same treatment.

### EmptyState
```tsx
<EmptyState icon="search" align="center" tone="muted" title={t("noneTitle")} description={t("noneLead")} action={<Button href="/pays">{t("browse")}</Button>} />
```
`icon`, `tone` `default|muted|brand`, `align` `start|center`. One action at most — never repeat a
button already on the page. CSS: `.am-empty[data-tone][data-align]`, `__icon __title __description`.

### Skeleton
```tsx
<Skeleton shape="title" width="60%" />
<Skeleton lines={3} />
```
`shape` `text|title|block|circle`, `width`, `height`, `lines`. CSS: `.am-skeleton[data-shape]`.

### ProgressBar (stepper)
```tsx
<ProgressBar steps={steps} current={2} label={t("progressLabel")} stepLabel={t("stepOf", { n: 2 })} />
```
Circles joined by a connector: done = green tick, current = brand gradient + glow, upcoming =
neutral. Stacks vertically under 680px. CSS: `.am-progress`, `__list __step __index __label`,
`[data-state="done|current|todo"]`.

### ScorePill
`<ScorePill score={82} label={t("scoreAria", { score: 82 })} size="lg" />` — bands
`high` (>=75, green) / `mid` (>=50, blue) / `low` (neutral). `scoreBand(score)` is exported.

### Hero
```tsx
<Hero
  tone="light" size="lg" kicker={t("kicker")} title={t("title")} lead={t("lead")}
  breadcrumb={<Breadcrumb items={items} label={label} />}
  actions={<Button href="/comparer">{t("compare")}</Button>}
  aside={<Card raised>…formulaire d'entree…</Card>}
/>
```
`tone` `light|brand|navy`, `size` `sm|md|lg`, `breadcrumb`, `actions`, `children` (text column),
`aside` (second column, 2 columns from 980px). CSS: `.am-hero[data-tone][data-size]`,
`__layout[data-columns] __inner __kicker __title __lead __actions __aside __breadcrumb`.

**The `breadcrumb` prop is the standard placement of a breadcrumb.** Not
`<div class="am-container"><Breadcrumb/></div>` above the hero: that glued the trail to the header
and gave it a different left edge on every page. On navy the trail inverts automatically. A page with
no hero at all (only the broker sign-in today) wraps its trail in
`<div className="am-breadcrumbbar am-container">` (chrome.css), which supplies the top offset.

### Section
```tsx
<Section tone="muted" kicker={t("kicker")} title={t("title")} lead={t("lead")} align="center" width="wide" spacing="compact" actions={<Button variant="secondary" href="/guides">{t("all")}</Button>}>
```
`tone` `default|muted|brand|navy|canvas` (muted = white band over the canvas — the main rhythm
device; navy = dark band with inverted text), `align`, `width` `default|wide|narrow`, `spacing`
`default|compact`, `headingLevel`, `id`, `ariaLabel`. CSS: `.am-section[data-tone][data-spacing]`,
`__header[data-align] __kicker __title __lead __actions`.

### Others
`Breadcrumb` (chevrons, bold current), `BrokerBlock` (initials tile + licence line with a shield
icon; `variant` `card|line|full`), `AiBox` (sparkles pill + soft gradient panel + permanent
disclaimer), `ComparisonBar` (floating blurred pill, slides up, hidden under 2 selections),
`WhatsAppButton`, `Logo`, `LanguageSwitcher`, `BackendText`, `JsonLd`, `Divider`
(`.am-divider[data-spacing][data-orientation]`), plus the standalone classes `.am-pill-list` /
`.am-pill` (guarantee pills) and `.am-kbd`.

## 3.bis Colour pairs that were measured

Every pair below was checked with the WCAG 2.x relative-luminance formula. Re-measure before you
change any of them.

| Pair | Ratio |
| --- | --- |
| `Badge tone="sponsored"` — `warning-800` on `warning-50` (border/icon `warning-600`) | 6.95:1 |
| `Badge tone="approved"` — `success-800` on `success-50` | 6.44:1 |
| `.am-score[data-band="high"]` — `success-800` on `success-100` (the green band the PRD asks for) | 5.92:1 |
| `.am-score[data-band="mid"]` — `primary-700` on `primary-100` | 9.33:1 |
| `::placeholder` — `neutral-500` on a white control | 4.97:1 |
| Navy hero breadcrumb — `primary-200` on `--am-gradient-navy` | 8.45:1 at the lightest stop |
| WhatsApp button — `--am-whatsapp-ink` on `--am-whatsapp` | 7.08:1 |

**WhatsApp is the one brand exception to the green rule.** `--am-whatsapp` / `--am-whatsapp-dark` /
`--am-whatsapp-ink` identify a *contact channel*, not a validated state, and they are confined to
`Button variant="whatsapp"`, `WhatsAppButton` and the WhatsApp glyph. Everything around such a glyph
stays neutral — the example lead ticket's "canal de rappel" row is `neutral-50` / `--am-text` with
only the icon in the brand green, precisely so the row is not read as a validation.

### Icon
`lucide-react` behind the historical API: `<Icon name="shield-check" size={24} />` — decorative
(`aria-hidden`), `currentColor`, stroke 2 (1.75 at 32px+), default size 20, class `am-icon`.
`iconNames` exports the full list (~110 names), `IconName` its type. The 21 original names still
work; `whatsapp` keeps its hand-drawn path. Useful additions: `arrow-left` `arrow-up-right`
`chevron-left` `chevron-up` `car` `plane` `heart-pulse` `home` `briefcase` `shield-check`
`badge-check` `sparkles` `bot` `lock` `eye` `clock` `calendar` `map-pin` `flag` `filter` `sliders`
`list` `layout-grid` `table` `scale` `calculator` `coins` `wallet` `receipt` `percent` `trending-up`
`bar-chart` `pie-chart` `users` `user-check` `handshake` `message-circle` `send` `paperclip`
`upload` `download` `file-text` `file-check` `check-circle` `x-circle` `alert-triangle`
`help-circle` `lightbulb` `book-open` `graduation-cap` `newspaper` `quote` `link` `share` `copy`
`settings` `refresh` `loader` `minus` `plus` `x` `more-horizontal` `sun` `moon` `zap` `award`
`target` `compass` `headphones` `building-2` `landmark` `git-branch` `workflow` `layers` `box`
`package` `thumbs-up` `smile` `banknote` `wifi-off` `database` `server` `cpu` `key` `fingerprint`
`life-buoy` `siren` `stethoscope`.

## 4. Motion (`styles/motion.css`, `components/motion/*`)

```tsx
<Reveal><Section …>…</Section></Reveal>
<Reveal as="ul" stagger className="am-grid">{items.map(…)}</Reveal>
<Reveal delay={120} from="right"><Card raised>…</Card></Reveal>
<CountUp value={1240} locale={locale} />            {/* or <Stat value={1240} /> */}
```
- `Reveal` props: `as`, `delay` (ms), `stagger`, `from` `up|left|right|scale`, `once`, `className`,
  `style`, `id`. Client component, `IntersectionObserver` at threshold 0.15 / `-10%` bottom margin.
- **Content is visible by default.** The hidden pre-state applies only under `html[data-js="true"]`,
  which `Reveal` sets on mount — no JS, no hidden content. A 1200ms timeout and
  `prefers-reduced-motion` both force the revealed state, and an element already on screen at
  hydration is revealed at once (no flash). Never write your own `opacity: 0`.
- Stagger: `[data-reveal-stagger] > *` delays each child by `--am-stagger` (`--i` or `:nth-child`
  up to 12). Pass `stagger` on the parent, nothing on the children.
- `CountUp` props: `value`, `locale`, `duration` (1400ms), `format`, `prefix`, `suffix`,
  `className`. The **server renders the final formatted value** (SEO); the animation only replaces
  it in the browser, and never under reduced motion. Output is wrapped in `.am-tabular`.
- Entrance utilities for above-the-fold content (no observer): `.am-animate-in`, `.am-animate-fade`,
  `.am-animate-scale`, `.am-animate-float`; set `style={{ "--i": 1 }}` to stagger them.
- Keyframes available: `am-fade-up`, `am-fade-in`, `am-scale-in`, `am-slide-in-right`, `am-slide-up`,
  `am-shimmer`, `am-spin`, `am-float`, `am-pulse-soft`.

## 5. The legacy `.pub-*` layer is gone

Section 26 of `components.css` (97 selectors, ~13 KB) has been **deleted**: every page now renders
design-system classes, and `grep -rn "pub-" apps/public/app --include=*.tsx` returns nothing. Do not
reintroduce a `pub-*` class; the replacements are `Card`, `Badge`, `Notice`, `Button`, `.am-table`,
`.am-grid`, `.am-form-grid` (institutional pages), `.am-formcard__grid` / `.am-steplist` (broker
pages) and `.am-criteria*` / `.am-score*` (journey pages).

Also living in `components.css`: `am-countrygrid`, `am-countrycard`, `am-countrycard__flag`,
`am-entry`, `am-entry__row` (the former `pages.css` has been deleted). `am-countryselect*`, `am-localcontact*`, `am-header*`,
`am-menu*`, `am-langswitch*`, `am-footer*`, `am-main`, `am-breadcrumbbar` belong to the chrome agent
(`styles/chrome.css`) — `am-langswitch*` in particular moved there out of `components.css`, whose
section 24 is now only a pointer.

## 6. Stylesheet order (`app/globals.css`)

`tokens` → `base` → `motion` → `components` → `chrome`. A new page stylesheet
(`styles/pages/home.css`, `styles/brokers.css`, …) is imported from its own page/layout module,
which puts it after everything above.

## 7. Do / don't

**Do** — use `Section tone="muted"` to alternate white bands over the canvas · put every number in
`.am-tabular` or `Stat` · give each card one action · wrap below-the-fold blocks in `Reveal`,
lists in `<Reveal stagger>` · use `IconTile` rather than a bare icon as a visual anchor · keep
`Notice tone="indicative"` wherever prices are shown · pass the breadcrumb through `Hero breadcrumb`
· give every `Section` a title, or the page skips a heading level · keep interactive controls at
40px minimum (44px on a phone).

**Don't** — no green background or green CTA · no sponsored badge in any colour but orange · no font
size under 14px · no close button on a notice · no `opacity: 0` outside the `Reveal` contract · no
new global element selector (`button`, `label`, `[role=…]`) · no raw hex outside `tokens.css` · no
element that *looks* like a control but is a `<p>` (the drawer's "Fermer le menu" used to be one) ·
don't edit `packages/ui/styles/tokens.css` · don't duplicate a primitive's CSS in a page sheet — add
a modifier here instead.
