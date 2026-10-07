import { expect, test } from "@playwright/test";
import { messagesText, publicFile, publicPage, readSources } from "./helpers/public-sources";

function source(path: string): string {
  return readSources([path]);
}

test("visitor AI assistant is flag-gated, asynchronous and labelled as indicative assistance", () => {
  const api = source(publicFile("lib/public-api.ts"));
  const component = source(publicFile("components/visitor-ai-assistant.tsx"));
  const product = source(publicPage("countries/[countryCode]/products/[productKey]/page.tsx"));
  const form = source(publicFile("components/quote-form.tsx"));

  // Structural: endpoints, the availability read and the never-required rendering gate stay in the sources.
  expect(api).toContain("/ai/visitor/availability");
  expect(api).toContain("/ai/visitor/interactions/");
  expect(component).toContain("readVisitorAiAvailability");
  expect(component).toContain("if (available !== true) return null");
  expect(product).toContain("VisitorAiAssistant");
  expect(form).toContain('mode="summary"');

  // Copy: the assistance label and the "no personal data" warning now live in the French catalogue.
  // D2 (spec 050): "IA" only names the function on its permanent transparency label
  // (`VisitorAi.disclaimer`); everywhere else in the running text it is "l'assistant de lecture" - so
  // the mode titles and the default label no longer read "Assistant IA d'aide à la compréhension".
  const visitorAi = messagesText("fr", "VisitorAi");
  expect(visitorAi).toContain("Assistant de lecture");
  expect(visitorAi).toContain("Réponse générée automatiquement par un outil d'IA. Aide à la lecture, pas un conseil.");
  expect(visitorAi).toContain("Ne saisissez pas de données personnelles");
});

test("visitor AI copy avoids regulated or advisory wording", () => {
  const component = source(publicFile("components/visitor-ai-assistant.tsx"));
  const catalogue = messagesText("fr", "VisitorAi");
  const surface = `${component}\n${catalogue}`.toLowerCase();
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "meilleure assurance", "recommandons officiellement"]) {
    expect(surface).not.toContain(forbidden.toLowerCase());
  }
});
