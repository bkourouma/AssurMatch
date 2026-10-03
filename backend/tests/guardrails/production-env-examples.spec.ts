import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec 057 (PRD K-06): one env example per production container, aligned with the code.
 * - every variable an example sets must be read somewhere in the code that container runs;
 * - frontends get public values only, never a secret or a database URL;
 * - variables that were documented but never read (JWT_SECRET, S3_* without prefix...) are gone.
 */
const root = process.cwd();

function keys(file: string): string[] {
  return readFileSync(join(root, file), "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter((key): key is string => Boolean(key));
}

function corpus(...directories: string[]): string {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if (entry === "node_modules" || entry === ".next" || entry === "tests") continue;
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|mjs|js)$/.test(entry)) files.push(path);
    }
  };
  for (const directory of directories) walk(join(root, directory));
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}

// Introduced by the visitor-tracking spec developed in parallel; documented ahead of its code.
const pendingKeys = new Set(["ASSURMATCH_VISITOR_TOKEN_TTL_DAYS"]);
const secretKeys = ["DATABASE_URL", "REDIS_URL", "ASSURMATCH_AUTH_TOKEN_SECRET", "ENCRYPTION_KEY", "EMAIL_SMTP_PASS", "ASSURMATCH_S3_SECRET_ACCESS_KEY", "ANTHROPIC_API_KEY"];
const deadKeys = ["JWT_SECRET", "SESSION_SECRET", "LOCAL_STORAGE_ROOT", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "COOKIE_DOMAIN", "RATE_LIMIT_GLOBAL_PER_MIN", "MFA_REQUIRED"];

describe("production env examples (spec 057)", () => {
  const backendCode = corpus("backend/src", "scripts", "packages");

  it.each([".env.production.api.example", ".env.production.worker.example"])("%s only sets variables the backend reads", (file) => {
    const unread = keys(file).filter((key) => !pendingKeys.has(key) && !backendCode.includes(key));
    expect(unread).toEqual([]);
    expect(keys(file).filter((key) => deadKeys.includes(key))).toEqual([]);
  });

  it.each([
    [".env.production.public.example", "apps/public"],
    [".env.production.admin.example", "apps/admin"],
    [".env.production.broker.example", "apps/broker"]
  ])("%s carries public values only, all read by its app", (file, app) => {
    const fileKeys = keys(file);
    expect(fileKeys.filter((key) => secretKeys.includes(key))).toEqual([]);
    expect(fileKeys.every((key) => key.startsWith("NEXT_PUBLIC_") || ["NODE_ENV", "APP_ENV"].includes(key))).toBe(true);
    const appCode = corpus(app);
    expect(fileKeys.filter((key) => !appCode.includes(key) && key !== "NODE_ENV")).toEqual([]);
  });

  it("documents the S3, antivirus, auth and proxy settings under the names the code reads", () => {
    const api = keys(".env.production.api.example");
    for (const key of ["ASSURMATCH_DOCUMENT_STORAGE", "ASSURMATCH_S3_ENDPOINT", "ASSURMATCH_S3_BUCKET", "ASSURMATCH_S3_REGION", "ASSURMATCH_S3_ACCESS_KEY_ID", "ASSURMATCH_S3_SECRET_ACCESS_KEY", "ASSURMATCH_ANTIVIRUS", "ASSURMATCH_CLAMAV_HOST", "ASSURMATCH_CLAMAV_PORT", "ASSURMATCH_AUTH_TOKEN_SECRET", "ENCRYPTION_KEY", "TRUSTED_PROXY_HOPS", "ASSURMATCH_AI_PROVIDER", "ASSURMATCH_VISITOR_TOKEN_TTL_DAYS"]) {
      expect(api, key).toContain(key);
    }
  });

  it("keeps every secret placeholder REDACTED", () => {
    for (const file of [".env.production.api.example", ".env.production.worker.example"]) {
      for (const line of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
        const match = line.match(/^(DATABASE_URL|ASSURMATCH_AUTH_TOKEN_SECRET|ENCRYPTION_KEY|EMAIL_SMTP_PASS|ASSURMATCH_S3_SECRET_ACCESS_KEY)=(.*)$/);
        if (match) expect(match[2], `${file} ${match[1]}`).toBe("REDACTED");
      }
    }
  });
});
