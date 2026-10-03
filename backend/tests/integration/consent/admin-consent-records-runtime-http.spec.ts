import { afterEach, describe, expect, it } from "vitest";
import type { AdminConsentRecordSearchResult } from "../../../../packages/shared/contracts/compliance.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const compliance: ActorContext = { actorId: "compliance-1", roles: ["compliance_admin"], mfaVerified: true };

/** Spec 059 follow-up: POST /admin/consent-records/search (compliance consent-proof search). */
describe("admin consent-record search runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function start() {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const submit = async (email: string, ip: string) => {
      const response = await harness!.request("/quote-requests", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({
          countryCode: "CI",
          productKey: "auto",
          formDefinitionId: seed.form.id,
          contact: { displayName: "Visitor", email, phone: "+2250102030405" },
          answers: { vehicle_use: "prive" },
          consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
          sessionId: `session-${email}`
        })
      });
      expect(response.status).toBe(201);
      return (await response.json() as { publicReference: string }).publicReference;
    };
    const first = await submit("preuve.un@example.com", "203.0.113.11");
    await submit("preuve.deux@example.com", "203.0.113.12");
    return { active: harness, seed, first };
  }

  const search = (active: RuntimeHttpHarness, actor: ActorContext, query: string) => active.request("/admin/consent-records/search", {
    method: "POST",
    headers: { ...actorHeaders(actor), "content-type": "application/json" },
    body: JSON.stringify(Object.fromEntries(new URLSearchParams(query)))
  });

  it("finds the proofs of a request by reference or e-mail, masked, and audits the criteria only", async () => {
    const { active, seed, first } = await start();

    const byReference = await search(active, compliance, `publicReference=${first.toLowerCase()}`);
    expect(byReference.status).toBe(200);
    expect(byReference.headers.get("cache-control")).toBe("no-store");
    const result = await readJson<AdminConsentRecordSearchResult>(byReference);
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.purpose).sort()).toEqual(["lead_transmission", "service_quality_survey"]);
    expect(result.items[0]).toMatchObject({ consentTextId: seed.consentText.id, consentTextVersion: "v1", consentTextHash: seed.consentText.contentHash, status: "granted", countryId: seed.country.id });
    expect(result.items[0]?.subjectFingerprint).toMatch(/^[0-9a-f]{8}…$/);

    const byEmailResponse = await search(active, compliance, "email=PREUVE.DEUX@example.com&purpose=lead_transmission");
    const raw = await byEmailResponse.text();
    expect(raw).not.toContain("preuve.deux");
    expect(JSON.parse(raw)).toMatchObject({ total: 1, items: [{ purpose: "lead_transmission" }] });

    const byCountry = await readJson<AdminConsentRecordSearchResult>(await search(active, compliance, `countryId=${seed.country.id}&pageSize=3`));
    expect(byCountry).toMatchObject({ total: 4, page: 1, pageSize: 3 });
    expect(byCountry.items).toHaveLength(3);

    // An unknown reference is an empty page, never an error.
    expect(await readJson<AdminConsentRecordSearchResult>(await search(active, compliance, "publicReference=QR-2026-ZZZZZZZZ"))).toMatchObject({ total: 0, items: [] });

    const audits = active.runtime.audit.writer.search({ action: "consent_record.searched" });
    expect(audits.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(audits)).not.toContain("preuve.deux");
    expect(audits.some((entry) => (entry.context as { criteria?: string[] }).criteria?.includes("email"))).toBe(true);
  });

  it("requires a criterion and refuses (audited) any role other than compliance or super admin, and missing MFA", async () => {
    const { active, seed } = await start();
    expect((await search(active, compliance, "purpose=lead_transmission")).status).toBe(400);
    expect((await search(active, compliance, "email=not-an-email")).status).toBe(400);

    for (const roles of [["support_admin"], ["admin_pays"], ["finance_admin"]] as const) {
      const response = await search(active, { actorId: `actor-${roles[0]}`, roles: [...roles], mfaVerified: true }, `countryId=${seed.country.id}`);
      expect(response.status, roles[0]).toBe(403);
    }
    const broker: ActorContext = { actorId: "broker", roles: ["broker_owner_pro"], partnerTenantId: seed.partner.id, partnerPlan: "pro", mfaVerified: true };
    expect((await search(active, broker, `countryId=${seed.country.id}`)).status).toBe(403);
    expect((await search(active, { ...compliance, mfaVerified: false }, `countryId=${seed.country.id}`)).status).toBe(403);
    expect((await active.request("/admin/consent-records/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ countryId: seed.country.id }) })).status).toBe(401);
    expect(active.runtime.audit.writer.search({ action: "consent_record.search_refused" }).length).toBeGreaterThanOrEqual(3);

    const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };
    expect((await search(active, superAdmin, `countryId=${seed.country.id}`)).status).toBe(200);
  });
});
