import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const schema = readFileSync("backend/prisma/schema.prisma", "utf8");
const migration = readFileSync("backend/prisma/migrations/0017_public_site_forms/migration.sql", "utf8");

describe("public site Prisma model shape", () => {
  it("declares the waitlist, partner application and contact message models", () => {
    ["model WaitlistEntry ", "model PartnerApplication ", "model ContactMessage "].forEach((model) => expect(schema).toContain(model));
  });

  it("declares the four public site enums with their exact members", () => {
    expect(schema).toMatch(/enum WaitlistEntryStatus \{\s*[\r\n]+\s*active\s*[\r\n]+\s*unsubscribed\s*[\r\n]+\s*notified\s*[\r\n]+\}/);
    expect(schema).toMatch(/enum PartnerApplicationStatus \{\s*[\r\n]+\s*received\s*[\r\n]+\s*under_review\s*[\r\n]+\s*accepted\s*[\r\n]+\s*rejected\s*[\r\n]+\}/);
    expect(schema).toMatch(/enum ContactAudience \{\s*[\r\n]+\s*visitor\s*[\r\n]+\s*broker\s*[\r\n]+\s*insurer\s*[\r\n]+\s*press\s*[\r\n]+\}/);
    expect(schema).toMatch(/enum ContactMessageStatus \{\s*[\r\n]+\s*new\s*[\r\n]+\s*handled\s*[\r\n]+\s*spam\s*[\r\n]+\}/);
  });

  it("keeps deduplication and retention constraints explicit", () => {
    expect(schema).toContain("@@unique([countryId, emailFingerprint])");
    expect(schema).toContain("@@index([countryId, status, createdAt])");
    expect(schema).toContain("@@unique([countryId, contactEmailFingerprint, licenseNumber])");
    expect(schema).toContain("@@index([status, createdAt])");
    expect(schema).toContain("@@index([audience, status, createdAt])");
    expect(schema).toMatch(/publicReference\s+String\s+@unique/);
  });

  it("stores hashed IPs and normalized contacts, never a raw IP", () => {
    expect(schema).toMatch(/model WaitlistEntry \{[\s\S]*?ipHash\s+String\?[\s\S]*?\n\}/);
    expect(schema).toMatch(/model PartnerApplication \{[\s\S]*?ipHash\s+String\?[\s\S]*?\n\}/);
    expect(schema).toMatch(/model ContactMessage \{[\s\S]*?ipHash\s+String\?[\s\S]*?\n\}/);
    expect(schema).not.toContain("ipAddress String");
    expect(schema).toMatch(/model WaitlistEntry \{[\s\S]*?retentionUntil\s+DateTime[\s\S]*?\n\}/);
    expect(schema).toMatch(/model PartnerApplication \{[\s\S]*?contactEmailNormalized\s+String[\s\S]*?contactEmailFingerprint\s+String[\s\S]*?\n\}/);
  });

  it("gives the partner directory a city on PartnerTenant", () => {
    expect(schema).toMatch(/model PartnerTenant \{[\s\S]*?city\s+String\?[\s\S]*?\n\}/);
    expect(migration).toContain('ALTER TABLE "PartnerTenant" ADD COLUMN IF NOT EXISTS "city" TEXT');
  });

  it("ships a hand-written migration creating the enums, tables and indexes", () => {
    expect(migration).toContain('CREATE TYPE "WaitlistEntryStatus"');
    expect(migration).toContain('CREATE TYPE "PartnerApplicationStatus"');
    expect(migration).toContain('CREATE TYPE "ContactAudience"');
    expect(migration).toContain('CREATE TYPE "ContactMessageStatus"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "WaitlistEntry"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "PartnerApplication"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "ContactMessage"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistEntry_countryId_emailFingerprint_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "PartnerApplication_countryId_contactEmailFingerprint_licenseNumber_key"');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "ContactMessage_audience_status_createdAt_idx"');
    expect(migration).not.toContain('"ipAddress"');
  });
});
