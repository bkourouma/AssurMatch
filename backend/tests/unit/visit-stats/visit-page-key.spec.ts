import { describe, expect, it } from "vitest";
import { VISIT_PAGE_KEYS } from "../../../../packages/shared/contracts/visit-stats.contracts";
import { visitPageKey } from "../../../../apps/public/app/lib/visit-page-key";

describe("public visit page key (spec 073 FR-008)", () => {
  it.each([
    ["/", "home"],
    ["/en", "home"],
    ["/pays", "countries"],
    ["/en/countries", "countries"],
    ["/pays/CI", "country"],
    ["/pays/CI/produits/auto", "product"],
    ["/en/countries/CI/products/auto", "product"],
    ["/pays/CI/produits/auto/offres", "offers"],
    ["/pays/CI/produits/auto/devis", "quote_form"],
    ["/en/countries/CI/products/auto/quote", "quote_form"],
    ["/comparer", "compare"],
    ["/en/compare", "compare"],
    ["/offres/9f1c", "offer"],
    ["/en/offers/9f1c", "offer"],
    ["/demandes-de-devis/AM-2026-0001", "quote_submitted"],
    ["/quote-requests/AM-2026-0001/documents", "tracking"],
    ["/suivi", "tracking"],
    ["/en/track", "tracking"],
    ["/pays/CI/courtiers", "other"],
    ["/faq", "other"],
    ["/anything/else", "other"]
  ])("%s -> %s", (path, key) => {
    expect(visitPageKey(path)).toBe(key);
  });

  it("only ever returns a key of the closed list", () => {
    for (const path of ["/", "/x", "/pays/A/B/C/D/E/F", "/en/en/pays"]) expect(VISIT_PAGE_KEYS).toContain(visitPageKey(path));
  });
});
