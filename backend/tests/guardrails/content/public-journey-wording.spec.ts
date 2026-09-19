import { describe, expect, it } from "vitest";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";
import { messagesText, publicFile, publicPage, readFiles } from "./public-surface";

describe("public journey wording", () => {
  it("uses technical platform wording and avoids forbidden public phrases", async () => {
    const sources = readFiles([
      publicPage("countries/[countryCode]/page.tsx"),
      publicPage("countries/[countryCode]/products/[productKey]/page.tsx"),
      publicFile("components/public-journey.tsx")
    ]);
    // The journey's visible copy now lives in the catalogues, so the sources alone no longer prove
    // the platform wording is on screen.
    const text = [sources, messagesText("fr"), messagesText("en")].join("\n");

    expect(text).toContain("plateforme technique");
    expect(text).toContain("comparaison indicative");
    expect(findForbiddenWording(text)).toEqual([]);
  });
});
