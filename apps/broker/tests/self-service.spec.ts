import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ErrorCodes } from "../../../packages/shared/contracts/error-codes";
import { brokerProfileUpdateSchema, brokerTeamInviteSchema } from "../../../packages/shared/contracts/broker-self-service.contracts";
import { TENANT_SUSPENDED_MESSAGE, canManageTeam, canMutateAccount, canReadAccount, isBrokerOwner } from "../app/lib/broker-permissions";
import { SELF_SERVICE_ERROR_MESSAGES, TEAM_INVITE_ROLE_OPTIONS, selfServiceErrorMessage } from "../app/lib/self-service-messages";

/** Spec 053 T017-T021: source markers and pure helpers of the broker self-service screens. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

const profile = (roles: string[], extra: Record<string, unknown> = {}) => ({ roles, partnerTenantId: "tenant-a", partnerPlan: "pro" as const, mfaVerified: true, ...extra });

const selfServiceFiles = [
  "apps/broker/app/company/page.tsx",
  "apps/broker/app/company/company-forms.tsx",
  "apps/broker/app/licenses/page.tsx",
  "apps/broker/app/licenses/license-forms.tsx",
  "apps/broker/app/licenses/[licenseId]/documents/route.ts",
  "apps/broker/app/team/page.tsx",
  "apps/broker/app/team/team-forms.tsx",
  "apps/broker/app/lib/self-service-api.ts",
  "apps/broker/app/lib/self-service-actions.ts",
  "apps/broker/app/lib/self-service-messages.ts"
];

test("navigation exposes Société, Licences and a functional Equipe in the broker shell only", () => {
  const shell = source("apps/broker/app/lib/ui/broker-shell.tsx");
  expect(shell).toContain("{ label: \"Société\", href: \"/company\"");
  expect(shell).toContain("{ label: \"Licences\", href: \"/licenses\"");
  expect(shell).toContain("{ label: \"Equipe\", href: \"/team\", icon: \"team\", match: [\"/team\"] }");
  const adminShell = source("apps/admin/app/lib/ui/admin-shell.tsx");
  expect(adminShell).not.toContain("/company");
  expect(adminShell).not.toContain("\"/team\"");
});

test("the self-service client calls broker routes only and never exposes the session token", () => {
  const api = source("apps/broker/app/lib/self-service-api.ts");
  for (const marker of [
    "\"/broker/account/profile\"",
    "\"/broker/account/requests\"",
    "\"/broker/account/catalog\"",
    "\"/broker/licenses\"",
    "\"/broker/team\"",
    "/broker/licenses/${encodeURIComponent(licenseId)}/documents",
    "suspended: response.status === 403 && code === PARTNER_SUSPENDED_CODE"
  ]) {
    expect(api, marker).toContain(marker);
  }
  for (const file of selfServiceFiles) {
    const content = source(file);
    expect(content, file).not.toContain("/admin/");
    expect(content, file).not.toContain("partnerTenantId=");
  }
  const actions = source("apps/broker/app/lib/self-service-actions.ts");
  expect(actions).toContain("\"use server\"");
  for (const marker of [
    "writeSelfService(\"/broker/account/profile\", \"PATCH\"",
    "\"/broker/account/requests/profile\", \"POST\"",
    "\"/broker/account/requests/coverage\", \"POST\"",
    "/broker/account/requests/${encodeURIComponent(requestId)}/cancel",
    "/broker/licenses/${encodeURIComponent(licenseId)}/renewals",
    "\"/broker/team\", \"POST\"",
    "/broker/team/${encodeURIComponent(userId)}/${action}",
    "/broker/team/${encodeURIComponent(userId)}/role"
  ]) {
    expect(actions, marker).toContain(marker);
  }
  // The proof is uploaded through a same-origin route handler guarded against cross-site posts.
  const route = source("apps/broker/app/licenses/[licenseId]/documents/route.ts");
  expect(route).toContain("UPLOAD_CSRF_HEADER");
  expect(route).toContain("uploadBrokerLicenseProof");
  expect(source("apps/broker/app/licenses/license-forms.tsx")).toContain("[UPLOAD_CSRF_HEADER]: \"1\"");
});

test("the company page reads every partner field and routes identity changes through AssurMatch", () => {
  const page = source("apps/broker/app/company/page.tsx");
  for (const marker of ["Raison sociale", "RCCM", "Quota mensuel", "SLA contractuel", "Assureurs partenaires", "Pays autorisés", "Produits autorisés", "Mes demandes", "TenantWriteGuard", "canMutateAccount"]) {
    expect(page, marker).toContain(marker);
  }
  const forms = source("apps/broker/app/company/company-forms.tsx");
  expect(forms).toContain("Demander une modification d'identité");
  expect(forms).toContain("Demander une extension de couverture");
  // Identity fields are never part of the direct edit form.
  const directForm = forms.slice(forms.indexOf("export function CompanyProfileForm"), forms.indexOf("export function IdentityChangeRequestForm"));
  for (const field of ["name=\"legalName\"", "name=\"registrationNumber\"", "name=\"countryId\"", "name=\"tradeName\"", "name=\"plan\"", "name=\"quotaMonthlyLeads\""]) {
    expect(directForm, field).not.toContain(field);
  }
  // The API schema refuses them too (strict).
  expect(brokerProfileUpdateSchema.safeParse({ legalName: "Autre" }).success).toBe(false);
  expect(brokerProfileUpdateSchema.safeParse({ city: "Abidjan" }).success).toBe(true);
});

test("the licences page never offers a validation and the team page never offers the owner role", () => {
  const licenses = source("apps/broker/app/licenses/page.tsx") + source("apps/broker/app/licenses/license-forms.tsx");
  expect(licenses).toContain("En revue par la conformité AssurMatch");
  expect(licenses).not.toMatch(/\/validate|Valider la licence/);
  const team = source("apps/broker/app/team/page.tsx") + source("apps/broker/app/team/team-forms.tsx");
  expect(team).toContain("readBrokerTeam");
  expect(team).toContain("member.isSelf");
  expect(team).toContain("member.isOwner && !actorIsOwner");
  expect(team).not.toContain("broker_owner_pro");
  expect(TEAM_INVITE_ROLE_OPTIONS.map((option) => option.value)).toEqual(["broker_manager", "broker_agent", "broker_read_only"]);
  expect(brokerTeamInviteSchema.safeParse({ email: "a@b.example", displayName: "Owner", role: "broker_owner_pro" }).success).toBe(false);
});

test("permissions: owners and managers write, agents and read-only read, suspended partners read only", () => {
  for (const role of ["broker_owner_starter", "broker_owner_pro", "broker_manager"]) {
    expect(canMutateAccount(profile([role])), role).toBe(true);
    expect(canManageTeam(profile([role])), role).toBe(true);
  }
  for (const role of ["broker_agent", "broker_read_only"]) {
    expect(canReadAccount(profile([role])), role).toBe(true);
    expect(canMutateAccount(profile([role])), role).toBe(false);
    expect(canManageTeam(profile([role])), role).toBe(false);
  }
  const suspended = profile(["broker_owner_pro"], { partnerTenantStatus: "suspended" });
  expect(canMutateAccount(suspended)).toBe(false);
  expect(canManageTeam(suspended)).toBe(false);
  expect(isBrokerOwner(profile(["broker_owner_starter"]))).toBe(true);
  expect(isBrokerOwner(profile(["broker_manager"]))).toBe(false);
});

test("refusals are translated, including the suspended partner and the team guards", () => {
  expect(selfServiceErrorMessage({ status: 403, code: ErrorCodes.PARTNER_SUSPENDED, suspended: true })).toBe(TENANT_SUSPENDED_MESSAGE);
  for (const code of [ErrorCodes.TEAM_LAST_OWNER, ErrorCodes.TEAM_SELF_ACTION, ErrorCodes.PARTNER_REQUEST_PENDING, ErrorCodes.PARTNER_REQUEST_ALREADY_DECIDED]) {
    expect(SELF_SERVICE_ERROR_MESSAGES[code], code).toBeTruthy();
    expect(selfServiceErrorMessage({ status: 422, code })).toBe(SELF_SERVICE_ERROR_MESSAGES[code]);
  }
  for (const file of selfServiceFiles) {
    expect(source(file), file).not.toMatch(/souscrire maintenant|acheter maintenant|contrat valide|garantie acceptée/i);
  }
});
