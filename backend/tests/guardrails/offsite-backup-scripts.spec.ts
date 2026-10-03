import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 058 FR-005: invariants of the offsite backup scripts that a refactor must not lose. The
 * scripts themselves were exercised end to end (PostgreSQL 16 + local S3 double, age and gpg) and
 * the timings are recorded in docs/runbooks/backup-restore.md.
 */
const backup = readFileSync("scripts/ops/backup-offsite.sh", "utf8");
const restore = readFileSync("scripts/ops/restore-offsite.sh", "utf8");
const lib = readFileSync("scripts/ops/backup-lib.sh", "utf8");

describe("offsite backup scripts (spec 058 FR-005)", () => {
  it("fail fast and never trace commands (a trace would print credentials)", () => {
    for (const script of [backup, restore]) {
      expect(script).toMatch(/^set -eu$/m);
      expect(script).not.toMatch(/set -[a-z]*x/);
    }
  });

  it("refuses to upload an unencrypted backup", () => {
    expect(backup).toContain("refusing to upload plaintext");
    expect(backup).toMatch(/age --encrypt --recipients-file/);
    expect(backup).toMatch(/--symmetric --cipher-algo AES256/);
    // Plaintext is deleted as soon as it is encrypted, and the work directory on exit.
    expect(backup).toContain('rm -f "$1"');
    expect(backup).toContain("trap 'rm -rf \"$WORK\"' EXIT");
  });

  it("passes S3 credentials through stdin, never on the command line", () => {
    expect(lib).toContain("curl --config -");
    expect(lib).toContain("--aws-sigv4");
    expect(lib).not.toMatch(/--user\s+"?\$BACKUP_S3/);
  });

  it("uploads a checksum manifest last and applies a configurable remote retention", () => {
    expect(backup).toContain("sha256=");
    expect(backup.indexOf('s3_put "$MANIFEST"')).toBeGreaterThan(backup.indexOf('s3_put "$WORK/$base"'));
    expect(backup).toContain("BACKUP_RETENTION_DAYS");
  });

  it("restores only into an empty database that is not the live one, after checksum verification", () => {
    expect(restore).toContain("refusing to restore over the live database");
    expect(restore).toContain("target database is not empty");
    expect(restore).toContain("checksum mismatch");
    expect(restore.indexOf("checksum mismatch")).toBeLessThan(restore.indexOf("pg_restore --no-owner"));
    expect(restore).toContain("--exit-on-error");
  });
});
