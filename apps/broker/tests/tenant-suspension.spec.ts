import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { TENANT_SUSPENDED_MESSAGE, canMutateCrmLead, canMutateStarterLead, isTenantReadOnly } from "../app/lib/broker-permissions";

/** Spec 051 T027, T028: a suspended partner keeps read access only in the broker portal. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

const suspendedOwner = { roles: ["broker_owner_pro"], partnerPlan: "pro" as const, mfaVerified: true, partnerTenantStatus: "suspended", tenantReadOnly: true };

test("the session flags a suspended partner as read-only", () => {
  expect(TENANT_SUSPENDED_MESSAGE).toBe("Compte suspendu : consultation seule. Contactez AssurMatch.");
  expect(isTenantReadOnly(suspendedOwner)).toBe(true);
  expect(isTenantReadOnly({ partnerTenantStatus: "suspended" })).toBe(true);
  expect(isTenantReadOnly({ partnerTenantStatus: "active", tenantReadOnly: false })).toBe(false);
  expect(canMutateStarterLead(suspendedOwner)).toBe(false);
  expect(canMutateCrmLead(suspendedOwner)).toBe(false);
  expect(canMutateCrmLead({ ...suspendedOwner, partnerTenantStatus: "active", tenantReadOnly: false })).toBe(true);
  const auth = source("apps/broker/app/lib/backoffice-auth.ts");
  expect(auth).toContain("partnerTenantStatus?: string;");
  expect(auth).toContain("tenantReadOnly?: boolean;");
});

test("the layout shows a persistent suspended banner", () => {
  const layout = source("apps/broker/app/layout.tsx");
  expect(layout).toContain("isTenantReadOnly(profile) ? TENANT_SUSPENDED_MESSAGE : undefined");
  expect(layout).toContain("suspendedBanner={suspendedBanner}");
  const shell = source("apps/broker/app/lib/ui/broker-shell.tsx");
  expect(shell).toContain("data-tenant-suspended-banner=\"true\"");
});

test("write actions are disabled while suspended", () => {
  const guard = source("apps/broker/app/lib/ui/broker-ui.tsx");
  expect(guard).toContain("<fieldset disabled data-tenant-read-only=\"true\"");
  for (const [path, marker] of [
    ["apps/broker/app/enterprise/page.tsx", "<TenantWriteGuard readOnly={readOnly}>"],
    ["apps/broker/app/notifications/page.tsx", "<TenantWriteGuard readOnly={isTenantReadOnly(session.profile)}>"],
    ["apps/broker/app/crm/page.tsx", "<TenantWriteGuard readOnly={isTenantReadOnly(session.profile)}>"],
    ["apps/broker/app/crm/leads/[leadAssignmentId]/lead-ai-panel.tsx", "<TenantWriteGuard readOnly={readOnly}>"],
    ["apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx", "readOnly={tenantReadOnly}"],
    ["apps/broker/app/leads/[leadAssignmentId]/page.tsx", "const tenantReadOnly = isTenantReadOnly(session.profile);"]
  ] as const) {
    expect(source(path), path).toContain(marker);
  }
  // The enterprise screen guards its five write forms (agency, member, role, SLA, branding).
  expect(source("apps/broker/app/enterprise/page.tsx").match(/<TenantWriteGuard readOnly=\{readOnly\}>/g)?.length).toBe(5);
  // Marking a notification read stays allowed for a suspended partner (backend inventory).
  const notifications = source("apps/broker/app/notifications/page.tsx");
  expect(notifications.indexOf("<form action={markNotificationReadAction}>")).toBeLessThan(notifications.indexOf("<TenantWriteGuard"));
});

test("a 403 PARTNER_SUSPENDED refusal is shown with the same message", () => {
  const write = source("apps/broker/app/lib/broker-write.ts");
  expect(write).toContain("export const PARTNER_SUSPENDED_CODE = \"PARTNER_SUSPENDED\";");
  expect(write).toContain("suspended: payload?.code === PARTNER_SUSPENDED_CODE");
  for (const path of [
    "apps/broker/app/lib/lead-actions.ts",
    "apps/broker/app/lib/enterprise-actions.ts",
    "apps/broker/app/lib/notification-actions.ts",
    "apps/broker/app/lib/crm-ai-actions.ts"
  ]) {
    const content = source(path);
    expect(content, path).toContain("callBrokerWrite(");
    expect(content, path).toContain("if (result.suspended) return \"suspended\";");
  }
  for (const path of [
    "apps/broker/app/leads/[leadAssignmentId]/page.tsx",
    "apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx",
    "apps/broker/app/enterprise/page.tsx",
    "apps/broker/app/notifications/page.tsx",
    "apps/broker/app/crm/leads/[leadAssignmentId]/lead-ai-panel.tsx"
  ]) {
    expect(source(path), path).toContain("suspended: ");
  }
});
