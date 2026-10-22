import { afterEach, describe, expect, it } from "vitest";
import { fingerprintTypedProspectContact } from "../../../../packages/shared/security/prospect-contact-fingerprint";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

/** Spec 073 (FR-001 to FR-005, FR-023): admin prospects console over real Nest HTTP. */

const SUPER_ADMIN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a001", roles: ["super_admin"], mfaVerified: true };
const COMPLIANCE_ADMIN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a002", roles: ["compliance_admin"], mfaVerified: true };
const SUPPORT_ADMIN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a003", roles: ["support_admin"], mfaVerified: true };
const ADMIN_PAYS_CI: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a004", roles: ["admin_pays"], countryScopes: ["CI"], mfaVerified: true };
const ADMIN_PAYS_SN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a005", roles: ["admin_pays"], countryScopes: ["SN"], mfaVerified: true };
const CONTENT_ADMIN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a006", roles: ["content_admin"], mfaVerified: true };
const FINANCE_ADMIN: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a008", roles: ["finance_admin"], mfaVerified: true };
const BROKER: ActorContext = { actorId: "00000000-0000-4000-8000-00000000a007", roles: ["broker_owner_pro"], partnerTenantId: "00000000-0000-4000-8000-0000000000b1", partnerPlan: "pro", mfaVerified: true };
const SUPER_ADMIN_NO_MFA: ActorContext = { ...SUPER_ADMIN, mfaVerified: false };

const EMAIL = "visiteur1@example.com";
const PHONE = "+2250102030411";

type Seed = Awaited<ReturnType<typeof seedPublicRuntime>>;

async function submitQuote(harness: RuntimeHttpHarness, seed: Seed): Promise<void> {
  const response = await harness.request("/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      countryCode: "CI",
      productKey: "auto",
      formDefinitionId: seed.form.id,
      contact: { displayName: "Visiteur Un", email: EMAIL, phone: PHONE },
      answers: { vehicle_use: "prive" },
      consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
      ipAddress: "203.0.113.101",
      sessionId: "admin-prospects-session-1"
    })
  });
  expect(response.status).toBe(201);
}

function get(harness: RuntimeHttpHarness, path: string, actor?: ActorContext) {
  return harness.request(path, actor ? { headers: actorHeaders(actor) } : undefined);
}

describe("spec 073 admin prospects console (runtime HTTP)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("keeps both routes behind authentication, MFA and the operations roles", async () => {
    harness = await createRuntimeHttpHarness();
    for (const path of ["/admin/operations/prospects", "/admin/operations/prospects/00000000-0000-4000-8000-000000000001"]) {
      expect((await get(harness, path)).status, path).toBe(401);
      expect((await get(harness, path, SUPER_ADMIN_NO_MFA)).status, path).toBe(403);
      expect((await get(harness, path, BROKER)).status, path).toBe(403);
      expect((await get(harness, path, CONTENT_ADMIN)).status, path).toBe(403);
      expect((await get(harness, path, FINANCE_ADMIN)).status, path).toBe(403);
    }
    expect((await get(harness, "/admin/operations/prospects/not-a-uuid", SUPER_ADMIN)).status).toBe(400);
    expect((await get(harness, "/admin/operations/prospects?pageSize=101", SUPER_ADMIN)).status).toBe(400);
    expect(harness.runtime.audit.writer.search({ action: "admin_operations.access_refused", targetType: "Prospect" }).filter((entry) => entry.reason === "forbidden_role").length).toBeGreaterThanOrEqual(4);
  });

  it("lists masked, details in clear for super and support admins only, and audits without PII", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await submitQuote(harness, seed);
    const prospect = (await harness.runtime.prospects.service.list())[0]!;

    const listResponse = await get(harness, "/admin/operations/prospects?country=CI&product=auto", SUPER_ADMIN);
    expect(listResponse.status).toBe(200);
    const listRaw = await listResponse.text();
    expect(listRaw).not.toContain(EMAIL);
    expect(listRaw).not.toContain(PHONE);
    const page = JSON.parse(listRaw) as { total: number; items: Array<Record<string, unknown>> };
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: prospect.id, countryCode: "CI", productKey: "auto", quoteRequestCount: 1, anonymized: false });

    // Search by exact e-mail or phone: matched through the fingerprint, never echoed.
    expect((await readJson<{ total: number }>(await get(harness, `/admin/operations/prospects?contactHash=${fingerprintTypedProspectContact(EMAIL)}`, SUPPORT_ADMIN))).total).toBe(1);
    expect((await readJson<{ total: number }>(await get(harness, `/admin/operations/prospects?contactHash=${fingerprintTypedProspectContact(PHONE)}`, SUPPORT_ADMIN))).total).toBe(1);
    // A clear e-mail / phone in the query string is refused (400): it would land in URLs and logs.
    expect((await get(harness, `/admin/operations/prospects?search=${encodeURIComponent(EMAIL)}`, SUPPORT_ADMIN)).status).toBe(400);
    expect((await readJson<{ total: number }>(await get(harness, "/admin/operations/prospects?search=inconnu", SUPPORT_ADMIN))).total).toBe(0);

    for (const actor of [SUPER_ADMIN, SUPPORT_ADMIN]) {
      const detail = await readJson<{ email: string; phone: string; piiRevealed: boolean; quoteRequests: unknown[] }>(await get(harness, `/admin/operations/prospects/${prospect.id}`, actor));
      expect(detail).toMatchObject({ email: EMAIL, phone: PHONE, piiRevealed: true });
      expect(detail.quoteRequests).toHaveLength(1);
    }
    for (const actor of [COMPLIANCE_ADMIN, ADMIN_PAYS_CI]) {
      const response = await get(harness, `/admin/operations/prospects/${prospect.id}`, actor);
      expect(response.status).toBe(200);
      const raw = await response.text();
      expect(raw).not.toContain(EMAIL);
      expect(raw).not.toContain(PHONE);
      expect(JSON.parse(raw)).toMatchObject({ piiRevealed: false });
    }

    const viewed = harness.runtime.audit.writer.search({ action: "admin.prospect.viewed", targetId: prospect.id });
    expect(viewed).toHaveLength(4);
    const auditRaw = JSON.stringify([...viewed, ...harness.runtime.audit.writer.search({ action: "admin_operations.prospects_listed" })]);
    for (const forbidden of [EMAIL, PHONE, "Visiteur", "visiteur1"]) expect(auditRaw).not.toContain(forbidden);
  });

  it("scopes an admin_pays to its country and audits the out-of-scope refusal", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await submitQuote(harness, seed);
    const prospect = (await harness.runtime.prospects.service.list())[0]!;

    expect((await readJson<{ total: number }>(await get(harness, "/admin/operations/prospects", ADMIN_PAYS_CI))).total).toBe(1);
    expect((await readJson<{ total: number }>(await get(harness, "/admin/operations/prospects", ADMIN_PAYS_SN))).total).toBe(0);
    expect((await get(harness, `/admin/operations/prospects/${prospect.id}`, ADMIN_PAYS_SN)).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: "admin_operations.access_refused", targetId: prospect.id }).some((entry) => entry.reason === "out_of_scope")).toBe(true);
  });

  it("hides anonymised prospects by default and exposes no contact when included", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    await submitQuote(harness, seed);
    const prospect = (await harness.runtime.prospects.service.list())[0]!;
    prospect.anonymizedAt = new Date();

    expect((await readJson<{ total: number }>(await get(harness, "/admin/operations/prospects", SUPER_ADMIN))).total).toBe(0);
    const included = await get(harness, "/admin/operations/prospects?includeAnonymized=true", SUPER_ADMIN);
    const raw = await included.text();
    expect(raw).not.toContain(EMAIL);
    expect(JSON.parse(raw).items[0]).toMatchObject({ anonymized: true, email: null, phone: null });
    const detail = await readJson<{ email: string | null; phone: string | null; piiRevealed: boolean }>(await get(harness, `/admin/operations/prospects/${prospect.id}`, SUPER_ADMIN));
    expect(detail).toMatchObject({ email: null, phone: null, piiRevealed: false });
  });
});
