import { describe, expect, it } from "vitest";
import { parseHttpInput } from "../../src/modules/common/http/zod-validation";
import { loginRequestSchema } from "../../../packages/shared/contracts/auth.contracts";

describe("runtime validation contract", () => {
  it("rejects invalid DTOs before service mutation", async () => {
    expect(() => parseHttpInput(loginRequestSchema, { email: "not-email" })).toThrow("Validation failed");
  });
});
