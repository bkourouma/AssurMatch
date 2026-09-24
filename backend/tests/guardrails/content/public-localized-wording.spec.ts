import { describe, expect, it } from "vitest";
import { messagesText, publicFile, publicPage, readFiles } from "./public-surface";

describe("public localized wording", () => {
  it("keeps French legal notices and safe CTAs available on public pages", async () => {
    const sources = readFiles([
      publicFile("components/public-journey.tsx"),
      publicFile("components/quote-form.tsx"),
      publicPage("quote-requests/[publicReference]/page.tsx")
    ]);
    const text = [sources, messagesText("fr")].join("\n");

    const normalized = text.toLocaleLowerCase("fr-FR");
    expect(text).toContain("Comparer les offres");
    expect(text).toContain("Demander un devis");
    expect(normalized).toContain("courtier partenaire");
    expect(normalized).toContain("offre indicative");
  });
});
