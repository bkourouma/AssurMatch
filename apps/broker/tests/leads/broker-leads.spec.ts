import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("broker lead pages show only assigned lead surfaces", async () => {
  const dashboard = readFileSync("apps/broker/app/page.tsx", "utf8");
  const list = readFileSync("apps/broker/app/leads/page.tsx", "utf8");
  const detail = readFileSync("apps/broker/app/leads/[leadAssignmentId]/page.tsx", "utf8");

  expect(dashboard).toContain("Portail courtier");
  expect(dashboard).toContain("Le CRM complet est disponible avec le plan Pro.");
  expect(list).toContain("uniquement les leads qui lui sont assignes");
  expect(list).toContain("Aucun Kanban");
  expect(list).toContain("Export controle par permission et audit");
  expect(detail).toContain("Detail du lead assigne");
  expect(detail).toContain("Accepter");
  expect(detail).toContain("Rejeter avec motif");
  expect(detail).toContain("Contester avec motif");
  expect(detail).toContain("Toute consultation detail est auditee");
  expect(detail).toContain("ne presente pas Kanban");
});

test("starter lead list links each row to the real lead assignment id", async () => {
  const list = readFileSync("apps/broker/app/leads/page.tsx", "utf8");

  expect(list).toContain("listStarterLeads");
  expect(list).toContain("/leads/${lead.id}");

  const viewModels = readFileSync("apps/broker/app/lib/ui/broker-view-models.ts", "utf8");
  expect(viewModels).toContain("lead.id ?? lead.leadAssignmentId");
});

test("starter lead detail reads the real API instead of a hardcoded mock", async () => {
  const detail = readFileSync("apps/broker/app/leads/[leadAssignmentId]/page.tsx", "utf8");
  const api = readFileSync("apps/broker/app/lib/broker-api.ts", "utf8");

  // The page is driven by the route param and the Starter detail + history endpoints.
  expect(detail).toContain("params: Promise<{ leadAssignmentId: string }>");
  expect(detail).toContain("readStarterLeadDetail(leadAssignmentId)");
  expect(detail).toContain("readStarterLeadHistory(leadAssignmentId)");
  expect(api).toContain("/broker/starter/leads/${encodeURIComponent(leadAssignmentId)}");
  expect(api).toContain("/broker/starter/leads/${encodeURIComponent(leadAssignmentId)}/history");

  // No trace of the previous hardcoded mock values.
  expect(detail).not.toContain("<dd>CI</dd>");
  expect(detail).not.toContain("<dd>auto</dd>");

  // Consented information, dates and the minimal history are rendered from the payload.
  expect(detail).toContain("lead.countryCode");
  expect(detail).toContain("lead.productKey");
  expect(detail).toContain("lead.assignedAt");
  expect(detail).toContain("Contact consenti");
  expect(detail).toContain("Reponses consenties");
  expect(detail).toContain("Historique minimal");

  // The back link stays available.
  expect(detail).toContain('href="/leads"');
  expect(detail).toContain("Retour aux leads");
});

test("starter lead detail exposes accept, reject and dispute forms with allow-listed reasons", async () => {
  const detail = readFileSync("apps/broker/app/leads/[leadAssignmentId]/page.tsx", "utf8");
  const actions = readFileSync("apps/broker/app/lib/lead-actions.ts", "utf8");
  const vocabulary = readFileSync("apps/broker/app/lib/lead-vocabulary.ts", "utf8");

  expect(detail).toContain("action={acceptStarterLeadAction}");
  expect(detail).toContain("action={rejectStarterLeadAction}");
  expect(detail).toContain("action={disputeStarterLeadAction}");
  expect(detail).toContain("STARTER_ACTION_REASONS.map");
  expect(detail).toContain('name="reason" required');

  expect(actions).toContain("/broker/starter/leads/${leadId}/accept");
  expect(actions).toContain("/broker/starter/leads/${leadId}/reject");
  expect(actions).toContain("/broker/starter/leads/${leadId}/dispute");
  // Reject and dispute never reach the API without an allow-listed reason.
  expect(actions).toContain("if (!isStarterActionReason(reason)) redirect(`/leads/${leadId}?lead=reason_required`);");

  // The allow-list mirrors brokerStarterReasonSchema exactly.
  for (const reason of ["lead_quality", "wrong_scope", "unreachable_prospect", "duplicate", "compliance_concern"]) {
    expect(vocabulary).toContain(`"${reason}"`);
  }
});

test("starter lead detail degrades safely on forbidden, not found and API errors", async () => {
  const detail = readFileSync("apps/broker/app/leads/[leadAssignmentId]/page.tsx", "utf8");

  expect(detail).toContain('detail.status === "forbidden"');
  expect(detail).toContain("isNotFoundState(detail)");
  expect(detail).toContain("Lead introuvable");
  expect(detail).toContain("Lead indisponible");
  expect(detail).toContain("StateMessage");
  expect(detail).toContain("Aucune donnee protegee n'est affichee");
  expect(detail).toContain("loginRedirect");
});

test("starter lead actions stay hidden for a broker role without the update permission", async () => {
  const detail = readFileSync("apps/broker/app/leads/[leadAssignmentId]/page.tsx", "utf8");
  const permissions = readFileSync("apps/broker/app/lib/broker-permissions.ts", "utf8");

  expect(detail).toContain("canMutateStarterLead(session.profile)");
  expect(detail).toContain("Lecture seule");
  expect(permissions).toContain('roles.includes("broker_read_only")');
  expect(permissions).toContain('hasPermission(profile, "broker_leads:update")');
});
