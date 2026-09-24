import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findForbiddenWording } from "../../../../packages/shared/contracts/content-safety";
import { messagesText, publicPage, readFiles } from "./public-surface";

describe("quote notification wording", () => {
  it("excludes firm price, acceptance, contract, attestation and guaranteed callback claims", async () => {
    const sources = [
      readFileSync("backend/src/modules/notifications/quote-notification.service.ts", "utf8"),
      readFileSync("backend/src/modules/quote-requests/quote-submission.service.ts", "utf8"),
      readFiles([publicPage("quote-requests/[publicReference]/page.tsx")])
    ].join("\n");
    // Only the confirmation and tracking copy: the site elsewhere legitimately says the platform
    // issues neither a contract nor an attestation, and that negation must not fail this check.
    const text = [sources, messagesText("fr", "QuoteRequest")].join("\n").toLocaleLowerCase("fr-FR");

    ["prix ferme", "contrat valide", "attestation", "rappel garanti", "garantie acceptee"].forEach((forbidden) => {
      expect(text).not.toContain(forbidden);
    });
    expect(findForbiddenWording(text)).toEqual([]);
  });
});
