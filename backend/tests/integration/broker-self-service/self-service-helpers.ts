import type { AssurMatchRole } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type { ActorContext } from "../../../src/modules/common/types";
import type { RuntimeHttpHarness } from "../runtime-http-test-utils";
import { acceptedProof, callJson, compliance, createLicense, createPartner, seedOnboardingRuntime, superAdmin } from "../partners/partner-admin-http-helpers";

let counter = 0;

/** A real broker user of the partner (so the auth guard's access snapshot applies) and its actor. */
export async function brokerUser(harness: RuntimeHttpHarness, partnerId: string, role: AssurMatchRole, options: { activated?: boolean } = {}): Promise<ActorContext> {
  counter += 1;
  const user = await harness.runtime.users.service.create({
    email: `${role}-${counter}-${partnerId.slice(0, 6)}@courtier.example`,
    displayName: `${role} ${counter}`,
    roles: [role],
    partnerTenantId: partnerId,
    scopes: { countryIds: [], productIds: [] }
  }, superAdmin);
  if (options.activated !== false) {
    await harness.runtime.users.service.activateWithPassword(user.id, await harness.runtime.auth.passwordHashing.hash("Correct horse battery 53"));
  }
  return { actorId: user.id, roles: [role], partnerTenantId: partnerId, partnerPlan: "pro", mfaVerified: true };
}

/**
 * Partner A (CI, valid licence with accepted proof, CI and auto authorised) and partner B, each
 * with an owner, a manager, an agent and a read-only user.
 */
export async function seedSelfService(harness: RuntimeHttpHarness) {
  const seed = await seedOnboardingRuntime(harness);
  const partnerA = await createPartner(harness, superAdmin, seed.country.id);
  const licenseA = await createLicense(harness, superAdmin, partnerA.id, seed.country.id, [seed.product.id]);
  await acceptedProof(harness, partnerA.id, licenseA.id);
  await callJson(harness, compliance, "POST", `/admin/partners/${partnerA.id}/licenses/${licenseA.id}/validate`, { reason: "licence verifiee aupres du regulateur" }, 200);
  await callJson(harness, superAdmin, "POST", `/admin/partners/${partnerA.id}/authorizations/countries`, { countryId: seed.country.id, reason: "couverture pays du pilote" }, 201);
  await callJson(harness, superAdmin, "POST", `/admin/partners/${partnerA.id}/authorizations/products`, { productId: seed.product.id, reason: "couverture produit du pilote" }, 201);
  const partnerB = await createPartner(harness, superAdmin, seed.senegal.id);
  const licenseB = await createLicense(harness, superAdmin, partnerB.id, seed.senegal.id, []);
  return {
    seed,
    partnerA,
    licenseA,
    partnerB,
    licenseB,
    ownerA: await brokerUser(harness, partnerA.id, "broker_owner_pro"),
    managerA: await brokerUser(harness, partnerA.id, "broker_manager"),
    agentA: await brokerUser(harness, partnerA.id, "broker_agent"),
    readOnlyA: await brokerUser(harness, partnerA.id, "broker_read_only"),
    ownerB: await brokerUser(harness, partnerB.id, "broker_owner_pro")
  };
}
