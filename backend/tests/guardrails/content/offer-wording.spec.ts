import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";
import { messagesText, publicPage, readFiles } from "./public-surface";

describe("offer wording", () => {
  it("keeps offers indicative and never presents an official recommendation", async () => {
    const sources = [
      readFileSync("backend/src/modules/offers/public-offer-catalog.service.ts", "utf8"),
      readFiles([publicPage("countries/[countryCode]/products/[productKey]/offers/page.tsx"), publicPage("offers/[offerId]/page.tsx")])
    ].join("\n");
    const text = [sources, messagesText("fr", "Offers"), messagesText("fr", "OfferDetail"), messagesText("fr", "OfferCards")].join("\n");

    expect(text).toContain("offre indicative");
    expect(text.toLocaleLowerCase("fr-FR")).not.toContain("meilleure offre");
    expect(findForbiddenWording(text)).toEqual([]);
  });
});
