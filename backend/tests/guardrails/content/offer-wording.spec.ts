import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";

describe("offer wording", () => {
  it("keeps offers indicative and never presents an official recommendation", () => {
    const text = [
      "backend/src/modules/offers/public-offer-catalog.service.ts",
      "apps/public/app/countries/[countryCode]/products/[productKey]/offers/page.tsx",
      "apps/public/app/offers/[offerId]/page.tsx"
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    expect(text).toContain("offre indicative");
    expect(text.toLocaleLowerCase("fr-FR")).not.toContain("meilleure offre");
    expect(findForbiddenWording(text)).toEqual([]);
  });
});
