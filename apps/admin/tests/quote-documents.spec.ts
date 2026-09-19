import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("admin quote request detail lists prospect documents as metadata only", () => {
  const api = readFileSync("apps/admin/app/lib/admin-api.ts", "utf8");
  const page = readFileSync("apps/admin/app/quote-requests/[quoteRequestId]/page.tsx", "utf8");

  expect(api).toContain("readAdminQuoteDocuments");
  expect(api).toContain("/documents");
  expect(page).toContain("Documents du prospect");
  expect(page).toContain("metadonnees uniquement");
  expect(page).not.toContain("storageKey");
  expect(page).not.toContain("download");
});
