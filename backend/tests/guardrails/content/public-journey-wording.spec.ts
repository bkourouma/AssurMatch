import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";

describe("public journey wording", () => {
  it("uses technical platform wording and avoids forbidden public phrases", async () => {
    const text = [
      "apps/public/app/countries/[countryCode]/page.tsx",
      "apps/public/app/countries/[countryCode]/products/[productKey]/page.tsx",
      "apps/public/app/components/public-journey.tsx"
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    expect(text).toContain("plateforme technique");
    expect(text).toContain("comparaison indicative");
    expect(findForbiddenWording(text)).toEqual([]);
  });
});
