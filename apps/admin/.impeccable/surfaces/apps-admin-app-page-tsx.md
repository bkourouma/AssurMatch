---
version: 1
slug: "apps-admin-app-page-tsx"
primary_target: "apps/admin/app/page.tsx"
related_targets: ["apps/broker/app/page.tsx","packages/ui/styles/backoffice.css"]
---

# Surface brief: back-offices (admin plateforme + courtier)

Mode: Operate. Scope: the whole authenticated shell of `apps/admin` and `apps/broker`, built once in
`packages/ui` (tokens, `backoffice.css`, `backoffice/*` components) and applied to every screen. Public
site is out of scope and must not be touched. Build path: code-first (no image generation available).

Audience and job: platform operators (all day, desk, laptop 1024-1920px) and partner brokers (between
calls, laptop and phone). Find what needs attention, act, verify, leave. Frequency: daily, hours.
Constraints: PRODUCT.md; labels, routes, data-testid and status vocabulary unchanged; nothing below
14px; WCAG AA; admin and broker must be told apart at a glance.

Unresolved: dark theme (tokens built semantic so it can follow; not shipped in this pass).

## Direction contract

THESIS: The tool disappears into the task. The category standard played straight at the craft level of
Linear, Stripe Dashboard, HubSpot/Pipedrive and Vercel/GitHub: one calm neutral surface, hairline
structure, one action colour per app. Refuses the current arrangement: a saturated navy sidebar, ten
equal KPI cards with coloured side stripes, intro cards that restate the page, 16px-padding cards
around everything.

OWN-WORLD: Neutral cool-grey ground (near-white content #fafafa-ish, white panels, 1px hairlines
~#e5e5e8, ink #15171a, muted #5f636b). Sidebar is a light neutral rail, not dark, not coloured. One
action/selection accent per app: admin azure (oklch ~0.55 0.19 255), broker plum (oklch ~0.48 0.15
340), used only for primary buttons, selected nav, links, focus ring and the app tag. Status colours
fixed and shared: green confirmed, amber caution/sponsored, red error/blocked, grey neutral, each as a
soft tint + dot + label (never colour alone, never a side stripe). Geist (UI, headings 600) and Geist
Mono (references, FCFA amounts, tabular). 14/15px body, 20/24px titles, scale 1.125-1.2. Radius 8px
panels and fields, 6px buttons and badges, 999px only for avatars/counters. No shadows except popovers
and dialogs; no gradients; no glass.

STORY: An operator opens the app and within one second sees what needs attention and how big it is,
reads a dense table without hunting, and acts with a button whose effect is named. A broker sees the
leads waiting for them first. Admin and broker are the same product with different accent, tag and
nav, never confusable.

FIRST VIEWPORT: Admin dashboard at 1440x900. Left: 248px light rail (logo, app tag "Plateforme",
grouped nav with icons, selected item = accent tint + accent text, no side stripe). Top: 52px bar with
breadcrumb left, environment tag and user menu right. Content: title 24px with one-line description;
directly below, a section "À traiter" listing actionable items (alerts, expiring licences, unrouted
leads) as compact rows with count, label and link; then a single bordered stat strip (one panel, five
dividers, big tabular numbers) replacing the grid of cards; then recent activity tables. Primary
action sits top right of the header. Broker dashboard mirrors it: leads waiting for assignment first.

FORM: canon (the standing exit, kept by the owner's choice), no dealt challenger adopted. Position on
the ordered list: user-selected exit. Seed key d748fc98.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
