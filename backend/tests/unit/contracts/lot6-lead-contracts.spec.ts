import { afterEach, describe, expect, it, vi } from "vitest";
import { leadReassignRequestSchema } from "../../../../packages/shared/contracts/routing-rule.contracts";
import { leadProposalCreateSchema } from "../../../../packages/shared/contracts/lead-proposals";

const partnerTenantId = "00000000-0000-4000-8000-000000000001";

afterEach(() => vi.useRealTimers());

describe("lead reassignment reason (A-12a)", () => {
  it("requires at least 8 characters after trim", () => {
    expect(leadReassignRequestSchema.safeParse({ partnerTenantId, reason: "1234567" }).success).toBe(false);
    expect(leadReassignRequestSchema.safeParse({ partnerTenantId, reason: "  1234567  " }).success).toBe(false);
    expect(leadReassignRequestSchema.safeParse({ partnerTenantId, reason: "" }).success).toBe(false);
    const ok = leadReassignRequestSchema.safeParse({ partnerTenantId, reason: "  12345678  " });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.reason).toBe("12345678");
    const refused = leadReassignRequestSchema.safeParse({ partnerTenantId, reason: "court" });
    expect(!refused.success && refused.error.issues[0]?.message).toContain("at least 8 characters");
  });
});

describe("proposal validity (A-03a2)", () => {
  const base = { message: "Bonjour", priceMin: 1000 };

  it("refuses today (UTC) even at the end of the day, accepts tomorrow from 00:00:00 UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T10:00:00.000Z"));
    expect(leadProposalCreateSchema.safeParse({ ...base, validUntil: "2026-11-12T23:59:59.000Z" }).success).toBe(false);
    expect(leadProposalCreateSchema.safeParse({ ...base, validUntil: "2026-11-11T23:59:59.000Z" }).success).toBe(false);
    expect(leadProposalCreateSchema.safeParse({ ...base, validUntil: "2026-11-12T10:00:01.000Z" }).success).toBe(false);
    expect(leadProposalCreateSchema.safeParse({ ...base, validUntil: "2026-11-13T00:00:00.000Z" }).success).toBe(true);
    // The broker form sends the picked day at 23:59:59Z: tomorrow is the first accepted day.
    expect(leadProposalCreateSchema.safeParse({ ...base, validUntil: "2026-11-13T23:59:59.000Z" }).success).toBe(true);
  });

  it("follows the UTC calendar day around midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T23:59:59.000Z"));
    expect(leadProposalCreateSchema.safeParse({ ...base, validUntil: "2026-11-12T23:59:59.000Z" }).success).toBe(false);
    expect(leadProposalCreateSchema.safeParse({ ...base, validUntil: "2026-11-13T23:59:59.000Z" }).success).toBe(true);
    vi.setSystemTime(new Date("2026-11-13T00:00:01.000Z"));
    expect(leadProposalCreateSchema.safeParse({ ...base, validUntil: "2026-11-13T23:59:59.000Z" }).success).toBe(false);
  });
});
