import { describe, expect, it } from "vitest";
import { RETENTION_CATEGORIES, retentionErasurePreviewRequestSchema, retentionPolicyUpsertSchema } from "../../../../packages/shared/contracts/data-retention.contracts";
import {
  assertRetentionDays,
  cutoffResolver,
  DEFAULT_RETENTION_POLICIES,
  latestCutoff,
  resolveRetentionPolicy,
  retentionCutoff,
  type RetentionPolicyRecord
} from "../../../src/modules/data-retention/retention-policies";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const CI = "00000000-0000-4000-8000-0000000000c1";
const SN = "00000000-0000-4000-8000-0000000000c2";

function override(countryId: string | null, category: RetentionPolicyRecord["category"], retentionDays: number): RetentionPolicyRecord {
  return { id: crypto.randomUUID(), countryId, category, retentionDays, reason: "Validation juridique", updatedById: "compliance", createdAt: NOW, updatedAt: NOW };
}

describe("retention policies (spec 046 D1, FR-001)", () => {
  it("ships the product owner's defaults for every category", () => {
    expect(Object.keys(DEFAULT_RETENTION_POLICIES).sort()).toEqual([...RETENTION_CATEGORIES].sort());
    expect(DEFAULT_RETENTION_POLICIES.quote_requests).toEqual({ retentionDays: 730, anchor: "last_activity" });
    expect(DEFAULT_RETENTION_POLICIES.quote_documents.retentionDays).toBe(180);
    expect(DEFAULT_RETENTION_POLICIES.contact_messages.retentionDays).toBe(365);
    expect(DEFAULT_RETENTION_POLICIES.partner_applications.retentionDays).toBe(365);
    expect(DEFAULT_RETENTION_POLICIES.waitlist).toEqual({ retentionDays: 365, anchor: "country_public_since" });
    expect(DEFAULT_RETENTION_POLICIES.ai_traces.retentionDays).toBe(365);
    expect(DEFAULT_RETENTION_POLICIES.webhook_payloads.retentionDays).toBe(90);
    expect(DEFAULT_RETENTION_POLICIES.messaging_references.retentionDays).toBe(90);
  });

  it("resolves country override, then global override, then the code default", () => {
    const overrides = [override(null, "quote_requests", 1000), override(CI, "quote_requests", 365)];
    expect(resolveRetentionPolicy("quote_requests", CI, overrides)).toMatchObject({ retentionDays: 365, source: "country" });
    expect(resolveRetentionPolicy("quote_requests", SN, overrides)).toMatchObject({ retentionDays: 1000, source: "global" });
    expect(resolveRetentionPolicy("quote_requests", null, overrides)).toMatchObject({ retentionDays: 1000, source: "global" });
    expect(resolveRetentionPolicy("contact_messages", CI, overrides)).toMatchObject({ retentionDays: 365, source: "default" });
  });

  it("bounds a duration to 30..3650 days, and accepts null as the removal of an override", () => {
    expect(() => assertRetentionDays(29)).toThrow(/between 30 and 3650/);
    expect(() => assertRetentionDays(3651)).toThrow(/between 30 and 3650/);
    expect(() => assertRetentionDays(30)).not.toThrow();
    expect(retentionPolicyUpsertSchema.safeParse({ category: "waitlist", retentionDays: 10, reason: "Trop court pour la regle" }).success).toBe(false);
    expect(retentionPolicyUpsertSchema.safeParse({ category: "waitlist", retentionDays: null, reason: "Retour au defaut global" }).success).toBe(true);
  });

  it("refuses a reason that carries an e-mail address, so a batch never stores one", () => {
    expect(retentionPolicyUpsertSchema.safeParse({ category: "waitlist", retentionDays: 90, reason: "Demande de ama@example.test" }).success).toBe(false);
    expect(retentionErasurePreviewRequestSchema.safeParse({ email: "ama@example.test", reason: "Demande recue par courrier" }).success).toBe(true);
    expect(retentionErasurePreviewRequestSchema.safeParse({ email: "ama@example.test", publicReference: "AM-1", reason: "Demande recue par courrier" }).success).toBe(false);
    expect(retentionErasurePreviewRequestSchema.safeParse({ reason: "Demande recue par courrier" }).success).toBe(false);
  });

  it("computes per-row cutoffs for a global and a country-scoped preview", () => {
    const overrides = [override(CI, "quote_requests", 365)];
    const global = cutoffResolver("quote_requests", NOW, overrides);
    expect(global(CI)).toEqual(retentionCutoff(NOW, 365));
    expect(global(SN)).toEqual(retentionCutoff(NOW, 730));
    const scoped = cutoffResolver("quote_requests", NOW, overrides, CI);
    expect(scoped(CI)).toEqual(retentionCutoff(NOW, 365));
    expect(scoped(SN)).toBeUndefined();
    // Country-less categories ignore country overrides and resolve with the global policy only.
    expect(cutoffResolver("webhook_payloads", NOW, [override(CI, "webhook_payloads", 30)])(null)).toEqual(retentionCutoff(NOW, 90));
    // The database prefilter uses the most lenient cutoff so it never drops an eligible row.
    expect(latestCutoff("quote_requests", NOW, overrides)).toEqual(retentionCutoff(NOW, 365));
  });
});
