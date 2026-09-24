import { describe, expect, it } from "vitest";
import { countryUpdateSchema, productUpdateSchema } from "../../../../packages/shared/contracts/catalog.contracts";
import { partnerUpdateSchema } from "../../../../packages/shared/contracts/partner.contracts";
import { userUpdateSchema } from "../../../../packages/shared/contracts/auth.contracts";
import { pickDefined, toPatchSchema } from "../../../../packages/shared/validation/patch.schemas";
import { z } from "zod";

describe("patch schemas", () => {
  it("drops the defaults a create schema declares", () => {
    const create = z.object({ name: z.string(), status: z.enum(["draft", "public"]).default("draft") });
    expect(create.partial().parse({})).toEqual({ status: "draft" });
    expect(toPatchSchema(create).parse({})).toEqual({});
  });

  it("unwraps chained defaults and keeps already optional fields optional", () => {
    const patch = toPatchSchema(z.object({ a: z.string().default("x").default("y"), b: z.string().optional() }));
    expect(patch.parse({})).toEqual({});
    expect(patch.parse({ a: "set" })).toEqual({ a: "set" });
  });

  it("leaves country status and unmentioned flags out of a partial payload", () => {
    const parsed = countryUpdateSchema.parse({ flags: { country_ai_enabled: true }, reason: "enable ai only" });
    expect(parsed).toEqual({ flags: { country_ai_enabled: true }, reason: "enable ai only" });
  });

  it("leaves product status sensitivity and unmentioned flags out of a partial payload", () => {
    const parsed = productUpdateSchema.parse({ flags: { product_ai_scoring_enabled: true }, reason: "enable scoring only" });
    expect(parsed).toEqual({ flags: { product_ai_scoring_enabled: true }, reason: "enable scoring only" });
  });

  it("leaves partner plan status and quota out of a partial payload", () => {
    expect(partnerUpdateSchema.parse({ tradeName: "Broker CI", reason: "rename the partner" })).toEqual({
      tradeName: "Broker CI",
      reason: "rename the partner"
    });
  });

  it("leaves user scopes out of a partial payload", () => {
    expect(userUpdateSchema.parse({ displayName: "Ada", reason: "rename the account" })).toEqual({
      displayName: "Ada",
      reason: "rename the account"
    });
  });

  it("refuses to carry an id through an update payload", () => {
    const parsed = countryUpdateSchema.parse({ id: "00000000-0000-4000-8000-0000000000ff", reason: "move the identifier" });
    expect(parsed).not.toHaveProperty("id");
  });

  it("pickDefined skips keys spelled as undefined", () => {
    expect(pickDefined({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect(pickDefined(undefined)).toEqual({});
  });
});
