import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("broker CRM pages stay in back-office surface", async () => {
  const dashboard = readFileSync("apps/broker/app/crm/page.tsx", "utf8");
  const list = readFileSync("apps/broker/app/crm/leads/page.tsx", "utf8");
  const detail = readFileSync("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx", "utf8");

  expect(dashboard).toContain("CRM Pro/Enterprise");
  expect(dashboard).toContain("Aucune action CRM ne change les regles");
  expect(list).toContain("Vue tableau des leads autorises");
  expect(list).toContain("Export controle par permission et audit");
  expect(detail).toContain("Notes, documents internes et taches ne sont jamais visibles cote Web Publique Client");
  expect(detail).toContain("Reference devis");
  expect(detail).toContain("CRM autorise");
});

test("CRM list keeps linking each row to the lead detail route", async () => {
  const list = readFileSync("apps/broker/app/crm/leads/page.tsx", "utf8");

  expect(list).toContain("listCrmLeads");
  expect(list).toContain("/crm/leads/${lead.id}");
});

test("CRM lead detail exposes a status form over the pipeline statuses of the contract", async () => {
  const detail = readFileSync("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx", "utf8");
  const actions = readFileSync("apps/broker/app/lib/lead-actions.ts", "utf8");
  const vocabulary = readFileSync("apps/broker/app/lib/lead-vocabulary.ts", "utf8");

  expect(detail).toContain("action={changeCrmLeadStatusAction}");
  expect(detail).toContain("CRM_PIPELINE_STATUSES.map");
  expect(detail).toContain('name="status" required');
  expect(actions).toContain("/broker/crm/leads/${leadId}/status");

  // The 15 pipeline statuses of CRM_STATUSES / brokerCrmPipelineStatusSchema are all offered.
  const statuses = [
    "nouveau",
    "accepte",
    "contact_tente",
    "contacte",
    "qualifie",
    "documents_demandes",
    "devis_en_preparation",
    "devis_envoye",
    "negociation",
    "gagne",
    "perdu",
    "doublon",
    "injoignable",
    "hors_cible",
    "rejete_conteste"
  ];
  for (const status of statuses) {
    expect(vocabulary).toContain(`"${status}"`);
  }
});

test("CRM status change requires an allow-listed reason for loss-like statuses", async () => {
  const detail = readFileSync("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx", "utf8");
  const actions = readFileSync("apps/broker/app/lib/lead-actions.ts", "utf8");
  const vocabulary = readFileSync("apps/broker/app/lib/lead-vocabulary.ts", "utf8");

  expect(vocabulary).toContain('export const CRM_REASON_REQUIRED_STATUSES = ["perdu", "doublon", "injoignable", "hors_cible", "rejete_conteste"]');
  expect(actions).toContain("if (crmStatusRequiresReason(status) && !reason) redirect(`/crm/leads/${leadId}?crm=reason_required`);");
  expect(actions).toContain("isCrmOutcomeReason(rawReason)");
  expect(detail).toContain("CRM_OUTCOME_REASONS.map");
  expect(detail).toContain("Un motif allowliste est obligatoire pour les statuts suivants");
});

test("CRM lead detail offers note, task and reminder forms on the real detail payload", async () => {
  const detail = readFileSync("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx", "utf8");
  const actions = readFileSync("apps/broker/app/lib/lead-actions.ts", "utf8");

  expect(detail).toContain("readCrmLeadDetail(leadAssignmentId)");
  expect(detail).toContain("action={addCrmLeadNoteAction}");
  expect(detail).toContain("action={addCrmLeadTaskAction}");
  expect(detail).toContain("action={addCrmLeadReminderAction}");
  expect(detail).toContain("Ajouter une note");
  expect(detail).toContain("Ajouter une tache");
  expect(detail).toContain("Ajouter un rappel");
  expect(detail).toContain('type="datetime-local" name="dueAt"');

  expect(actions).toContain("/broker/crm/leads/${leadId}/notes");
  expect(actions).toContain("/broker/crm/leads/${leadId}/tasks");
  expect(actions).toContain("/broker/crm/leads/${leadId}/reminders");

  // Existing internal activity coming back from the detail endpoint is rendered.
  expect(detail).toContain("Notes internes");
  expect(detail).toContain("Taches commerciales");
  expect(detail).toContain("Historique CRM");
});

test("CRM forms are hidden for read-only broker roles and the AI panel is untouched", async () => {
  const detail = readFileSync("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx", "utf8");
  const permissions = readFileSync("apps/broker/app/lib/broker-permissions.ts", "utf8");

  expect(detail).toContain("canMutateCrmLead(session.profile)");
  expect(detail).toContain("const showForms = Boolean(lead) && canMutate;");
  expect(detail).toContain("Lecture seule");
  expect(permissions).toContain('hasPermission(profile, "broker_crm:update")');
  expect(permissions).toContain('hasPermission(profile, "broker_crm:update_assigned")');

  // The existing AI panel keeps being rendered with its own props.
  expect(detail).toContain("<LeadAiPanel");
  expect(detail).toContain("availableAssistTypes={assistance.data.availableAssistTypes}");
});
