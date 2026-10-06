import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Spec 058 FR-008: the extended secret scan (scripts/ci/secret-scan.mjs) flags provider tokens,
 * credential URLs and literal secret assignments, and accepts placeholders. Fixtures are assembled
 * at runtime so this file never contains a pattern the scan would flag in the repository.
 */
const directory = mkdtempSync(join(tmpdir(), "assurmatch-secret-scan-"));

function scan(name: string, content: string): { ok: boolean; output: string } {
  const file = join(directory, name);
  writeFileSync(file, content, "utf8");
  try {
    const output = execFileSync(process.execPath, ["scripts/ci/secret-scan.mjs", "--paths", file], { encoding: "utf8", stdio: "pipe" });
    return { ok: true, output };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

const j = (...parts: string[]) => parts.join("");

describe("extended secret scan (spec 058 FR-008)", () => {
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it.each([
    ["private key block", j("-----BEGIN ", "RSA PRIVATE KEY-----")],
    ["AWS access key id", j("AKIA", "ABCDEFGHIJKLMNOP")],
    ["GitHub token", j("ghp_", "a".repeat(36))],
    ["Slack token", j("xoxb-", "1234567890-abcdef")],
    ["Stripe live key", j("sk_", "live_", "a1b2c3d4e5f6g7h8i9j0")],
    ["Anthropic API key", j("sk-", "ant-", "api03-", "a".repeat(30))],
    ["Google API key", j("AIza", "b".repeat(35))],
    ["Sentry DSN with key", j("https://", "0123456789abcdef0123456789abcdef", "@o1.ingest.sentry.io/42")],
    ["JWT", j("eyJ", "hbGciOiJIUzI1NiJ9", ".", "eyJ", "zdWIiOiIxMjM0NTY3ODkwIn0", ".", "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV")],
    ["URL with embedded credentials", j("DATABASE_URL=postgresql://app:", "Xq9tZr7Lm2Vp", "@db.prod.internal:5432/assurmatch")]
  ])("flags a %s without printing the value", (rule, line) => {
    const result = scan("leak.txt", `${line}\n`);
    expect(result.ok).toBe(false);
    expect(result.output).toContain(rule);
    expect(result.output).not.toContain(line.slice(-12));
  });

  it("flags a literal secret assigned in an env or compose file", () => {
    expect(scan(".env.production", j("METRICS_TOKEN=", "f3a9c1d27b8e4", "\n")).ok).toBe(false);
    expect(scan("compose.yml", j("      ASSURMATCH_AUTH_TOKEN_SECRET: ", "Zt8kQ2mVx91Lr4pW", "\n")).ok).toBe(false);
  });

  it("accepts placeholders, variable references, local URLs and reviewed exceptions", () => {
    const content = [
      "METRICS_TOKEN=",
      "SENTRY_DSN=",
      "DATABASE_URL=REDACTED",
      "EMAIL_SMTP_PASS=REDACTED",
      "ASSURMATCH_AUTH_TOKEN_SECRET=${ASSURMATCH_AUTH_TOKEN_SECRET}",
      "BACKUP_S3_SECRET_ACCESS_KEY=$BACKUP_S3_SECRET_ACCESS_KEY",
      "GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
      "JWT_SECRET=replace-with-local-secret-only",
      "DATABASE_URL=postgresql://x:x@localhost:5432/x",
      "DATABASE_URL=postgresql://assurmatch:assurmatch@127.0.0.1:$PostgresPort/assurmatch",
      "POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password",
      j("DATABASE_URL=postgresql://app:", "Xq9tZr7Lm2Vp", "@db.prod.internal:5432/x # secret-scan:allow reviewed fixture")
    ].join("\n");
    const result = scan(".env.sample", `${content}\n`);
    expect(result.output).toContain("Secret scan OK");
    expect(result.ok).toBe(true);
  });

  it("keeps the historical EMAIL_SMTP_PASS rule", () => {
    expect(scan(".env.preprod", j("EMAIL_SMTP_PASS=", "abcd efgh ijkl mnop", "\n")).output).toContain("EMAIL_SMTP_PASS must be empty");
  });

  it("passes on the repository itself", () => {
    expect(execFileSync(process.execPath, ["scripts/ci/secret-scan.mjs"], { encoding: "utf8" })).toContain("Secret scan OK");
  });
});
