import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("public confirmation page offers optional token-bound document upload with scan states", () => {
  const api = source("apps/public/app/lib/public-api.ts");
  const page = source("apps/public/app/quote-requests/[publicReference]/page.tsx");
  const upload = source("apps/public/app/components/quote-document-upload.tsx");
  const form = source("apps/public/app/components/quote-form.tsx");

  expect(api).toContain("uploadQuoteDocument");
  expect(api).toContain("listQuoteDocuments");
  expect(api).toContain("/documents");
  expect(page).toContain("Documents optionnels");
  expect(page).toContain("quarantaine");
  expect(page).toContain("aucune promesse de rappel");
  expect(upload).toContain("accept=\"application/pdf,image/jpeg,image/png\"");
  expect(upload).toContain("n'accelerent ni ne garantissent aucune decision");
  expect(form).toContain("ajouter des documents (optionnel)");
});

test("document upload copy avoids regulated wording", () => {
  const files = ["apps/public/app/quote-requests/[publicReference]/page.tsx", "apps/public/app/components/quote-document-upload.tsx"].map(source).join("\n");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "La meilleure assurance"]) {
    expect(files).not.toContain(forbidden);
  }
});
