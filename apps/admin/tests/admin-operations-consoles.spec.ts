import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Spec 056: source markers of the admin operations consoles (H-01 to H-06). */

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("operations API client reads the spec 056 console routes and never throws on a refusal", () => {
  const api = source("apps/admin/app/lib/operations-api.ts");
  expect(api).toContain("admin-operations-consoles:056");
  for (const route of [
    "/admin/operations/quote-requests",
    "/admin/operations/quote-review",
    "/review",
    "/admin/operations/lead-assignments",
    "/reassign",
    "/admin/contact-messages",
    "/status",
    "/admin/operations/audit-logs",
    "/admin/operations/audit-logs/export",
    "/admin/routing/history",
    "/admin/routing/anomalies"
  ]) {
    expect(api, route).toContain(route);
  }
  expect(api).toContain("OperationsWriteResult");
  const actions = source("apps/admin/app/lib/operations-actions.ts");
  expect(actions).toContain("\"use server\"");
  expect(actions).toContain("revalidatePath");
  expect(actions).not.toContain("throw ");
});

test("quote requests console lists, filters and opens a record without contact data in the list (H-01)", () => {
  const list = source("apps/admin/app/quote-requests/page.tsx");
  expect(list).toContain("readQuoteRequests");
  expect(list).toContain("FilterBar");
  for (const filter of ["name=\"status\"", "name=\"routingStatus\"", "name=\"countryId\"", "name=\"productId\"", "name=\"from\"", "name=\"to\""]) {
    expect(list, filter).toContain(filter);
  }
  expect(list).toContain("getRowHref");
  expect(list).not.toContain("emailNormalized");

  const detail = source("apps/admin/app/quote-requests/[quoteRequestId]/page.tsx");
  for (const section of ["Consentement de transmission", "Decisions de routage", "Exclus et raisons", "Affectations", "Offre choisie par le visiteur", "Revue manuelle", "Documents du prospect"]) {
    expect(detail, section).toContain(section);
  }
  expect(detail).toContain("piiMasked");
  expect(detail).toContain("partnerLegalName");
});

test("manual review queue persists audited decisions through the API (H-02)", () => {
  const page = source("apps/admin/app/operations/quote-review/page.tsx");
  expect(page).toContain("Revue operationnelle devis");
  expect(page).toContain("readQuoteReviewQueue");
  expect(page).toContain("QuoteReviewForm");
  const forms = source("apps/admin/app/lib/ui/operations-forms.tsx");
  for (const decision of ["route", "assign", "non_routable", "duplicate"]) {
    expect(forms, decision).toContain(`${decision}:`);
  }
  expect(forms).toContain("data-operations-form=\"quote-review\"");
  expect(forms).toContain("Motif (audite");
  expect(forms).toContain("candidate.eligible");
});

test("lead assignments console lists partner names and offers reassignment (H-03)", () => {
  const page = source("apps/admin/app/lead-assignments/page.tsx");
  expect(page).toContain("Routage des leads");
  expect(page).toContain("readLeadAssignments");
  expect(page).toContain("partnerLegalName");
  expect(page).toContain("ReassignAssignmentForm");
  expect(page).not.toContain("contact.");
});

test("contact inbox changes status with audit and replies by mailto only (H-04)", () => {
  const page = source("apps/admin/app/operations/contact-messages/page.tsx");
  expect(page).toContain("Messages de contact");
  expect(page).toContain("ContactStatusForm");
  expect(page).toContain("mailto:");
  const forms = source("apps/admin/app/lib/ui/operations-forms.tsx");
  expect(forms).toContain("data-operations-form=\"contact-status\"");
  for (const status of ["new:", "handled:", "spam:"]) expect(forms).toContain(status);
});

test("audit log viewer filters, paginates and restricts the export (H-05)", () => {
  const page = source("apps/admin/app/compliance/audit-logs/page.tsx");
  expect(page).toContain("Journaux d'audit");
  for (const filter of ["name=\"actorId\"", "name=\"action\"", "name=\"targetType\"", "name=\"targetId\"", "name=\"result\"", "name=\"from\"", "name=\"to\""]) {
    expect(page, filter).toContain(filter);
  }
  expect(page).toContain("pagination");
  expect(page).toContain("EXPORT_ROLES");
  expect(page).toContain("\"compliance_admin\"");
  expect(page).not.toContain("\"support_admin\"");
  const route = source("apps/admin/app/compliance/audit-logs/export/route.ts");
  expect(route).toContain("exportAuditLogs");
  expect(route).toContain("content-disposition");
  expect(route).toContain("status: 403");
});

test("routing anomalies and history screens exist and are linked from the navigation (H-06)", () => {
  expect(source("apps/admin/app/routing/anomalies/page.tsx")).toContain("readRoutingAnomalies");
  const history = source("apps/admin/app/routing/history/page.tsx");
  expect(history).toContain("readRoutingHistory");
  expect(history).toContain("Exclus et raisons");
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");
  for (const href of ["\"/routing/anomalies\"", "\"/routing/history\"", "\"/compliance/audit-logs\"", "\"/operations/contact-messages\""]) {
    expect(shell, href).toContain(href);
  }
  expect(source("apps/admin/app/lib/ui/operations-tabs.tsx")).toContain("/operations/contact-messages");
});

test("the operations consoles stay inside the admin app", () => {
  for (const path of ["apps/admin/app/lib/operations-api.ts", "apps/admin/app/lib/ui/operations-forms.tsx"]) {
    const file = source(path);
    expect(file).not.toContain("apps/public");
    expect(file).not.toContain("apps/broker");
  }
});
