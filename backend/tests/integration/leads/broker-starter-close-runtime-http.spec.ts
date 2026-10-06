import { afterEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

/**
 * Spec 059 follow-up: a Starter broker closes an accepted lead with an outcome over HTTP. The close
 * publishes `lead.status_changed` (status `closed`), which queues the spec 054 visitor "closed"
 * e-mail and, with `satisfaction_survey_enabled` applied through the compliance policy path, the
 * spec 048 survey.
 */
describe("Starter lead closure runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  async function start() {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const submitted = await harness.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.90" },
      body: JSON.stringify({
        countryCode: "CI",
        productKey: "auto",
        formDefinitionId: seed.form.id,
        contact: { displayName: "Visitor", email: "cloture@example.com", phone: "+2250102030405" },
        answers: { vehicle_use: "prive" },
        consent: { accepted: true, consentTextId: seed.consentText.id, version: "v1", contentHash: seed.consentText.contentHash },
        sessionId: "session-cloture"
      })
    });
    expect(submitted.status).toBe(201);
    const [assignment] = await harness.runtime.leads.assignments.list();
    if (!assignment) throw new Error("no assignment");
    const starter: ActorContext = { actorId: "starter-owner", roles: ["broker_owner_starter"], partnerTenantId: seed.partner.id, partnerPlan: "starter", mfaVerified: true };
    return { active: harness, seed, assignment, starter };
  }

  function post(active: RuntimeHttpHarness, path: string, actor: ActorContext, body: unknown) {
    return active.request(path, { method: "POST", headers: { ...actorHeaders(actor), "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  it("closes an accepted lead, e-mails the visitor and queues the survey when the policy enabled it", async () => {
    const { active, seed, assignment, starter } = await start();
    const runtime = active.runtime;
    await runtime.featureFlags.service.applyCompliancePolicy(
      { key: "satisfaction_survey_enabled", scopeType: "global", value: true, reason: "test policy" },
      seed.admin,
      { reference: "POL-TEST-048", approvedBy: "compliance test" }
    );

    const early = await post(active, `/broker/starter/leads/${assignment.id}/close`, starter, { outcome: "gagne" });
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ code: "LEAD_NOT_ACCEPTED" });

    expect((await post(active, `/broker/starter/leads/${assignment.id}/accept`, starter, {})).status).toBeLessThan(300);
    expect((await post(active, `/broker/starter/leads/${assignment.id}/close`, starter, { outcome: "achete" })).status).toBe(400);

    const closed = await post(active, `/broker/starter/leads/${assignment.id}/close`, starter, { outcome: "gagne", comment: "Contrat signe chez l'assureur" });
    expect(closed.status).toBe(200);
    expect(await readJson<{ status: string }>(closed)).toMatchObject({ status: "closed" });

    const types = (await runtime.notifications.service.list()).map((notification) => notification.type);
    expect(types).toContain("visitor_quote_closed");
    const survey = await runtime.satisfactionSurveys.repository.findByLeadAssignmentId(assignment.id);
    expect(survey).toMatchObject({ triggerStatus: "closed", status: "queued" });

    const history = await readJson<Array<{ eventType: string; outcome?: string }>>(await active.request(`/broker/starter/leads/${assignment.id}/history`, { headers: actorHeaders(starter) }));
    expect(history.find((event) => event.eventType === "closed")).toMatchObject({ outcome: "gagne" });

    const again = await post(active, `/broker/starter/leads/${assignment.id}/close`, starter, { outcome: "perdu" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "LEAD_CLOSED" });
  });

  it("refuses the closure to another partner, and to a suspended partner with PARTNER_SUSPENDED", async () => {
    const { active, seed, assignment, starter } = await start();
    expect((await post(active, `/broker/starter/leads/${assignment.id}/accept`, starter, {})).status).toBeLessThan(300);

    const intruder: ActorContext = { ...starter, actorId: "intruder", partnerTenantId: "00000000-0000-4000-8000-0000000000ff" };
    expect((await post(active, `/broker/starter/leads/${assignment.id}/close`, intruder, { outcome: "perdu" })).status).toBeGreaterThanOrEqual(400);

    await active.runtime.partners.service.changeStatus(seed.partner.id, "suspended", "suspension pour controle", seed.admin);
    const refused = await post(active, `/broker/starter/leads/${assignment.id}/close`, starter, { outcome: "perdu" });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "PARTNER_SUSPENDED" });
    expect((await active.runtime.leads.assignments.require(assignment.id)).status).toBe("accepted");
  });
});
