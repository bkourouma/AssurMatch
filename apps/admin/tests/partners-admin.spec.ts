import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ErrorCodes } from "../../../packages/shared/contracts/error-codes";
import { partnerUserRoleSchema } from "../../../packages/shared/contracts/partner.contracts";
import { adminWriteErrorMessage } from "../app/lib/catalog-messages";
import {
  PARTNER_STATUS_LABELS,
  PARTNER_USER_ROLE_OPTIONS,
  canDecidePartner,
  canDownloadPartnerDocuments,
  canPreparePartner,
  inviteRoleOptions,
  ownerRoleForPlan,
  partnerBlockerHref
} from "../app/lib/partner-messages";

/** Spec 051 T025, T026, T028: source markers of the admin partner (courtier) screens. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

const partnerFiles = [
  "apps/admin/app/partners/page.tsx",
  "apps/admin/app/partners/partner-forms.tsx",
  "apps/admin/app/partners/[partnerId]/page.tsx",
  "apps/admin/app/partners/[partnerId]/documents/route.ts",
  "apps/admin/app/partners/[partnerId]/documents/[documentId]/file/route.ts",
  "apps/admin/app/lib/partner-actions.ts",
  "apps/admin/app/lib/partner-messages.ts"
];

test("the admin API client calls the spec 051 partner routes", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  for (const route of [
    "`/admin/partners${query ? `?${query}` : \"\"}`",
    "\"/admin/partners\", \"POST\"",
    "`/admin/partners/${encodeURIComponent(partnerId)}${suffix}`",
    "partnerPath(partnerId, \"/status\")",
    "partnerPath(partnerId, \"/authorizations/countries\")",
    "/authorizations/countries/${encodeURIComponent(countryId)}/withdraw",
    "partnerPath(partnerId, \"/authorizations/products\")",
    "/authorizations/products/${encodeURIComponent(productId)}/withdraw",
    "partnerPath(partnerId, \"/licenses\")",
    "/licenses/${encodeURIComponent(licenseId)}/${action}",
    "/licenses/${encodeURIComponent(licenseId)}/renew",
    "partnerPath(partnerId, \"/documents\")",
    "/documents/${encodeURIComponent(documentId)}/review",
    "/documents/${encodeURIComponent(documentId)}/file",
    "partnerPath(partnerId, \"/contracts\")",
    "partnerPath(partnerId, \"/users\")"
  ]) {
    expect(api).toContain(route);
  }
  // Every partner mutation keeps its code and its blockers (422 PARTNER_ACTIVATION_BLOCKED).
  expect(api).toContain("writeAdminResult<AdminPartnerDetailView>(partnerPath(partnerId, \"/status\"), \"POST\", input)");
  // The multipart upload forwards the FormData with the bearer token, without a JSON content type.
  expect(api).toMatch(/uploadAdminPartnerDocument[\s\S]*headers: \{ Authorization: `Bearer \$\{token\}` \},\s*body: form/);
});

test("navigation exposes the Partenaires group with Courtiers and Candidatures", () => {
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");
  expect(shell).toContain("{ label: \"Courtiers\", href: \"/partners\" }");
  expect(shell).toContain("{ label: \"Candidatures\", href: \"/partners/applications\" }");
});

test("the directory keeps the SLA table and offers the filters of US7", () => {
  const page = source("apps/admin/app/partners/page.tsx");
  for (const marker of [
    "readAdminPartners",
    "name=\"status\"",
    "name=\"countryId\"",
    "name=\"plan\"",
    "Licence expirant sous N jours",
    "licenseExpiringWithinDays: expiring",
    "Engagement de reactivite (SLA) par partenaire",
    "readPartnerSla",
    "Expiré",
    "CreatePartnerForm",
    "canPreparePartner"
  ]) {
    expect(page).toContain(marker);
  }
});

test("statuses use the PRD labels, with the computed Expiré", () => {
  expect(PARTNER_STATUS_LABELS).toEqual({
    draft: "Prospect",
    pending_compliance: "En vérification",
    active_test: "Actif test",
    active: "Actif public",
    suspended: "Suspendu",
    expired: "Expiré",
    retired: "Résilié"
  });
});

test("the partner page covers every US7 section with fix anchors", () => {
  const page = source("apps/admin/app/partners/[partnerId]/page.tsx");
  for (const anchor of ["id=\"identite\"", "id=\"statut\"", "id=\"conditions\"", "id=\"licences\"", "id=\"documents\"", "id=\"contrat\"", "id=\"couverture\"", "id=\"utilisateurs\"", "id=\"historique\""]) {
    expect(page).toContain(anchor);
  }
  for (const marker of ["allowedTransitions", "activationBlockers", "statusHistory", "effectiveStatus", "scanStatus", "quarantined", "EditPartnerForm", "InviteUserForm", "RecordContractForm", "AuthorizeScopeForm", "WithdrawScopeForm", "UploadDocumentForm"]) {
    expect(page).toContain(marker);
  }
  expect(source("apps/admin/app/partners/partner-forms.tsx")).toContain("name=\"expectedUpdatedAt\" value={partner.updatedAt}");
  expect(partnerBlockerHref("license_valid_with_document", { id: "p", countryId: "c" })).toBe("#licences");
  expect(partnerBlockerHref("coverage_country", { id: "p", countryId: "c" })).toBe("#couverture");
  expect(partnerBlockerHref("coverage_product", { id: "p", countryId: "c" })).toBe("#couverture");
  expect(partnerBlockerHref("owner_user", { id: "p", countryId: "c" })).toBe("#utilisateurs");
  expect(partnerBlockerHref("contract_recorded", { id: "p", countryId: "c" })).toBe("#contrat");
  expect(partnerBlockerHref("country_broker_onboarding_enabled", { id: "p", countryId: "c" })).toBe("/catalog/countries/c");
});

test("every partner mutation asks for an audited reason of at least 8 characters", () => {
  const forms = source("apps/admin/app/partners/partner-forms.tsx");
  const actions = source("apps/admin/app/lib/partner-actions.ts");
  expect(forms).toContain("label=\"Motif (audite)\"");
  expect(forms).toContain("name=\"reason\" minLength={8}");
  expect(actions).toContain("const REASON_MIN_LENGTH = 8;");
  const exported = actions.match(/export async function \w+/g) ?? [];
  expect(exported.length).toBeGreaterThanOrEqual(13);
  const reasonChecks = actions.match(/reasonError\(/g) ?? [];
  // One check per exported action (the helper's own declaration adds one).
  expect(reasonChecks.length).toBeGreaterThanOrEqual(exported.length + 1);
});

test("compliance-only actions are hidden for the other roles, support_admin gets no action", () => {
  expect(canDecidePartner(["compliance_admin"])).toBe(true);
  expect(canDecidePartner(["super_admin"])).toBe(true);
  expect(canDecidePartner(["admin_pays"])).toBe(false);
  expect(canDecidePartner(["support_admin"])).toBe(false);
  expect(canPreparePartner(["admin_pays"])).toBe(true);
  expect(canPreparePartner(["support_admin"])).toBe(false);
  expect(canDownloadPartnerDocuments(["support_admin"])).toBe(false);
  expect(canDownloadPartnerDocuments(["compliance_admin"])).toBe(true);

  const page = source("apps/admin/app/partners/[partnerId]/page.tsx");
  expect(page).toContain("const canDecide = canDecidePartner(roles);");
  expect(page).toContain("target === \"pending_compliance\" ? canPrepare : canDecide");
  expect(page).toContain("canDecide && [\"draft\", \"pending_review\"].includes(license.status) ? <LicenseActionForm");
  expect(page).toContain("canDecide && !retired && [\"uploaded\", \"pending_review\"].includes(document.status) ? (");
  expect(page).toContain("const editable = canPrepare && !retired;");
  const forms = source("apps/admin/app/partners/partner-forms.tsx");
  expect(forms).toContain("data-compliance-only=\"license\"");
  expect(forms).toContain("data-compliance-only=\"document-review\"");
  // Suspension and termination are confirmed in a dialog.
  expect(source("apps/admin/app/lib/partner-messages.ts")).toContain("PARTNER_SENSITIVE_TRANSITIONS = new Set([\"suspended\", \"retired\"])");
  expect(forms).toContain("PARTNER_SENSITIVE_TRANSITIONS.has(target)");
});

test("documents are uploaded and downloaded through server-side handlers only", () => {
  const upload = source("apps/admin/app/partners/[partnerId]/documents/route.ts");
  expect(upload).toContain("export async function POST");
  expect(upload).toContain("uploadAdminPartnerDocument(partnerId, outgoing)");
  expect(upload).toContain("UPLOAD_CSRF_HEADER");
  expect(upload).toContain("DOCUMENT_MAX_BYTES");
  const download = source("apps/admin/app/partners/[partnerId]/documents/[documentId]/file/route.ts");
  expect(download).toContain("export async function GET");
  expect(download).toContain("fetchAdminPartnerDocumentFile(partnerId, documentId)");
  expect(download).toContain("\"cache-control\": \"no-store\"");
  expect(download).toContain("attachment");
  expect(download).toContain("new Response(upstream.body");

  const forms = source("apps/admin/app/partners/partner-forms.tsx");
  expect(forms).toContain("fetch(`/partners/${encodeURIComponent(partnerId)}/documents`");
  expect(forms).toContain("[UPLOAD_CSRF_HEADER]: \"1\"");
  // The download link is hidden for support_admin and for quarantined or unscanned files.
  const page = source("apps/admin/app/partners/[partnerId]/page.tsx");
  expect(page).toContain("canDownload && !document.quarantined && document.scanStatus === \"clean\" ? (");
  expect(page).toContain("/documents/${encodeURIComponent(document.id)}/file");
});

test("no client component can reach the admin session token", () => {
  const clientFiles = files("apps/admin/app").filter((file) => /\.(tsx?|jsx?)$/.test(file) && /^\s*["']use client["']/.test(source(file)));
  expect(clientFiles.length).toBeGreaterThan(0);
  for (const file of clientFiles) {
    const content = source(file);
    expect(content, file).not.toContain("assurmatch_admin_token");
    expect(content, file).not.toContain("getBackOfficeToken");
    expect(content, file).not.toContain("backoffice-auth");
  }
});

test("the invitation offers broker roles only, with the owner role of the plan", () => {
  expect([...PARTNER_USER_ROLE_OPTIONS].sort()).toEqual([...partnerUserRoleSchema.options].sort());
  expect(ownerRoleForPlan("starter")).toBe("broker_owner_starter");
  expect(ownerRoleForPlan("pro")).toBe("broker_owner_pro");
  expect(ownerRoleForPlan("enterprise")).toBe("broker_owner_pro");
  expect(inviteRoleOptions("starter")).not.toContain("broker_owner_pro");
  expect(inviteRoleOptions("pro")).not.toContain("broker_owner_starter");
  const forms = source("apps/admin/app/partners/partner-forms.tsx");
  expect(forms).toContain("defaultValue={owner}");
  expect(forms).toContain("Jeton d&apos;activation à usage unique");
});

test("spec 051 refusal codes are translated into French", () => {
  const codes = [
    ErrorCodes.PARTNER_ACTIVATION_BLOCKED,
    ErrorCodes.PARTNER_TRANSITION_INVALID,
    ErrorCodes.PARTNER_DUPLICATE_REGISTRATION,
    ErrorCodes.PARTNER_UPDATE_CONFLICT,
    ErrorCodes.PARTNER_RETIRED,
    ErrorCodes.PARTNER_SUSPENDED,
    ErrorCodes.PARTNER_USER_INVALID,
    ErrorCodes.LICENSE_DOCUMENT_REQUIRED,
    ErrorCodes.LICENSE_EXPIRED,
    ErrorCodes.LICENSE_TRANSITION_INVALID,
    ErrorCodes.LICENSE_REQUIRED_FOR_COUNTRY,
    ErrorCodes.DOCUMENT_QUARANTINED,
    ErrorCodes.DOCUMENT_INVALID,
    ErrorCodes.DOCUMENT_STORAGE_NOT_CONFIGURED,
    ErrorCodes.CONTRACT_DOCUMENT_INVALID,
    ErrorCodes.COUNTRY_BROKER_ONBOARDING_DISABLED,
    ErrorCodes.APPLICATION_ALREADY_DECIDED,
    ErrorCodes.SLA_TARGET_EXCEEDS_CONTRACT
  ];
  const generic = adminWriteErrorMessage({ status: 422, code: "SOMETHING_ELSE" });
  for (const code of codes) {
    const message = adminWriteErrorMessage({ status: 422, code });
    expect(message, code).not.toBe(generic);
    expect(message, code).not.toContain(code);
  }
  expect(adminWriteErrorMessage({ status: 403, code: ErrorCodes.PARTNER_SUSPENDED })).toBe("Compte suspendu : consultation seule. Contactez AssurMatch.");
  expect(adminWriteErrorMessage({ status: 409, code: ErrorCodes.PARTNER_UPDATE_CONFLICT })).toContain("Rechargez la page");
  expect(adminWriteErrorMessage({ status: 413 })).toContain("Fichier trop volumineux");
});

test("the users screen picks the partner from the directory", () => {
  const forms = source("apps/admin/app/users/user-action-forms.tsx");
  const page = source("apps/admin/app/users/page.tsx");
  const actions = source("apps/admin/app/users/actions.ts");
  expect(forms).not.toContain("UUID tenant pour utilisateurs courtier");
  expect(forms).toContain("Courtier de rattachement");
  expect(forms).toContain("<Select {...fieldControlProps(ids.partnerTenantId, { hint: \"x\" })} name=\"partnerTenantId\"");
  expect(page).toContain("readAdminPartners()");
  expect(page).toContain("partner.status !== \"retired\"");
  expect(actions).toContain("adminWriteErrorMessage(result)");
  expect(source("apps/admin/app/lib/admin-api.ts")).toContain("return writeAdminResult<AdminUserCreateResult>(\"/admin/users\", \"POST\", input);");
});

test("partner screens avoid forbidden regulated wording", () => {
  const combined = [...partnerFiles, "apps/admin/app/partners/applications/page.tsx", "apps/admin/app/partners/applications/[applicationId]/page.tsx", "apps/admin/app/partners/applications/application-forms.tsx"]
    .map(source)
    .join("\n");
  for (const forbidden of ["Souscrire", "Contrat valide", "Contrat validé", "Garantie acceptée", "Acheter", "meilleure assurance", "Devis garanti", "Prix garanti"]) {
    expect(combined).not.toContain(forbidden);
  }
});
