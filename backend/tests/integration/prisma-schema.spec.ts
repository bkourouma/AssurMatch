import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("prisma schema validation", () => {
  it("validates the runtime schema", async () => {
    const output = execSync("npx prisma validate --schema backend/prisma/schema.prisma", {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://assurmatch:assurmatch@localhost:5432/assurmatch"
      },
      encoding: "utf8"
    });
    expect(output).toContain("The schema at");
  }, 20_000);

  it("defines auth persistence fields without plain IP storage", () => {
    const schema = readFileSync("backend/prisma/schema.prisma", "utf8");
    expect(schema).toContain("passwordHash");
    expect(schema).toContain("passwordChangeRequired Boolean @default(true)");
    expect(schema).toContain("mfaSecretEncrypted");
    expect(schema).toContain("mfaBackupCodesHashes String[]");
    expect(schema).toContain("lastLoginIpHash String?");
    expect(schema).not.toContain("lastLoginIp String?");
  });
});
