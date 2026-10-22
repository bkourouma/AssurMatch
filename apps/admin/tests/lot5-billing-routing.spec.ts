import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADD_ON_KIND_LABELS, PLAN_CHANGE_EFFECT_NOTICE, SUBSCRIPTION_ROUTING_NOTICE, billingLineKindLabel, lot5ErrorMessage } from "../app/billing/lot5-labels";
import { AI_ASSISTED_MODE_LABEL, AI_ASSISTED_MODE_NOTE, candidateReasonLabel, parkedReasonLabel } from "../app/routing/routing-labels";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("billing line kinds introduced by lot 5 are worded for finance", () => {
  expect(billingLineKindLabel("setup_fee")).toBe("Frais d'installation (une seule fois)");
  expect(billingLineKindLabel("add_on")).toBe("Module complémentaire");
  expect(billingLineKindLabel("subscription")).toBe("Abonnement mensuel");
  expect(billingLineKindLabel("unknown_kind")).toBe("unknown_kind");
  expect(ADD_ON_KIND_LABELS).toEqual({ api: "Accès API", white_label: "Marque blanche", ai: "Module IA" });
});

test("admin billing exposes add-on prices, assignments, subscription state and the plan-change inbox", () => {
  const api = source("apps/admin/app/billing/lot5-api.ts");
  const actions = source("apps/admin/app/billing/lot5-actions.ts");
  const panels = source("apps/admin/app/billing/lot5-panels.tsx");
  const forms = source("apps/admin/app/billing/lot5-forms.tsx");
  const page = source("apps/admin/app/billing/page.tsx");

  for (const route of ["/admin/billing/add-on-prices", "/admin/billing/add-ons", "/admin/billing/subscriptions/", "/admin/billing/plan-change-requests"]) {
    expect(api).toContain(route);
  }
  expect(actions).toContain('"use server"');
  expect(actions).toContain("/decision");
  expect(actions).toContain("/end");
  expect(panels).toContain("Prix des modules complémentaires");
  expect(panels).toContain("Demandes de changement de plan");
  expect(panels).toContain("État d'abonnement d'un courtier");
  expect(panels).toContain("DraftLinesPanel");
  expect(forms).toContain("Accepter");
  expect(forms).toContain("Refuser");
  expect(forms).toContain("Motif de la décision (obligatoire)");
  // Add-ons stay disabled unless explicitly opened: the checkbox is not checked by default.
  expect(forms).toContain('name="enabled"');
  expect(forms).not.toContain("defaultChecked");
  // The tab is reserved to the roles holding billing:plan_manage and plugged in with minimal edits.
  expect(page).toContain('new Set(["finance_admin", "super_admin"])');
  expect(page).toContain("Lot5BillingPanels");
  expect(page).toContain("DraftLinesPanel");
  expect(PLAN_CHANGE_EFFECT_NOTICE).toContain("prochain cycle");
  expect(SUBSCRIPTION_ROUTING_NOTICE).toContain("contrôle 11");
  expect(SUBSCRIPTION_ROUTING_NOTICE).toContain("contrôle 9");
});

test("lot 5 admin billing never offers online payment and maps API failures to French messages", () => {
  const text = ["lot5-panels.tsx", "lot5-forms.tsx", "lot5-labels.ts"].map((file) => source(`apps/admin/app/billing/${file}`).toLowerCase()).join("\n");
  for (const forbidden of ["payer maintenant", "payer en ligne", "carte bancaire", "acheter", "souscrire maintenant"]) {
    expect(text).not.toContain(forbidden);
  }
  expect(lot5ErrorMessage(403)).toContain("Finance Admin");
  expect(lot5ErrorMessage(409)).toContain("Action impossible");
  expect(lot5ErrorMessage(0)).toContain("API indisponible");
});

test("routing: ai_assisted is selectable, labelled and explained as a suggestion only", () => {
  const forms = source("apps/admin/app/routing/routing-forms.tsx");
  const actions = source("apps/admin/app/routing/actions.ts");
  const page = source("apps/admin/app/routing/page.tsx");

  expect(AI_ASSISTED_MODE_LABEL).toBe("IA assistée (suggestion à valider)");
  expect(AI_ASSISTED_MODE_NOTE).toBe(
    "L'IA ne fait que suggérer un courtier parmi les courtiers éligibles; l'affectation reste une décision humaine. Désactivé par défaut (drapeau ai_assisted_routing_enabled)."
  );
  expect(forms).toContain('value: "ai_assisted"');
  expect(actions).toContain('"ai_assisted"');
  expect(page).toContain("ai_assisted");
  expect(page).toContain("AI_ASSISTED_MODE_NOTE");
});

test("routing queue shows parked reasons, quality score and an AI suggestion that only pre-selects", () => {
  const forms = source("apps/admin/app/routing/routing-forms.tsx");
  const page = source("apps/admin/app/routing/page.tsx");

  expect(parkedReasonLabel("manual_rule")).toBe("Règle manuelle");
  expect(parkedReasonLabel("lead_quality_below_threshold")).toBe("Qualité du lead sous le seuil (revue manuelle)");
  expect(parkedReasonLabel("ai_suggestion_pending")).toBe("Suggestion IA à valider");
  expect(parkedReasonLabel("ai_assisted_routing_disabled")).toBe("IA assistée désactivée: affectation manuelle");
  expect(parkedReasonLabel("other")).toBe("other");
  expect(page).toContain("parkedReasonLabel");
  expect(page).toContain("qualityScoreLabel");
  expect(forms).toContain("Suggestion IA (indicative) :");
  // The suggestion button only moves the select; it is a plain button, never a submit.
  expect(forms).toContain('type="button"');
  expect(forms).toContain("setSelectedPartner(suggestedCandidate.partnerTenantId)");
});

test("new candidate exclusion reasons are translated on the queue and on the routing history", () => {
  expect(candidateReasonLabel("subscription_inactive")).toBe("Abonnement suspendu ou résilié");
  expect(candidateReasonLabel("contract_missing")).toBe("Aucun contrat enregistré");
  expect(candidateReasonLabel("contract_expired")).toBe("Contrat expiré");
  expect(candidateReasonLabel("sla_overrun")).toBe("Délai de réponse dépassé (classement dégradé)");
  expect(candidateReasonLabel("license_expired")).toBe("license_expired");
  expect(source("apps/admin/app/routing/page.tsx")).toContain("candidateReasonLabel");
  expect(source("apps/admin/app/routing/history/page.tsx")).toContain("candidateReasonLabel");
});
