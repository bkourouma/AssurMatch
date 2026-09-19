import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The public visitor app moved every page from `app/<route>/page.tsx` to
 * `app/[locale]/<route>/page.tsx`, and moved almost every visible string out of the page sources
 * into `apps/public/messages/<locale>.json`. A spec that still reads the old page path or looks for
 * French copy inside a `.tsx` file fails before it asserts anything useful, or passes against an
 * empty page while a regulated phrase actually lives in the catalogue.
 *
 * These helpers give every spec the same view of the surface, mirroring the approach of
 * `backend/tests/guardrails/content/public-surface.ts`: a structural marker (an identifier, a prop, an
 * endpoint string) is asserted against a page or component source; a copy marker (a French or English
 * sentence) is asserted against the message catalogues.
 */

const PUBLIC_APP_ROOT = "apps/public/app";
const MESSAGES_ROOT = "apps/public/messages";

export const publicLocales = ["fr", "en"] as const;
export type PublicLocale = (typeof publicLocales)[number];

/** A page path under the locale segment, e.g. `publicPage("countries/[countryCode]/page.tsx")`. */
export function publicPage(relativePath: string): string {
  return `${PUBLIC_APP_ROOT}/[locale]/${relativePath}`;
}

/** A shared component, library or content path outside the locale segment, e.g. `components/quote-form.tsx`. */
export function publicFile(relativePath: string): string {
  return `${PUBLIC_APP_ROOT}/${relativePath}`;
}

/** Reads one source file as text. */
export function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

/** Reads several source files and joins them, so a spec can assert across a small set of files at once. */
export function readSources(paths: readonly string[]): string {
  return paths.map((path) => readSource(path)).join("\n");
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

/** The parsed JSON of one locale's message catalogue. */
export function messagesJson(locale: PublicLocale): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES_ROOT, `${locale}.json`), "utf8")) as Record<string, unknown>;
}

/** Every translated string of a locale, or of one namespace (e.g. "QuoteForm") when `namespace` is given, flattened to text. */
export function messagesText(locale: PublicLocale, namespace?: string): string {
  const parsed = messagesJson(locale);
  const scope = namespace ? parsed[namespace] : parsed;
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
    const path = join(directory, entry).replace(/\\/g, "/");
    if (statSync(path).isDirectory()) {
      walk(path, into);
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) into.push(path);
  }
}

/** Every TypeScript source of the public app (pages, components, content and lib), sorted. */
export function publicAppSourceFiles(): string[] {
  const files: string[] = [];
  walk(PUBLIC_APP_ROOT, files);
  return files.sort();
}

/** Every `page.tsx` under the `[locale]` segment, sorted. */
export function publicPageFiles(): string[] {
  return publicAppSourceFiles().filter(
    (path) => path.startsWith(`${PUBLIC_APP_ROOT}/[locale]/`) && path.endsWith("/page.tsx")
  );
}

/** Sources and catalogues together: the whole public surface, for a broad wording guardrail. */
export function publicSurfaceText(): string {
  return `${readSources(publicAppSourceFiles())}\n${allMessagesText()}`;
}
