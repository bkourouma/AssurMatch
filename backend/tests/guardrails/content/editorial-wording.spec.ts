import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { findForbiddenEditorialWording, findForbiddenEditorialWordingForLocale } from "../../../../packages/shared/contracts/content-safety";
import { messagesText, publicLocales } from "./public-surface";

/**
 * Charter §3 editorial vocabulary (spec 050, `content/00-charte-editoriale.md`), on top of the
 * constitutional list already checked by `forbidden-wording.spec.ts`. Scope: the two visitor message
 * catalogues (every namespace, not just the ones this spec's owner writes) and every content module
 * under `apps/public/app/content/**\/*.ts` — the two places FR-003 asks the CI guardrail to cover.
 *
 * A failure names the file (or catalogue key) and the exact phrase. Fix the copy; do not widen the
 * allow-list in `content-safety.ts` without recording why in the spec that needs it.
 */

const CONTENT_ROOT = "apps/public/app/content";

function listContentTsFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listContentTsFiles(full));
      continue;
    }
    if (entry.endsWith(".ts")) found.push(full);
  }
  return found;
}

describe("editorial wording (charter §3)", () => {
  it("does not include the charter's banned vocabulary in either message catalogue", () => {
    // Locale-scoped on purpose: fr.json only ever holds French copy and en.json only English, so
    // checking each against its own half of the charter's list avoids a false positive like the
    // English "instant" matching the everyday French phrase "pour l'instant".
    const findings = publicLocales.flatMap((locale) =>
      findForbiddenEditorialWordingForLocale(messagesText(locale), locale).map((wording) => `${locale}.json:${wording}`)
    );
    expect(findings).toEqual([]);
  });

  it("does not include the charter's banned vocabulary in a content module", () => {
    const files = listContentTsFiles(CONTENT_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const findings = files.flatMap((file) =>
      findForbiddenEditorialWording(readFileSync(file, "utf8")).map((wording) => `${file.replace(/\\/g, "/")}:${wording}`)
    );
    expect(findings).toEqual([]);
  });

  it("stays diacritics-insensitive and word-boundary aware", () => {
    expect(findForbiddenEditorialWording("Une offre instantane et revolutionnaire")).toEqual(
      expect.arrayContaining(["instantané", "révolutionnaire"])
    );
    expect(findForbiddenEditorialWording("la meilleure offre du marché")).toContain("meilleure");
    expect(findForbiddenEditorialWordingForLocale("This is our best offer, coming soon", "en")).toEqual(
      expect.arrayContaining(["best", "soon"])
    );
  });

  it("never flags the noun garantie or the D2 transparency label", () => {
    expect(findForbiddenEditorialWording("Niveau de garantie et garanties incluses")).toEqual([]);
    expect(findForbiddenEditorialWording("garantie responsabilité civile")).toEqual([]);
    expect(findForbiddenEditorialWording("Réponse générée automatiquement par un outil d'IA. généré par IA")).toEqual([]);
  });
});
