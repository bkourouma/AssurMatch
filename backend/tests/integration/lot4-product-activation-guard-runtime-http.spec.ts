import { afterEach, describe, expect, it } from "vitest";
import { ACTIVATION_ATTESTABLE_CONTROLS } from "../../../packages/shared/contracts/activation-checklist.contracts";
import type { AdminProductView, CatalogActivationBlocker } from "../../../packages/shared/contracts/catalog.contracts";
import { auditEntries, call, superAdmin } from "./catalog/catalog-http-helpers";
import { attestAllControls, satisfyLot4ActivationRequirements } from "./helpers/lot4-activation-fixtures";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "./runtime-http-test-utils";

// Lot 4 (spec 070, PRD 36): making a product public (status or global flag) is gated by the activation checklist.
type ErrorBody = { code: string; message: string; blockers?: CatalogActivationBlocker[] };

describe("lot 4: product public activation guard over HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  /** The seeded product is public and flagged; it is closed (status + flag) so it can be reopened through the gate. */
  async function closedProduct(h: RuntimeHttpHarness) {
    const seed = await seedPublicRuntime(h.runtime);
    const suspended = await call<AdminProductView>(h, superAdmin, "PATCH", `/admin/products/${seed.product.id}`, { status: "suspended", reason: "fermeture avant reouverture" });
    expect(suspended.status).toBe(200);
    const flagOff = await call<AdminProductView>(h, superAdmin, "POST", `/admin/products/${seed.product.id}/flags`, { key: "product_public_enabled", value: false, reason: "fermeture du flag avant reouverture" });
    expect(flagOff.status).toBe(200);
    return seed;
  }

  const reopenStatus = (h: RuntimeHttpHarness, productId: string) =>
    call<ErrorBody & AdminProductView>(h, superAdmin, "PATCH", `/admin/products/${productId}`, { status: "public", reason: "reouverture publique du produit" });
  const reopenFlag = (h: RuntimeHttpHarness, productId: string) =>
    call<ErrorBody & AdminProductView>(h, superAdmin, "POST", `/admin/products/${productId}/flags`, { key: "product_public_enabled", value: true, reason: "reouverture du flag public" });

  it("refuses the public status and the public flag while a prerequisite or attestation is missing, then accepts both once provided", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await closedProduct(harness);
    const productId = seed.product.id;

    const statusBlocked = await reopenStatus(harness, productId);
    expect(statusBlocked.status).toBe(422);
    expect(statusBlocked.body.code).toBe("ACTIVATION_BLOCKED");
    const expected = ["product_scoring_rules_defined", "product_disclaimers_configured", ...Object.keys(ACTIVATION_ATTESTABLE_CONTROLS.product)];
    expect(statusBlocked.body.blockers?.map((blocker) => blocker.control)).toEqual(expect.arrayContaining(expected));
    // The controls describing the change itself never block it.
    expect(statusBlocked.body.blockers?.map((blocker) => blocker.control)).not.toContain("product_status_public");
    expect(auditEntries(harness, "product.update_refused", "refused").at(-1)?.reason).toBe("activation_blocked");
    expect((await harness.runtime.products.service.require(productId)).status).toBe("suspended");

    const flagBlocked = await reopenFlag(harness, productId);
    expect(flagBlocked.status).toBe(422);
    expect(flagBlocked.body.code).toBe("ACTIVATION_BLOCKED");
    expect(flagBlocked.body.blockers?.map((blocker) => blocker.control)).toEqual(expect.arrayContaining(expected));
    expect((await harness.runtime.products.service.require(productId)).flags.product_public_enabled).toBe(false);

    // Attestations alone are not enough: the scoring rule and the FR/EN disclaimers are still missing.
    await attestAllControls(harness, "product", productId);
    const partial = await reopenStatus(harness, productId);
    expect(partial.status).toBe(422);
    const remaining = partial.body.blockers?.map((blocker) => blocker.control) ?? [];
    expect(remaining).toEqual(expect.arrayContaining(["product_scoring_rules_defined", "product_disclaimers_configured"]));
    expect(remaining.filter((control) => control in ACTIVATION_ATTESTABLE_CONTROLS.product)).toEqual([]);

    // Everything provided: both changes go through.
    await satisfyLot4ActivationRequirements(harness, { countryId: seed.country.id, productIds: [productId] });
    // The existing rule needs the flag before the status: flag first, then status.
    const flagOn = await reopenFlag(harness, productId);
    expect(flagOn.status, JSON.stringify(flagOn.body)).toBe(200);
    expect((await harness.runtime.products.service.require(productId)).flags.product_public_enabled).toBe(true);
    const opened = await reopenStatus(harness, productId);
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    expect(opened.body.status).toBe("public");
  });

  it("never gates a deactivation, even when the prerequisites are missing", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);
    const flagOff = await call(harness, superAdmin, "POST", `/admin/products/${seed.product.id}/flags`, { key: "product_public_enabled", value: false, reason: "fermeture du flag public" });
    expect(flagOff.status).toBe(200);
    const suspended = await call(harness, superAdmin, "PATCH", `/admin/products/${seed.product.id}`, { status: "suspended", reason: "suspension du produit" });
    expect(suspended.status).toBe(200);
  });
});
