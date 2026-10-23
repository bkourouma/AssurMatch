import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("VisitCounter schema and migration 0036 (spec 073 FR-006)", () => {
  const schema = readFileSync("backend/prisma/schema.prisma", "utf8").replace(/\r\n/g, "\n");
  const migration = readFileSync("backend/prisma/migrations/0036_admin_steering/migration.sql", "utf8").replace(/\r\n/g, "\n");

  it("declares an aggregated model with exactly day, page and count", () => {
    const block = schema.match(/model VisitCounter \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(block).toContain("@@id([day, page])");
    expect(block).toMatch(/day\s+DateTime\s+@db\.Date/);
    const fields = block.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//") && !line.startsWith("@@")).map((line) => line.split(/\s+/)[0]);
    expect(fields).toEqual(["day", "page", "count"]);
  });

  it("creates the table with a composite primary key and no personal column", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "VisitCounter"');
    expect(migration).toContain('CONSTRAINT "VisitCounter_pkey" PRIMARY KEY ("day","page")');
    expect(migration).toContain('"day" DATE NOT NULL');
    for (const forbidden of ["ip", "userAgent", "referrer", "visitorId", "cookie"]) {
      expect(migration.toLowerCase()).not.toMatch(new RegExp(`"${forbidden.toLowerCase()}"`));
    }
    expect(migration).not.toMatch(/DROP|DELETE|UPDATE /);
  });
});
