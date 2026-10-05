import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import { auditEntries, call, superAdmin } from "./catalog-http-helpers";

type ErrorBody = { code: string; message: string };

describe("generic feature flag route is restricted to global flags (spec 050)", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("refuses to change a country scoped row written by the catalogue, and still updates a global flag", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    const toggled = await call(harness, superAdmin, "POST", `/admin/countries/${seed.country.id}/flags`, { key: "country_waitlist_enabled", value: true, reason: "liste d'attente CI" });
    expect(toggled.status).toBe(200);
    const scoped = harness.runtime.featureFlags.service.list().find((flag) => flag.scopeType === "country" && flag.scopeId === seed.country.id && flag.key === "country_waitlist_enabled");
    expect(scoped?.value).toBe(true);

    const refused = await call<ErrorBody>(harness, superAdmin, "PATCH", `/admin/feature-flags/${scoped!.id}`, { value: false, reason: "contournement du catalogue" });
    expect(refused.status).toBe(403);
    expect(refused.body.message).toContain("catalogue");
    expect(harness.runtime.featureFlags.service.list().find((flag) => flag.id === scoped!.id)?.value).toBe(true);
    expect(auditEntries(harness, "feature_flag.update_refused", "refused").at(-1)?.reason).toBe("scoped_flag_catalog_only");

    const global = harness.runtime.featureFlags.service.list().find((flag) => flag.scopeType === "global" && flag.key === "quote_request_enabled");
    const updated = await call<{ value: boolean }>(harness, superAdmin, "PATCH", `/admin/feature-flags/${global!.id}`, { value: false, reason: "fermeture devis globale" });
    expect(updated.status).toBe(200);
    expect(updated.body.value).toBe(false);
  });
});
