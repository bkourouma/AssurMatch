import { expect, test } from "@playwright/test";
import { UNKNOWN_ISSUING_AUTHORITY, publicIssuingAuthority } from "../../../packages/shared/contracts/licence-issuer";
import { publicFile, readSources } from "./helpers/public-sources";

test("the internal « à compléter » issuing authority never reaches a visitor", () => {
  expect(publicIssuingAuthority(UNKNOWN_ISSUING_AUTHORITY)).toBeUndefined();
  expect(publicIssuingAuthority("")).toBeUndefined();
  expect(publicIssuingAuthority("   ")).toBeUndefined();
  expect(publicIssuingAuthority(undefined)).toBeUndefined();
  expect(publicIssuingAuthority(" Direction des Assurances CI ")).toBe("Direction des Assurances CI");
  // Every public screen that prints the authority goes through the helper.
  for (const file of ["components/quote-form.tsx", "components/ui/broker-block.tsx"]) {
    expect(readSources([publicFile(file)])).toContain("publicIssuingAuthority(");
  }
});

test("the confirmation only promises documents when the product accepts them", () => {
  const form = readSources([publicFile("components/quote-form.tsx")]);
  expect(form).toContain("quoteDocumentUploadEnabled(");
  expect(form).toContain('result.documentsEnabled ? t("trackLink") : t("trackLinkOnly")');
});
