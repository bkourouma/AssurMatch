import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The public site's visible text is no longer only in its page sources: since the site became
 * bilingual, the copy lives in `apps/public/messages/<locale>.json` and the pages read it through
 * translation keys. A wording guardrail that still scanned only `.tsx` files would pass on an empty
 * page and miss a regulated phrase sitting in the catalogue, so these helpers give every content
 * spec the same view of the surface: the sources AND the catalogues.
 */

const PUBLIC_APP_ROOT = "apps/public/app";
const MESSAGES_ROOT = "apps/public/messages";

export const publicLocales = ["fr", "en"] as const;
export type PublicLocale = (typeof publicLocales)[number];

/** A page path under the locale segment, e.g. `countries/[countryCode]/page.tsx`. */
export function publicPage(relativePath: string): string {
  return `${PUBLIC_APP_ROOT}/[locale]/${relativePath}`;
}

/** A shared component or library path, e.g. `components/public-journey.tsx`. */
export function publicFile(relativePath: string): string {
  return `${PUBLIC_APP_ROOT}/${relativePath}`;
}

export function readFiles(paths: readonly string[]): string {
  return paths.map((path) => readFileSync(path, "utf8")).join("\n");
}

function flattenValues(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) flattenValues(entry, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) flattenValues(entry, into);
  }
}

/** Every translated string of a locale, or of one namespace when `namespace` is given. */
export function messagesText(locale: PublicLocale, namespace?: string): string {
  const parsed: unknown = JSON.parse(readFileSync(join(MESSAGES_ROOT, `${locale}.json`), "utf8"));
  const scope =
    namespace && parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)[namespace]
      : parsed;
  const values: string[] = [];
  flattenValues(scope, values);
  return values.join("\n");
}

/** Every translated string of every locale: what a visitor can read, in either language. */
export function allMessagesText(): string {
  return publicLocales.map((locale) => messagesText(locale)).join("\n");
}

function walk(directory: string, into: string[]): void {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path, into);
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) into.push(path);
  }
}

/** Every TypeScript source of the public app. */
export function publicAppSourceFiles(): string[] {
  const files: string[] = [];
  walk(PUBLIC_APP_ROOT, files);
  return files.sort();
}

/** Sources and catalogues together: the whole public surface. */
export function publicSurfaceText(): string {
  return `${readFiles(publicAppSourceFiles())}\n${allMessagesText()}`;
}
