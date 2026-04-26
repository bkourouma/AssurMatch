import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("public localized wording", () => {
  it("keeps French legal notices and safe CTAs available on public pages", async () => {
    const text = [
      "apps/public/app/components/public-journey.tsx",
      "apps/public/app/components/quote-form.tsx",
      "apps/public/app/quote-requests/[publicReference]/page.tsx"
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    const normalized = text.toLocaleLowerCase("fr-FR");
    expect(text).toContain("Comparer les offres");
    expect(text).toContain("Demander un devis");
    expect(normalized).toContain("courtier partenaire");
    expect(normalized).toContain("offre indicative");
  });
});
