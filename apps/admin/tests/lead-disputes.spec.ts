import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  DISPUTE_CREDIT_MODE_LABELS,
  DISPUTE_DECIDER_ROLES,
  DISPUTE_DECISION_OPTIONS,
  DISPUTE_REJECTION_FINAL_NOTICE,
  DISPUTE_REASON_MAX_LENGTH,
  DISPUTE_REASON_MIN_LENGTH,
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_TONES,
  disputeReasonLabel
} from "../app/lib/dispute-vocabulary";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("admin billing page has a Contestations tab backed by the dispute endpoints (spec 063 FR-B10)", () => {
  const page = source("apps/admin/app/billing/page.tsx");
  const api = source("apps/admin/app/lib/admin-api.ts");
  const panel = source("apps/admin/app/billing/disputes-panel.tsx");

  expect(page).toContain('{ key: "contestations", label: "Contestations" }');
  expect(page).toContain("readLeadDisputes(");
  expect(page).toContain("readLeadDispute(disputeId)");
  expect(page).toContain("<DisputesPanel");
  expect(api).toContain("/admin/billing/disputes");
  expect(api).toContain("/admin/billing/disputes/${encodeURIComponent(disputeId)}");
  // Filters: statut, cabinet, pays, période du/au; server-side pagination.
  for (const name of ['name="status"', 'name="partnerId"', 'name="countryCode"', 'name="from"', 'name="to"']) expect(panel).toContain(name);
  expect(panel).toContain("pagination={{");
  // Columns of the table.
  for (const header of ["Référence du lead", "Cabinet", "Pays", "Motif", "Statut", "Déposée le", "Décision", "Crédit"]) {
    expect(panel).toContain(`header: "${header}"`);
  }
});

test("the decision form requires a decision and a reason of 10 to 1000 characters, checked client and server side", () => {
  const panel = source("apps/admin/app/billing/disputes-panel.tsx");
  const actions = source("apps/admin/app/lib/billing-actions.ts");

  expect(DISPUTE_REASON_MIN_LENGTH).toBe(10);
  expect(DISPUTE_REASON_MAX_LENGTH).toBe(1000);
  expect(panel).toContain("Motif de la décision");
  expect(panel).toContain("minLength={DISPUTE_REASON_MIN_LENGTH}");
  expect(panel).toContain("maxLength={DISPUTE_REASON_MAX_LENGTH}");
  expect(panel).toContain('name="reason"');
  expect(panel).toContain("required");
  expect(panel).toContain('name="decision"');
  expect(panel).toContain("<ConfirmDialog");
  expect(panel).toContain("formAction={decideLeadDisputeAction}");

  expect(actions).toContain("export async function decideLeadDisputeAction");
  expect(actions).toContain("reason.length < 10 || reason.length > 1000");
  expect(actions).toContain("/admin/billing/disputes/${encodeURIComponent(disputeId)}/decision");
  expect(actions).toContain('new Set(["accept", "reject"])');
  // A 409 (already decided) and a 422 (billing disabled) have their own wording.
  expect(actions).toContain("dispute_already_decided");
  expect(actions).toContain("dispute_billing_disabled");
});

test("the decision is offered to finance_admin and super_admin only, and only on an opened dispute", () => {
  const page = source("apps/admin/app/billing/page.tsx");
  const panel = source("apps/admin/app/billing/disputes-panel.tsx");

  expect([...DISPUTE_DECIDER_ROLES].sort()).toEqual(["finance_admin", "super_admin"]);
  for (const role of ["support_admin", "admin_pays", "compliance_admin", "content_admin", "ai_admin"]) expect(DISPUTE_DECIDER_ROLES.has(role)).toBe(false);
  expect(page).toContain("DISPUTE_DECIDER_ROLES.has(role)");
  expect(page).toContain("canDecide={canDecideDispute === true}");
  expect(panel).toContain("!decided && canDecide");
  expect(panel).toContain("La décision est réservée au Finance Admin et au Super Admin.");
});

test("the dispute views never render the contact or the answers of the lead", () => {
  const panel = source("apps/admin/app/billing/disputes-panel.tsx");
  const vocabulary = source("apps/admin/app/lib/dispute-vocabulary.ts");
  const api = source("apps/admin/app/lib/admin-api.ts");
  const contract = source("packages/shared/contracts/lead-disputes.contracts.ts");

  for (const file of [panel, vocabulary]) {
    expect(file).not.toMatch(/\.(contact|answers)\b/);
    expect(file).not.toMatch(/emailMasked|phoneMasked|prospectName|\bphone\b/);
  }
  expect(panel).toContain("les coordonnées et les réponses du visiteur ne sont jamais affichées ici");
  // The admin payload type is the contract one: no contact/answers field exists on it.
  expect(api).toContain("AdminLeadDisputeList");
  expect(contract).not.toMatch(/contact:|answers:/);
});

test("an accepted dispute shows its credit outcome in French, with the credit note PDF when issued", () => {
  const panel = source("apps/admin/app/billing/disputes-panel.tsx");

  expect(DISPUTE_CREDIT_MODE_LABELS.draft_invoice).toBe("Crédité sur le prochain brouillon");
  expect(DISPUTE_CREDIT_MODE_LABELS.credit_note).toBe("Avoir partiel émis");
  expect(DISPUTE_CREDIT_MODE_LABELS.none).toBe("Aucun crédit automatique : traitement manuel par la finance");
  // Accepted dispute on a lead covered by a prepaid pack: 1 lead is given back to the pack.
  expect(DISPUTE_CREDIT_MODE_LABELS.pack_credit).toBe("1 lead restitué au pack de leads du cabinet");
  expect(panel).toContain('mode === "pack_credit"');
  expect(panel).toContain("DISPUTE_CREDIT_MODE_LABELS.pack_credit");
  expect(panel).toContain("Avoir partiel {dispute.creditNoteNumber");
  expect(panel).toContain("/billing/credit-notes/${dispute.creditNoteId}/pdf");
  expect(panel).toContain("Contestation rejetée : le lead reste facturable, aucun crédit.");
  expect(source("apps/admin/app/billing/credit-notes/[id]/pdf/route.ts")).toContain('proxyBillingPdf("credit-notes", id)');
});

test("dispute statuses are worded and toned for finance", () => {
  expect(DISPUTE_STATUS_LABELS).toMatchObject({ opened: "Ouverte", accepted: "Acceptée", rejected: "Rejetée" });
  expect(DISPUTE_STATUS_TONES).toMatchObject({ opened: "warning", accepted: "success", rejected: "danger" });
  expect(disputeReasonLabel("lead_quality")).toBe("Qualité du lead insuffisante");
  expect(disputeReasonLabel("client_abandoned")).toBe("Abandon du prospect");
  expect(disputeReasonLabel("custom_reason")).toBe("custom_reason");
});

test("API refusals map to the existing notice patterns (409 already decided, 422 billing disabled)", () => {
  const page = source("apps/admin/app/billing/page.tsx");

  expect(page).toContain("dispute_already_decided:");
  expect(page).toContain("La facturation n'est pas activée");
  expect(page).toContain("dispute_invalid:");
  expect(page).toContain('"dispute_accepted", "dispute_rejected"');
});

test("dispute wording never suggests a premium refund, an online payment or a purchase", () => {
  const files = [
    source("apps/admin/app/billing/disputes-panel.tsx"),
    source("apps/admin/app/lib/dispute-vocabulary.ts")
  ].map((file) => file.toLowerCase());
  for (const file of files) {
    for (const forbidden of ["rembours", "payer maintenant", "payer en ligne", "carte bancaire", "lien de paiement", "souscrire", "acheter"]) {
      expect(file).not.toContain(forbidden);
    }
  }
  expect(files[0]).toContain("aucune prime d'assurance n'est concernée");
});

test("the rejection is announced as final on the decision form and on a rejected dispute", () => {
  const panel = source("apps/admin/app/billing/disputes-panel.tsx");
  const rejectOption = DISPUTE_DECISION_OPTIONS.find((option) => option.value === "reject");

  expect(DISPUTE_REJECTION_FINAL_NOTICE).toBe("Le rejet est définitif : le courtier ne pourra pas contester à nouveau ce lead.");
  expect(rejectOption?.hint).toContain(DISPUTE_REJECTION_FINAL_NOTICE);
  expect(panel).toContain("{DISPUTE_REJECTION_FINAL_NOTICE}");
});
