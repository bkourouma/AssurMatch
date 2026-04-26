import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";

const checkedFiles = [
  "apps/public/app/page.tsx",
  "apps/public/app/catalog/page.tsx",
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
});
