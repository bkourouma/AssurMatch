import { afterEach, describe, expect, it } from "vitest";
import { retentionBatchListResponseSchema, retentionBatchSchema, retentionPoliciesResponseSchema } from "../../../../packages/shared/contracts/data-retention.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { DataRetentionAuditActions } from "../../../src/modules/data-retention/data-retention-audit-actions";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const compliance: ActorContext = { actorId: "compliance-runtime", roles: ["compliance_admin"], mfaVerified: true, correlationId: "retention-runtime" };
const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const json = { "content-type": "application/json" };
const DAY_MS = 24 * 60 * 60 * 1000;
const VISITOR_EMAIL = "retention-visitor@example.com";

describe("data retention runtime HTTP (spec 046)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function submitQuote(active: RuntimeHttpHarness, seed: Awaited<ReturnType<typeof seedPublicRuntime>>) {
    const response = await active.request("/quote-requests", {
      method: "POST",
      headers: { ...json, "x-forwarded-for": "203.0.113.70" },
      body: JSON.stringify({
        countryCode: "CI",
        productKey: "auto",
        formDefinitionId: seed.form.id,
        contact: { displayName: "Visiteur Retention", email: VISITOR_EMAIL, phone: "+2250102030405" },
        answers: { vehicle_use: "prive" },
        consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: "runtime-consent-hash" },
        ipAddress: "203.0.113.70",
        sessionId: "runtime-session-retention"
      })
    });
    expect(response.status).toBe(201);
    return await response.json() as { publicReference: string };
  }

  function post(active: RuntimeHttpHarness, path: string, actor: ActorContext, body: unknown) {
    return active.request(path, { method: "POST", headers: { ...actorHeaders(actor), ...json }, body: JSON.stringify(body) });
  }

  it("runs preview then approve over HTTP with the 403, 409 and 422 mapping", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const seed = await seedPublicRuntime(active.runtime);
    const confirmation = await submitQuote(active, seed);
    const [quote] = await active.runtime.quoteRequests.submissions.list();
    if (!quote) throw new Error("quote request missing");
    const consentBefore = JSON.stringify(await active.runtime.consent.service.findRecord(quote.consentRecordId));
    // Age the request past the 365-day override set below.
    quote.updatedAt = new Date(Date.now() - 400 * DAY_MS);
    for (const assignment of await active.runtime.leads.assignments.list()) {
      delete assignment.lastBrokerActionAt;
    }

    const policies = retentionPoliciesResponseSchema.parse(await readJson(await active.request(`/admin/retention/policies?countryId=${seed.country.id}`, { headers: actorHeaders(compliance) })));
    expect(policies).toMatchObject({ countryId: seed.country.id, purgeEnabled: false });
    expect(policies.items).toHaveLength(8);
    const updated = await active.request("/admin/retention/policies", {
      method: "PUT",
      headers: { ...actorHeaders(compliance), ...json },
      body: JSON.stringify({ countryId: seed.country.id, category: "quote_requests", retentionDays: 365, reason: "Avis juridique pilote CI" })
    });
    expect(updated.status).toBe(200);
    expect(retentionPoliciesResponseSchema.parse(await readJson(updated)).items.find((item) => item.category === "quote_requests")).toMatchObject({ retentionDays: 365, source: "country" });

    // Flag off: the preview works, the approval is refused with 422 and the batch becomes refused.
    const firstPreview = await post(active, "/admin/retention/batches/preview", compliance, { categories: ["quote_requests"], reason: "Revue de conservation" });
    expect(firstPreview.status).toBe(201);
    const refusedBatch = retentionBatchSchema.parse(await readJson(firstPreview));
    expect(refusedBatch.totalSelected).toBe(1);
    const flagOff = await post(active, `/admin/retention/batches/${refusedBatch.id}/approve`, compliance, { reason: "Validation conformite" });
    expect(flagOff.status).toBe(422);
    expect(quote.payload).not.toEqual({ anonymized: true });

    await active.runtime.featureFlags.service.applyCompliancePolicy({ key: "retention_purge_enabled", scopeType: "global", value: true, reason: "retention runtime test" }, superAdmin, { reference: "TEST-RETENTION-046", approvedBy: "compliance" });
    expect((await post(active, `/admin/retention/batches/${refusedBatch.id}/approve`, compliance, { reason: "Validation conformite" })).status).toBe(409);

    const preview = retentionBatchSchema.parse(await readJson(await post(active, "/admin/retention/batches/preview", compliance, { countryId: seed.country.id, categories: ["quote_requests"], reason: "Revue de conservation" })));
    const approved = await post(active, `/admin/retention/batches/${preview.id}/approve`, compliance, { reason: "Validation conformite" });
    expect(approved.status).toBe(200);
    expect(retentionBatchSchema.parse(await readJson(approved))).toMatchObject({ status: "executed", totalSelected: 1 });

    const stored = await active.runtime.quoteRequests.submissions.findById(quote.id);
    expect(stored?.payload).toEqual({ anonymized: true });
    expect(stored?.publicReference).toBe(confirmation.publicReference);
    const prospect = await active.runtime.prospects.service.require(quote.prospectId);
    expect(prospect.emailNormalized).toBeNull();
    expect(JSON.stringify(await active.runtime.consent.service.findRecord(quote.consentRecordId))).toBe(consentBefore);
    const inbox = await active.runtime.notifications.dispatch.listInApp(seed.partner.id);
    expect(inbox.filter((notification) => notification.type === "lead_data_anonymized")).toHaveLength(1);
    expect(JSON.stringify(inbox)).not.toContain(VISITOR_EMAIL);

    expect((await post(active, `/admin/retention/batches/${preview.id}/approve`, compliance, { reason: "Validation conformite" })).status).toBe(409);

    const list = retentionBatchListResponseSchema.parse(await readJson(await active.request("/admin/retention/batches", { headers: actorHeaders(compliance) })));
    expect(list).toMatchObject({ purgeEnabled: true });
    expect(list.items.map((batch) => batch.status)).toEqual(["executed", "refused"]);
    expect((await active.request(`/admin/retention/batches/${preview.id}`, { headers: actorHeaders(compliance) })).status).toBe(200);
    expect((await active.request(`/admin/retention/batches/${crypto.randomUUID()}`, { headers: actorHeaders(compliance) })).status).toBe(404);
    expect(active.runtime.audit.writer.search({ action: DataRetentionAuditActions.batchExecuted })).toHaveLength(1);
  });

  it("previews an erasure by e-mail without echoing it, validates the body and refuses other roles", async () => {
    harness = await createRuntimeHttpHarness();
    const active = harness;
    const seed = await seedPublicRuntime(active.runtime);
    await submitQuote(active, seed);

    const response = await post(active, "/admin/retention/batches/erasure-preview", compliance, { email: VISITOR_EMAIL, reason: "Demande d'effacement par courrier" });
    expect(response.status).toBe(201);
    const text = await response.text();
    expect(text).not.toContain(VISITOR_EMAIL);
    expect(retentionBatchSchema.parse(JSON.parse(text))).toMatchObject({ kind: "erasure", erasureLookup: "email", totalSelected: 1 });

    expect((await post(active, "/admin/retention/batches/erasure-preview", compliance, { email: VISITOR_EMAIL, publicReference: "AM-1", reason: "Demande d'effacement par courrier" })).status).toBe(400);
    expect((await post(active, "/admin/retention/batches/preview", compliance, { reason: "Motif avec contact@example.com" })).status).toBe(400);

    for (const actor of [
      { actorId: "pays", roles: ["admin_pays"], mfaVerified: true },
      { actorId: "support", roles: ["support_admin"], mfaVerified: true },
      { actorId: "broker", roles: ["broker_owner_pro"], mfaVerified: true, partnerTenantId: seed.partner.id, partnerPlan: "pro" }
    ] satisfies ActorContext[]) {
      expect((await active.request("/admin/retention/policies", { headers: actorHeaders(actor) })).status).toBe(403);
      expect((await post(active, "/admin/retention/batches/preview", actor, { reason: "Revue de conservation" })).status).toBe(403);
    }
    expect(active.runtime.audit.writer.search({ action: DataRetentionAuditActions.accessRefused }).length).toBeGreaterThanOrEqual(6);
    expect((await active.request("/admin/retention/policies", { headers: actorHeaders({ actorId: "no-mfa", roles: ["compliance_admin"], mfaVerified: false }) })).status).toBe(403);
  });
});
