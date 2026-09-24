import { expect, test } from "@playwright/test";
import { BROKER_ROLE_PERMISSIONS, canMutateCrmLead, canMutateStarterLead, isReadOnlyBroker } from "../../app/lib/broker-permissions";
import { RolePermissions } from "../../../../packages/shared/rbac/assurmatch-role-matrix";

const profile = (roles: string[]) => ({ roles, partnerTenantId: "tenant-a", partnerPlan: "pro" as const, mfaVerified: true });

test("the broker permission table mirrors the shared RBAC matrix", async () => {
  for (const [role, permissions] of Object.entries(BROKER_ROLE_PERMISSIONS)) {
    expect(RolePermissions[role as keyof typeof RolePermissions], `role ${role} missing in the shared matrix`).toEqual(permissions);
  }

  // Every broker role of the shared matrix is covered by the back-office table.
  const brokerRoles = Object.keys(RolePermissions).filter((role) => role.startsWith("broker_"));
  expect(Object.keys(BROKER_ROLE_PERMISSIONS).sort()).toEqual(brokerRoles.sort());
});

test("read-only brokers cannot mutate Starter or CRM leads", async () => {
  const readOnly = profile(["broker_read_only"]);
  expect(isReadOnlyBroker(readOnly)).toBe(true);
  expect(canMutateStarterLead(readOnly)).toBe(false);
  expect(canMutateCrmLead(readOnly)).toBe(false);
});

test("owner, manager and agent roles keep their documented mutation rights", async () => {
  expect(canMutateStarterLead(profile(["broker_owner_starter"]))).toBe(true);
  expect(canMutateCrmLead(profile(["broker_owner_starter"]))).toBe(false);

  expect(canMutateStarterLead(profile(["broker_owner_pro"]))).toBe(true);
  expect(canMutateCrmLead(profile(["broker_owner_pro"]))).toBe(true);

  expect(canMutateStarterLead(profile(["broker_manager"]))).toBe(true);
  expect(canMutateCrmLead(profile(["broker_manager"]))).toBe(true);

  // An agent only holds the assigned-scope update permission, which still allows the forms.
  expect(canMutateStarterLead(profile(["broker_agent"]))).toBe(true);
  expect(canMutateCrmLead(profile(["broker_agent"]))).toBe(true);

  // An unknown or non-broker role grants nothing.
  expect(canMutateStarterLead(profile(["finance_admin"]))).toBe(false);
  expect(canMutateCrmLead(profile(["finance_admin"]))).toBe(false);
});
