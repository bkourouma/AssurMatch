import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";
import { messagesText, publicLocales, publicPage } from "./public-surface";

const checkedFiles = [
  publicPage("page.tsx"),
  publicPage("countries/page.tsx"),
  "apps/admin/app/catalog/page.tsx",
  "apps/admin/app/partners/page.tsx",
  "apps/admin/app/users/page.tsx",
  "apps/admin/app/operations/page.tsx"
];

describe("forbidden regulated wording", () => {
  it("does not include forbidden sales or binding-advice wording", async () => {
    const findings = checkedFiles.flatMap((file) => findForbiddenWording(readFileSync(file, "utf8")).map((wording) => `${file}:${wording}`));
    expect(findings).toEqual([]);
  });

  it("does not include forbidden wording in any public message catalogue", async () => {
    // Both locales: a banned phrase is just as regulated in English as in French.
    const findings = publicLocales.flatMap((locale) => findForbiddenWording(messagesText(locale)).map((wording) => `${locale}.json:${wording}`));
    expect(findings).toEqual([]);
  });
});
