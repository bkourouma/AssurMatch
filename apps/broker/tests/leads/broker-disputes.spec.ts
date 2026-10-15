import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { disputeAvailability, disputeStatusTone, formatDeadline } from "../../app/lib/ui/broker-view-models";
import { DISPUTE_CREDIT_MODE_LABELS, disputeReasonLabel, disputeStatusLabel } from "../../app/lib/lead-vocabulary";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const OPEN_WINDOW = { deadline: "2026-11-14T22:15:00.000Z", open: true };
const CLOSED_WINDOW = { deadline: "2026-09-14T22:15:00.000Z", open: false };

test("CRM lead detail exposes the Contester action with reason, optional comment and the visible deadline (spec 063 FR-B09)", () => {
  const detail = source("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx");
  const actions = source("apps/broker/app/lib/lead-actions.ts");

  expect(detail).toContain('triggerLabel="Contester"');
  expect(detail).toContain("formAction={disputeCrmLeadAction}");
  expect(detail).toContain("disputeAvailability({ window: lead?.disputeWindow");
  expect(detail).toContain("{availability.message}");
  expect(detail).toContain("availability.canDispute ?");
  expect(detail).toContain("<DisputeStatusCard disputes={disputes} />");
  expect(detail).toContain("CRM_OUTCOME_REASONS.map");
  expect(detail).toContain('maxLength={500}');
  expect(detail).toContain("dispute_window_expired");
  expect(detail).toContain("dispute_exists");

  expect(actions).toContain("export async function disputeCrmLeadAction");
  expect(actions).toContain("/broker/crm/leads/${leadId}/disputes");
  // The reason is mandatory and allow-listed before anything reaches the API.
  expect(actions).toMatch(/isCrmOutcomeReason\(reason\)\) redirect\(`\/crm\/leads\/\$\{leadId\}\?crm=reason_required`\)/);
  expect(actions).toContain("slice(0, 500)");
});

test("Starter lead detail shows the dispute card and hides Contester outside the window or after a first dispute", () => {
  const detail = source("apps/broker/app/leads/[leadAssignmentId]/page.tsx");
  const actions = source("apps/broker/app/lib/lead-actions.ts");

  expect(detail).toContain("disputeAvailability({ window: lead?.disputeWindow, hasDispute: Boolean(lead?.dispute)");
  expect(detail).toContain("availability.canDispute ? (");
  expect(detail).toContain("formAction={disputeStarterLeadAction}");
  expect(detail).toContain("<DisputeStatusCard disputes={[lead.dispute]} />");
  expect(detail).toContain("{availability.message}");
  expect(detail).toContain("dispute_window_expired");
  expect(detail).toContain("dispute_exists");
  // 409 codes of the API are mapped for both channels by the shared outcome().
  expect(actions).toContain('result.code === "DISPUTE_WINDOW_EXPIRED"');
  expect(actions).toContain('result.code === "DISPUTE_ALREADY_EXISTS"');
  expect(source("apps/broker/app/lib/broker-write.ts")).toContain("code?: string");
});

test("the Contester action is available only inside the 30-day window, once, and to roles that may write", () => {
  const open = disputeAvailability({ window: OPEN_WINDOW, hasDispute: false, canMutate: true, tenantReadOnly: false });
  expect(open.canDispute).toBe(true);
  expect(open.message).toBe("Contestation possible jusqu'au 14 novembre 2026 à 22:15 UTC.");

  const closed = disputeAvailability({ window: CLOSED_WINDOW, hasDispute: false, canMutate: true, tenantReadOnly: false });
  expect(closed.canDispute).toBe(false);
  expect(closed.message).toContain("fenêtre de 30 jours est close");

  const existing = disputeAvailability({ window: OPEN_WINDOW, hasDispute: true, canMutate: true, tenantReadOnly: false });
  expect(existing.canDispute).toBe(false);
  expect(existing.message).toContain("déjà fait l'objet d'une contestation");

  const readOnly = disputeAvailability({ window: OPEN_WINDOW, hasDispute: false, canMutate: false, tenantReadOnly: false });
  expect(readOnly.canDispute).toBe(false);
  expect(readOnly.message).toContain("Votre rôle ne permet pas de contester ce lead");

  const suspended = disputeAvailability({ window: OPEN_WINDOW, hasDispute: false, canMutate: false, tenantReadOnly: true });
  expect(suspended.canDispute).toBe(false);
  expect(suspended.message).toContain("Compte suspendu");

  // Without window (older payload) the action stays possible and the 30-day rule is announced.
  const legacy = disputeAvailability({ window: undefined, hasDispute: false, canMutate: true, tenantReadOnly: false });
  expect(legacy.canDispute).toBe(true);
  expect(legacy.message).toContain("30 jours");
  expect(formatDeadline(undefined)).toBe("-");
});

test("the status card shows the status, the decision reason and the credit mode and amount", () => {
  const card = source("apps/broker/app/lib/ui/dispute-status-card.tsx");

  expect(disputeStatusLabel("opened")).toBe("Ouverte");
  expect(disputeStatusLabel("accepted")).toBe("Acceptée");
  expect(disputeStatusLabel("rejected")).toBe("Rejetée");
  expect(disputeStatusTone("accepted")).toBe("success");
  expect(disputeStatusTone("rejected")).toBe("danger");
  expect(disputeStatusTone("opened")).toBe("warning");
  expect(disputeReasonLabel("duplicate")).toBe("Doublon");
  expect(disputeReasonLabel("out_of_target")).toBe("Hors cible commerciale");
  expect(DISPUTE_CREDIT_MODE_LABELS.draft_invoice).toBe("Crédité sur le prochain brouillon de facture");
  expect(DISPUTE_CREDIT_MODE_LABELS.credit_note).toBe("Avoir partiel émis");

  expect(card).toContain("Motif de la décision");
  expect(card).toContain("formatXof(dispute.creditAmount)");
  expect(card).toContain("/billing/credit-notes/${dispute.creditNoteId}/pdf");
  expect(card).toContain("Contestation rejetée : le lead reste facturable.");
});

test("broker billing lists the cabinet disputes with decision and credit, and the empty state explains the window", () => {
  const page = source("apps/broker/app/billing/page.tsx");
  const api = source("apps/broker/app/lib/broker-api.ts");

  expect(api).toContain("/broker/billing/disputes");
  expect(api).toContain("export function readBrokerDisputes");
  expect(page).toContain("readBrokerDisputes()");
  expect(page).toContain('title="Contestations"');
  expect(page).toContain("Aucune contestation. Vous pouvez contester un lead dans les 30 jours suivant sa réception.");
  for (const header of ["Lead", "Statut", "Motif", "Déposée le", "Décision", "Crédit appliqué"]) expect(page).toContain(`header: "${header}"`);
  expect(page).toContain("/billing/credit-notes/${dispute.creditNoteId}/pdf");
  expect(page).toContain("dispute.decisionReason");
  // The section sits behind the same billing:read_own guard as the rest of the page.
  expect(page).toContain("canReadBrokerBilling(session.profile)");
});

test("broker dispute screens stay on the broker side and never use refund or purchase wording", () => {
  const files = [
    "apps/broker/app/lib/ui/dispute-status-card.tsx",
    "apps/broker/app/lib/ui/broker-view-models.ts",
    "apps/broker/app/billing/page.tsx",
    "apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx",
    "apps/broker/app/leads/[leadAssignmentId]/page.tsx"
  ].map((path) => ({ path, text: source(path) }));

  for (const { text } of files) {
    // Constitution III: the broker back-office never calls the admin dispute endpoints.
    expect(text).not.toContain("/admin/billing/disputes");
  }
  for (const { text } of files) {
    const lower = text.toLowerCase();
    for (const forbidden of ["rembours", "acheter", "souscrire", "payer maintenant", "payer en ligne", "carte bancaire"]) expect(lower).not.toContain(forbidden);
  }
  // Wording from the spec: contestation and avoir, never a refund of an insurance premium.
  expect(files[0]?.text).toContain("avoir");
  expect(source("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx")).toContain("dans les 30 jours suivant sa réception");
});
