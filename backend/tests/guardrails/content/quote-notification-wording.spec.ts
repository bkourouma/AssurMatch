import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";

describe("quote notification wording", () => {
  it("excludes firm price, acceptance, contract, attestation and guaranteed callback claims", async () => {
    const text = [
      "backend/src/modules/notifications/quote-notification.service.ts",
      "backend/src/modules/quote-requests/quote-submission.service.ts",
      "apps/public/app/quote-requests/[publicReference]/page.tsx"
    ].map((file) => readFileSync(file, "utf8")).join("\n").toLocaleLowerCase("fr-FR");

    ["prix ferme", "contrat valide", "attestation", "rappel garanti", "garantie acceptee"].forEach((forbidden) => {
      expect(text).not.toContain(forbidden);
    });
    expect(findForbiddenWording(text)).toEqual([]);
  });
});
