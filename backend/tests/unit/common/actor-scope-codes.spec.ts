import { describe, expect, it } from "vitest";
import { countryCatalog, productCatalog, resolveScopeCodes } from "../../../src/modules/common/scope/actor-scope-codes";

const countries = [
  { id: "11111111-1111-4111-8111-111111111111", isoCode: "CI" },
  { id: "22222222-2222-4222-8222-222222222222", isoCode: "SN" }
];
const products = [{ id: "33333333-3333-4333-8333-333333333333", key: "auto" }];

describe("resolveScopeCodes", () => {
  it("maps stored catalog ids to the codes the policies compare against", () => {
    expect(resolveScopeCodes([countries[0]!.id], countryCatalog(countries))).toEqual(["CI"]);
    expect(resolveScopeCodes([products[0]!.id], productCatalog(products))).toEqual(["auto"]);
  });

  it("passes through scopes already provisioned as codes", () => {
    expect(resolveScopeCodes(["CI"], countryCatalog(countries))).toEqual(["CI"]);
    expect(resolveScopeCodes(["auto"], productCatalog(products))).toEqual(["auto"]);
  });

  it("handles mixed provisioning without duplicating a code reached both ways", () => {
    expect(resolveScopeCodes([countries[0]!.id, "CI", countries[1]!.id], countryCatalog(countries))).toEqual(["CI", "SN"]);
  });

  it("fails closed for unknown scopes and empty input", () => {
    expect(resolveScopeCodes(["44444444-4444-4444-8444-444444444444"], countryCatalog(countries))).toEqual([
      "44444444-4444-4444-8444-444444444444"
    ]);
    expect(resolveScopeCodes([], countryCatalog(countries))).toEqual([]);
    expect(resolveScopeCodes(undefined, countryCatalog(countries))).toEqual([]);
  });
});
