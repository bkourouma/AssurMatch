import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("multi-broker transmission is an explicit, unticked visitor choice", () => {
  const form = source("apps/public/app/components/quote-form.tsx");

  expect(form).toContain('name="multiBroker"');
  expect(form).toContain("multiBrokerAccepted");
  expect(form).toContain("jusqu'a 3");
  expect(form).toContain("Sans cette case, votre demande n'est transmise qu'a un seul courtier");
  // The opt-in must never be pre-ticked: consent has to be given, not withdrawn.
  expect(form).not.toContain('name="multiBroker" type="checkbox" defaultChecked');
  expect(form).not.toContain('name="multiBroker" type="checkbox" checked');
  // It must also never be required: refusing it still submits a single-broker request.
  expect(form).not.toMatch(/name="multiBroker"[^>]*required/);
});

test("the confirmation reports what actually happened rather than a fixed sentence", () => {
  const api = source("apps/public/app/lib/public-api.ts");

  expect(api).toContain("body.message");
});

test("multi-broker copy avoids regulated or promotional wording", () => {
  const form = source("apps/public/app/components/quote-form.tsx").toLowerCase();
  for (const forbidden of ["acheter", "souscrire maintenant", "contrat valide", "garantie acceptee", "meilleure assurance", "meilleur prix"]) {
    expect(form).not.toContain(forbidden);
  }
});
