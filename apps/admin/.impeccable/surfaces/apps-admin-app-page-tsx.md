---
version: 1
slug: "apps-admin-app-page-tsx"
primary_target: "apps/admin/app/page.tsx"
related_targets: ["apps/broker/app/page.tsx","packages/ui/styles/backoffice.css"]
---

# Surface brief: back-offices (admin plateforme + courtier)

Mode: Operate. Scope: the whole authenticated shell of `apps/admin` and `apps/broker`, built once in
`packages/ui` (tokens, `backoffice.css`, `backoffice/*` components) and applied to every screen. Public
site out of scope. Build path: code-first (no image generation available).
Round 2 (2026-10-08): the first build (standard SaaS, light, Geist) was rejected by the owner as too
sober on colour, layout and type. The owner chose the dealt direction "operate-c-emission-line-rail".

Audience and job: platform operators (all day, desk, 1024-1920px) and partner brokers (between calls,
laptop and phone). Find what needs attention, act, verify. Constraints: PRODUCT.md; labels, routes,
data-testid and status vocabulary unchanged; nothing below 14px; WCAG AA contrast on the dark ground.

## Direction contract

THESIS: A spectrogram lying on a viewing box: a charcoal continuum, bone legends, and colour that
exists only as thin emission lines. State is carried by the form of the line (solid, dashed,
half-height, struck, doubled), never by a coloured fill. Refuses the default back-office: light grey
panels, pastel status pills, a card grid of KPIs.

OWN-WORLD: Charcoal ground #141517, ash plates #1d1f22 with 1px lines #34373c, bone ink #e8e5da,
muted bone #a6a395 and #8b8879. Emission hues only as lines and marks: admin cyan (486nm), broker
violet (405nm, lifted for contrast), status green 546, sodium yellow 589 (the doubled line = do first),
red 656, blue 436. Primary action = a solid bone plate with charcoal text. One grotesque, Archivo
(variable width and weight: semi-wide light for titles, semi-condensed for table and labels), Spline
Sans Mono for figures, references and amounts. 2px corners, no shadows except popovers, no gradients
as fills, native controls set to dark. Light variant is out of scope.

STORY: The operator opens the app and reads, in one pass, which queues hold work and how much: every
queue is a row with an emission line positioned on a shared scale. Tables read as lists of aligned
lines; the leading mark of a row says its state without colour. Admin and broker share the system and
are told apart by their lead wavelength (cyan or violet) and the app tag.

FIRST VIEWPORT: Admin dashboard at 1440x900. Left: 256px charcoal rail with a tick scale: each nav
entry has a short tick, the open entry's tick extends into a long lit line in the app's wavelength.
Content: a graduated scale across the top of the page with one lit tick showing the position of the
open section, then the page title at 36px light, then the "A traiter" plate: one row per queue, label
left, a 1px scale in the middle with the queue's line standing at its share of the largest queue
(solid, dashed or doubled by urgency), the count in mono at the right. Below: a stat row of five mono
figures at 40px separated by hairlines, then recent work tables. Primary action top right.

FORM: operate-c-emission-line-rail, challenger chosen by the user in a bolder-register re-roll
(re-roll 1). Seed key d748fc98.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
