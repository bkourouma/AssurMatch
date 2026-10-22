import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";

// Spec 075 sections F and G: sitemap / robots coherence and translated global-error boundaries.

vi.mock("../../../apps/public/app/lib/public-api", () => ({
  listCountryDirectory: async () => ({ status: "success", data: [{ isoCode: "CI", availability: "open" }, { isoCode: "SN", availability: "waitlist" }] }),
  listPublicProducts: async () => ({ status: "success", data: [{ key: "auto" }] })
}));

vi.mock("../../../apps/public/app/lib/seo", async () => {
  // The real module pulls next-intl/navigation (needs the Next runtime); same URL building here.
  const { routing: realRouting } = await import("../../../apps/public/i18n/routing");
  return {
    localeUrl: (locale: string, href: string, params: Record<string, string> = {}) => {
      const entry = (realRouting.pathnames as Record<string, string | Record<string, string>>)[href] ?? "";
      const template = typeof entry === "string" ? entry : (entry[locale] ?? "");
      const path = template.replace(/\[(\w+)\]/g, (_m, key: string) => params[key] ?? "");
      const prefix = locale === realRouting.defaultLocale ? "" : `/${locale}`;
      return `http://127.0.0.1:3601${path === "/" ? prefix || "/" : prefix + path}`;
    }
  };
});

const { routing } = await import("../../../apps/public/i18n/routing");
const { default: sitemap } = await import("../../../apps/public/app/sitemap");
const { default: robots } = await import("../../../apps/public/app/robots");

/** Static routes deliberately absent from the sitemap, with the reason. */
const NOT_LISTED: Record<string, string> = {
  "/quote-requests/[publicReference]": "robots",
  "/track": "robots",
  "/feedback/[publicReference]": "robots",
  "/unsubscribe": "robots",
  "/countries/[countryCode]/products/[productKey]/quote": "robots",
  "/compare": "query-driven result page, not a stable landing page",
  "/brokers/apply/confirmation": "noindex confirmation page",
  "/offers/[offerId]": "dynamic, no public list endpoint yet",
  "/countries/[countryCode]/brokers/[partnerId]": "dynamic, no public list endpoint yet"
};

function urlPath(url: string): string {
  return new URL(url).pathname;
}

function isDisallowed(path: string, disallow: string[]): boolean {
  return disallow.some((rule) => {
    // robots.txt semantics: "*" matches any sequence, rules match as prefixes.
    const escaped = rule.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`^${escaped.join(".*")}`).test(path);
  });
}

describe("public sitemap coherence", () => {
  it("lists every static indexable route in both locales with alternates", async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    const staticRoutes = Object.keys(routing.pathnames).filter((href) => !href.includes("["));

    for (const href of staticRoutes) {
      if (NOT_LISTED[href]) continue;
      for (const locale of routing.locales) {
        const pathname = routing.pathnames[href as keyof typeof routing.pathnames];
        const localized = typeof pathname === "string" ? pathname : (pathname as Record<string, string>)[locale];
        const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
        const expected = localized === "/" ? prefix || "/" : `${prefix}${localized}`;
        expect([...urls].map(urlPath), `${href} (${locale})`).toContain(expected);
      }
    }

    for (const entry of entries) {
      expect(Object.keys(entry.alternates?.languages ?? {}).sort()).toEqual([...routing.locales].sort());
    }
  });

  it("lists the dynamic catalogue pages of active countries only", async () => {
    const paths = (await sitemap()).map((entry) => urlPath(entry.url));
    expect(paths).toContain("/pays/CI/mentions-legales");
    expect(paths).toContain("/en/countries/CI/products/auto/offers");
    expect(paths.some((path) => path.includes("/SN"))).toBe(false);
  });

  it("never lists a URL that robots.ts forbids, nor an admin/broker page", async () => {
    const { rules } = robots();
    const paths = (await sitemap()).map((entry) => urlPath(entry.url));
    const forbidden = paths.filter((path) => isDisallowed(path, rules.disallow));
    expect(forbidden).toEqual([]);
    expect(paths.filter((path) => /\/(admin|backoffice|dashboard)(\/|$)/.test(path))).toEqual([]);
  });

  it("robots.ts forbids the routes marked 'robots' in both locales", () => {
    const { rules } = robots();
    for (const [href, reason] of Object.entries(NOT_LISTED)) {
      if (reason !== "robots") continue;
      const pathname = routing.pathnames[href as keyof typeof routing.pathnames] as unknown as Record<string, string>;
      const sample = (value: string) => value.replace(/\[[^\]]+\]/g, "X");
      expect(isDisallowed(sample(pathname.fr ?? ""), rules.disallow), `${href} fr`).toBe(true);
      expect(isDisallowed(`/en${sample(pathname.en ?? "")}`, rules.disallow), `${href} en`).toBe(true);
    }
  });
});

describe("global-error boundaries", () => {
  const apps = ["public", "admin", "broker"] as const;

  it("exists in the three apps, client component with its own html/body and no next-intl", () => {
    for (const app of apps) {
      const path = `apps/${app}/app/global-error.tsx`;
      expect(existsSync(path), path).toBe(true);
      const source = readFileSync(path, "utf8");
      expect(source.startsWith('"use client"')).toBe(true);
      expect(source).toContain("<html");
      expect(source).toContain("<body");
      expect(source.split(/\r?\n/).filter((line) => line.startsWith("import "))).toEqual(['import { useEffect, useState } from "react";']);
      expect(source).not.toContain("error.message");
      expect(source).not.toContain("error.stack");
    }
  });

  it("renders the French copy by default, with retry and no technical detail", async () => {
    // No type declarations for react-dom/server in this repo: typed locally.
    const { renderToString } = (await import("react-dom/server" as string)) as { renderToString: (node: unknown) => string };
    for (const app of apps) {
      const { default: GlobalError } = await import(`../../../apps/${app}/app/global-error.tsx`);
      const error = Object.assign(new Error("SECRET stack trace PrismaClientKnownRequestError"), { digest: "abc123" });
      const html = renderToString(createElement(GlobalError, { error, reset: () => undefined }));
      expect(html).toContain('lang="fr"');
      expect(html).toContain("Une erreur est survenue");
      expect(html).toContain("Réessayer");
      expect(html).toContain("abc123");
      expect(html).not.toContain("SECRET");
      expect(html).not.toContain("Prisma");
    }
  });

  it("ships an English translation in each app", () => {
    for (const app of apps) {
      const source = readFileSync(`apps/${app}/app/global-error.tsx`, "utf8");
      expect(source).toContain("Something went wrong");
      expect(source).toContain("Try again");
    }
  });
});
