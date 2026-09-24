import { afterEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { signActorToken } from "../../../src/modules/auth/http-auth-token.service";

function token(actor: ActorContext): string {
  return signActorToken(actor);
}

const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const complianceAdmin: ActorContext = { actorId: "compliance", roles: ["compliance_admin"], mfaVerified: true };
const contentAdmin: ActorContext = { actorId: "content", roles: ["content_admin"], mfaVerified: true };

function body(seed: Awaited<ReturnType<typeof seedPublicRuntime>>, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    countryId: seed.country.id,
    productId: seed.product.id,
    language: "fr",
    version: "v2",
    status: "draft",
    fields: [{ key: "vehicle_use", label: "Usage", type: "select", required: true, sensitivity: "public", options: ["prive"] }],
    consentTextId: seed.consentText.id,
    reason: "runtime http quote form test",
    ...overrides
  });
}

describe("admin quote form definitions over HTTP (spec 043)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("creates a draft and publishes it, making the public form reachable without a restart", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const headers = { "content-type": "application/json", authorization: `Bearer ${token(superAdmin)}` };

    const created = await harness.request("/admin/quote-form-definitions", { method: "POST", headers, body: body(seed) });
    expect(created.status).toBe(201);
    const draft = await created.json() as { id: string; status: string };
    expect(draft.status).toBe("draft");

    const published = await harness.request(`/admin/quote-form-definitions/${draft.id}/publish`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "runtime http publication" })
    });
    expect(published.status).toBe(201);

    const publicForm = await harness.request(`/countries/${seed.country.isoCode}/products/${seed.product.key}/quote-form`);
    expect(publicForm.status).toBe(200);
    const exposed = await publicForm.json() as { formDefinitionId: string; version: string };
    expect(exposed.formDefinitionId).toBe(draft.id);
    expect(exposed.version).toBe("v2");
  });

  it("lists definitions for a reader role and refuses writes from it", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    const listed = await harness.request("/admin/quote-form-definitions", { headers: { authorization: `Bearer ${token(contentAdmin)}` } });
    expect(listed.status).toBe(200);
    expect(Array.isArray(await listed.json())).toBe(true);
  });

  it("refuses creation from a role without the write permission", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    const refused = await harness.request("/admin/quote-form-definitions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token(contentAdmin)}` },
      body: body(seed)
    });
    expect(refused.status).toBe(403);
  });

  it("lets a compliance admin publish", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const headers = { "content-type": "application/json", authorization: `Bearer ${token(complianceAdmin)}` };

    const created = await harness.request("/admin/quote-form-definitions", { method: "POST", headers, body: body(seed) });
    expect(created.status).toBe(201);
    const draft = await created.json() as { id: string };
    const published = await harness.request(`/admin/quote-form-definitions/${draft.id}/publish`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "compliance publication" })
    });
    expect(published.status).toBe(201);
  });

  it("refuses publication bound to a consent text that is not published, with a 422", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const headers = { "content-type": "application/json", authorization: `Bearer ${token(superAdmin)}` };
    const unpublished = await harness.runtime.consent.service.createText({
      purpose: "lead_transmission",
      countryId: seed.country.id,
      productId: seed.product.id,
      channel: "public_web",
      recipientCategory: "courtier_partenaire_eligible",
      language: "fr",
      version: "draft-only",
      status: "draft",
      contentHash: "draft-hash"
    }, superAdmin);

    const created = await harness.request("/admin/quote-form-definitions", {
      method: "POST",
      headers,
      body: body(seed, { consentTextId: unpublished.id })
    });
    expect(created.status).toBe(201);
    const draft = await created.json() as { id: string };

    const refused = await harness.request(`/admin/quote-form-definitions/${draft.id}/publish`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "should be refused" })
    });
    expect(refused.status).toBe(422);
  });

  it("retires the previous published version so exactly one stays exposed", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const headers = { "content-type": "application/json", authorization: `Bearer ${token(superAdmin)}` };

    const created = await harness.request("/admin/quote-form-definitions", { method: "POST", headers, body: body(seed, { version: "v3" }) });
    const draft = await created.json() as { id: string };
    await harness.request(`/admin/quote-form-definitions/${draft.id}/publish`, { method: "POST", headers, body: JSON.stringify({ reason: "publication v3 audited" }) });

    const listed = await harness.request("/admin/quote-form-definitions?status=published", { headers: { authorization: `Bearer ${token(superAdmin)}` } });
    const published = await listed.json() as Array<{ id: string; version: string }>;
    expect(published).toHaveLength(1);
    expect(published[0]?.version).toBe("v3");
  });
});

describe("the published form's answers reach the broker (spec 043)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("carries the visitor's consented answers onto every lead assignment", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    const submitted = await harness.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        countryCode: seed.country.isoCode,
        productKey: seed.product.key,
        formDefinitionId: seed.form.id,
        contact: { displayName: "Visiteur Reponses", email: "reponses@visitor.example", phone: "+2250102030455" },
        answers: { vehicle_use: "prive" },
        consent: {
          accepted: true,
          consentTextId: seed.consentText.id,
          version: seed.consentText.version,
          contentHash: seed.consentText.contentHash
        },
        sessionId: "answers-session",
        ipAddress: "127.0.0.1"
      })
    });
    expect(submitted.status).toBe(201);

    const assignments = await harness.runtime.leads.assignments.list();
    const assignment = assignments.at(-1);
    // An assignment with an empty answers object means the broker receives a contact and nothing else.
    expect(assignment?.answers).toMatchObject({ vehicle_use: "prive" });
  });
});
