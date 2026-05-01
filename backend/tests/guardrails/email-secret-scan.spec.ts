import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  ".env.example",
  ".env.preproduction.example",
  "launch-local.bat",
  "launch-preprod.bat",
  "specs/019-email-delivery-runtime/quickstart.md",
  "specs/019-email-delivery-runtime/contracts/email-runtime.md"
];

describe("email secret guardrails", () => {
  it("does not commit real SMTP passwords or Gmail app passwords in examples/scripts/docs", () => {
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/EMAIL_SMTP_PASS=(?!REDACTED)(?!%EMAIL_SMTP_PASS%)(?!\$env:EMAIL_SMTP_PASS)(?!\s*$).+/);
      expect(content).not.toMatch(/[a-z]{4}\s[a-z]{4}\s[a-z]{4}\s[a-z]{4}/i);
      expect(content).not.toContain("runtime-only-secret");
    }
  });

  it("keeps public app free of runtime email env exposure", () => {
    for (const file of sourceFiles("apps/public")) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("EMAIL_SERVICE_TYPE");
      expect(content).not.toContain("EMAIL_SMTP");
      expect(content).not.toContain("/admin/users");
    }
  });
});

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === ".next" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
