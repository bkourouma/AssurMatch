import { afterEach, describe, expect, it } from "vitest";
import type { AdminPartnerSlaRow, PartnerSla } from "../../../../packages/shared/contracts/enterprise.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { createPartner, seedOnboardingRuntime, superAdmin } from "./partner-admin-http-helpers";

describe("spec 051 R9 contractual SLA target", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("refuses a broker target looser than the contract and shows the contractual target to the admin", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedOnboardingRuntime(harness);
    const partner = await createPartner(harness, superAdmin, seed.country.id, { plan: "enterprise", slaTargetMinutes: 60 });
    const owner: ActorContext = { actorId: "sla-owner", roles: ["broker_owner_pro"], partnerTenantId: partner.id, partnerPlan: "enterprise", mfaVerified: true };
    const put = (minutes: number) => harness!.request("/broker/enterprise/sla", {
      method: "PUT",
      headers: { ...actorHeaders(owner), "content-type": "application/json" },
      body: JSON.stringify({ firstActionTargetMinutes: minutes, reason: "objectif interne du courtier" })
    });

    // Without a broker setting, the broker reads the contractual target.
    expect((await readJson<PartnerSla>(await harness.request("/broker/enterprise/sla", { headers: actorHeaders(owner) }))).firstActionTargetMinutes).toBe(60);

    const looser = await put(120);
    expect(looser.status).toBe(422);
    expect(await looser.json()).toMatchObject({ code: "SLA_TARGET_EXCEEDS_CONTRACT" });
    expect(harness.runtime.audit.writer.search({ action: "enterprise.sla.changed" }).at(-1)).toMatchObject({ result: "refused", reason: "sla_target_exceeds_contract" });

    const tighter = await put(30);
    expect(tighter.status).toBeLessThan(300);
    expect((await readJson<PartnerSla>(tighter)).firstActionTargetMinutes).toBe(30);

    const rows = await readJson<AdminPartnerSlaRow[]>(await harness.request("/admin/partners/sla", { headers: actorHeaders(superAdmin) }));
    expect(rows.find((row) => row.partnerTenantId === partner.id)?.firstActionTargetMinutes).toBe(60);
  });
});
