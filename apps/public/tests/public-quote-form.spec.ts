import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("public quote form includes validation, consent and disabled state", async () => {
  const component = readFileSync("apps/public/app/components/quote-form.tsx", "utf8");
  const page = readFileSync("apps/public/app/countries/[countryCode]/products/[productKey]/quote/page.tsx", "utf8");
  const api = readFileSync("apps/public/app/lib/public-api.ts", "utf8");

  expect(component).toContain("type=\"email\"");
  expect(component).toContain("type=\"checkbox\"");
  expect(component).toContain("submitPublicQuoteRequest");
  expect(component).toContain("publicReference");
  expect(component).toContain("QuoteBlockedState");
  expect(api).toContain("POST");
  expect(api).toContain("/quote-requests");
  expect(page).toContain("Demander un devis");
  expect(page).toContain("getPublicQuoteForm");
});
