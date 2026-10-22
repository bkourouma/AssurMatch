import { describe, expect, it } from "vitest";
import { adminProspectContactSearchSchema, adminProspectsQuerySchema } from "../../../../packages/shared/contracts/admin-operations.contracts";
import { AdminOperationsAccess } from "../../../src/modules/admin-operations/admin-operations-access";
import { AdminProspectsConsoleService, maskDisplayName } from "../../../src/modules/admin-operations/admin-prospects-console.service";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import type { ActorContext } from "../../../src/modules/common/types";
import { isPiiEnvelope, legacyPiiFingerprint, PiiVault } from "../../../src/modules/common/security/pii-vault";
import { ProspectIdentityService } from "../../../src/modules/prospects/prospect-identity.service";
import { PrismaProspectsRepository } from "../../../src/modules/prospects/prospects.repository";
import { ProspectsService, type ProspectRecord } from "../../../src/modules/prospects/prospects.service";
import { FakeTable, fakePrisma, testRing, vaultOf } from "../security/pii-test-kit";
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
    prospects: {
      list: async () => PROSPECTS,
      require: async (id: string) => { const found = PROSPECTS.find((item) => item.id === id); if (!found) throw new Error("Prospect not found"); return found; },
      // Clear domain records: the legacy fingerprint is their lookup key (the Prisma path is tested below).
      findIdsByContact: async (kind: "email" | "phone", value: string) =>
        PROSPECTS.filter((item) => (kind === "email" ? item.emailFingerprint : item.phoneFingerprint) === legacyPiiFingerprint(value)).map((item) => item.id)
    },
    quotes: { list: async () => quotes }
  });
  return { service, audit };
}

const query = (overrides: Record<string, unknown> = {}) => adminProspectsQuerySchema.parse(overrides);
const contactSearch = (contact: string, overrides: Record<string, unknown> = {}) => adminProspectContactSearchSchema.parse({ contact, ...overrides });

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

  it("refuses the name search (403) to roles that only see masked names, to avoid an existence oracle", async () => {
    const { service } = build();
    for (const role of ["admin_pays", "compliance_admin"] as const) {
      await expect(service.list(actor(role), query({ search: "kone" })), role).rejects.toThrow(/denied/);
      expect((await service.list(actor(role), query({}))).total).toBeGreaterThan(0);
    }
    expect((await service.list(actor("support_admin"), query({ search: "kone" }))).total).toBe(1);
  });

  it("paginates", async () => {
    const { service } = build();
    const page = await service.list(actor("super_admin"), query({ pageSize: "2", page: "2" }));
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(1);
  });

  it("searches by name fragment or by exact e-mail / phone (POST body), without recording the value", async () => {
    const { service, audit } = build();
    const admin = actor("super_admin");
    expect((await service.list(admin, query({ search: "KONE" }))).items.map((item) => item.id)).toEqual(["p-ci-auto"]);
    expect((await service.searchByContact(admin, contactSearch(" Moussa@Example.com "))).items.map((item) => item.id)).toEqual(["p-ci-health"]);
    expect((await service.searchByContact(admin, contactSearch("+221 77 12 34 567"))).items.map((item) => item.id)).toEqual(["p-sn-auto"]);
    expect((await service.list(admin, query({ search: "moussa" }))).total).toBe(1);
    // A partial e-mail does not match: only the exact address does.
    expect((await service.searchByContact(admin, contactSearch("moussa@example"))).total).toBe(0);
    // Scope and filters still apply to a contact search; anonymised prospects never match.
    expect((await service.searchByContact(actor("admin_pays", { countryScopes: ["CI"] }), contactSearch("+221771234567"))).total).toBe(0);
    expect((await service.searchByContact(actor("admin_pays", { countryScopes: ["SN"] }), contactSearch("+221771234567"))).total).toBe(1);
    expect((await service.searchByContact(admin, contactSearch("efface@example.com", { includeAnonymized: true }))).total).toBe(0);
    await expect(service.searchByContact(actor("finance_admin"), contactSearch("moussa@example.com"))).rejects.toThrow(/denied/);
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
    expect(entries[0]?.context).not.toHaveProperty("emailFingerprint");
    expect(entries[0]?.context).not.toHaveProperty("phoneFingerprint");
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
  it("refuses a clear e-mail or phone, and any contact hash, in the GET query; the POST body takes a contact only", () => {
    expect(() => query({ search: "moussa@example.com" })).toThrow();
    expect(() => query({ search: "+221 77 12 34 567" })).toThrow();
    // The former contactHash (unsalted SHA-256, enumerable for a phone) is no longer accepted at all.
    expect(() => query({ contactHash: legacyPiiFingerprint("moussa@example.com") })).toThrow();
    expect(query({ search: "Kone" }).search).toBe("Kone");
    expect(() => contactSearch("Kone")).toThrow();
    expect(() => contactSearch("")).toThrow();
    expect(contactSearch(" moussa@example.com ").contact).toBe("moussa@example.com");
    expect(contactSearch("+221 77 12 34 567").includeAnonymized).toBe(false);
  });

  it("audits a contact search as contactSearch: true only (no value, no fingerprint, no blind index)", async () => {
    const { service, audit } = build();
    await service.searchByContact(actor("super_admin"), contactSearch("Moussa@Example.com"));
    await service.searchByContact(actor("super_admin"), contactSearch("+221 77 12 34 567"));
    const entries = audit.search({ action: "admin_operations.prospects_listed" });
    expect(entries).toHaveLength(2);
    for (const entry of entries) expect(entry.context.filters).toMatchObject({ contactSearch: true, search: false });
    const logged = JSON.stringify(entries);
    for (const forbidden of ["moussa", "Moussa", "example.com", "221771234567", "+221", legacyPiiFingerprint("moussa@example.com"), legacyPiiFingerprint("+221771234567")]) {
      expect(logged).not.toContain(forbidden);
    }
  });

  it("keeps the clear detail audited and limited to super_admin and support_admin", async () => {
    const { service } = build();
    const detail = await service.detail(actor("support_admin"), "p-ci-auto");
    expect(detail.piiRevealed).toBe(true);
    await expect(service.detail(actor("finance_admin"), "p-ci-auto")).rejects.toThrow();
  });
});

/**
 * Lot 6 x lot 8 reconciliation: the contact search goes through the Prisma repository, which matches
 * the keyed blind index of the encrypted rows (no legacy fingerprint stored) OR the legacy fingerprint
 * of the clear rows not migrated yet.
 */
describe("spec 073 x spec 075 contact search over encrypted and legacy prospects", () => {
  const ENC_EMAIL = "awa.chiffree@example.com";
  const ENC_PHONE = "+2250707070707";
  const OLD_EMAIL = "kofi.legacy@example.com";
  const OLD_PHONE = "+2250505050505";

  async function buildOverPrisma(vault: PiiVault) {
    const legacyRow = {
      id: "p-legacy", countryId: CI, productId: AUTO, anonymizedAt: null, displayName: "Kofi Legacy",
      emailNormalized: OLD_EMAIL, phoneNormalized: OLD_PHONE, emailFingerprint: legacyPiiFingerprint(OLD_EMAIL), phoneFingerprint: legacyPiiFingerprint(OLD_PHONE),
      emailBlindIndex: null, phoneBlindIndex: null, piiKeyId: null, consentRecordIds: ["c-old"],
      retentionUntil: new Date("2036-01-01T00:00:00Z"), createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z")
    };
    const { prisma, tables } = fakePrisma({ prospect: new FakeTable([legacyRow]) });
    const audit = new AuditLogWriter();
    const prospects = new ProspectsService(audit, new PrismaProspectsRepository(prisma, vault));
    const created = await prospects.createOrLink(CI, AUTO, identity.normalize({ displayName: "Awa Chiffree", email: ENC_EMAIL, phone: ENC_PHONE, countryCode: "CI" }), "c-new", actor("super_admin"));
    const service = new AdminProspectsConsoleService({
      audit,
      access: new AdminOperationsAccess(audit),
      countries: { listAdmin: async () => [{ id: CI, isoCode: "CI" }] },
      products: { listAdmin: async () => [{ id: AUTO, key: "auto" }] },
      partners: { list: async () => [] },
      prospects: { list: () => prospects.list(), require: (id) => prospects.require(id), findIdsByContact: (kind, value) => prospects.findIdsByContact(kind, value) },
      quotes: { list: async () => [] }
    });
    return { service, audit, tables, encryptedId: created.id };
  }

  it("finds an encrypted prospect by blind index and a legacy clear prospect by its old fingerprint", async () => {
    const vault = vaultOf(testRing());
    const { service, audit, tables, encryptedId } = await buildOverPrisma(vault);
    const encrypted = tables.prospect!.rows.find((row) => row.id === encryptedId)!;
    // The encrypted row carries envelopes and blind indexes only: no clear value, no legacy fingerprint.
    expect(isPiiEnvelope(encrypted.emailNormalized)).toBe(true);
    expect(encrypted).toMatchObject({ emailFingerprint: null, phoneFingerprint: null, emailBlindIndex: vault.blindIndex("email", ENC_EMAIL), phoneBlindIndex: vault.blindIndex("phone", ENC_PHONE) });

    const admin = actor("support_admin");
    const ids = async (contact: string) => (await service.searchByContact(admin, contactSearch(contact))).items.map((item) => item.id);
    expect(await ids(" Awa.Chiffree@Example.com ")).toEqual([encryptedId]);
    expect(await ids("+225 07 07 07 07 07")).toEqual([encryptedId]);
    expect(await ids("KOFI.legacy@example.com")).toEqual(["p-legacy"]);
    expect(await ids("+225.05.05.05.05.05")).toEqual(["p-legacy"]);
    // An e-mail never matches as a phone (separate index kinds) and an unknown contact matches nothing.
    expect(await ids("inconnu@example.com")).toEqual([]);
    expect(await ids("+2250909090909")).toEqual([]);

    // Masked rows only, and the audit holds the flag, never the value, a fingerprint or a blind index.
    const page = await service.searchByContact(admin, contactSearch(ENC_EMAIL));
    expect(JSON.stringify(page)).not.toContain(ENC_EMAIL);
    const logged = JSON.stringify(audit.search({ action: "admin_operations.prospects_listed" }));
    expect(logged).toContain("\"contactSearch\":true");
    const secrets = [ENC_EMAIL, ENC_PHONE, OLD_EMAIL, OLD_PHONE, "chiffree", "legacy@", legacyPiiFingerprint(ENC_EMAIL), legacyPiiFingerprint(OLD_PHONE), vault.blindIndex("email", ENC_EMAIL)!, vault.blindIndex("phone", ENC_PHONE)!];
    for (const forbidden of secrets) expect(logged).not.toContain(forbidden);
  });

  it("still finds both kinds of rows without any key (local runtime): legacy fingerprint only", async () => {
    const { service } = await buildOverPrisma(PiiVault.disabled());
    const admin = actor("super_admin");
    expect((await service.searchByContact(admin, contactSearch(ENC_EMAIL))).total).toBe(1);
    expect((await service.searchByContact(admin, contactSearch(OLD_PHONE))).total).toBe(1);
  });
});
