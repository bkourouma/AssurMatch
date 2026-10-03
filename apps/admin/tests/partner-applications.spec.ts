import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { partnerApplicationRejectionReasonCodeSchema, partnerApplicationStatusSchema } from "../../../packages/shared/contracts/partner-application.contracts";
import {
  APPLICATION_STATUS_LABELS,
  REJECTION_REASON_LABELS,
  REJECTION_REASON_OPTIONS,
  canDecidePartner,
  canReviewApplication
} from "../app/lib/partner-messages";

/** Spec 051 T025, T028: source markers of the admin broker application screens. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("the admin API client calls the application routes", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  for (const route of [
    "`/admin/partners/applications${query ? `?${query}` : \"\"}`",
    "`/admin/partners/applications/${encodeURIComponent(applicationId)}`",
    "`/admin/partners/applications/${encodeURIComponent(applicationId)}/${action}`",
    "applicationPath(applicationId, \"review\")",
    "applicationPath(applicationId, \"convert\")",
    "applicationPath(applicationId, \"reject\")"
  ]) {
    expect(api).toContain(route);
  }
});

test("the list filters by status and country", () => {
  const page = source("apps/admin/app/partners/applications/page.tsx");
  expect(page).toContain("readAdminPartnerApplications({ status, countryId })");
  expect(page).toContain("name=\"status\"");
  expect(page).toContain("name=\"countryId\"");
  expect(page).toContain("/partners/applications/${encodeURIComponent(application.id)}");
  expect(Object.keys(APPLICATION_STATUS_LABELS).sort()).toEqual([...partnerApplicationStatusSchema.options].sort());
});

test("conversion and refusal are compliance only and conversion opens the new partner page", () => {
  expect(canDecidePartner(["admin_pays"])).toBe(false);
  expect(canReviewApplication(["admin_pays"])).toBe(true);
  expect(canReviewApplication(["support_admin"])).toBe(false);
  const detail = source("apps/admin/app/partners/applications/[applicationId]/page.tsx");
  expect(detail).toContain("{canDecide ? (");
  expect(detail).toContain("<ConvertApplicationForm applicationId={application.id} />");
  expect(detail).toContain("<RejectApplicationForm applicationId={application.id} />");
  expect(detail).toContain("application.status === \"received\" && canReview ? <ReviewApplicationForm");
  expect(detail).toContain("contactEmailMasked");
  const actions = source("apps/admin/app/lib/partner-actions.ts");
  expect(actions).toContain("redirect(`/partners/${encodeURIComponent(result.data.partnerTenantId)}?notice=converted`)");
  const forms = source("apps/admin/app/partners/applications/application-forms.tsx");
  expect(forms).toContain("data-compliance-only=\"application-convert\"");
  expect(forms).toContain("data-compliance-only=\"application-reject\"");
  expect(forms).toContain("label=\"Motif (audite)\"");
  expect(forms).toContain("name=\"rejectionReasonCode\"");
  expect(forms).not.toContain("assurmatch_admin_token");
});

test("the refusal reasons mirror the closed list of the contract", () => {
  expect([...REJECTION_REASON_OPTIONS].sort()).toEqual([...partnerApplicationRejectionReasonCodeSchema.options].sort());
  for (const code of REJECTION_REASON_OPTIONS) expect(REJECTION_REASON_LABELS[code]).toBeTruthy();
});
