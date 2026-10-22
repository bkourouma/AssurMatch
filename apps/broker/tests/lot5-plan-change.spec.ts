import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PLAN_CHANGE_NO_PAYMENT_NOTICE, billingLineKindLabel, planChangeErrorMessage } from "../app/billing/lot5-labels";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("broker invoice lines word the one-time setup fee and the add-on", () => {
  expect(billingLineKindLabel("setup_fee")).toBe("Frais d'installation (une seule fois)");
  expect(billingLineKindLabel("add_on")).toBe("Module complémentaire");
  expect(billingLineKindLabel("subscription")).toBe("Abonnement mensuel");
});

test("broker billing page offers a plan-change request to the owner, through /broker routes only", () => {
  const page = source("apps/broker/app/billing/page.tsx");
  const panels = source("apps/broker/app/billing/lot5-panels.tsx");
  const forms = source("apps/broker/app/billing/lot5-forms.tsx");
  const api = source("apps/broker/app/billing/lot5-api.ts");
  const actions = source("apps/broker/app/billing/lot5-actions.ts");

  expect(page).toContain("isBrokerOwner(session.profile)");
  expect(page).toContain("PlanChangeSection");
  expect(panels).toContain("Changer de plan");
  expect(panels).toContain("Historique des demandes de changement de plan");
  expect(panels).toContain("à partir du");
  expect(panels).toContain("Motif de la décision");
  expect(forms).toContain("Annuler la demande");
  expect(forms).toContain("Plan souhaité");
  expect(api).toContain("/broker/billing/plan-change-requests");
  expect(actions).toContain("/broker/billing/plan-change-requests");
  expect(actions).toContain("/cancel");
  // Isolation: the broker app never reaches an admin route.
  for (const file of [api, actions, panels, forms]) expect(file).not.toContain("/admin/");
  expect(PLAN_CHANGE_NO_PAYMENT_NOTICE).toBe("Aucun paiement en ligne: votre demande est traitée par l'équipe AssurMatch.");
  expect(panels).toContain("PLAN_CHANGE_NO_PAYMENT_NOTICE");
});

test("plan-change status wording and refusal messages are in French", () => {
  const labels = source("apps/broker/app/billing/lot5-labels.ts");
  for (const label of ["En attente", "Acceptée", "Refusée", "Annulée"]) expect(labels).toContain(label);
  expect(planChangeErrorMessage({ status: 400 })).toContain("10 caractères");
  expect(planChangeErrorMessage({ status: 409 })).toContain("Action impossible");
  expect(planChangeErrorMessage({ status: 403, suspended: true })).toContain("Compte suspendu");
  expect(planChangeErrorMessage({ status: 0 })).toContain("API indisponible");
});

test("broker plan-change wording stays manual: no online payment", () => {
  const text = ["lot5-panels.tsx", "lot5-forms.tsx", "lot5-labels.ts"].map((file) => source(`apps/broker/app/billing/${file}`).toLowerCase()).join("\n");
  for (const forbidden of ["payer maintenant", "payer en ligne", "carte bancaire", "lien de paiement", "souscrire", "acheter"]) {
    expect(text).not.toContain(forbidden);
  }
});
