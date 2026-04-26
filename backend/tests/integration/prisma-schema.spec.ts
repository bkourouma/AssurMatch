import { execSync } from "node:child_process";
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
});
