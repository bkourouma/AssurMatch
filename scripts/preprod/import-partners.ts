// AssurMatch operational import (partners + licenses + offers + advisor users + documents).
//
// The bundle lives outside Git on the VPS at:
//   /home/deployer/apps/assurmatch/imports/<batch-id>/
//     manifest.json
//     partners.json
//     licenses.json
//     offers.json
//     users.json
//     documents/...
//
// Manifest contains a sha256 per file for tamper detection. Cryptographic signing is
// deferred to a future hardening spec (see seed-import-contract.md).
//
// Usage:
//   node --import tsx scripts/preprod/import-partners.ts --batch <path> --dry-run     # default
//   node --import tsx scripts/preprod/import-partners.ts --batch <path> --apply       # writes
//
// Refuses to run with NODE_ENV=test.

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

interface ManifestFile {
  name: string;
  sha256: string;
}

interface Manifest {
  batchId: string;
  createdAt: string;
  createdBy: string;
  files: ManifestFile[];
  mode: "insert" | "upsert" | "soft-delete";
}

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  return typeof value === "string" ? value : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function sha256(path: string): string {
  const buffer = readFileSync(path);
  return createHash("sha256").update(buffer).digest("hex");
}

function main(): void {
  if (process.env.NODE_ENV === "test") {
    console.error("[import-partners] Refusing to run with NODE_ENV=test");
    process.exit(2);
  }

  const batch = parseArg("batch");
  if (!batch) {
    console.error("[import-partners] Missing --batch <path>");
    process.exit(2);
  }

  const apply = hasFlag("apply");
  const dryRun = !apply || hasFlag("dry-run");

  const batchPath = resolve(batch);
  const manifestPath = resolve(batchPath, "manifest.json");

  try {
    statSync(manifestPath);
  } catch {
    console.error(`[import-partners] Missing manifest.json at ${manifestPath}`);
    process.exit(3);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
  console.warn(`[import-partners] batchId=${manifest.batchId} mode=${manifest.mode} files=${manifest.files.length} dryRun=${dryRun}`);

  // Verify SHA-256 of every listed file.
  for (const file of manifest.files) {
    const filePath = resolve(batchPath, file.name);
    try {
      const actual = sha256(filePath);
      if (actual !== file.sha256) {
        console.error(`[import-partners] sha256 mismatch for ${file.name}: expected ${file.sha256}, got ${actual}`);
        process.exit(4);
      }
    } catch (error: unknown) {
      console.error(`[import-partners] cannot read ${file.name}:`, error);
      process.exit(5);
    }
  }
  console.warn("[import-partners] All file checksums OK.");

  if (dryRun) {
    console.warn("[import-partners] Dry-run only. Run with --apply to write.");
    return;
  }

  // The actual write phase (zod validation per file, transactional upserts, AuditLog,
  // rollback.json emission) is intentionally not implemented yet — this skeleton wires
  // the safety contract and refuses unsafe behaviors. A follow-up task implements the
  // full apply path against the live PrismaClient.
  console.warn("[import-partners] --apply requested but write phase is not yet implemented in 013.");
  console.warn("[import-partners] Stop here without changing the database. Track this in a follow-up spec.");
}

main();
