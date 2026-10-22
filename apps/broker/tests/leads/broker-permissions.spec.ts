import { expect, test } from "@playwright/test";
import {
  BROKER_ROLE_PERMISSIONS,
  CUSTOM_ROLE_RESOURCES,
  canAssignCrmLead,
  canExportCrmLeads,
  canExportStarterLeads,
  canMutateCrmLead,
  canMutateOffers,
  canMutateStarterLead,
  canReadOffers,
  canRequestLossAnalysis,
  hasPermission,
  isReadOnlyBroker
} from "../../app/lib/broker-permissions";
import type { BackOfficeProfile } from "../../app/lib/backoffice-auth";
import { brokerCustomPermissions } from "../../../../packages/shared/contracts/enterprise.contracts";
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

test("spec 052: owners and managers write offers, agents and read-only users only read them", async () => {
  for (const role of ["broker_owner_starter", "broker_owner_pro", "broker_manager"]) {
    expect(canMutateOffers(profile([role])), role).toBe(true);
  }
  for (const role of ["broker_agent", "broker_read_only"]) {
    expect(canMutateOffers(profile([role])), role).toBe(false);
    expect(canReadOffers(profile([role])), role).toBe(true);
  }
  expect(canMutateOffers({ ...profile(["broker_owner_pro"]), partnerTenantStatus: "suspended" } as Parameters<typeof canMutateOffers>[0])).toBe(false);
});

const withCustomRole = (roles: string[], customRolePermissions: string[], plan: "pro" | "enterprise" = "enterprise"): BackOfficeProfile => ({
  roles,
  partnerTenantId: "tenant-a",
  partnerPlan: plan,
  mfaVerified: true,
  customRole: { id: "00000000-0000-4000-8000-000000000001", name: "Restreint" },
  customRolePermissions
});

test("spec 064: a custom role only narrows the base role", async () => {
  // A manager restricted to reading CRM leads loses export, assignment and updates.
  const restricted = withCustomRole(["broker_manager"], ["broker_leads:read", "broker_crm:read"]);
  expect(hasPermission(restricted, "broker_crm:read")).toBe(true);
  expect(hasPermission(restricted, "broker_crm:export")).toBe(false);
  expect(canExportCrmLeads(restricted)).toBe(false);
  expect(canExportStarterLeads(restricted)).toBe(false);
  expect(canAssignCrmLead(restricted)).toBe(false);
  expect(canMutateCrmLead(restricted)).toBe(false);
  expect(canMutateStarterLead(restricted)).toBe(false);

  // Resources outside the catalogue (offers, account, team, billing) are never narrowed.
  expect(hasPermission(restricted, "broker_offers:write")).toBe(true);
  expect(hasPermission(restricted, "broker_team:write")).toBe(true);
  expect(hasPermission(restricted, "billing:read_own")).toBe(true);

  // Without a custom role, nothing changes.
  expect(canExportCrmLeads(profile(["broker_manager"]))).toBe(true);
  expect(canAssignCrmLead(profile(["broker_manager"]))).toBe(true);
});

test("spec 064: a custom role never elevates beyond the base role", async () => {
  // An agent listed with manager-only permissions still cannot export, assign or read the whole CRM.
  const elevated = withCustomRole(["broker_agent"], ["broker_crm:export", "broker_crm:assign", "broker_crm:read", "broker_leads:export", "broker_leads:update"]);
  expect(hasPermission(elevated, "broker_crm:export")).toBe(false);
  expect(canExportCrmLeads(elevated)).toBe(false);
  expect(canExportStarterLeads(elevated)).toBe(false);
  expect(canAssignCrmLead(elevated)).toBe(false);
  expect(hasPermission(elevated, "broker_crm:read")).toBe(false);
  // The base role grant plus a matching custom entry stays allowed.
  expect(canMutateStarterLead(elevated)).toBe(true);
});

test("spec 064: a wildcard query on a catalogue resource is denied under restriction", async () => {
  const restricted = withCustomRole(["broker_owner_pro"], ["broker_crm:read"]);
  expect(hasPermission(restricted, "broker_crm:*")).toBe(false);
  expect(hasPermission(restricted, "broker_crm:read")).toBe(true);
  expect(hasPermission(restricted, "broker_crm:export")).toBe(false);
  expect(canExportCrmLeads(restricted)).toBe(false);
  // An unrestricted owner keeps the wildcard semantics.
  expect(hasPermission(profile(["broker_owner_pro"]), "broker_crm:*")).toBe(true);
  expect(canExportCrmLeads(profile(["broker_owner_pro"]))).toBe(true);
});

test("spec 064: export helpers follow broker_leads:export and broker_crm:export", async () => {
  expect(canExportStarterLeads(profile(["broker_owner_starter"]))).toBe(true);
  expect(canExportStarterLeads(profile(["broker_owner_pro"]))).toBe(true);
  expect(canExportStarterLeads(profile(["broker_manager"]))).toBe(false);
  expect(canExportStarterLeads(profile(["broker_agent"]))).toBe(false);
  expect(canExportStarterLeads(profile(["broker_read_only"]))).toBe(false);

  expect(canExportCrmLeads(profile(["broker_owner_starter"]))).toBe(false);
  expect(canExportCrmLeads(profile(["broker_owner_pro"]))).toBe(true);
  expect(canExportCrmLeads(profile(["broker_manager"]))).toBe(true);
  expect(canExportCrmLeads(profile(["broker_agent"]))).toBe(false);
  expect(canExportCrmLeads(profile(["broker_read_only"]))).toBe(false);

  // A restricted custom role that lists the export permission keeps it.
  expect(canExportCrmLeads(withCustomRole(["broker_manager"], ["broker_crm:read", "broker_crm:export"]))).toBe(true);
});

test("spec 064: loss analysis is an Enterprise CRM feature closed to read-only and suspended accounts", async () => {
  const enterprise = (roles: string[]) => ({ ...profile(roles), partnerPlan: "enterprise" as const });
  expect(canRequestLossAnalysis(enterprise(["broker_owner_pro"]))).toBe(true);
  expect(canRequestLossAnalysis(enterprise(["broker_manager"]))).toBe(true);
  expect(canRequestLossAnalysis(enterprise(["broker_read_only"]))).toBe(false);
  // An agent only reads its assigned leads: no aggregated analysis.
  expect(canRequestLossAnalysis(enterprise(["broker_agent"]))).toBe(false);
  // Pro and Starter plans never request it.
  expect(canRequestLossAnalysis(profile(["broker_owner_pro"]))).toBe(false);
  expect(canRequestLossAnalysis({ ...profile(["broker_owner_starter"]), partnerPlan: "starter" })).toBe(false);
  // Suspended partner: read-only.
  expect(canRequestLossAnalysis({ ...enterprise(["broker_owner_pro"]), partnerTenantStatus: "suspended" })).toBe(false);
  // A custom role without CRM read removes it.
  expect(canRequestLossAnalysis(withCustomRole(["broker_manager"], ["broker_leads:read"]))).toBe(false);
});

test("spec 064: the custom role resources of the portal match the shared contract catalogue", async () => {
  const contractResources = [...new Set(brokerCustomPermissions.map((permission) => permission.split(":")[0]))].sort();
  expect([...CUSTOM_ROLE_RESOURCES].sort()).toEqual(contractResources);
});
