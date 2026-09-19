import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("visitor AI assistant is flag-gated, asynchronous and labelled as indicative assistance", () => {
  const api = source("apps/public/app/lib/public-api.ts");
  const component = source("apps/public/app/components/visitor-ai-assistant.tsx");
  const product = source("apps/public/app/countries/[countryCode]/products/[productKey]/page.tsx");
  const form = source("apps/public/app/components/quote-form.tsx");

  expect(api).toContain("/ai/visitor/availability");
  expect(api).toContain("/ai/visitor/interactions/");
  expect(component).toContain("readVisitorAiAvailability");
  expect(component).toContain("if (available !== true) return null");
  expect(component).toContain("Assistance IA d'aide a la comprehension");
  expect(component).toContain("Ne saisissez pas de donnees personnelles");
  expect(product).toContain("VisitorAiAssistant");
  expect(form).toContain("mode=\"summary\"");
});

test("visitor AI copy avoids regulated or advisory wording", () => {
  const component = source("apps/public/app/components/visitor-ai-assistant.tsx");
  for (const forbidden of ["Acheter", "Souscrire maintenant", "Contrat valide", "Garantie acceptee", "meilleure assurance", "recommandons officiellement"]) {
    expect(component.toLowerCase()).not.toContain(forbidden.toLowerCase());
  }
});
