import { expect, test } from "@playwright/test";
import { messagesText, publicFile, readSources } from "./helpers/public-sources";

function source(path: string): string {
  return readSources([path]);
}

test("multi-broker transmission is an explicit, unticked visitor choice", () => {
  const form = source(publicFile("components/quote-form.tsx"));

  // Structural: the field name and the submitted flag are still in the component source.
  expect(form).toContain('name="multiBroker"');
  expect(form).toContain("multiBrokerAccepted");
  // The opt-in must never be pre-ticked: consent has to be given, not withdrawn.
  expect(form).not.toContain('name="multiBroker" type="checkbox" defaultChecked');
  expect(form).not.toContain('name="multiBroker" type="checkbox" checked');
  // It must also never be required: refusing it still submits a single-broker request.
  expect(form).not.toMatch(/name="multiBroker"[^>]*required/);

  // Copy: the explanation of what the checkbox does now lives in the French catalogue.
  const label = messagesText("fr", "QuoteForm");
  expect(label).toContain("jusqu'à 3");
  expect(label).toContain("Sans cette case, votre demande n'est transmise qu'à un seul courtier");
});

test("the confirmation reports what actually happened rather than a fixed sentence", () => {
  const api = source(publicFile("lib/public-api.ts"));

  expect(api).toContain("body.message");
});

test("multi-broker copy avoids regulated or promotional wording", () => {
  const form = source(publicFile("components/quote-form.tsx")).toLowerCase();
  const label = messagesText("fr", "QuoteForm").toLowerCase();
  for (const forbidden of ["acheter", "souscrire maintenant", "contrat valide", "garantie acceptee", "meilleure assurance", "meilleur prix"]) {
    expect(form).not.toContain(forbidden);
    expect(label).not.toContain(forbidden);
  }
});
