import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const checkedFiles = [
  "backend/src/app.module.ts",
  "backend/src/modules/quote-requests/quote-submission.service.ts",
  "backend/src/modules/offers/public-offer-catalog.service.ts",
  "apps/public/app/components/public-journey.tsx",
  "apps/public/app/components/quote-form.tsx"
];

describe("comparator scope exclusions", () => {
  it("does not activate payment, subscription, issuance, attestation, claims or binding recommendation scope", async () => {
    const text = checkedFiles.map((file) => readFileSync(file, "utf8")).join("\n").toLocaleLowerCase("fr-FR");

    ["paymentintent", "checkout", "signature electronique", "emission de police", "attestation telechargeable", "gestion sinistre", "je recommande"].forEach((forbidden) => {
      expect(text).not.toContain(forbidden);
    });
  });
});
