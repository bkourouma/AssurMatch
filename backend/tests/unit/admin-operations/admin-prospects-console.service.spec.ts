import { describe, expect, it } from "vitest";
import { adminProspectsQuerySchema } from "../../../../packages/shared/contracts/admin-operations.contracts";
import { fingerprintTypedProspectContact } from "../../../../packages/shared/security/prospect-contact-fingerprint";
import { AdminOperationsAccess } from "../../../src/modules/admin-operations/admin-operations-access";
import { AdminProspectsConsoleService, maskDisplayName } from "../../../src/modules/admin-operations/admin-prospects-console.service";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";
import type { ProspectRecord } from "../../../src/modules/prospects/prospects.service";
import type { QuoteRequestRecord } from "../../../src/modules/quote-requests/quote-submission.service";

process.env.ASSURMATCH_AUDIT_MEMORY = "true";

const CI = "00000000-0000-4000-8000-0000000000c1";
const SN = "00000000-0000-4000-8000-0000000000c2";
const AUTO = "00000000-0000-4000-8000-0000000000d1";
const HEALTH = "00000000-0000-4000-8000-0000000000d2";

const identity = new ProspectIdentityService();

function actor(role: ActorContext["roles"][number], extra: Partial<ActorContext> = {}): ActorContext {
  return { actorId: `00000000-0000-4000-8000-00000000f${role.length}01`, roles: [role], mfaVerified: true, ...extra };
}

function prospect(id: string, countryId: string, productId: string, name: string, email: string, phone: string, extra: Partial<ProspectRecord> = {}): ProspectRecord {
  const contact = identity.normalize({ displayName: name, email, phone: phone, countryCode: "CI" });
  return {
    id,
    countryId,
    productId,
    ...contact,
    consentRecordIds: ["c1", "c2"],
    retentionUntil: new Date("2036-01-01T00:00:00Z"),
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-01T10:00:00Z"),
    ...extra
  };
}

const PROSPECTS: ProspectRecord[] = [
  prospect("p-ci-auto", CI, AUTO, "Awa Kone", "awa.kone@example.com", "+22501020304", { createdAt: new Date("2026-10-03T10:00:00Z") }),
  prospect("p-ci-health", CI, HEALTH, "Moussa Traore", "moussa@example.com", "+22505060708", { createdAt: new Date("2026-10-02T10:00:00Z") }),
  prospect("p-sn-auto", SN, AUTO, "Fatou Diop", "fatou@example.com", "+221771234567", { createdAt: new Date("2026-10-01T10:00:00Z") }),
  prospect("p-anon", CI, AUTO, "Efface", "efface@example.com", "+22509090909", { anonymizedAt: new Date("2026-10-05T00:00:00Z"), createdAt: new Date("2026-09-01T10:00:00Z") })
];

function build() {
  const audit = new AuditLogWriter();
  const access = new AdminOperationsAccess(audit);
  const quotes = [
    { id: "q1", prospectId: "p-ci-auto", publicReference: "AM-1", status: "routed", createdAt: new Date("2026-10-03T11:00:00Z") },
    { id: "q2", prospectId: "p-ci-auto", publicReference: "AM-2", status: "created", createdAt: new Date("2026-10-04T11:00:00Z") },
    { id: "q3", prospectId: "p-sn-auto", publicReference: "AM-3", status: "routed", createdAt: new Date("2026-10-04T12:00:00Z") }
  ] as unknown as QuoteRequestRecord[];
  const service = new AdminProspectsConsoleService({
    audit,
    access,
    countries: { listAdmin: async () => [{ id: CI, isoCode: "CI" }, { id: SN, isoCode: "SN" }] },
    products: { listAdmin: async () => [{ id: AUTO, key: "auto" }, { id: HEALTH, key: "health" }] },
    partners: { list: async () => [] },
    prospects: { list: async () => PROSPECTS, require: async (id: string) => { const found = PROSPECTS.find((item) => item.id === id); if (!found) throw new Error("Prospect not found"); return found; } },
    quotes: { list: async () => quotes },
    fingerprint: (value) => identity.fingerprint(value)
  });
  return { service, audit };
}

const query = (overrides: Record<string, unknown> = {}) => adminProspectsQuerySchema.parse(overrides);

describe("spec 073 admin prospects console", () => {
  it("validates the query: pageSize <= 100, booleans from the query string", () => {
    expect(() => query({ pageSize: "101" })).toThrow();
    expect(query({}).includeAnonymized).toBe(false);
    expect(query({ includeAnonymized: "true" }).includeAnonymized).toBe(true);
    expect(query({ country: "ci" }).country).toBe("CI");
  });

  it("lists with masked e-mail and phone for every role, never a clear value", async () => {
    const { service } = build();
    for (const role of ["super_admin", "support_admin", "compliance_admin", "admin_pays"] as const) {
      const page = await service.list(actor(role), query());
      const raw = JSON.stringify(page);
      expect(raw, role).not.toContain("awa.kone@example.com");
      expect(raw, role).not.toContain("+22501020304");
      expect(page.total, role).toBe(3);
    }
    const page = await service.list(actor("super_admin"), query());
    expect(page.items[0]).toMatchObject({ id: "p-ci-auto", countryCode: "CI", productKey: "auto", consentCount: 2, quoteRequestCount: 2, anonymized: false });
    expect(page.items[0]?.email).toBe("a***@e***.com");
  });

  it("masks the display name outside super and support admins", async () => {
    const { service } = build();
    expect((await service.list(actor("support_admin"), query())).items[0]?.displayName).toBe("Awa Kone");
    expect((await service.list(actor("compliance_admin"), query())).items[0]?.displayName).toBe("A*** K***");
    expect(maskDisplayName(undefined)).toBeNull();
  });

  it("refuses finance and content admins with an audited refusal", async () => {
    const { service, audit } = build();
    for (const role of ["finance_admin", "content_admin"] as const) {
      await expect(service.list(actor(role), query())).rejects.toThrow(/denied/);
      await expect(service.detail(actor(role), "p-ci-auto")).rejects.toThrow(/denied/);
    }
    expect(audit.search({ action: "admin_operations.access_refused", targetType: "Prospect" }).filter((entry) => entry.reason === "forbidden_role")).toHaveLength(4);
    await expect(service.list(actor("super_admin", { mfaVerified: false }), query())).rejects.toThrow(/denied/);
  });

  it("limits an admin_pays to its countries and products", async () => {
    const { service, audit } = build();
    const ci = await service.list(actor("admin_pays", { countryScopes: ["CI"] }), query());
    expect(ci.items.map((item) => item.id)).toEqual(["p-ci-auto", "p-ci-health"]);
    const ciAuto = await service.list(actor("admin_pays", { countryScopes: ["CI"], productScopes: ["auto"] }), query());
    expect(ciAuto.items.map((item) => item.id)).toEqual(["p-ci-auto"]);
    await expect(service.detail(actor("admin_pays", { countryScopes: ["CI"] }), "p-sn-auto")).rejects.toThrow(/denied/);
    expect(audit.search({ action: "admin_operations.access_refused", targetId: "p-sn-auto" })[0]?.reason).toBe("out_of_scope");
  });

  it("filters by country and product and excludes anonymised prospects unless asked", async () => {
    const { service } = build();
    const admin = actor("super_admin");
    expect((await service.list(admin, query({ country: "SN" }))).items.map((item) => item.id)).toEqual(["p-sn-auto"]);
    expect((await service.list(admin, query({ product: "health" }))).items.map((item) => item.id)).toEqual(["p-ci-health"]);
    const all = await service.list(admin, query({ includeAnonymized: "true" }));
    expect(all.total).toBe(4);
    const anonymous = all.items.find((item) => item.id === "p-anon");
    expect(anonymous).toMatchObject({ anonymized: true, email: null, phone: null, displayName: null });
  });

  it("paginates", async () => {
    const { service } = build();
    const page = await service.list(actor("super_admin"), query({ pageSize: "2", page: "2" }));
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(1);
  });

  it("searches by name fragment or by exact e-mail / phone fingerprint, without recording the value", async () => {
    const { service, audit } = build();
    const admin = actor("super_admin");
    expect((await service.list(admin, query({ search: "KONE" }))).items.map((item) => item.id)).toEqual(["p-ci-auto"]);
    expect((await service.list(admin, query({ contactHash: fingerprintTypedProspectContact("Moussa@Example.com") }))).items.map((item) => item.id)).toEqual(["p-ci-health"]);
    expect((await service.list(admin, query({ contactHash: fingerprintTypedProspectContact("+221 77 12 34 567") }))).items.map((item) => item.id)).toEqual(["p-sn-auto"]);
    expect((await service.list(admin, query({ search: "moussa" }))).total).toBe(1);
    // A partial e-mail does not match: only the exact address does.
    expect((await service.list(admin, query({ contactHash: fingerprintTypedProspectContact("moussa@example") }))).total).toBe(0);
    const logged = JSON.stringify(audit.search({ action: "admin_operations.prospects_listed" }));
    expect(logged).not.toContain("Moussa");
    expect(logged).not.toContain("example.com");
    expect(logged).not.toContain("+221");
    expect(logged).not.toContain("KONE");
  });

  it("reveals the contact in clear on the detail for super and support admins only, with audit and no PII in it", async () => {
    const { service, audit } = build();
    for (const role of ["super_admin", "support_admin"] as const) {
      const detail = await service.detail(actor(role), "p-ci-auto");
      expect(detail).toMatchObject({ piiRevealed: true, email: "awa.kone@example.com", phone: "+22501020304", displayName: "Awa Kone", quoteRequestCount: 2 });
      expect(detail.quoteRequests.map((quote) => quote.publicReference)).toEqual(["AM-2", "AM-1"]);
    }
    for (const role of ["compliance_admin", "admin_pays"] as const) {
      const detail = await service.detail(actor(role), "p-ci-auto");
      expect(detail.piiRevealed, role).toBe(false);
      expect(JSON.stringify(detail), role).not.toContain("awa.kone@example.com");
      expect(JSON.stringify(detail), role).not.toContain("+22501020304");
    }
    const entries = audit.search({ action: "admin.prospect.viewed", targetId: "p-ci-auto" });
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.context.piiRevealed)).toEqual([true, true, false, false]);
    const raw = JSON.stringify(entries);
    for (const forbidden of ["awa.kone", "example.com", "+22501020304", "Awa", "Kone"]) expect(raw).not.toContain(forbidden);
    expect(String(entries[0]?.context.emailFingerprint)).toHaveLength(12);
  });

  it("returns no contact data at all for an anonymised prospect, even to a super admin", async () => {
    const { service } = build();
    const detail = await service.detail(actor("super_admin"), "p-anon");
    expect(detail).toMatchObject({ anonymized: true, piiRevealed: false, email: null, phone: null, displayName: null });
    expect(JSON.stringify(detail)).not.toContain("efface");
  });

  it("rejects an unknown prospect", async () => {
    const { service } = build();
    await expect(service.detail(actor("super_admin"), "missing")).rejects.toThrow(/not found/);
  });
  it("refuses a clear e-mail or phone in the GET search (it would land in the URL) and accepts only the hash", () => {
    expect(() => query({ search: "moussa@example.com" })).toThrow();
    expect(() => query({ search: "+221 77 12 34 567" })).toThrow();
    expect(() => query({ contactHash: "moussa@example.com" })).toThrow();
    expect(query({ search: "Kone" }).search).toBe("Kone");
    const hash = fingerprintTypedProspectContact("moussa@example.com");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(query({ contactHash: hash.toUpperCase() }).contactHash).toBe(hash);
  });

  it("never records the contact hash in the audit trail, only that a contact search was used", async () => {
    const { service, audit } = build();
    const hash = fingerprintTypedProspectContact("Moussa@Example.com");
    await service.list(actor("super_admin"), query({ contactHash: hash }));
    const logged = JSON.stringify(audit.search({ action: "admin_operations.prospects_listed" }));
    expect(logged).not.toContain(hash);
    expect(logged).toContain("contactSearch");
  });

  it("keeps the clear detail audited and limited to super_admin and support_admin", async () => {
    const { service } = build();
    const detail = await service.detail(actor("support_admin"), "p-ci-auto");
    expect(detail.piiRevealed).toBe(true);
    await expect(service.detail(actor("finance_admin"), "p-ci-auto")).rejects.toThrow();
  });
});
