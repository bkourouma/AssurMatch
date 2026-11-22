import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "../backoffice/shell/app-shell";
import { AuthShell } from "../backoffice/shell/auth-shell";
import { findActive } from "../backoffice/shell/navigation";
import type { NavGroup } from "../backoffice/shell/navigation";
import { UserMenu } from "../backoffice/shell/user-menu";

const navigation: NavGroup[] = [
  {
    title: "Pilotage",
    items: [
      { label: "Tableau de bord", href: "/dashboard", icon: "dashboard" },
      {
        label: "Leads",
        href: "/leads",
        badge: "3",
        badgeLabel: "3 leads à traiter",
        children: [
          { label: "Nouveaux", href: "/leads/new" },
          { label: "Archivés", href: "/leads/archived" }
        ]
      },
      { label: "Facturation", href: "/billing", disabled: true, disabledHint: "Disponible avec le plan Pro" }
    ]
  }
];

function renderShell(pathname: string, extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(
      AppShell,
      {
        brand: { scope: "Back-office Test", homeHref: "/" },
        navigation,
        logoutLabel: "Sortir",
        pathname,
        navLabel: "Navigation principale",
        menuOpenLabel: "Ouvrir le menu",
        menuCloseLabel: "Fermer le menu",
        userMenuLabel: "Menu du compte",
        user: { label: "Jeanne Martin" },
        children: createElement("p", null, "Contenu"),
        ...extra
      }
    )
  );
}

describe("AppShell", () => {
  it("starts with a skip link that targets the focusable main landmark", () => {
    const html = renderShell("/dashboard");
    expect(html).toContain('<a class="bo-skip-link" href="#bo-content">Aller au contenu principal</a>');
    expect(html.indexOf("bo-skip-link")).toBeLessThan(html.indexOf("<aside"));
    expect(html).toContain('<main class="bo-content" id="bo-content" tabindex="-1">');
    expect(html.match(/<main/g)).toHaveLength(1);
  });

  it("lets the surface word the skip link", () => {
    expect(renderShell("/dashboard", { skipLinkLabel: "Skip to content" })).toContain(">Skip to content</a>");
  });

  it("marks the current page with aria-current and the parent of a current sub-entry with true", () => {
    const onPage = renderShell("/dashboard");
    expect(onPage).toMatch(/<a class="bo-nav__link" href="\/dashboard" aria-current="page">/u);
    const onChild = renderShell("/leads/new");
    expect(onChild).toMatch(/<a class="bo-nav__link" href="\/leads" aria-current="true">/u);
    expect(onChild).toMatch(/href="\/leads\/new" aria-current="page"/u);
    expect(findActive(navigation, "/leads/new")?.child?.label).toBe("Nouveaux");
  });

  it("names the current screen in the mobile topbar", () => {
    expect(renderShell("/leads/new")).toContain('<span class="bo-topbar__title" aria-current="page">Nouveaux</span>');
  });

  it("describes a disabled entry and speaks a numeric badge", () => {
    const html = renderShell("/dashboard");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-describedby="bo-nav-hint-0-2"');
    expect(html).toContain('<span class="bo-visually-hidden" id="bo-nav-hint-0-2">Disponible avec le plan Pro</span>');
    expect(html).toContain('<span class="bo-nav__badge" aria-hidden="true">3</span><span class="bo-visually-hidden">3 leads à traiter</span>');
  });

  it("links the menu button to the sidebar it opens and keeps its labels", () => {
    const html = renderShell("/dashboard");
    expect(html).toContain('<aside class="bo-sidebar" id="bo-sidebar">');
    expect(html).toMatch(/<button class="bo-topbar__menu" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="bo-sidebar">/u);
    expect(html).toContain('aria-label="Navigation principale"');
    expect(html).toContain('data-nav-open="false"');
    expect(html).not.toContain("inert");
  });
});

describe("UserMenu", () => {
  it("renders closed with the menu popup contract", () => {
    const html = renderToStaticMarkup(createElement(UserMenu, { label: "Jeanne Martin", menuLabel: "Menu du compte", logoutLabel: "Sortir" }));
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/aria-controls="bo-user-menu-[^"]+"/u);
    expect(html).not.toContain('role="menu"');
  });
});

describe("AuthShell", () => {
  it("wraps the panel in the single main landmark and keeps the surface data attributes", () => {
    const html = renderToStaticMarkup(
      createElement(AuthShell, { scope: "Back-office Test", dataAttributes: { "data-test-auth": "simple" }, children: createElement("h1", null, "Connexion") })
    );
    expect(html).toContain('<main class="bo-auth" data-test-auth="simple">');
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain("<h1>Connexion</h1>");
  });
});

/* ---------- Contrast of the shell tokens (WCAG 2.x AA, text: 4.5:1) ---------- */

type Oklch = [number, number, number];

function toLuminance([lightness, chroma, hue]: Oklch): number {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map((value) => Math.min(1, Math.max(0, value)));
  const [r = 0, g = 0, bl = 0] = linear;
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function ratio(foreground: Oklch, background: Oklch): number {
  const x = toLuminance(foreground);
  const y = toLuminance(background);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const css = readFileSync(new URL("../styles/backoffice.css", import.meta.url), "utf8");

/** Declarations of the first top-level rule whose selector is exactly `selector`. */
function block(selector: string): string {
  const marker = `\n${selector} {`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`rule not found: ${selector}`);
  return css.slice(start, css.indexOf("\n}", start + marker.length));
}

function token(declarations: string, name: string): Oklch | undefined {
  const found = new RegExp(`--bo-${name}: oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`, "u").exec(declarations);
  return found ? [Number(found[1]), Number(found[2]), Number(found[3])] : undefined;
}

function scalar(declarations: string, name: string): number | undefined {
  const found = new RegExp(`--bo-${name}: ([\\d.]+);`, "u").exec(declarations);
  return found ? Number(found[1]) : undefined;
}

describe("shell colour contrast", () => {
  const themes = [
    { name: "clair", dark: false },
    { name: "sable", dark: false },
    { name: "sombre", dark: true },
    { name: "bleu", dark: true },
    { name: "foret", dark: true },
    { name: "prune", dark: true }
  ];

  for (const theme of themes) {
    for (const app of ["admin", "broker"] as const) {
      it(`${theme.name} / ${app}: text and accent keep 4.5:1 on ground, surface and rail`, () => {
        const root = block(":root");
        const own = theme.name === "clair" ? root : block(`[data-theme="${theme.name}"]`);
        const pick = (name: string): Oklch => {
          const value = token(own, name) ?? token(root, name);
          if (!value) throw new Error(`missing token ${name}`);
          return value;
        };
        const modeBlock = theme.dark ? block('[data-mode="dark"]') : "";
        const brokerBlock = app === "broker" ? block('[data-app="broker"]') : "";
        const brokerDark = app === "broker" && theme.dark ? block('[data-mode="dark"][data-app="broker"]') : "";
        const hue = scalar(brokerBlock, "hue") ?? scalar(root, "hue") ?? 215;
        const lightness = scalar(brokerDark, "accent-l") ?? scalar(modeBlock, "accent-l") ?? scalar(root, "accent-l") ?? 0.5;
        const chroma = scalar(brokerDark, "accent-c") ?? scalar(brokerBlock, "accent-c") ?? scalar(modeBlock, "accent-c") ?? scalar(root, "accent-c") ?? 0.12;
        const accent: Oklch = [lightness, chroma, hue];

        const ground = pick("ground");
        const surface = pick("surface");
        const rail = pick("rail");
        const checks: Array<[string, number]> = [
          ["ink/ground", ratio(pick("ink"), ground)],
          ["ink-2/surface", ratio(pick("ink-2"), surface)],
          ["ink-3/surface", ratio(pick("ink-3"), surface)],
          ["ink-3/ground", ratio(pick("ink-3"), ground)],
          ["ink-3/rail", ratio(pick("ink-3"), rail)],
          ["accent/ground", ratio(accent, ground)],
          ["accent/surface", ratio(accent, surface)],
          ["accent/rail", ratio(accent, rail)]
        ];
        for (const [pair, value] of checks) expect(value, pair).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
