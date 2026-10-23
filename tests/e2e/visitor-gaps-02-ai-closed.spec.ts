import { expect, test, type Page } from "@playwright/test";
import { e2eEnv } from "./support/env";
import { loadJourneyState, requireState, requireWorld } from "./support/journey-state";
import { recordRequests } from "./support/pro-roles";
import { publicCall } from "./support/recos-062b";
import { appPage } from "./support/world";

// Lot 11a, part 2 (spec 068, lot 2 "IA visiteur"): every AI flag is closed by default (constitution:
// fail-closed, opened only by an audited compliance decision, never by an E2E journey). On the public
// site this means, for the three visitor functions of PRD 10.1 (guarantee explainer, field help,
// difference explainer) and the existing assistants:
//   - the availability endpoint says "disabled" for every visitor assistance type;
//   - a direct call is refused with `ai_disabled`, no text, no model call;
//   - no "?" button, no assistant, no AI notice on any visitor page, and no AI request leaves the browser
//     besides the availability read.
// Needs the offers published by visitor-gaps-01-quote.spec.ts.

test.describe.configure({ mode: "serial" });

const VISITOR_ASSIST_TYPES = ["visitor_form_help", "visitor_guarantee_explainer", "visitor_compare_explainer"] as const;

/** Buttons of the visitor assistants (messages/fr.json, namespace VisitorAi). */
const ASSISTANT_BUTTONS = [
  "Expliquer les garanties",
  "Expliquer les différences",
  "Demander une orientation indicative",
  "Poser ma question",
  "Résumer mon besoin",
  "Vérifier mes réponses"
];

async function expectNoVisitorAi(page: Page, label: string): Promise<void> {
  await expect(page.locator("main"), `${label}: page rendered`).toBeVisible();
  await expect(page.locator("[data-visitor-ai]"), `${label}: assistant container`).toHaveCount(0);
  await expect(page.locator("[data-visitor-ai-notice]"), `${label}: permanent AI notice`).toHaveCount(0);
  for (const name of ASSISTANT_BUTTONS) {
    await expect(page.getByRole("button", { name, exact: true }), `${label}: button "${name}"`).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: /Aide pour le champ/u }), `${label}: field help "?"`).toHaveCount(0);
  await expect(page.getByText("Réponse générée automatiquement par un outil d'IA"), `${label}: AI disclaimer`).toHaveCount(0);
  await expect(page.getByText("Contenu généré par IA, à confirmer par le courtier partenaire."), `${label}: AI content label`).toHaveCount(0);
}

test("VGA-01 la disponibilité publique des assistants IA visiteur est « désactivée » pour chacun des types", async () => {
  const result = await publicCall("GET", "/ai/visitor/availability?countryCode=CI&productKey=auto");
  expect(result.status).toBe(200);
  const entries = Array.isArray(result.body) ? (result.body as Array<{ assistType: string; enabled: boolean }>) : [];
  expect(entries.length).toBeGreaterThan(0);
  // The two spec 068 types and the field help are served (so a flag change is the only thing missing)...
  for (const assistType of VISITOR_ASSIST_TYPES) {
    expect(entries.find((entry) => entry.assistType === assistType), `${assistType} listed`).toBeDefined();
  }
  // ...and none of the visitor assistances is open.
  for (const entry of entries) expect(entry.enabled, `${entry.assistType} disabled for the public`).toBe(false);
});

test("VGA-02 un appel direct est refusé « ai_disabled », sans texte ni appel au modèle", async () => {
  const state = loadJourneyState();
  const first = requireState(state, "offerId");
  const second = requireWorld("vg-y").offerId as string;
  const probes: Array<[string, Record<string, unknown>]> = [
    ["visitor_guarantee_explainer", { countryCode: "CI", productKey: "auto", offerId: first, language: "fr" }],
    ["visitor_compare_explainer", { countryCode: "CI", productKey: "auto", offerIds: [first, second], language: "fr" }],
    ["visitor_form_help", { countryCode: "CI", productKey: "auto", fieldKey: "vehicle_use", fieldLabel: "Usage du vehicule", language: "fr" }]
  ];
  for (const [assistType, json] of probes) {
    const result = await publicCall("POST", `/ai/visitor/${assistType}`, { json });
    if (result.status >= 200 && result.status < 300) {
      const interaction = result.body as { status?: string; refusalReason?: string; outputText?: string | null };
      expect(interaction.status, `${assistType} answer`).toBe("refused");
      expect(interaction.refusalReason).toBe("ai_disabled");
      expect(interaction.outputText ?? null).toBeNull();
    } else {
      expect([400, 403, 404, 422], `${assistType} refusal status`).toContain(result.status);
    }
  }
});

test("VGA-03 aucune page visiteur n'affiche de bouton « ? », d'assistant ni de mention IA, et aucune requête IA ne part du navigateur", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const first = requireState(loadJourneyState(), "offerId");
  const second = requireWorld("vg-y").offerId as string;
  const pages: Array<[string, string]> = [
    ["fiche produit", "/pays/CI/produits/auto"],
    ["liste des offres", "/pays/CI/produits/auto/offres"],
    ["détail d'une offre", `/offres/${first}?country=CI&product=auto`],
    ["détail d'une seconde offre", `/offres/${second}?country=CI&product=auto`],
    ["comparaison de deux offres", `/comparer?ids=${first},${second}&country=CI&product=auto`],
    ["formulaire de devis", "/pays/CI/produits/auto/devis"],
    ["formulaire de devis d'une offre", `/pays/CI/produits/auto/devis?offerId=${first}`]
  ];

  const visitor = await appPage(browser, e2eEnv.publicUrl);
  const recorder = recordRequests(visitor);
  for (const [label, path] of pages) {
    await visitor.goto(path);
    await visitor.waitForLoadState("networkidle");
    await expectNoVisitorAi(visitor, label);
  }

  // The quote form: field help is looked for on every step, not only on the first one.
  await visitor.goto("/pays/CI/produits/auto/devis");
  await visitor.waitForLoadState("networkidle");
  await expect(visitor.locator("#am-answer-vehicle_use")).toBeVisible();
  await expect(visitor.getByRole("button", { name: /Aide pour le champ/u })).toHaveCount(0);
  await visitor.locator("#am-answer-vehicle_use").selectOption("prive");
  await visitor.locator("#am-answer-vehicle_brand").fill("Toyota");
  await visitor.locator("#am-answer-city").fill("Abidjan");
  await visitor.locator("#am-answer-contact_preference").selectOption("email");
  await visitor.getByRole("button", { name: "Continuer" }).click();
  await expectNoVisitorAi(visitor, "formulaire de devis, étape contact");
  recorder.stop();

  // Only the availability read may reach an AI route; never an interaction, never a POST.
  const aiRequests = recorder.all.filter((entry) => /\/ai\//u.test(entry.url));
  expect(aiRequests.filter((entry) => entry.method !== "GET"), "no AI POST from the visitor pages").toEqual([]);
  expect(aiRequests.filter((entry) => /\/ai\/visitor\/interactions/u.test(entry.url)), "no AI interaction read").toEqual([]);
  await visitor.context().close();
});
