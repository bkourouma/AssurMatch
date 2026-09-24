import { expect, test } from "@playwright/test";
import { messagesJson, publicLocales } from "./helpers/public-sources";
import { routing } from "../i18n/routing";

/** Every leaf key path of a nested message object, e.g. "Layout.footer.legal.cookies". */
function keyPaths(value: unknown, prefix: string, into: string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    into.push(prefix);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    keyPaths(child, prefix ? `${prefix}.${key}` : key, into);
  }
}

function leafEntries(value: unknown, prefix: string, into: Array<{ path: string; value: unknown }>): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    into.push({ path: prefix, value });
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    leafEntries(child, prefix ? `${prefix}.${key}` : key, into);
  }
}

test("the French and English key trees are identical", () => {
  const fr: string[] = [];
  const en: string[] = [];
  keyPaths(messagesJson("fr"), "", fr);
  keyPaths(messagesJson("en"), "", en);

  const frSet = new Set(fr);
  const enSet = new Set(en);
  const onlyFr = fr.filter((key) => !enSet.has(key)).sort();
  const onlyEn = en.filter((key) => !frSet.has(key)).sort();

  expect(onlyFr).toEqual([]);
  expect(onlyEn).toEqual([]);
});

test("no message value is empty", () => {
  for (const locale of publicLocales) {
    const entries: Array<{ path: string; value: unknown }> = [];
    leafEntries(messagesJson(locale), "", entries);
    const empty = entries.filter((entry) => typeof entry.value === "string" && entry.value.trim().length === 0);
    expect(empty.map((entry) => `${locale}:${entry.path}`)).toEqual([]);
  }
});

test("no message value contains a typographic apostrophe", () => {
  // The catalogue uses the plain apostrophe (') throughout; a curly one ('’) means a paste from
  // a word processor slipped past the ASCII-first house style.
  const typographicApostrophe = "’";
  for (const locale of publicLocales) {
    const entries: Array<{ path: string; value: unknown }> = [];
    leafEntries(messagesJson(locale), "", entries);
    const offending = entries.filter((entry) => typeof entry.value === "string" && entry.value.includes(typographicApostrophe));
    expect(offending.map((entry) => `${locale}:${entry.path}`)).toEqual([]);
  }
});

test("every entry in the routing path map declares both a French and an English form", () => {
  const missing: string[] = [];
  for (const [href, value] of Object.entries(routing.pathnames)) {
    if (typeof value === "string") {
      // A bare string is shared by both locales on purpose (e.g. "/contact", "/faq"): that is a
      // valid, explicit declaration of both forms, not a missing one.
      continue;
    }
    const record = value as Partial<Record<"fr" | "en", string>>;
    if (!record.fr || !record.en) missing.push(href);
  }
  expect(missing).toEqual([]);
});
