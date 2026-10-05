import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ErrorCodes } from "../../../packages/shared/contracts/error-codes";
import { adminWriteErrorMessage } from "../app/lib/catalog-messages";
import { PARTNER_REQUEST_FIELD_LABELS, PARTNER_REQUEST_STATUS_LABELS, PARTNER_REQUEST_TYPE_LABELS } from "../app/lib/partner-messages";

/** Spec 053 T020/T021: « Demandes du courtier » section of the admin partner page. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("the partner page lists the broker requests and the pending licence renewals", () => {
  const page = source("apps/admin/app/partners/[partnerId]/page.tsx");
  for (const marker of [
    "id=\"demandes\"",
    "title=\"Demandes du courtier\"",
    "readAdminPartnerRequests(partnerId)",
    "pendingRenewals",
    "<a href=\"#licences\">Examiner la preuve et valider</a>",
    "canPrepare && !retired && request.status === \"pending\""
  ]) {
    expect(page, marker).toContain(marker);
  }
});

test("the admin client calls the admin request routes and the decision carries an audited reason", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  expect(api).toContain("`/admin/partner-requests?partnerTenantId=${encodeURIComponent(partnerTenantId)}`");
  expect(api).toContain("`/admin/partner-requests/${encodeURIComponent(requestId)}/decision`");
  const actions = source("apps/admin/app/lib/partner-actions.ts");
  expect(actions).toContain("export async function decidePartnerRequestAction");
  expect(actions).toContain("decideAdminPartnerRequest(requestId, { decision, reason })");
  const forms = source("apps/admin/app/partners/partner-forms.tsx");
  expect(forms).toContain("export function PartnerRequestDecisionForm");
  expect(forms).toContain("\"data-partner-form\": \"request-accept\"");
  expect(forms).toContain("\"data-partner-form\": \"request-reject\"");
  // The broker portal never reaches these screens.
  expect(source("apps/broker/app/lib/self-service-api.ts")).not.toContain("/admin/partner-requests");
});

test("labels and refusal messages cover the request lifecycle", () => {
  expect(Object.keys(PARTNER_REQUEST_TYPE_LABELS).sort()).toEqual(["coverage_extension", "profile_change"]);
  expect(Object.keys(PARTNER_REQUEST_STATUS_LABELS).sort()).toEqual(["accepted", "cancelled", "pending", "rejected"]);
  for (const field of ["legalName", "tradeName", "registrationNumber", "countryId", "productId"]) expect(PARTNER_REQUEST_FIELD_LABELS[field], field).toBeTruthy();
  expect(adminWriteErrorMessage({ status: 409, code: ErrorCodes.PARTNER_REQUEST_ALREADY_DECIDED })).toContain("Demande déjà traitée");
  expect(adminWriteErrorMessage({ status: 422, code: ErrorCodes.LICENSE_REQUIRED_FOR_COUNTRY })).toContain("aucune licence");
});
