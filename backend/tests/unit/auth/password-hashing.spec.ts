import { describe, expect, it } from "vitest";
import { Argon2idParameters, PasswordHashingService } from "../../../src/modules/auth/password-hashing.service";

describe("PasswordHashingService", () => {
  it("uses argon2id with approved lower-bound parameters", () => {
    expect(Argon2idParameters.memoryCost).toBeGreaterThanOrEqual(65536);
    expect(Argon2idParameters.timeCost).toBeGreaterThanOrEqual(3);
    expect(Argon2idParameters.parallelism).toBeGreaterThanOrEqual(1);
  });

  it("hashes and verifies passwords", async () => {
    const service = new PasswordHashingService();
    const hash = await service.hash("correct horse battery staple");
    expect(hash).toContain("$argon2id$");
    expect(await service.verify(hash, "correct horse battery staple")).toBe(true);
    expect(await service.verify(hash, "wrong horse battery staple")).toBe(false);
  }, 20_000);

  it("runs a bogus verify path for unknown users", async () => {
    const service = new PasswordHashingService();
    await expect(service.verifyBogus("whatever-password")).resolves.toBe(false);
  }, 20_000);
});
