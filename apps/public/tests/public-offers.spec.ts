import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("public offers page includes filters, sponsorship and indicative wording", async () => {
  const list = readFileSync("apps/public/app/countries/[countryCode]/products/[productKey]/offers/page.tsx", "utf8");
  const detail = readFileSync("apps/public/app/offers/[offerId]/page.tsx", "utf8");

  expect(list).toContain("Prix indicatif minimum");
  expect(list).toContain("Offre sponsorisee");
  expect(detail).toContain("Detail de l'offre indicative");
});
