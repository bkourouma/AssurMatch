import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("public quote confirmation remains visitor-safe", async () => {
  const source = readFileSync("apps/public/app/quote-requests/[publicReference]/page.tsx", "utf8");

  expect(source).toContain("Demande recue");
  expect(source).toContain("aucune promesse de rappel");
  expect(source).toContain("IndicativeOfferNotice");
});
